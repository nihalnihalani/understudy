# Cosmo Connect — Multi-Protocol Agent Endpoints (Trusted Documents)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make every synthesized agent's federated graph reachable as **GraphQL + gRPC + JSON+REST + OpenAPI** from one recording, by emitting Trusted Documents from the synthesis pipeline and enabling Cosmo Router's Connect endpoints. One protocol per Query/Mutation field, derived from the existing catchall resolver shape.

**Architecture:** During `emit_script` (Stage 3), after the SDL is finalized, walk every Query/Mutation field and emit one named GraphQL operation per field — these are the agent's "Trusted Documents." Persist the bundle to Redis (`us:agent:{id}:trusted_ops`) and to disk under `apps/cosmo-router/operations/<agent>/`. Add a `connect:` block to the router config. The API exposes `/agents/{id}/protocols` listing the four endpoints. The web AgentWall renders four chips per agent. `DEMO_MODE=replay` returns canned protocol URLs from Redis. No Gemini model IDs touched. No supply-chain change.

**Tech Stack:** Python 3.11 (synthesis-worker, api), TypeScript/React (web), `wgc operations push` (CLI; gracefully no-ops when offline like the existing `register_agent_subgraph.sh`), Cosmo Router YAML.

**Non-goals:** Cosmo Connect *gRPC subgraphs* (Router Plugins). That's the stretch path; explicitly out of scope here. We're consumer-side only.

**Invariant compliance:**
- Invariant #1 (Gemini pins): no model IDs added. The `emit_script` stage is unchanged in its Gemini call.
- Invariant #2 (`DEMO_MODE`): every new outbound call (`wgc operations push`) gets a `DEMO_MODE=replay` branch backed by a Redis fixture in the same PR.
- Invariant #3 (SLSA L2): no `infra/` or `scripts/verify_release.sh` changes.

**PR strategy:** One feature branch `feat/cosmo-connect-protocols`, one PR, conventional-commit per task. Auto-review per CLAUDE.md workflow before merge.

---

### Task 0: Verify wgc Connect command surface + scaffold

**Files:**
- Create: `apps/cosmo-router/operations/.gitkeep`
- Create: `docs/plans/2026-04-25-cosmo-connect-protocols.md` (this file — already done)

**Step 1: Probe `wgc` for Connect/operations commands**

Run: `wgc operations --help && wgc router --help | head -40`
Expected: at least one of `wgc operations push` / `wgc router operations` exists. If both error, halt and report — the consumer-side path requires this.

**Step 2: Create the operations dir + branch**

```bash
git checkout -b feat/cosmo-connect-protocols
mkdir -p apps/cosmo-router/operations
touch apps/cosmo-router/operations/.gitkeep
```

**Step 3: Commit**

```bash
git add apps/cosmo-router/operations/.gitkeep docs/plans/2026-04-25-cosmo-connect-protocols.md
git commit -m "chore(router): scaffold operations dir for cosmo connect trusted docs"
```

---

### Task 1: Trusted-doc emitter (pure function, fully unit-testable)

**Files:**
- Create: `apps/synthesis-worker/trusted_documents.py`
- Test: `tests/synthesis_worker/test_trusted_documents.py`

**Step 1: Write the failing test**

