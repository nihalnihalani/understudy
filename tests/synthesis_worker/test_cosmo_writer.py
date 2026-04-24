"""CosmoWriter writes trusted ops to disk + Redis, no-ops gracefully when wgc unavailable."""

from __future__ import annotations

import json
from pathlib import Path

import fakeredis.aioredis
import pytest

from cosmo_writer import push_trusted_documents  # noqa: E402  (sys.path injected by conftest)
from trusted_documents import TrustedDocument  # noqa: E402

DOCS = [
    TrustedDocument(
        name="Orders",
        operation_type="query",
        field_name="orders",
        body="query Orders { orders { id } }\n",
    ),
    TrustedDocument(
        name="ExportOrdersCsv",
        operation_type="mutation",
        field_name="exportOrdersCsv",
        body="mutation ExportOrdersCsv { exportOrdersCsv { id } }\n",
    ),
]


@pytest.mark.asyncio
async def test_replay_mode_returns_canned_endpoints_and_skips_wgc(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("DEMO_MODE", "replay")
    redis = fakeredis.aioredis.FakeRedis()
    await redis.hset(
        "us:replay:s1:protocols",
        mapping={
            "endpoints": json.dumps(
                {
                    "graphql": "http://localhost:4000/graphql",
                    "grpc": "http://localhost:4000/connect/agent_orders",
                    "rest": "http://localhost:4000/connect/agent_orders/json",
                    "openapi": "http://localhost:4000/connect/agent_orders/openapi.json",
                }
            )
        },
    )
    async def runner_must_not_fire(_argv: list[str]) -> tuple[int, str, str]:
        raise AssertionError("wgc must not be invoked in replay mode")

    result = await push_trusted_documents(
        agent_name="agent_orders",
        synth_id="s1",
        documents=DOCS,
        operations_dir=tmp_path,
        redis=redis,
        runner=runner_must_not_fire,
    )
    assert result.endpoints["grpc"].endswith("/connect/agent_orders")
    assert result.wgc_skipped is True
    # The replay branch must mirror endpoints to the canonical key so the
    # /agents/{id}/protocols API resolves in replay mode (invariant #2).
    cached = await redis.hget("us:agent:agent_orders:protocols", "endpoints")
    assert cached is not None
    assert "agent_orders" in json.loads(cached)["grpc"]


@pytest.mark.asyncio
async def test_live_mode_writes_files_and_calls_wgc(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("DEMO_MODE", "live")
    monkeypatch.setenv("COSMO_API_KEY", "test-key")
    redis = fakeredis.aioredis.FakeRedis()
    invocations: list[list[str]] = []

    async def fake_runner(argv: list[str]) -> tuple[int, str, str]:
        invocations.append(argv)
        return 0, "ok", ""

    result = await push_trusted_documents(
        agent_name="agent_orders",
        synth_id="s1",
        documents=DOCS,
        operations_dir=tmp_path,
        redis=redis,
        runner=fake_runner,
    )
    written = sorted(p.name for p in (tmp_path / "agent_orders").iterdir())
    assert written == ["ExportOrdersCsv.graphql", "Orders.graphql"]
    assert any(argv[:3] == ["wgc", "operations", "push"] for argv in invocations)
    # The agent name lands in --client so the federated graph stays one logical entity.
    assert any("--client" in argv and "agent_orders" in argv for argv in invocations)
    cached = await redis.hget("us:agent:agent_orders:protocols", "endpoints")
    assert cached is not None  # we cached the endpoint set for /agents/{id}/protocols
    assert result.wgc_skipped is False


@pytest.mark.asyncio
async def test_live_mode_offline_wgc_failure_is_soft(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("DEMO_MODE", "live")
    monkeypatch.setenv("COSMO_API_KEY", "test-key")
    redis = fakeredis.aioredis.FakeRedis()

    async def failing_runner(argv: list[str]) -> tuple[int, str, str]:
        return 127, "", "wgc: command not found"

    result = await push_trusted_documents(
        agent_name="agent_orders",
        synth_id="s1",
        documents=DOCS,
        operations_dir=tmp_path,
        redis=redis,
        runner=failing_runner,
    )
    # File-side write still succeeded.
    assert (tmp_path / "agent_orders" / "Orders.graphql").exists()
    # Endpoints still cached locally so the API can serve them.
    assert "graphql" in result.endpoints
    assert result.wgc_skipped is True
