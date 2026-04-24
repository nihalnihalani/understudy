import { GitBranch, ChevronRight, FileCheck2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CopyRow } from "@/components/common/CopyRow";
import { cn } from "@/lib/utils";
import { truncateDigest } from "@/lib/format";
import type { SlsaAttestation } from "@/api/types";

export interface SlsaReceiptProps {
  predicateType: string;
  builderId: string;
  materials: SlsaAttestation["materials"];
  invocationRef?: string;
  invocationSha?: string;
  buildStartedOn?: string;
  buildFinishedOn?: string;
  reproducible?: string;
  fixture?: boolean;
}

export function SlsaReceipt({
  predicateType,
  builderId,
  materials,
  invocationRef,
  invocationSha,
  buildStartedOn,
  buildFinishedOn,
  reproducible,
  fixture,
}: SlsaReceiptProps) {
  return (
    <Card data-demo={fixture ? "fixture" : undefined} className="flex h-full flex-col lg:col-span-2">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <FileCheck2 className="size-3.5 text-accent" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-faint">
                slsa provenance
              </span>
            </div>
            <CardTitle>SLSA Build Level 2</CardTitle>
            <CardDescription>
              Emitted in-process by slsa-github-generator at build time — not a post-build scan.
              Labeled honestly: we claim L2 (signed, hosted builder). L3 (hermetic) is out of scope.
            </CardDescription>
          </div>
          <Badge variant="success">L2</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <dl className="space-y-0.5 rounded-md border border-border bg-surface/60 px-3 py-2">
          <CopyRow label="predicate_type" value={predicateType} />
          <CopyRow label="builder_id" value={builderId} />
          {invocationRef && <CopyRow label="invocation.ref" value={invocationRef} />}
          {invocationSha && <CopyRow label="invocation.sha" value={invocationSha} />}
          {buildStartedOn && (
            <CopyRow label="build.started" value={buildStartedOn} dense />
          )}
          {buildFinishedOn && (
            <CopyRow label="build.finished" value={buildFinishedOn} dense />
          )}
          {reproducible && (
            <CopyRow label="reproducible" value={reproducible} dense />
          )}
        </dl>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitBranch className="size-3 text-faint" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-faint">
                materials ({materials.length})
              </span>
            </div>
            <span className="font-mono text-[10px] text-faint">uri + digest</span>
          </div>
          <div className="space-y-1.5">
            {materials.map((m, i) => (
              <MaterialRow key={i} uri={m.uri} digest={m.digest} trust={m.trust} />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MaterialRow({
  uri,
  digest,
  trust,
}: {
  uri: string;
  digest: string;
  trust?: string;
}) {
  return (
    <details
      className={cn(
        "group rounded-md border border-border bg-surface/60",
        "open:bg-surface"
      )}
    >
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-2 px-3 py-2",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "rounded-md"
        )}
      >
        <ChevronRight
          className="size-3 shrink-0 text-faint transition-transform duration-fast group-open:rotate-90"
          aria-hidden
        />
        <span className="flex-1 truncate font-mono text-[12px] text-foreground" title={uri}>
          {uri}
        </span>
        {trust && (
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-accent">
            {trust}
          </span>
        )}
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
          {truncateDigest(digest, 10, 6)}
        </span>
      </summary>
      <div className="border-t border-border/60 px-3 py-2">
        <CopyRow label="uri" value={uri} />
        <CopyRow label="digest" value={digest} />
        {trust && <CopyRow label="trust" value={trust} dense />}
      </div>
    </details>
  );
}
