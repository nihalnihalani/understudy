// Hand-written TypeScript mirrors of apps/api/schemas.py (Pydantic).
// Kept in 1:1 correspondence — if a field is added in schemas.py, add it here.
// Not generated: pydantic-to-typescript would pull the full python toolchain
// into CI for a ~200-line file; manual sync is cheaper. Linked to schemas.py
// by name; see apps/web/README.md for the update discipline.

export type UUID = string;

export type SynthesisStatus = "queued" | "running" | "completed" | "failed";

export type DemoMode = "live" | "replay" | "hybrid";

export interface Recording {
  id: UUID;
  s3_uri: string;
  duration_s: number;
  created_at: string;
}

export interface SynthesisRun {
  id: UUID;
  recording_id: UUID;
  status: SynthesisStatus;
  gemini_lite_trace: string | null;
  gemini_pro_trace: string | null;
  gemini_flash_trace: string | null;
  intent_abstraction: IntentAbstraction | null;
  completed_at: string | null;
}

export interface IntentAbstraction {
  goal: string;
  inputs: { name: string; type: string; default?: string | number | boolean }[];
  invariants: Record<string, string>;
  output_schema: Record<string, unknown>;
  steps: { intent: string; selector_hint: string }[];
}

export interface DreamQueryRow {
  id: UUID;
  synthesis_run_id: UUID;
  desired_operation: string;
  sdl_delta: string;
  validation_report: string;
  subgraph_id: string;
}

export interface Agent {
  id: UUID;
  image_digest: string;
  cosign_sig: string;
  graphql_endpoint: string;
  ams_namespace: string;
}

export interface AgentMemory {
  id: UUID;
  agent_id: UUID;
  ams_key: string;
  memory_type: string;
  topics: string[];
  entities: Record<string, unknown>;
  embedding: number[] | null;
}

export interface TinyFishSkillUsed {
  id: UUID;
  agent_id: UUID;
  skill_name: string;
  skill_version: string;
  invocation_count: number;
}

export interface SlsaAttestation {
  id: UUID;
  predicate_type: string;
  builder_id: string;
  materials: {
    uri: string;
    digest: string;
    trust?: string;
  }[] & Record<string, unknown>;
}

export interface Sbom {
  id: UUID;
  format: string;
  generation_time: string;
  components: { name: string; version?: string; purl?: string }[];
}

export interface ImageRow {
  digest: string;
  registry: string;
  built_at: string;
}

export interface AgentRun {
  id: UUID;
  agent_id: UUID;
  started_at: string;
  ended_at: string | null;
  status: string;
  result: Record<string, unknown> | null;
}

export interface SynthesizeAccepted {
  synthesis_run_id: UUID;
  status: SynthesisStatus;
}

export interface TraceEvent {
  ts: string;
  stage: string;
  message: string;
  data: Record<string, unknown> | null;
}

export interface SynthesisRunDetail {
  run: SynthesisRun;
  trace: TraceEvent[];
}

export interface ServiceProbe {
  name: string;
  status: string;
  detail?: string | null;
}

export interface HealthResponse {
  status: string;
  demo_mode: DemoMode;
  services: ServiceProbe[];
}

export interface ReplayResponse {
  synthesis_run_id: UUID;
  served_from: string;
  payload: Record<string, unknown>;
}

// GET /agents/{id}/protocols — multi-protocol surface for the agent's
// federated subgraph. `graphql` is on the router's :4000 GraphQL endpoint;
// `grpc`/`rest`/`connect` are all the same ConnectRPC base URL on :5026
// (same URL, three Content-Type negotiations: application/grpc,
// application/json, Connect-Protocol-Version: 1).
// Mirror of apps/api/schemas.py::AgentProtocols.
export interface AgentProtocols {
  agent_id: string;
  endpoints: {
    graphql: string;
    grpc: string;
    rest: string;
    connect: string;
  };
}

// GET /agents/{id}/attestation — backend-provided bundle (apps/api/schemas.py).
// Every field the Supply Chain page renders as a governance receipt lives
// here — no client-side derivation. `cert_not_*` and `rekor_integrated_time`
// are ISO datetimes.
export interface ApiFullAttestation {
  agent: Agent;
  image: ImageRow;
  slsa: SlsaAttestation;
  sbom: Sbom;
  rekor_log_index: number;
  rekor_url: string;
  rekor_uuid: string;
  rekor_integrated_time: string;
  certificate_identity: string;
  certificate_oidc_issuer: string;
  subject_alt_name: string;
  cert_not_before: string;
  cert_not_after: string;
}

// `event: done` frame emitted by GET /synthesis/{id}/stream when the run
// reaches a terminal state. Browsers dispatch it via
// es.addEventListener("done", ...) — it does NOT hit es.onmessage.
export interface SseDonePayload {
  status: "completed" | "failed";
  synthesis_run_id: UUID;
}
