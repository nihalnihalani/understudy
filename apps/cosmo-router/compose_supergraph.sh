#!/usr/bin/env bash
# Compose every SDL file in subgraphs/ into a single supergraph.json that
# the Cosmo Router polls (see config.yaml `execution_config.file.path`).
#
# Preferred path: `wgc router compose` with a subgraph manifest.
# Fallback: invoke the local offline composer (scripts/offline_compose.py)
# so demos still work when Cosmo Cloud is unreachable.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROUTER_DIR="${HERE}"
SUBGRAPHS_DIR="${ROUTER_DIR}/subgraphs"
OUT_FILE="${ROUTER_DIR}/supergraph.json"
MANIFEST="${ROUTER_DIR}/compose.yaml"

if [[ ! -d "${SUBGRAPHS_DIR}" ]]; then
  echo "no subgraphs directory at ${SUBGRAPHS_DIR}" >&2
  exit 1
fi

# Build a compose manifest from whatever SDL files exist. Routing URL is
# derived from the filename: subgraphs/agent_alpha.graphql -> agent_alpha:4001.
{
  echo "version: 1"
  echo "subgraphs:"
  for sdl in "${SUBGRAPHS_DIR}"/*.graphql; do
    [[ -e "${sdl}" ]] || continue
    name="$(basename "${sdl}" .graphql)"
    echo "  - name: ${name}"
    echo "    schema:"
    echo "      file: subgraphs/${name}.graphql"
    echo "    routing_url: http://${name}:4001/graphql"
  done
} > "${MANIFEST}"

if command -v wgc >/dev/null 2>&1; then
  echo "composing via wgc router compose -> ${OUT_FILE}"
  ( cd "${ROUTER_DIR}" && wgc router compose --input "${MANIFEST}" --out "${OUT_FILE}" )
else
  echo "wgc not installed — falling back to offline composer"
  python3 "${ROUTER_DIR}/scripts/offline_compose.py" \
    --manifest "${MANIFEST}" \
    --out "${OUT_FILE}"
fi

echo "wrote ${OUT_FILE}"
