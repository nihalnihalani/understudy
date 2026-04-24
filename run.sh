#!/usr/bin/env bash
# Understudy one-command dev launcher.
#
# Usage:
#   ./run.sh                  full boot, foreground tail, ctrl-c stops everything
#   ./run.sh start            same as bare invocation
#   ./run.sh stop             kill anything previously launched, leave brew Redis alone
#   ./run.sh status           probe each service + show versions
#   ./run.sh logs [svc]       tail -f logs/<svc>.log; svc in {api,web,worker}
#   ./run.sh --replay         boot in DEMO_MODE=replay (hermetic — no live Gemini calls)
#
# Compatible with macOS default bash 3.2 (no associative arrays / no readarray).
set -euo pipefail
IFS=$' \t\n'

# ------------------------------------------------------------ paths + globals
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${REPO_ROOT}/logs"
STATE_FILE="${REPO_ROOT}/.runsh-state"
PIP_SENTINEL="${REPO_ROOT}/.runsh-pip-installed-at"
NODE_SENTINEL="${REPO_ROOT}/apps/web/node_modules/.runsh-installed-at"
DEMO_MODE_VALUE="${DEMO_MODE:-live}"
WE_STARTED_REDIS=0
REDIS_VIA_BREW=0
REDIS_VIA_DOCKER=0

# ------------------------------------------------------------ ANSI colors (tty-only)
if [[ -t 1 ]]; then
  C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'
  C_BLUE=$'\033[34m'; C_CYAN=$'\033[36m'; C_BOLD=$'\033[1m'; C_RESET=$'\033[0m'
else
  C_RED=""; C_GREEN=""; C_YELLOW=""; C_BLUE=""; C_CYAN=""; C_BOLD=""; C_RESET=""
fi

info()   { printf "%s>%s %s\n" "$C_CYAN"   "$C_RESET" "$*"; }
ok()     { printf "%s>%s %s\n" "$C_GREEN"  "$C_RESET" "$*"; }
warn()   { printf "%s!%s %s\n" "$C_YELLOW" "$C_RESET" "$*"; }
err()    { printf "%sx%s %s\n" "$C_RED"    "$C_RESET" "$*" >&2; }
hdr()    { printf "%s%s%s %s\n" "$C_BOLD" "▸" "$C_RESET" "$*"; }

# ------------------------------------------------------------ small helpers
ver_ge() {
  # ver_ge 3.11 3.10 -> 0 (true); pure-bash major.minor compare
  local a_major a_minor b_major b_minor
  a_major="${1%%.*}"; a_minor="${1#*.}"; a_minor="${a_minor%%.*}"
  b_major="${2%%.*}"; b_minor="${2#*.}"; b_minor="${b_minor%%.*}"
  if (( a_major > b_major )); then return 0; fi
  if (( a_major < b_major )); then return 1; fi
  if (( a_minor >= b_minor )); then return 0; fi
  return 1
}

state_set() {
  # state_set KEY VAL — append/replace KEY=VAL line in .runsh-state
  local key="$1"; local val="$2"
  local tmp="${STATE_FILE}.tmp"
  : > "$tmp"
  if [[ -f "$STATE_FILE" ]]; then
    grep -v "^${key}=" "$STATE_FILE" >> "$tmp" || true
  fi
  printf "%s=%s\n" "$key" "$val" >> "$tmp"
  mv "$tmp" "$STATE_FILE"
}

state_get() {
  local key="$1"
  [[ -f "$STATE_FILE" ]] || { echo ""; return 0; }
  local line; line="$(grep "^${key}=" "$STATE_FILE" 2>/dev/null | tail -1 || true)"
  echo "${line#*=}"
}

newer_than() {
  # newer_than A B -> 0 if A is newer than B, else 1
  [[ -e "$2" ]] || return 0
  [[ "$1" -nt "$2" ]]
}

pid_alive() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

