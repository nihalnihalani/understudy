// InsForge 2.0 Remote OAuth MCP client. Architecture.md §13 "InsForge MCP OAuth drift" row:
// on 401, refresh the access token and retry exactly once. Hard-fail goes to the caller.
//
// We lean on @modelcontextprotocol/sdk for the underlying MCP transport; this wrapper
// only adds the refresh-token loop.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export interface InsForgeOAuthConfig {
  endpoint: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  tokenEndpoint?: string;
}

export interface InsForgeMcpOpts {
  config: InsForgeOAuthConfig;
  // Injected for tests — production uses fetch.
  fetchImpl?: typeof fetch;
  clientFactory?: (headers: Record<string, string>, endpoint: string) => Promise<Client>;
}

interface TokenBundle {
  accessToken: string;
  expiresAt: number;
}

export class InsForgeMcpClient {
  private config: InsForgeOAuthConfig;
  private token: TokenBundle | null = null;
  private fetchImpl: typeof fetch;
  private clientFactory: (headers: Record<string, string>, endpoint: string) => Promise<Client>;

  constructor(opts: InsForgeMcpOpts) {
    this.config = opts.config;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.clientFactory = opts.clientFactory ?? defaultClientFactory;
  }

  private async refresh(): Promise<TokenBundle> {
    const tokenEndpoint = this.config.tokenEndpoint ?? `${this.config.endpoint}/oauth/token`;
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.config.refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });
    const res = await this.fetchImpl(tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      throw new Error(`InsForge OAuth refresh failed: ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as { access_token: string; expires_in?: number };
    const bundle: TokenBundle = {
      accessToken: json.access_token,
      expiresAt: Date.now() + ((json.expires_in ?? 3600) - 60) * 1000,
    };
    this.token = bundle;
    return bundle;
  }

  private async accessToken(): Promise<string> {
    if (!this.token || Date.now() > this.token.expiresAt) {
      await this.refresh();
    }
    return this.token!.accessToken;
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const invoke = async (): Promise<unknown> => {
      const token = await this.accessToken();
      const client = await this.clientFactory(
        { authorization: `Bearer ${token}` },
        this.config.endpoint,
      );
      try {
        return await client.callTool({ name, arguments: args });
      } finally {
        await client.close();
      }
    };

    try {
      return await invoke();
    } catch (err) {
      if (isUnauthorized(err)) {
        // §13 "InsForge MCP OAuth drift": drop the stale bundle, refresh, retry once.
        this.token = null;
        await this.refresh();
        return invoke();
      }
      throw err;
    }
  }
}

function isUnauthorized(err: unknown): boolean {
  if (!err) return false;
  const anyErr = err as { status?: number; code?: number | string; message?: string };
  if (anyErr.status === 401 || anyErr.code === 401) return true;
  if (typeof anyErr.message === "string" && /\b401\b|unauthori[sz]ed/i.test(anyErr.message)) {
    return true;
  }
  return false;
}

async function defaultClientFactory(
  headers: Record<string, string>,
  endpoint: string,
): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
    requestInit: { headers },
  });
  const client = new Client({ name: "understudy-agent", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  return client;
}
