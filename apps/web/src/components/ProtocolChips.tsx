// PROTOCOL CHIPS — four-protocol surface (GraphQL / gRPC / REST / OpenAPI)
// for a synthesized agent's federated subgraph, served by Cosmo Connect.
//
// Backed by GET /agents/{id}/protocols. Each chip is a copy-to-clipboard
// button — clicking flashes "copied" for ~1.2s, then restores the label.
//
// Render is unconditional once the parent has the data; gating on 404s
// happens at the fetch layer (AgentWall skips render when there are no
// protocols cached for a given agent yet).

import type { MouseEvent } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { AgentProtocols } from "@/api/types";

type ProtocolKey = keyof AgentProtocols["endpoints"];

const ORDER: ProtocolKey[] = ["graphql", "grpc", "rest", "openapi"];
const LABELS: Record<ProtocolKey, string> = {
  graphql: "GraphQL",
  grpc: "gRPC",
  rest: "REST",
  openapi: "OpenAPI",
};

export function ProtocolChips({ protocols }: { protocols: AgentProtocols }) {
  const [copied, setCopied] = useState<ProtocolKey | null>(null);

  const handleCopy = async (k: ProtocolKey, e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(protocols.endpoints[k]);
      setCopied(k);
      setTimeout(() => setCopied(null), 1200);
    } catch {
      /* clipboard write failed (insecure context, denied permission) — fail silent */
    }
  };

  return (
    <div
      role="list"
      aria-label="Cosmo Connect protocols"
      className="flex flex-wrap gap-1.5"
    >
      {ORDER.map((k) => {
        const isCopied = copied === k;
        return (
          <button
            key={k}
            type="button"
            role="listitem"
            title={protocols.endpoints[k]}
            aria-label={`Copy ${LABELS[k]} endpoint`}
            onClick={(e) => handleCopy(k, e)}
            className={cn(
              "inline-flex h-5 items-center rounded-sm border px-1.5",
              "font-mono text-[10px] uppercase tracking-wider",
              "transition-colors duration-fast",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isCopied
                ? "border-success/40 bg-success/10 text-success"
                : "border-border bg-background text-muted-foreground hover:bg-elevated hover:text-foreground"
            )}
          >
            {isCopied ? "copied" : LABELS[k]}
          </button>
        );
      })}
    </div>
  );
}
