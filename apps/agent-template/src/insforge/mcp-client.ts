// InsForge 2.0 Remote OAuth MCP client. Wraps @modelcontextprotocol/sdk's
// StreamableHTTPClientTransport with the auth header InsForge expects.
//
// InsForge's discovery doc (2026-04-25) says the MCP server speaks OAuth 2.1
// with authorization_code + PKCE only — no refresh_token grant. The token is
// obtained out-of-band via `python scripts/insforge_oauth_login.py` (one-time
// browser flow) and stored in `.env` as INSFORGE_MCP_TOKEN. This client just
// presents that token as a Bearer header.
//
// Endpoints (architecture.md §13):
//   POST  https://mcp.insforge.dev/mcp           — Streamable HTTP MCP server
//   GET   https://mcp.insforge.dev/.well-known/oauth-authorization-server
//   POST  https://mcp.insforge.dev/oauth/token   — code → access_token
//
// On 401 the client throws — there's no automated refresh path. The caller
// should re-run the login script.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export const DEFAULT_MCP_ENDPOINT = "https://mcp.insforge.dev/mcp";

export interface InsForgeMcpOpts {
  /** Project-bound MCP access token from `scripts/insforge_oauth_login.py`. */
  accessToken: string;
  /** Defaults to https://mcp.insforge.dev/mcp. Override for local dev or staging. */
  endpoint?: string;
  /** Injected for tests; production builds a fresh Client per call. */
  clientFactory?: (
    headers: Record<string, string>,
    endpoint: string,
  ) => Promise<Client>;
}

export class InsForgeMcpClient {
  private accessToken: string;
  private endpoint: string;
  private clientFactory: (
    headers: Record<string, string>,
    endpoint: string,
  ) => Promise<Client>;

  constructor(opts: InsForgeMcpOpts) {
    if (!opts.accessToken) {
      throw new Error(
        "InsForgeMcpClient requires accessToken — run `python scripts/insforge_oauth_login.py` and set INSFORGE_MCP_TOKEN in .env",
      );
    }
    this.accessToken = opts.accessToken;
    this.endpoint = opts.endpoint ?? DEFAULT_MCP_ENDPOINT;
    this.clientFactory = opts.clientFactory ?? defaultClientFactory;
  }

  /** Open + initialize an MCP session and return the client. Caller closes it. */
  async connect(): Promise<Client> {
    return this.clientFactory(
      { authorization: `Bearer ${this.accessToken}` },
      this.endpoint,
    );
  }

  /** List the MCP tools the server exposes. Useful as a liveness probe. */
  async listTools(): Promise<{ name: string; description?: string }[]> {
    const client = await this.connect();
    try {
      const res = await client.listTools();
      return (res.tools ?? []).map((t) => ({
        name: t.name,
        description: t.description,
      }));
    } finally {
      await client.close();
    }
  }

  /** Invoke an MCP tool by name. Returns the raw tool result. */
  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const client = await this.connect();
    try {
      return await client.callTool({ name, arguments: args });
    } finally {
      await client.close();
    }
  }
}

async function defaultClientFactory(
  headers: Record<string, string>,
  endpoint: string,
): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
    requestInit: { headers },
  });
  const client = new Client(
    { name: "understudy-agent", version: "0.1.0" },
    { capabilities: {} },
  );
  await client.connect(transport);
  return client;
}

/** Construct an InsForgeMcpClient from environment vars (INSFORGE_MCP_TOKEN). */
export function fromEnv(env: Record<string, string | undefined> = process.env as Record<string, string | undefined>): InsForgeMcpClient | null {
  const token = env.INSFORGE_MCP_TOKEN;
  if (!token) return null;
  return new InsForgeMcpClient({
    accessToken: token,
    endpoint: env.INSFORGE_MCP_ENDPOINT,
  });
}
