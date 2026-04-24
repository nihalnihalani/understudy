import { describe, it, expect } from "vitest";
import { AgentCoreLoop } from "../src/core/loop.js";
import type { MemoryClient } from "../src/memory/client.js";
import type { RuntimeManifest } from "../src/manifest.js";

class FakeMemory {
  turns: Array<{ role: string; content: string; meta: Record<string, unknown> }> = [];
  cache = new Map<string, string>();
  recallCalls: Array<{ query: Float32Array; k: number }> = [];
  recallReturn: Array<{ memoryId: string; score: number }> = [];
  async recordTurn(role: string, content: string, meta: Record<string, unknown> = {}) {
    this.turns.push({ role, content, meta });
    return `id-${this.turns.length}`;
  }
  async langcacheLookup(prompt: string, model: string) {
    const hit = this.cache.get(`${model}::${prompt}`);
    return hit ? ({ response: hit, hit: true } as const) : null;
  }
  async langcacheStore(prompt: string, model: string, response: string) {
    this.cache.set(`${model}::${prompt}`, response);
  }
  async recall(query: Float32Array, k: number) {
    this.recallCalls.push({ query, k });
    return this.recallReturn;
  }
}

const manifest: RuntimeManifest = {
  agent_id: "export-shopify-orders",
  cosmo_sdl_path: "./subgraph.graphql",
  tinyfish_products: ["web_agent"],
  redis_namespace: "ams:agent:export-shopify-orders",
  insforge_tables: [],
  skills_pinned: [
    { name: "shopify.orders.list", version: "2.3.1" },
    { name: "csv.serialize", version: "1.1.0" },
  ],
  image_digest: "sha256:abc",
  cosign_signature: "sig",
  slsa_attestation_path: "./a.jsonl",
};

