// Agent core loop. Architecture.md §5: for every resolver invocation —
//   1. record the user turn in AMS (short-term Stream).
//   2. check LangCache (semantic cache in front of Gemini / TinyFish output).
//   2.5. on LangCache miss, recall() top-K prior memories from the Vector Set
//        and pass them into the TinyFish invocation as context.
//   3. on miss: invoke TinyFish CLI with a PINNED skill from the runtime manifest.
//   4. record the assistant turn.
//   5. store the result in LangCache.
//
// This is the only place resolvers execute business logic — the GraphQL layer is a thin
// shell that maps field → operation name → this function.

import type { RuntimeManifest, SkillPin } from "../manifest.js";
import type { MemoryClient, RecallResult } from "../memory/client.js";
import { runTinyFish, type TinyFishRunResult } from "../tinyfish/cli.js";

const RECALL_TOP_K = 5;
const RECALL_EMBED_DIM = 64;

export interface OperationRequest {
  operation: string;
  scriptPath: string;
  inputs?: Record<string, unknown>;
  skill?: SkillPin;
}

export interface OperationResult {
  operation: string;
  skill: SkillPin;
  cached: boolean;
  output: unknown;
}

export interface CoreLoopDeps {
  manifest: RuntimeManifest;
  memory: MemoryClient;
  runTinyFishFn?: typeof runTinyFish;
  cacheModel?: string;
}

export class AgentCoreLoop {
  private manifest: RuntimeManifest;
  private memory: MemoryClient;
  private runFn: typeof runTinyFish;
  private cacheModel: string;

  constructor(deps: CoreLoopDeps) {
    this.manifest = deps.manifest;
    this.memory = deps.memory;
    this.runFn = deps.runTinyFishFn ?? runTinyFish;
    this.cacheModel = deps.cacheModel ?? "tinyfish.run";
  }

  pickSkill(requested?: SkillPin): SkillPin {
    if (requested) {
      const match = this.manifest.skills_pinned.find(
        (s) => s.name === requested.name && s.version === requested.version,
      );
      if (!match) {
        throw new Error(
          `skill ${requested.name}@${requested.version} not in runtime_manifest.skills_pinned — refusing to resolve 'latest' at runtime (architecture.md §13)`,
        );
      }
      return match;
    }
    const first = this.manifest.skills_pinned[0];
    if (!first) throw new Error("runtime_manifest.skills_pinned is empty");
    return first;
  }

  async run(req: OperationRequest): Promise<OperationResult> {
    const skill = this.pickSkill(req.skill);
    const cacheKey = buildCacheKey(req.operation, skill, req.inputs);

    // Step 1: record the user turn FIRST. Tests assert this ordering because a loop that
    // writes the assistant turn before the user turn is a memory-corruption bug.
    await this.memory.recordTurn("user", req.operation, {
      operation: req.operation,
      skill: `${skill.name}@${skill.version}`,
      inputs: req.inputs ?? {},
    });

    // Step 2: LangCache check.
    const hit = await this.memory.langcacheLookup(cacheKey, this.cacheModel);
    if (hit) {
      await this.memory.recordTurn("assistant", String(hit.response), {
        cached: true,
        skill: `${skill.name}@${skill.version}`,
      });
      return {
        operation: req.operation,
        skill,
        cached: true,
        output: safeParse(hit.response),
      };
    }

    // Step 2.5: recall top-K prior memories so TinyFish can reason over them.
    // Always invoked exactly once per uncached run — an empty result is fine, the
    // invocation proceeds regardless (architecture.md §5, devils-advocate §5 option 3).
    const recalled = await this.memory.recall(
      embedInputHint(req.operation, req.scriptPath, req.inputs),
      RECALL_TOP_K,
    );

    // Step 3: TinyFish CLI invocation. Recalled memories are passed via env so the
    // argv shape stays identical to the vendor's documented `tinyfish run` contract.
    const run: TinyFishRunResult = await this.runFn({
      skill,
      scriptPath: req.scriptPath,
      inputs: req.inputs,
      context: { recalled_memories: recalled },
    });

    // Step 4: record assistant turn.
    await this.memory.recordTurn("assistant", run.stdout, {
      cached: false,
      skill: `${skill.name}@${skill.version}`,
    });

    // Step 5: write to LangCache.
    await this.memory.langcacheStore(cacheKey, this.cacheModel, run.stdout);

    return {
      operation: req.operation,
      skill,
      cached: false,
      output: run.parsed,
    };
  }
}

function buildCacheKey(
  operation: string,
  skill: SkillPin,
  inputs: Record<string, unknown> | undefined,
): string {
  const inputKey = inputs ? JSON.stringify(sortKeys(inputs)) : "";
  return `${operation}::${skill.name}@${skill.version}::${inputKey}`;
}

function sortKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) {
    out[k] = obj[k];
  }
  return out;
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

// Deterministic hash-based embedding of the recall hint. Mirrors the Python
// _default_hash_embed in understudy/memory/langcache.py — no sentence-transformer
// dependency at runtime. The Vector Set was seeded with the same family of vectors
// by scripts/prewarm_demo.py, so VSIM returns meaningful neighbors.
function embedInputHint(
  operation: string,
  scriptPath: string,
  inputs: Record<string, unknown> | undefined,
): Float32Array {
  const text = `${operation}::${scriptPath}::${inputs ? JSON.stringify(sortKeys(inputs)) : ""}`;
  const out = new Float32Array(RECALL_EMBED_DIM);
  // FNV-1a style rolling hash seeded per dimension — deterministic, cheap, no deps.
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const slot = (code + i) % RECALL_EMBED_DIM;
    out[slot] = (out[slot] ?? 0) + ((code % 251) - 125) / 125;
  }
  let norm = 0;
  for (const v of out) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < out.length; i++) out[i] = out[i]! / norm;
  }
  return out;
}

export type { RecallResult };
