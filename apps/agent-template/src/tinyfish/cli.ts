// TinyFish CLI wrapper. Architecture.md §13 "TinyFish Skill version drift": we always
// invoke a PINNED skill by `name@version` from the runtime manifest. Never "latest".

import { execa } from "execa";
import path from "node:path";
import type { SkillPin } from "../manifest.js";

export interface TinyFishRunOpts {
  skill: SkillPin;
  scriptPath: string;
  inputs?: Record<string, unknown>;
  cwd?: string;
  binary?: string;
  timeoutMs?: number;
}

export interface TinyFishRunResult {
  stdout: string;
  parsed: unknown;
  argv: string[];
}

export function buildArgv(opts: TinyFishRunOpts): string[] {
  if (!opts.skill.name || !opts.skill.version) {
    throw new Error("TinyFish skill must be pinned (name + version)");
  }
  if (opts.skill.version === "latest") {
    throw new Error(
      "TinyFish skill version 'latest' is forbidden at runtime — pin at synthesis time (architecture.md §13)",
    );
  }
  const argv: string[] = [
    "run",
    "--skill",
    `${opts.skill.name}@${opts.skill.version}`,
    "--script",
    opts.scriptPath,
  ];
  if (opts.inputs && Object.keys(opts.inputs).length > 0) {
    argv.push("--inputs", JSON.stringify(opts.inputs));
  }
  return argv;
}

export async function runTinyFish(opts: TinyFishRunOpts): Promise<TinyFishRunResult> {
  const argv = buildArgv(opts);
  const binary = opts.binary ?? process.env.TINYFISH_BIN ?? "tinyfish";
  const cwd = opts.cwd ?? path.dirname(opts.scriptPath);
  const { stdout } = await execa(binary, argv, {
    cwd,
    timeout: opts.timeoutMs ?? 60_000,
    env: { ...process.env },
  });
  let parsed: unknown = stdout;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    parsed = { raw: stdout };
  }
  return { stdout, parsed, argv };
}
