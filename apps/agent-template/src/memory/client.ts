// Thin TS facade over the per-agent AMS namespace — mirrors understudy/memory/client.py.
// Short-term Stream + long-term Hash + int8 Vector Set recall. Namespaced: this instance
// can only touch `ams:agent:{agentId}:*` and `vset:agent:{agentId}:memory` keys.

import { Redis } from "ioredis";

const STM_CAP = 20; // architecture.md §5

export interface MemoryTurn {
  role: "user" | "assistant" | "tool";
  content: string;
  ts: string;
  meta?: Record<string, unknown>;
}

export interface RecallResult {
  memoryId: string;
  score: number;
}

export interface MemoryClientOpts {
  agentId: string;
  redisUrl?: string;
  redis?: Redis;
}

function quantizeInt8(vec: Float32Array): Int8Array {
  let maxAbs = 0;
  for (const v of vec) {
    const a = Math.abs(v);
    if (a > maxAbs) maxAbs = a;
  }
  const out = new Int8Array(vec.length);
  if (maxAbs === 0) return out;
  const scale = 127 / maxAbs;
  for (let i = 0; i < vec.length; i++) {
    const raw = vec[i]!;
    const v = Math.max(-127, Math.min(127, Math.round(raw * scale)));
    out[i] = v;
  }
  return out;
}

export class MemoryClient {
  readonly agentId: string;
  readonly redis: Redis;
  private ownsClient: boolean;

  constructor(opts: MemoryClientOpts) {
    if (!opts.agentId || opts.agentId.includes(":") || opts.agentId.includes("*")) {
      throw new Error(`invalid agentId: ${opts.agentId}`);
    }
    this.agentId = opts.agentId;
    if (opts.redis) {
      this.redis = opts.redis;
      this.ownsClient = false;
    } else {
      const url = opts.redisUrl ?? process.env.REDIS_URL ?? "redis://localhost:6379/0";
      this.redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 2 });
      this.ownsClient = true;
    }
  }

  private k(suffix: string): string {
    return `ams:agent:${this.agentId}:${suffix}`;
  }

  private vsetKey(): string {
    return `vset:agent:${this.agentId}:memory`;
  }

  async recordTurn(
    role: MemoryTurn["role"],
    content: string,
    meta: Record<string, unknown> = {},
  ): Promise<string> {
    const entry = {
      role,
      content,
      ts: new Date().toISOString(),
      meta: JSON.stringify(meta),
    };
    // XADD with MAXLEN = hard cap (architecture.md §9).
    const id = await this.redis.xadd(
      this.k("stm"),
      "MAXLEN",
      "=",
      String(STM_CAP),
      "*",
      "role",
      entry.role,
      "content",
      entry.content,
      "ts",
      entry.ts,
      "meta",
      entry.meta,
    );
    return String(id);
  }

  async recentTurns(limit: number = STM_CAP): Promise<MemoryTurn[]> {
    const raw = await this.redis.xrevrange(this.k("stm"), "+", "-", "COUNT", limit);
    const out: MemoryTurn[] = [];
    for (const [, fields] of raw) {
      const m = new Map<string, string>();
      for (let i = 0; i < fields.length; i += 2) {
        m.set(fields[i]!, fields[i + 1]!);
      }
      let meta: Record<string, unknown> = {};
      try {
        meta = JSON.parse(m.get("meta") ?? "{}");
      } catch {
        meta = {};
      }
      out.push({
        role: (m.get("role") as MemoryTurn["role"]) ?? "user",
        content: m.get("content") ?? "",
        ts: m.get("ts") ?? new Date().toISOString(),
        meta,
      });
    }
    return out;
  }

  async rememberEmbedding(
    memoryId: string,
    embedding: Float32Array,
    summary: string = "",
  ): Promise<void> {
    const q = quantizeInt8(embedding);
    const values = Array.from(q).join(",");
    const args: (string | number)[] = [
      "VADD",
      this.vsetKey(),
      "VALUES",
      String(q.length),
      values,
      memoryId,
      "Q8",
    ];
    if (summary) {
      args.push("SETATTR", JSON.stringify({ summary }));
    }
    try {
      await this.redis.call(...(args as [string, ...string[]]));
    } catch {
      // Redis without Vector Sets — the recall path simply returns [].
    }
  }

  async recall(query: Float32Array, k: number = 5): Promise<RecallResult[]> {
    const q = quantizeInt8(query);
    const values = Array.from(q).join(",");
    try {
      const raw = (await this.redis.call(
        "VSIM",
        this.vsetKey(),
        "VALUES",
        String(q.length),
        values,
        "WITHSCORES",
        "COUNT",
        String(k),
      )) as unknown;
      if (!Array.isArray(raw)) return [];
      const out: RecallResult[] = [];
      for (let i = 0; i < raw.length; i += 2) {
        const memberRaw = raw[i];
        const scoreRaw = raw[i + 1];
        if (memberRaw === undefined || scoreRaw === undefined) break;
        out.push({
          memoryId: String(memberRaw),
          score: Number(scoreRaw),
        });
      }
      return out;
    } catch {
      return [];
    }
  }

  async langcacheLookup(
    prompt: string,
    model: string,
  ): Promise<{ response: string; hit: true } | null> {
    const h = await promptHash(prompt, model);
    const key = `langcache:gemini:${this.agentId}:${h}`;
    const raw = await this.redis.get(key);
    if (!raw) return null;
    try {
      const payload = JSON.parse(raw) as { response: string };
      return { response: payload.response, hit: true };
    } catch {
      return null;
    }
  }

  async langcacheStore(prompt: string, model: string, response: string, ttlS?: number): Promise<void> {
    const h = await promptHash(prompt, model);
    const key = `langcache:gemini:${this.agentId}:${h}`;
    const payload = JSON.stringify({ model, response, prompt });
    if (ttlS) {
      await this.redis.set(key, payload, "EX", ttlS);
    } else {
      await this.redis.set(key, payload);
    }
  }

  async close(): Promise<void> {
    if (this.ownsClient) {
      await this.redis.quit();
    }
  }
}

async function promptHash(prompt: string, model: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(`${model}::${prompt}`).digest("hex").slice(0, 32);
}
