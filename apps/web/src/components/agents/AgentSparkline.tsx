import { cn } from "@/lib/utils";

export type SparkTone = "success" | "accent" | "warning" | "destructive";

export interface AgentSparklineProps {
  data: number[];
  height?: number;
  width?: number;
  tone?: SparkTone;
  className?: string;
  ariaLabel?: string;
}

const toneVar: Record<SparkTone, string> = {
  success: "hsl(var(--success))",
  accent: "hsl(var(--accent))",
  warning: "hsl(var(--warning))",
  destructive: "hsl(var(--destructive))",
};

export function AgentSparkline({
  data,
  height = 28,
  width = 120,
  tone = "success",
  className,
  ariaLabel,
}: AgentSparklineProps) {
  if (data.length === 0) {
    return (
      <div
        role="img"
        aria-label={ariaLabel ?? "no activity"}
        className={cn("font-mono text-[10px] text-faint", className)}
      >
        — no runs
      </div>
    );
  }

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = Math.max(max - min, 1);
  const step = data.length > 1 ? width / (data.length - 1) : width;

  const points = data
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const areaPoints = `0,${height} ${points} ${width},${height}`;
  const color = toneVar[tone];

  return (
    <svg
      role="img"
      aria-label={ariaLabel ?? `Activity sparkline, ${data.length} datapoints`}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn("block", className)}
    >
      <polygon points={areaPoints} fill={color} opacity={0.12} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export type AgentState = "active" | "idle" | "failed" | "pending";

export function stateToTone(s: AgentState): SparkTone {
  switch (s) {
    case "active":
      return "success";
    case "idle":
      return "accent";
    case "pending":
      return "warning";
    case "failed":
      return "destructive";
  }
}
