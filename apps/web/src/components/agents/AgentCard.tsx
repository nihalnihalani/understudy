import { forwardRef, useCallback } from "react";
import type { KeyboardEvent } from "react";
import { ShieldCheck, Brain, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { truncateDigest, relativeTime } from "@/lib/format";
import { StatusDot, type Status as DotStatus } from "@/components/ui/status-dot";
import { Badge } from "@/components/ui/badge";
import { AgentSparkline, stateToTone, type AgentState } from "./AgentSparkline";
import {
  Monogram,
  SignedBadge,
  InlineCopy,
  InlineLink,
  IconAction,
} from "./AgentCardBits";
import type { Agent } from "@/api/types";

export interface AgentCardExtras {
  subgraph_id: string;
  runs_count: number;
  last_seen_at: string;
  memory_mb: number;
  skill_pin: string;
  verified: boolean;
  state?: AgentState;
  sparkline?: number[];
}

export type AgentCardAction = "run" | "memory" | "supply-chain";

export interface AgentCardProps {
  agent: Agent;
  extras: AgentCardExtras;
  selected?: boolean;
  onOpen?: () => void;
  onAction?: (action: AgentCardAction) => void;
}

export const AgentCard = forwardRef<HTMLDivElement, AgentCardProps>(
  function AgentCard({ agent, extras, selected, onOpen, onAction }, ref) {
    const state: AgentState = extras.state ?? (extras.verified ? "active" : "failed");
    const host =
      agent.graphql_endpoint.replace(/^https?:\/\//, "").split("/")[0] ??
      "agent.fly.dev";

    const handleKey = useCallback(
      (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen?.();
        }
      },
      [onOpen]
    );

    return (
      <div
        ref={ref}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-label={`Agent ${agent.id.slice(0, 6)} · ${extras.subgraph_id}`}
        onClick={onOpen}
        onKeyDown={handleKey}
        className={cn(
          "group relative flex h-full flex-col gap-3 rounded-lg border bg-surface p-4",
        "transition-all duration-base",
        "hover:-translate-y-1 hover:border-primary/60 hover:shadow-md",
          "focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring",
          selected ? "border-primary ring-1 ring-primary/40" : "border-border"
        )}
      >
        <header className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <Monogram id={agent.id} state={state} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <StatusDot status={stateToDot(state)} />
                <span className="font-mono text-[12px] text-foreground">
                  agent-{agent.id.slice(0, 6)}
                </span>
              </div>
              <div className="truncate font-mono text-[10px] text-muted-foreground">
                {extras.subgraph_id}
              </div>
            </div>
          </div>
          <SignedBadge verified={extras.verified} />
        </header>

        <section className="flex flex-col gap-1.5">
          <InlineCopy
            prefix="img"
            value={truncateDigest(agent.image_digest, 12, 6)}
            fullValue={agent.image_digest}
            label={`image digest for agent ${agent.id.slice(0, 6)}`}
          />
          <InlineLink href={agent.graphql_endpoint} host={host} />
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
            <span className="text-faint">ams</span>
            <span className="truncate text-foreground" title={agent.ams_namespace}>
              {agent.ams_namespace}
            </span>
          </div>
        </section>

        <div className="mt-auto grid grid-cols-[1fr_auto] items-end gap-3">
          <div className="flex flex-col gap-0.5">
            <div className="font-mono text-[9px] uppercase tracking-wider text-faint">
              runs · last 24
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[18px] font-semibold tabular-nums text-foreground">
                {extras.runs_count}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                · {relativeTime(extras.last_seen_at)}
              </span>
            </div>
          </div>
          {extras.sparkline && (
            <AgentSparkline
              data={extras.sparkline}
              width={96}
              height={24}
              tone={stateToTone(state)}
            />
          )}
        </div>

        <footer
          className={cn(
            "flex items-center justify-between border-t border-border pt-2",
            "opacity-0 transition-opacity duration-fast",
            "group-hover:opacity-100 group-focus-within:opacity-100",
            selected && "opacity-100"
          )}
        >
          <Badge variant="outline" className="text-[10px]">
            {extras.skill_pin}
          </Badge>
          <div className="flex items-center gap-0.5">
            <IconAction
              icon={<PlayCircle className="size-3.5" />}
              label="Run query"
              onClick={(e) => {
                e.stopPropagation();
                onAction?.("run");
              }}
            />
            <IconAction
              icon={<Brain className="size-3.5" />}
              label="View memory"
              onClick={(e) => {
                e.stopPropagation();
                onAction?.("memory");
              }}
            />
            <IconAction
              icon={<ShieldCheck className="size-3.5" />}
              label="View supply chain"
              onClick={(e) => {
                e.stopPropagation();
                onAction?.("supply-chain");
              }}
            />
          </div>
        </footer>
      </div>
    );
  }
);

function stateToDot(s: AgentState): DotStatus {
  switch (s) {
    case "active":
      return "live";
    case "idle":
      return "ok";
    case "failed":
      return "down";
    case "pending":
      return "pending";
  }
}