# ------------------------------------------------------------ preflight
preflight() {
  hdr "preflight"

  # Python 3.11+
  if ! command -v python3 >/dev/null 2>&1; then
    err "python3 not found. Install with: brew install python@3.11"
    exit 1
  fi
  local py_ver
  py_ver="$(python3 -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
  if ! ver_ge "$py_ver" "3.11"; then
    err "python ${py_ver} found, need 3.11+. Try: brew install python@3.11  (or use pyenv)"
    exit 1
  fi
  ok "python ${py_ver}"

  # Node 20+
  if ! command -v node >/dev/null 2>&1; then
    err "node not found. Install with: brew install node@20"
    exit 1
  fi
  local node_ver
  node_ver="$(node --version | sed 's/^v//')"
  if ! ver_ge "$node_ver" "20.0"; then
    err "node ${node_ver} found, need 20+. Try: brew install node@20  (or nvm install 20)"
    exit 1
  fi
  ok "node ${node_ver}"

  # .env + GEMINI_API_KEY
  if [[ ! -f "${REPO_ROOT}/.env" ]]; then
    err ".env not found at ${REPO_ROOT}/.env. Copy from .env.example: cp .env.example .env"
    exit 1
  fi
  local gem_line
  gem_line="$(grep -E '^[[:space:]]*GEMINI_API_KEY[[:space:]]*=' "${REPO_ROOT}/.env" || true)"
  if [[ -z "$gem_line" ]]; then
    err "GEMINI_API_KEY missing from .env. See .env.example for the expected variables."
    exit 1
  fi
  local gem_val="${gem_line#*=}"
  gem_val="${gem_val#\"}"; gem_val="${gem_val%\"}"
  gem_val="${gem_val#\'}"; gem_val="${gem_val%\'}"
  gem_val="${gem_val// /}"
  if [[ -z "$gem_val" ]]; then
    if [[ "$DEMO_MODE_VALUE" == "replay" ]]; then
      warn "GEMINI_API_KEY empty — ok in --replay mode (hermetic, no live calls)"
    else
      err "GEMINI_API_KEY is empty in .env. Drop a real key in or use --replay."
      exit 1
    fi
  else
    ok "GEMINI_API_KEY present"
  fi

  # InsForge
  if [[ ! -f "${REPO_ROOT}/.insforge/project.json" ]]; then
    warn "no .insforge/project.json (InsForge persistence will fall back to in-memory)."
  elif ! grep -qE '^[[:space:]]*INSFORGE_(URL|API_KEY)' "${REPO_ROOT}/.env"; then
    warn "INSFORGE_URL or INSFORGE_API_KEY missing in .env — DEMO_MODE=replay still works."
  else
    ok "InsForge wired"
  fi

  # TinyFish (warn-only)
  if ! grep -qE '^[[:space:]]*TINYFISH_API_KEY[[:space:]]*=[^[:space:]]+' "${REPO_ROOT}/.env"; then
    warn "TINYFISH_API_KEY missing — generated agents won't run, but synthesis itself is fine."
  else
    ok "TinyFish key present"
  fi
}

# ------------------------------------------------------------ install (idempotent)
install_deps() {
  hdr "deps"

  # Python — install -e .[dev] only when pyproject.toml is newer than sentinel.
  if newer_than "${REPO_ROOT}/pyproject.toml" "$PIP_SENTINEL"; then
    info "pip install -e '.[dev]' (pyproject.toml newer than sentinel)"
    # Match Makefile convention: fall back to --break-system-packages on PEP 668 systems (brew python).
    (cd "$REPO_ROOT" && python3 -m pip install -e '.[dev]' --quiet) \
      || (cd "$REPO_ROOT" && python3 -m pip install -e '.[dev]' --quiet --break-system-packages) || {
      err "pip install failed"
      exit 1
    }
    : > "$PIP_SENTINEL"
    ok "python deps installed"
  else
    ok "python deps already fresh"
  fi

  # Node — npm install only when package.json is newer than the sentinel
  # (which lives inside node_modules so it dies with a wipe).
  local web_pkg="${REPO_ROOT}/apps/web/package.json"
  if newer_than "$web_pkg" "$NODE_SENTINEL"; then
    info "npm install (apps/web package.json newer than node_modules)"
    (cd "${REPO_ROOT}/apps/web" && npm install --silent) || {
      err "npm install failed"
      exit 1
    }
    mkdir -p "$(dirname "$NODE_SENTINEL")"
    : > "$NODE_SENTINEL"
    ok "node deps installed"
  else
    ok "node deps already fresh"
  fi
}

