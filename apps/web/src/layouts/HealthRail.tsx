import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { StatusDot, type Status } from "@/components/ui/status-dot";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const TRACKED = [
  { key: "redis", label: "Redis" },
  { key: "gemini", label: "Gemini" },
  { key: "cosmo_mcp", label: "Cosmo" },
  { key: "chainguard", label: "Chainguard" },
] as const;

function normalize(status: string | undefined): Status {
  if (!status) return "pending";
  if (status === "ok" || status === "live") return "ok";
  if (status === "mock") return "mock";
  if (status === "degraded") return "degraded";
  return "down";
}

export function HealthRail({ className }: { className?: string }) {
  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: 10_000,
    retry: false,
  });
  const byName = Object.fromEntries(
    (health?.services ?? []).map((s) => [s.name, s.status])
  );

  return (
    <div
      className={cn("flex items-center gap-1.5 font-mono", className)}
      aria-label="Sponsor service health"
    >
      {TRACKED.map(({ key, label }) => {
        const raw = byName[key];
        const status = normalize(raw);
        return (
          <Tooltip key={key} delayDuration={300}>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[11px]",
                  status === "ok" &&
                    "border-success/35 bg-success/10 text-success",
                  (status === "mock" || status === "degraded") &&
                    "border-warning/35 bg-warning/10 text-warning",
                  status === "down" &&
                    "border-destructive/35 bg-destructive/10 text-destructive",
                  status === "pending" &&
                    "border-border bg-elevated text-muted-foreground"
                )}
              >
                <StatusDot status={status} />
                {label}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {label}: {raw ?? "probing…"}
            </TooltipContent>
          </Tooltip>
        );
      })}
      <span
        className="ml-1 inline-flex items-center gap-1.5 rounded-sm border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] text-primary-soft"
        aria-label={`Demo mode: ${health?.demo_mode ?? "unknown"}`}
      >
        MODE
        <span className="tracking-wider">
          {(health?.demo_mode ?? "…").toUpperCase()}
        </span>
      </span>
    </div>
  );
}
