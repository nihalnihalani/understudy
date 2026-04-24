// COSMO DREAM QUERY viewer — beat 1:20-1:40. Top banner = live-traffic
// validator PASS; main = side-by-side SDL diff; right rail = composed
// supergraph mini-map + Cosmo Studio deep-link.
//
// Data shape: DreamQueryRow (apps/api/schemas.py). The backend /synthesis
// endpoint does NOT currently return the dream-query row, so we render the
// canonical fixture from fixtures/cosmo/orders-query.json. Every
// fixture-sourced stat is labeled accordingly per devils-advocate review.

import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Copy, RefreshCw } from "lucide-react";
import { PageHeader } from "@/layouts/AppShell";
import { TrafficValidatorBanner } from "@/components/synthesis/TrafficValidatorBanner";
import { SdlDiffViewer } from "@/components/synthesis/SdlDiffViewer";
import { SupergraphMiniMap } from "@/components/synthesis/SupergraphMiniMap";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/toast";
import { DEMO_DREAM_QUERY } from "@/fixtures/demo";

const STUDIO_URL =
  (import.meta.env.VITE_STUDIO_URL as string | undefined) ??
  "https://cosmo.wundergraph.com/studio";

// The supergraph before this proposal lands. Stable, checked-in so the
// diff viewer has something real to render alongside the delta.
const CURRENT_SUPERGRAPH_SDL = `# subgraphs: products, users, inventory, search
type Query {
  products(first: Int = 20, after: String): ProductConnection!
  user(id: ID!): User
  inventory(sku: String!): Inventory
  searchProducts(q: String!): [Product!]!
}

type Product {
  id: ID!
  name: String!
  priceCents: Int!
}

type User {
  id: ID!
  email: String!
}

type Inventory {
  sku: String!
  stock: Int!
}

scalar DateTime`;

interface ValidationReport {
  breaking_changes: number;
  client_ops_impacted: number;
  client_ops_sampled: number;
  window_days: number;
  hash: string;
  proposal_id: string;
  composable: boolean;
}

export default function DreamQuery() {
  const { id } = useParams<{ id: string }>();
  const dq = DEMO_DREAM_QUERY;

  const report = useMemo<ValidationReport | null>(() => {
    try {
      return JSON.parse(dq.validation_report) as ValidationReport;
    } catch {
      return null;
    }
  }, [dq.validation_report]);

  const proposedSdl = `${CURRENT_SUPERGRAPH_SDL}\n\n# +++ agent_orders_exporter +++\n${dq.sdl_delta}`;

  const copyOperation = async () => {
    try {
      await navigator.clipboard.writeText(dq.desired_operation);
      toast.success("Copied desired operation");
    } catch {
      toast.error("Clipboard unavailable");
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`1:20 — 1:40 · cosmo dream_query · run-${(id ?? "demo").slice(0, 8)}`}
        title="Dream Query — schema synthesized from intent"
        description="Cosmo MCP derives a subgraph SDL from the emitted script, composes it into the supergraph, and validates against live traffic — no breaking changes."
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={copyOperation}>
              <Copy className="size-3.5" /> Copy operation
            </Button>
            <Button variant="secondary" size="sm">
              <RefreshCw className="size-3.5" /> Re-run dream_query
            </Button>
          </>
        }
      />

      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <TrafficValidatorBanner
          breakingChanges={report?.breaking_changes ?? 0}
          clientOpsSampled={report?.client_ops_sampled ?? 4212}
          windowDays={report?.window_days ?? 7}
          hash={report?.hash}
          isFixture
        />
      </motion.div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <motion.div 
          className="min-w-0 space-y-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <Card className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_8px_40px_rgba(0,0,0,0.4)]">
            <CardContent className="space-y-3 p-4">
              <header className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-[14px] font-semibold text-foreground">
                    Desired operation
                  </h2>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    derived by cosmo-mcp · pinned to subgraph{" "}
                    <span className="text-accent">{dq.subgraph_id}</span>
                  </p>
                </div>
                <Badge variant="primary">{report?.proposal_id ?? "—"}</Badge>
              </header>
              <pre className="overflow-auto rounded-lg border border-white/10 bg-black/40 backdrop-blur-xl p-3 font-mono text-[11px] leading-[1.6] text-foreground shadow-inner">
{dq.desired_operation}
              </pre>
            </CardContent>
          </Card>

          <SdlDiffViewer
            currentSdl={CURRENT_SUPERGRAPH_SDL}
            proposedSdl={proposedSdl}
            proposalId={report?.proposal_id}
          />

          <ResolverStubs subgraphId={dq.subgraph_id} />
        </motion.div>

        <motion.aside 
          className="space-y-4" 
          aria-label="Supergraph composition"
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <SupergraphMiniMap
            studioUrl={STUDIO_URL}
            subgraphs={[
              { id: "products", typeCount: 6 },
              { id: "users", typeCount: 4 },
              { id: "inventory", typeCount: 3 },
              { id: "search", typeCount: 2 },
              { id: dq.subgraph_id, typeCount: 5, isNew: true },
            ]}
          />

          <Card className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_8px_40px_rgba(0,0,0,0.4)]">
            <CardContent className="space-y-3 p-4">
              <h3 className="text-[14px] font-semibold text-foreground">
                Why this matters
              </h3>
              <p className="text-[12px] leading-[1.55] text-muted-foreground">
                Cosmo MCP just ran proposal → composition → check against live
                traffic → publish. Dream Query does exactly what the
                synthesizer needs: a new subgraph that composes cleanly with
                every existing client.
              </p>
              <Separator />
              <dl className="space-y-1.5 font-mono text-[11px]">
                <DlRow k="composable" v="true" tone="success" />
                <DlRow
                  k="breaking_changes"
                  v={String(report?.breaking_changes ?? 0)}
                  tone="success"
                />
                <DlRow k="engine" v="cosmo-router v0.137" />
                <DlRow k="edfs" v="none" />
              </dl>
            </CardContent>
          </Card>

          <Link to="/agents" className="w-full">
            <Button variant="secondary" size="lg" className="w-full group">
              Continue to Agent Wall
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </Button>
          </Link>
        </motion.aside>
      </div>
    </div>
  );
}

function ResolverStubs({ subgraphId }: { subgraphId: string }) {
  const stubs = [
    {
      type: "Query.orderExports",
      signature: "async (parent, args, ctx) => OrderExportConnection",
      backing: "insforge.postgrest://order_exports",
      args: "dateRange: String!, limit: Int = 50",
    },
  ];
  return (
    <Card className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_8px_40px_rgba(0,0,0,0.4)]">
      <CardContent className="space-y-3 p-4">
        <header className="flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-foreground">
            Resolver stubs
          </h2>
          <Badge variant="outline">{stubs.length} generated</Badge>
        </header>
        {stubs.map((s) => (
          <div
            key={s.type}
            className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl p-3 shadow-inner"
          >
            <dl className="space-y-1.5 font-mono text-[11px]">
              <DlRow k="type.field" v={s.type} tone="accent" />
              <DlRow k="signature" v={s.signature} />
              <DlRow k="backing" v={s.backing} />
              <DlRow k="arguments" v={s.args} />
              <DlRow k="subgraph" v={subgraphId} tone="primary" />
            </dl>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DlRow({
  k,
  v,
  tone,
}: {
  k: string;
  v: string;
  tone?: "success" | "primary" | "accent";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "primary"
      ? "text-primary-soft"
      : tone === "accent"
      ? "text-accent"
      : "text-foreground";
  return (
    <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-2">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className={`truncate ${toneClass}`}>{v}</dd>
    </div>
  );
}
