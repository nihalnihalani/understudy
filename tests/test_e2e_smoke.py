"""End-to-end smoke test in DEMO_MODE=replay.

Exercises the 3-minute §15 demo timeline's happy-path request flow:
  1. POST /synthesize with fixtures/mp4/demo.mp4 → 202 + synthesis_run_id
  2. Seed us:replay:{synthesis_run_id} with the canned demo payload
  3. Poll /demo/replay/{synthesis_run_id} until it returns a signed agent
     URL + GraphQL endpoint
  4. Assert total elapsed time < 10s (hermetic budget from architecture.md §15)

Runs entirely on fakeredis — no live Redis, no live Gemini. The synthesis
worker itself is not spawned; this test validates the *API surface* that
the demo script calls. The worker's replay path is covered by
tests/synthesis_worker/test_replay_mode.py.
"""

from __future__ import annotations

import asyncio
import io
import json
import time
from pathlib import Path
from uuid import UUID

import pytest

pytest.importorskip("httpx")
pytest.importorskip("fakeredis")


DEMO_MP4 = Path(__file__).resolve().parent.parent / "fixtures" / "mp4" / "demo.mp4"


CANNED_REPLAY = {
    "synth_id": None,  # filled in per-test
    "stages": {
        "action_detection": {"model": "gemini-3.1-flash-lite", "latency_ms": 1240},
        "intent_abstraction": {"model": "gemini-3.1-pro", "latency_ms": 2180},
        "script_emission": {"model": "gemini-3-flash", "latency_ms": 2940},
    },
    "agent_url": "https://agents.understudy.dev/a/demo-001",
    "graphql_endpoint": "https://cosmo.understudy.dev/agents/demo/graphql",
    "cosign_sig": "MEUCIQDdemoSignature",
    "image_digest": "sha256:deadbeefcafe0000000000000000000000000000000000000000000000000001",
}


@pytest.mark.asyncio
async def test_demo_smoke_under_10s(api_client) -> None:
    assert DEMO_MP4.exists(), f"fixtures/mp4/demo.mp4 missing — {DEMO_MP4}"

    t0 = time.perf_counter()

    with DEMO_MP4.open("rb") as f:
        mp4_bytes = f.read()
    files = {"recording": ("demo.mp4", io.BytesIO(mp4_bytes), "video/mp4")}
    r = await api_client.post("/synthesize", files=files)
    assert r.status_code == 202, r.text
    run_id = UUID(r.json()["synthesis_run_id"])

    # Simulate the prewarm step that seeds us:replay:{synth_id} (architecture.md §14).
    payload = {**CANNED_REPLAY, "synth_id": str(run_id)}
    conn = await api_client._understudy_redis._get()
    await conn.set(f"us:replay:{run_id}", json.dumps(payload))

    # Poll /demo/replay with a short ceiling — mimics the demo UI's exponential backoff.
    deadline = t0 + 10.0
    replay_body: dict | None = None
    while time.perf_counter() < deadline:
        r2 = await api_client.post(f"/demo/replay/{run_id}")
        if r2.status_code == 200:
            replay_body = r2.json()
            break
        await asyncio.sleep(0.05)

    elapsed = time.perf_counter() - t0
    assert replay_body is not None, f"no replay after {elapsed:.2f}s"
    assert elapsed < 10.0, f"demo budget blown: {elapsed:.2f}s > 10s (§15)"

    assert replay_body["served_from"] == "redis"
    assert replay_body["payload"]["agent_url"].startswith("https://")
    assert "graphql" in replay_body["payload"]["graphql_endpoint"]
    assert replay_body["payload"]["cosign_sig"].startswith("MEUCIQ")


@pytest.mark.asyncio
async def test_demo_smoke_produces_trace(api_client) -> None:
    """After /synthesize + /demo/replay, the run:synth stream holds the narrative."""
    with DEMO_MP4.open("rb") as f:
        mp4_bytes = f.read()
    files = {"recording": ("demo.mp4", io.BytesIO(mp4_bytes), "video/mp4")}
    r = await api_client.post("/synthesize", files=files)
    run_id = UUID(r.json()["synthesis_run_id"])

    payload = {**CANNED_REPLAY, "synth_id": str(run_id)}
    conn = await api_client._understudy_redis._get()
    await conn.set(f"us:replay:{run_id}", json.dumps(payload))

    await api_client.post(f"/demo/replay/{run_id}")

    r3 = await api_client.get(f"/synthesis/{run_id}")
    assert r3.status_code == 200
    stages = [ev["stage"] for ev in r3.json()["trace"]]
    assert "ingest" in stages
    assert "enqueued" in stages
    assert "replay" in stages
