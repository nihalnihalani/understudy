"""Integration tests for the Cosmo MCP driver.

Covers the full Dream Query loop end-to-end against:

1. a real subprocess running `mock_stdio_server.py` (exercises `CosmoStdioMCP`)
2. the offline `CosmoMockMCP` fixture client
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from typing import Any

import pytest

ROOT = Path(__file__).resolve().parents[3]
DRIVER_DIR = ROOT / "apps" / "cosmo-mcp-driver"

sys.path.insert(0, str(DRIVER_DIR))

from clients import CosmoMockMCP, CosmoStdioMCP  # type: ignore[import-not-found]
from driver import CosmoDreamQuery  # type: ignore[import-not-found]


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
