import { ExternalLink, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface Subgraph {
  id: string;
  typeCount: number;
  isNew?: boolean;
}

interface SupergraphMiniMapProps {
  subgraphs: Subgraph[];
  studioUrl: string;
  composedMs?: number;
  engine?: string;
}

export function SupergraphMiniMap({
  subgraphs,
  studioUrl,
  composedMs = 142,
  engine = "cosmo-router v0.137",
}: SupergraphMiniMapProps) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <h3 className="text-[14px] font-semibold text-foreground">
            Composed supergraph
          </h3>
          <p className="font-mono text-[11px] text-muted-foreground">
            composed in {composedMs}ms · {engine}
          </p>
        </div>
        <Badge variant="primary">{subgraphs.length} subgraphs</Badge>
      </div>
      <Separator />
      <ul className="divide-y divide-border">
        {subgraphs.map((sub) => (
          <li
            key={sub.id}
            className={cn(
              "flex items-center justify-between gap-3 px-4 py-2.5",
              sub.isNew && "bg-primary/5"
            )}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden
                className={cn(
                  "inline-block size-1.5 rounded-full",
                  sub.isNew ? "bg-primary" : "bg-border-strong"
                )}
              />
              <span className="truncate font-mono text-[12px] text-foreground">
                {sub.id}
              </span>
              {sub.isNew && (
                <Badge variant="primary">
                  <Sparkles className="size-3" /> new
                </Badge>
              )}
            </div>
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
              {sub.typeCount} types
            </span>
          </li>
        ))}
      </ul>
      <Separator />
      <div className="p-3">
        <a
          href={studioUrl}
          target="_blank"
          rel="noreferrer noopener"
          className={cn(
            "flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary text-[13px] font-medium text-primary-foreground",
            "transition-colors duration-fast hover:bg-primary-700",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          )}
        >
          Open in Cosmo Studio
          <ExternalLink className="size-3.5" />
        </a>
      </div>
    </Card>
  );
}
