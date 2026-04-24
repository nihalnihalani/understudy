import { cn } from "@/lib/utils";

/**
 * Minimal sponsor text-badges. We don't ship vendor trademarks as raster
 * assets here — a monospace label in a subtle chip reads as "we integrate"
 * without risking misuse of a logo file we don't own.
 */
export type Sponsor =
  | "gemini"
  | "tinyfish"
  | "wundergraph"
  | "chainguard"
  | "insforge"
  | "redis";

const labels: Record<Sponsor, { label: string; dot: string }> = {
  gemini: { label: "Gemini", dot: "hsl(var(--chart-1))" },
  tinyfish: { label: "TinyFish", dot: "hsl(var(--chart-2))" },
  wundergraph: { label: "Wundergraph", dot: "hsl(var(--chart-3))" },
  chainguard: { label: "Chainguard", dot: "hsl(var(--chart-4))" },
  insforge: { label: "InsForge", dot: "hsl(var(--chart-5))" },
  redis: { label: "Redis", dot: "hsl(var(--destructive))" },
};

export function SponsorBadge({
  sponsor,
  className,
  size = "sm",
}: {
  sponsor: Sponsor;
  className?: string;
  size?: "sm" | "md";
}) {
  const { label, dot } = labels[sponsor];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border border-border bg-elevated font-mono text-muted-foreground",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-[12px]",
        className
      )}
    >
      <span
        className="inline-block size-1.5 rounded-full"
        style={{ backgroundColor: dot }}
      />
      {label}
    </span>
  );
}
