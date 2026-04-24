"""Persist Trusted Documents to disk + Redis and (when online) push to Cosmo via wgc.

Mirrors the soft-failure pattern in scripts/register_agent_subgraph.sh — when wgc or
COSMO_API_KEY is unavailable, we still write files locally + cache endpoints in Redis so
the API can advertise the four protocol URLs. Honors DEMO_MODE=replay (architecture.md §14).
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


def _default_router_base() -> str:
    return os.environ.get("COSMO_ROUTER_URL", "http://localhost:4000").rstrip("/")


def _endpoint_set(agent_name: str) -> dict[str, str]:
    base = _default_router_base()
    return {
        "graphql": f"{base}/graphql",
        "grpc": f"{base}/connect/{agent_name}",
        "rest": f"{base}/connect/{agent_name}/json",
        "openapi": f"{base}/connect/{agent_name}/openapi.json",
    }


async def _default_runner(argv: list[str]) -> tuple[int, str, str]:
    proc = await asyncio.create_subprocess_exec(
        *argv,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    out, err = await proc.communicate()
    return proc.returncode or 0, out.decode(), err.decode()


async def push_trusted_documents(
    *,
    agent_name: str,
    synth_id: str,
    documents: Iterable[TrustedDocument],
    operations_dir: Path,
    redis: aioredis.Redis,
    runner: Runner | None = None,
) -> PushResult:
    docs = list(documents)
    demo_mode = os.environ.get("DEMO_MODE", "live").lower()

    # --- DEMO_MODE=replay: read canned endpoints from Redis, do nothing else. ---
    if demo_mode == "replay":
        cached = await redis.hget(f"us:replay:{synth_id}:protocols", "endpoints")
        endpoints = json.loads(cached) if cached else _endpoint_set(agent_name)
        # Mirror to the canonical us:agent:{name}:protocols key so the API
        # endpoint /agents/{id}/protocols resolves in replay mode the same
        # way it does in live mode (replay-mode hermeticity, invariant #2).
        await redis.hset(
            f"us:agent:{agent_name}:protocols",
            mapping={"endpoints": json.dumps(endpoints)},
        )
        return PushResult(endpoints=endpoints, wgc_skipped=True)

    # --- Live / hybrid: write files + cache endpoints + best-effort wgc push. ---
    target = operations_dir / agent_name
    target.mkdir(parents=True, exist_ok=True)
    for doc in docs:
        (target / f"{doc.name}.graphql").write_text(doc.body)

    endpoints = _endpoint_set(agent_name)
    await redis.hset(
        f"us:agent:{agent_name}:protocols",
        mapping={"endpoints": json.dumps(endpoints)},
    )

    runner = runner or _default_runner
    wgc_skipped = False
    if not os.environ.get("COSMO_API_KEY"):
        wgc_skipped = True
    else:
        graph_name = os.environ.get("COSMO_FEDERATED_GRAPH_NAME", "understudy")
        argv = [
            "wgc",
            "operations",
            "push",
            graph_name,
            "--client",
            agent_name,
            "--namespace",
            os.environ.get("COSMO_NAMESPACE", "default"),
            "--quiet",
        ]
        for doc in docs:
            argv.extend(["--file", str(target / f"{doc.name}.graphql")])
        rc, _stdout, _stderr = await runner(argv)
        if rc != 0:
            # Mirror register_agent_subgraph.sh — log + soft-fail, don't abort synthesis.
            wgc_skipped = True
    return PushResult(endpoints=endpoints, wgc_skipped=wgc_skipped)
