// Entry point for a synthesized agent. Reads $RUNTIME_MANIFEST_PATH, runs the cosign
// preboot gate (architecture.md §6, §13 — refuses to boot on fail), constructs the
// memory client + core loop, then starts the GraphQL server built from the SDL emitted
// by Cosmo Dream Query at synthesis time.

import path from "node:path";
import { AgentCoreLoop } from "./core/loop.js";
import { startServer } from "./graphql/server.js";
import { loadManifest, resolveRelative, type RuntimeManifest } from "./manifest.js";
import { MemoryClient } from "./memory/client.js";
import { verifyImageOrExit } from "./preboot/verify.js";

export interface BootOpts {
  manifestPath?: string;
  skipPreboot?: boolean;
  scriptPath?: string;
  listenPort?: number;
  verifyScriptPath?: string;
}

export async function boot(opts: BootOpts = {}): Promise<{ url: string; manifest: RuntimeManifest }> {
  const manifestPath = opts.manifestPath
    ?? process.env.RUNTIME_MANIFEST_PATH
    ?? path.resolve(process.cwd(), "runtime_manifest.json");

  const manifest = await loadManifest(manifestPath);

  if (!opts.skipPreboot && process.env.SKIP_COSIGN_VERIFY !== "1") {
    const imageRef = process.env.IMAGE_REF ?? manifest.image_digest;
    await verifyImageOrExit({
      imageRef,
      scriptPath: opts.verifyScriptPath ?? process.env.VERIFY_RELEASE_SCRIPT,
      exitOnFail: true,
    });
  }

  const memory = new MemoryClient({
    agentId: manifest.agent_id,
    redisUrl: process.env.REDIS_URL,
  });

  const core = new AgentCoreLoop({ manifest, memory });

  const scriptPath = opts.scriptPath
    ?? process.env.AGENT_SCRIPT_PATH
    ?? resolveRelative(manifestPath, "agent.ts");

  const { url } = await startServer({
    manifest,
    manifestPath,
    core,
    scriptPath,
    listenPort: opts.listenPort,
  });

  console.log(`[understudy] agent ${manifest.agent_id} ready at ${url}`);
  return { url, manifest };
}

function parseArgManifest(): string | undefined {
  const idx = process.argv.indexOf("--manifest");
  if (idx >= 0 && process.argv[idx + 1]) {
    return path.resolve(process.argv[idx + 1]!);
  }
  return undefined;
}

const isDirectRun = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  const thisUrl = import.meta.url;
  try {
    const entryUrl = new URL(`file://${path.resolve(entry)}`).href;
    return thisUrl === entryUrl;
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  boot({ manifestPath: parseArgManifest() }).catch((err) => {
    console.error("[understudy] boot failed:", err);
    process.exit(1);
  });
}
