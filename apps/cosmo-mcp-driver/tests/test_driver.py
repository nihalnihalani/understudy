"""Integration tests for the Cosmo MCP driver.

Covers the full Dream Query loop end-to-end against:

1. a real subprocess running `mock_stdio_server.py` (exercises `CosmoStdioMCP`)
2. the offline `CosmoMockMCP` fixture client
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import pytest

ROOT = Path(__file__).resolve().parents[3]
DRIVER_DIR = ROOT / "apps" / "cosmo-mcp-driver"

sys.path.insert(0, str(DRIVER_DIR))

from clients import CosmoMockMCP, CosmoStdioMCP  # type: ignore[import-not-found]  # noqa: E402
from driver import CosmoDreamQuery  # type: ignore[import-not-found]  # noqa: E402
from naming import (  # type: ignore[import-not-found]  # noqa: E402
    InvalidSubgraphName,
    default_routing_url,
    validate_subgraph_name,
)


class _FakeStore:
    """In-memory substitute for `DreamStore` — records what the driver wrote."""

    def __init__(self) -> None:
        self.writes: list[tuple[str, dict[str, Any]]] = []

    async def put(self, run_id: str, fields: dict[str, Any]) -> None:
        self.writes.append((run_id, dict(fields)))

    async def update(self, run_id: str, fields: dict[str, Any]) -> None:
        self.writes.append((run_id, dict(fields)))

    async def close(self) -> None:
        return None


def _stdio_server_command() -> list[str]:
    server = DRIVER_DIR / "tests" / "mock_stdio_server.py"
    return [sys.executable, str(server)]


@pytest.mark.asyncio
async def test_stdio_roundtrip_runs_full_dream_query_loop() -> None:
    client = CosmoStdioMCP(command=_stdio_server_command())
    store = _FakeStore()
    dq = CosmoDreamQuery(run_id="test-run-stdio", client=client, store=store)

    try:
        delta = await dq.dream_query("list latest reports for this week")
        assert "extend type Query" in delta.sdl_delta
        assert delta.confidence == pytest.approx(0.88)
        assert delta.resolver_stubs and delta.resolver_stubs[0]["field"] == "reports"

        report = await dq.validate_against_live_traffic(delta.sdl_delta)
        assert report.has_breaking_changes is False
        assert report.client_ops_evaluated == 1234

        version = await dq.propose_schema_change(delta.sdl_delta, "agent_reports")
        assert version.composition_check is True
        assert "agent_reports" in version.subgraph_id

        bindings = await dq.register_edfs_events(["reportCreated", "reportArchived"])
        assert len(bindings.bindings) == 2
        assert bindings.broker.startswith("kafka://")
    finally:
        await dq.close()

    persisted_runs = {run_id for run_id, _ in store.writes}
    assert persisted_runs == {"test-run-stdio"}
    assert any("sdl_delta" in fields for _, fields in store.writes)
    assert any("validation_report" in fields for _, fields in store.writes)
    assert any("subgraph_id" in fields for _, fields in store.writes)


@pytest.mark.asyncio
async def test_mock_fixtures_load_real_sdl() -> None:
    """`COSMO_MOCK=1` path must return parseable SDL, not placeholder strings."""
    client = CosmoMockMCP()
    dq = CosmoDreamQuery(run_id="test-run-mock", client=client, store=_FakeStore())

    try:
        orders = await dq.dream_query("export yesterday's orders as CSV")
        assert "OrderExport" in orders.sdl_delta
        assert "extend type Query" in orders.sdl_delta
        assert len(orders.resolver_stubs) >= 1

        products = await dq.dream_query("create or update a product listing")
        assert "upsertProduct" in products.sdl_delta
        assert "extend type Mutation" in products.sdl_delta
    finally:
        await dq.close()


@pytest.mark.asyncio
async def test_stdio_client_survives_multiple_sequential_calls() -> None:
    """Regression — one long-lived subprocess must handle N calls without restart."""
    client = CosmoStdioMCP(command=_stdio_server_command())

    try:
        for i in range(3):
            result = await client.call_tool("dream_query", {"desired_operation": f"op-{i}"})
            assert "sdl_delta" in result
    finally:
        await client.close()


def test_fixture_files_are_valid_json_with_required_keys() -> None:
    fixtures_dir = ROOT / "fixtures" / "cosmo"
    for fixture_path in (
        fixtures_dir / "orders-query.json",
        fixtures_dir / "products-mutation.json",
    ):
        data = json.loads(fixture_path.read_text())
        assert "dream_query" in data, f"{fixture_path} missing dream_query"
        dq = data["dream_query"]
        assert "sdl_delta" in dq and "resolver_stubs" in dq and "confidence" in dq
        assert dq["sdl_delta"].strip().startswith("extend type")


# ---------------------------------------------------------------------------
# Task #16 — router-engineer contract: naming, routing_url, register script
# ---------------------------------------------------------------------------


def test_valid_subgraph_names_pass() -> None:
    for name in ("agent_reports", "a", "x1", "x_y_z", "agent_orders_exporter"):
        validate_subgraph_name(name)


def test_invalid_subgraph_names_are_rejected() -> None:
    for name in ("Agent", "1agent", "agent-alpha", "agent.alpha", "", "UPPER"):
        with pytest.raises(InvalidSubgraphName):
            validate_subgraph_name(name)


def test_reserved_subgraph_names_are_rejected() -> None:
    for name in ("agent_alpha", "agent_beta", "agent_gamma"):
        with pytest.raises(InvalidSubgraphName):
            validate_subgraph_name(name)


def test_default_routing_url_matches_docker_network_convention() -> None:
    assert default_routing_url("agent_orders") == "http://agent_orders:4001/graphql"


@pytest.mark.asyncio
async def test_propose_schema_change_threads_routing_url_through_mcp() -> None:
    """The MCP tool call must receive routing_url as an argument so wgc publish can register it."""

    class RecordingClient:
        def __init__(self) -> None:
            self.calls: list[tuple[str, dict[str, Any]]] = []

        async def call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
            self.calls.append((name, dict(arguments)))
            return {
                "subgraph_id": "sg_test",
                "version": "v0.1.0",
                "composition_check": True,
                "composed_supergraph_url": "https://cosmo.test/sg",
            }

        async def close(self) -> None:
            return None

    client = RecordingClient()
    dq = CosmoDreamQuery(run_id="t-routing", client=client, store=_FakeStore())
    try:
        # Explicit routing URL survives unchanged.
        await dq.propose_schema_change("extend type Query { a: Int }", "agent_reports", "http://custom:9000/graphql")
        # Omitted routing URL falls back to the docker-network default.
        await dq.propose_schema_change("extend type Query { b: Int }", "agent_other")
    finally:
        await dq.close()

    assert len(client.calls) == 2
    assert client.calls[0][1]["routing_url"] == "http://custom:9000/graphql"
    assert client.calls[0][1]["subgraph_name"] == "agent_reports"
    assert client.calls[1][1]["routing_url"] == "http://agent_other:4001/graphql"


@pytest.mark.asyncio
async def test_propose_schema_change_rejects_invalid_name_before_calling_mcp() -> None:
    class ExplodingClient:
        async def call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
            raise AssertionError("MCP must not be called when the name is invalid")

        async def close(self) -> None:
            return None

    dq = CosmoDreamQuery(run_id="t-invalid", client=ExplodingClient(), store=None)
    try:
        with pytest.raises(InvalidSubgraphName):
            await dq.propose_schema_change("extend type Query { a: Int }", "Invalid-Name")
    finally:
        await dq.close()


def test_cli_register_shells_out_to_register_script(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """End-to-end CLI test: `register` should write the SDL file and invoke the script."""
    sys.path.insert(0, str(DRIVER_DIR))
    import cli  # type: ignore[import-not-found]

    # Stub the register script with one that just logs its arguments to a file.
    fake_script = tmp_path / "fake_register.sh"
    args_log = tmp_path / "args.log"
    fake_script.write_text(f"#!/usr/bin/env bash\nprintf '%s\\n' \"$@\" > {args_log}\nexit 0\n")
    fake_script.chmod(0o755)

    sdl_src = tmp_path / "incoming.graphql"
    sdl_src.write_text("extend type Query { hello: String! }\n")

    router_dir = tmp_path / "subgraphs"

    monkeypatch.setenv("COSMO_MOCK", "1")

    rc = cli.main(
        [
            "register",
            "--subgraph-name",
            "agent_reports",
            "--sdl",
            str(sdl_src),
            "--router-dir",
            str(router_dir),
            "--register-script",
            str(fake_script),
            "--routing-url",
            "http://agent_reports:4001/graphql",
        ]
    )

    assert rc == 0
    dest = router_dir / "agent_reports.graphql"
    assert dest.exists()
    assert dest.read_text() == sdl_src.read_text()
    # The fake script must have been invoked with the exact flags our contract promises.
    logged = args_log.read_text().splitlines()
    assert "--name" in logged and logged[logged.index("--name") + 1] == "agent_reports"
    assert "--routing-url" in logged and logged[logged.index("--routing-url") + 1] == "http://agent_reports:4001/graphql"
    assert "--sdl" in logged and Path(logged[logged.index("--sdl") + 1]) == dest


def test_cli_register_rejects_reserved_name(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    sys.path.insert(0, str(DRIVER_DIR))
    import cli  # type: ignore[import-not-found]

    sdl_src = tmp_path / "x.graphql"
    sdl_src.write_text("extend type Query { x: Int }\n")

    rc = cli.main(
        [
            "register",
            "--subgraph-name",
            "agent_alpha",
            "--sdl",
            str(sdl_src),
            "--router-dir",
            str(tmp_path / "subgraphs"),
            "--skip-script",
        ]
    )
    assert rc == 2
    err = capsys.readouterr().err
    assert "reserved" in err.lower()
