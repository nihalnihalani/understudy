import { describe, it, expect } from "vitest";
import { InsForgeMcpClient, fromEnv, DEFAULT_MCP_ENDPOINT } from "../src/insforge/mcp-client.js";

describe("InsForgeMcpClient", () => {
  it("rejects construction without an accessToken", () => {
    expect(() => new InsForgeMcpClient({ accessToken: "" })).toThrow(
      /accessToken/,
    );
  });

  it("uses the default Remote MCP endpoint when none is provided", async () => {
    const seenHeaders: Record<string, string>[] = [];
    const seenEndpoints: string[] = [];
    const factory = async (headers: Record<string, string>, endpoint: string) => {
      seenHeaders.push(headers);
      seenEndpoints.push(endpoint);
      return {
        listTools: async () => ({ tools: [{ name: "fetch-docs" }] }),
        close: async () => {},
      } as never;
    };
    const client = new InsForgeMcpClient({
      accessToken: "abc.def.ghi",
      clientFactory: factory,
    });
    const tools = await client.listTools();
    expect(tools).toEqual([{ name: "fetch-docs", description: undefined }]);
    expect(seenEndpoints).toEqual([DEFAULT_MCP_ENDPOINT]);
    expect(seenHeaders[0]!.authorization).toBe("Bearer abc.def.ghi");
  });

  it("forwards tool calls verbatim and presents the Bearer header each call", async () => {
    let calls = 0;
    const factory = async (headers: Record<string, string>) => ({
      callTool: async ({ name, arguments: args }: { name: string; arguments: unknown }) => {
        calls++;
        return { name, args, auth: headers.authorization };
      },
      close: async () => {},
    } as never);
    const client = new InsForgeMcpClient({
      accessToken: "TOKEN",
      endpoint: "https://staging.insforge.dev/mcp",
      clientFactory: factory,
    });
    const r1 = await client.callTool("query", { sql: "select 1" });
    const r2 = await client.callTool("query", { sql: "select 2" });
    expect(calls).toBe(2);
    expect((r1 as { auth: string }).auth).toBe("Bearer TOKEN");
    expect((r2 as { auth: string }).auth).toBe("Bearer TOKEN");
  });

  it("fromEnv returns null when INSFORGE_MCP_TOKEN is unset", () => {
    expect(fromEnv({})).toBeNull();
  });

  it("fromEnv builds a client when INSFORGE_MCP_TOKEN is set", () => {
    const c = fromEnv({ INSFORGE_MCP_TOKEN: "tkn" });
    expect(c).not.toBeNull();
  });
});
