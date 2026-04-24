#!/usr/bin/env bash
# verify_release.sh — the two commands the presenter types at 1:40-2:00.
#
# Runs exactly the flow in README Quickstart step 5:
#   1. cosign verify ... ghcr.io/nihalnihalani/understudy-agent-base:latest
#   2. cosign verify-attestation --type slsaprovenance ... same image
#
# Colored output so the audience can read it from the back of the room.
# Exits non-zero if either verification fails — no "demo magic" false positives.
#
# architecture.md §6 (SLSA L2 flow), §15 (demo beat 1:40-2:00).
set -euo pipefail

IMAGE="${1:-ghcr.io/nihalnihalani/understudy-agent-base:latest}"

CERT_IDENTITY="https://github.com/nihalnihalani/understudy/.github/workflows/release.yml@refs/heads/main"
CERT_OIDC_ISSUER="https://token.actions.githubusercontent.com"

if [ -t 1 ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RESET=$'\033[0m'
  GREEN=$'\033[32m'; RED=$'\033[31m'; CYAN=$'\033[36m'; YELLOW=$'\033[33m'
else
  BOLD=""; DIM=""; RESET=""; GREEN=""; RED=""; CYAN=""; YELLOW=""
fi

banner() { printf "\n%s%s=== %s ===%s\n" "${BOLD}" "${CYAN}" "$1" "${RESET}"; }
ok()     { printf "  %s✔%s %s\n" "${GREEN}" "${RESET}" "$1"; }
fail()   { printf "  %s✘%s %s\n" "${RED}"   "${RESET}" "$1"; }
info()   { printf "  %s↳%s %s\n" "${DIM}"   "${RESET}" "$1"; }
kv()     { printf "  %s%-18s%s %s\n" "${YELLOW}" "$1" "${RESET}" "$2"; }

command -v cosign >/dev/null 2>&1 || {
  fail "cosign not found on PATH — install via \`brew install cosign\` or Chainguard docs"
  exit 127
}

banner "Understudy supply-chain verification (SLSA L2)"
kv "image:"            "${IMAGE}"
kv "cert-identity:"    "${CERT_IDENTITY}"
kv "cert-oidc-issuer:" "${CERT_OIDC_ISSUER}"
kv "cosign:"           "$(cosign version 2>/dev/null | awk '/GitVersion/{print $2; exit}')"

banner "1/2  cosign verify (keyless signature via Fulcio, anchored in Rekor)"
if cosign verify \
      --certificate-identity   "${CERT_IDENTITY}" \
      --certificate-oidc-issuer "${CERT_OIDC_ISSUER}" \
      "${IMAGE}" >/tmp/us-cosign-verify.json 2>/tmp/us-cosign-verify.err; then
  ok "signature valid — identity + OIDC issuer match CI"
  info "Rekor UUID: $(jq -r '.[0].optional.Bundle.Payload.logIndex // "n/a"' /tmp/us-cosign-verify.json 2>/dev/null || echo n/a)"
else
  fail "cosign verify FAILED"
  cat /tmp/us-cosign-verify.err >&2
  exit 1
fi

banner "2/2  cosign verify-attestation --type slsaprovenance (SLSA L2 predicate)"
if cosign verify-attestation \
      --type slsaprovenance \
      --certificate-identity   "${CERT_IDENTITY}" \
      --certificate-oidc-issuer "${CERT_OIDC_ISSUER}" \
      "${IMAGE}" >/tmp/us-cosign-attest.json 2>/tmp/us-cosign-attest.err; then
  ok "SLSA L2 provenance attestation valid"
  builder_id=$(jq -r '.payload' /tmp/us-cosign-attest.json 2>/dev/null \
               | base64 -d 2>/dev/null \
               | jq -r '.predicate.builder.id // "n/a"' 2>/dev/null || echo n/a)
  info "builder.id: ${builder_id}"
else
  fail "cosign verify-attestation FAILED"
  cat /tmp/us-cosign-attest.err >&2
  exit 1
fi

banner "Result"
printf "  %s%sVERIFIED%s — %s\n\n" "${GREEN}" "${BOLD}" "${RESET}" "${IMAGE}"
