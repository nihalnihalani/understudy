# infra/chainguard — Supply chain (SLSA L2, cosign, Fulcio, Rekor)

Every Understudy image is built on Chainguard `wolfi-base`, carries an SLSA Build Level 2 provenance predicate, a build-time SBOM (not post-scan), and a keyless cosign signature anchored in the Rekor transparency log (architecture.md §6).

- `Dockerfile.wolfi` — base image shared by the synthesis API and router.
- `Dockerfile.agent.tmpl` — per-agent template rendered during synthesis.
- `slsa-config.yaml` — builder identity + OIDC issuer + Fulcio/Rekor URLs.

Verification runs on boot (Fly pre-start hook; Mac Mini launchd wrapper). **SLSA L2 is non-negotiable — refuse to start if verification fails.**

Owner task: **#8 — Build Chainguard supply-chain CI**.