# ------------------------------------------------------------ Redis
ensure_redis() {
  hdr "redis"

  if command -v redis-cli >/dev/null 2>&1 && redis-cli ping >/dev/null 2>&1; then
    ok "redis already running (PONG)"
    return 0
  fi

  if command -v brew >/dev/null 2>&1; then
    if brew services list 2>/dev/null | grep -q '^redis[[:space:]].*started'; then
      ok "redis running via brew services"
      return 0
    fi
    if brew list --formula 2>/dev/null | grep -qx redis; then
      info "starting redis via brew services"
      if brew services start redis >/dev/null 2>&1; then
        WE_STARTED_REDIS=1
        REDIS_VIA_BREW=1
        state_set REDIS_VIA_BREW 1
        # give it a beat to bind :6379
        local i
        for i in 1 2 3 4 5 6 7 8 9 10; do
          if redis-cli ping >/dev/null 2>&1; then
            ok "redis up via brew (PONG)"
            return 0
          fi
          sleep 0.5
        done
        warn "brew started redis but ping never came back; falling through to docker"
      fi
    fi
  fi

  if command -v docker >/dev/null 2>&1; then
    info "starting redis via docker (understudy-redis)"
    docker rm -f understudy-redis >/dev/null 2>&1 || true
    if docker run -d --name understudy-redis -p 6379:6379 redis:8 >/dev/null; then
      WE_STARTED_REDIS=1
      REDIS_VIA_DOCKER=1
      state_set REDIS_VIA_DOCKER 1
      local i
      for i in 1 2 3 4 5 6 7 8 9 10; do
        if (command -v redis-cli >/dev/null && redis-cli ping >/dev/null 2>&1) \
           || docker exec understudy-redis redis-cli ping >/dev/null 2>&1; then
          ok "redis up via docker"
          return 0
        fi
        sleep 0.5
      done
      err "redis container started but ping never came back"
      exit 1
    fi
  fi

  err "no redis available — install with: brew install redis  (or run docker)"
  exit 1
}

# ------------------------------------------------------------ env loader for child procs
load_env() {
  # Read .env into the env, skipping comments / blanks. Survives spaces in values.
  set -a
  # shellcheck disable=SC1090
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    eval "export $line" 2>/dev/null || true
  done < "${REPO_ROOT}/.env"
  set +a
  export DEMO_MODE="$DEMO_MODE_VALUE"
  export PYTHONPATH="${REPO_ROOT}${PYTHONPATH:+:${PYTHONPATH}}"
}

# ------------------------------------------------------------ service starters
start_api() {
  hdr "api"
  info "uvicorn apps.api.main:app on 127.0.0.1:8080 (demo_mode=${DEMO_MODE_VALUE})"
  (
    cd "$REPO_ROOT"
    nohup python3 -m uvicorn apps.api.main:app \
      --host 127.0.0.1 --port 8080 --reload \
      >> "${LOG_DIR}/api.log" 2>&1 &
    echo $! > "${LOG_DIR}/.api.pid"
  )
  local pid; pid="$(cat "${LOG_DIR}/.api.pid")"
  state_set API_PID "$pid"
  # health probe
  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if curl -sf http://127.0.0.1:8080/healthz 2>/dev/null | grep -q '"status":"ok"'; then
      ok "api healthz ok (pid ${pid})"
      return 0
    fi
    if ! pid_alive "$pid"; then
      err "api process died early — see logs/api.log"
      tail -n 30 "${LOG_DIR}/api.log" || true
      exit 1
    fi
    sleep 0.5
  done
  err "api never reported healthz — see logs/api.log"
  exit 1
}

