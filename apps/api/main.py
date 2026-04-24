"""Understudy Synthesis API — FastAPI ingest + orchestration surface.

Endpoints (architecture.md §3, §6, §8, §9, §14):
  POST /synthesize                  multipart mp4 upload → 202 + {synthesis_run_id}
  GET  /synthesis/{id}              status + full gemini traces + intent abstraction
  GET  /synthesis/{id}/stream       SSE tail of `run:synth:{id}` stream (HUD live feed)
  GET  /agents                      list deployed agents (AGENT table, §8)
  GET  /agents/{id}                 single agent detail
  GET  /agents/{id}/attestation     bundled {agent,image,slsa,sbom,rekor_*} (§6)
  GET  /healthz                     200 + sponsor-service probes
  POST /demo/replay/{synth_id}      reads us:replay:{synth_id} — demo kill-switch (§14)

Boot: `python -m uvicorn apps.api.main:app --reload` from repo root.
"""

from __future__ import annotations

import os
import time
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable
from uuid import UUID, uuid4

import httpx
from fastapi import Depends, FastAPI, File, HTTPException, Request, Response, UploadFile, status
from fastapi.responses import JSONResponse, StreamingResponse

from understudy.models import (
    GEMINI_ACTION_DETECTION,
    GEMINI_INTENT_ABSTRACTION,
    GEMINI_SCRIPT_EMISSION,
)

from .redis_client import RedisClient, get_redis
from .schemas import (
    Agent,
    DemoMode,
    FullAttestation,
    HealthResponse,
    ReplayResponse,
    ServiceProbe,
    SynthesisRunDetail,
    SynthesisStatus,
    SynthesizeAccepted,
    TraceEvent,
)
from .store import InsforgeStore, Store, get_store


MAX_UPLOAD_BYTES = 200 * 1024 * 1024  # 200 MB — 60s 1080p mp4 fits comfortably
ALLOWED_MIME = {"video/mp4", "video/webm", "application/octet-stream"}

# Worker fetches uploads via `file://` until S3/R2 is wired in. Override with
# UPLOAD_DIR for prod or shared volumes.
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "/tmp/understudy-recordings"))
COSMO_ROUTER_URL = os.getenv("COSMO_ROUTER_URL", "http://localhost:4000")


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


async def _probe_http(name: str, url: str, path: str = "/health") -> ServiceProbe:
    try:
        async with httpx.AsyncClient(timeout=2.0) as c:
            resp = await c.get(url.rstrip("/") + path)
        if 200 <= resp.status_code < 500:
            return ServiceProbe(name=name, status="ok", detail=f"{url} -> {resp.status_code}")
        return ServiceProbe(name=name, status="degraded", detail=f"{resp.status_code}")
    except Exception as exc:
        return ServiceProbe(name=name, status="degraded", detail=f"{type(exc).__name__}")


def _probe_env(name: str, env_key: str, detail_when_set: str) -> ServiceProbe:
    return ServiceProbe(
        name=name,
        status="ok" if os.getenv(env_key) else "mock",
        detail=detail_when_set if os.getenv(env_key) else f"{env_key} unset",
    )


@app.get("/healthz", response_model=HealthResponse)
async def healthz(redis: RedisClient = Depends(get_redis)) -> HealthResponse:
    """Reports API liveness + demo mode + sponsor-service status probes."""
    redis_ok = await redis.ping()
    cosmo_probe = await _probe_http("cosmo_mcp", COSMO_ROUTER_URL)
    probes = [
        ServiceProbe(name="redis", status="ok" if redis_ok else "degraded"),
        _probe_env(
            "gemini",
            "GEMINI_API_KEY",
            f"{GEMINI_ACTION_DETECTION}, {GEMINI_INTENT_ABSTRACTION}, {GEMINI_SCRIPT_EMISSION}",
        ),
        cosmo_probe,
        _probe_env("chainguard", "GHCR_TOKEN", "cosign/Fulcio/Rekor configured"),
        _probe_env("insforge", "INSFORGE_OAUTH_CLIENT_ID", "Remote OAuth MCP configured"),
        _probe_env("tinyfish", "TINYFISH_API_KEY", "CLI + Agent Skills configured"),
    ]
    return HealthResponse(status="ok", demo_mode=_demo_mode(), services=probes)


