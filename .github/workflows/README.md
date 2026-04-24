# infra/github-actions — CI workflows

Source of truth for the two workflows; symlinked/copied into `.github/workflows/` during task #8.

- `release.yml` — Chainguard build, SLSA L2 attest, cosign Fulcio keyless sign, Rekor log, GHCR push (architecture.md §6, §12).
- `ci.yml` — lint (ruff) + types (mypy) + tests (pytest) on every PR (task #11).

Owner task: **#8 — Build Chainguard supply-chain CI**.
