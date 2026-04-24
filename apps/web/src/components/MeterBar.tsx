import { cn } from "@/lib/cn";

interface Props {
  value: number;
  max?: number;
  tone?: "indigo" | "amber" | "emerald" | "crimson";
  indeterminate?: boolean;
  label?: string;
  className?: string;
}

export function MeterBar({
  value,
  max = 100,
  tone = "indigo",
  indeterminate,
  label,
  className,
}: Props) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const toneBg: Record<string, string> = {
    indigo: "bg-primary",
    amber: "bg-accent-amber",
    emerald: "bg-accent-emerald",
    crimson: "bg-accent-crimson",
  };
  return (
    <div
      className={cn("meter-track h-1", className)}
      role="progressbar"
      aria-label={label ?? "progress"}
      aria-valuenow={indeterminate ? undefined : Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-300 ease-out",
          toneBg[tone]
        )}
        style={
          indeterminate
            ? { width: "40%", animation: "meter 1.6s linear infinite" }
            : { width: `${pct}%` }
        }
      />
    </div>
  );
}
