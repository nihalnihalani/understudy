# infra/insforge-pool — InsForge 2.0 warm-pool provisioning

Three pre-warmed InsForge 2.0 backends for the demo. Each slot exposes:

- **Remote OAuth MCP** endpoint — generated agents authenticate natively, no stdio bridge (architecture.md §5, §17).
- **PostgREST** auto-API over the seeded schema from architecture.md §8 (recording, synthesis_run, agent, agent_memories, ...).
- **Model Gateway** fallback routes (Anthropic, Grok) — used by §13 "Gemini 3 rate limit" row.
- **Edge Function** slots — optional, populated as agents need custom server-side logic.

## Why only 3 slots

Dynamic pool management is a week of work we do not have. Per architecture.md §18 risk #3, a **manually pre-provisioned pool of 3** covers the demo: judges see three agents synthesized live, a fourth would exhaust the pool. That is an honest limit, not a hidden one.

## Files

| File | Purpose |
|---|---|
| `provision.sh` | One-shot: create 3 InsForge tenants, seed schema, write `.env-provisioned`, register Redis `insforge:pool:available` Set. |
| `warm-pool.yaml` | Source-of-truth slot declaration (pool_size, labels). |
| `schema.sql` | DDL for the §8 ER diagram — seeded into every slot. |

## How it works

```text
provision.sh
  └─ for slot in 0..2:
       ├─ POST ${INSFORGE_ADMIN_URL}/tenants  → tenant_id + pg_uri + mcp creds
       ├─ psql ${pg_uri} -f schema.sql        → seed §8 tables
       ├─ append to .env-provisioned          → human-readable export
       └─ SADD insforge:pool:available "<json>" in redis

synthesis worker
  └─ SRANDMEMBER insforge:pool:available → claim
       └─ SREM insforge:pool:available + SADD insforge:pool:assigned
```

The worker claims atomically (`SPOP` would also work — we keep `SRANDMEMBER`+`SREM` so we can inspect the slot JSON before committing to it).

## Refilling the pool after the demo

```bash
# Tear down old tenants (manual — InsForge admin UI), then:
export INSFORGE_ADMIN_URL="https://<tenant>.insforge.dev/admin"
export INSFORGE_ADMIN_TOKEN="$(op read op://vault/insforge/admin-token)"
export REDIS_URL="redis://..."
./infra/insforge-pool/provision.sh
```

## Failure modes this pool touches

See architecture.md §13:

- **"InsForge MCP OAuth drift" (401 from remote MCP)** — the provisioning script writes fresh client credentials per slot. If tokens rotate mid-demo, `provision.sh` is the recovery path: re-run, new `insforge:pool:available` members replace stale ones. Generated agents fail-fast on 401 and re-claim a slot.

## What this deliberately does NOT do

- Auto-refill on slot exhaustion. If a judge triggers 4 synthesis runs, the 4th waits — we do not silently fall back to a shared slot.
- Dynamic sharding. One demo → one Postgres per slot. No cross-slot JOINs.
- Schema migrations at claim time. Schema is seeded once at provision; new agents see the same shape.

Owner task: **#9 — Build Fly.io deployment infra** (this directory), supported by **#5 — Build agent template + TinyFish runtime** (worker-side claim logic).
