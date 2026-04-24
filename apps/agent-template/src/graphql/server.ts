// GraphQL server — loads the SDL from `manifest.cosmo_sdl_path` (produced by Cosmo Dream
// Query, architecture.md §4) and wires every Query/Mutation field to the agent core loop.
//
// Resolver strategy: field name → operation string. Because the SDL itself is generated at
// synthesis time, we don't ship hand-rolled resolver stubs — we inspect the SDL and
// synthesize a single catchall resolver that delegates to the core loop.

import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { readFile } from "node:fs/promises";
import { parse, Kind, type DocumentNode, type OperationTypeNode } from "graphql";
import gql from "graphql-tag";
import type { AgentCoreLoop } from "../core/loop.js";
import type { RuntimeManifest } from "../manifest.js";
import { resolveRelative } from "../manifest.js";

export interface ServerDeps {
  manifest: RuntimeManifest;
  manifestPath: string;
  core: AgentCoreLoop;
  scriptPath: string;
  listenPort?: number;
}

export interface BuildResult {
  server: ApolloServer;
  typeDefs: DocumentNode;
  resolvers: Record<string, Record<string, unknown>>;
}

export async function buildServer(deps: ServerDeps): Promise<BuildResult> {
  const sdlPath = resolveRelative(deps.manifestPath, deps.manifest.cosmo_sdl_path);
  const sdl = await readFile(sdlPath, "utf8");
  const typeDefs = gql(sdl);
  const resolvers = buildResolvers(typeDefs, deps.core, deps.scriptPath);
  const server = new ApolloServer({ typeDefs, resolvers });
  return { server, typeDefs, resolvers };
}

export async function startServer(deps: ServerDeps): Promise<{ url: string }> {
  const { server } = await buildServer(deps);
  const port = deps.listenPort ?? Number(process.env.PORT ?? 8080);
  const { url } = await startStandaloneServer(server, { listen: { port } });
  return { url };
}

export function buildResolvers(
  typeDefs: DocumentNode,
  core: AgentCoreLoop,
  scriptPath: string,
): Record<string, Record<string, unknown>> {
  const fieldsByOp: Record<string, string[]> = { Query: [], Mutation: [], Subscription: [] };
  const rootTypeNames = rootTypeNamesFromSchema(typeDefs);

  for (const def of typeDefs.definitions) {
    if (def.kind !== Kind.OBJECT_TYPE_DEFINITION) continue;
    const typeName = def.name.value;
    const opKind = typeNameToOp(typeName, rootTypeNames);
    if (!opKind) continue;
    for (const field of def.fields ?? []) {
      fieldsByOp[opKind]!.push(field.name.value);
    }
  }

  const resolvers: Record<string, Record<string, unknown>> = {};
  for (const [opKind, fields] of Object.entries(fieldsByOp)) {
    if (fields.length === 0) continue;
    const typeName = rootTypeNames[opKind as OperationTypeNode] ?? opKind;
    resolvers[typeName] = {};
    for (const fieldName of fields) {
      resolvers[typeName]![fieldName] = async (
        _parent: unknown,
        args: Record<string, unknown>,
      ) => {
        const result = await core.run({
          operation: fieldName,
          scriptPath,
          inputs: args,
        });
        return result.output;
      };
    }
  }
  return resolvers;
}

function rootTypeNamesFromSchema(typeDefs: DocumentNode): Record<OperationTypeNode, string> {
  const defaults: Record<OperationTypeNode, string> = {
    query: "Query",
    mutation: "Mutation",
    subscription: "Subscription",
  };
  for (const def of typeDefs.definitions) {
    if (def.kind === Kind.SCHEMA_DEFINITION) {
      for (const op of def.operationTypes) {
        defaults[op.operation] = op.type.name.value;
      }
    }
  }
  return defaults;
}

function typeNameToOp(
  typeName: string,
  rootTypeNames: Record<OperationTypeNode, string>,
): "Query" | "Mutation" | "Subscription" | null {
  if (typeName === rootTypeNames.query) return "Query";
  if (typeName === rootTypeNames.mutation) return "Mutation";
  if (typeName === rootTypeNames.subscription) return "Subscription";
  return null;
}
