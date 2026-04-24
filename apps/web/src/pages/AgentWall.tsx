// AGENT WALL — demo beat 2:55-3:00, the "agent that builds agents" closer.
//
// Grid of synthesized agents. Each card surfaces the governance signals:
// signing status, image digest, GraphQL endpoint, AMS namespace, a recent-
// runs sparkline, and a relative "last seen" timestamp. Click opens a
// right-side detail sheet with manifest, pinned skills, memory dump, and
// run history.
//
// Data:
//   list      : GET /agents            (falls back to DEMO_AGENTS fixture)
//   extras    : DEMO_AGENT_EXTRAS      (fixtures — flagged data-demo="fixture")
//   sparkline : TODO wire /agents/:id/runs when available; today via seedSparkline
//   memory    : TODO wire /agents/:id/memory when available; today via seedMemory
//   runs      : TODO wire /agents/:id/runs when available; today via seedRuns

import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, Sparkles, ShieldCheck, Filter } from "lucide-react";
import { PageHeader, Button } from "@/layouts/AppShell";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AgentCard, type AgentCardExtras } from "@/components/agents/AgentCard";
import { AgentDetailSheet } from "@/components/agents/AgentDetailSheet";
import {
  inferState,
  seedSparkline,
  seedMemory,
  seedRuns,
} from "@/components/agents/agentWallSeeds";
import { api } from "@/api/client";
import { DEMO_AGENTS, DEMO_AGENT_EXTRAS } from "@/fixtures/demo";
import type { Agent } from "@/api/types";
import { cn } from "@/lib/utils";

type FilterKey = "all" | "signed" | "unsigned" | "active" | "idle";

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
    const out: Record<string, AgentCardExtras> = {};
    for (const a of agents) {
      const base = DEMO_AGENT_EXTRAS[a.id] ?? {
        subgraph_id: "agent_generic",
        runs_count: 0,
        last_seen_at: new Date().toISOString(),
        memory_mb: 0,
        skill_pin: "web-workflow-pack@2.3.1",
        verified: true,
      };
      out[a.id] = {
        ...base,
        state: inferState(base),
        sparkline: seedSparkline(a.id, base.runs_count),
      } satisfies AgentCardExtras;
    }
    return out;
  }, [agents]);

  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return agents.filter((a) => {
      const ex = extras[a.id]!;
      if (filter === "signed" && !ex.verified) return false;
      if (filter === "unsigned" && ex.verified) return false;
      if (filter === "active" && ex.state !== "active") return false;
      if (filter === "idle" && ex.state !== "idle") return false;
      if (!needle) return true;
      return (
        a.id.toLowerCase().includes(needle) ||
        a.graphql_endpoint.toLowerCase().includes(needle) ||
        a.ams_namespace.toLowerCase().includes(needle) ||
        a.image_digest.toLowerCase().includes(needle) ||
        ex.subgraph_id.toLowerCase().includes(needle)
      );
    });
  }, [agents, extras, filter, query]);

  const counts = useMemo(() => {
    const signed = agents.filter((a) => extras[a.id]?.verified).length;
    const unsigned = agents.length - signed;
    const active = agents.filter((a) => extras[a.id]?.state === "active").length;
    const idle = agents.filter((a) => extras[a.id]?.state === "idle").length;
    return { all: agents.length, signed, unsigned, active, idle };
  }, [agents, extras]);

  const openAgent = useCallback((id: string) => setOpenId(id), []);
  const openSupplyChain = useCallback(
    (id: string) => navigate(`/agents/${id}/supply-chain`),
    [navigate]
  );

  const selected = openId ? agents.find((a) => a.id === openId) ?? null : null;
  const selectedExtras = openId ? extras[openId] ?? null : null;
  const selectedMemory =
    selected && selectedExtras ? seedMemory(selected, selectedExtras) : undefined;
  const selectedRuns =
    selected && selectedExtras ? seedRuns(selected, selectedExtras) : [];
  const selectedSkills = selected
    ? [
        { name: "@tinyfish/web-workflow-pack", version: "2.3.1", invocations: 142 },
        { name: "@tinyfish/csv-export", version: "0.4.2", invocations: 87 },
        { name: "@tinyfish/datepicker-resolver", version: "0.2.0", invocations: 31 },
      ]
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="agents"
        title="Agent wall"
        description={
          <>
            Every synthesized agent is a federated Cosmo subgraph backed by a
            signed, SLSA-attested container running TinyFish skills and talking
            to Redis Agent Memory Server. Ten agents, one pipeline.
          </>
        }
        actions={
          <Button asChild variant="primary" size="sm">
            <Link to="/synthesize">
              <Sparkles className="size-3.5" />
              Synthesize new
            </Link>
          </Button>
        }
      />

      <section
        aria-label="Wall summary"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <SummaryCard
          label="agents synthesized"
          value={counts.all.toString()}
          caption="last 3 min"
        />
        <SummaryCard
          label="signed · verified"
          value={`${counts.signed} / ${counts.all}`}
          caption="SLSA L2 · cosign · Fulcio"
          tone="success"
        />
        <SummaryCard
          label="active now"
          value={counts.active.toString()}
          caption={`${counts.idle} idle`}
          tone="accent"
        />
        <SummaryCard
          label="avg synthesis"
          value="87.4s"
          caption="target ≤ 90s"
          fixture
        />
      </section>

      <FilterBar
        filter={filter}
        onFilter={setFilter}
        query={query}
        onQuery={setQuery}
        counts={counts}
        filteredCount={filtered.length}
        total={agents.length}
      />

      {isLoading && agents.length === 0 ? (
        <LoadingGrid />
      ) : filtered.length === 0 ? (
        <EmptyState hasFilter={Boolean(query) || filter !== "all"} />
      ) : (
        <section
          role="list"
          aria-label="Synthesized agents"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {filtered.map((a) => (
            <div role="listitem" key={a.id}>
              <AgentCard
                agent={a}
                extras={extras[a.id]!}
                selected={openId === a.id}
                onOpen={() => openAgent(a.id)}
                onAction={(action) => {
                  if (action === "supply-chain") openSupplyChain(a.id);
                  else openAgent(a.id);
                }}
              />
            </div>
          ))}
        </section>
      )}

      <AgentDetailSheet
        agent={selected}
        extras={selectedExtras}
        memory={selectedMemory}
        recentRuns={selectedRuns}
        skillsPinned={selectedSkills}
        open={openId !== null}
        onOpenChange={(o) => !o && setOpenId(null)}
        memoryFixture
        runsFixture
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  caption,
  tone,
  fixture,
}: {
  label: string;
  value: string;
  caption?: string;
  tone?: "success" | "accent";
  fixture?: boolean;
}) {
  return (
    <div
      data-demo={fixture ? "fixture" : undefined}
      className="rounded-lg border border-border bg-surface p-4"
    >
      <div className="font-mono text-[10px] uppercase tracking-wider text-faint">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 flex items-baseline gap-2 font-mono text-[24px] font-semibold tabular-nums leading-none",
          tone === "success" && "text-success",
          tone === "accent" && "text-accent",
          !tone && "text-foreground"
        )}
      >
        {value}
        {tone === "success" && <ShieldCheck className="size-4" />}
      </div>
      {caption && (
        <div className="mt-1 font-mono text-[10px] text-muted-foreground">
          {caption}
          {fixture && <span className="ml-1 text-faint">· demo fixture</span>}
        </div>
      )}
    </div>
  );
}