```python
# tests/synthesis_worker/test_trusted_documents.py
"""Trusted-doc emission walks the SDL and produces one named op per Query/Mutation field."""
from apps.synthesis_worker.trusted_documents import emit_trusted_documents

ORDERS_SDL = """
type Query {
  orders(filter: OrderFilter!, first: Int = 25): [Order!]!
  order(id: ID!): Order
}
type Mutation {
  exportOrdersCsv(filter: OrderFilter!): OrderExport!
}
input OrderFilter { status: String }
type Order { id: ID! }
type OrderExport { id: ID! }
"""

def test_emits_one_doc_per_query_and_mutation_field():
    docs = emit_trusted_documents(ORDERS_SDL, agent_name="agent_orders")
    names = sorted(d.name for d in docs)
    assert names == ["ExportOrdersCsv", "Order", "Orders"]
    by_name = {d.name: d for d in docs}
    assert by_name["Orders"].operation_type == "query"
    assert by_name["ExportOrdersCsv"].operation_type == "mutation"
    # Args must be wired through with their declared types.
    assert "$filter: OrderFilter!" in by_name["Orders"].body
    assert "$first: Int = 25" in by_name["Orders"].body
    assert "orders(filter: $filter, first: $first)" in by_name["Orders"].body

def test_skips_subscriptions():
    sdl = "type Query { x: Int } type Subscription { tick: Int }"
    docs = emit_trusted_documents(sdl, agent_name="agent_t")
    assert {d.name for d in docs} == {"X"}
```

Run: `pytest tests/synthesis_worker/test_trusted_documents.py -v`
Expected: FAIL with `ModuleNotFoundError: apps.synthesis_worker.trusted_documents`

**Step 2: Implement the emitter**

```python
# apps/synthesis-worker/trusted_documents.py
"""Walk a generated SDL and emit one named GraphQL operation per Query/Mutation field.

Each synthesized agent uses a catchall resolver (apps/agent-template/src/graphql/server.ts)
that dispatches by field name to the core loop. So the trusted-doc set is fully derivable
from the SDL — no Gemini call needed. Subscriptions are intentionally skipped (Connect
doesn't support streaming subscriptions in this Cosmo version).
"""
from __future__ import annotations
from dataclasses import dataclass
from graphql import parse, OperationType
from graphql.language.ast import (
    DocumentNode, ObjectTypeDefinitionNode, FieldDefinitionNode,
    NonNullTypeNode, ListTypeNode, NamedTypeNode, TypeNode,
)

@dataclass(frozen=True)
class TrustedDocument:
    name: str               # PascalCase op name
    operation_type: str     # "query" | "mutation"
    field_name: str         # original field name on Query/Mutation
    body: str               # serialized GraphQL operation text


def emit_trusted_documents(sdl: str, *, agent_name: str) -> list[TrustedDocument]:
    doc: DocumentNode = parse(sdl)
    out: list[TrustedDocument] = []
    for definition in doc.definitions:
        if not isinstance(definition, ObjectTypeDefinitionNode):
            continue
        type_name = definition.name.value
        if type_name not in ("Query", "Mutation"):
            continue
        op_kw = "query" if type_name == "Query" else "mutation"
        for field in definition.fields or ():
            out.append(_field_to_doc(field, op_kw))
    return out


def _field_to_doc(field: FieldDefinitionNode, op_kw: str) -> TrustedDocument:
    field_name = field.name.value
    op_name = field_name[:1].upper() + field_name[1:]
    var_decls: list[str] = []
    arg_passes: list[str] = []
    for arg in field.arguments or ():
        type_str = _serialize_type(arg.type)
        default = ""
        if arg.default_value is not None:
            default = f" = {_serialize_value(arg.default_value)}"
        var_decls.append(f"${arg.name.value}: {type_str}{default}")
        arg_passes.append(f"{arg.name.value}: ${arg.name.value}")
    var_block = f"({', '.join(var_decls)})" if var_decls else ""
    arg_block = f"({', '.join(arg_passes)})" if arg_passes else ""
    body = f"{op_kw} {op_name}{var_block} {{\n  {field_name}{arg_block}\n}}\n"
    return TrustedDocument(
        name=op_name,
        operation_type=op_kw,
        field_name=field_name,
        body=body,
    )


def _serialize_type(node: TypeNode) -> str:
    if isinstance(node, NonNullTypeNode):
        return f"{_serialize_type(node.type)}!"
    if isinstance(node, ListTypeNode):
        return f"[{_serialize_type(node.type)}]"
    assert isinstance(node, NamedTypeNode)
    return node.name.value


def _serialize_value(node) -> str:
    # Conservative: cover the literals the SDL emitter actually produces.
    from graphql.language.ast import (
        IntValueNode, FloatValueNode, StringValueNode, BooleanValueNode, EnumValueNode,
    )
    if isinstance(node, (IntValueNode, FloatValueNode, EnumValueNode)):
        return node.value
    if isinstance(node, BooleanValueNode):
        return "true" if node.value else "false"
    if isinstance(node, StringValueNode):
        return f'"{node.value}"'
    return str(node)
```

