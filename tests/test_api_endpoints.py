"""API integration tests — httpx AsyncClient against apps.api.main.

Covers the endpoints enumerated in architecture.md §3 and §9:
  - POST /synthesize happy path: 202, synthesis_run_id returned, job XADDed to
    jobs:synthesis, ingest trace landed in run:synth:{id}.
  - POST /synthesize rejects bad content-type (415).
  - GET  /synthesis/{id} replays the Redis Stream trace.
  - GET  /synthesis/{id} 404 for unknown id.
  - GET  /healthz shape + sponsor-service probes.
  - POST /demo/replay/{id} reads us:replay:{id}.
"""

from __future__ import annotations

import io
import json
from uuid import UUID, uuid4

import pytest

pytest.importorskip("httpx")
pytest.importorskip("fakeredis")


@pytest.mark.asyncio
async def test_healthz_shape(api_client) -> None:
    r = await api_client.get("/healthz")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["demo_mode"] in {"live", "replay", "hybrid"}
    names = {svc["name"] for svc in body["services"]}
    assert {"redis", "gemini", "cosmo_mcp", "chainguard", "insforge", "tinyfish"} <= names


@pytest.mark.asyncio
async def test_synthesize_happy_path(api_client) -> None:
    mp4_bytes = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 64
    files = {"recording": ("demo.mp4", io.BytesIO(mp4_bytes), "video/mp4")}

    r = await api_client.post("/synthesize", files=files)
    assert r.status_code == 202, r.text
    body = r.json()
    run_id = UUID(body["synthesis_run_id"])
    assert body["status"] == "queued"

    # Store row was created.
    store = api_client._understudy_store
    assert store.get_run(run_id) is not None

    # jobs:synthesis got a job for this run_id.
    redis_client = api_client._understudy_redis
    conn = await redis_client._get()
    entries = await conn.xrange("jobs:synthesis")
    assert len(entries) == 1
    _msg_id, fields = entries[0]
    assert fields["run_id"] == str(run_id)
    # API persists uploads to UPLOAD_DIR and enqueues a file:// URI the worker can fetch.
    assert fields["recording_uri"].startswith("file://")
    assert fields["recording_uri"].endswith(".mp4")

    # run:synth:{id} got the ingest trace event.
    trace = await conn.xrange(f"run:synth:{run_id}")
    stages = [fields["stage"] for _mid, fields in trace]
    assert "ingest" in stages
    assert "enqueued" in stages


@pytest.mark.asyncio
async def test_synthesize_rejects_bad_mime(api_client) -> None:
    files = {"recording": ("notvideo.txt", io.BytesIO(b"hi"), "text/plain")}
    r = await api_client.post("/synthesize", files=files)
    # API returns 415 for unsupported media types. Architecture spec originally
    # referenced "400 for malformed mp4" — 415 is the correct HTTP semantic here
    # and is what the API enforces at the content-type gate.
    assert r.status_code == 415
    assert "video/mp4" in r.text.lower()


@pytest.mark.asyncio
async def test_get_synthesis_replays_trace(api_client) -> None:
    mp4_bytes = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 32
    files = {"recording": ("r.mp4", io.BytesIO(mp4_bytes), "video/mp4")}
    r = await api_client.post("/synthesize", files=files)
    run_id = r.json()["synthesis_run_id"]

    # Append a couple more trace events to verify replay ordering.
    redis_client = api_client._understudy_redis
    await redis_client.append_trace(run_id, "keyframes", "extracted 6", {"count": 6})
    await redis_client.append_trace(run_id, "gemini", "action_detection done")

    r2 = await api_client.get(f"/synthesis/{run_id}")
    assert r2.status_code == 200
    body = r2.json()
    assert body["run"]["id"] == run_id
    stages = [ev["stage"] for ev in body["trace"]]
    assert stages[:2] == ["ingest", "enqueued"]
    assert "keyframes" in stages
    assert "gemini" in stages


@pytest.mark.asyncio
async def test_get_synthesis_missing_returns_404(api_client) -> None:
    r = await api_client.get(f"/synthesis/{uuid4()}")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_demo_replay_reads_us_replay_key(api_client) -> None:
    synth_id = uuid4()
    payload = {"synth_id": str(synth_id), "stages": {"action_detection": {"latency_ms": 1200}}}

    redis_client = api_client._understudy_redis
    conn = await redis_client._get()
    await conn.set(f"us:replay:{synth_id}", json.dumps(payload))

    r = await api_client.post(f"/demo/replay/{synth_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["served_from"] == "redis"
    assert body["payload"] == payload


@pytest.mark.asyncio
async def test_demo_replay_miss_returns_404(api_client) -> None:
    r = await api_client.post(f"/demo/replay/{uuid4()}")
    assert r.status_code == 404
