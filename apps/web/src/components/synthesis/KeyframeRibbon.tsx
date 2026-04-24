import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

export interface Keyframe {
  ts: string;
  targetX: number;
  targetY: number;
  events?: string[];
}

interface KeyframeRibbonProps {
  frames: Keyframe[];
  selected: number;
  onSelect: (i: number) => void;
}

export function KeyframeRibbon({
  frames,
  selected,
  onSelect,
}: KeyframeRibbonProps) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (frames.length === 0) {
    return (
      <div className="flex h-[96px] items-center justify-center rounded-md border border-dashed border-border text-[12px] text-faint">
        no keyframes extracted yet
      </div>
    );
  }

  return (
    <>
      <ScrollArea className="w-full whitespace-nowrap">
        <ul
          className="flex gap-2 pb-2"
          role="tablist"
          aria-label="Extracted keyframes"
        >
          {frames.map((frame, i) => (
            <li key={i} className="shrink-0">
              <button
                type="button"
                role="tab"
                aria-selected={selected === i}
                onClick={() => onSelect(i)}
                onDoubleClick={() => setExpanded(i)}
                className={cn(
                  "relative block h-[72px] w-[128px] overflow-hidden rounded-md border bg-elevated text-left",
                  "transition-all duration-fast",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected === i
                    ? "border-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.18)]"
                    : "border-border hover:border-border-strong"
                )}
              >
                <FrameIllustration selected={selected === i} />
                <span
                  aria-hidden
                  className="absolute h-2 w-2 rounded-full bg-destructive/90 ring-2 ring-destructive/25"
                  style={{
                    left: `${frame.targetX}%`,
                    top: `${frame.targetY}%`,
                    transform: "translate(-50%, -50%)",
                  }}
                />
                <span className="absolute left-1 top-1 rounded-xs bg-background/80 px-1 font-mono text-[10px] text-foreground">
                  f{String(i + 1).padStart(2, "0")}
                </span>
                <span className="absolute bottom-1 right-1 rounded-xs bg-background/80 px-1 font-mono text-[10px] text-foreground tabular-nums">
                  {frame.ts}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <Dialog
        open={expanded !== null}
        onOpenChange={(open: boolean) => !open && setExpanded(null)}
      >
        <DialogContent className="max-w-xl">
          {expanded !== null && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Frame {String(expanded + 1).padStart(2, "0")} —{" "}
                  <span className="font-mono text-[13px] text-muted-foreground">
                    {frames[expanded]!.ts}
                  </span>
                </DialogTitle>
                <DialogDescription>
                  Detected UI events pulled from the scene-change delta.
                </DialogDescription>
              </DialogHeader>
              <div className="relative h-[240px] w-full overflow-hidden rounded-md border border-border bg-elevated">
                <FrameIllustration selected large />
                <span
                  aria-hidden
                  className="absolute h-3 w-3 rounded-full bg-destructive/90 ring-4 ring-destructive/20"
                  style={{
                    left: `${frames[expanded]!.targetX}%`,
                    top: `${frames[expanded]!.targetY}%`,
                    transform: "translate(-50%, -50%)",
                  }}
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(frames[expanded]!.events ?? [
                  "CLICK · Export CSV button",
                  "bbox · [1104,82,1198,114]",
                  "confidence · 0.93",
                ]).map((ev) => (
                  <Badge key={ev} variant="outline" className="font-mono">
                    {ev}
                  </Badge>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function FrameIllustration({
  selected,
  large = false,
}: {
  selected: boolean;
  large?: boolean;
}) {
  const fg = selected ? "hsl(var(--primary) / 0.2)" : "hsl(var(--border-strong) / 0.35)";
  return (
    <svg
      viewBox="0 0 160 90"
      preserveAspectRatio="none"
      className={cn("h-full w-full", large && "text-foreground")}
      aria-hidden
    >
      <rect width="160" height="90" fill="hsl(var(--surface))" />
      <rect width="160" height="14" fill="hsl(var(--elevated))" />
      <circle cx="6" cy="7" r="2" fill="hsl(var(--destructive))" />
      <circle cx="13" cy="7" r="2" fill="hsl(var(--warning))" />
      <circle cx="20" cy="7" r="2" fill="hsl(var(--success))" />
      <rect x="32" y="3" width="90" height="8" rx="2" fill="hsl(var(--background))" />
      <rect x="6" y="20" width="38" height="64" fill="hsl(var(--elevated))" rx="2" />
      <rect x="50" y="20" width="104" height="10" fill={fg} rx="2" />
      <rect x="50" y="34" width="70" height="6" fill="hsl(var(--primary) / 0.55)" rx="1" />
      <rect x="50" y="44" width="44" height="6" fill="hsl(var(--accent) / 0.4)" rx="1" />
      <rect
        x="50"
        y="56"
        width="104"
        height="28"
        fill="hsl(var(--background))"
        stroke="hsl(var(--border))"
        rx="2"
      />
    </svg>
  );
}
