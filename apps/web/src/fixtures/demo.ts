// Demo fixtures for when the API is not running / DEMO_MODE=replay.
// Mirrors data shapes from apps/api/schemas.py exactly.
// Real values live in fixtures/cosmo/orders-query.json (source of truth for SDL).

import type {
  Agent,
  ApiFullAttestation,
  DreamQueryRow,
  IntentAbstraction,
  ImageRow,
  Sbom,
  SlsaAttestation,
  SynthesisRunDetail,
} from "@/api/types";
import type { AgentCardExtras } from "@/components/AgentCard";

export const DEMO_SYNTH_ID = "7f3c29de-9a44-4b02-bb0d-2cf61a3d1e74";

export const DEMO_INTENT: IntentAbstraction = {
  goal: "Export yesterday's completed orders as CSV",
  inputs: [{ name: "date_range", type: "string", default: "yesterday" }],
  invariants: { target_site: "shopify.com" },
  output_schema: { OrderExport: "[]" },
  steps: [
    { intent: "navigate_to_orders", selector_hint: "nav >> Orders" },
    { intent: "open_filters", selector_hint: "button >> Filters" },
    { intent: "set_date_range", selector_hint: "input[name=dateRange]" },
    { intent: "click_export", selector_hint: "button >> Export CSV" },
  ],
};

export const DEMO_ACTION_CALLS = [
  '{ "action":"CLICK", "target_description":"Export CSV button", "bbox":[1104,82,1198,114], "confidence":0.93 }',
  '{ "action":"TYPE",  "target_description":"date-range filter", "text_typed":"yesterday", "confidence":0.88 }',
  '{ "action":"NAV",   "target_description":"Orders page", "confidence":0.97 }',
  '{ "action":"CLICK", "target_description":"Filter chevron", "bbox":[422,160,458,192], "confidence":0.91 }',
];

export const DEMO_INTENT_THOUGHTS = [
  "[thought] Events cluster on /orders; action verbs imply export, not browse…",
  "[thought] date-range value is variable — promote to input",
  "[thought] target invariant: shopify.com hostname, fixed",
  "[thought] setting tool surface = {navigate, click, type, download}…",
];

export const DEMO_SCRIPT_LINES = [
  'import { TinyFish } from "@tinyfish/cli";',
  'import { ordersSkill } from "@tinyfish/skills/web-workflow-pack";',
  "",
  "export const run = async (input: { date_range: string }) => {",
  "  const tf = new TinyFish({ headless: false });",
  '  await tf.navigate("https://quickbooks-demo.shopify.com/admin/orders");',
  '  await tf.click("button >> Filters");',
  '  await tf.type("input[name=dateRange]", input.date_range);',
  '  await tf.click("button >> Export CSV");',
  '  const { csv_url } = await ordersSkill.awaitExport(tf);',
  "  return { csv_url };",
  "};",
];

export const DEMO_KEYFRAMES: Array<{ ts: string; targetX: number; targetY: number }> = [
  { ts: "00:02.1", targetX: 18, targetY: 30 },
  { ts: "00:06.8", targetX: 28, targetY: 22 },
  { ts: "00:12.4", targetX: 40, targetY: 35 },
  { ts: "00:18.7", targetX: 52, targetY: 28 },
  { ts: "00:25.3", targetX: 64, targetY: 44 },
  { ts: "00:31.9", targetX: 72, targetY: 52 },
  { ts: "00:44.0", targetX: 82, targetY: 30 },
  { ts: "00:57.6", targetX: 88, targetY: 58 },
];