**Step 3: Run test, verify pass**

Run: `pytest tests/synthesis_worker/test_trusted_documents.py -v`
Expected: 2 passed

**Step 4: Commit**

```bash
git add apps/synthesis-worker/trusted_documents.py tests/synthesis_worker/test_trusted_documents.py
git commit -m "feat(synthesis-worker): emit trusted documents from generated SDL"
```

---

### Task 2: CosmoWriter — push trusted docs (with replay branch)

**Files:**
- Create: `apps/synthesis-worker/cosmo_writer.py`
- Test: `tests/synthesis_worker/test_cosmo_writer.py`

**Step 1: Write the failing test (replay-mode happy path + offline-mode happy path)**

```python
# tests/synthesis_worker/test_cosmo_writer.py
"""CosmoWriter writes trusted ops to disk + Redis, no-ops gracefully when wgc unavailable."""
import json
import pytest
import fakeredis.aioredis
from apps.synthesis_worker.cosmo_writer import push_trusted_documents
from apps.synthesis_worker.trusted_documents import TrustedDocument

DOCS = [
    TrustedDocument(name="Orders", operation_type="query", field_name="orders",
                    body="query Orders { orders { id } }\n"),
    TrustedDocument(name="ExportOrdersCsv", operation_type="mutation",
                    field_name="exportOrdersCsv",
                    body="mutation ExportOrdersCsv { exportOrdersCsv { id } }\n"),
]

@pytest.mark.asyncio
async def test_replay_mode_returns_canned_endpoints_and_skips_wgc(monkeypatch, tmp_path):
    monkeypatch.setenv("DEMO_MODE", "replay")
    redis = fakeredis.aioredis.FakeRedis()
    await redis.hset(
        "us:replay:s1:protocols",
        mapping={"endpoints": json.dumps({
            "graphql": "http://localhost:4000/graphql",
            "grpc": "http://localhost:4000/connect/agent_orders",
            "rest": "http://localhost:4000/connect/agent_orders/json",
            "openapi": "http://localhost:4000/connect/agent_orders/openapi.json",
        })},
    )
    result = await push_trusted_documents(
        agent_name="agent_orders", synth_id="s1", documents=DOCS,
        operations_dir=tmp_path, redis=redis,
    )
    assert result.endpoints["grpc"].endswith("/connect/agent_orders")
    assert result.wgc_skipped is True

@pytest.mark.asyncio
async def test_live_mode_writes_files_and_calls_wgc(monkeypatch, tmp_path):
    monkeypatch.setenv("DEMO_MODE", "live")
    redis = fakeredis.aioredis.FakeRedis()
    invocations: list[list[str]] = []

    async def fake_runner(argv: list[str]) -> tuple[int, str, str]:
        invocations.append(argv)
        return 0, "ok", ""

    result = await push_trusted_documents(
        agent_name="agent_orders", synth_id="s1", documents=DOCS,
        operations_dir=tmp_path, redis=redis, runner=fake_runner,
    )
    written = sorted(p.name for p in (tmp_path / "agent_orders").iterdir())
    assert written == ["ExportOrdersCsv.graphql", "Orders.graphql"]
    assert any(argv[:3] == ["wgc", "operations", "push"] for argv in invocations)
    # The agent name lands in --client so the federated graph stays one logical entity.
    assert any("--client" in argv and "agent_orders" in argv for argv in invocations)
    cached = await redis.hget("us:agent:agent_orders:protocols", "endpoints")
    assert cached is not None  # we cached the endpoint set for /agents/{id}/protocols

@pytest.mark.asyncio
async def test_live_mode_offline_wgc_failure_is_soft(monkeypatch, tmp_path):
    monkeypatch.setenv("DEMO_MODE", "live")
    redis = fakeredis.aioredis.FakeRedis()

    async def failing_runner(argv: list[str]) -> tuple[int, str, str]:
        return 127, "", "wgc: command not found"

    result = await push_trusted_documents(
        agent_name="agent_orders", synth_id="s1", documents=DOCS,
        operations_dir=tmp_path, redis=redis, runner=failing_runner,
    )
    # File-side write still succeeded.
    assert (tmp_path / "agent_orders" / "Orders.graphql").exists()
    # Endpoints still cached locally so the API can serve them.
    assert "graphql" in result.endpoints
    assert result.wgc_skipped is True
```

