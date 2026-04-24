#!/usr/bin/env bash
# Tail every Redis run:synth:* trace stream in real time, printing each event as
# "<synth_id-short> <stage> <message>" with duration and any extras.
# Uses the REDIS_URL from the environment (set by .env / dev-debug.sh).
set -u

URL="${REDIS_URL:-redis://localhost:6379/0}"

# Pick the right CLI invocation depending on whether REDIS_URL includes auth.
rcli() { redis-cli -u "$URL" --no-auth-warning "$@"; }

# Print a compact line for one stream event.
# Input is tab-separated: streamkey \t entry_id \t field1 \t value1 \t ...
format_event() {
  awk -F'\t' '
    {
      streamkey = $1; sub(/^run:synth:/, "", streamkey)
      short = substr(streamkey, 1, 8)
      stage=""; msg=""; dur=""
      for (i = 3; i <= NF; i += 2) {
        k = $i; v = $(i+1)
        if (k == "stage") stage = v
        else if (k == "message") msg = v
        else if (k == "duration_ms") dur = v
      }
      tag = sprintf("[%s]", short)
      line = sprintf("%-10s %-18s %s", tag, stage, msg)
      if (dur != "") line = line sprintf(" (%sms)", dur)
      print line
    }
  '
}

# Keep a mapping of stream -> last-seen ID so we do blocking XREAD from "$" forward.
# Redis-cli doesn't hold cursors across invocations, so we loop.
declare -A last
echo "tail-traces: watching run:synth:* on ${URL%@*}@..." >&2

while true; do
  # Discover all run:synth:* streams (including brand-new ones).
  keys=$(rcli --scan --pattern 'run:synth:*' 2>/dev/null)
  if [[ -z "$keys" ]]; then
    sleep 0.5
    continue
  fi

  # Build the XREAD argument list: STREAMS <k1> <k2>... <id1> <id2>...
  stream_args=()
  id_args=()
  while IFS= read -r k; do
    [[ -z "$k" ]] && continue
    stream_args+=("$k")
    id_args+=("${last[$k]:-0-0}")
  done <<< "$keys"

  # Block up to 2000ms waiting for any new event across all streams.
  # Raw tab-separated output via --no-raw off by default is fine.
  out=$(rcli XREAD COUNT 100 BLOCK 2000 STREAMS "${stream_args[@]}" "${id_args[@]}" 2>/dev/null || true)
  [[ -z "$out" ]] && continue

  # redis-cli emits results as:
  #   1) run:synth:<id>
  #      1) 1) <entry_id>
  #         2) 1) "stage"    2) "ingest"  3) "message" 4) "..." ...
  # Convert to tab-separated lines for format_event.
  python3 - "$out" <<'PY' 2>/dev/null | format_event
import sys, re
raw = sys.argv[1]
# Find blocks like:  1) run:synth:XXXX  followed by entries
lines = raw.splitlines()
i = 0
current_stream = None
while i < len(lines):
    line = lines[i].rstrip()
    m = re.match(r'\s*\d+\)\s*"?(run:synth:[^"]+)"?\s*$', line)
    if m:
        current_stream = m.group(1)
        i += 1
        continue
    m = re.match(r'\s*\d+\)\s*1\)\s*"?([0-9]+-[0-9]+)"?\s*$', line)
    if m and current_stream:
        entry_id = m.group(1)
        # Next line is "2)" then field/value pairs that may span multiple output lines
        j = i + 1
        fields = []
        while j < len(lines):
            mv = re.match(r'\s*\d+\)\s*"(.*)"\s*$', lines[j])
            if not mv:
                break
            fields.append(mv.group(1))
            j += 1
        print("\t".join([current_stream, entry_id] + fields))
        i = j
        continue
    i += 1
PY

  # Update last-seen IDs per stream for the next round.
  # Re-query XLEN quickly to capture the latest ID.
  for k in "${stream_args[@]}"; do
    latest=$(rcli XREVRANGE "$k" + - COUNT 1 2>/dev/null | awk 'NR==1{print}')
    [[ -n "$latest" ]] && last[$k]="$latest"
  done
done
