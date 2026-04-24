import { CheckCircle2, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface TrafficValidatorBannerProps {
  breakingChanges: number;
  clientOpsSampled: number;
  windowDays: number;
  hash?: string;
  isFixture?: boolean;
}

export function TrafficValidatorBanner({
  breakingChanges,
  clientOpsSampled,
  windowDays,
  hash,
  isFixture = true,
}: TrafficValidatorBannerProps) {
  const ok = breakingChanges === 0;
  return (
    <Card
      className={cn(
        "flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-6",
        ok
          ? "border-success/35 bg-success/5"
          : "border-destructive/40 bg-destructive/5"
      )}
      role="status"
    >
      <div
        className={cn(
          "flex size-12 shrink-0 items-center justify-center rounded-full",
          ok ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
        )}
      >
        <CheckCircle2 className="size-6" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-semibold text-foreground">
            Schema validated against live traffic
          </span>
          <Badge variant={ok ? "success" : "destructive"}>
            {ok ? "PASS" : "FAIL"}
          </Badge>
          {isFixture && (
            <Badge variant="outline" className="text-faint">
              demo fixture
            </Badge>
          )}
        </div>
        <p className="mt-1 text-[13px] text-muted-foreground">
          <span className="font-semibold text-foreground">
            {breakingChanges}
          </span>{" "}
          breaking changes vs{" "}
          <span className="font-semibold text-foreground">
            {clientOpsSampled.toLocaleString()}
          </span>{" "}
          client ops sampled over the last {windowDays} days.
        </p>
        <p className="mt-1 font-mono text-[11px] text-faint">
          live-traffic validator result
          {hash ? ` · ${hash}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:w-[320px]">
        <Stat label="breaking" value={breakingChanges} tone={ok ? "success" : "destructive"} />
        <Stat label="ops sampled" value={clientOpsSampled.toLocaleString()} />
        <Stat label="window" value={`${windowDays}d`} icon={<Activity className="size-3" />} />
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string | number;
  tone?: "success" | "destructive";
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-surface px-2.5 py-2">
      <div className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-faint">
        {icon}
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 text-[16px] font-semibold tabular-nums",
          tone === "success" && "text-success",
          tone === "destructive" && "text-destructive",
          !tone && "text-foreground"
        )}
      >
        {value}
      </div>
    </div>
  );
}
