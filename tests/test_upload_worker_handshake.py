"""Upload→worker file-handoff handshake test.

Closes a coverage gap that other tests miss:
  - test_e2e_smoke.py uses fakeredis and never spawns the worker code path.
  - test_api_endpoints.py only string-checks the recording_uri shape.

Neither test would catch a regression where the API persists the upload to
one location while the worker tries to read from another (or where the
upload bytes get truncated/corrupted on the way to disk). This test:

  1. POSTs a real, valid mp4 to /synthesize via TestClient.
  2. Asserts 202 + a synthesis_run_id.
  3. XREADs jobs:synthesis to fetch the just-enqueued job.
  4. Parses recording_uri, asserts the file exists on disk and bytes
     round-trip equal what was POSTed.
  5. Imports the worker's _load_recording and calls it on the same URI;
     asserts it returns those same bytes without raising.

Uses real Redis at REDIS_URL (default: redis://localhost:6379/15) so the
XADD→XREAD pair hits the actual stream the worker would consume from. Redis
db 15 is reserved for tests by convention (see Makefile / make test).
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path
from urllib.parse import urlparse
from uuid import UUID

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("redis")

REPO_ROOT = Path(__file__).resolve().parent.parent
WORKER_DIR = REPO_ROOT / "apps" / "synthesis-worker"
for p in (str(REPO_ROOT), str(WORKER_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)


DEMO_MP4 = REPO_ROOT / "fixtures" / "mp4" / "demo.mp4"


def _redis_available(url: str) -> bool:
    try:
        import redis as redis_sync

        client = redis_sync.from_url(url)
        client.ping()
        client.close()
        return True
    except Exception:
        return False


@pytest.fixture
def real_redis_url() -> str:
    url = os.environ.get("REDIS_URL", "redis://localhost:6379/15")
    if not _redis_available(url):
        pytest.skip(f"real Redis not reachable at {url} — required for handshake test")
    return url


@pytest.fixture
def upload_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Isolate uploads to a per-test tmp dir so we don't pollute /tmp/understudy-recordings."""
    target = tmp_path / "understudy-recordings"
    monkeypatch.setenv("UPLOAD_DIR", str(target))
    return target


@pytest.fixture
def api_app(real_redis_url: str, upload_dir: Path, monkeypatch: pytest.MonkeyPatch):
    """Reload apps.api.main + redis_client so they pick up the test REDIS_URL/UPLOAD_DIR."""
    monkeypatch.setenv("REDIS_URL", real_redis_url)
    monkeypatch.setenv("DEMO_MODE", os.environ.get("DEMO_MODE", "replay"))
    # Force in-memory Store so we don't try to write to InsForge during the test.
    monkeypatch.setenv("STORE_BACKEND", "memory")
    monkeypatch.delenv("INSFORGE_URL", raising=False)
    monkeypatch.delenv("INSFORGE_API_KEY", raising=False)

    # Drop cached module-level singletons so the new env vars take effect.
    for mod_name in list(sys.modules):
        if mod_name.startswith("apps.api"):
            sys.modules.pop(mod_name, None)

    from apps.api import main as api_main  # noqa: WPS433 — import after env setup
    from apps.api import redis_client as redis_client_module
    from apps.api import store as store_module

    redis_client_module._client = None
    store_module._store = None

    yield api_main.app

    # Clean up the singleton connection so other tests don't reuse it.
    try:
        client = redis_client_module._client
        if client is not None and client._conn is not None:
            asyncio.get_event_loop().run_until_complete(client._conn.close())
    except Exception:
        pass
    redis_client_module._client = None
    store_module._store = None


def _flush_test_streams(url: str) -> None:
    """Wipe `jobs:synthesis` so XREAD picks up only this test's enqueued job."""
    import redis as redis_sync

    client = redis_sync.from_url(url)
    try:
        client.delete("jobs:synthesis")
    finally:
        client.close()


def test_upload_persists_to_disk_and_worker_can_read_it(
    api_app, real_redis_url: str, upload_dir: Path
) -> None:
    """Round-trip: POST mp4 → file lands on disk → worker._load_recording reads it back."""
    from fastapi.testclient import TestClient

    assert DEMO_MP4.exists(), f"fixtures/mp4/demo.mp4 missing — {DEMO_MP4}"
    posted_bytes = DEMO_MP4.read_bytes()
    assert len(posted_bytes) >= 1024, "fixture mp4 must be >= 1 KB to exercise the chunked write"

    _flush_test_streams(real_redis_url)

    with TestClient(api_app) as client:
        r = client.post(
            "/synthesize",
            files={"recording": ("demo.mp4", posted_bytes, "video/mp4")},
        )
    assert r.status_code == 202, r.text
    body = r.json()
    run_id = UUID(body["synthesis_run_id"])  # raises if not a valid UUID

    # 3. XREAD the enqueued job and parse recording_uri.
    import redis as redis_sync

    rconn = redis_sync.from_url(real_redis_url, decode_responses=True)
    try:
        entries = rconn.xrange("jobs:synthesis")
        assert entries, "no job was enqueued on jobs:synthesis"
        # Find the entry matching this run_id (should be the only one after the flush).
        matching = [(mid, fields) for mid, fields in entries if fields.get("run_id") == str(run_id)]
        assert matching, f"no jobs:synthesis entry for run_id={run_id}; entries={entries}"
        _msg_id, fields = matching[-1]
        recording_uri = fields["recording_uri"]
    finally:
        rconn.close()

    # 4. File at urlparse(uri).path EXISTS on disk and bytes round-trip equal what was POSTed.
    assert recording_uri.startswith("file://"), f"expected file:// URI, got {recording_uri!r}"
    on_disk = Path(urlparse(recording_uri).path)
    assert on_disk.exists(), f"worker would 404: {on_disk} not on disk"
    # Sanity: the file is inside the UPLOAD_DIR we set via env.
    assert upload_dir in on_disk.parents, (
        f"upload landed outside UPLOAD_DIR: {on_disk} not under {upload_dir}"
    )
    on_disk_bytes = on_disk.read_bytes()
    assert on_disk_bytes == posted_bytes, (
        f"on-disk bytes diverged from POSTed bytes "
        f"(posted={len(posted_bytes)}, on_disk={len(on_disk_bytes)})"
    )

    # 5. Import the worker's _load_recording and call it directly.
    # Load by absolute file path to avoid clashing with apps/cosmo-mcp-driver/main.py,
    # which also imports as the bare name "main" when its tests run earlier in the suite.
    import importlib.util

    worker_main_path = WORKER_DIR / "main.py"
    spec = importlib.util.spec_from_file_location("synthesis_worker_main", worker_main_path)
    assert spec is not None and spec.loader is not None, f"could not spec {worker_main_path}"
    worker_main = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(worker_main)
    assert hasattr(worker_main, "_load_recording"), "worker.main has no _load_recording"
    loaded = asyncio.run(worker_main._load_recording(recording_uri))
    assert loaded == posted_bytes, (
        "worker._load_recording returned bytes != posted bytes — "
        "API/worker file-handoff is broken"
    )
