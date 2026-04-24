#!/bin/sh
# Fly Machine pre-start — cosign verify the pinned image, then exec the app.
# Non-zero exit here → Fly never marks the machine healthy → deploy rejected.
# architecture.md §12 + §13 "SLSA L2 verify fails" row.
set -eu

log() { printf '[fly-start] %s\n' "$*"; }

: "${COSIGN_CERT_IDENTITY:?required}"
: "${COSIGN_CERT_OIDC_ISSUER:?required}"
: "${IMAGE_REF:?required}"

log "cosign verify ${IMAGE_REF}"
cosign verify \
  --certificate-identity   "${COSIGN_CERT_IDENTITY}" \
  --certificate-oidc-issuer "${COSIGN_CERT_OIDC_ISSUER}" \
  "${IMAGE_REF}" >/tmp/fly-verify.json

log "cosign verify-attestation --type slsaprovenance"
cosign verify-attestation \
  --type slsaprovenance \
  --certificate-identity   "${COSIGN_CERT_IDENTITY}" \
  --certificate-oidc-issuer "${COSIGN_CERT_OIDC_ISSUER}" \
  "${IMAGE_REF}" >/tmp/fly-attest.json

log "supply chain verified — launching app"
exec python -m uvicorn apps.api.main:app --host 0.0.0.0 --port "${PORT:-8080}"
