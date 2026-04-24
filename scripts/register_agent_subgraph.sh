#!/usr/bin/env bash
# Register a newly synthesized agent's subgraph with the Cosmo federation
# gateway. Called by the Cosmo MCP driver (apps/cosmo-mcp-driver/) at the
# end of the Dream Query workflow (architecture.md §4 — the
# schema_change_proposal_workflow step).
#
# Usage:
#   scripts/register_agent_subgraph.sh \
#     --name agent_alpha \
#     --sdl apps/cosmo-router/subgraphs/agent_alpha.graphql \
#     --routing-url http://agent_alpha:4001/graphql
#
# Behavior:
#   1. Validate inputs (name pattern, SDL file exists).
#   2. If wgc + COSMO_API_KEY are available, run
#        wgc subgraph create   (idempotent — treats "already exists" as ok)
#        wgc subgraph publish  (runs schema_change_proposal_workflow)
#        wgc federated-graph check
#   3. Copy the SDL into apps/cosmo-router/subgraphs/ if it isn't already there.
#   4. Re-run apps/cosmo-router/compose_supergraph.sh so the router's
#      polled supergraph.json picks up the new subgraph.
#
# Offline mode: if `wgc` is missing or `COSMO_API_KEY` is unset, the
# cloud-registration steps are skipped with a warning and the script falls
# through to local composition — critical for hackathon demos without network.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROUTER_DIR="${REPO_ROOT}/apps/cosmo-router"
SUBGRAPHS_DIR="${ROUTER_DIR}/subgraphs"

NAME=""
SDL=""
ROUTING_URL=""
NAMESPACE="${COSMO_NAMESPACE:-default}"
FEDERATED_GRAPH="${COSMO_FEDERATED_GRAPH:-understudy}"

usage() {
  cat >&2 <<EOF
register_agent_subgraph.sh — publish a synthesized agent's subgraph.

Required:
  --name           subgraph name, matches /^[a-z][a-z0-9_]*$/
  --sdl            path to the subgraph SDL (.graphql)
  --routing-url    HTTP URL where the generated agent serves its subgraph

Optional:
  --namespace      Cosmo namespace (default: \$COSMO_NAMESPACE or 'default')
  --federated-graph Cosmo federated graph name (default: 'understudy')

Env:
  COSMO_API_KEY    required for cloud-side wgc calls; when unset, script
                   stays local and only re-composes supergraph.json.
EOF
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)            NAME="$2"; shift 2 ;;
    --sdl)             SDL="$2"; shift 2 ;;
    --routing-url)     ROUTING_URL="$2"; shift 2 ;;
    --namespace)       NAMESPACE="$2"; shift 2 ;;
    --federated-graph) FEDERATED_GRAPH="$2"; shift 2 ;;
    -h|--help)         usage ;;
    *) echo "unknown flag: $1" >&2; usage ;;
  esac
done

[[ -n "${NAME}" && -n "${SDL}" && -n "${ROUTING_URL}" ]] || usage

if ! [[ "${NAME}" =~ ^[a-z][a-z0-9_]*$ ]]; then
  echo "invalid --name '${NAME}': must match [a-z][a-z0-9_]*" >&2
  exit 1
fi
if [[ ! -f "${SDL}" ]]; then
  echo "SDL file not found: ${SDL}" >&2
  exit 1
fi

mkdir -p "${SUBGRAPHS_DIR}"
DEST="${SUBGRAPHS_DIR}/${NAME}.graphql"
# Copy into the router's subgraphs dir unless the caller wrote there already.
if [[ "$(cd "$(dirname "${SDL}")" && pwd)/$(basename "${SDL}")" != "${DEST}" ]]; then
  cp "${SDL}" "${DEST}"
  echo "copied ${SDL} -> ${DEST}"
fi

if command -v wgc >/dev/null 2>&1 && [[ -n "${COSMO_API_KEY:-}" ]]; then
  export COSMO_API_KEY
  echo "registering with Cosmo Cloud (namespace=${NAMESPACE}, graph=${FEDERATED_GRAPH})"

  # create is idempotent-ish: swallow "already exists" so re-runs work.
  if ! wgc subgraph create "${NAME}" \
        --namespace "${NAMESPACE}" \
        --routing-url "${ROUTING_URL}" 2> >(tee /tmp/wgc_create.err >&2); then
    if grep -qi "already exists" /tmp/wgc_create.err; then
      echo "subgraph ${NAME} already exists — continuing to publish"
    else
      echo "wgc subgraph create failed" >&2
      exit 1
    fi
  fi

  # publish invokes schema_change_proposal_workflow server-side, which
  # triggers composition + live-traffic validation (architecture.md §4).
  wgc subgraph publish "${NAME}" \
    --namespace "${NAMESPACE}" \
    --schema "${DEST}"

  # Optional breaking-change gate against the federated graph.
  wgc federated-graph check "${FEDERATED_GRAPH}" \
    --namespace "${NAMESPACE}" || {
      echo "federated-graph check reported issues — inspect before promoting" >&2
    }
else
  echo "wgc or COSMO_API_KEY unavailable — skipping Cosmo Cloud registration (offline mode)"
fi

# Always re-compose locally so the router's on-disk supergraph.json
# reflects the new subgraph — this is what `execution_config.file` polls.
bash "${ROUTER_DIR}/compose_supergraph.sh"

echo "registered subgraph '${NAME}' (routing: ${ROUTING_URL})"
