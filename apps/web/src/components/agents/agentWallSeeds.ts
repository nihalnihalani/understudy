// Deterministic seeders used by the Agent Wall until the live endpoints
//   GET /agents/:id/runs
//   GET /agents/:id/memory
// are wired through. These functions are pure and seeded from the agent id
// so the wall stays visually stable between renders. Every consumer that
// uses their output must also flag the resulting UI block with a
// data-demo="fixture" attribute — see AgentWall.tsx for the call sites.

import type { Agent, AgentRun } from "@/api/types";
import type { AgentCardExtras } from "./AgentCard";
import type { MemoryDump } from "./MemoryDumpPanel";

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function inferState(
  ex: AgentCardExtras
): "active" | "idle" | "failed" | "pending" {
  if (!ex.verified) return "failed";
  const ageMs = Date.now() - new Date(ex.last_seen_at).getTime();
  if (ageMs < 60_000) return "active";
  return "idle";
}

export function seedSparkline(id: string, runsCount: number): number[] {
  const seed = hash(id);
  const arr: number[] = [];
  for (let i = 0; i < 24; i++) {
    const wobble = ((seed >> (i % 16)) & 7) + 1;
    const base = Math.max(1, Math.floor(runsCount / 16));
    arr.push(base + wobble + (i === 23 ? 2 : 0));
  }
  return arr;
}

const TOPIC_POOL = [
  "orders",
  "csv",
  "shopify",
  "export",
  "filters",
  "date-range",
  "analytics",
  "refunds",
  "inventory",
  "shipments",
];

export function seedMemory(agent: Agent, ex: AgentCardExtras): MemoryDump {
  const seed = hash(agent.id);
  const topicCount = 3 + (seed % 3);
  const topics: string[] = [];
  for (let i = 0; i < topicCount; i++) {
    const t = TOPIC_POOL[(seed + i) % TOPIC_POOL.length]!;
    if (!topics.includes(t)) topics.push(t);
  }
  return {
    ams_namespace: agent.ams_namespace,
    stm_turn_count: 8 + (seed % 12),
    ltm_record_count: Math.max(1, Math.floor(ex.runs_count / 4)),
    vector_count: Math.max(8, ex.runs_count * 3),
    quantization: "int8",
    topics,
    entities: {
      target_site: "shopify.com",
      date_range: "yesterday",
      last_status: ex.verified ? "success" : "failed",
    },
  };
}

export function seedRuns(agent: Agent, ex: AgentCardExtras): AgentRun[] {
  const now = Date.now();
  const runs: AgentRun[] = [];
  const count = Math.min(5, Math.max(1, Math.floor(ex.runs_count / 12)));
  const seed = hash(agent.id);
  for (let i = 0; i < count; i++) {
    const startedAt = new Date(now - (i + 1) * 60_000 - (seed % 30) * 1000);
    const ms = 3200 + ((seed >> i) & 0x3ff);
    const endedAt = new Date(startedAt.getTime() + ms);
    const failed = i === count - 1 && !ex.verified;
    runs.push({
      id: `run-${agent.id.slice(0, 6)}-${i}`,
      agent_id: agent.id,
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      status: failed ? "failed" : "completed",
      result: failed
        ? { error: "tinyfish_browser_timeout" }
        : { csv_url: "/exports/orders.csv" },
    });
  }
  return runs;
}
