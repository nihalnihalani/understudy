import { describe, it, expect } from "vitest";
import { deriveGoal, runTinyFish } from "../src/tinyfish/cli.js";

describe("deriveGoal", () => {
  it("includes operation, skill metadata, and JSON inputs", () => {
    const goal = deriveGoal({
      operation: "googleDriveAction",
      inputs: { folder_name: "misc hackathons", file_name: "InSight" },
      skill: { name: "drive.openFile", version: "1.0.0" },
    });
    expect(goal).toContain("Operation: googleDriveAction");
    expect(goal).toContain("drive.openFile@1.0.0");
    expect(goal).toContain('"folder_name":"misc hackathons"');
  });

  it("omits the inputs line when inputs is empty", () => {
    const goal = deriveGoal({
      operation: "ping",
      skill: { name: "x", version: "1.0.0" },
    });
    expect(goal).toContain("Operation: ping");
    expect(goal).not.toContain("Inputs:");
  });

  it("appends recalled-memory hints when context.recalled_memories is non-empty", () => {
    const goal = deriveGoal({
      operation: "x",
      skill: { name: "s", version: "1.0.0" },
      context: { recalled_memories: [{ id: "m1", text: "earlier turn" }] },
    });
    expect(goal).toMatch(/Recalled memories \(top 1\)/);
    expect(goal).toContain("earlier turn");
  });
});

describe("runTinyFish", () => {
  it("refuses `latest` at runtime (architecture.md §13)", async () => {
    await expect(
      runTinyFish({
        skill: { name: "x", version: "latest" },
        operation: "ping",
        startingUrl: "about:blank",
        apiKey: "dummy",
      }),
    ).rejects.toThrow(/latest/);
  });

  it("calls client.agent.run({goal, url}) and returns the response", async () => {
    const calls: { goal: string; url: string }[] = [];
    const fakeClient = {
      agent: {
        run: async ({ goal, url }: { goal: string; url: string }) => {
          calls.push({ goal, url });
          return { id: "run_test", status: "complete", result: "ok" };
        },
      },
    } as unknown as Parameters<typeof runTinyFish>[0]["client"];

    const result = await runTinyFish({
      skill: { name: "drive.openFile", version: "1.0.0" },
      operation: "googleDriveAction",
      inputs: { folder_name: "misc hackathons", file_name: "InSight" },
      startingUrl: "https://drive.google.com",
      client: fakeClient,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://drive.google.com");
    expect(calls[0].goal).toContain("googleDriveAction");
    expect(calls[0].goal).toContain("drive.openFile@1.0.0");
    expect(result.parsed).toEqual({ id: "run_test", status: "complete", result: "ok" });
    expect(result.startingUrl).toBe("https://drive.google.com");
  });
});
