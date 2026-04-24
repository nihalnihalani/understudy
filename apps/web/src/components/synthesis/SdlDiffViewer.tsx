import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SdlDiffViewerProps {
  currentSdl: string;
  proposedSdl: string;
  proposalId?: string;
}

type DiffKind = "context" | "add" | "remove";
interface DiffLine {
  kind: DiffKind;
  text: string;
  left: number | null;
  right: number | null;
}

// Minimal LCS-based line diff. The proposed SDL is typically a pure-add
// delta so this stays well within cubic complexity for small schemas.
function computeDiff(a: string, b: string): DiffLine[] {
  const left = a.split("\n");
  const right = b.split("\n");
  const n = left.length;
  const m = right.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(0)
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] =
        left[i] === right[j]
          ? dp[i + 1]![j + 1]! + 1
          : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0,
    j = 0;
  let li = 1,
    rj = 1;
  while (i < n && j < m) {
    if (left[i] === right[j]) {
      out.push({ kind: "context", text: left[i]!, left: li++, right: rj++ });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push({ kind: "remove", text: left[i]!, left: li++, right: null });
      i++;
    } else {
      out.push({ kind: "add", text: right[j]!, left: null, right: rj++ });
      j++;
    }
  }
  while (i < n) {
    out.push({ kind: "remove", text: left[i++]!, left: li++, right: null });
  }
  while (j < m) {
    out.push({ kind: "add", text: right[j++]!, left: null, right: rj++ });
  }
  return out;
}

export function SdlDiffViewer({
  currentSdl,
  proposedSdl,
  proposalId,
}: SdlDiffViewerProps) {
  const diff = useMemo(
    () => computeDiff(currentSdl, proposedSdl),
    [currentSdl, proposedSdl]
  );
  const additions = diff.filter((d) => d.kind === "add").length;
  const removals = diff.filter((d) => d.kind === "remove").length;

  return (
    <Card className="overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold text-foreground">
            Supergraph SDL delta
          </span>
          {proposalId && (
            <Badge variant="outline" className="font-mono">
              {proposalId}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant="success">+{additions}</Badge>
          <Badge variant="destructive">−{removals}</Badge>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2">
        <DiffPane
          title="Current supergraph"
          subtitle="router · subgraphs × 4"
          lines={diff}
          side="left"
        />
        <DiffPane
          title="Proposed delta"
          subtitle="+ agent_orders_exporter"
          lines={diff}
          side="right"
          className="border-t border-border md:border-l md:border-t-0"
        />
      </div>
    </Card>
  );
}

function DiffPane({
  title,
  subtitle,
  lines,
  side,
  className,
}: {
  title: string;
  subtitle: string;
  lines: DiffLine[];
  side: "left" | "right";
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex items-baseline justify-between border-b border-border bg-elevated/40 px-3 py-2">
        <span className="text-[12px] font-medium text-foreground">{title}</span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {subtitle}
        </span>
      </div>
      <ScrollArea className="max-h-[420px]">
        <pre className="m-0 font-mono text-[11px] leading-[1.7]">
          {lines.map((line, i) => (
            <DiffLineRow key={i} line={line} side={side} />
          ))}
        </pre>
      </ScrollArea>
    </div>
  );
}

function DiffLineRow({ line, side }: { line: DiffLine; side: "left" | "right" }) {
  const visibleOnLeft = line.kind !== "add";
  const visibleOnRight = line.kind !== "remove";
  const show = side === "left" ? visibleOnLeft : visibleOnRight;
  const lineNo = side === "left" ? line.left : line.right;
  const marker = line.kind === "add" ? "+" : line.kind === "remove" ? "−" : " ";
  const tone =
    line.kind === "add"
      ? "bg-success/10 text-success"
      : line.kind === "remove"
      ? "bg-destructive/10 text-destructive"
      : "text-muted-foreground";

  return (
    <div
      className={cn(
        "flex gap-0",
        show ? tone : "text-faint/40 bg-background/40",
        !show && "select-none"
      )}
    >
      <span className="w-9 shrink-0 select-none border-r border-border pr-2 text-right tabular-nums text-faint">
        {show ? lineNo : ""}
      </span>
      <span className="w-5 shrink-0 select-none text-center">
        {show ? marker : ""}
      </span>
      <span className="whitespace-pre-wrap break-words pr-3">
        {show ? line.text || " " : ""}
      </span>
    </div>
  );
}
