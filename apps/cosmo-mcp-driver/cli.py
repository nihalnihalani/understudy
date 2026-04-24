"""CLI entrypoint — shown in the terminal on stage (architecture.md §15 1:20-1:40).

Deliberately formatted for a live demo:

- colored diff for the SDL delta
- a clean traffic-validator PASS line
- a green composition-OK confirmation

Never echoes auth tokens — we own architecture.md §18 risk #2 honestly.

Usage::

    python -m apps.cosmo_mcp_driver dream "export yesterday's orders as CSV"
    python -m apps.cosmo_mcp_driver register --subgraph-name agent_orders --sdl path/to.graphql
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import uuid
from pathlib import Path

try:
    from .driver import CosmoDreamQuery
except ImportError:  # pragma: no cover — direct-script execution fallback
    from driver import CosmoDreamQuery  # type: ignore[no-redef]

_USE_COLOR = sys.stdout.isatty() and os.environ.get("NO_COLOR") != "1"


def _c(code: str, text: str) -> str:
    if not _USE_COLOR:
        return text
    return f"\x1b[{code}m{text}\x1b[0m"


def _bold(text: str) -> str:
    return _c("1", text)


def _dim(text: str) -> str:
    return _c("2", text)


def _green(text: str) -> str:
    return _c("32", text)


def _yellow(text: str) -> str:
    return _c("33", text)


def _cyan(text: str) -> str:
    return _c("36", text)


def _red(text: str) -> str:
    return _c("31", text)


def _print_sdl_diff(sdl: str) -> None:
    """Render an SDL delta as a colored unified-ish diff — added lines in green, comments dim."""
    print(_bold("── SDL delta ──────────────────────────────────────────────"))
    for raw in sdl.splitlines():
        stripped = raw.strip()
        if not stripped:
            print(raw)
            continue
        if stripped.startswith('"""') or stripped.startswith("#"):
            print(_dim(f"  {raw}"))
            continue
        if stripped.startswith("}") or stripped.startswith(")"):
            print(f"  {raw}")
            continue
        print(_green(f"+ {raw}"))
    print(_bold("───────────────────────────────────────────────────────────"))


def _print_validation(report_dict: dict) -> None:
    ops = report_dict.get("client_ops_evaluated", 0)
    if report_dict.get("has_breaking_changes"):
        sev = report_dict.get("severity", "unknown")
        n = len(report_dict.get("affected_clients") or [])
        print(_red(f"traffic validator: FAIL ({n} clients affected, severity={sev})"))
        return
    print(_green(f"traffic validator: PASS (0 breaking changes vs {ops:,} client ops)"))


def _print_composition(version_dict: dict) -> None:
    if version_dict.get("composition_check"):
        print(
            _green("composition OK")
            + _dim(
                f"  subgraph={version_dict.get('subgraph_id')} version={version_dict.get('version')}"
            )
        )
        url = version_dict.get("composed_supergraph_url")
        if url:
            print(_dim(f"  supergraph: {url}"))
    else:
        print(_red("composition FAILED"))


async def _cmd_dream(args: argparse.Namespace) -> int:
    run_id = args.run_id or f"demo-{uuid.uuid4().hex[:8]}"
    print(_cyan(f"▸ cosmo mcp dream_query  ") + _dim(f"run_id={run_id}"))
    print(_dim(f"  desired operation: {args.operation}"))
    async with CosmoDreamQuery(run_id=run_id) as dq:
        delta = await dq.dream_query(args.operation)
        _print_sdl_diff(delta.sdl_delta)
        print(_dim(f"  confidence: {delta.confidence:.2f}   resolver stubs: {len(delta.resolver_stubs)}"))

        report = await dq.validate_against_live_traffic(delta.sdl_delta)
        _print_validation(report.to_dict())

        if args.json:
            print(json.dumps({"sdl_delta": delta.to_dict(), "validation": report.to_dict()}, indent=2))
    return 0


async def _cmd_register(args: argparse.Namespace) -> int:
    run_id = args.run_id or f"register-{uuid.uuid4().hex[:8]}"
    sdl_path = Path(args.sdl)
    if not sdl_path.exists():
        print(_red(f"error: sdl file not found: {sdl_path}"), file=sys.stderr)
        return 2
    sdl = sdl_path.read_text()

    print(_cyan(f"▸ cosmo mcp schema_change_proposal_workflow  ") + _dim(f"subgraph={args.subgraph_name}"))
    _print_sdl_diff(sdl)
    async with CosmoDreamQuery(run_id=run_id) as dq:
        report = await dq.validate_against_live_traffic(sdl)
        _print_validation(report.to_dict())
        if report.has_breaking_changes and not args.force:
            print(_red("refusing to propose: breaking changes detected (use --force to override)"))
            return 1

        version = await dq.propose_schema_change(sdl, args.subgraph_name)
        _print_composition(version.to_dict())

        router_dir = Path(args.router_dir)
        router_dir.mkdir(parents=True, exist_ok=True)
        out = router_dir / f"{args.subgraph_name}.graphql"
        out.write_text(sdl)
        print(_dim(f"  wrote {out}"))

        if args.edfs_fields:
            fields = [f.strip() for f in args.edfs_fields.split(",") if f.strip()]
            bindings = await dq.register_edfs_events(fields)
            print(_cyan("▸ edfs bindings"))
            for b in bindings.bindings:
                print(_dim(f"  {b.get('field')}  →  {b.get('topic')}  [{b.get('transport')}]"))
    return 0


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m apps.cosmo_mcp_driver",
        description="Cosmo MCP driver — Dream Query + schema proposal workflow (architecture.md §4).",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    dream = subparsers.add_parser("dream", help="Run dream_query + live-traffic validation.")
    dream.add_argument("operation", help="Natural-language description of the desired GraphQL operation.")
    dream.add_argument("--run-id", default=None)
    dream.add_argument("--json", action="store_true", help="Also emit the full result as JSON.")

    reg = subparsers.add_parser(
        "register",
        help="Propose + compose + publish a subgraph, write SDL to the router's subgraphs/ dir.",
    )
    reg.add_argument("--subgraph-name", required=True)
    reg.add_argument("--sdl", required=True, help="Path to a .graphql SDL file.")
    reg.add_argument(
        "--router-dir",
        default=str(Path(__file__).resolve().parents[1] / "cosmo-router" / "subgraphs"),
    )
    reg.add_argument("--edfs-fields", default=None, help="Comma-separated list of event fields to bind.")
    reg.add_argument("--force", action="store_true", help="Propose even if breaking changes were flagged.")
    reg.add_argument("--run-id", default=None)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    if args.command == "dream":
        return asyncio.run(_cmd_dream(args))
    if args.command == "register":
        return asyncio.run(_cmd_register(args))
    parser.error(f"unknown command: {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
