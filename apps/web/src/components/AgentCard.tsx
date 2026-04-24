import { cn } from "@/lib/cn";
import { truncateDigest, relativeTime } from "@/lib/format";
import { StatusChip } from "./StatusChip";
import type { Agent } from "@/api/types";

export interface AgentCardExtras {
  subgraph_id: string;
  runs_count: number;
  last_seen_at: string;
  memory_mb: number;
  skill_pin: string;
  verified: boolean;
}

export interface AgentCardProps {
  agent: Agent;
  extras: AgentCardExtras;
  selected?: boolean;
  onClick?: () => void;
}

function Monogram({ id }: { id: string }) {
  const letters = id.replace(/^agent-/, "").slice(0, 2).toUpperCase();
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 text-primary-300 font-mono text-[13px] font-semibold border border-primary/30"
    >
      {letters}
    </span>
  );
}

export function AgentCard({ agent, extras, selected, onClick }: AgentCardProps) {
  const short = agent.graphql_endpoint
    .replace(/^https?:\/\//, "")
    .split("/")[0];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`Agent ${agent.id}`}
      className={cn(
        "card text-left p-4 flex flex-col gap-3 w-full h-[280px]",
        "hover:border-primary focus-visible:border-primary transition-colors",
        selected && "border-primary ring-1 ring-primary"
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Monogram id={agent.id} />
          <div className="min-w-0">
            <div className="font-mono text-[13px] text-fg truncate">
              agent-{agent.id.slice(0, 6)}
            </div>
            <div className="text-[11px] text-fg-muted truncate">
              {extras.subgraph_id}
            </div>
          </div>
        </div>
        <StatusChip status={extras.verified ? "verified" : "failed"} />
      </header>

      <section className="flex-1 flex flex-col gap-2 text-mono-sm font-mono text-fg-muted min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-fg-faint">endpoint</span>
          <span className="truncate text-fg">{short}/graphql</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-fg-faint">ams</span>
          <span className="truncate text-fg">{agent.ams_namespace}</span>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-1">
          <div>
            <span className="text-fg-faint">runs</span>{" "}
            <span className="text-fg tabular-nums">{extras.runs_count}</span>
          </div>
          <div>
            <span className="text-fg-faint">last seen</span>{" "}
            <span className="text-fg">{relativeTime(extras.last_seen_at)}</span>
          </div>
          <div>
            <span className="text-fg-faint">memory</span>{" "}
            <span className="text-fg">
              {extras.memory_mb.toFixed(1)} MB
            </span>
          </div>
          <div className="truncate">
            <span className="text-fg-faint">skill</span>{" "}
            <span className="text-fg truncate">{extras.skill_pin}</span>
          </div>
        </div>
      </section>

      <footer className="flex items-center justify-between text-mono-xs font-mono pt-2 border-t border-border-subtle">
        <span className="text-fg-faint">
          {truncateDigest(agent.image_digest, 14, 6)}
        </span>
        {extras.verified && (
          <span className="text-accent-emerald" aria-label="signature verified">
            cosign ok
          </span>
        )}
      </footer>
    </button>
  );
}