export const DEMO_DREAM_QUERY: DreamQueryRow = {
  id: "9ce1bd0c-4472-48fb-9d9c-5f2f7041cb17",
  synthesis_run_id: DEMO_SYNTH_ID,
  desired_operation:
    "query OrderExports($dateRange: String!) { orderExports(dateRange: $dateRange, limit: 50) { edges { node { id orderNumber placedAt totalCents currency csvUrl } } } }",
  sdl_delta: `extend type Query {
  """Yesterday's completed orders, filtered by an ISO date range or a relative token like 'yesterday'."""
  orderExports(dateRange: String!, limit: Int = 50): OrderExportConnection!
}

type OrderExportConnection {
  edges: [OrderExportEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type OrderExportEdge {
  node: OrderExport!
  cursor: String!
}

type OrderExport {
  id: ID!
  orderNumber: String!
  placedAt: DateTime!
  totalCents: Int!
  currency: String!
  csvUrl: String!
}

type PageInfo {
  hasNextPage: Boolean!
  endCursor: String
}

scalar DateTime`,
  validation_report: JSON.stringify(
    {
      breaking_changes: 0,
      client_ops_impacted: 0,
      client_ops_sampled: 4212,
      window_days: 7,
      hash: "sha256:9ce1bd0c44724bfe9d9c5f2f7041cb17",
      proposal_id: "p-4e3a2",
      composable: true,
    },
    null,
    2
  ),
  subgraph_id: "agent_orders_exporter",
};

export const DEMO_SYNTHESIS: SynthesisRunDetail = {
  run: {
    id: DEMO_SYNTH_ID,
    recording_id: "a21c3b87-5c10-4cd1-9f18-d4e96e1a1b02",
    status: "running",
    gemini_lite_trace: DEMO_ACTION_CALLS.join("\n"),
    gemini_pro_trace: DEMO_INTENT_THOUGHTS.join("\n"),
    gemini_flash_trace: null,
    intent_abstraction: DEMO_INTENT,
    completed_at: null,
  },
  trace: [
    {
      ts: "2026-04-23T14:30:49.000Z",
      stage: "ingest",
      message: "recording accepted (27,681,920 bytes)",
      data: null,
    },
    {
      ts: "2026-04-23T14:30:52.000Z",
      stage: "frames",
      message: "scene-change extracted 8 keyframes (60 → 8)",
      data: null,
    },
    {
      ts: "2026-04-23T14:31:06.000Z",
      stage: "flash-lt",
      message: "emit_event ×4 (CLICK, TYPE, NAV, CLICK)",
      data: null,
    },
    {
      ts: "2026-04-23T14:31:07.000Z",
      stage: "3-1-pro",
      message: "thinking_level: high · abstracting intent…",
      data: null,
    },
  ],
};

// Ten demo agents for the Wall — all VERIFIED.
const SUBGRAPHS = [
  "agent_orders_exporter",
  "agent_product_catalog",
  "agent_shipments_tracker",
  "agent_refunds_auditor",
  "agent_invoice_exporter",
  "agent_inventory_reconcile",
  "agent_supplier_outreach",
  "agent_analytics_digest",
  "agent_returns_portal",
  "agent_payments_audit",
];

const AGENT_IDS = [
  "a4e91c00-1111-4000-8000-000000000001",
  "b7f12d00-1111-4000-8000-000000000002",
  "c23e8000-1111-4000-8000-000000000003",
  "d91a6c00-1111-4000-8000-000000000004",
  "e05b3f00-1111-4000-8000-000000000005",
  "f74c2100-1111-4000-8000-000000000006",
  "0a82e400-1111-4000-8000-000000000007",
  "12d47b00-1111-4000-8000-000000000008",
  "3f908a00-1111-4000-8000-000000000009",
  "46c1d700-1111-4000-8000-000000000010",
];

export const DEMO_AGENTS: Agent[] = AGENT_IDS.map((id, i) => ({
  id,
  image_digest: `sha256:${id.replace(/-/g, "").slice(0, 8)}3a11d4b8c7e29c6f04a1a0e8f2c9b7e10c7f4d8a1e91c2c47b81d12d9cb1`,
  cosign_sig: `MEYCIQD${id.replace(/-/g, "").slice(0, 6).toUpperCase()}1z2a3b4c5d6e7f8g9h0iJkLmNoPqRsTuVwXyZaAbBcCdDeEfFgG`,
  graphql_endpoint: `https://agent-${id.slice(0, 6)}.fly.dev/graphql`,
  ams_namespace: `ams:agent:${id.slice(0, 6)}:*`,
}));

