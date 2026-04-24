import { describe, it, expect } from "vitest";
import { InsForgeMcpClient } from "../src/insforge/mcp-client.js";

describe("InsForge Remote OAuth MCP client (§13 OAuth drift row)", () => {
  it("refreshes on the first call, then reuses the access token", async () => {
    let tokenCalls = 0;
    const fakeFetch: typeof fetch = async () => {
      tokenCalls++;
      return new Response(
        JSON.stringify({ access_token: `t${tokenCalls}`, expires_in: 3600 }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    const toolCalls: Array<Record<string, string>> = [];
    const factory = async (headers: Record<string, string>) => {
      toolCalls.push(headers);
      return {
        callTool: async () => ({ content: [{ type: "text", text: "ok" }] }),
        close: async () => {},
      } as never;
    };
    const client = new InsForgeMcpClient({
      config: {
        endpoint: "https://mcp.insforge.dev",
        clientId: "cid",
        clientSecret: "sec",
        refreshToken: "r1",
      },
      fetchImpl: fakeFetch,
      clientFactory: factory,
    });
    await client.callTool("list_orders", {});
    await client.callTool("list_orders", {});
    expect(tokenCalls).toBe(1);
    expect(toolCalls[0]!.authorization).toBe("Bearer t1");
    expect(toolCalls[1]!.authorization).toBe("Bearer t1");
  });

  it("retries exactly once on 401 after forcing a refresh", async () => {
    let tokenCalls = 0;
    const fakeFetch: typeof fetch = async () => {
      tokenCalls++;
      return new Response(
        JSON.stringify({ access_token: `t${tokenCalls}`, expires_in: 3600 }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    let toolCallCount = 0;
    const factory = async () =>
      ({
        callTool: async () => {
          toolCallCount++;
          if (toolCallCount === 1) {
            const err = new Error("unauthorized") as Error & { status?: number };
            err.status = 401;
            throw err;
          }
          return { content: [{ type: "text", text: "ok" }] };
        },
        close: async () => {},
      }) as never;
    const client = new InsForgeMcpClient({
      config: {
        endpoint: "https://mcp.insforge.dev",
        clientId: "cid",
        clientSecret: "sec",
        refreshToken: "r1",
      },
      fetchImpl: fakeFetch,
      clientFactory: factory,
    });
    const out = await client.callTool("list_orders", {});
    expect(out).toBeTruthy();
    expect(toolCallCount).toBe(2);
    expect(tokenCalls).toBe(2);
  });
});
