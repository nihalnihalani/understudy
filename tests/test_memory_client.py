"""MemoryClient composition + non-AMS key-space coverage (architecture.md §9)."""

from __future__ import annotations

from understudy.memory.client import MemoryClient


def test_dump_shape(fake_redis):
    mem = MemoryClient(agent_id="demo", redis_client=fake_redis)
    mem.record_turn("user", "export yesterday's Shopify orders to CSV")
    mem.record_turn("agent", "exported 142 rows to orders.csv")

    dump = mem.dump()
    assert dump["agent_id"] == "demo"
    assert len(dump["recent_turns"]) == 2
    assert isinstance(dump["topics"], list)
    assert isinstance(dump["entities"], list)
    assert isinstance(dump["ltm"], list)


def test_store_and_get_dream_query(fake_redis):
    mem = MemoryClient(agent_id="demo", redis_client=fake_redis)
    mem.store_dream_query(
        "run-1",
        {
            "desired_operation": "query { shopifyOrders { id } }",
            "sdl_delta": "extend type Query { shopifyOrders: [Order!]! }",
        },
    )
    got = mem.get_dream_query("run-1")
    assert got["desired_operation"] == "query { shopifyOrders { id } }"
    assert "sdl_delta" in got


def test_replay_roundtrip(fake_redis):
    mem = MemoryClient(agent_id="demo", redis_client=fake_redis)
    payload = {"stages": {"script_emission": {"latency_ms": 2940}}}
    mem.store_replay("synth-1", payload)
    assert mem.get_replay("synth-1") == payload
    assert mem.get_replay("does-not-exist") is None


def test_deploy_lock_is_exclusive(fake_redis):
    mem = MemoryClient(agent_id="deployer", redis_client=fake_redis)
    assert mem.acquire_deploy_lock("agent-a") is True
    assert mem.acquire_deploy_lock("agent-a") is False


def test_rate_token_enforces_limit(fake_redis):
    mem = MemoryClient(agent_id="deployer", redis_client=fake_redis)
    for _ in range(3):
        assert mem.consume_rate_token("gemini-3-flash", limit=3, window_s=60) is True
    assert mem.consume_rate_token("gemini-3-flash", limit=3, window_s=60) is False


def test_push_keyframe_appends(fake_redis):
    mem = MemoryClient(agent_id="demo", redis_client=fake_redis)
    mem.push_keyframe("synth-1", "base64frame-a")
    mem.push_keyframe("synth-1", "base64frame-b")
    raw = fake_redis.lrange("us:synth:synth-1:frames", 0, -1)
    vals = [r.decode() if isinstance(r, bytes) else r for r in raw]
    assert vals == ["base64frame-a", "base64frame-b"]


def test_synth_trace_stream(fake_redis):
    mem = MemoryClient(agent_id="demo", redis_client=fake_redis)
    mem.store_synth_trace("run-1", {"stage": "action_detection", "latency_ms": 1240})
    assert fake_redis.xlen("run:synth:run-1") == 1
