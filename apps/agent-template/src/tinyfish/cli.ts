// TinyFish runtime — calls @tiny-fish/sdk's TinyFish.agent.run() with a derived
// goal + URL. Earlier versions shelled out to a fictional `tinyfish run --skill X@Y`
// CLI that doesn't exist; @tiny-fish/cli@0.1.5's real surface is `tinyfish agent run
// "goal" --url <url>` and the SDK exposes `client.agent.run({goal, url})` directly.
//
// "Skills" stay as project-internal metadata for LangCache keying + observability —
// TinyFish itself doesn't have a Skill registry to pin against (verified 2026-04-25).

import type { TinyFish } from "@tiny-fish/sdk";
import { TinyFish as TinyFishCtor } from "@tiny-fish/sdk";
import type { SkillPin } from "../manifest.js";

export interface TinyFishRunOpts {
  /** Project-internal metadata; appended to the goal hint for observability. */
  skill: SkillPin;
  /** Synthesized GraphQL operation field name (e.g. "googleDriveAction"). */
  operation: string;
  /** Resolver args from the GraphQL request. */
  inputs?: Record<string, unknown>;
  /** Memory recall context to weave into the goal text. */
  context?: Record<string, unknown>;
  /** Where the agent should start. Comes from manifest.starting_url. */
  startingUrl: string;
  /** Pre-built TinyFish client (tests inject; production constructs from env). */
  client?: TinyFish;
  /** Override the env API key for tests. */
  apiKey?: string;
  timeoutMs?: number;
}

export interface TinyFishRunResult {
  stdout: string;
  parsed: unknown;
  goal: string;
  startingUrl: string;
}

export function deriveGoal(opts: {
  operation: string;
  inputs?: Record<string, unknown>;
  context?: Record<string, unknown>;
  skill: SkillPin;
}): string {
  // Goal text the synthesizer would naturally read; structured enough for the
  // hosted agent to reason over while still being human-skimmable in logs.
  const args = opts.inputs && Object.keys(opts.inputs).length > 0
    ? `\nInputs: ${JSON.stringify(opts.inputs)}`
    : "";
  const recalled = (opts.context as { recalled_memories?: unknown } | undefined)?.recalled_memories;
  const memoryHint = recalled && Array.isArray(recalled) && recalled.length > 0
    ? `\nRecalled memories (top ${recalled.length}): ${JSON.stringify(recalled).slice(0, 800)}`
    : "";
  return [
    `Operation: ${opts.operation}`,
    `Skill (project metadata): ${opts.skill.name}@${opts.skill.version}`,
    args,
    memoryHint,
  ].filter(Boolean).join("");
}

function buildClient(apiKey?: string): TinyFish {
  const key = apiKey ?? process.env.TINYFISH_API_KEY ?? "";
  if (!key) {
    throw new Error(
      "TINYFISH_API_KEY not set — cannot construct @tiny-fish/sdk client",
    );
  }
  return new TinyFishCtor({ apiKey: key });
}

export async function runTinyFish(opts: TinyFishRunOpts): Promise<TinyFishRunResult> {
  if (opts.skill.version === "latest") {
    throw new Error(
      "Skill version 'latest' is forbidden at runtime — pin at synthesis time (architecture.md §13)",
    );
  }
  const goal = deriveGoal(opts);
  const client = opts.client ?? buildClient(opts.apiKey);
  // run() returns the final response (no streaming); for streaming use .stream().
  const response = await client.agent.run({ goal, url: opts.startingUrl });
  const stdout = JSON.stringify(response, null, 2);
  return { stdout, parsed: response, goal, startingUrl: opts.startingUrl };
}
