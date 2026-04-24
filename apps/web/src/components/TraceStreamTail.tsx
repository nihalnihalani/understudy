import { useMemo } from "react";
import type { TraceEvent } from "@/api/types";

export function TraceStreamTail({
  events,
  height = 80,
}: {
  events: TraceEvent[];
  height?: number;
}) {
  const recent = useMemo(() => events.slice(-6), [events]);
  return (
    <section
      aria-label="Synthesis trace stream"
      className="border-t border-border-subtle bg-canvas-surface/60 font-mono text-mono-base overflow-auto scrollbar-tight"
      style={{ height }}
    >
      <ul className="px-4 py-2 space-y-0.5">
        {recent.map((ev, i) => {
          const ts = new Date(ev.ts);
          const hh = ts.toISOString().slice(11, 19);
          return (
            <li key={i} className="flex gap-3 text-fg-muted">
              <span className="text-fg-faint tabular-nums">{hh}</span>
              <span className="text-accent-cyan uppercase text-[10px] tracking-wide">
                {ev.stage.padEnd(8)}
              </span>
              <span className="text-fg">{ev.message}</span>
            </li>
          );
        })}
        {recent.length === 0 && (
          <li className="text-fg-faint italic">awaiting trace events…</li>
        )}
      </ul>
    </section>
  );
}
