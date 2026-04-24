import { describe, it, expect } from "vitest";
import gql from "graphql-tag";
import { buildResolvers } from "../src/graphql/server.js";
import type { AgentCoreLoop } from "../src/core/loop.js";

describe("buildResolvers", () => {
  it("generates a delegating resolver per Query/Mutation field", async () => {
    const typeDefs = gql`
      type Query {
        exportOrders(dateRange: String): Json
        recentExports(limit: Int): Json
      }
      type Mutation {
        triggerExport(dateRange: String!): Json
      }
      scalar Json
    `;
    const calls: Array<{ operation: string; inputs: unknown }> = [];
    const fakeCore: Pick<AgentCoreLoop, "run"> = {
      async run(req) {
        calls.push({ operation: req.operation, inputs: req.inputs });
        return { operation: req.operation, skill: { name: "x", version: "1" }, cached: false, output: { ok: true } };
      },
    };
    const resolvers = buildResolvers(typeDefs, fakeCore as AgentCoreLoop, "/a/s.ts");
    expect(Object.keys(resolvers.Query!)).toEqual(["exportOrders", "recentExports"]);
    expect(Object.keys(resolvers.Mutation!)).toEqual(["triggerExport"]);

    const fn = resolvers.Query!["exportOrders"] as (p: unknown, a: unknown) => Promise<unknown>;
    const out = await fn(null, { dateRange: "yesterday" });
    expect(out).toEqual({ ok: true });
    expect(calls[0]).toEqual({ operation: "exportOrders", inputs: { dateRange: "yesterday" } });
  });
});
