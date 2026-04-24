import { cn } from "@/lib/utils";

export type Status = "live" | "ok" | "mock" | "degraded" | "down" | "pending";

const toneFor: Record<Status, string> = {
  live: "bg-success",
  ok: "bg-success",
  mock: "bg-warning animate-pulse-dot",
  degraded: "bg-warning animate-pulse-dot",
  down: "bg-destructive",
  pending: "bg-muted",
};

export function StatusDot({
  status,
  className,
  size = 6,
}: {
  status: Status;
  className?: string;
  size?: number;
}) {
  return (
    <span
      className={cn("inline-block rounded-full", toneFor[status], className)}
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}