Run: `pytest tests/synthesis_worker/test_cosmo_writer.py -v`
Expected: FAIL with `ModuleNotFoundError`

**Step 2: Implement CosmoWriter**

```python
# apps/synthesis-worker/cosmo_writer.py
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

from .trusted_documents import TrustedDocument

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
        *argv, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
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
        return PushResult(endpoints=endpoints, wgc_skipped=True)

    # --- Live / hybrid: write files + cache endpoints + best-effort wgc push. ---
    target = operations_dir / agent_name
    target.mkdir(parents=True, exist_ok=True)
    for doc in docs:
        (target / f"{doc.name}.graphql").write_text(doc.body)

    endpoints = _endpoint_set(agent_name)
    await redis.hset(f"us:agent:{agent_name}:protocols",
                     mapping={"endpoints": json.dumps(endpoints)})

    runner = runner or _default_runner
    wgc_skipped = False
    if not os.environ.get("COSMO_API_KEY"):
        wgc_skipped = True
    else:
        graph_name = os.environ.get("COSMO_FEDERATED_GRAPH_NAME", "understudy")
        argv = [
            "wgc", "operations", "push", graph_name,
            "--client", agent_name,
            "--namespace", os.environ.get("COSMO_NAMESPACE", "default"),
            "--quiet",
        ]
        for doc in docs:
            argv.extend(["--file", str(target / f"{doc.name}.graphql")])
        rc, _stdout, stderr = await runner(argv)
        if rc != 0:
            # Mirror register_agent_subgraph.sh — log + soft-fail, don't abort synthesis.
            wgc_skipped = True
    return PushResult(endpoints=endpoints, wgc_skipped=wgc_skipped)
```

**Step 3: Run tests, verify pass**

Run: `pytest tests/synthesis_worker/test_cosmo_writer.py -v`
Expected: 3 passed

**Step 4: Commit**

```bash
git add apps/synthesis-worker/cosmo_writer.py tests/synthesis_worker/test_cosmo_writer.py
git commit -m "feat(synthesis-worker): add cosmo writer with DEMO_MODE replay branch"
```

---

### Task 3: Wire CosmoWriter into the pipeline

**Files:**
- Modify: `apps/synthesis-worker/pipeline.py` (add a stage call after `emit_script` in `run_pipeline`)
- Modify: `apps/synthesis-worker/main.py` (so the worker passes the operations dir + agent name)
- Test: `tests/synthesis_worker/test_pipeline_contract.py` (extend existing)

**Step 1: Extend the existing pipeline-contract test with a new assertion**

```python
# add to tests/synthesis_worker/test_pipeline_contract.py
@pytest.mark.asyncio
async def test_pipeline_emits_trusted_documents(...):
    """After run_pipeline, the SynthesisResult exposes trusted_documents matching SDL fields."""
    result = await run_pipeline(...)  # use existing fixture setup
    names = sorted(d.name for d in result.trusted_documents)
    assert "Orders" in names or "Order" in names  # depends on fixture SDL
```

(Match the actual fixture in the existing file — read it first.)

