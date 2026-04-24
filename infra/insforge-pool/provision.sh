#!/usr/bin/env bash
# Manually pre-provision 3 InsForge 2.0 backends for the demo.
# architecture.md §18 risk #3 — "manual pool of 3 is fine for demo."
#
# For each slot:
#   1. Call the Remote OAuth MCP admin endpoint to create a tenant.
#   2. Receive a Postgres URI + PostgREST URL + MCP OAuth client_id/secret.
#   3. Seed the schema from architecture.md §8 (recording, synthesis_run, agent, ...).
#   4. Write the connection URI to .env-provisioned AND push to
#      Redis `insforge:pool:available` Set so the synthesis worker can claim a
#      free slot atomically (SRANDMEMBER + SREM).
#
# If you are running this before the demo and InsForge is down: bail loudly.
# There is no silent fallback — the pitch requires all 3 slots warm.
set -euo pipefail

: "${INSFORGE_ADMIN_URL:?set to https://<your-tenant>.insforge.dev/admin}"
: "${INSFORGE_ADMIN_TOKEN:?set to the admin API token}"
: "${REDIS_URL:=redis://localhost:6379}"

POOL_SIZE="${POOL_SIZE:-3}"
ENV_OUT="${ENV_OUT:-.env-provisioned}"
SCHEMA_SQL="${SCHEMA_SQL:-infra/insforge-pool/schema.sql}"

log() { printf '[insforge-pool] %s\n' "$*" >&2; }

command -v jq >/dev/null   || { echo "jq required"    >&2; exit 127; }
command -v curl >/dev/null || { echo "curl required"  >&2; exit 127; }
command -v redis-cli >/dev/null || { echo "redis-cli required" >&2; exit 127; }

log "health-check InsForge admin (${INSFORGE_ADMIN_URL})"
curl -sSf -H "Authorization: Bearer ${INSFORGE_ADMIN_TOKEN}" \
     "${INSFORGE_ADMIN_URL}/healthz" >/dev/null

: >"${ENV_OUT}"
log "wiping stale pool in redis (${REDIS_URL})"
redis-cli -u "${REDIS_URL}" DEL insforge:pool:available >/dev/null
redis-cli -u "${REDIS_URL}" DEL insforge:pool:assigned  >/dev/null

for slot in $(seq 0 $((POOL_SIZE - 1))); do
  label="understudy-demo-slot-${slot}"
  log "provisioning slot ${slot} (${label})"

  resp=$(curl -sSf -X POST "${INSFORGE_ADMIN_URL}/tenants" \
      -H "Authorization: Bearer ${INSFORGE_ADMIN_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "$(jq -n --arg label "${label}" '{
            label:          $label,
            oauth_mcp:      true,
            postgrest:      true,
            model_gateway:  true,
            edge_functions: true
          }')")

  tenant_id=$(echo "${resp}" | jq -r '.id')
  pg_uri=$(   echo "${resp}" | jq -r '.postgres_uri')
  rest_url=$( echo "${resp}" | jq -r '.postgrest_url')
  mcp_url=$(  echo "${resp}" | jq -r '.remote_oauth_mcp.url')
  mcp_cid=$(  echo "${resp}" | jq -r '.remote_oauth_mcp.client_id')
  mcp_sec=$(  echo "${resp}" | jq -r '.remote_oauth_mcp.client_secret')

  if [ -f "${SCHEMA_SQL}" ]; then
    log "seeding schema.sql into slot ${slot}"
    psql "${pg_uri}" -f "${SCHEMA_SQL}" >/dev/null
  else
    log "WARN: ${SCHEMA_SQL} not found — skipping seed"
  fi

  {
    printf 'INSFORGE_SLOT_%d_TENANT_ID=%s\n' "${slot}" "${tenant_id}"
    printf 'INSFORGE_SLOT_%d_PG_URI=%s\n'    "${slot}" "${pg_uri}"
    printf 'INSFORGE_SLOT_%d_REST_URL=%s\n'  "${slot}" "${rest_url}"
    printf 'INSFORGE_SLOT_%d_MCP_URL=%s\n'   "${slot}" "${mcp_url}"
    printf 'INSFORGE_SLOT_%d_MCP_CID=%s\n'   "${slot}" "${mcp_cid}"
    printf 'INSFORGE_SLOT_%d_MCP_SEC=%s\n'   "${slot}" "${mcp_sec}"
  } >>"${ENV_OUT}"

  slot_json=$(jq -n \
      --arg slot "${slot}" --arg tenant "${tenant_id}" \
      --arg pg "${pg_uri}" --arg rest "${rest_url}" \
      --arg mcp "${mcp_url}" --arg cid "${mcp_cid}" --arg sec "${mcp_sec}" \
      '{slot:$slot, tenant:$tenant, pg_uri:$pg, rest_url:$rest,
        mcp_url:$mcp, client_id:$cid, client_secret:$sec}')
  redis-cli -u "${REDIS_URL}" SADD insforge:pool:available "${slot_json}" >/dev/null

  log "slot ${slot} provisioned → tenant=${tenant_id}"
done

avail=$(redis-cli -u "${REDIS_URL}" SCARD insforge:pool:available)
log "done — ${avail} slots available in redis (insforge:pool:available), env at ${ENV_OUT}"
