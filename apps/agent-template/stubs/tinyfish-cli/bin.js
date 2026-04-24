#!/usr/bin/env node
// Local stub for `tinyfish` — emits a deterministic JSON object on stdout so
// tests and the hermetic demo replay (architecture.md §14) do not need the real
// vendor binary. The runtime wrapper in src/tinyfish/cli.ts parses this same
// shape when TINYFISH_STUB=1 is set.
const argv = process.argv.slice(2);
const skillFlagIndex = argv.indexOf("--skill");
const scriptFlagIndex = argv.indexOf("--script");
const skill = skillFlagIndex >= 0 ? argv[skillFlagIndex + 1] : null;
const script = scriptFlagIndex >= 0 ? argv[scriptFlagIndex + 1] : null;

const result = {
  ok: true,
  stub: true,
  skill,
  script,
  result: { message: "tinyfish stub invoked", argv },
};
process.stdout.write(JSON.stringify(result));
process.stdout.write("\n");
