// Runtime manifest shape (architecture.md §10c emit_tinyfish_script tool output).
// Validated with zod so a malformed manifest fails fast at boot, never mid-request.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export const TinyFishProduct = z.enum([
  "web_agent",
  "web_search",
  "web_fetch",
  "web_browser",
]);
export type TinyFishProduct = z.infer<typeof TinyFishProduct>;

export const SkillPin = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
});
export type SkillPin = z.infer<typeof SkillPin>;

export const RuntimeManifest = z.object({
  agent_id: z.string().min(1),
  cosmo_sdl_path: z.string().min(1),
  tinyfish_products: z.array(TinyFishProduct).min(1),
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
