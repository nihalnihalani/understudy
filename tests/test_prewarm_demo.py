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
    seed_ams,
    seed_dream,
    seed_langcache,
    seed_replay,
    seed_vectors,
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
