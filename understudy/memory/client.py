"""Unified Memory client — composes AMS, Vector Sets, LangCache.

This is what `apps/agent-template` and `apps/synthesis-worker` import. It handles the
full key-space from architecture.md §9 including the non-AMS keys (replay, dream, synth,
rate, lock) that don't fit the AMS/vector/cache abstractions.
"""

from __future__ import annotations

import json
import os
from typing import Any

import numpy as np
from numpy.typing import NDArray

from understudy.memory.ams import AgentMemoryServer
from understudy.memory.langcache import LangCache
from understudy.memory.schema import MemoryTurn, RecallResult
from understudy.memory.vector import VectorSets


def _default_redis() -> Any:
    import redis  # imported lazily so tests with fakeredis don't need real redis

    url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    return redis.Redis.from_url(url)


class MemoryClient:
    """Single import boundary for agents + synthesis worker.

    Usage:
        mem = MemoryClient(agent_id="export-shopify-orders")
        mem.record_turn("user", "export yesterday's orders as CSV")
        hits = mem.recall("similar prior exports", query_embedding=embed(...))
        resp, hit = mem.gemini_cached("synthesize my CSV export", "gemini-3-flash", call_fn)
    """

    def __init__(
        self,
        agent_id: str,
        *,
        redis_client: Any | None = None,
        gemini_client: Any | None = None,
        langcache_embedder: Any | None = None,
    ) -> None:
        self.agent_id = agent_id
        self.r = redis_client or _default_redis()
        self.ams = AgentMemoryServer(self.r, agent_id, gemini_client=gemini_client)
        self.vectors = VectorSets(self.r)
        self.langcache = LangCache(self.r, embedder=langcache_embedder)

    # --- AMS passthroughs -----------------------------------------------------

    def record_turn(
        self,
        role: str,
        content: str,
        *,
        meta: dict[str, Any] | None = None,
    ) -> str:
        turn = MemoryTurn(
            agent_id=self.agent_id,
            role=role,  # type: ignore[arg-type]
            content=content,
            meta=meta or {},
        )
        return self.ams.append_turn(turn)

    def recent_turns(self, limit: int = 20) -> list[MemoryTurn]:
        return self.ams.recent_turns(limit=limit)

    # --- vector recall --------------------------------------------------------

    def remember_embedding(
        self,
        memory_id: str,
        embedding: NDArray[np.float32],
        *,
        summary: str = "",
    ) -> None:
        meta = {"summary": summary} if summary else None
        self.vectors.add_memory(self.agent_id, memory_id, embedding, metadata=meta)

    def recall(
        self,
        query_embedding: NDArray[np.float32],
        *,
        k: int = 5,
    ) -> list[RecallResult]:
        hits = self.vectors.similar(self.agent_id, query_embedding, k=k)
        return [
            RecallResult(
                agent_id=self.agent_id, memory_id=name, score=score, summary=""
            )
            for name, score in hits
        ]

    # --- LangCache ------------------------------------------------------------

    def gemini_cached(
        self,
        prompt: str,
        model: str,
        call_fn: Any,
        *,
        ttl_s: int | None = None,
    ) -> tuple[str, Any]:
        from understudy.memory.langcache import gemini_cached as _gc

        return _gc(
            self.langcache,
            call_fn,
            prompt,
            model,
            agent=self.agent_id,
            ttl_s=ttl_s,
        )

    # --- non-AMS keys from architecture.md §9 ---------------------------------

    def store_synth_trace(self, run_id: str, event: dict[str, Any]) -> str:
        sid = self.r.xadd(f"run:synth:{run_id}", {"event": json.dumps(event)})
        return sid.decode() if isinstance(sid, bytes) else str(sid)

    def store_dream_query(self, run_id: str, payload: dict[str, Any]) -> None:
        self.r.hset(
            f"dream:{run_id}",
            mapping={k: json.dumps(v) if not isinstance(v, str) else v for k, v in payload.items()},
        )

    def get_dream_query(self, run_id: str) -> dict[str, Any]:
        raw = self.r.hgetall(f"dream:{run_id}") or {}
        out: dict[str, Any] = {}
        for k, v in raw.items():
            key = k.decode() if isinstance(k, bytes) else k
            val = v.decode() if isinstance(v, bytes) else v
            try:
                out[key] = json.loads(val)
            except (json.JSONDecodeError, TypeError):
                out[key] = val
        return out

    def push_keyframe(self, synth_id: str, frame_b64: str) -> None:
        self.r.rpush(f"us:synth:{synth_id}:frames", frame_b64)

    def acquire_deploy_lock(self, agent_id: str, ttl_s: int = 300) -> bool:
        ok = self.r.set(f"us:lock:deploy:{agent_id}", "1", nx=True, ex=ttl_s)
        return bool(ok)

    def store_replay(self, synth_id: str, payload: dict[str, Any]) -> None:
        """Hermetic demo replay (architecture.md §14)."""
        self.r.set(f"us:replay:{synth_id}", json.dumps(payload))

    def get_replay(self, synth_id: str) -> dict[str, Any] | None:
        raw = self.r.get(f"us:replay:{synth_id}")
        if not raw:
            return None
        return json.loads(raw.decode() if isinstance(raw, bytes) else raw)

    def consume_rate_token(self, model: str, limit: int, window_s: int) -> bool:
        """Simple counter + TTL token bucket for `rate:gemini:{model}`."""
        key = f"rate:gemini:{model}"
        n = self.r.incr(key)
        if n == 1:
            self.r.expire(key, window_s)
        return int(n) <= limit

    # --- dump (CLI) -----------------------------------------------------------

    def dump(self) -> dict[str, Any]:
        return {
            "agent_id": self.agent_id,
            "recent_turns": [t.model_dump(mode="json") for t in self.recent_turns()],
            "topics": self.ams.get_topics().topics,
            "entities": [e.model_dump(mode="json") for e in self.ams.list_entities()],
            "ltm": [r.model_dump(mode="json") for r in self.ams.ltm_records()],
            "vector_count": self.vectors.card(self.agent_id),
        }
