// COSMO DREAM QUERY viewer — beat 1:20-1:40.
// Renders the SDL diff + live-traffic validator PASS banner + supergraph
// preview + resolver stubs. Fields come from DreamQuery (apps/api/schemas.py)
// and the canonical fixture at fixtures/cosmo/orders-query.json.

import { Link, useParams } from "react-router-dom";
import { SdlDiffViewer } from "@/components/SdlDiffViewer";
import { DEMO_DREAM_QUERY } from "@/fixtures/demo";

const STUDIO_URL = (import.meta.env.VITE_STUDIO_URL as string) ?? "https://cosmo.wundergraph.com/studio";

export default function DreamQuery() {
  const { id } = useParams<{ id: string }>();
  const dq = DEMO_DREAM_QUERY;
  let report: {
    breaking_changes: number;
    client_ops_impacted: number;
    client_ops_sampled: number;
    window_days: number;
    hash: string;
    proposal_id: string;
    composable: boolean;
  } | null = null;
  try {
    report = JSON.parse(dq.validation_report);
  } catch {
    /* fixture is malformed; leave null */
  }

  return (
    <div className="space-y-6">
      <header className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-end pb-6 border-b border-border-subtle">
        <div>
          <div className="section-tag mb-3">Schema Synthesis — 003</div>
          <h1 className="section-title">
            Cosmo <em>dreams</em> the schema.
          </h1>
          <div className="font-mono text-[11px] text-fg-faint tracking-[0.12em] uppercase mt-3">
            run-{(id ?? "demo").slice(0, 8)} · proposal: {report?.proposal_id ?? "—"}
          </div>
        </div>
        <div className="flex gap-2">
          <a
            href={STUDIO_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="btn btn-ghost"
          >
            Open in Cosmo Studio →
          </a>
          <button type="button" className="btn btn-ghost">
            Re-run dream_query
          </button>
        </div>
      </header>

      {/* Hero summary */}
      <section className="card px-5 py-4 grid grid-cols-[1fr_2fr_220px] gap-6 items-center">
        <div className="space-y-1">
          <div className="chip chip-indigo">wundergraph/cosmo-mcp · dream_query</div>
          <div className="font-mono text-[13px] text-fg truncate">
            subgraph: <span className="text-accent-cyan">{dq.subgraph_id}</span>
          </div>
          <div className="font-mono text-mono-sm text-fg-muted truncate">
            proposal: {report?.proposal_id ?? "—"}
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 py-3 rounded border border-accent-emerald/30 bg-accent-emerald/5">
          <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
            <circle cx="14" cy="14" r="13" fill="none" stroke="currentColor" className="text-accent-emerald" strokeWidth="1.5"/>
            <path
              d="M8 14l4 4 8-8"
              fill="none"
              stroke="currentColor"
              className="text-accent-emerald"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div>
            <div className="text-accent-emerald font-semibold text-[15px] tracking-wide">
              PASS — {report?.breaking_changes ?? 0} breaking changes vs{" "}
              {(report?.client_ops_sampled ?? 0).toLocaleString()} client ops
            </div>
            <div className="font-mono text-mono-sm text-fg-muted">
              live traffic window: last {report?.window_days ?? 7}d · validation_report.hash = {report?.hash}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[28px] font-semibold tabular-nums">0.94</div>
          <div className="text-[12px] text-fg-muted">Dream Query confidence</div>
        </div>
      </section>

      <div className="grid grid-cols-[3fr_2fr] gap-4 items-start">
        {/* LEFT: SDL diff */}
        <div className="space-y-3">
          <SdlDiffViewer sdlDelta={dq.sdl_delta} />
          <div className="flex flex-wrap gap-1.5">
            <span className="chip">
              {dq.sdl_delta.split("\n").length} lines added
            </span>
            <span className="chip">0 removed</span>
            <span className="chip chip-emerald">composable: true</span>
            <span className="chip">proposal: {report?.proposal_id ?? "—"}</span>
            <span className="chip">EDFS: none</span>
          </div>
        </div>

        {/* RIGHT: stacked cards */}
        <div className="space-y-4">
          <section className="card p-4" aria-label="Validation report">
            <header className="flex items-baseline justify-between mb-3">
              <div>
                <h3 className="text-[14px] font-medium">Live-traffic validator</h3>
                <div className="text-[12px] text-fg-muted">
                  last {report?.window_days ?? 7} days ·{" "}
                  {(report?.client_ops_sampled ?? 0).toLocaleString()} ops sampled
                </div>
              </div>
              <span className="chip chip-emerald">PASS</span>
            </header>
            <dl>
              <div className="receipt-row">
                <dt>breaking_changes</dt>
                <dd className="text-accent-emerald">0</dd>
              </div>
              <div className="receipt-row">
                <dt>client_ops_impacted</dt>
                <dd>
                  0 / {(report?.client_ops_sampled ?? 0).toLocaleString()}
                </dd>
              </div>
              <div className="receipt-row">
                <dt>resolver_stubs</dt>
                <dd>
                  1 — Query.orderExports → insforge.postgrest://order_exports
                </dd>
              </div>
              <div className="receipt-row">
                <dt>subgraph</dt>
                <dd>{dq.subgraph_id}</dd>
              </div>
            </dl>
            <div className="mt-3 text-right">
              <a
                href="#"
                className="text-accent-cyan text-[12px] underline underline-offset-2 decoration-dotted"
              >
                View sampled operations →
              </a>
            </div>
          </section>

          <section className="card p-4" aria-label="Supergraph preview">
            <h3 className="text-[14px] font-medium mb-3">Composed supergraph</h3>
            <SupergraphMini />
            <div className="text-[12px] text-fg-muted mt-2">
              composed in 142ms · engine: cosmo-router v0.137
            </div>
            <a
              href={STUDIO_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="btn btn-primary mt-3 w-full justify-center"
            >
              Open in Cosmo Studio →
            </a>
          </section>

          <section className="card p-4" aria-label="Resolver stubs">
            <h3 className="text-[14px] font-medium mb-3">
              Resolver stubs generated by Dream Query
            </h3>
            <dl className="bg-canvas-elevated border border-border-subtle rounded p-3">
              <div className="receipt-row">
                <dt>type.field</dt>
                <dd className="text-accent-cyan">Query.orderExports</dd>
              </div>
              <div className="receipt-row">
                <dt>signature</dt>
                <dd>async (parent, args, ctx) =&gt; OrderExportConnection</dd>
              </div>
              <div className="receipt-row">
                <dt>backing</dt>
                <dd>insforge.postgrest://order_exports</dd>
              </div>
              <div className="receipt-row">
                <dt>arguments</dt>
                <dd>dateRange: String!, limit: Int = 50</dd>
              </div>
            </dl>
            <button type="button" className="btn btn-ghost mt-3">
              Copy stub
            </button>
          </section>
        </div>
      </div>

      <section className="px-5 py-4 border-l-2 border-accent-cyan/40 bg-canvas-surface rounded-r">
        <p className="italic text-[13px] text-fg-muted">
          Cosmo MCP just ran proposal → composition → check against live traffic
          → publish. No breaking changes against{" "}
          {(report?.client_ops_sampled ?? 0).toLocaleString()} client ops in the
          last {report?.window_days ?? 7} days. This is Dream Query doing
          exactly what the synthesizer needs.
        </p>
      </section>

      <div className="flex justify-end">
        <Link to={`/agents`} className="btn btn-ghost">
          Continue to Agent Wall →
        </Link>
      </div>
    </div>
  );
}

function SupergraphMini() {
  // A tiny static SVG — 5 existing subgraphs + 1 new one highlighted.
  return (
    <svg viewBox="0 0 400 180" className="w-full h-[180px]" aria-label="Composed supergraph preview">
      <defs>
        <radialGradient id="pulse" r="0.5">
          <stop offset="0%" stopColor="rgba(99,102,241,0.35)" />
          <stop offset="100%" stopColor="rgba(99,102,241,0)" />
        </radialGradient>
      </defs>
      {/* Edges */}
      <line x1="200" y1="90" x2="70" y2="40" stroke="#2A3042" strokeWidth="1" />
      <line x1="200" y1="90" x2="70" y2="140" stroke="#2A3042" strokeWidth="1" />
      <line x1="200" y1="90" x2="330" y2="40" stroke="#2A3042" strokeWidth="1" />
      <line x1="200" y1="90" x2="330" y2="140" stroke="#2A3042" strokeWidth="1" />
      <line x1="200" y1="90" x2="200" y2="160" stroke="#6366F1" strokeWidth="1.5" strokeDasharray="4 3" />
      {/* Center: router */}
      <rect x="160" y="72" width="80" height="36" rx="6" fill="#171A24" stroke="#2A3042" />
      <text x="200" y="94" fontFamily="JetBrains Mono" fontSize="10" fill="#9AA0B4" textAnchor="middle">
        cosmo-router
      </text>
      {/* Existing subgraphs */}
      {[
        { x: 30, y: 20, label: "products" },
        { x: 30, y: 120, label: "users" },
        { x: 290, y: 20, label: "inventory" },
        { x: 290, y: 120, label: "search" },
      ].map((n) => (
        <g key={n.label} transform={`translate(${n.x},${n.y})`}>
          <rect width="80" height="36" rx="6" fill="#11131B" stroke="#2A3042" />
          <text
            x="40"
            y="22"
            fontFamily="JetBrains Mono"
            fontSize="10"
            fill="#9AA0B4"
            textAnchor="middle"
          >
            {n.label}
          </text>
        </g>
      ))}
      {/* New subgraph — highlighted */}
      <g transform="translate(150,145)">
        <circle cx="50" cy="18" r="28" fill="url(#pulse)" />
        <rect width="100" height="30" rx="6" fill="#1E2230" stroke="#6366F1" strokeWidth="1.2" />
        <text
          x="50"
          y="19"
          fontFamily="JetBrains Mono"
          fontSize="10"
          fill="#A5B4FC"
          textAnchor="middle"
        >
          agent_orders_exporter
        </text>
      </g>
    </svg>
  );
}
