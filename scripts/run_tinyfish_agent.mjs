// Run a synthesized agent on TinyFish's hosted browser.
//
// Usage:
//   node scripts/run_tinyfish_agent.mjs <synth_id> [--start-url=<url>]
//
// Reads the bundle from Redis (us:synth:{id}:result), composes a natural-
// language goal from intent.goal + intent.inputs defaults, then streams
// agent execution from TinyFish, printing every event as it arrives.
//
// Env: TINYFISH_API_KEY, REDIS_URL.

import "dotenv/config";
import { TinyFish } from "@tiny-fish/sdk";
import { createClient } from "redis";

const synthId = process.argv[2];
if (!synthId) {
  console.error("usage: node scripts/run_tinyfish_agent.mjs <synth_id> [--start-url=https://...]");
  process.exit(2);
}
const startUrlArg = process.argv.find((a) => a.startsWith("--start-url="));
const startUrl = startUrlArg ? startUrlArg.split("=", 2)[1] : null;

if (!process.env.TINYFISH_API_KEY) {
  console.error("TINYFISH_API_KEY missing in env");
  process.exit(2);
}

// ── pull the bundle from Redis ────────────────────────────────────────────
const redis = createClient({ url: process.env.REDIS_URL || "redis://127.0.0.1:6379" });
await redis.connect();
const raw = await redis.get(`us:synth:${synthId}:result`);
await redis.disconnect();
if (!raw) {
  console.error(`no bundle at us:synth:${synthId}:result`);
  process.exit(2);
}
const bundle = JSON.parse(raw);
const intent = bundle.intent;

// ── compose a single-sentence goal from intent.goal + defaults ────────────
const inputDefaults = (intent.inputs || [])
  .map((i) => `${i.name} = "${i.default ?? ""}"`)
  .join(", ");
const goal =
  inputDefaults.length > 0
    ? `${intent.goal}. Inputs: ${inputDefaults}.`
    : intent.goal;

// Pick a starting URL: --start-url > intent.invariants.target_site > drive.google.com.
const url =
  startUrl ||
  (intent.invariants && (intent.invariants.target_site || intent.invariants.url)) ||
  inferUrlFromBundle(bundle) ||
  "https://drive.google.com/";

console.log("─".repeat(72));
console.log(`synth_id : ${synthId}`);
console.log(`goal     : ${goal}`);
console.log(`url      : ${url}`);
console.log("─".repeat(72));

const client = new TinyFish({ apiKey: process.env.TINYFISH_API_KEY });
const stream = await client.agent.stream({ goal, url });

let stepN = 0;
for await (const event of stream) {
  const t = new Date().toISOString().slice(11, 19);
  switch (event.type) {
    case "STARTED":
      console.log(`[${t}] STARTED  run_id=${event.run_id}`);
      break;
    case "STREAMING_URL":
      console.log(`[${t}] LIVE     ${event.streaming_url}`);
      break;
    case "PROGRESS":
      stepN++;
      console.log(
        `[${t}] STEP ${String(stepN).padStart(2, "0")} ${event.action_type || event.message || JSON.stringify(event).slice(0, 120)}`
      );
      break;
    case "HEARTBEAT":
      process.stdout.write(".");
      break;
    case "COMPLETE":
      console.log(`\n[${t}] COMPLETE status=${event.status}`);
      if (event.result) console.log("result:", JSON.stringify(event.result, null, 2));
      if (event.error) console.error("error:", event.error);
      break;
    default:
      console.log(`[${t}] ${event.type || "?"}: ${JSON.stringify(event).slice(0, 200)}`);
  }
}

function inferUrlFromBundle(b) {
  // Cheap heuristic: pull a domain-ish substring from the script.
  const text = (b.bundle && b.bundle.script) || "";
  const m = text.match(/https?:\/\/[A-Za-z0-9.-]+\//);
  return m ? m[0] : null;
}
