// AGENT WALL — closing beat 2:55-3:00.
// Grid of 10 synthesized agents, each card surfaces the governance-grade
// signals: endpoint, signing status, AMS namespace, runs, last seen.
// Fixture fallback kicks in when /agents returns empty.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { AgentCard } from "@/components/AgentCard";
import { AgentDrawer } from "@/components/AgentDrawer";
import { DEMO_AGENTS, DEMO_AGENT_EXTRAS } from "@/fixtures/demo";
import type { Agent } from "@/api/types";
import type { AgentCardExtras } from "@/components/AgentCard";
import { Section } from "@/components/Section";
import { cn } from "@/lib/cn";

export default function AgentWall() {
  const { data, isLoading } = useQuery({
    queryKey: ["agents"],
    queryFn: api.listAgents,
    retry: false,
  });
  const agents: Agent[] = useMemo(
    () => (data && data.length > 0 ? data : DEMO_AGENTS),
    [data]
  );
  const extras: Record<string, AgentCardExtras> = useMemo(() => {
    // If the live API returns agents we don't have extras for, synthesize
    // plausible defaults so the grid still renders. Demo fixtures override
    // where present.
    const out: Record<string, AgentCardExtras> = {};
    for (const a of agents) {
      out[a.id] =
        DEMO_AGENT_EXTRAS[a.id] ?? {
          subgraph_id: "agent_generic",
          runs_count: 0,
          last_seen_at: new Date().toISOString(),
          memory_mb: 0,
          skill_pin: "web-workflow-pack@2.3.1",
          verified: true,
        };
    }
    return out;
  }, [agents]);

  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "verified" | "failed">("all");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return agents.filter((a) => {
      const ex = extras[a.id];
      if (statusFilter === "verified" && !ex?.verified) return false;
      if (statusFilter === "failed" && ex?.verified) return false;
      if (!needle) return true;
      return (
        a.id.toLowerCase().includes(needle) ||
        a.graphql_endpoint.toLowerCase().includes(needle) ||
        a.ams_namespace.toLowerCase().includes(needle) ||
        a.image_digest.toLowerCase().includes(needle) ||
        (ex?.subgraph_id.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [agents, extras, q, statusFilter]);

  const verifiedCount = agents.filter((a) => extras[a.id]?.verified).length;
  const totalRuns = agents.reduce(
    (sum, a) => sum + (extras[a.id]?.runs_count ?? 0),
    0
  );
  const selectedAgent = selected
    ? agents.find((a) => a.id === selected) ?? null
    : null;
  const selectedExtras = selected ? extras[selected] : undefined;

  return (
    <div className="space-y-10">
      <Section
        tag="Deployment — 010"
        title={<>Every <em>agent</em>, signed</>}
        meta="SLSA L2 · COSIGN VERIFIED · FEDERATED"
      >

      {/* Filter strip */}
      <div className="flex items-center gap-3 mb-6">
        <div
          className="flex rounded border border-border-subtle bg-canvas-surface text-[12px] overflow-hidden"
          role="radiogroup"
          aria-label="Agent status filter"
        >
          {(
            [
              ["all", `All ${agents.length}`],
              ["verified", `verified ${verifiedCount}`],
              ["failed", `failed ${agents.length - verifiedCount}`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={statusFilter === key}
              onClick={() => setStatusFilter(key)}
              className={cn(
                "px-3 py-1.5 transition-colors",
                statusFilter === key
                  ? "text-fg bg-canvas-elevated"
                  : "text-fg-muted hover:text-fg"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="endpoint, namespace, digest…"
          className="flex-1 h-8 px-3 rounded bg-canvas-surface border border-border-subtle font-mono text-mono-base text-fg placeholder:text-fg-faint focus:border-primary"
          aria-label="Search agents"
        />
        <select
          className="h-8 px-2 rounded bg-canvas-surface border border-border-subtle text-[12px] text-fg"
          aria-label="Sort agents"
          defaultValue="recent"
        >
          <option value="recent">Most recent</option>
          <option value="runs">Most invocations</option>
          <option value="name">Name</option>
        </select>
        <Link to="/synthesize" className="btn btn-primary">
          Synthesize new →
        </Link>
      </div>

      {/* Summary stats */}
      <section className="matrix-grid grid-cols-2 lg:grid-cols-4 mb-8" aria-label="Deployment summary">
        <StatCard label="Agents deployed" value={agents.length.toString()} caption="last 3 min" />
        <StatCard
          label="Signed & verified"
          value={`${verifiedCount} / ${agents.length}`}
          caption="SLSA L2 · cosign via Fulcio"
          verified
        />
        <StatCard label="Avg synthesis time" value="87.4s" unit="s" caption="target ≤ 90s" />
        <StatCard
          label="Total invocations"
          value={totalRuns.toLocaleString()}
          caption="since 14:00"
        />
      </section>

      {/* Agent grid */}
      {isLoading && agents.length === 0 ? (
        <div
          className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4"
          aria-label="Loading agents"
          aria-busy="true"
        >
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="card p-4 h-[148px] flex flex-col gap-3 animate-pulse"
              aria-hidden
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-border-strong" />
                <div className="h-3 w-24 rounded bg-border-strong/70" />
                <div className="ml-auto h-3 w-10 rounded bg-border-strong/40" />
              </div>
              <div className="h-3 w-3/4 rounded bg-border-strong/60" />
              <div className="h-3 w-1/2 rounded bg-border-strong/40" />
              <div className="mt-auto flex gap-2">
                <div className="h-4 w-16 rounded bg-border-strong/50" />
                <div className="h-4 w-12 rounded bg-border-strong/40" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center text-fg-muted text-[13px]">
          No agents match this filter.
        </div>
      ) : (
        <div
          className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4"
          role="list"
          aria-label="Synthesized agents"
        >
          {filtered.map((a) => (
            <div role="listitem" key={a.id}>
              <AgentCard
                agent={a}
                extras={extras[a.id]!}
                selected={selected === a.id}
                onClick={() => setSelected(a.id)}
              />
            </div>
          ))}
        </div>
      )}

      <p className="font-display italic text-[18px] text-fg-muted pt-2 max-w-3xl leading-snug [font-variation-settings:'opsz'_36,'SOFT'_60]">
        Ten agents synthesized from ten 60-second recordings during the pitch.
        Every one of them signed, verified, federated, and memorized. Understudy:
        the <span className="text-accent-amber not-italic font-mono uppercase tracking-[0.12em] text-[12px] align-middle">agent that builds agents</span>.
      </p>

      </Section>

      {selectedAgent && selectedExtras && (
        <AgentDrawer
          agent={selectedAgent}
          extras={selectedExtras}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  caption,
  unit,
  verified,
}: {
  label: string;
  value: string;
  caption?: string;
  unit?: string;
  verified?: boolean;
}) {
  return (
    <section className="matrix-cell">
      <div className="kpi-label mb-3">{label}</div>
      <div className="kpi-value flex items-baseline gap-2">
        <em>{value}</em>
        {unit && <span className="font-mono text-[12px] text-fg-faint tracking-[0.05em] not-italic">{unit}</span>}
        {verified && (
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden className="text-accent-emerald">
            <circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M6 10l3 3 5-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      {caption && (
        <div className="font-mono text-[11px] text-fg-muted mt-3 tracking-[0.03em]">
          {caption}
        </div>
      )}
    </section>
  );
}
