#!/bin/bash
# Mac Mini pre-launch wrapper for TinyFish CLI (architecture.md §12).
#
# launchd (com.understudy.tinyfish) runs this on boot AND on crash. It MUST
# `cosign verify` the pinned agent image before launching TinyFish — the
# Mac Mini is the browser pool for generated agents, so an unverified image
# would let a bad actor drive a real Chromium.
#
# KeepAlive=true in the plist means a non-zero exit here loops through
# launchd's ThrottleInterval backoff. That is intentional: a verify failure
# should hot-loop, not silently start.
set -euo pipefail

log() { printf '[macmini-start] %s\n' "$*"; }

: "${IMAGE_REF:?IMAGE_REF not set — check macmini.plist EnvironmentVariables}"
: "${COSIGN_CERT_IDENTITY:?}"
: "${COSIGN_CERT_OIDC_ISSUER:?}"

mkdir -p /var/log/understudy

if ! command -v cosign >/dev/null 2>&1; then
    log "cosign not found — install via: brew install cosign"
    exit 127
fi

if ! command -v tinyfish >/dev/null 2>&1; then
    log "tinyfish CLI not found — install via: npm install -g @tinyfish/cli"
    exit 127
fi

log "cosign verify ${IMAGE_REF}"
cosign verify \
    --certificate-identity   "${COSIGN_CERT_IDENTITY}" \
    --certificate-oidc-issuer "${COSIGN_CERT_OIDC_ISSUER}" \
    "${IMAGE_REF}" \
  >/var/log/understudy/cosign-verify.json

log "cosign verify-attestation --type slsaprovenance ${IMAGE_REF}"
cosign verify-attestation \
    --type slsaprovenance \
    --certificate-identity   "${COSIGN_CERT_IDENTITY}" \
    --certificate-oidc-issuer "${COSIGN_CERT_OIDC_ISSUER}" \
    "${IMAGE_REF}" \
  >/var/log/understudy/cosign-attest.json

log "supply chain verified — launching TinyFish CLI browser pool"

# Exec so launchd sees the child's exit status (not this wrapper's).
exec tinyfish serve \
    --pool-size "${TINYFISH_POOL_SIZE:-8}" \
    --headful "${TINYFISH_HEADFUL:-true}" \
    --log-level info