@app.post("/synthesize", status_code=status.HTTP_202_ACCEPTED, response_model=SynthesizeAccepted)
async def synthesize(
    recording: UploadFile = File(..., description="mp4 screen capture, up to 60s"),
    redis: RedisClient = Depends(get_redis),
    store: Store | InsforgeStore = Depends(get_store),
) -> SynthesizeAccepted:
    """Accept an mp4 upload, create a SYNTHESIS_RUN, enqueue on `jobs:synthesis`.

    Returns 202 immediately — worker is responsible for the three-Gemini pipeline (§3).
    """
    # Strip codec params (e.g. `video/webm;codecs=vp9`) before comparing.
    base_mime = (recording.content_type or "").split(";", 1)[0].strip()
    if base_mime and base_mime not in ALLOWED_MIME:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"expected one of {sorted(ALLOWED_MIME)}, got {recording.content_type}",
        )
    recording_id = uuid4()
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    dest = UPLOAD_DIR / f"{recording_id}.mp4"
    size = 0
    chunk_size = 1024 * 1024
    with dest.open("wb") as fh:
        while True:
            chunk = await recording.read(chunk_size)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                fh.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"upload exceeds {MAX_UPLOAD_BYTES} bytes",
                )
            fh.write(chunk)
    await recording.close()

    recording_uri = f"file://{dest}"
    # duration_s is an upper-bound placeholder until ffprobe lands; InsForge only
    # uses it to satisfy the NOT NULL CHECK constraint on `recording.duration_s`.
    run = store.create_run(recording_id=recording_id, s3_uri=recording_uri, duration_s=60)

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
    store: Store | InsforgeStore = Depends(get_store),
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


_TERMINAL_STATUSES = {SynthesisStatus.COMPLETED.value, SynthesisStatus.FAILED.value}


@app.get("/synthesis/{id}/stream")
async def stream_synthesis(
    id: UUID,
    request: Request,
    redis: RedisClient = Depends(get_redis),
    store: Store | InsforgeStore = Depends(get_store),
) -> StreamingResponse:
    """SSE feed of the `run:synth:{id}` Redis Stream — replays history then tails live.

    Frontend pairs this with `new EventSource(...)` and expects one JSON-encoded
    TraceEvent per `data:` frame. Heartbeats are emitted as SSE comments (`: ping`) so
    intermediaries don't drop idle connections. A terminal run emits a final
    `event: done\\ndata: {"status": "completed|failed"}` frame so the client can
    close the EventSource without a trailing poll.
    """
    if store.get_run(id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"no synthesis run {id}")

    async def event_gen() -> AsyncIterator[bytes]:
        async for entry in redis.tail_trace(id):
            if await request.is_disconnected():
                return
            if entry.get("_heartbeat"):
                yield b": ping\n\n"
                continue
            ts_raw = entry.get("ts")
            try:
                ts = datetime.fromisoformat(ts_raw) if ts_raw else datetime.now(timezone.utc)
            except ValueError:
                ts = datetime.now(timezone.utc)
            event = TraceEvent(
                ts=ts,
                stage=entry.get("stage", ""),
                message=entry.get("message", ""),
                data=entry.get("data"),
            )
            yield f"data: {event.model_dump_json()}\n\n".encode("utf-8")

            # Worker convention: `stage == "status"` carries the new SynthesisStatus in
            # `data.status`. When it lands on a terminal state, emit `done` and stop.
            data = entry.get("data") or {}
            if event.stage == "status" and data.get("status") in _TERMINAL_STATUSES:
                yield (
                    f"event: done\ndata: "
                    f'{{"status": "{data["status"]}", "synthesis_run_id": "{id}"}}\n\n'
                ).encode("utf-8")
                return

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # bypass nginx buffering if fronted
            "Connection": "keep-alive",
        },
    )


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


@app.get("/agents/{id}/attestation", response_model=FullAttestation)
async def get_agent_attestation(id: UUID, store: Store = Depends(get_store)) -> FullAttestation:
    """Bundle the §6 supply-chain receipt into one payload for CosignReceipt.tsx."""
    bundle = store.get_attestation(id)
    if bundle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"no agent {id}")
    return bundle


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
