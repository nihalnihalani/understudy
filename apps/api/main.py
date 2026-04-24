"""Understudy Synthesis API — FastAPI ingest + orchestration surface.

Endpoints (architecture.md §3, §8, §9, §14):
  POST /synthesize                  multipart mp4 upload → 202 + {synthesis_run_id}
  GET  /synthesis/{id}              status + full gemini traces + intent abstraction
  GET  /agents                      list deployed agents (AGENT table, §8)
  GET  /agents/{id}                 single agent detail
  GET  /healthz                     200 + sponsor-service probes
  POST /demo/replay/{synth_id}      reads us:replay:{synth_id} — demo kill-switch (§14)

Boot: `python -m uvicorn apps.api.main:app --reload` from repo root.
"""

from __future__ import annotations

import os
import time
from datetime import datetime, timezone
from typing import Callable
from uuid import UUID, uuid4

from fastapi import Depends, FastAPI, File, HTTPException, Request, Response, UploadFile, status
from fastapi.responses import JSONResponse

from understudy.models import (
    GEMINI_ACTION_DETECTION,
    GEMINI_INTENT_ABSTRACTION,
    GEMINI_SCRIPT_EMISSION,
)

from .redis_client import RedisClient, get_redis
from .schemas import (
    Agent,
    DemoMode,
    HealthResponse,
    ReplayResponse,
    ServiceProbe,
    SynthesisRunDetail,
    SynthesisStatus,
    SynthesizeAccepted,
    TraceEvent,
)
from .store import Store, get_store


MAX_UPLOAD_BYTES = 200 * 1024 * 1024  # 200 MB — 60s 1080p mp4 fits comfortably
ALLOWED_MIME = {"video/mp4", "application/octet-stream"}


def _demo_mode() -> DemoMode:
    raw = os.getenv("DEMO_MODE", "live").lower()
    try:
        return DemoMode(raw)
    except ValueError:
        return DemoMode.LIVE


app = FastAPI(
    title="Understudy Synthesis API",
    version="0.1.0",
    description="60s screen recording → signed deployed web agent. See architecture.md.",
)


@app.middleware("http")
async def trace_middleware(request: Request, call_next: Callable) -> Response:
    """Logs every request; for synthesis routes, also XADDs to `run:synth:{id}`.

    Tailable from the UI via `XREAD BLOCK 0 STREAMS run:synth:{id}` (§9).
    """
    t0 = time.monotonic()
    request_id = request.headers.get("x-request-id") or uuid4().hex
    response: Response
    try:
        response = await call_next(request)
    except Exception:
        dur_ms = int((time.monotonic() - t0) * 1000)
        await _log_if_synth_route(request, "error", f"{request.method} {request.url.path} raised", dur_ms)
        raise
    dur_ms = int((time.monotonic() - t0) * 1000)
    response.headers["x-request-id"] = request_id
    response.headers["x-duration-ms"] = str(dur_ms)
    await _log_if_synth_route(
        request, "http", f"{request.method} {request.url.path} -> {response.status_code}", dur_ms
    )
    return response


async def _log_if_synth_route(request: Request, stage: str, message: str, dur_ms: int) -> None:
    """Extract {synth_id} from path params and append to that run's Redis Stream."""
    run_id = (request.path_params or {}).get("id") or (request.path_params or {}).get("synth_id")
    if not run_id:
        return
    redis = get_redis()
    await redis.append_trace(run_id, stage, message, {"duration_ms": dur_ms})


@app.get("/healthz", response_model=HealthResponse)
async def healthz(redis: RedisClient = Depends(get_redis)) -> HealthResponse:
    """Reports API liveness + demo mode + sponsor-service status probes."""
    redis_ok = await redis.ping()
    probes = [
        ServiceProbe(name="redis", status="ok" if redis_ok else "degraded"),
        ServiceProbe(
            name="gemini",
            status="mock",
            detail=f"{GEMINI_ACTION_DETECTION}, {GEMINI_INTENT_ABSTRACTION}, {GEMINI_SCRIPT_EMISSION}",
        ),
        ServiceProbe(name="cosmo_mcp", status="mock", detail="Dream Query stub — see task #4"),
        ServiceProbe(name="chainguard", status="mock", detail="cosign/Fulcio/Rekor stub — task #8"),
        ServiceProbe(name="insforge", status="mock", detail="Remote OAuth MCP stub"),
        ServiceProbe(name="tinyfish", status="mock", detail="CLI + Agent Skills — task #5"),
    ]
    return HealthResponse(status="ok", demo_mode=_demo_mode(), services=probes)


