"""Shared test fixtures.

Uses fakeredis so tests are hermetic. fakeredis does NOT implement the VADD/VSIM
Vector Set verbs — tests that rely on them either use a monkeypatched VectorSets or
assert on the int8 math directly, not on the Redis round-trip.

Also exposes an `api_client` httpx.AsyncClient bound to apps.api.main, and an
`mp4_bytes` fixture that materializes a tiny valid mp4 via ffmpeg.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


@pytest.fixture
def fake_redis():
    fakeredis = pytest.importorskip("fakeredis")
    return fakeredis.FakeRedis()


@pytest.fixture
def fake_async_redis():
    fakeredis = pytest.importorskip("fakeredis")
    return fakeredis.aioredis.FakeRedis(decode_responses=True)


@pytest.fixture(scope="session")
def ffmpeg_available() -> bool:
    try:
        subprocess.run(["ffmpeg", "-version"], check=True, capture_output=True)
        return True
    except (FileNotFoundError, subprocess.CalledProcessError):
        return False


@pytest.fixture(scope="session")
def tiny_mp4(tmp_path_factory, ffmpeg_available) -> Path:
    """Generate a 2-second 64x64 test-pattern mp4 once per session."""
    if not ffmpeg_available:
        pytest.skip("ffmpeg not on PATH — cannot synthesize test mp4")
    out = tmp_path_factory.mktemp("fixtures") / "tiny.mp4"
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", "testsrc=size=64x64:rate=5:duration=2",
            "-c:v", "libx264", "-pix_fmt", "yuv420p",
            "-hide_banner", "-loglevel", "error",
            str(out),
        ],
        check=True,
    )
    assert out.exists() and out.stat().st_size > 0
    return out


@pytest.fixture
async def api_client(fake_async_redis, monkeypatch):
    """httpx AsyncClient bound to the FastAPI app with fakeredis swapped in.

    Uses `ASGITransport` so no real port is bound. Overrides the
    `apps.api.redis_client.get_redis` dependency so the app hits fakeredis.
    """
    httpx = pytest.importorskip("httpx")
    from apps.api import main as api_main
    from apps.api.redis_client import RedisClient, get_redis
    from apps.api.store import Store, get_store

    class _FakeRedisClient(RedisClient):
        def __init__(self, conn):
            super().__init__(url="redis://fake")
            self._conn = conn

        async def _get(self):
            return self._conn

    fake_client = _FakeRedisClient(fake_async_redis)
    fresh_store = Store()

    api_main.app.dependency_overrides[get_redis] = lambda: fake_client
    api_main.app.dependency_overrides[get_store] = lambda: fresh_store

    # The middleware `_log_if_synth_route` calls `get_redis()` directly (not via
    # FastAPI DI), so we also have to swap the module-level singleton.
    from apps.api import redis_client as redis_client_module
    prev_client = redis_client_module._client
    redis_client_module._client = fake_client

    transport = httpx.ASGITransport(app=api_main.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as c:
        c._understudy_store = fresh_store  # type: ignore[attr-defined]
        c._understudy_redis = fake_client  # type: ignore[attr-defined]
        yield c
    api_main.app.dependency_overrides.clear()
    redis_client_module._client = prev_client