Run: `pytest tests/synthesis_worker/test_pipeline_contract.py -v`
Expected: FAIL — `SynthesisResult` has no `trusted_documents` field.

**Step 2: Add the field + populate it**

Modify `apps/synthesis-worker/pipeline.py`:

```python
# Add to imports
from .trusted_documents import TrustedDocument, emit_trusted_documents

# Extend SynthesisResult
@dataclass
class SynthesisResult:
    synth_id: str
    keyframes: list[Keyframe]
    actions: list[ActionEvent]
    intent: IntentSpec
    bundle: TinyFishScriptBundle
    trusted_documents: list[TrustedDocument]  # <-- new
```

In `run_pipeline`, after `bundle = await emit_script(...)`:

```python
trusted_documents = (
    emit_trusted_documents(bundle.cosmo_sdl, agent_name=synth_id)
    if bundle.cosmo_sdl else []
)
return SynthesisResult(
    synth_id=synth_id, keyframes=keyframes, actions=actions,
    intent=intent, bundle=bundle, trusted_documents=trusted_documents,
)
```

**Step 3: Wire CosmoWriter in `main.py`**

Modify `apps/synthesis-worker/main.py` (the worker entry point) — call `push_trusted_documents` after `run_pipeline` completes successfully. Read the file first, find the post-pipeline hook, and add:

```python
from pathlib import Path
from .cosmo_writer import push_trusted_documents

OPERATIONS_DIR = Path(os.environ.get("COSMO_OPERATIONS_DIR", "apps/cosmo-router/operations"))

# inside the worker's per-job handler, after run_pipeline returns `result`:
agent_name = result.synth_id  # synthesizer assigns subgraph name = synth_id today
await push_trusted_documents(
    agent_name=agent_name,
    synth_id=result.synth_id,
    documents=result.trusted_documents,
    operations_dir=OPERATIONS_DIR,
    redis=redis,
)
```

**Step 4: Run pipeline tests + e2e smoke**

Run: `pytest tests/synthesis_worker/ tests/test_e2e_smoke.py -v`
Expected: all green. If e2e fixture lacks the SDL, allow `trusted_documents=[]` (already handled).

**Step 5: Commit**

```bash
git add apps/synthesis-worker/pipeline.py apps/synthesis-worker/main.py tests/synthesis_worker/test_pipeline_contract.py
git commit -m "feat(synthesis-worker): persist trusted documents after script emission"
```

---

### Task 4: Cosmo Router Connect block

**Files:**
- Modify: `apps/cosmo-router/config.yaml`
- Modify: `apps/cosmo-router/compose.yaml` (mount the operations dir)

**Step 1: Add `connect:` block to `config.yaml`**

After the `engine:` block, add:

```yaml
# --- Connect (multi-protocol surface) -----------------------------------
# Exposes every agent's federated graph as gRPC, JSON+REST, and OpenAPI in
# addition to GraphQL — driven by Trusted Documents pushed by the
# synthesis worker (apps/synthesis-worker/cosmo_writer.py).
connect:
  enabled: true
  listen_path: "/connect"
  operations_dir: "/etc/cosmo-router/operations"
  protocols:
    grpc: true
    json: true
    openapi: true
```

**Step 2: Mount the operations dir in `compose.yaml`** (host → container)

Add to the existing mounts section:

```yaml
volumes:
  - ./operations:/etc/cosmo-router/operations:ro
```

(Read existing compose.yaml first; preserve formatting.)

**Step 3: Boot the router locally and probe**

Run:
```
make redis
docker compose up cosmo-router -d
curl -sf http://localhost:4000/connect/_health || echo "connect endpoint not reachable"
docker compose logs cosmo-router --tail=40
```

Expected: router starts; `connect:` block accepted (logs show "Connect listener bound on /connect"). If the field name in the router's actual config schema differs (router version 0.x may name it differently), match the docs at https://cosmo-docs.wundergraph.com/connect/overview — adjust `connect:` to the documented schema and re-run.

