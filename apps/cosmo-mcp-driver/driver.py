"""`CosmoDreamQuery` — the high-level driver the synthesizer calls into.

Four methods, each a thin shell over a single Cosmo MCP tool call (architecture.md §4
sequence diagram):

1. `dream_query(desired_operation)` — *"here is the query the agent wants to run"*
2. `validate_against_live_traffic(sdl_delta)` — breaking-change report vs client traffic
3. `propose_schema_change(sdl_delta, subgraph_name)` — propose → compose → publish
4. `register_edfs_events(fields)` — bind EDFS Kafka/NATS topics

Every `dream_query` result lands in Redis under `dream:{run_id}` per §9 key-space so the
synthesis-worker (task #3) and the API (task #2) can replay the result without re-calling
MCP. `COSMO_MOCK=1` routes through `CosmoMockMCP` for the hermetic demo.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass, field
from typing import Any

try:
    from .clients import CosmoCloudMCP, CosmoMockMCP, CosmoStdioMCP
    from .protocol import CosmoMCPClient
    from .redis_store import DreamStore
except ImportError:  # pragma: no cover — direct-script execution fallback (hyphen-dir)
    from clients import CosmoCloudMCP, CosmoMockMCP, CosmoStdioMCP  # type: ignore[no-redef]
    from protocol import CosmoMCPClient  # type: ignore[no-redef]
    from redis_store import DreamStore  # type: ignore[no-redef]


@dataclass
class SDLDelta:
    """Result of a `dream_query` call — SDL to add, resolver stubs to implement, confidence."""

    sdl_delta: str
    resolver_stubs: list[dict[str, Any]] = field(default_factory=list)
    confidence: float = 0.0
    desired_operation: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "sdl_delta": self.sdl_delta,
            "resolver_stubs": self.resolver_stubs,
            "confidence": self.confidence,
            "desired_operation": self.desired_operation,
        }


@dataclass
class BreakingChangeReport:
    """Result of a live-traffic validation run."""

    has_breaking_changes: bool
    affected_clients: list[str]
    severity: str
    client_ops_evaluated: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "has_breaking_changes": self.has_breaking_changes,
            "affected_clients": self.affected_clients,
            "severity": self.severity,
            "client_ops_evaluated": self.client_ops_evaluated,
        }


@dataclass
class SubgraphVersion:
    """Result of a `schema_change_proposal_workflow` run."""

    subgraph_id: str
    version: str
    composition_check: bool
    composed_supergraph_url: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "subgraph_id": self.subgraph_id,
            "version": self.version,
            "composition_check": self.composition_check,
            "composed_supergraph_url": self.composed_supergraph_url,
        }


@dataclass
class TopicBindings:
    """EDFS event-driven field bindings — one entry per field registered."""

    bindings: list[dict[str, str]]
    broker: str

    def to_dict(self) -> dict[str, Any]:
        return {"bindings": self.bindings, "broker": self.broker}


def _build_default_client() -> CosmoMCPClient:
    """Honor `COSMO_MOCK` first, then fall back stdio → cloud per the task brief."""
    if os.environ.get("COSMO_MOCK") == "1":
        return CosmoMockMCP()
    if os.environ.get("COSMO_TRANSPORT", "stdio").lower() == "cloud":
        return CosmoCloudMCP()
    return CosmoStdioMCP()


class CosmoDreamQuery:
    """High-level driver — one instance per synthesis run.

    The `run_id` ties every Dream Query result to the originating `SYNTHESIS_RUN` row
    (architecture.md §8 ER) and the `dream:{run_id}` Redis hash (§9 key-space). Callers
    that don't care about persistence can pass `store=None`.
    """

    def __init__(
        self,
        run_id: str,
        client: CosmoMCPClient | None = None,
        store: DreamStore | None = None,
    ) -> None:
        self.run_id = run_id
        self._client = client or _build_default_client()
        self._store = store if store is not None else DreamStore.from_env()
        self._last_sdl_delta: str | None = None

    async def dream_query(self, desired_operation: str) -> SDLDelta:
        """Run Cosmo MCP `dream_query` and persist the result under `dream:{run_id}`."""
        result = await self._client.call_tool(
            "dream_query", {"desired_operation": desired_operation}
        )
        delta = SDLDelta(
            sdl_delta=result["sdl_delta"],
            resolver_stubs=result.get("resolver_stubs", []),
            confidence=float(result.get("confidence", 0.0)),
            desired_operation=desired_operation,
        )
        self._last_sdl_delta = delta.sdl_delta
        if self._store is not None:
            await self._store.put(
                self.run_id,
                {
                    "desired_operation": desired_operation,
                    "sdl_delta": delta.sdl_delta,
                    "resolver_stubs": delta.resolver_stubs,
                    "confidence": delta.confidence,
                    "timestamp": int(time.time()),
                },
            )
        return delta

    async def validate_against_live_traffic(self, sdl_delta: str) -> BreakingChangeReport:
        """Run the MCP live-traffic validator over a proposed SDL delta."""
        result = await self._client.call_tool(
            "validate_against_live_traffic", {"sdl_delta": sdl_delta}
        )
        report = BreakingChangeReport(
            has_breaking_changes=bool(result.get("has_breaking_changes", False)),
            affected_clients=list(result.get("affected_clients", [])),
            severity=str(result.get("severity", "none")),
            client_ops_evaluated=int(result.get("client_ops_evaluated", 0)),
        )
        if self._store is not None:
            await self._store.update(
                self.run_id, {"validation_report": report.to_dict()}
            )
        return report

    async def propose_schema_change(
        self, sdl_delta: str, subgraph_name: str
    ) -> SubgraphVersion:
        """Run `schema_change_proposal_workflow` — propose → compose → publish."""
        result = await self._client.call_tool(
            "schema_change_proposal_workflow",
            {"sdl_delta": sdl_delta, "subgraph_name": subgraph_name},
        )
        version = SubgraphVersion(
            subgraph_id=str(result["subgraph_id"]),
            version=str(result["version"]),
            composition_check=bool(result.get("composition_check", False)),
            composed_supergraph_url=result.get("composed_supergraph_url"),
        )
        if self._store is not None:
            await self._store.update(
                self.run_id,
                {
                    "subgraph_id": version.subgraph_id,
                    "subgraph_version": version.version,
                    "composition_check": version.composition_check,
                },
            )
        return version

    async def register_edfs_events(self, fields: list[str]) -> TopicBindings:
        """Register EDFS Kafka/NATS topic bindings for event-driven resolver fields."""
        result = await self._client.call_tool(
            "register_edfs_events", {"fields": fields}
        )
        return TopicBindings(
            bindings=list(result.get("topic_bindings", [])),
            broker=str(result.get("broker", "")),
        )

    async def close(self) -> None:
        await self._client.close()
        if self._store is not None:
            await self._store.close()

    async def __aenter__(self) -> "CosmoDreamQuery":
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.close()