export const DEMO_AGENT_EXTRAS: Record<string, AgentCardExtras> = Object.fromEntries(
  DEMO_AGENTS.map((a, i) => {
    const sub = SUBGRAPHS[i] ?? "agent_generic";
    const now = Date.now();
    const secAgo = 14 + i * 23;
    return [
      a.id,
      {
        subgraph_id: sub,
        runs_count: 127 - i * 9 + (i % 3) * 4,
        last_seen_at: new Date(now - secAgo * 1000).toISOString(),
        memory_mb: 2.4 - i * 0.11,
        skill_pin: "web-workflow-pack@2.3.1",
        verified: true,
      } satisfies AgentCardExtras,
    ];
  })
);

// Supply-chain receipt fixture. Same shape as the live GET /agents/{id}/attestation
// response so the Supply Chain page can fall back to this when the API is
// unavailable without any branching in the renderer.
const REKOR_UUID =
  "91a4e8fd2c3b47d5b5b9a0e41c7728f3e66ad1b27c94a3b0c1d4ef5a6b7c8d9e";
export const DEMO_ATTESTATION: ApiFullAttestation = {
  agent: DEMO_AGENTS[0]!,
  image: {
    digest: DEMO_AGENTS[0]!.image_digest,
    registry: "ghcr.io/nihalnihalani/understudy",
    built_at: "2026-04-23T14:31:04Z",
  } satisfies ImageRow,
  slsa: {
    id: "att-001",
    predicate_type: "https://slsa.dev/provenance/v0.2",
    builder_id: "https://github.com/actions/runner@v2.322.0",
    materials: [
      {
        uri: "git+https://github.com/nihalnihalani/understudy",
        digest: "sha1:457be2c5567d946a2dd6c4541a419060237455c2",
        trust: "GITHUB_OIDC",
      },
      {
        uri: "pkg:oci/chainguard/wolfi-base@sha256:fa0c4a7b",
        digest:
          "sha256:fa0c4a7b9c5d2e0184d3b7a110cca7bbd2391d12e8e4a9ef3bb1e3b0e5aa4c4b",
        trust: "CHAINGUARD_REGISTRY",
      },
      {
        uri: "pkg:npm/%40tinyfish/cli@2.3.1",
        digest: "sha512:9b21a0c9b5d3e2a1ffa4d7",
        trust: "TINYFISH_REGISTRY",
      },
    ] as SlsaAttestation["materials"],
  } satisfies SlsaAttestation,
  sbom: {
    id: "sbom-001",
    format: "spdx-2.3",
    generation_time: "2026-04-23T14:30:58Z",
    components: new Array(287).fill(0).map((_, i) => ({
      name: `component-${i}`,
      version: "1.0.0",
    })),
  } satisfies Sbom,
  rekor_log_index: 187429301,
  rekor_url: `https://rekor.sigstore.dev/api/v1/log/entries/${REKOR_UUID}`,
  rekor_uuid: REKOR_UUID,
  rekor_integrated_time: "2026-04-23T14:31:09Z",
  certificate_identity:
    "https://github.com/nihalnihalani/understudy/.github/workflows/release.yml@refs/heads/main",
  certificate_oidc_issuer: "https://token.actions.githubusercontent.com",
  subject_alt_name:
    "URI:https://github.com/nihalnihalani/understudy/.github/workflows/release.yml@refs/heads/main",
  cert_not_before: "2026-04-23T14:30:51Z",
  cert_not_after: "2026-04-23T14:40:51Z",
};
