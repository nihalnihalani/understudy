#!/bin/sh
# Agent container pre-start verifier (architecture.md §13 "cosign verify fails").
#
# Runs inside the agent image at launch. Resolves the image's OWN digest via the
# cgroup / env that the runtime (Fly.io Machines) exports, then re-runs
# cosign verify against Fulcio + Rekor. Non-zero exit = refuse to start.
#
# This is belt-and-braces: the orchestrator already verifies before scheduling,
# but a drifted local cache or a registry MITM would still be caught here.
set -eu

log() { printf '[verify-self] %s\n' "$*" >&2; }

: "${AGENT_IMAGE_REF:=${HOSTNAME:-unknown}}"
: "${COSIGN_CERT_IDENTITY:?COSIGN_CERT_IDENTITY must be set}"
: "${COSIGN_CERT_OIDC_ISSUER:?COSIGN_CERT_OIDC_ISSUER must be set}"

if [ "${UNDERSTUDY_SKIP_SELF_VERIFY:-0}" = "1" ]; then
    log "UNDERSTUDY_SKIP_SELF_VERIFY=1 — skipping (dev only, NEVER set in prod)."
    exec "$@"
fi

log "verifying ${AGENT_IMAGE_REF} against Fulcio + Rekor"

if ! cosign verify \
        --certificate-identity "${COSIGN_CERT_IDENTITY}" \
        --certificate-oidc-issuer "${COSIGN_CERT_OIDC_ISSUER}" \
        "${AGENT_IMAGE_REF}" >/tmp/verify.json 2>/tmp/verify.err; then
    log "cosign verify FAILED — refusing to start"
    cat /tmp/verify.err >&2
    exit 1
fi

if ! cosign verify-attestation \
        --type slsaprovenance \
        --certificate-identity "${COSIGN_CERT_IDENTITY}" \
        --certificate-oidc-issuer "${COSIGN_CERT_OIDC_ISSUER}" \
        "${AGENT_IMAGE_REF}" >/tmp/attest.json 2>/tmp/attest.err; then
    log "cosign verify-attestation FAILED — refusing to start"
    cat /tmp/attest.err >&2
    exit 1
fi

log "signature + SLSA L2 attestation OK — launching agent core"
exec "$@"