start_worker() {
  hdr "worker"
  info "synthesis worker (jobs:synthesis consumer)"

  # Preferred launch: the console script registered in pyproject.toml
  # [project.scripts] (understudy-synthesis-worker -> understudy.bin:synthesis_worker_main).
  # Fallback: direct script run from the hyphenated apps/synthesis-worker/ dir.
  local pid=""
  if command -v understudy-synthesis-worker >/dev/null 2>&1; then
    ( cd "$REPO_ROOT" && nohup understudy-synthesis-worker \
        >> "${LOG_DIR}/worker.log" 2>&1 & echo $! > "${LOG_DIR}/.worker.pid" )
  else
    ( cd "$REPO_ROOT" && nohup python3 "${REPO_ROOT}/apps/synthesis-worker/main.py" \
        >> "${LOG_DIR}/worker.log" 2>&1 & echo $! > "${LOG_DIR}/.worker.pid" )
  fi
  pid="$(cat "${LOG_DIR}/.worker.pid")"
  state_set WORKER_PID "$pid"

  # No HTTP — wait for the "synthesis-worker running" log line.
  local i
  for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
    if grep -qE 'synthesis-worker running|consumer=|processing' "${LOG_DIR}/worker.log" 2>/dev/null; then
      ok "worker started (pid ${pid})"
      return 0
    fi
    if ! pid_alive "$pid"; then
      err "worker process died early — see logs/worker.log"
      tail -n 30 "${LOG_DIR}/worker.log" || true
      exit 1
    fi
    sleep 0.5
  done
  warn "worker started (pid ${pid}) but no startup marker yet — check logs/worker.log"
}

start_web() {
  hdr "web"
  info "vite dev on 127.0.0.1:5173"
  (
    cd "${REPO_ROOT}/apps/web"
    nohup npm run dev -- --host 127.0.0.1 --port 5173 \
      >> "${LOG_DIR}/web.log" 2>&1 &
    echo $! > "${LOG_DIR}/.web.pid"
  )
  local pid; pid="$(cat "${LOG_DIR}/.web.pid")"
  state_set WEB_PID "$pid"
  local i
  for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    if curl -sf http://127.0.0.1:5173/ >/dev/null 2>&1; then
      ok "web up (pid ${pid})"
      return 0
    fi
    if ! pid_alive "$pid"; then
      err "vite dev process died early — see logs/web.log"
      tail -n 30 "${LOG_DIR}/web.log" || true
      exit 1
    fi
    sleep 0.5
  done
  warn "web (pid ${pid}) didn't return 200 yet — vite may still be warming; check logs/web.log"
}

# ------------------------------------------------------------ prewarm (replay only)
prewarm_demo() {
  if [[ "$DEMO_MODE_VALUE" != "replay" ]]; then
    return 0
  fi
  hdr "prewarm"
  if [[ -f "${REPO_ROOT}/scripts/prewarm_demo.py" ]]; then
    if (cd "$REPO_ROOT" && python3 scripts/prewarm_demo.py >> "${LOG_DIR}/prewarm.log" 2>&1); then
      ok "demo replay cache warmed"
    else
      warn "prewarm_demo.py exited non-zero — proceeding anyway (logs/prewarm.log)"
    fi
  else
    warn "scripts/prewarm_demo.py not found — skipping prewarm"
  fi
}

# ------------------------------------------------------------ stop
stop_one() {
  local label="$1"; local pid_file="$2"
  if [[ -f "$pid_file" ]]; then
    local pid; pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && pid_alive "$pid"; then
      info "stopping ${label} (pid ${pid})"
      kill "$pid" 2>/dev/null || true
      local i
      for i in 1 2 3 4 5 6 7 8; do
        pid_alive "$pid" || break
        sleep 0.25
      done
      pid_alive "$pid" && kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$pid_file"
  fi
}

stop_all() {
  hdr "shutdown"
  # reverse dependency order: web -> worker -> api -> redis (only if WE started it)
  stop_one "web"    "${LOG_DIR}/.web.pid"
  stop_one "worker" "${LOG_DIR}/.worker.pid"
  stop_one "api"    "${LOG_DIR}/.api.pid"

  local via_brew via_docker
  via_brew="$(state_get REDIS_VIA_BREW)"
  via_docker="$(state_get REDIS_VIA_DOCKER)"
  if [[ "$via_docker" == "1" ]]; then
    info "stopping redis docker container"
    docker rm -f understudy-redis >/dev/null 2>&1 || true
  elif [[ "$via_brew" == "1" ]]; then
    # Brew-managed Redis is a developer-facing background service. Only stop it
    # if WE started it this session (state was written), and stop gently.
    info "stopping brew redis we started"
    brew services stop redis >/dev/null 2>&1 || true
  else
    info "leaving redis alone (not started by run.sh)"
  fi

  rm -f "$STATE_FILE"
  ok "stack down"
}