function FilterBar({
  filter,
  onFilter,
  query,
  onQuery,
  counts,
  filteredCount,
  total,
}: {
  filter: FilterKey;
  onFilter: (f: FilterKey) => void;
  query: string;
  onQuery: (q: string) => void;
  counts: Record<FilterKey, number>;
  filteredCount: number;
  total: number;
}) {
  return (
    <section
      aria-label="Filter and search"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface/60 p-3 sm:flex-row sm:items-center"
    >
      <div
        role="radiogroup"
        aria-label="Filter agents"
        className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-background p-1"
      >
        <Filter className="ml-1.5 size-3 text-faint" aria-hidden />
        {(["all", "signed", "unsigned", "active", "idle"] as FilterKey[]).map((k) => (
          <FilterPill
            key={k}
            active={filter === k}
            onClick={() => onFilter(k)}
            label={k}
            count={counts[k]}
          />
        ))}
      </div>

      <div className="relative flex-1">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="endpoint, namespace, digest, subgraph…"
          className="pl-8 font-mono text-[12px]"
          aria-label="Search agents"
        />
      </div>

      <Badge variant="default" className="shrink-0">
        {filteredCount} of {total} agents
      </Badge>
    </section>
  );
}

function FilterPill({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-sm px-2 font-mono text-[11px] uppercase tracking-wider",
        "transition-colors duration-fast",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-elevated text-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
      <span
        className={cn(
          "font-mono text-[10px] tabular-nums",
          active ? "text-primary-soft" : "text-faint"
        )}
      >
        {count}
      </span>
    </button>
  );
}

function LoadingGrid() {
  return (
    <div
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      aria-label="Loading agents"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-[240px] rounded-lg" />
      ))}
    </div>
  );
}

function EmptyState({ hasFilter }: { hasFilter: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border bg-surface/40 px-6 py-16 text-center">
      <Sparkles className="size-6 text-faint" aria-hidden />
      <div className="space-y-1">
        <div className="font-mono text-[13px] text-foreground">
          {hasFilter ? "No agents match that filter" : "No agents synthesized yet"}
        </div>
        <div className="max-w-sm font-mono text-[11px] text-muted-foreground">
          {hasFilter
            ? "Clear the search or try a different filter."
            : "Upload a 60-second recording and the three-model pipeline will return a signed, federated agent in ~90 seconds."}
        </div>
      </div>
      {!hasFilter && (
        <Button asChild variant="primary" size="sm">
          <Link to="/synthesize">
            <Sparkles className="size-3.5" />
            Upload a recording
          </Link>
        </Button>
      )}
    </div>
  );
}
