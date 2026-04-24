import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadManifest, RuntimeManifest } from "../src/manifest.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE = path.resolve(__dirname, "../examples/export-shopify-orders/runtime_manifest.json");

describe("runtime manifest schema", () => {
  it("parses the bundled sample agent manifest", async () => {
    const m = await loadManifest(SAMPLE);
    expect(m.agent_id).toBe("export-shopify-orders");
    expect(m.skills_pinned.length).toBeGreaterThan(0);
    expect(m.tinyfish_products).toContain("web_agent");
  });

  it("rejects a manifest missing required fields", () => {
    expect(() =>
      RuntimeManifest.parse({
        agent_id: "bad",
        cosmo_sdl_path: "./s.graphql",
        tinyfish_products: ["web_agent"],
        redis_namespace: "ams:agent:bad",
        skills_pinned: [{ name: "x", version: "1.0.0" }],
      }),
    ).toThrow();
  });

  it("rejects a tinyfish_product outside the sponsor enum", () => {
    expect(() =>
      RuntimeManifest.parse({
        agent_id: "bad",
        cosmo_sdl_path: "./s.graphql",
        tinyfish_products: ["web_magic" as never],
        redis_namespace: "ams:agent:bad",
        insforge_tables: [],
        skills_pinned: [{ name: "x", version: "1.0.0" }],
        image_digest: "sha256:abc",
        cosign_signature: "MEUC...",
        slsa_attestation_path: "./a.jsonl",
      }),
    ).toThrow();
  });

  it("rejects empty skills_pinned (we must always have a pinned skill)", () => {
    expect(() =>
      RuntimeManifest.parse({
        agent_id: "bad",
        cosmo_sdl_path: "./s.graphql",
        tinyfish_products: ["web_agent"],
        redis_namespace: "ams:agent:bad",
        insforge_tables: [],
        skills_pinned: [],
        image_digest: "sha256:abc",
        cosign_signature: "MEUC...",
        slsa_attestation_path: "./a.jsonl",
      }),
    ).toThrow();
  });
});