**Step 4: Commit**

```bash
git add apps/cosmo-router/config.yaml apps/cosmo-router/compose.yaml
git commit -m "feat(router): enable cosmo connect for multi-protocol agent endpoints"
```

---

### Task 5: API endpoint — `GET /agents/{id}/protocols`

**Files:**
- Modify: `apps/api/main.py` (add route)
- Modify: `apps/api/schemas.py` (add response model)
- Test: `tests/test_api_endpoints.py` (extend)

**Step 1: Write the failing test**

```python
# add to tests/test_api_endpoints.py
@pytest.mark.asyncio
async def test_get_agent_protocols_returns_four_endpoints(client, redis):
    await redis.hset(
        "us:agent:agent_orders:protocols",
        mapping={"endpoints": json.dumps({
            "graphql": "http://localhost:4000/graphql",
            "grpc": "http://localhost:4000/connect/agent_orders",
            "rest": "http://localhost:4000/connect/agent_orders/json",
            "openapi": "http://localhost:4000/connect/agent_orders/openapi.json",
        })},
    )
    r = await client.get("/agents/agent_orders/protocols")
    assert r.status_code == 200
    body = r.json()
    assert sorted(body["endpoints"].keys()) == ["graphql", "grpc", "openapi", "rest"]
```

Run: `pytest tests/test_api_endpoints.py::test_get_agent_protocols_returns_four_endpoints -v`
Expected: FAIL — 404.

**Step 2: Implement the route**

In `apps/api/schemas.py`:

```python
class AgentProtocols(BaseModel):
    agent_id: str
    endpoints: dict[str, str]
```

In `apps/api/main.py` (find the agents router; add):

```python
@app.get("/agents/{agent_id}/protocols", response_model=AgentProtocols)
async def get_agent_protocols(agent_id: str, redis: aioredis.Redis = Depends(get_redis)):
    raw = await redis.hget(f"us:agent:{agent_id}:protocols", "endpoints")
    if raw is None:
        raise HTTPException(status_code=404, detail="agent has no protocols cached")
    return AgentProtocols(agent_id=agent_id, endpoints=json.loads(raw))
```

**Step 3: Run test, verify pass**

Run: `pytest tests/test_api_endpoints.py::test_get_agent_protocols_returns_four_endpoints -v`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/api/main.py apps/api/schemas.py tests/test_api_endpoints.py
git commit -m "feat(api): add GET /agents/{id}/protocols for connect endpoint discovery"
```

---

### Task 6: Web — Protocol chips on each AgentWall tile

**Files:**
- Modify: `apps/web/src/api/types.ts` (add `AgentProtocols` type)
- Create: `apps/web/src/components/ProtocolChips.tsx` (4 chips with copy-to-clipboard)
- Modify: `apps/web/src/pages/AgentWall.tsx` (render chips per tile)
- Modify: `apps/web/src/api/client.ts` or hooks file (add `fetchAgentProtocols`)

**Step 1: Add the type**

```ts
// apps/web/src/api/types.ts
export interface AgentProtocols {
  agent_id: string;
  endpoints: {
    graphql: string;
    grpc: string;
    rest: string;
    openapi: string;
  };
}
```

**Step 2: Build `ProtocolChips.tsx`**

```tsx
import { useState } from "react";
import type { AgentProtocols } from "@/api/types";

const ORDER: (keyof AgentProtocols["endpoints"])[] = ["graphql", "grpc", "rest", "openapi"];
const LABELS: Record<keyof AgentProtocols["endpoints"], string> = {
  graphql: "GraphQL", grpc: "gRPC", rest: "REST", openapi: "OpenAPI",
};

