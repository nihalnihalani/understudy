"""CosmoWriter writes ConnectRPC artifacts + Trusted Documents, soft-fails offline."""

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

CONNECT_BASE = "http://localhost:5026/agent_orders.v1.AgentOrders"


@pytest.mark.asyncio
async def test_replay_mode_returns_canned_endpoints_and_skips_wgc(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("DEMO_MODE", "replay")
    redis = fakeredis.aioredis.FakeRedis()

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
    # No canned endpoints in Redis -> writer falls back to default URL shape.
    assert result.endpoints["grpc"] == CONNECT_BASE
    assert result.endpoints["graphql"].endswith("/graphql")
    assert result.wgc_skipped is True
    assert result.proto_generated is False
    # Replay branch must mirror endpoints to the canonical key so /agents/{id}/protocols
    # resolves in replay mode (invariant #2 hermeticity).
    cached = await redis.hget("us:agent:agent_orders:protocols", "endpoints")
    assert cached is not None
    assert json.loads(cached)["grpc"] == CONNECT_BASE


@pytest.mark.asyncio
async def test_live_mode_writes_files_and_calls_wgc_operations_push(
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
    assert any("--client" in argv and "agent_orders" in argv for argv in invocations)
    cached = await redis.hget("us:agent:agent_orders:protocols", "endpoints")
    assert cached is not None
    assert result.wgc_skipped is False
    # SDL not provided -> grpc-service generate didn't run.
    assert result.proto_generated is False


@pytest.mark.asyncio
async def test_live_mode_with_sdl_runs_grpc_service_generate(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("DEMO_MODE", "live")
    monkeypatch.setenv("COSMO_API_KEY", "test-key")
    redis = fakeredis.aioredis.FakeRedis()
    sdl = tmp_path / "agent_orders.graphql"
    sdl.write_text("type Query { orders: [String!]! }\n")
    services_dir = tmp_path / "services"

    invocations: list[list[str]] = []

    async def fake_runner(argv: list[str]) -> tuple[int, str, str]:
        invocations.append(argv)
        return 0, "ok", ""

    result = await push_trusted_documents(
        agent_name="agent_orders",
        synth_id="s1",
        documents=DOCS,
        operations_dir=tmp_path / "ops",
        sdl_path=sdl,
        services_dir=services_dir,
        redis=redis,
        runner=fake_runner,
    )
    # Both wgc subcommands ran.
    assert any(argv[:3] == ["wgc", "operations", "push"] for argv in invocations)
    assert any(argv[:3] == ["wgc", "grpc-service", "generate"] for argv in invocations)
    # Generate call had right service name + package + with-operations flag.
    gen_argv = next(a for a in invocations if a[:3] == ["wgc", "grpc-service", "generate"])
    assert "AgentOrders" in gen_argv  # PascalCase service name
    assert "agent_orders.v1" in gen_argv  # snake_case.v1 package
    assert "--with-operations" in gen_argv
    assert result.wgc_skipped is False
    assert result.proto_generated is True


@pytest.mark.asyncio
async def test_live_mode_offline_wgc_failure_is_soft(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("DEMO_MODE", "live")
    monkeypatch.setenv("COSMO_API_KEY", "test-key")
    redis = fakeredis.aioredis.FakeRedis()

    async def failing_runner(_argv: list[str]) -> tuple[int, str, str]:
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
