"""Concrete Cosmo MCP clients — stdio (`wgc`) and Cloud MCP Gateway (HTTP).

Both implement `CosmoMCPClient`. The stdio variant shells out to the `wgc` CLI exactly
like the Cosmo MCP docs prescribe; the cloud variant POSTs JSON-RPC to the Cosmo Cloud
gateway. A third `CosmoMockMCP` is wired from `driver.py` when `COSMO_MOCK=1` so the
stage demo works offline (architecture.md §14 hermetic mode + §18 risk #2).

Auth tokens are never echoed to stdout — a non-negotiable for the on-stage terminal
walkthrough. If `wgc` prints the token in its banner we strip it out in `_sanitize`.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
from pathlib import Path
from typing import Any

import httpx

_TOKEN_RE = re.compile(r"(Bearer\s+)[A-Za-z0-9._\-]+", re.IGNORECASE)


def _sanitize(text: str) -> str:
    """Redact bearer tokens from anything we might surface during the stage demo."""
    return _TOKEN_RE.sub(r"\1<redacted>", text)


class CosmoStdioMCP:
    """Runs the `wgc` Cosmo MCP CLI as a stdio JSON-RPC server.

    We keep the transport intentionally small — one long-lived subprocess, line-delimited
    JSON-RPC 2.0. This matches how MCP stdio servers are spoken to in practice and keeps
    the code testable by substituting any process that reads/writes the same envelope.
    """

    def __init__(self, command: list[str] | None = None, cwd: str | None = None) -> None:
        self._command = command or ["wgc", "mcp", "serve", "--stdio"]
        self._cwd = cwd
        self._proc: asyncio.subprocess.Process | None = None
        self._request_id = 0
        self._lock = asyncio.Lock()

    async def _ensure_started(self) -> asyncio.subprocess.Process:
        if self._proc is not None and self._proc.returncode is None:
            return self._proc
        self._proc = await asyncio.create_subprocess_exec(
            *self._command,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=self._cwd,
        )
        return self._proc

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        proc = await self._ensure_started()
        assert proc.stdin is not None and proc.stdout is not None

        async with self._lock:
            self._request_id += 1
            request = {
                "jsonrpc": "2.0",
                "id": self._request_id,
                "method": "tools/call",
                "params": {"name": name, "arguments": arguments},
            }
            payload = (json.dumps(request) + "\n").encode("utf-8")
            proc.stdin.write(payload)
            await proc.stdin.drain()

            line = await proc.stdout.readline()
            if not line:
                stderr = b""
                if proc.stderr is not None:
                    try:
                        stderr = await asyncio.wait_for(proc.stderr.read(512), timeout=0.1)
                    except asyncio.TimeoutError:
                        pass
                raise RuntimeError(
                    f"cosmo mcp stdio closed unexpectedly: {_sanitize(stderr.decode(errors='replace'))}"
                )
            response = json.loads(line.decode("utf-8"))

        if "error" in response:
            raise RuntimeError(f"cosmo mcp error: {response['error']}")
        return response.get("result", {})

    async def close(self) -> None:
        if self._proc is None:
            return
        if self._proc.returncode is None:
            try:
                self._proc.terminate()
                await asyncio.wait_for(self._proc.wait(), timeout=2.0)
            except (ProcessLookupError, asyncio.TimeoutError):
                self._proc.kill()
        self._proc = None


class CosmoCloudMCP:
    """HTTP fallback — Cosmo Cloud exposes the same tool surface over JSON-RPC.

    Kept deliberately thin: one POST per tool call, bearer auth via `COSMO_API_TOKEN`.
    We never log the token; errors only surface sanitized stderr-equivalents.
    """

    def __init__(
        self,
        gateway_url: str | None = None,
        api_token: str | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._url = gateway_url or os.environ.get(
            "COSMO_CLOUD_MCP_URL", "https://cosmo-mcp.wundergraph.com/v1/rpc"
        )
        self._token = api_token or os.environ.get("COSMO_API_TOKEN", "")
        self._client = client or httpx.AsyncClient(timeout=30.0)
        self._owns_client = client is None
        self._request_id = 0

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        self._request_id += 1
        headers = {"content-type": "application/json"}
        if self._token:
            headers["authorization"] = f"Bearer {self._token}"
        body = {
            "jsonrpc": "2.0",
            "id": self._request_id,
            "method": "tools/call",
            "params": {"name": name, "arguments": arguments},
        }
        resp = await self._client.post(self._url, json=body, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            raise RuntimeError(f"cosmo cloud mcp error: {data['error']}")
        return data.get("result", {})

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()


class CosmoMockMCP:
    """Deterministic fixture-backed client for `COSMO_MOCK=1` / hermetic demo mode.

    Loads JSON fixtures from `fixtures/cosmo/` and routes tool calls to them. The fixture
    picked for `dream_query` is chosen by substring match on `desired_operation` so the
    demo script (`orders` vs `products`) produces the right SDL delta end-to-end.
    """

    def __init__(self, fixtures_dir: Path | str | None = None) -> None:
        if fixtures_dir is None:
            repo_root = Path(__file__).resolve().parents[2]
            fixtures_dir = repo_root / "fixtures" / "cosmo"
        self._dir = Path(fixtures_dir)

    def _load(self, name: str) -> dict[str, Any]:
        path = self._dir / f"{name}.json"
        if not path.exists():
            raise FileNotFoundError(f"cosmo fixture missing: {path}")
        return json.loads(path.read_text())

    def _pick_dream_fixture(self, desired_operation: str) -> dict[str, Any]:
        lowered = desired_operation.lower()
        if "mutation" in lowered or "product" in lowered or "create" in lowered:
            return self._load("products-mutation")
        return self._load("orders-query")

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        if name == "dream_query":
            fixture = self._pick_dream_fixture(arguments.get("desired_operation", ""))
            return fixture["dream_query"]
        if name == "validate_against_live_traffic":
            return {
                "has_breaking_changes": False,
                "affected_clients": [],
                "severity": "none",
                "client_ops_evaluated": 4_200,
            }
        if name == "schema_change_proposal_workflow":
            subgraph_name = arguments.get("subgraph_name", "agent_unnamed")
            return {
                "subgraph_id": f"sg_{subgraph_name}_mock",
                "version": "v1.0.0",
                "composition_check": True,
                "composed_supergraph_url": "https://cosmo.local/studio/supergraph/mock",
            }
        if name == "register_edfs_events":
            fields = arguments.get("fields", [])
            return {
                "topic_bindings": [
                    {
                        "field": field,
                        "topic": f"understudy.events.{field}",
                        "transport": "kafka",
                    }
                    for field in fields
                ],
                "broker": "kafka://edfs.cosmo.local:9092",
            }
        raise ValueError(f"CosmoMockMCP: unknown tool {name!r}")

    async def close(self) -> None:
        return None
