// Tiny PostgREST client for InsForge anon reads.
//
// Why direct PostgREST instead of going through the FastAPI proxy?
//   1. Faster — no Python round-trip for trivially-cacheable public reads
//   2. Demonstrates that the RLS policies (migrations/20260424220227_rls-policies.sql)
//      are actually wired up. The browser presents the anon JWT and the database
//      decides what's visible.
//
// Mutations and anything sensitive still go through apps/api/store.py (which
// uses the service-role key). Callers should treat this lib as best-effort:
// throw on any non-2xx and let the caller fall back to the FastAPI client.
//
// Endpoint shape (verified):
//   GET {VITE_INSFORGE_URL}/api/database/records/{table}?{filter}
//   Authorization: Bearer {VITE_INSFORGE_ANON_KEY}
// Returns a JSON array. PostgREST filter syntax — e.g. `id=eq.<uuid>`.

const INSFORGE_URL = import.meta.env.VITE_INSFORGE_URL;
const INSFORGE_ANON_KEY = import.meta.env.VITE_INSFORGE_ANON_KEY;

export class InsforgeError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "InsforgeError";
  }
}

/**
 * Returns true when both env vars are present. Callers can short-circuit
 * before paying the fetch cost (and to keep the fixture demo path working
 * when InsForge isn't configured at all).
 */
export function isInsforgeConfigured(): boolean {
  return Boolean(INSFORGE_URL) && Boolean(INSFORGE_ANON_KEY);
}

/**
 * GET /api/database/records/{table}[?{filter}] with the anon Bearer token.
 * Throws on HTTP >= 400. Returns the parsed JSON array (PostgREST default).
 *
 * @example
 *   const rows = await selectRows<Agent>("agent");
 *   const one  = await selectRows<Agent>("agent", `id=eq.${agentId}`);
 */
export async function selectRows<T>(
  table: string,
  filter?: string
): Promise<T[]> {
  if (!INSFORGE_URL || !INSFORGE_ANON_KEY) {
    throw new InsforgeError(
      0,
      "InsForge is not configured (VITE_INSFORGE_URL / VITE_INSFORGE_ANON_KEY missing)"
    );
  }

  const qs = filter ? `?${filter}` : "";
  const url = `${INSFORGE_URL}/api/database/records/${table}${qs}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${INSFORGE_ANON_KEY}`,
      Accept: "application/json",
    },
  });

  if (res.status >= 400) {
    const body = await res.text().catch(() => "");
    throw new InsforgeError(
      res.status,
      `${table}${qs} -> ${res.status}: ${body}`
    );
  }

  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) {
    throw new InsforgeError(
      res.status,
      `${table}${qs} -> expected array, got ${typeof data}`
    );
  }
  return data as T[];
}

/**
 * Postgres row shape for the `agent` table. Fields mirror
 * apps/api/schemas.py:73 (the Pydantic Agent model). Kept here as a separate
 * interface — rather than importing from @/api/types — so the InsForge lib
 * can stand alone if the FastAPI types ever drift from the DB columns.
 */
export interface Agent {
  id: string;
  image_digest: string;
  cosign_sig: string;
  graphql_endpoint: string;
  ams_namespace: string;
}