describe("AgentCoreLoop", () => {
  it("records user turn BEFORE assistant turn (memory ordering invariant)", async () => {
    const mem = new FakeMemory();
    const runFn = async () => ({
      stdout: JSON.stringify({ ok: true }),
      parsed: { ok: true },
      argv: [],
    });
    const core = new AgentCoreLoop({
      manifest,
      memory: mem as unknown as MemoryClient,
      runTinyFishFn: runFn,
    });
    await core.run({ operation: "exportOrders", scriptPath: "/a/s.ts", inputs: { dateRange: "yesterday" } });
    expect(mem.turns.map((t) => t.role)).toEqual(["user", "assistant"]);
    expect(mem.turns[0]!.content).toBe("exportOrders");
  });

  it("serves from LangCache on the second identical call (no TinyFish re-run)", async () => {
    const mem = new FakeMemory();
    let calls = 0;
    const runFn = async () => {
      calls++;
      return { stdout: JSON.stringify({ rowCount: 42 }), parsed: { rowCount: 42 }, argv: [] };
    };
    const core = new AgentCoreLoop({
      manifest,
      memory: mem as unknown as MemoryClient,
      runTinyFishFn: runFn,
    });
    const req = { operation: "exportOrders", scriptPath: "/a/s.ts", inputs: { dateRange: "yesterday" } };
    const first = await core.run(req);
    const second = await core.run(req);
    expect(calls).toBe(1);
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
  });

  it("refuses an ad-hoc skill that is not in manifest.skills_pinned", async () => {
    const mem = new FakeMemory();
    const core = new AgentCoreLoop({
      manifest,
      memory: mem as unknown as MemoryClient,
      runTinyFishFn: async () => ({ stdout: "", parsed: null, argv: [] }),
    });
    await expect(
      core.run({
        operation: "exportOrders",
        scriptPath: "/a/s.ts",
        skill: { name: "shopify.orders.list", version: "latest" },
      }),
    ).rejects.toThrow(/pinned/);
  });

  it("defaults to the first pinned skill when the resolver does not specify one", async () => {
    const mem = new FakeMemory();
    const seen: Array<{ name: string; version: string }> = [];
    const runFn = async (opts: { skill: { name: string; version: string } }) => {
      seen.push(opts.skill);
      return { stdout: "{}", parsed: {}, argv: [] };
    };
    const core = new AgentCoreLoop({
      manifest,
      memory: mem as unknown as MemoryClient,
      runTinyFishFn: runFn as never,
    });
    await core.run({ operation: "exportOrders", scriptPath: "/a/s.ts" });
    expect(seen[0]).toEqual({ name: "shopify.orders.list", version: "2.3.1" });
  });

  it("calls memory.recall() exactly once before TinyFish on a cache miss", async () => {
    const mem = new FakeMemory();
    mem.recallReturn = [
      { memoryId: "mem-001", score: 0.92 },
      { memoryId: "mem-002", score: 0.81 },
    ];
    const order: string[] = [];
    const recallSpy = mem.recall.bind(mem);
    mem.recall = async (q: Float32Array, k: number) => {
      order.push("recall");
      return recallSpy(q, k);
    };
    const runFn = async () => {
      order.push("tinyfish");
      return { stdout: JSON.stringify({ ok: true }), parsed: { ok: true }, argv: [] };
    };
    const core = new AgentCoreLoop({
      manifest,
      memory: mem as unknown as MemoryClient,
      runTinyFishFn: runFn,
    });
    await core.run({ operation: "exportOrders", scriptPath: "/a/s.ts", inputs: { dateRange: "yesterday" } });
    expect(mem.recallCalls).toHaveLength(1);
    expect(mem.recallCalls[0]!.k).toBe(5);
    expect(order).toEqual(["recall", "tinyfish"]);
  });

  it("passes recalled memories to the TinyFish invocation as context", async () => {
    const mem = new FakeMemory();
    mem.recallReturn = [
      { memoryId: "mem-001", score: 0.92 },
      { memoryId: "mem-002", score: 0.81 },
    ];
    let seenContext: unknown = undefined;
    const runFn = async (opts: { context?: Record<string, unknown> }) => {
      seenContext = opts.context;
      return { stdout: "{}", parsed: {}, argv: [] };
    };
    const core = new AgentCoreLoop({
      manifest,
      memory: mem as unknown as MemoryClient,
      runTinyFishFn: runFn as never,
    });
    await core.run({ operation: "exportOrders", scriptPath: "/a/s.ts", inputs: { dateRange: "yesterday" } });
    expect(seenContext).toMatchObject({
      recalled_memories: [
        { memoryId: "mem-001", score: 0.92 },
        { memoryId: "mem-002", score: 0.81 },
      ],
    });
  });

  it("proceeds normally when recall() returns empty", async () => {
    const mem = new FakeMemory();
    mem.recallReturn = [];
    let seenContext: Record<string, unknown> | undefined;
    const runFn = async (opts: { context?: Record<string, unknown> }) => {
      seenContext = opts.context;
      return { stdout: JSON.stringify({ rows: 0 }), parsed: { rows: 0 }, argv: [] };
    };
    const core = new AgentCoreLoop({
      manifest,
      memory: mem as unknown as MemoryClient,
      runTinyFishFn: runFn as never,
    });
    const result = await core.run({ operation: "exportOrders", scriptPath: "/a/s.ts" });
    expect(result.cached).toBe(false);
    expect(mem.recallCalls).toHaveLength(1);
    expect(seenContext).toEqual({ recalled_memories: [] });
  });

  it("skips recall() on a LangCache hit (cached path short-circuits)", async () => {
    const mem = new FakeMemory();
    const runFn = async () => ({
      stdout: JSON.stringify({ rowCount: 42 }),
      parsed: { rowCount: 42 },
      argv: [],
    });
    const core = new AgentCoreLoop({
      manifest,
      memory: mem as unknown as MemoryClient,
      runTinyFishFn: runFn,
    });
    const req = { operation: "exportOrders", scriptPath: "/a/s.ts", inputs: { dateRange: "yesterday" } };
    await core.run(req);
    expect(mem.recallCalls).toHaveLength(1);
    await core.run(req); // second call hits LangCache — should not re-recall
    expect(mem.recallCalls).toHaveLength(1);
  });
});
