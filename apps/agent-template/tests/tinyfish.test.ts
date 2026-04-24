import { describe, it, expect } from "vitest";
import { buildArgv } from "../src/tinyfish/cli.js";

describe("TinyFish CLI argv builder", () => {
  it("emits `run --skill name@version --script path`", () => {
    const argv = buildArgv({
      skill: { name: "shopify.orders.list", version: "2.3.1" },
      scriptPath: "/agent/script.ts",
    });
    expect(argv).toEqual([
      "run",
      "--skill",
      "shopify.orders.list@2.3.1",
      "--script",
      "/agent/script.ts",
    ]);
  });

  it("forwards JSON inputs when provided", () => {
    const argv = buildArgv({
      skill: { name: "x", version: "1.0.0" },
      scriptPath: "/a/b.ts",
      inputs: { foo: 1 },
    });
    expect(argv).toContain("--inputs");
    expect(argv).toContain(JSON.stringify({ foo: 1 }));
  });

  it("refuses `latest` at runtime (architecture.md §13)", () => {
    expect(() =>
      buildArgv({
        skill: { name: "x", version: "latest" },
        scriptPath: "/a.ts",
      }),
    ).toThrow(/latest/);
  });

  it("refuses a missing skill name or version", () => {
    expect(() =>
      buildArgv({
        skill: { name: "", version: "1.0.0" },
        scriptPath: "/a.ts",
      }),
    ).toThrow();
  });
});
