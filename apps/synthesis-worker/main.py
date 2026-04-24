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
    from .insforge_writer import InsforgeWriter
    from .langcache import LangCache
    from .pipeline import SynthesisResult, run_pipeline, run_trace_key
except ImportError:  # pragma: no cover — direct-script execution fallback
    import pathlib
    import sys

    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
    from gemini_client import GeminiClient  # type: ignore[no-redef]
    from insforge_writer import InsforgeWriter  # type: ignore[no-redef]
    from langcache import LangCache  # type: ignore[no-redef]
    from pipeline import SynthesisResult, run_pipeline, run_trace_key  # type: ignore[no-redef]

log = logging.getLogger("synthesis_worker")

JOBS_STREAM = "jobs:synthesis"
CONSUMER_GROUP = "synthesis-workers"
CONSUMER_NAME = os.environ.get("WORKER_ID", "worker-1")

# Defaults for fields that don't yet exist in the pipeline output (e.g. cosign
# signature for an image we haven't yet pushed to the registry). These match
# the convention in apps/api/store.py:build_attestation so the InsforgeStore
# read path merges cleanly.
DEFAULT_REGISTRY = os.environ.get(
    "AGENT_IMAGE_REGISTRY", "ghcr.io/nihalnihalani/understudy-agent-base"
)
DEFAULT_BUILDER_ID = os.environ.get(
    "COSIGN_CERT_IDENTITY",
    "https://github.com/nihalnihalani/understudy/.github/workflows/release.yml@refs/heads/main",
)
DEFAULT_GRAPHQL_BASE = os.environ.get(
    "COSMO_GRAPHQL_BASE", "https://cosmo.understudy.dev/agents"
)


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


def _derive_image_digest(synth_id: str) -> str:
    """Stable per-synth pseudo-digest until real CI build provides one.

    Matches the `sha256:<64hex>` shape `apps/api/store.py:build_attestation`
    expects so the read path enrichment merges cleanly. Marked `pending:` in
    the cosign_sig field so reviewers can see it's not yet a real signature.
    """
    import hashlib

    h = hashlib.sha256(synth_id.encode("utf-8")).hexdigest()
    return f"sha256:{h}"


def _persist_artifacts(writer: InsforgeWriter, result: SynthesisResult) -> None:
    """INSERT image / slsa / sbom / agent rows for a completed synthesis.

    Best-effort: failures are logged inside InsforgeWriter and never raise out
    of here. The synthesis result has already been published to Redis by the
    time we get here, so DB persistence is purely additive.
    """
    if not writer.enabled:
        return

    image_digest = _derive_image_digest(result.synth_id)
    # Pull SBOM components from the script bundle's pinned skills if present;
    # otherwise pass an empty list (NOT NULL default in schema is '[]'::jsonb).
    skills = result.bundle.skills_pinned or []
    sbom_components: list[dict[str, Any]] = [
        {
            "name": s.get("name", "unknown"),
            "version": s.get("version", "0.0.0"),
            "type": "tinyfish-skill",
        }
        for s in skills
    ]

    # Keep this shape in lock-step with the CI path at
    # .github/workflows/release.yml (-> `materials_json` in the
    # "Publish attestation metadata to InsForge" step). Both writers emit a
    # dict with `resolved_dependencies` (array) so the jsonb column is
    # consistently traversable from the frontend. CI writers populate
    # `resolved_dependencies` from the in-toto predicate; worker writers only
    # have the coarse sources (repo + base image) available pre-signing.
    materials = {
        "resolved_dependencies": [
            {"uri": "git+https://github.com/nihalnihalani/understudy"},
            {"uri": "cgr.dev/chainguard/wolfi-base"},
        ],
        "synth_id": result.synth_id,
        "build_type": "https://slsa.dev/container-based-build/v0.1",
    }

    short = image_digest.removeprefix("sha256:")[:12]
    try:
        writer.persist_agent_artifacts(
            image_digest=image_digest,
            registry=DEFAULT_REGISTRY,
            builder_id=DEFAULT_BUILDER_ID,
            materials=materials,
            sbom_components=sbom_components,
            cosign_sig=f"pending:{short}",
            graphql_endpoint=f"{DEFAULT_GRAPHQL_BASE}/{result.synth_id}/graphql",
            ams_namespace=f"ams:agent:{result.synth_id}",
        )
    except Exception:
        log.exception("persist_agent_artifacts failed for synth_id=%s", result.synth_id)


async def _process_job(
    redis: aioredis.Redis,
    gemini: GeminiClient,
    writer: InsforgeWriter,
    msg_id: str,
    fields: dict[str, str],
) -> None:
    # The API enqueues `run_id` (the SYNTHESIS_RUN row id from architecture.md §8);
    # the worker's internal naming is `synth_id`. They are the same UUID — accept
    # either field so the API/worker contract isn't brittle to which side renames.
    synth_id = fields.get("synth_id") or fields["run_id"]
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
    # Best-effort DB persistence: the worker is the place where the image
    # digest + signed-agent triple becomes real. Done in a thread so the httpx
    # sync client doesn't block the asyncio loop. Failures are non-fatal —
    # the SynthesisResult is already in Redis as primary truth.
    await asyncio.to_thread(_persist_artifacts, writer, result)
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
    writer = InsforgeWriter()

    await _ensure_group(redis)
    log.info(
        "synthesis-worker running: stream=%s group=%s consumer=%s demo_mode=%s insforge=%s",
        JOBS_STREAM,
        CONSUMER_GROUP,
        CONSUMER_NAME,
        os.environ.get("DEMO_MODE", "live"),
        "on" if writer.enabled else "off",
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
                    await _process_job(redis, gemini, writer, msg_id, fields)
                except Exception:
                    log.exception("job failed msg=%s", msg_id)

    log.info("synthesis-worker shutting down")
    writer.close()
    await redis.aclose()


if __name__ == "__main__":
    asyncio.run(run_worker())
