import { Badge } from "@/components/ui/badge";
import { relativeTime } from "@/lib/format";
import type { AgentRun } from "@/api/types";

export function AgentRunsTable({
  runs,
  fixture,
}: {
  runs: AgentRun[];
  fixture?: boolean;
}) {
  if (runs.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-surface/40 px-4 py-8 text-center font-mono text-[11px] text-muted-foreground">
        No runs in the last window.
      </div>
    );
  }
  return (
    <div
      data-demo={fixture ? "fixture" : undefined}
      className="overflow-hidden rounded-md border border-border"
    >
      <table className="w-full font-mono text-[11px]">
        <thead className="bg-elevated">
          <tr className="text-left text-faint">
            <th className="px-3 py-2 font-normal uppercase tracking-wider">started</th>
            <th className="px-3 py-2 font-normal uppercase tracking-wider">duration</th>
            <th className="px-3 py-2 font-normal uppercase tracking-wider">status</th>
            <th className="px-3 py-2 font-normal uppercase tracking-wider">result</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => {
            const started = new Date(r.started_at).getTime();
            const ended = r.ended_at ? new Date(r.ended_at).getTime() : null;
            const dur = ended ? `${((ended - started) / 1000).toFixed(2)}s` : "—";
            const preview =
              r.result && typeof r.result === "object"
                ? Object.keys(r.result).slice(0, 2).join(", ")
                : "—";
            return (
              <tr key={r.id} className="border-t border-border/60">
                <td className="px-3 py-2 text-foreground">{relativeTime(r.started_at)}</td>
                <td className="px-3 py-2 tabular-nums text-foreground">{dur}</td>
                <td className="px-3 py-2">
                  <RunStatusBadge status={r.status} />
                </td>
                <td className="px-3 py-2 text-muted-foreground">{preview || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RunStatusBadge({ status }: { status: string }) {
  const tone =
    status === "completed" || status === "success"
      ? "success"
      : status === "failed"
        ? "destructive"
        : status === "running"
          ? "accent"
          : "default";
  return (
    <Badge variant={tone as "success" | "destructive" | "accent" | "default"}>
      {status}
    </Badge>
  );
}
