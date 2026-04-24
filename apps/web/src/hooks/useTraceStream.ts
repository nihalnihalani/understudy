// Subscribes to the `run:synth:{id}` Redis Stream over SSE.
//
// Backend contract (apps/api/main.py :: GET /synthesis/{id}/stream):
//   - Replays the full XRANGE history first so late subscribers see `ingest`,
//     `enqueued`, and earlier stage events.
//   - Then tails from `$` via XREAD BLOCK.
//   - Each default frame is one JSON-encoded TraceEvent (dispatched to
//     `onmessage` because no `event:` header is present).
//   - A terminal `event: done` frame is emitted when the worker writes a
//     `stage == "status"` event with `data.status in {completed, failed}`.
//     Browsers deliver it via `addEventListener("done", ...)`, NOT onmessage,
//     and the server closes the stream immediately after. We fire one REST
//     refresh on that signal so status/traces snap to final without waiting
//     for the next `runRefreshMs` tick.
//   - Heartbeats are SSE comments (`: ping`) — EventSource ignores them.
//   - 404 if the run id does not exist.
//
// We also fetch GET /synthesis/{id} on mount and every `runRefreshMs` until the
// run is terminal, because the stream only carries trace events — the
// SynthesisRun row (status, gemini_*_trace, intent_abstraction) lives on the
// REST surface.

import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/api/client";
import type { SseDonePayload, SynthesisRun, TraceEvent } from "@/api/types";

export interface TraceStreamState {
  run: SynthesisRun | null;
  trace: TraceEvent[];
  connected: boolean;
  error: Error | null;
}

export function useTraceStream(
  synthId: string | undefined,
  opts: { enabled?: boolean; runRefreshMs?: number } = {}
): TraceStreamState {
  const { enabled = true, runRefreshMs = 3000 } = opts;
  const [state, setState] = useState<TraceStreamState>({
    run: null,
    trace: [],
    connected: false,
    error: null,
  });
  // Dedupe — the stream replays history on connect, and EventSource auto-
  // reconnects on errors which may replay again from the browser's Last-Event-ID.
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!synthId || !enabled) return;
    let cancelled = false;
    let runTimer: ReturnType<typeof setTimeout> | null = null;
    let es: EventSource | null = null;
    seen.current = new Set();

    const pushEvent = (ev: TraceEvent) => {
      const key = `${ev.ts}|${ev.stage}|${ev.message}`;
      if (seen.current.has(key)) return;
      seen.current.add(key);
      setState((prev) => ({ ...prev, trace: [...prev.trace, ev] }));
    };

    async function seedRun() {
      if (cancelled || !synthId) return;
      try {
        const detail = await api.getSynthesis(synthId);
        if (cancelled) return;
        setState((prev) => ({ ...prev, run: detail.run, error: null }));
        const done =
          detail.run.status === "completed" || detail.run.status === "failed";
        if (!done) {
          runTimer = setTimeout(seedRun, runRefreshMs);
        }
      } catch (err) {
        if (cancelled) return;
        // Keep the SSE connection alive even if the REST row read fails.
        setState((prev) => ({
          ...prev,
          error:
            err instanceof ApiError
              ? err
              : err instanceof Error
              ? err
              : new Error(String(err)),
        }));
        runTimer = setTimeout(seedRun, runRefreshMs * 2);
      }
    }

    seedRun();

    try {
      es = new EventSource(api.synthesisStreamUrl(synthId));
      es.onopen = () => {
        if (cancelled) return;
        setState((prev) => ({ ...prev, connected: true, error: null }));
      };
      es.onmessage = (e) => {
        if (cancelled) return;
        try {
          const ev = JSON.parse(e.data) as TraceEvent;
          pushEvent(ev);
        } catch {
          // Malformed frame — skip, keep the connection.
        }
      };
      es.addEventListener("done", (e) => {
        if (cancelled) return;
        try {
          // Payload is informational; the server closes the stream right
          // after this frame. Type-check so a future schema drift trips here.
          JSON.parse((e as MessageEvent<string>).data) as SseDonePayload;
        } catch {
          /* malformed done frame — still refresh the run row */
        }
        if (runTimer) clearTimeout(runTimer);
        seedRun();
      });
      es.onerror = () => {
        if (cancelled) return;
        // EventSource auto-reconnects on its own; flip the chip and wait.
        // Note: the server intentionally closes after `event: done`, which
        // surfaces as onerror too — benign once the run is terminal.
        setState((prev) => ({ ...prev, connected: false }));
      };
    } catch (err) {
      setState((prev) => ({
        ...prev,
        connected: false,
        error: err instanceof Error ? err : new Error(String(err)),
      }));
    }

    return () => {
      cancelled = true;
      if (runTimer) clearTimeout(runTimer);
      if (es) es.close();
    };
  }, [synthId, enabled, runRefreshMs]);

  return state;
}
