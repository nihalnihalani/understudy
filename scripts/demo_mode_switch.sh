#!/usr/bin/env bash
# Flip the running synthesis API between live / replay / hybrid without redeploying.
# Architecture.md §14 (Hermetic Demo Mode). Called as the stage kill-switch from
# docs/demo-runbook.md:14 — so it must work under stage pressure with no prompts.
#
# Surfaces updated:
#   1. Fly.io apps (understudy-synthesis, understudy-router when present)
#   2. Local Docker Compose stack (for local demo)
#
# Any surface that is unreachable logs a yellow WARN and continues — we'd rather
# flip the surfaces that ARE up than abort the switch on stage.
#
# Browser sessions run on TinyFish's hosted cloud; DEMO_MODE is not a concept
# there, and we never operated a Mac Mini / launchd surface.
#
# Set DRY_RUN=1 to print the commands without executing them.

set -euo pipefail

# --- color helpers -----------------------------------------------------------
if [[ -t 1 ]]; then
  RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; BLUE=$'\033[34m'; RESET=$'\033[0m'
else
  RED=""; GREEN=""; YELLOW=""; BLUE=""; RESET=""
fi

info()  { printf '%s[demo-mode]%s %s\n' "$BLUE"  "$RESET" "$*"; }
ok()    { printf '%s[demo-mode]%s %s\n' "$GREEN" "$RESET" "$*"; }
warn()  { printf '%s[demo-mode]%s %s\n' "$YELLOW" "$RESET" "$*" >&2; }
die()   { printf '%s[demo-mode]%s %s\n' "$RED"   "$RESET" "$*" >&2; exit 1; }

usage() {
  cat <<EOF
Usage: $(basename "$0") {live|replay|hybrid}

Flips DEMO_MODE across every running surface — Fly.io apps and local Docker
Compose. See architecture.md §14 for the mode semantics.

Modes:
  live     — every Gemini / Cosmo call hits the network (default; slow, realistic)
  replay   — every call short-circuits to us:replay:* / dream:* / langcache keys
             prewarmed by scripts/prewarm_demo.py (fast, hermetic, offline-safe)
  hybrid   — live for the first 8s of synthesis, replay after (stage default)

Env:
  DRY_RUN=1                 — print commands, do not execute
  FLY_SYNTH_APP             — override synthesis Fly app name (default: understudy-synthesis)
  FLY_ROUTER_APP            — override router Fly app name (default: understudy-router)
  COMPOSE_FILE              — override docker-compose file (default: docker-compose.yml)
  SKIP_FLY=1                — skip the Fly.io hop
  SKIP_COMPOSE=1            — skip the Docker Compose hop
EOF
}

if [[ $# -lt 1 ]]; then usage; exit 2; fi

mode="${1:-}"
case "${mode}" in
  live|replay|hybrid) ;;
  -h|--help)          usage; exit 0 ;;
  *)                  usage; die "invalid mode: ${mode}" ;;
esac

FLY_SYNTH_APP="${FLY_SYNTH_APP:-understudy-synthesis}"
FLY_ROUTER_APP="${FLY_ROUTER_APP:-understudy-router}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
DRY_RUN="${DRY_RUN:-0}"

run() {
  if [[ "$DRY_RUN" == "1" ]]; then
    printf '  %s(dry-run)%s %s\n' "$YELLOW" "$RESET" "$*"
    return 0
  fi
  eval "$@"
}

info "Switching DEMO_MODE -> ${mode}"

# --- 1. Fly.io ---------------------------------------------------------------
if [[ "${SKIP_FLY:-0}" != "1" ]]; then
  if command -v fly >/dev/null 2>&1 || command -v flyctl >/dev/null 2>&1; then
    fly_bin="$(command -v fly || command -v flyctl)"
    for app in "$FLY_SYNTH_APP" "$FLY_ROUTER_APP"; do
      info "Fly.io: setting DEMO_MODE=${mode} on app ${app}"
      if run "$fly_bin secrets set DEMO_MODE=${mode} -a ${app}"; then
        ok "Fly app ${app} updated"
      else
        warn "Fly app ${app} update failed (app may not exist — continuing)"
      fi
    done
  else
    warn "fly/flyctl not on PATH — skipping Fly.io hop"
  fi
else
  info "SKIP_FLY=1 — skipping Fly.io hop"
fi

# --- 2. Docker Compose (local demo) ------------------------------------------
if [[ "${SKIP_COMPOSE:-0}" != "1" ]]; then
  if command -v docker >/dev/null 2>&1 && [[ -f "$COMPOSE_FILE" ]]; then
    info "Docker Compose: bouncing stack with DEMO_MODE=${mode} (file=${COMPOSE_FILE})"
    if run "docker compose -f ${COMPOSE_FILE} down"; then
      ok "compose down ok"
    else
      warn "compose down failed (stack may not be running) — continuing"
    fi
    if run "DEMO_MODE=${mode} docker compose -f ${COMPOSE_FILE} up -d"; then
      ok "compose up ok with DEMO_MODE=${mode}"
    else
      warn "compose up failed — investigate before stage"
    fi
  else
    warn "docker not on PATH or ${COMPOSE_FILE} missing — skipping Docker Compose hop"
  fi
else
  info "SKIP_COMPOSE=1 — skipping Docker Compose hop"
fi

ok "DEMO_MODE switch to '${mode}' complete."
