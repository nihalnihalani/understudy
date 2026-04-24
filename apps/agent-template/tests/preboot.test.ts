import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile, mkdtemp, chmod } from "node:fs/promises";
import os from "node:os";
import { verifyImageOrExit } from "../src/preboot/verify.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function makeScript(contents: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "understudy-preboot-"));
  const p = path.join(dir, "fake-verify.sh");
  await writeFile(p, contents);
  await chmod(p, 0o755);
  return p;
}

describe("cosign preboot gate (architecture.md §6, §13)", () => {
  it("accepts when the verify script exits 0", async () => {
    const script = await makeScript("#!/usr/bin/env bash\necho ok\nexit 0\n");
    const outcome = await verifyImageOrExit({
      imageRef: "ghcr.io/example/agent:sha256-abc",
      scriptPath: script,
      exitOnFail: false,
      onLog: () => {},
    });
    expect(outcome.verified).toBe(true);
    expect(outcome.mode).toBe("script");
  });

  it("REFUSES to boot when the verify script exits non-zero", async () => {
    const script = await makeScript("#!/usr/bin/env bash\necho 'signature invalid' >&2\nexit 1\n");
    const outcome = await verifyImageOrExit({
      imageRef: "ghcr.io/example/tampered:sha256-xyz",
      scriptPath: script,
      exitOnFail: false,
      onLog: () => {},
    });
    expect(outcome.verified).toBe(false);
    expect(outcome.failure?.step).toBe("script");
  });

  it("uses direct cosign mode when no script path is provided", async () => {
    const outcome = await verifyImageOrExit({
      imageRef: "ghcr.io/example/no-such:sha256-0",
      scriptPath: path.join(__dirname, "no-such-script.sh"),
      cosignBin: "/bin/false",
      exitOnFail: false,
      onLog: () => {},
    });
    expect(outcome.verified).toBe(false);
    expect(outcome.mode).toBe("direct");
    expect(outcome.failure?.step).toBe("signature");
  });
});
