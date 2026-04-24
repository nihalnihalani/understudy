---
name: env-audit
description: Detect env var drift between .env.example and what code actually reads across Python, TypeScript, YAML, and shell. Use when onboarding a teammate, reviewing a PR that adds env lookups, or debugging "why is this config not taking effect" — catches vars that are read by code but never declared.
---

# env-audit

Audit env-var drift. The `.env.example` should declare every variable the code actually reads; the code should not reference variables that aren't declared. This skill finds both cases — drift in either direction.

Motivation: understudy's `.env.example` currently omits `INSFORGE_OAUTH_JWKS_URL`, `INSFORGE_OAUTH_ISSUER`, `INSFORGE_OAUTH_AUDIENCE`, `INSFORGE_ADMIN_URL`, `INSFORGE_ADMIN_TOKEN`, and `MODEL_GATEWAY_URL` — all of which the code reads. This skill surfaces that class of gap before it bites.

## Required tools

- `rg` (ripgrep — `brew install ripgrep`)
- `sort`, `comm`, `awk` (stock POSIX)

## Inputs

- `ROOT` — repo root. Defaults to `$(git rev-parse --show-toplevel)`.
- `ENV_FILE` — the declared-env source. Defaults to `$ROOT/.env.example`.

## Steps

```bash
ROOT="${ROOT:-$(git rev-parse --show-toplevel)}"
ENV_FILE="${ENV_FILE:-$ROOT/.env.example}"
cd "$ROOT"

DECLARED="$(mktemp)"
REFERENCED="$(mktemp)"
trap 'rm -f "$DECLARED" "$REFERENCED"' EXIT

# 1. Declared vars in .env.example (strip comments + blanks, keep NAME before =).
awk -F= '/^[A-Z][A-Z0-9_]*=/{print $1}' "$ENV_FILE" | sort -u > "$DECLARED"

# 2. Referenced vars across the repo. Exclude generated/vendored dirs.
EXCLUDES=(-g '!node_modules' -g '!.venv' -g '!dist' -g '!build' -g '!.git' -g '!*.lock')

{
  # Python: os.environ.get("X"), os.getenv("X"), os.environ["X"]
  rg -oN "${EXCLUDES[@]}" -t py \
    -e 'os\.environ(?:\.get)?\(["'"'"']([A-Z_][A-Z0-9_]+)["'"'"']' \
    -e 'os\.getenv\(["'"'"']([A-Z_][A-Z0-9_]+)["'"'"']' \
    -e 'os\.environ\[["'"'"']([A-Z_][A-Z0-9_]+)["'"'"']\]' \
    -r '$1'
  # Shell / YAML / compose / Dockerfile: ${VAR} and ${VAR:-default} and ${VAR:?msg}
  rg -oN "${EXCLUDES[@]}" -t sh -t yaml -t docker -t bash \
    -e '\$\{([A-Z_][A-Z0-9_]+)[:?\-}]' \
    -r '$1'
  # TS/JS: process.env.X and import.meta.env.X (also VITE_* variants)
  rg -oN "${EXCLUDES[@]}" -t ts -t js -t tsx \
    -e 'process\.env\.([A-Z_][A-Z0-9_]+)' \
    -e 'import\.meta\.env\.([A-Z_][A-Z0-9_]+)' \
    -r '$1'
} | sort -u > "$REFERENCED"

echo "=== Read by code but NOT declared in $ENV_FILE (fix: add to .env.example) ==="
comm -23 "$REFERENCED" "$DECLARED"

echo
echo "=== Declared in $ENV_FILE but NOT read by code (cosmetic; may be stale) ==="
comm -13 "$REFERENCED" "$DECLARED"
```

## Acceptance

- The first list ("read but not declared") is **empty** in a healthy tree. Any entry means teammates who follow `.env.example` will hit a silent misconfiguration.
- The second list is informational — a non-empty list may just reflect vars only used in prod infra; don't prune without thinking.

## Known caveats

- **Dynamic names are missed.** Patterns like `os.environ[f"INSFORGE_SLOT_{i}_PG_URI"]` or `process.env[name]` cannot be resolved statically. Eyeball `infra/insforge-pool/provision.sh` and anywhere else that templates slot indices.
- **Lowercase env vars are skipped.** The regexes require the first character to be uppercase, which matches project convention. If you adopt lowercase vars, widen the pattern.
- **False positives from regex names in strings.** If a source file contains a string literal that looks like an env lookup (e.g. in a comment or a docstring), it will be flagged. Review the hits, don't autofix.
- **`.env` (real secrets) is not scanned on purpose.** Only `.env.example` is treated as the declared source.