export function ProtocolChips({ protocols }: { protocols: AgentProtocols }) {
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {ORDER.map((k) => (
        <button
          key={k}
          className="text-xs px-2 py-0.5 rounded border border-zinc-700 hover:bg-zinc-800 transition"
          title={protocols.endpoints[k]}
          onClick={() => {
            navigator.clipboard.writeText(protocols.endpoints[k]);
            setCopied(k);
            setTimeout(() => setCopied(null), 1200);
          }}
        >
          {copied === k ? "copied" : LABELS[k]}
        </button>
      ))}
    </div>
  );
}
```

**Step 3: Wire into `AgentWall.tsx`**

Read `apps/web/src/pages/AgentWall.tsx`. For each tile, fetch `/agents/{id}/protocols` and render `<ProtocolChips protocols={...} />` underneath the existing tile body. Skip rendering when fetch returns 404 (tile pre-protocols).

**Step 4: Visual check**

Run:
```
make redis
make api
make web
```

Open `http://localhost:5173`, navigate to the agent wall, confirm: every agent tile shows 4 chips, clicking a chip flashes "copied" and puts the URL on the clipboard. If `/agents/{id}/protocols` is 404 for the seed agents, prewarm them via `python scripts/prewarm_demo.py` (Task 7).

**Step 5: Commit**

```bash
git add apps/web/src/api/types.ts apps/web/src/components/ProtocolChips.tsx \
        apps/web/src/pages/AgentWall.tsx apps/web/src/api/client.ts
git commit -m "feat(web): show graphql/grpc/rest/openapi chips on each agent tile"
```

---

### Task 7: Pre-warm fixtures for replay mode

**Files:**
- Modify: `scripts/prewarm_demo.py` (seed `us:agent:{id}:protocols` for the seed agents + the demo agent)

**Step 1: Identify which agent IDs are seeded today**

Run: `grep -n "us:agent\|prewarm\|agent_alpha\|agent_beta" scripts/prewarm_demo.py | head -20`
Expected: existing seed-agent identifiers visible.

**Step 2: Add a `seed_protocols(redis)` helper**

In `scripts/prewarm_demo.py`, mirror the existing seed helpers:

```python
async def seed_protocols(redis):
    base = "http://localhost:4000"
    for agent_name in ("agent_alpha", "agent_beta", "agent_orders_demo"):
        endpoints = {
            "graphql": f"{base}/graphql",
            "grpc": f"{base}/connect/{agent_name}",
            "rest": f"{base}/connect/{agent_name}/json",
            "openapi": f"{base}/connect/{agent_name}/openapi.json",
        }
        await redis.hset(f"us:agent:{agent_name}:protocols",
                         mapping={"endpoints": json.dumps(endpoints)})
```

Call it from the existing main async entry alongside the other seeders.

**Step 3: Run + verify**

Run:
```
python scripts/prewarm_demo.py
redis-cli HGET us:agent:agent_alpha:protocols endpoints
```

Expected: JSON blob with all four URLs.

**Step 4: Commit**

```bash
git add scripts/prewarm_demo.py
git commit -m "feat(scripts): prewarm protocol endpoints for the seed agents"
```

---

### Task 8: Demo runbook + architecture note

**Files:**
- Modify: `docs/demo-runbook.md` (add a "2:15 — four-protocol pop" beat)
- Modify: `architecture.md` §4 (one-line: "Trusted Documents emitted post-script and pushed to Cosmo Connect")
- Modify: `README.md` (one bullet under Wundergraph integration: "+ Cosmo Connect — gRPC / REST / OpenAPI surface per agent")

**Step 1: Add the demo beat** to the demo runbook (insert a new line at 2:15):

```
2:15 — Click an agent tile. Hover the four chips: GraphQL, gRPC, REST, OpenAPI.
        Copy the gRPC URL and paste into terminal: `curl -sf {url}/health`. Beat:
        "one recording → four protocols, served from one federated graph."
```

**Step 2: Architecture + README cross-references** (one line each, no new sections).

**Step 3: Commit**

```bash
git add docs/demo-runbook.md architecture.md README.md
git commit -m "docs: document cosmo connect multi-protocol surface"
```

