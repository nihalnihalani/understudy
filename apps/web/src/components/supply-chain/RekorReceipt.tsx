import { ExternalLink, Anchor } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyRow } from "@/components/common/CopyRow";

export interface RekorReceiptProps {
  logIndex: number;
  uuid: string;
  integratedTime: string;
  bodyHash?: string;
  fixture?: boolean;
}

export function RekorReceipt({
  logIndex,
  uuid,
  integratedTime,
  bodyHash,
  fixture,
}: RekorReceiptProps) {
  const searchUrl = `https://rekor.sigstore.dev/?logIndex=${logIndex}`;
  const apiUrl = `https://rekor.sigstore.dev/api/v1/log/entries/${uuid}`;

  return (
    <Card data-demo={fixture ? "fixture" : undefined} className="flex h-full flex-col">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <Anchor className="size-3.5 text-accent" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-faint">
                rekor transparency log
              </span>
            </div>
            <CardTitle>Inclusion proof · anchored</CardTitle>
            <CardDescription>
              Immutable tamper-evident append-only log at rekor.sigstore.dev.
            </CardDescription>
          </div>
          <Badge variant="accent">inclusion</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="rounded-lg border border-border bg-background/60 p-4 text-center">
          <div className="font-mono text-[10px] uppercase tracking-wider text-faint">
            log index
          </div>
          <div className="mt-1 font-mono text-[32px] font-semibold tabular-nums leading-none text-foreground">
            {logIndex.toLocaleString()}
          </div>
          <div className="mt-2 font-mono text-[11px] text-muted-foreground">
            integrated · {integratedTime}
          </div>
        </div>

        <dl className="space-y-0.5 rounded-md border border-border bg-surface/60 px-3 py-2">
          <CopyRow label="uuid" value={uuid} />
          <CopyRow
            label="api"
            value={apiUrl}
            href={apiUrl}
            tone="accent"
            truncate
          />
          {bodyHash && <CopyRow label="body" value={bodyHash} truncate />}
        </dl>

        <Button asChild variant="secondary" size="md" className="mt-auto">
          <a href={searchUrl} target="_blank" rel="noreferrer noopener">
            <ExternalLink className="size-3.5" />
            View on rekor.sigstore.dev
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
