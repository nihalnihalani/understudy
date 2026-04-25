// Slide-over panel that runs a goal+URL on TinyFish's hosted browser and
// streams events from `GET /api/agents/run/stream?goal=&url=`.
//
// Used by the SynthesisHUD to give the user a one-click path from a freshly
// generated agent bundle to a live browser run.

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Play, Square, X, ExternalLink } from "lucide-react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { API_BASE } from "@/api/client";
import { cn } from "@/lib/utils";

interface AgentRunPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultGoal?: string;
  defaultUrl?: string;
}

interface StreamEvent {
  ts: string;
  type: string;
  text: string;
  raw: Record<string, unknown>;
}

type RunState = "idle" | "running" | "complete" | "error";

export function AgentRunPanel({
  open,
  onOpenChange,
  defaultGoal = "",
  defaultUrl = "https://www.google.com",
}: AgentRunPanelProps) {
  const [goal, setGoal] = useState(defaultGoal);
  const [url, setUrl] = useState(defaultUrl);
  const [state, setState] = useState<RunState>("idle");
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [streamingUrl, setStreamingUrl] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  // Re-sync defaults when the panel opens with new pre-fills.
  useEffect(() => {
    if (open) {
      if (defaultGoal && !goal) setGoal(defaultGoal);
      if (defaultUrl) setUrl(defaultUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultGoal, defaultUrl]);

  // Auto-scroll the log to the bottom on every new event.
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [events.length]);

  // Close the EventSource when the panel closes or the component unmounts.
  useEffect(() => {
    if (!open) stopRun();
    return () => stopRun();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const stopRun = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
    }
  }, []);

  const startRun = useCallback(() => {
    stopRun();
    setEvents([]);
    setStreamingUrl(null);
    setState("running");
    const qs = new URLSearchParams({ goal, url });
    const es = new EventSource(`${API_BASE}/agents/run/stream?${qs.toString()}`);
    sourceRef.current = es;

    es.onmessage = (msg) => {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(msg.data);
      } catch {
        parsed = { type: "RAW", text: msg.data };
      }
      const evt: StreamEvent = {
        ts: new Date().toLocaleTimeString(),
        type: String(parsed.type ?? "EVENT"),
        text: extractText(parsed),
        raw: parsed,
      };
      setEvents((prev) => [...prev, evt]);
      if (evt.type === "STREAMING_URL" && typeof parsed.streaming_url === "string") {
        setStreamingUrl(parsed.streaming_url);
      }
      if (evt.type === "COMPLETE") {
        setState("complete");
        es.close();
        sourceRef.current = null;
      }
      if (evt.type === "ERROR") {
        setState("error");
        es.close();
        sourceRef.current = null;
      }
    };

    es.onerror = () => {
      setState((prev) => (prev === "running" ? "error" : prev));
      es.close();
      sourceRef.current = null;
    };
  }, [goal, url, stopRun]);

  const canStart = state !== "running" && goal.trim().length > 0 && url.trim().length > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[640px]"
      >
        <SheetHeader className="border-b border-border/60 px-5 py-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <SheetTitle className="flex items-center gap-2 text-[15px]">
                Run on TinyFish
                <RunBadge state={state} />
              </SheetTitle>
              <SheetDescription className="mt-1 text-[12px]">
                Streams live from a hosted browser. Each step is an LLM-driven
                vision-parse + action.
              </SheetDescription>
            </div>
            <SheetClose asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X className="size-4" />
              </Button>
            </SheetClose>
          </div>
        </SheetHeader>

        <div className="space-y-3 border-b border-border/60 px-5 py-4">
          <div className="space-y-1.5">
            <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              goal
            </label>
            <Input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              disabled={state === "running"}
              placeholder='e.g. "Search Google for hello world and click a suggestion"'
              className="font-mono text-[12px]"
            />
          </div>
          <div className="space-y-1.5">
            <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              start url
            </label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={state === "running"}
              placeholder="https://..."
              className="font-mono text-[12px]"
            />
          </div>
          <div className="flex items-center gap-2 pt-1">
            {state === "running" ? (
              <Button variant="destructive" size="sm" onClick={stopRun}>
                <Square className="size-3.5 fill-current" /> Stop
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={startRun}
                disabled={!canStart}
              >
                <Play className="size-3.5 fill-current" /> Start run
              </Button>
            )}
            {streamingUrl && (
              <a
                href={streamingUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-mono text-[11px] text-primary hover:underline"
              >
                <ExternalLink className="size-3" /> live browser stream
              </a>
            )}
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div ref={logRef} className="space-y-1.5 p-5 font-mono text-[11px] leading-[1.6]">
            {events.length === 0 && state === "idle" && (
              <p className="text-muted-foreground">
                Press <kbd className="rounded border border-border bg-muted px-1.5 py-0.5">
                  Start run
                </kbd>{" "}
                to dispatch a hosted browser run on TinyFish.
              </p>
            )}
            {events.length === 0 && state === "running" && (
              <p className="text-muted-foreground">connecting…</p>
            )}
            {events.map((e, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.12 }}
                className="grid grid-cols-[60px_72px_1fr] gap-2 border-b border-border/30 pb-1.5 last:border-0"
              >
                <span className="text-muted-foreground">{e.ts}</span>
                <span className={cn("uppercase tracking-[0.06em]", typeColor(e.type))}>
                  {e.type}
                </span>
                <span className="break-words text-foreground">{e.text}</span>
              </motion.div>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function RunBadge({ state }: { state: RunState }) {
  if (state === "running") return <Badge variant="warning">running</Badge>;
  if (state === "complete") return <Badge variant="success">complete</Badge>;
  if (state === "error") return <Badge variant="destructive">error</Badge>;
  return null;
}

function typeColor(t: string): string {
  switch (t) {
    case "STARTED":
    case "OPEN":
      return "text-accent";
    case "STREAMING_URL":
      return "text-primary";
    case "PROGRESS":
      return "text-foreground";
    case "COMPLETE":
      return "text-success";
    case "ERROR":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
}

function extractText(parsed: Record<string, unknown>): string {
  if (typeof parsed.purpose === "string") return parsed.purpose;
  if (typeof parsed.message === "string") return parsed.message;
  if (typeof parsed.action_type === "string") return parsed.action_type;
  if (typeof parsed.streaming_url === "string") return parsed.streaming_url;
  if (typeof parsed.error === "string") return parsed.error;
  if (parsed.type === "OPEN" && typeof parsed.goal === "string") {
    return `goal: ${parsed.goal}`;
  }
  if (parsed.type === "COMPLETE" && parsed.result) {
    try {
      return JSON.stringify(parsed.result).slice(0, 240);
    } catch {
      // fall through
    }
  }
  try {
    return JSON.stringify(parsed).slice(0, 200);
  } catch {
    return "(unparseable)";
  }
}
