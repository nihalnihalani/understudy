# infra/fly — Fly.io Machine manifests

Fly Machines host the GraphQL + agent core; Mac Mini pool hosts TinyFish browsers (architecture.md §12).

Every manifest must include a cosign-verify pre-start hook that validates the pinned image digest against its SLSA L2 attestation via Fulcio cert + Rekor transparency log. Boot is refused if verification fails (architecture.md §6 and §13 "SLSA L2 verify fails").

Owner task: **#9 — Build Fly + Mac Mini deployment infra**.
