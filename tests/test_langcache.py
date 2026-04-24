"""LangCache exact-hash hits and `gemini_cached` wrapper.

Vector-similarity (VSIM) path is not exercised here because fakeredis doesn't
implement Redis 8 Vector Set verbs. The exact-hash path is what backs the
"repeated query <50ms" demo beat (architecture.md §15 2:30-2:40).
"""

from __future__ import annotations

from understudy.memory.langcache import LangCache, gemini_cached


def test_store_then_exact_hit(fake_redis):
    cache = LangCache(fake_redis)
    cache.store("export orders", "gemini-3-flash", "```ts\n// script\n```", agent="demo")

    hit = cache.lookup("export orders", "gemini-3-flash", agent="demo")
    assert hit is not None
    assert hit.response.startswith("```ts")
    assert hit.similarity == 1.0
    assert hit.latency_ms >= 0  # some positive latency recorded


def test_miss_returns_none(fake_redis):
    cache = LangCache(fake_redis)
    assert cache.lookup("nothing stored", "gemini-3-flash") is None


def test_per_agent_namespace_isolation(fake_redis):
    cache = LangCache(fake_redis)
    cache.store("same prompt", "gemini-3-flash", "alpha response", agent="alpha")
    cache.store("same prompt", "gemini-3-flash", "beta response", agent="beta")

    assert cache.lookup("same prompt", "gemini-3-flash", agent="alpha").response == "alpha response"
    assert cache.lookup("same prompt", "gemini-3-flash", agent="beta").response == "beta response"


def test_gemini_cached_calls_upstream_on_miss_then_hits(fake_redis):
    cache = LangCache(fake_redis)
    calls = []

    def fake_call(prompt: str, model: str) -> str:
        calls.append((prompt, model))
        return f"fresh-response-for-{prompt}"

    resp1, hit1 = gemini_cached(cache, fake_call, "make a script", "gemini-3-flash")
    assert hit1 is None
    assert resp1 == "fresh-response-for-make a script"
    assert len(calls) == 1

    resp2, hit2 = gemini_cached(cache, fake_call, "make a script", "gemini-3-flash")
    assert hit2 is not None
    assert resp2 == resp1
    assert len(calls) == 1  # upstream not called again


def test_latency_under_50ms_target_for_exact_hit(fake_redis):
    cache = LangCache(fake_redis)
    cache.store("export", "gemini-3-flash", "r", agent="demo")
    hit = cache.lookup("export", "gemini-3-flash", agent="demo")
    assert hit is not None
    # Exact-hash hit has no embedding work + no VSIM — must comfortably beat 50ms.
    assert hit.latency_ms < 50.0, f"exact hit latency {hit.latency_ms:.1f}ms exceeds 50ms target"