@app.post("/synthesize", status_code=status.HTTP_202_ACCEPTED, response_model=SynthesizeAccepted)
async def synthesize(
    recording: UploadFile = File(..., description="mp4 screen capture, up to 60s"),
    redis: RedisClient = Depends(get_redis),
    store: Store = Depends(get_store),
) -> SynthesizeAccepted:
    """Accept an mp4 upload, create a SYNTHESIS_RUN, enqueue on `jobs:synthesis`.

    Returns 202 immediately — worker is responsible for the three-Gemini pipeline (§3).
    """
    if recording.content_type and recording.content_type not in ALLOWED_MIME:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"expected video/mp4, got {recording.content_type}",
        )
    size = 0
    chunk_size = 1024 * 1024
    while True:
        chunk = await recording.read(chunk_size)
        if not chunk:
            break
        size += len(chunk)
        if size > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"upload exceeds {MAX_UPLOAD_BYTES} bytes",
            )
    await recording.close()

    recording_id = uuid4()
    run = store.create_run(recording_id=recording_id)
    recording_uri = f"s3://understudy-recordings/{recording_id}.mp4"

    await redis.append_trace(
        run.id,
        "ingest",
        f"recording accepted ({size} bytes, filename={recording.filename!r})",
        {"recording_id": str(recording_id), "size_bytes": size},
    )
    await redis.enqueue_job(run.id, recording_uri)
    await redis.append_trace(run.id, "enqueued", "job added to jobs:synthesis stream")

    return SynthesizeAccepted(synthesis_run_id=run.id, status=SynthesisStatus.QUEUED)


@app.get("/synthesis/{id}", response_model=SynthesisRunDetail)
async def get_synthesis(
    id: UUID,
    redis: RedisClient = Depends(get_redis),
    store: Store = Depends(get_store),
) -> SynthesisRunDetail:
    """Return the SynthesisRun row + the full `run:synth:{id}` trace stream."""
    run = store.get_run(id)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"no synthesis run {id}")
    raw_trace = await redis.read_trace(id)
    trace: list[TraceEvent] = []
    for entry in raw_trace:
        ts_raw = entry.get("ts")
        try:
            ts = datetime.fromisoformat(ts_raw) if ts_raw else datetime.now(timezone.utc)
        except ValueError:
            ts = datetime.now(timezone.utc)
        trace.append(
            TraceEvent(
                ts=ts,
                stage=entry.get("stage", ""),
                message=entry.get("message", ""),
                data=entry.get("data"),
            )
        )
    return SynthesisRunDetail(run=run, trace=trace)


@app.get("/agents", response_model=list[Agent])
async def list_agents(store: Store = Depends(get_store)) -> list[Agent]:
    """List all deployed agents — AGENT table (§8)."""
    return store.list_agents()


@app.get("/agents/{id}", response_model=Agent)
async def get_agent(id: UUID, store: Store = Depends(get_store)) -> Agent:
    """Return a single agent by id."""
    agent = store.get_agent(id)
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"no agent {id}")
    return agent


@app.post("/demo/replay/{synth_id}", response_model=ReplayResponse)
async def demo_replay(
    synth_id: UUID, redis: RedisClient = Depends(get_redis)
) -> ReplayResponse | JSONResponse:
    """Hermetic demo kill-switch (architecture.md §14) — serve cached response."""
    payload = await redis.get_replay(synth_id)
    if payload is None:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": f"no us:replay:{synth_id} entry"},
        )
    await redis.append_trace(
        synth_id, "replay", "served from us:replay:{synth_id}", {"demo_mode": _demo_mode().value}
    )
    return ReplayResponse(synthesis_run_id=synth_id, served_from="redis", payload=payload)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("apps.api.main:app", host="0.0.0.0", port=8080, reload=True)
