# InsForge Migrations — Apply Playbook

**Audience:** charlie (project owner) + any teammate priming a fresh InsForge tenant.
**Tenant verified:** `https://xb6r5fzs.us-west.insforge.app` on 2026-04-24.

## TL;DR — Current State

- `GET /api/database/migrations` → `{"migrations": []}` (zero migrations applied)
- All ten tables from `migrations/20260424214016_initial-schema.sql` are missing — the
  REST API returns `42P01 relation "public.<table>" does not exist` for each:
  `recording`, `synthesis_run`, `dream_queries`, `image`, `slsa_attestation`,
  `sbom`, `agent`, `agent_memories`, `tinyfish_skills_used`, `agent_runs`.
- The api/worker fall back to `MemoryStore` when InsForge writes 4xx, so the app
  *runs* — but every InsForge `/api/database/records/...` write is currently a
  no-op against the tenant. Nothing is persisted server-side until the
  migrations land.

## Why This Matters

`apps/api/store.py:368` chooses `InsforgeStore` only when both `INSFORGE_URL` and
`INSFORGE_API_KEY` are set. Both are set locally, so the API is *trying* to
write rows to InsForge. Those writes silently fail and the writer logs a warning
(`apps/synthesis-worker/insforge_writer.py:114`). The supply-chain receipt
viewer + agent wall on the frontend will read empty `data: []` until the schema
is in place.

## How To Apply (Recommended — REST API)

InsForge exposes an admin endpoint that accepts and persists a migration:

```
POST {INSFORGE_URL}/api/database/migrations
Authorization: Bearer ${INSFORGE_API_KEY}
Content-Type: application/json
Body: { "version": "<UTC timestamp>", "name": "<slug>", "sql": "<full SQL>" }
```

Verified by probe: `POST /api/database/migrations` with `{}` returns
`400 INVALID_INPUT message: "version: Required, name: Required, sql: Required"`,
confirming the body shape.

### Step 1 — Source `.env` (gives you `$INSFORGE_URL`, `$INSFORGE_API_KEY`)

```bash
cd /Users/charlie/hack0424/understudy
set -a; source .env; set +a
echo "$INSFORGE_URL"   # → https://xb6r5fzs.us-west.insforge.app
```

### Step 2 — Apply `20260424214016_initial-schema.sql`

```bash
SQL=$(jq -Rs . < migrations/20260424214016_initial-schema.sql)
curl -i -X POST "$INSFORGE_URL/api/database/migrations" \
  -H "Authorization: Bearer $INSFORGE_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"version\":\"20260424214016\",\"name\":\"initial-schema\",\"sql\":$SQL}"
```

Expected: `201 Created` (or `200`) with the migration recorded. If the response
is `409 Conflict` or similar, the migration was already partially applied —
inspect `GET /api/database/migrations` first.

### Step 3 — Apply `20260424220227_rls-policies.sql`

```bash
SQL=$(jq -Rs . < migrations/20260424220227_rls-policies.sql)
curl -i -X POST "$INSFORGE_URL/api/database/migrations" \
  -H "Authorization: Bearer $INSFORGE_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"version\":\"20260424220227\",\"name\":\"rls-policies\",\"sql\":$SQL}"
```

### Step 4 — Verify

```bash
# Both migrations should appear:
curl -s -H "Authorization: Bearer $INSFORGE_API_KEY" \
  "$INSFORGE_URL/api/database/migrations" | jq

# All ten tables should now respond 200 with {data: []}:
for t in recording synthesis_run dream_queries image slsa_attestation \
         sbom agent agent_memories tinyfish_skills_used agent_runs; do
  code=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $INSFORGE_API_KEY" \
    "$INSFORGE_URL/api/database/records/$t?limit=1")
  echo "$t -> HTTP $code"
done
```

All ten lines should print `HTTP 200` (currently they all print `HTTP 404`).

## Fallback — Apply via InsForge Dashboard

If the REST endpoint rejects the request (CORS, body size, etc.), the dashboard
SQL editor is the manual path:

1. Open `https://xb6r5fzs.us-west.insforge.app` (or the dashboard URL surfaced
   from Project Settings → General).
2. Database → SQL Editor → paste contents of `migrations/20260424214016_initial-schema.sql` → Run.
3. Repeat with `migrations/20260424220227_rls-policies.sql`.
4. Re-run Step 4 above to verify.

## Rollback

There is no automated rollback. If the schema needs to be dropped, run
`DROP TABLE` statements in the dashboard SQL editor in **reverse FK order**:

```sql
DROP TABLE IF EXISTS agent_runs CASCADE;
DROP TABLE IF EXISTS tinyfish_skills_used CASCADE;
DROP TABLE IF EXISTS agent_memories CASCADE;
DROP TABLE IF EXISTS agent CASCADE;
DROP TABLE IF EXISTS sbom CASCADE;
DROP TABLE IF EXISTS slsa_attestation CASCADE;
DROP TABLE IF EXISTS image CASCADE;
DROP TABLE IF EXISTS dream_queries CASCADE;
DROP TABLE IF EXISTS synthesis_run CASCADE;
DROP TABLE IF EXISTS recording CASCADE;
```

Then delete the rows in `_migrations` (or whatever the InsForge bookkeeping
table is — check the dashboard) so the version numbers can be re-applied.

## After Applying — Sanity Checks

- `make api` → `curl localhost:8080/healthz` should still report `insforge: ok`.
- Trigger a fresh upload through the UI; tail
  `redis-cli XRANGE us:trace:<synth_id> - +` and confirm the worker logs
  successful `POST /api/database/records/recording` (no
  `insforge_writer disabled` warnings).
- Frontend: `apps/web` AgentWall + Supply-Chain receipt viewer should now show
  rows instead of the empty placeholder.

## Notes

- `infra/insforge-pool/schema.sql` is the bespoke per-tenant warm-pool schema
  applied by `infra/insforge-pool/provision.sh`. It is structurally equivalent
  to migration 1 but is **not** the canonical path for the linked
  `understudy` project — use the REST `migrations` endpoint above.
- The CI release workflow (`.github/workflows/release.yml`) writes
  `image` / `slsa_attestation` / `sbom` rows after a release. Until these
  migrations apply, those CI POSTs will silently 4xx with `42P01`.
