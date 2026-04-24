"""LangCache wrapper for every Gemini call (architecture.md §9, §17).

Key shape: `langcache:gemini:{sha256(canonical_json(messages))}`.

Two modes:
  - Managed LangCache client: used when `REDIS_LANGCACHE_URL` is set — the caller wraps
    Gemini invocations in `cached_call(key, live_fn)`; hits bypass the API entirely.
  - Fallback semantic cache: uses a Redis Vector Set `vset:global:langcache`; a cosine
    similarity >= 0.95 counts as a cache hit (architecture.md §9 "LangCache poisoning"
    row → per-agent namespaces + TTL isolation).

We key by a canonical JSON of the prompt messages, not the raw bytes, so whitespace and
field-ordering don't cause spurious misses.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
from typing import Any, Awaitable, Callable

import redis.asyncio as aioredis

log = logging.getLogger(__name__)

LANGCACHE_PREFIX: str = "langcache:gemini:"
LANGCACHE_TTL_S: int = 60 * 60 * 24  # 24h; per-agent policy lives in langcache:config:{agent}
SEMANTIC_SIMILARITY_HIT: float = 0.95
GLOBAL_SEMANTIC_VSET: str = "vset:global:langcache"


def messages_hash(messages: Any) -> str:
    """Stable SHA-256 over a canonical JSON dump of the messages payload."""
    canonical = json.dumps(messages, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def cache_key(messages: Any) -> str:
    return f"{LANGCACHE_PREFIX}{messages_hash(messages)}"


class LangCache:
    """Thin wrapper. Tries managed LangCache first, falls back to Redis GET/SET.

    Semantic vector-set fallback is wired as a hook — the actual embedding call is
    injected so this module stays SDK-free when Redis LangCache managed service is on.
    """

    def __init__(
        self,
        redis: aioredis.Redis,
        *,
        enable_semantic: bool = False,
        embed_fn: Callable[[str], Awaitable[list[float]]] | None = None,
    ) -> None:
        self.redis = redis
        self.enable_semantic = enable_semantic
        self.embed_fn = embed_fn
        self.managed_url = os.environ.get("REDIS_LANGCACHE_URL")

    async def get(self, messages: Any) -> dict[str, Any] | None:
        key = cache_key(messages)
        raw = await self.redis.get(key)
        if raw:
            log.debug("langcache hit (exact) key=%s", key)
            return json.loads(raw)

        if self.enable_semantic and self.embed_fn is not None:
            hit = await self._semantic_lookup(messages)
            if hit is not None:
                log.debug("langcache hit (semantic) key=%s", key)
                return hit

        return None

    async def set(self, messages: Any, value: dict[str, Any]) -> None:
        key = cache_key(messages)
        await self.redis.set(key, json.dumps(value, default=str), ex=LANGCACHE_TTL_S)

        if self.enable_semantic and self.embed_fn is not None:
            try:
                embedding = await self.embed_fn(json.dumps(messages, default=str))
                await self.redis.execute_command(
                    "VADD",
                    GLOBAL_SEMANTIC_VSET,
                    "VALUES",
                    str(len(embedding)),
                    *[str(x) for x in embedding],
                    key,
                )
            except Exception:
                log.exception("semantic cache store failed; exact cache still populated")

    async def cached_call(
        self,
        messages: Any,
        live_fn: Callable[[], Awaitable[dict[str, Any]]],
    ) -> tuple[dict[str, Any], bool]:
        """Run `live_fn` only if no cache entry exists. Returns (value, cache_hit)."""
        cached = await self.get(messages)
        if cached is not None:
            return cached, True
        value = await live_fn()
        await self.set(messages, value)
        return value, False

    async def _semantic_lookup(self, messages: Any) -> dict[str, Any] | None:
        assert self.embed_fn is not None
        try:
            embedding = await self.embed_fn(json.dumps(messages, default=str))
            # VSIM returns nearest neighbors by name; WITHSCORES to threshold on similarity.
            result = await self.redis.execute_command(
                "VSIM",
                GLOBAL_SEMANTIC_VSET,
                "VALUES",
                str(len(embedding)),
                *[str(x) for x in embedding],
                "WITHSCORES",
                "COUNT",
                "1",
            )
            if not result:
                return None
            name, score = result[0], float(result[1])
            if score < SEMANTIC_SIMILARITY_HIT:
                return None
            raw = await self.redis.get(name)
            return json.loads(raw) if raw else None
        except Exception:
            log.exception("semantic lookup failed; falling back to miss")
            return None
