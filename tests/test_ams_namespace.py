"""AMS namespace isolation — agent A's client must not read agent B's keys.

Backs the architecture.md §13 LangCache-poisoning mitigation ("per-agent namespaces")
and the §9 `ams:agent:{id}:*` keyspace invariant.
"""

from __future__ import annotations

import pytest

from understudy.memory.ams import AgentMemoryServer
from understudy.memory.schema import MemoryTurn


def _turn(agent: str, content: str) -> MemoryTurn:
    return MemoryTurn(agent_id=agent, role="user", content=content)


def test_keys_are_prefixed_with_agent_id(fake_redis):
    ams = AgentMemoryServer(fake_redis, "alpha")
    ams.append_turn(_turn("alpha", "hello from Acme Corp"))

    keys = {k.decode() if isinstance(k, bytes) else k for k in fake_redis.keys("*")}
    assert any(k.startswith("ams:agent:alpha:") for k in keys)
    assert not any(k.startswith("ams:agent:beta:") for k in keys)


def test_agent_b_client_cannot_see_agent_a_turns(fake_redis):
    ams_a = AgentMemoryServer(fake_redis, "alpha")
    ams_b = AgentMemoryServer(fake_redis, "beta")

    ams_a.append_turn(_turn("alpha", "export Shopify orders"))
    ams_a.append_turn(_turn("alpha", "filter by fulfilled status"))

    assert len(ams_a.recent_turns()) == 2
    assert len(ams_b.recent_turns()) == 0
    assert ams_b.get_topics().topics == []
    assert ams_b.list_entities() == []


def test_agent_b_client_cannot_see_agent_a_entities(fake_redis):
    ams_a = AgentMemoryServer(fake_redis, "alpha")
    ams_b = AgentMemoryServer(fake_redis, "beta")

    ams_a.append_turn(_turn("alpha", "Acme Corp filed on 2026-04-15 for $1,200"))
    a_entities = {e.entity for e in ams_a.list_entities()}
    assert a_entities  # something got extracted

    b_entities = {e.entity for e in ams_b.list_entities()}
    assert b_entities == set()


def test_turn_agent_id_must_match_client(fake_redis):
    ams = AgentMemoryServer(fake_redis, "alpha")
    with pytest.raises(ValueError):
        ams.append_turn(_turn("beta", "should be rejected"))


def test_rejects_invalid_agent_ids(fake_redis):
    for bad in ("", "has:colon", "has*star"):
        with pytest.raises(ValueError):
            AgentMemoryServer(fake_redis, bad)


def test_stm_caps_at_20_and_rotates_to_ltm(fake_redis):
    ams = AgentMemoryServer(fake_redis, "alpha", stm_cap=5)
    for i in range(10):
        ams.append_turn(_turn("alpha", f"turn number {i}"))

    # STM capped.
    assert len(ams.recent_turns(limit=100)) <= 5
    # Something was rotated to LTM once we exceeded the cap.
    assert len(ams.ltm_records()) >= 1


def test_wipe_only_touches_this_agents_keys(fake_redis):
    ams_a = AgentMemoryServer(fake_redis, "alpha")
    ams_b = AgentMemoryServer(fake_redis, "beta")
    ams_a.append_turn(_turn("alpha", "alpha content"))
    ams_b.append_turn(_turn("beta", "beta content"))

    ams_a.wipe()
    assert ams_a.recent_turns() == []
    assert len(ams_b.recent_turns()) == 1
