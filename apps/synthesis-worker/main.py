"""Synthesis worker entrypoint — consumes `jobs:synthesis` from Redis Streams.

Usage:
    python -m apps.synthesis_worker.main        # when apps/synthesis_worker/ package exists
    python apps/synthesis-worker/main.py         # direct script run (hyphenated dir today)

Each job: `{synth_id, recording_uri, dom_diffs?, dom_snapshots?, page_titles?}`.
The worker fetches the recording bytes, runs the three-Gemini pipeline, and writes the
result back to Redis for the API to surface. DEMO_MODE=replay short-circuits all Gemini
calls via `us:replay:{synth_id}:*` keys (architecture.md §14).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
from dataclasses import asdict
from typing import Any

import httpx
import redis.asyncio as aioredis

# Hybrid import: works both as `apps.synthesis_worker.main` (if renamed) and as a
# direct-script run from the hyphenated dir.
try:
    from .gemini_client import GeminiClient
    from .langcache import LangCache
    from .pipeline import SynthesisResult, run_pipeline, run_trace_key
except ImportError:  # pragma: no cover — direct-script execution fallback
    import pathlib
    import sys

    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
    from gemini_client import GeminiClient  # type: ignore[no-redef]
    from langcache import LangCache  # type: ignore[no-redef]
    from pipeline import SynthesisResult, run_pipeline, run_trace_key  # type: ignore[no-redef]

log = logging.getLogger("synthesis_worker")

JOBS_STREAM = "jobs:synthesis"
CONSUMER_GROUP = "synthesis-workers"
CONSUMER_NAME = os.environ.get("WORKER_ID", "worker-1")


async def _load_recording(recording_uri: str) -> bytes:
    """Fetch mp4 bytes — file://, http(s)://, or raw path."""
    if recording_uri.startswith("file://"):
        path = recording_uri[len("file://") :]
        with open(path, "rb") as f:
            return f.read()
    if recording_uri.startswith(("http://", "https://")):
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.get(recording_uri)
            resp.raise_for_status()
            return resp.content
    with open(recording_uri, "rb") as f:
        return f.read()


async def _ensure_group(redis: aioredis.Redis) -> None:
    try:
        await redis.xgroup_create(JOBS_STREAM, CONSUMER_GROUP, id="0", mkstream=True)
    except aioredis.ResponseError as exc:
        if "BUSYGROUP" not in str(exc):
            raise


async def _write_trace(redis: aioredis.Redis, run_id: str, stage: str, data: Any) -> None:
    await redis.xadd(
        run_trace_key(run_id),
        {"stage": stage, "data": json.dumps(data, default=str)},
        maxlen=1000,
        approximate=True,
    )


async def _process_job(
    redis: aioredis.Redis, gemini: GeminiClient, msg_id: str, fields: dict[str, str]
) -> None:
    synth_id = fields["synth_id"]
    log.info("processing synth_id=%s msg=%s", synth_id, msg_id)
    await _write_trace(redis, synth_id, "stage_started", {"stage": "keyframes"})

    recording_bytes = await _load_recording(fields["recording_uri"])
    dom_diffs = json.loads(fields.get("dom_diffs", "[]"))
    dom_snapshots = json.loads(fields.get("dom_snapshots", "[]"))
    page_titles = json.loads(fields.get("page_titles", "[]"))

    result = await run_pipeline(
        synth_id=synth_id,
        recording_bytes=recording_bytes,
        dom_diffs=dom_diffs,
        dom_snapshots=dom_snapshots,
        page_titles=page_titles,
        gemini=gemini,
        redis=redis,
    )

    await _publish_result(redis, result)
    await _write_trace(redis, synth_id, "pipeline_completed", {"script_chars": len(result.bundle.script)})
    await redis.xack(JOBS_STREAM, CONSUMER_GROUP, msg_id)


async def _publish_result(redis: aioredis.Redis, result: SynthesisResult) -> None:
    """Write the three traces + the final bundle for the API to read."""
    await redis.set(
        f"us:synth:{result.synth_id}:result",
        json.dumps(
            {
                "synth_id": result.synth_id,
                "actions": [asdict(a) for a in result.actions],
                "intent": asdict(result.intent),
                "bundle": asdict(result.bundle),
            },
            default=str,
        ),
        ex=60 * 60 * 24 * 7,
    )


async def run_worker() -> None:
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379")
    redis = aioredis.from_url(redis_url, decode_responses=True)

    langcache = LangCache(redis)
    gemini = GeminiClient(langcache=langcache)

    await _ensure_group(redis)
    log.info(
        "synthesis-worker running: stream=%s group=%s consumer=%s demo_mode=%s",
        JOBS_STREAM,
        CONSUMER_GROUP,
        CONSUMER_NAME,
        os.environ.get("DEMO_MODE", "live"),
    )

    stop_event = asyncio.Event()

    def _handle_stop(*_: Any) -> None:
        stop_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            asyncio.get_running_loop().add_signal_handler(sig, _handle_stop)
        except (NotImplementedError, RuntimeError):
            signal.signal(sig, _handle_stop)

    while not stop_event.is_set():
        try:
            entries = await redis.xreadgroup(
                CONSUMER_GROUP,
                CONSUMER_NAME,
                streams={JOBS_STREAM: ">"},
                count=1,
                block=2000,
            )
        except aioredis.ConnectionError:
            log.exception("redis connection error; retrying in 1s")
            await asyncio.sleep(1)
            continue

        if not entries:
            continue

        for _stream, messages in entries:
            for msg_id, fields in messages:
                try:
                    await _process_job(redis, gemini, msg_id, fields)
                except Exception:
                    log.exception("job failed msg=%s", msg_id)

    log.info("synthesis-worker shutting down")
    await redis.aclose()


if __name__ == "__main__":
    asyncio.run(run_worker())
