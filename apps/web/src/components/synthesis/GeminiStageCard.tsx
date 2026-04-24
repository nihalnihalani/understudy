import { useEffect, useRef } from "react";
import {
  CheckCircle2,
  Circle,
  CircleAlert,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export type StageState = "pending" | "streaming" | "done" | "error";

interface GeminiStageCardProps {
  index: number;
  title: string;
  modelId: string;
  thinkingLevel: "minimal" | "low" | "medium" | "high";
  state: StageState;
  elapsedSeconds?: number;
  tokenCount?: number;
  toolCalls?: string[];
  placeholder?: string;
  footer?: string;
  variant?: "thought" | "call";
}

const STATE_LABEL: Record<StageState, string> = {
  pending: "pending",
  streaming: "streaming",
  done: "done",
  error: "error",
};

export function GeminiStageCard({
  index,
  title,
  modelId,
  thinkingLevel,
  state,
  elapsedSeconds,
  tokenCount,
  toolCalls,
  placeholder,
  footer,
  variant = "call",
}: GeminiStageCardProps) {
  const logRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (state === "streaming" && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [state, toolCalls?.length]);

  return (
    <Card
      className={cn(
        "flex flex-col gap-3 p-4 bg-surface/40",
        "transition-all duration-base",
        state === "streaming" &&
          "border-warning/40 shadow-[0_0_0_4px_hsl(var(--warning)/0.08)]",
        state === "done" && "border-success/30",
        state === "error" && "border-destructive/40",
        state === "pending" && "opacity-70"
      )}
      aria-label={`${title} stage, ${STATE_LABEL[state]}`}
    >
      <header className="flex items-start gap-3">
        <StageIcon state={state} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-faint">
              Stage {index}
            </span>
            <Badge variant={state === "streaming" ? "warning" : "default"}>
              {STATE_LABEL[state]}
            </Badge>
          </div>
          <h3 className="mt-1 text-[14px] font-semibold leading-tight text-foreground">
            {title}
          </h3>
          <div className="mt-1 font-mono text-[11px] text-muted-foreground">
            <span className="text-foreground">{modelId}</span>
            <span> · thinking_level: </span>
            <span className="text-accent">{thinkingLevel}</span>
          </div>
        </div>
      </header>

      <div
        className={cn(
          "relative rounded-md border border-border bg-background/60"
        )}
      >
        <ul
          ref={logRef}
          className="max-h-[168px] min-h-[120px] overflow-auto p-2.5 font-mono text-[11px] leading-[1.6]"
          role="log"
          aria-live={state === "streaming" ? "polite" : "off"}
        >
          {toolCalls && toolCalls.length > 0 ? (
            toolCalls.map((line, i) => (
              <li
                key={i}
                className={cn(
                  "whitespace-pre-wrap break-words",
                  variant === "thought" && line.startsWith("[thought]")
                    ? "italic text-muted-foreground"
                    : "text-foreground"
                )}
              >
                {line}
                {i === toolCalls.length - 1 && state === "streaming" && (
                  <span
                    aria-hidden
                    className="ml-1 inline-block h-3.5 w-[6px] translate-y-0.5 animate-caret bg-primary/80 align-middle"
                  />
                )}
              </li>
            ))
          ) : (
            <li className="italic text-faint">
              {placeholder ?? "awaiting upstream stage…"}
            </li>
          )}
        </ul>
      </div>

      <footer className="flex items-center justify-between font-mono text-[11px] text-muted-foreground">
        <span className="truncate">{footer}</span>
        <span className="flex shrink-0 items-center gap-3 tabular-nums">
          {typeof tokenCount === "number" && (
            <span>{tokenCount.toLocaleString()} tok</span>
          )}
          {typeof elapsedSeconds === "number" && (
            <span>{elapsedSeconds.toFixed(1)}s</span>
          )}
        </span>
      </footer>
    </Card>
  );
}

function StageIcon({ state }: { state: StageState }) {
  const base = "mt-0.5 size-4 shrink-0";
  switch (state) {
    case "done":
      return <CheckCircle2 className={cn(base, "text-success")} aria-hidden />;
    case "streaming":
      return (
        <Loader2 className={cn(base, "animate-spin text-warning")} aria-hidden />
      );
    case "error":
      return <CircleAlert className={cn(base, "text-destructive")} aria-hidden />;
    case "pending":
    default:
      return <Circle className={cn(base, "text-faint")} aria-hidden />;
  }
}
