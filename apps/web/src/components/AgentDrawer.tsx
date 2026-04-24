import { useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";
import type { Agent } from "@/api/types";
import { StatusChip } from "./StatusChip";
import { truncateDigest } from "@/lib/format";
import type { AgentCardExtras } from "./AgentCard";

const TABS = ["Overview", "Memory", "Runs", "Supply chain"] as const;
type Tab = (typeof TABS)[number];

const EXAMPLE_MEMORY = {
  turns: 12,
  topics: ["orders", "csv", "yesterday", "shopify", "export"],
  entities: {
    date_range: "yesterday",
    store: "quickbooks-demo.shopify.com",
  },
  vector_count: 47,
  quantization: "int8",
};

const EXAMPLE_RUNS = [
  { started: "14:03:12Z", dur: "4.2s", status: "success" as const },
  { started: "14:00:50Z", dur: "3.9s", status: "success" as const },
  { started: "13:58:04Z", dur: "5.1s", status: "success" as const },
  { started: "13:55:29Z", dur: "running", status: "running" as const },
];

export function AgentDrawer({
  agent,
  extras,
  onClose,
}: {
  agent: Agent;
  extras: AgentCardExtras;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("Overview");
  return (
    <aside
      className="fixed inset-y-0 right-0 w-[480px] bg-canvas-surface border-l border-border-strong z-40 flex flex-col shadow-[-24px_0_48px_-24px_rgba(0,0,0,0.6)]"
      role="dialog"
      aria-label={`Agent ${agent.id} detail`}
    >
      <header className="px-5 py-4 border-b border-border-subtle flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div>
            <div className="font-mono text-[14px]">
              agent-{agent.id.slice(0, 6)}
            </div>
            <div className="text-[11px] text-fg-muted">
              {extras.subgraph_id}
            </div>
          </div>
          <StatusChip status={extras.verified ? "verified" : "failed"} />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-fg-muted hover:text-fg"
          aria-label="Close agent drawer"
        >
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path
              d="M4 4l10 10M14 4L4 14"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>
      <nav className="px-5 pt-3 border-b border-border-subtle flex gap-0.5" aria-label="drawer tabs">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "px-3 py-2 text-[12px] rounded-t border-b-2",
              tab === t
                ? "text-fg border-primary"
                : "text-fg-muted border-transparent hover:text-fg"
            )}
          >
            {t}
          </button>
        ))}
      </nav>
      <div className="flex-1 overflow-auto scrollbar-tight px-5 py-4 text-[13px]">
        {tab === "Overview" && <Overview agent={agent} extras={extras} />}
        {tab === "Memory" && <MemoryTab />}
        {tab === "Runs" && <RunsTab />}
        {tab === "Supply chain" && (
          <div className="space-y-3">
            <p className="text-fg-muted">
              Full cosign receipts, SLSA predicate, and Rekor UUID render on the
              dedicated supply-chain screen.
            </p>
            <Link
              to={`/agents/${agent.id}/supply-chain`}
              className="btn btn-primary"
            >
              Open supply-chain receipts
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}

function Overview({
  agent,
  extras,
}: {
  agent: Agent;
  extras: AgentCardExtras;
}) {
  return (
    <div className="space-y-4">
      <dl className="card p-4">
        <div className="receipt-row">
          <dt>image_digest</dt>
          <dd>{agent.image_digest}</dd>
        </div>
        <div className="receipt-row">
          <dt>graphql_endpoint</dt>
          <dd>
            <a
              href={agent.graphql_endpoint}
              target="_blank"
              rel="noreferrer noopener"
              className="text-accent-cyan underline underline-offset-2 decoration-dotted"
            >
              {agent.graphql_endpoint}
            </a>
          </dd>
        </div>
        <div className="receipt-row">
          <dt>cosign_sig</dt>
          <dd>{truncateDigest(agent.cosign_sig, 18, 10)}</dd>
        </div>
        <div className="receipt-row">
          <dt>ams_namespace</dt>
          <dd>{agent.ams_namespace}</dd>
        </div>
        <div className="receipt-row">
          <dt>subgraph_id</dt>
          <dd>{extras.subgraph_id}</dd>
        </div>
      </dl>
      <div>
        <div className="text-[12px] text-fg-muted mb-2">Pinned skills</div>
        <div className="flex flex-wrap gap-1.5">
          {[
            "web-workflow-pack@2.3.1",
            "csv-export@0.4.2",
            "datepicker-resolver@0.2.0",
            "fly-ssh@0.1.1",
          ].map((s) => (
            <span key={s} className="chip chip-indigo">
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function MemoryTab() {
  return (
    <div className="space-y-3">
      <div className="card p-3 font-mono text-mono-base text-fg whitespace-pre-wrap">
        {JSON.stringify(EXAMPLE_MEMORY, null, 2)}
      </div>
      <p className="text-[12px] text-fg-muted">
        Redis Agent Memory Server · Vector Sets int8 (75% memory). Auto topic +
        entity extraction runs on every turn.
      </p>
    </div>
  );
}

function RunsTab() {
  return (
    <table className="w-full text-mono-base font-mono">
      <thead>
        <tr className="text-left text-fg-muted border-b border-border-subtle">
          <th className="py-2 font-normal">started_at</th>
          <th className="py-2 font-normal">duration</th>
          <th className="py-2 font-normal">status</th>
        </tr>
      </thead>
      <tbody>
        {EXAMPLE_RUNS.map((r, i) => (
          <tr key={i} className="border-b border-border-subtle/60">
            <td className="py-2 text-fg">{r.started}</td>
            <td className="py-2 text-fg">{r.dur}</td>
            <td className="py-2">
              <StatusChip
                status={r.status === "success" ? "completed" : "running"}
                label={r.status}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
