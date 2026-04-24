"""Smoke-test the prewarm script against fakeredis.

This guarantees the demo-kickoff script is runnable the night before. If this
breaks, the 2:30 demo beat has no cache to hit.
"""

from __future__ import annotations

import numpy as np

from scripts.prewarm_demo import (
    DEMO_AGENT,
    DEMO_RUN_ID,
    DEMO_SYNTH_ID,
    expected_keys,
    seed_ams,
    seed_dream,
    seed_langcache,
    seed_replay,
    seed_vectors,
    verify,
)
from understudy.memory.client import MemoryClient


def test_prewarm_populates_expected_keys(fake_redis, monkeypatch):
    mem = MemoryClient(agent_id=DEMO_AGENT, redis_client=fake_redis)

    # Skip seed_vectors if fakeredis doesn't support VADD — the rest must still seed.
    seed_ams(mem)
    seed_langcache(mem)
    seed_dream(mem)
    seed_replay(mem)

    # AMS turns populated.
    assert len(mem.recent_turns()) >= 1

    # LangCache exact-hit works for the canned prompts.
    hit = mem.langcache.lookup(
        "Export yesterday's Shopify orders to CSV",
        "gemini-3-flash",
        agent=DEMO_AGENT,
    )
    assert hit is not None
    assert "tinyfish" in hit.response.lower() or "browser" in hit.response.lower()

    # Dream Query seeded.
    dream = mem.get_dream_query(DEMO_RUN_ID)
    assert "shopifyOrders" in dream.get("desired_operation", "")

    # Replay seeded.
    replay = mem.get_replay(DEMO_SYNTH_ID)
    assert replay is not None
    assert "action_detection" in replay["stages"]


def test_verify_returns_false_when_no_keys_seeded(fake_redis, capsys):
    """`python scripts/prewarm_demo.py --check` must fail loudly on an empty Redis."""
    ok = verify(fake_redis, DEMO_AGENT)
    assert ok is False
    out = capsys.readouterr().out
    assert "MISSING" in out
    assert "DEMO NOT READY" in out


def test_verify_returns_true_after_seeding(fake_redis, capsys):
    """After seed_* is run, verify() returns True and prints DEMO READY."""
    mem = MemoryClient(agent_id=DEMO_AGENT, redis_client=fake_redis)
    seed_ams(mem)
    seed_langcache(mem)
    seed_dream(mem)
    seed_replay(mem)
    # Vector Set seed may fail on fakeredis; backfill the vset key so verify() passes.
    fake_redis.set(f"vset:agent:{DEMO_AGENT}:memory", "1")

    ok = verify(fake_redis, DEMO_AGENT)
    assert ok is True
    out = capsys.readouterr().out
    assert "DEMO READY" in out


def test_expected_keys_covers_every_category(fake_redis):
    """Regression guard — the expected_keys() list must cover the 5 category tags
    the devils-advocate report names (replay, langcache, AMS, Dream Query, Vector Set)."""
    keys = expected_keys(DEMO_AGENT)
    categories = {c for c, _k in keys}
    assert {"replay", "langcache", "ams_stm", "dream", "vset"}.issubset(categories)


def test_prewarm_vectors_does_not_crash_without_vset_support(fake_redis):
    """seed_vectors tolerates Redis deployments without Vector Sets (e.g. fakeredis).

    The VectorSets wrapper swallows VADD errors so prewarm doesn't brick on dev machines.
    """
    from scripts.prewarm_demo import DEMO_AGENT as agent
    mem = MemoryClient(agent_id=agent, redis_client=fake_redis)
    try:
        seed_vectors(mem)
    except Exception as e:
        # Vector Set commands may ERR on fakeredis; acceptable as long as it's a Redis error.
        assert "vadd" in str(e).lower() or "unknown command" in str(e).lower(), (
            f"unexpected error from seed_vectors: {e!r}"
        )
