"""Tiny JSON-RPC stdio server that impersonates `wgc mcp serve --stdio` for tests.

Reads one JSON-RPC line per request on stdin, writes one JSON-RPC line per response on
stdout. Canned responses shaped to architecture.md §4 — nothing fancy, just enough to
drive `CosmoStdioMCP` end-to-end.
"""

from __future__ import annotations

import json
import sys


def _dream_query_response(arguments: dict) -> dict:
    operation = arguments.get("desired_operation", "")
    return {
        "sdl_delta": (
            "extend type Query {\n"
            f"  # generated for: {operation[:60]}\n"
            "  reports(dateRange: String!): [Report!]!\n"
            "}\n"
            "type Report { id: ID! title: String! }\n"
        ),
        "resolver_stubs": [
            {"type": "Query", "field": "reports", "signature": "async (_, { dateRange }) => [Report]"}
        ],
        "confidence": 0.88,
    }


def _validate_response(_arguments: dict) -> dict:
    return {
        "has_breaking_changes": False,
        "affected_clients": [],
        "severity": "none",
        "client_ops_evaluated": 1234,
    }


def _propose_response(arguments: dict) -> dict:
    return {
        "subgraph_id": f"sg_{arguments.get('subgraph_name', 'unknown')}_fake",
        "version": "v0.1.0",
        "composition_check": True,
        "composed_supergraph_url": "https://cosmo.test/supergraph/fake",
    }


def _edfs_response(arguments: dict) -> dict:
    fields = arguments.get("fields", [])
    return {
        "topic_bindings": [
            {"field": f, "topic": f"test.events.{f}", "transport": "kafka"} for f in fields
        ],
        "broker": "kafka://test.local:9092",
    }


_HANDLERS = {
    "dream_query": _dream_query_response,
    "validate_against_live_traffic": _validate_response,
    "schema_change_proposal_workflow": _propose_response,
    "register_edfs_events": _edfs_response,
}


def main() -> None:
    for raw in sys.stdin:
        raw = raw.strip()
        if not raw:
            continue
        request = json.loads(raw)
        params = request.get("params", {})
        tool = params.get("name")
        arguments = params.get("arguments", {})
        handler = _HANDLERS.get(tool)
        if handler is None:
            response = {"jsonrpc": "2.0", "id": request.get("id"), "error": {"code": -32601, "message": f"unknown tool {tool}"}}
        else:
            response = {"jsonrpc": "2.0", "id": request.get("id"), "result": handler(arguments)}
        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
