import { describe, it, expect } from "vitest";
import { AgentCoreLoop } from "../src/core/loop.js";
import type { MemoryClient } from "../src/memory/client.js";
import type { RuntimeManifest } from "../src/manifest.js";

class FakeMemory {
  turns: Array<{ role: string; content: string; meta: Record<string, unknown> }> = [];
  cache = new Map<string, string>();
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
});
