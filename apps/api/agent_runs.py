"""Agent runtime — proxy TinyFish hosted-browser runs to the web UI as SSE.

The web app gives the user a goal + start URL, the FastAPI opens an
`AsyncTinyFish.agent.stream()`, and forwards every event back to the
browser so progress shows up live in a panel.

  GET /agents/run/stream?goal=...&url=...
      streams `data: <json>\\n\\n` SSE frames; ends on COMPLETE/error.

The TinyFish API key lives in `TINYFISH_API_KEY` env var.
"""

from __future__ import annotations

import json
import logging
import os
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import StreamingResponse

log = logging.getLogger(__name__)

router = APIRouter(prefix="/agents/run", tags=["agent-runs"])


def _sse(payload: dict[str, Any]) -> bytes:
    return f"data: {json.dumps(payload)}\n\n".encode("utf-8")


@router.get("/stream")
async def stream_agent_run(request: Request, goal: str, url: str) -> StreamingResponse:
    """Open a TinyFish agent run and forward SSE events to the browser."""
    api_key = os.getenv("TINYFISH_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="TINYFISH_API_KEY not configured on the server",
        )
    if not goal.strip() or not url.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="goal and url are required",
        )

    # Lazy-import so the API still boots if tinyfish isn't installed in dev.
    try:
        from tinyfish import AsyncTinyFish  # type: ignore[import-not-found]
    except Exception as exc:  # pragma: no cover
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"tinyfish SDK unavailable: {exc}",
        ) from exc

    async def gen() -> AsyncIterator[bytes]:
        client = AsyncTinyFish(api_key=api_key)
        # Tell the browser the run is being submitted (UI can show "queueing…").
        yield _sse({"type": "OPEN", "goal": goal, "url": url})
        try:
            async with client.agent.stream(goal=goal, url=url) as stream:
                async for event in stream:
                    if await request.is_disconnected():
                        return
                    payload = _event_to_dict(event)
                    yield _sse(payload)
                    if payload.get("type") in {"COMPLETE", "ERROR"}:
                        return
        except Exception as exc:
            log.exception("agent run failed")
            yield _sse({"type": "ERROR", "error": f"{type(exc).__name__}: {exc}"})
        finally:
            try:
                await client.close()
            except Exception:
                pass

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _event_to_dict(event: object) -> dict[str, Any]:
    """Coerce a tinyfish SDK event (pydantic model) into a plain dict.

    The SDK emits typed pydantic models (StartedEvent, ProgressEvent, …);
    `model_dump` gives us a JSON-safe dict. Falls back to repr() so we never
    drop an event silently.
    """
    if hasattr(event, "model_dump"):
        try:
            return event.model_dump(mode="json")  # type: ignore[no-any-return]
        except Exception:
            pass
    if isinstance(event, dict):
        return event
    return {"type": "RAW", "repr": repr(event)[:300]}
