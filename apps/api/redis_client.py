"""Redis 8 client wrapper for the API layer.

Encodes the key-space conventions from architecture.md §9 so callers don't hand-build key
strings. Streams are append-only trace logs (`run:synth:{id}`); `us:replay:{synth_id}` is
the hermetic-demo cache (§14).

The connection is lazy so importing the app (for routes/self-check) does not require a
live Redis. `None` on failure is fine — the trace middleware swallows it.
"""

from __future__ import annotations

import json
import os
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import redis.asyncio as aioredis


REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
STREAM_SYNTH = "run:synth:{run_id}"
REPLAY_KEY = "us:replay:{synth_id}"
JOBS_STREAM = "jobs:synthesis"


def synth_stream_key(run_id: UUID | str) -> str:
    return STREAM_SYNTH.format(run_id=str(run_id))


def replay_key(synth_id: UUID | str) -> str:
    return REPLAY_KEY.format(synth_id=str(synth_id))


class RedisClient:
    """Thin async wrapper around redis.asyncio with lazy connection."""

    def __init__(self, url: str = REDIS_URL) -> None:
        self._url = url
        self._conn: aioredis.Redis | None = None

    async def _get(self) -> aioredis.Redis | None:
        if self._conn is not None:
            return self._conn
        try:
            self._conn = aioredis.from_url(self._url, decode_responses=True)  # type: ignore[no-untyped-call]
            await self._conn.ping()  # type: ignore[misc]
            return self._conn
        except Exception:
            self._conn = None
            return None

    async def append_trace(
        self, run_id: UUID | str, stage: str, message: str, data: dict[str, Any] | None = None
    ) -> None:
        """XADD one event onto `run:synth:{run_id}` (architecture.md §9)."""
        conn = await self._get()
        if conn is None:
            return
        fields = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "stage": stage,
            "message": message,
            "data": json.dumps(data or {}),
        }
        await conn.xadd(synth_stream_key(run_id), fields)  # type: ignore[arg-type]

    async def read_trace(self, run_id: UUID | str) -> list[dict[str, Any]]:
        """Read the full `run:synth:{run_id}` stream from the beginning."""
        conn = await self._get()
        if conn is None:
            return []
        entries = await conn.xrange(synth_stream_key(run_id))
        return [self._decode_entry(fields) for _, fields in entries]

    async def tail_trace(
        self, run_id: UUID | str, block_ms: int = 15_000
    ) -> "AsyncIterator[dict[str, Any]]":
        """Yield existing + new trace events via XREAD BLOCK — feeds the SSE endpoint.

        Replays the full history first (so a late subscriber doesn't miss the early
        keyframe/ingest events), then switches to tailing from `$`.
        """
        conn = await self._get()
        if conn is None:
            return
        key = synth_stream_key(run_id)
        last_id = "0-0"
        history = await conn.xrange(key)
        for msg_id, fields in history:
            last_id = msg_id
            yield self._decode_entry(fields)
        while True:
            resp = await conn.xread({key: last_id}, block=block_ms, count=32)
            if not resp:
                yield {"_heartbeat": True}
                continue
            for _stream, entries in resp:
                for msg_id, fields in entries:
                    last_id = msg_id
                    yield self._decode_entry(fields)

    @staticmethod
    def _decode_entry(fields: dict[str, Any]) -> dict[str, Any]:
        raw = fields.get("data") or "{}"
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            data = {"_raw": raw}
        return {
            "ts": fields.get("ts"),
            "stage": fields.get("stage", ""),
            "message": fields.get("message", ""),
            "data": data,
        }

    async def enqueue_job(self, run_id: UUID | str, recording_uri: str) -> None:
        """XADD a job onto `jobs:synthesis` — consumed by apps/synthesis-worker (task #3)."""
        conn = await self._get()
        if conn is None:
            return
        await conn.xadd(
            JOBS_STREAM,
            {
                "run_id": str(run_id),
                "recording_uri": recording_uri,
                "enqueued_at": datetime.now(timezone.utc).isoformat(),
            },
        )

    async def get_replay(self, synth_id: UUID | str) -> dict[str, Any] | None:
        """Read hermetic-demo cached response (architecture.md §14)."""
        conn = await self._get()
        if conn is None:
            return None
        raw = await conn.get(replay_key(synth_id))
        if raw is None:
            return None
        try:
            return json.loads(raw)  # type: ignore[no-any-return]
        except json.JSONDecodeError:
            return None

    async def get_synthesis_result(self, synth_id: UUID | str) -> dict[str, Any] | None:
        """Read worker output stored at `us:synth:{id}:result`."""
        conn = await self._get()
        if conn is None:
            return None
        raw = await conn.get(f"us:synth:{synth_id}:result")
        if raw is None:
            return None
        try:
            return json.loads(raw)  # type: ignore[no-any-return]
        except json.JSONDecodeError:
            return None

    async def ping(self) -> bool:
        conn = await self._get()
        return conn is not None

    async def close(self) -> None:
        if self._conn is not None:
            await self._conn.close()
            self._conn = None


_client: RedisClient | None = None


def get_redis() -> RedisClient:
    """Module-level singleton — FastAPI dependency."""
    global _client
    if _client is None:
        _client = RedisClient()
    return _client
