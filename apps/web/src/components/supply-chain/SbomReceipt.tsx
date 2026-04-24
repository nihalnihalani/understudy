import { Package, Download } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Sbom } from "@/api/types";

export interface SbomReceiptProps {
  sbom: Sbom;
  directCount?: number;
  transitiveCount?: number;
  downloadUrl?: string;
  fixture?: boolean;
}

export function SbomReceipt({
  sbom,
  directCount,
  transitiveCount,
  downloadUrl = "/sbom.spdx.json",
  fixture,
}: SbomReceiptProps) {
  const total = sbom.components.length;
  const top10 = sbom.components.slice(0, 10);
  const direct = directCount ?? Math.min(total, Math.round(total * 0.3));
  const transitive = transitiveCount ?? total - direct;

  return (
    <Card data-demo={fixture ? "fixture" : undefined} className="flex h-full flex-col">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <Package className="size-3.5 text-accent" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-faint">
                software bill of materials
              </span>
            </div>
            <CardTitle>SBOM · {sbom.format.toUpperCase()}</CardTitle>
            <CardDescription>
              Generated in-process at build time · {sbom.generation_time}
            </CardDescription>
          </div>
          <Badge variant="accent">{sbom.format}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="total" value={total.toLocaleString()} />
          <Stat label="direct" value={direct.toLocaleString()} />
          <Stat label="transitive" value={transitive.toLocaleString()} />
        </div>

        <div>
          <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-faint">
            top 10 components
          </div>
          <ul className="space-y-0.5 rounded-md border border-border bg-surface/60 p-1.5 font-mono text-[11px]">
            {top10.map((c, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 rounded-sm px-2 py-1 hover:bg-elevated"
              >
                <span className="truncate text-foreground" title={c.name}>
                  {c.name}
                </span>
                {c.version && (
                  <span className="shrink-0 text-muted-foreground">{c.version}</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <Button asChild variant="outline" size="md" className="mt-auto">
          <a href={downloadUrl} download>
            <Download className="size-3.5" />
            Download sbom.spdx.json
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background/60 px-2.5 py-2 text-center">
      <div className="font-mono text-[10px] uppercase tracking-wider text-faint">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-[18px] font-semibold tabular-nums text-foreground">
        {value}
      </div>
    </div>
  );
}
