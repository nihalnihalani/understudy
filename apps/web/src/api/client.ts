// Typed client for the FastAPI synthesis service (apps/api/main.py).
// Dev-server proxy in vite.config.ts rewrites /api -> http://localhost:8080.
// For prod, set VITE_API_BASE_URL at build time.

import type {
  Agent,
  AgentProtocols,
  ApiFullAttestation,
  HealthResponse,
  ReplayResponse,
  SynthesisRunDetail,
  SynthesizeAccepted,
} from "./types";

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

async function request<T>(
  path: string,
  init?: RequestInit & { expectStatus?: number }
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  const expected = init?.expectStatus ?? 200;
  if (res.status !== expected && !res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, `${path} -> ${res.status}: ${body}`);
  }
  return (await res.json()) as T;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export async function uploadRecording(
  file: File,
  onProgress?: (pct: number) => void
): Promise<SynthesizeAccepted> {
  // XHR used over fetch() because fetch() has no upload progress in browsers.
  const form = new FormData();
  form.append("recording", file, file.name);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/synthesize`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status === 202) {
        try {
          resolve(JSON.parse(xhr.responseText) as SynthesizeAccepted);
        } catch (err) {
          reject(err);
        }
      } else {
        reject(new ApiError(xhr.status, xhr.responseText));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, "network error during upload"));
    xhr.send(form);
  });
}

export const api = {
  health: () => request<HealthResponse>("/healthz"),
  getSynthesis: (id: string) =>
    request<SynthesisRunDetail>(`/synthesis/${id}`),
  synthesisStreamUrl: (id: string) => `${API_BASE}/synthesis/${id}/stream`,
  listAgents: () => request<Agent[]>("/agents"),
  getAgent: (id: string) => request<Agent>(`/agents/${id}`),
  getAttestation: (id: string) =>
    request<ApiFullAttestation>(`/agents/${id}/attestation`),
  // Cosmo Connect surface for an agent (graphql / grpc / rest / openapi).
  // Returns 404 (ApiError) when the agent has no Trusted Documents cached
  // yet — callers should treat that as "no chips to render" and degrade.
  getAgentProtocols: (id: string) =>
    request<AgentProtocols>(`/agents/${id}/protocols`),
  replay: (synthId: string) =>
    request<ReplayResponse>(`/demo/replay/${synthId}`, {
      method: "POST",
      expectStatus: 200,
    }),
};