---

### Task 9: PR + auto-review + merge (per CLAUDE.md workflow)

**Step 1: Run full verification**

```bash
make lint
make typecheck
make test
ruff check .
mypy understudy
grep -rn "gemini-3" --include="*.py" --include="*.ts" | grep -v understudy/models.py
# expected: no matches outside understudy/models.py — invariant #1 holds
```

**Step 2: Push + open PR**

```bash
git push -u origin feat/cosmo-connect-protocols
gh pr create --title "feat(cosmo): expose every synthesized agent as graphql + grpc + rest + openapi" \
  --body "$(cat <<'EOF'
## Summary
- Emit one Trusted Document per Query/Mutation field from the generated SDL (no Gemini call needed; uses the catchall-resolver shape).
- New `cosmo_writer` persists docs to disk + Redis; pushes to Cosmo via `wgc` when online; soft-fails offline like `register_agent_subgraph.sh`.
- Router config gains a `connect:` block; compose mounts the operations dir.
- API: `GET /agents/{id}/protocols` returns the four endpoint URLs.
- Web: AgentWall tiles render four chips with copy-to-clipboard.
- DEMO_MODE=replay branch reads canned endpoints from Redis (invariant #2).
- No Gemini IDs touched (invariant #1). No infra/ changes (invariant #3).

## Test Plan
- [ ] `pytest tests/synthesis_worker/test_trusted_documents.py` — SDL → docs walker
- [ ] `pytest tests/synthesis_worker/test_cosmo_writer.py` — replay branch + offline soft-fail
- [ ] `pytest tests/synthesis_worker/test_pipeline_contract.py` — pipeline emits docs
- [ ] `pytest tests/test_api_endpoints.py` — /protocols endpoint
- [ ] `pytest tests/test_e2e_smoke.py` — end-to-end still green
- [ ] Manual: `make web`, click an agent tile, copy each chip, curl/grpcurl each URL
- [ ] Manual: `python scripts/prewarm_demo.py` then `redis-cli HGET us:agent:agent_alpha:protocols endpoints`
EOF
)"
```

**Step 3: Auto-review the PR**

`gh pr diff` → walk diff for: invariants, secrets, schema-breaking changes, replay coverage. Fix any issues as new commits to the same branch.

**Step 4: Approve + merge**

```bash
gh pr review --approve -b "Automated review passed: invariants held, replay branch present, tests green"
gh pr merge --squash --delete-branch
```

---

## Risks + fallbacks

1. **`wgc operations push` may not exist in v0.115.0 of wgc.** Probe in Task 0; if it doesn't, the four-chip UI still works (we cache endpoints in Redis ourselves) but the live router won't actually route gRPC/REST. In that case, the demo beat changes from "four real protocols" to "four-protocol surface — gRPC/REST stubs respond from the router stub" (still a credible Wundergraph beat) and we file a follow-up to upgrade wgc.
2. **The Cosmo Router config field for Connect may be named differently** (e.g. `connect_rpc:` or under `engine:`). Adjust to match the live router's startup error. The router fails fast on unknown keys.
3. **The seed subgraphs `agent_alpha` / `agent_beta` may not have a working backing service in offline dev** (Apollo `:4001/graphql` services are not running locally). The chips will render the URLs regardless; clicking through gives a meaningful 502 from the router, which is fine for the wall view. Live demo uses pre-warmed replay agents that DO route.
4. **EDFS subscriptions won't be exposed via Connect** (intentional — Subscriptions are skipped in the trusted-doc walker).

## Out of scope (explicit)

- Cosmo Connect *Router Plugins* / gRPC subgraphs (the producer-side rewrite). File `docs/plans/2026-04-26-cosmo-connect-plugins.md` later if there's appetite.
- Wundergraph Hub integration. Conceptually overlaps with Dream Query; would muddy the narrative.
- Replacing Apollo Server in `agent-template`. Not needed — Trusted Documents are pure consumer-side.