# ------------------------------------------------------------ status
cmd_status() {
  hdr "status"
  # API
  local api_resp
  api_resp="$(curl -sf http://127.0.0.1:8080/healthz 2>/dev/null || true)"
  if [[ -n "$api_resp" ]]; then
    ok "api 127.0.0.1:8080 healthz=ok"
    printf "  %s\n" "$api_resp"
  else
    warn "api 127.0.0.1:8080 not responding"
  fi
  # Web
  if curl -sf http://127.0.0.1:5173/ >/dev/null 2>&1; then
    ok "web 127.0.0.1:5173 up"
  else
    warn "web 127.0.0.1:5173 not responding"
  fi
  # Worker
  local wpid; wpid="$(state_get WORKER_PID)"
  if [[ -n "$wpid" ]] && pid_alive "$wpid"; then
    ok "worker pid ${wpid} alive"
  else
    warn "worker not running (per .runsh-state)"
  fi
  # Redis
  if command -v redis-cli >/dev/null && redis-cli ping >/dev/null 2>&1; then
    ok "redis PONG"
  elif docker ps --format '{{.Names}}' 2>/dev/null | grep -qx understudy-redis; then
    ok "redis docker running"
  else
    warn "redis not reachable"
  fi
  # Versions
  hdr "versions"
  printf "  python  %s\n" "$(python3 --version 2>&1)"
  printf "  node    %s\n" "$(node --version 2>&1)"
  printf "  npm     %s\n" "$(npm --version 2>&1)"
  # Tail
  if [[ -f "${LOG_DIR}/api.log" ]]; then
    hdr "logs/api.log (last 5)"
    tail -n 5 "${LOG_DIR}/api.log" | sed 's/^/  /'
  fi
}

# ------------------------------------------------------------ subcommands
cmd_logs() {
  local svc="${1:-}"
  case "$svc" in
    api|web|worker) tail -f "${LOG_DIR}/${svc}.log" ;;
    "") err "usage: ./run.sh logs [api|web|worker]"; exit 2 ;;
    *)  err "unknown service: ${svc}";              exit 2 ;;
  esac
}

cmd_start() {
  preflight
  install_deps
  ensure_redis
  load_env
  prewarm_demo
  mkdir -p "$LOG_DIR"
  start_api
  start_worker
  start_web

  hdr "stack ready"
  printf "  %sapi%s     -> http://127.0.0.1:8080  (healthz ok, demo_mode=%s)\n" "$C_BOLD" "$C_RESET" "$DEMO_MODE_VALUE"
  printf "  %sweb%s     -> http://127.0.0.1:5173  (vite dev server)\n" "$C_BOLD" "$C_RESET"
  printf "  %sworker%s  -> pid %s (logs/worker.log)\n" "$C_BOLD" "$C_RESET" "$(state_get WORKER_PID)"
  printf "  %sredis%s   -> running\n" "$C_BOLD" "$C_RESET"
  hdr "ctrl-c to stop all"

  # Foreground tail. trap will fire on Ctrl-C / TERM and tear it all down.
  trap 'stop_all; exit 0' INT TERM
  tail -n 0 -F "${LOG_DIR}/api.log" "${LOG_DIR}/worker.log" "${LOG_DIR}/web.log" 2>/dev/null &
  TAIL_PID=$!
  wait "$TAIL_PID"
}

# ------------------------------------------------------------ arg parse
mkdir -p "$LOG_DIR"

CMD="start"
for arg in "$@"; do
  case "$arg" in
    --replay) DEMO_MODE_VALUE="replay" ;;
    --live)   DEMO_MODE_VALUE="live" ;;
    --hybrid) DEMO_MODE_VALUE="hybrid" ;;
    start|stop|status|logs) CMD="$arg" ;;
    api|web|worker) LOGS_TARGET="$arg" ;;
    -h|--help)
      grep '^# ' "$0" | head -12 | sed 's/^# //'
      exit 0
      ;;
    *) err "unknown arg: ${arg}"; exit 2 ;;
  esac
done

case "$CMD" in
  start)  cmd_start ;;
  stop)   stop_all ;;
  status) cmd_status ;;
  logs)   cmd_logs "${LOGS_TARGET:-}" ;;
  *)      err "unknown command: ${CMD}"; exit 2 ;;
esac
