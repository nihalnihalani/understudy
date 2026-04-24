---
name: verify-supply-chain
description: Verify a generated agent image's cosign signature + SLSA L2 provenance + SBOM attestation against Fulcio/Rekor. Use before demo, before merging infra/ changes, or when a reviewer asks for the supply-chain receipt.
---

# verify-supply-chain

Run the README quickstart §5 verification against a published agent image. Mirrors `scripts/verify_release.sh`.

## Required tools

- `cosign` (`brew install cosign`)
- `docker` or `crane` (for digest resolution)

## Inputs

- `IMAGE` — defaults to `ghcr.io/nihalnihalani/understudy-agent-base:latest`
- `BUILDER_REF` — defaults to `https://github.com/nihalnihalani/understudy/.github/workflows/release.yml@refs/heads/main`

## Steps

```bash
IMAGE="${IMAGE:-ghcr.io/nihalnihalani/understudy-agent-base:latest}"
BUILDER_REF="${BUILDER_REF:-https://github.com/nihalnihalani/understudy/.github/workflows/release.yml@refs/heads/main}"
ISSUER="https://token.actions.githubusercontent.com"

# 1. Cosign signature (Fulcio keyless)
cosign verify \
  --certificate-identity "$BUILDER_REF" \
  --certificate-oidc-issuer "$ISSUER" \
  "$IMAGE"

# 2. SLSA L2 provenance attestation
cosign verify-attestation \
  --type slsaprovenance \
  --certificate-identity "$BUILDER_REF" \
  --certificate-oidc-issuer "$ISSUER" \
  "$IMAGE"

# 3. SBOM attestation
cosign verify-attestation \
  --type spdxjson \
  --certificate-identity "$BUILDER_REF" \
  --certificate-oidc-issuer "$ISSUER" \
  "$IMAGE"
```

## Acceptance

All three commands print `Verified OK` and at least one Rekor log index. If any fails, do **not** ship — supply-chain is a CLAUDE.md hard invariant.
