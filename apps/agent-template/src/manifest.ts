// Runtime manifest shape (architecture.md §10c emit_tinyfish_script tool output).
// Validated with zod so a malformed manifest fails fast at boot, never mid-request.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

// TinyFish has four CLI subcommand groups (`agent`, `browser`, `search`, `fetch`),
// matching @tiny-fish/cli's documented surface. We accept any of them in the manifest
// so the synthesizer can declare which capabilities the agent uses for documentation;
// at runtime, every operation routes through `client.agent.run({goal, url})`.
export const TinyFishProduct = z.enum([
  "web_agent",
  "web_search",
  "web_fetch",
  "web_browser",
]);
export type TinyFishProduct = z.infer<typeof TinyFishProduct>;

// SkillPin is a project-internal metadata concept — TinyFish itself has no
// "Skills" registry, so this stays purely informational (LangCache key suffix,
// observability tagging). At least one entry is REQUIRED so the cache key is
// stable across runs of the same operation; the version segment also serves as
// our "rebuild this resolver if I bump the prompt" cache-bust knob.
export const SkillPin = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
});
export type SkillPin = z.infer<typeof SkillPin>;

export const RuntimeManifest = z.object({
  agent_id: z.string().min(1),
  cosmo_sdl_path: z.string().min(1),
  tinyfish_products: z.array(TinyFishProduct).min(1),
  // Starting URL the synthesized agent always opens before reasoning over a goal.
  // Optional with a sensible default so older manifests keep loading.
  starting_url: z.string().url().default("about:blank"),
  redis_namespace: z.string().min(1),
  insforge_tables: z.array(z.string()).default([]),
  skills_pinned: z.array(SkillPin).min(1),
  image_digest: z.string().min(1),
  cosign_signature: z.string().min(1),
  slsa_attestation_path: z.string().min(1),
});
export type RuntimeManifest = z.infer<typeof RuntimeManifest>;

export async function loadManifest(manifestPath: string): Promise<RuntimeManifest> {
  const raw = await readFile(manifestPath, "utf8");
  const parsed = JSON.parse(raw);
  return RuntimeManifest.parse(parsed);
}

export function resolveRelative(manifestPath: string, relOrAbs: string): string {
  if (path.isAbsolute(relOrAbs)) return relOrAbs;
  return path.resolve(path.dirname(manifestPath), relOrAbs);
}
