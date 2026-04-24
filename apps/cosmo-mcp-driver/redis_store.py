"""Redis persistence for Dream Query results — `dream:{run_id}` hash (architecture.md §9).

JSON-shaped values are serialized into the hash fields so downstream consumers can read
subsets without parsing the whole record.
"""

from __future__ import annotations

import json
import os
from typing import Any

try:
    from redis.asyncio import Redis
except ImportError:  # pragma: no cover — redis is a top-level dep, but import guard keeps tests trivially runnable
    Redis = None  # type: ignore[assignment,misc]


class DreamStore:
    """Thin wrapper over a Redis async client keyed to the `dream:{run_id}` hash."""

    def __init__(self, redis: Any) -> None:
        self._redis = redis

    @classmethod
    def from_env(cls) -> "DreamStore | None":
        """Build a store from `REDIS_URL`, or return None (callers treat None as opt-out)."""
        if Redis is None:
            return None
        url = os.environ.get("REDIS_URL")
        if not url:
            return None
        return cls(Redis.from_url(url, decode_responses=True))

    @staticmethod
    def _encode(value: Any) -> str:
        if isinstance(value, str):
            return value
        return json.dumps(value, default=str, sort_keys=True)

    async def put(self, run_id: str, fields: dict[str, Any]) -> None:
        payload = {k: self._encode(v) for k, v in fields.items()}
        await self._redis.hset(f"dream:{run_id}", mapping=payload)

    async def update(self, run_id: str, fields: dict[str, Any]) -> None:
        await self.put(run_id, fields)

    async def get(self, run_id: str) -> dict[str, str]:
        return await self._redis.hgetall(f"dream:{run_id}")

    async def close(self) -> None:
        close = getattr(self._redis, "aclose", None) or getattr(self._redis, "close", None)
        if close is not None:
            result = close()
            if hasattr(result, "__await__"):
                await result
