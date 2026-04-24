"""Redis LangCache — semantic cache in front of Gemini calls.

Flow (architecture.md §15, 2:30-2:40 beat):
  1. Embed the prompt locally (cached).
  2. VSIM against `langcache:gemini:embeddings` for nearest neighbor.
  3. If similarity > 0.95 → return cached response (<50ms target).
  4. Else → call Gemini, store response in `langcache:gemini:{hash}` + VADD embedding.

The embedding function is injected — tests pass a deterministic hash-based embedder so
they are hermetic. Production wires in a real sentence-transformer loaded once per process
(no HTTP on the hot path).
"""

from __future__ import annotations

import hashlib
import json
import time
from typing import Any, Callable, Protocol

import numpy as np
from numpy.typing import NDArray

from understudy.memory.schema import CacheHit
from understudy.memory.vector import quantize_int8


SIMILARITY_THRESHOLD = 0.95
LANGCACHE_VSET_KEY = "langcache:gemini:embeddings"


class Embedder(Protocol):
    def __call__(self, text: str) -> NDArray[np.float32]: ...


def _default_hash_embed(text: str, dim: int = 64) -> NDArray[np.float32]:
    """Deterministic hash-based embedding for tests and the demo seed.

    Not a semantic embedder — only gives equality hits. Swap for a real
    sentence-transformer in production via the `embedder` ctor arg.
    """
    h = hashlib.sha256(text.encode("utf-8")).digest()
    expanded = (h * ((dim // len(h)) + 1))[:dim]
    arr = np.frombuffer(expanded, dtype=np.uint8).astype(np.float32)
    arr = (arr - 127.5) / 127.5
    norm = np.linalg.norm(arr)
    if norm > 0:
        arr = arr / norm
    return arr.astype(np.float32)


def prompt_hash(prompt: str, model: str) -> str:
    return hashlib.sha256(f"{model}::{prompt}".encode()).hexdigest()[:32]


class LangCache:
    """Semantic cache keyed by (model, prompt) with int8 Vector Set for NN lookup."""

    def __init__(
        self,
        redis_client: Any,
        *,
        embedder: Embedder | None = None,
        similarity_threshold: float = SIMILARITY_THRESHOLD,
    ) -> None:
        self.r = redis_client
        self.embed = embedder or _default_hash_embed
        self.threshold = similarity_threshold
        self._local_embed_cache: dict[str, NDArray[np.float32]] = {}

    def _embed_cached(self, text: str) -> NDArray[np.float32]:
        if text in self._local_embed_cache:
            return self._local_embed_cache[text]
        v = self.embed(text)
        self._local_embed_cache[text] = v
        return v

    def _key_response(self, agent: str | None, h: str) -> str:
        if agent:
            # architecture.md §13 (LangCache poisoning) — per-agent namespace prevents cross-bleed.
            return f"langcache:gemini:{agent}:{h}"
        return f"langcache:gemini:{h}"

    def _key_config(self, agent: str) -> str:
        return f"langcache:config:{agent}"

    def lookup(
        self, prompt: str, model: str, *, agent: str | None = None
    ) -> CacheHit | None:
        start = time.perf_counter()
        h = prompt_hash(prompt, model)

        # Fast path: exact-hash hit skips the VSIM round trip.
        exact = self.r.get(self._key_response(agent, h))
        if exact:
            payload = json.loads(exact.decode() if isinstance(exact, bytes) else exact)
            return CacheHit(
                prompt_hash=h,
                model=model,
                response=payload["response"],
                similarity=1.0,
                latency_ms=(time.perf_counter() - start) * 1000.0,
            )

        # Semantic path: VSIM.
        q = self._embed_cached(prompt)
        try:
            raw = self.r.execute_command(
                "VSIM",
                LANGCACHE_VSET_KEY,
                "VALUES",
                str(len(q)),
                ",".join(str(int(x)) for x in quantize_int8(q).tolist()),
                "WITHSCORES",
                "COUNT",
                "1",
            )
        except Exception:
            raw = None
        if not raw:
            return None

        member = raw[0]
        score = float(raw[1]) if len(raw) > 1 else 0.0
        if score < self.threshold:
            return None

        member_hash = member.decode() if isinstance(member, bytes) else str(member)
        cached = self.r.get(self._key_response(agent, member_hash))
        if not cached:
            return None
        payload = json.loads(cached.decode() if isinstance(cached, bytes) else cached)
        return CacheHit(
            prompt_hash=member_hash,
            model=payload.get("model", model),
            response=payload["response"],
            similarity=score,
            latency_ms=(time.perf_counter() - start) * 1000.0,
        )

    def store(
        self,
        prompt: str,
        model: str,
        response: str,
        *,
        agent: str | None = None,
        ttl_s: int | None = None,
    ) -> str:
        h = prompt_hash(prompt, model)
        payload = json.dumps({"model": model, "response": response, "prompt": prompt})
        key = self._key_response(agent, h)
        if ttl_s:
            self.r.set(key, payload, ex=ttl_s)
        else:
            self.r.set(key, payload)

        q = self._embed_cached(prompt)
        try:
            self.r.execute_command(
                "VADD",
                LANGCACHE_VSET_KEY,
                "VALUES",
                str(len(q)),
                ",".join(str(int(x)) for x in quantize_int8(q).tolist()),
                h,
                "Q8",
            )
        except Exception:
            # If Vector Sets aren't available we still have the exact-hash path.
            pass
        return h

    def set_policy(self, agent: str, policy: dict[str, Any]) -> None:
        """Write per-agent cache policy to `langcache:config:{agent}` Hash."""
        mapping = {k: json.dumps(v) if not isinstance(v, str) else v for k, v in policy.items()}
        self.r.hset(self._key_config(agent), mapping=mapping)


def gemini_cached(
    cache: LangCache,
    gemini_call: Callable[[str, str], str],
    prompt: str,
    model: str,
    *,
    agent: str | None = None,
    ttl_s: int | None = None,
) -> tuple[str, CacheHit | None]:
    """Public API for the synthesis worker: cache-first Gemini invocation.

    Returns (response_text, cache_hit_or_None). If cache_hit is None, a fresh call was made.
    """
    hit = cache.lookup(prompt, model, agent=agent)
    if hit is not None:
        return hit.response, hit
    response = gemini_call(prompt, model)
    cache.store(prompt, model, response, agent=agent, ttl_s=ttl_s)
    return response, None
