#!/usr/bin/env bash
# Launch api + worker + web + Redis-stream tracer with DEBUG logging.
# Every service's stdout is prefixed + colored in this terminal AND tee'd to logs/*.log
# Ctrl-C kills everything.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

mkdir -p logs

# Load .env into the environment for every child process.
if [[ -f .env ]]; then
  set -a
  # shellcheck source=/dev/null
  source .env
  set +a
fi

export LOG_LEVEL="${LOG_LEVEL:-DEBUG}"
export PYTHONUNBUFFERED=1  # flush python stdout immediately

# Activate venv if not already active.
if [[ -z "${VIRTUAL_ENV:-}" && -d .venv ]]; then
  # shellcheck source=/dev/null
  source .venv/bin/activate
fi

# Colors — red/green/yellow/magenta for api/worker/web/trace.
c_api=$'\033[34m'   # blue
c_worker=$'\033[32m' # green
c_web=$'\033[33m'    # yellow
c_trace=$'\033[35m'  # magenta
c_reset=$'\033[0m'

prefix_pipe() {
  local label="$1" color="$2" logfile="$3"
  # Prefix each line in-terminal, and ALSO tee the raw line to a logfile.
  awk -v l="$label" -v c="$color" -v r="$c_reset" -v f="$logfile" \
    '{ printf "%s[%s]%s %s\n", c, l, r, $0; print $0 >> f; fflush(f); fflush() }'
}

# Start each service in its own process group so we can kill cleanly.
(
  python -m uvicorn apps.api.main:app --host 0.0.0.0 --port 8080 --log-level debug 2>&1 \
    | prefix_pipe "API   " "$c_api" "logs/api.log"
) &
pid_api=$!

(
  cd apps/synthesis-worker && python main.py 2>&1 \
    | prefix_pipe "WORKER" "$c_worker" "$ROOT/logs/worker.log"
) &
pid_worker=$!

(
  cd apps/web && npm run dev 2>&1 \
    | prefix_pipe "WEB   " "$c_web" "$ROOT/logs/web.log"
) &
pid_web=$!

(
  bash "$ROOT/scripts/tail-traces.sh" 2>&1 \
    | prefix_pipe "TRACE " "$c_trace" "$ROOT/logs/trace.log"
) &
pid_trace=$!

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  dev-debug running — four streams tagged and tee'd to logs/:"
echo "    ${c_api}API   ${c_reset}  http://localhost:8080 + logs/api.log"
echo "    ${c_worker}WORKER${c_reset}  jobs:synthesis consumer + logs/worker.log"
echo "    ${c_web}WEB   ${c_reset}  http://localhost:5173 + logs/web.log"
echo "    ${c_trace}TRACE ${c_reset}  Redis run:synth:* streams + logs/trace.log"
echo ""
echo "  DEMO_MODE=${DEMO_MODE:-live}  LOG_LEVEL=${LOG_LEVEL}  REDIS_URL=${REDIS_URL:-redis://localhost:6379/0}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Ctrl-C kills the whole group; so does a child dying.
trap 'echo ""; echo "stopping..."; kill $pid_api $pid_worker $pid_web $pid_trace 2>/dev/null; wait 2>/dev/null; exit 0' INT TERM

wait -n $pid_api $pid_worker $pid_web $pid_trace
echo ""
echo "one child exited — tearing down the rest"
kill $pid_api $pid_worker $pid_web $pid_trace 2>/dev/null
wait 2>/dev/null
