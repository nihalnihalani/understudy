"""Persist Trusted Documents + ConnectRPC artifacts for a synthesized agent.

Two parallel Wundergraph integrations land here, both honoring DEMO_MODE=replay:

1. **Trusted Documents** (`wgc operations push`) — registers the operations
   on Cosmo Cloud's persisted-operation store. Used by the GraphQL endpoint
   for whitelist + cache. Soft-fails when COSMO_API_KEY is unset.

2. **ConnectRPC service** (`wgc grpc-service generate`) — produces a
   `service.proto` from the SDL + operation files. The router watches the
   storage_provider directory and exposes the operations as gRPC / Connect /
   gRPC-Web / HTTP+JSON on port 5026 at:
   `http://<router>:5026/<package>.<Service>/<RpcMethod>`.

The returned endpoints reflect the actual URL shape the router serves, not
the older `/connect/{agent}/...` shape that doesn't exist on the OSS router.
"""

from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Awaitable, Callable, Iterable

import redis.asyncio as aioredis

try:  # dual-form import: package mode OR flat sys.path-injected mode
    from .trusted_documents import TrustedDocument
except ImportError:  # pragma: no cover — exercised when loaded via sys.path injection
    from trusted_documents import TrustedDocument  # type: ignore[no-redef]

Runner = Callable[[list[str]], Awaitable[tuple[int, str, str]]]


@dataclass
class PushResult:
    endpoints: dict[str, str]
    wgc_skipped: bool
    proto_generated: bool = False


def _router_base() -> str:
    return os.environ.get("COSMO_ROUTER_URL", "http://localhost:4000").rstrip("/")


def _connect_base() -> str:
    """ConnectRPC server base URL. Default port is 5026 (router 0.311.0)."""
    return os.environ.get("COSMO_CONNECT_URL", "http://localhost:5026").rstrip("/")


def _service_pascal_case(agent_name: str) -> str:
    """`agent_orders_demo` → `AgentOrdersDemo` for the proto Service name."""
    return "".join(part.capitalize() for part in agent_name.replace("-", "_").split("_") if part)


def _package_name(agent_name: str) -> str:
    """Proto package per agent. Convention: `<snake_case>.v1`."""
    safe = agent_name.replace("-", "_").lower()
    return f"{safe}.v1"


def _endpoint_set(agent_name: str) -> dict[str, str]:
    """The four protocol surfaces the router actually serves for this agent.

    `graphql` → port 4000 GraphQL endpoint (federation).
    `grpc` / `connect` / `rest` → port 5026 ConnectRPC service base. Same URL
    handles gRPC, gRPC-Web, Connect, and HTTP+JSON — protocol is selected
    via `Content-Type` header per the Connect spec.
    """
    pkg = _package_name(agent_name)
    svc = _service_pascal_case(agent_name)
    connect_base = f"{_connect_base()}/{pkg}.{svc}"
    return {
        "graphql": f"{_router_base()}/graphql",
        "grpc": connect_base,
        "connect": connect_base,
        "rest": connect_base,
    }


async def _default_runner(argv: list[str]) -> tuple[int, str, str]:
    proc = await asyncio.create_subprocess_exec(
        *argv,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    out, err = await proc.communicate()
    return proc.returncode or 0, out.decode(), err.decode()


async def _push_trusted_docs_to_cloud(
    *, agent_name: str, doc_paths: list[Path], runner: Runner
) -> bool:
    """Best-effort wgc operations push. Returns True when the call ran (rc=0)."""
    if not os.environ.get("COSMO_API_KEY"):
        return False
    graph_name = os.environ.get("COSMO_FEDERATED_GRAPH_NAME", "understudy")
    argv = [
        "wgc", "operations", "push", graph_name,
        "--client", agent_name,
        "--namespace", os.environ.get("COSMO_NAMESPACE", "default"),
        "--quiet",
    ]
    for p in doc_paths:
        argv.extend(["--file", str(p)])
    rc, _stdout, _stderr = await runner(argv)
    return rc == 0


async def _generate_grpc_service(
    *, agent_name: str, sdl_path: Path, ops_dir: Path, services_dir: Path, runner: Runner
) -> bool:
    """Run `wgc grpc-service generate` so the router can discover the agent.

    Produces `service.proto` + `service.proto.lock.json` in
    `services_dir/<agent_name>/`. The agent's .graphql operations are also
    copied alongside so the router knows the GraphQL → RPC mapping.
    """
    target = services_dir / agent_name
    target.mkdir(parents=True, exist_ok=True)
    # Copy operation files into the service dir so the router discovers them.
    if ops_dir.exists():
        for op_file in ops_dir.glob("*.graphql"):
            (target / op_file.name).write_text(op_file.read_text())

    argv = [
        "wgc", "grpc-service", "generate", _service_pascal_case(agent_name),
        "--input", str(sdl_path),
        "--output", str(target),
        "--package-name", _package_name(agent_name),
        "--with-operations", str(target),
    ]
    rc, _stdout, _stderr = await runner(argv)
    return rc == 0


async def push_trusted_documents(
    *,
    agent_name: str,
    synth_id: str,
    documents: Iterable[TrustedDocument],
    operations_dir: Path,
    redis: aioredis.Redis,
    sdl_path: Path | None = None,
    services_dir: Path | None = None,
    runner: Runner | None = None,
) -> PushResult:
    """Persist the agent's Trusted Documents + (when SDL present) generate the
    ConnectRPC service proto so the router serves the agent at :5026.

    Honors `DEMO_MODE=replay` — both wgc commands are skipped and the
    canonical `us:agent:{name}:protocols` key is mirrored from canned data.
    """
    docs = list(documents)
    demo_mode = os.environ.get("DEMO_MODE", "live").lower()

    if demo_mode == "replay":
        cached = await redis.hget(f"us:replay:{synth_id}:protocols", "endpoints")
        endpoints = json.loads(cached) if cached else _endpoint_set(agent_name)
        await redis.hset(
            f"us:agent:{agent_name}:protocols",
            mapping={"endpoints": json.dumps(endpoints)},
        )
        return PushResult(endpoints=endpoints, wgc_skipped=True, proto_generated=False)

    # --- Live / hybrid: write op files + cache endpoints + (best-effort) wgc.
    target = operations_dir / agent_name
    target.mkdir(parents=True, exist_ok=True)
    doc_paths: list[Path] = []
    for doc in docs:
        path = target / f"{doc.name}.graphql"
        path.write_text(doc.body)
        doc_paths.append(path)

    endpoints = _endpoint_set(agent_name)
    await redis.hset(
        f"us:agent:{agent_name}:protocols",
        mapping={"endpoints": json.dumps(endpoints)},
    )

    run = runner or _default_runner
    pushed = await _push_trusted_docs_to_cloud(
        agent_name=agent_name, doc_paths=doc_paths, runner=run
    )

    proto_ok = False
    if sdl_path is not None and services_dir is not None and sdl_path.exists():
        proto_ok = await _generate_grpc_service(
            agent_name=agent_name,
            sdl_path=sdl_path,
            ops_dir=target,
            services_dir=services_dir,
            runner=run,
        )

    return PushResult(endpoints=endpoints, wgc_skipped=not pushed, proto_generated=proto_ok)
