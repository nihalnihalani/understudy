// SYNTHESIS HUD — beat 0:20-1:20. The hero screen. Three-column layout:
//   left   = 3 stacked Gemini stage cards (Flash-Lite, Pro, Flash)
//   middle = keyframe ribbon + emitted TinyFish script
//   right  = intent tree (collapsible)
//
// Data shape: GET /synthesis/{id} -> SynthesisRunDetail (apps/api/schemas.py),
// streaming from /synthesis/{id}/stream via useTraceStream. The
// useSynthesisRun wrapper handles fixture fallback so this file is free of
// branching noise.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, WifiOff, Radio } from "lucide-react";
import { PageHeader } from "@/layouts/AppShell";
import { GeminiStageCard } from "@/components/synthesis/GeminiStageCard";
import {
  KeyframeRibbon,
  type Keyframe,
} from "@/components/synthesis/KeyframeRibbon";
import { IntentTree } from "@/components/synthesis/IntentTree";
import { ScriptPanel } from "@/components/synthesis/ScriptPanel";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { formatDuration, relativeTime } from "@/lib/format";
import { useSynthesisRun } from "@/hooks/useSynthesisRun";
import { DEMO_KEYFRAMES, DEMO_SCRIPT_LINES } from "@/fixtures/demo";
import type { TraceEvent } from "@/api/types";

export default function SynthesisHUD() {
  const { id } = useParams<{ id: string }>();
  const { run, trace, intent, stages, usingFixture, connected, error } =
    useSynthesisRun(id);

  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (run.status === "completed" || run.status === "failed") return;
    const t = window.setInterval(() => setElapsed((x) => x + 100), 100);
    return () => window.clearInterval(t);
  }, [run.status]);

  const [selectedFrame, setSelectedFrame] = useState(0);
  const keyframes: Keyframe[] = DEMO_KEYFRAMES;

  const scriptLines =
    run.gemini_flash_trace?.split("\n").filter(Boolean) ?? DEMO_SCRIPT_LINES;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`0:20 — 1:20 · synthesize · run-${run.id.slice(0, 8)}`}
        title="Synthesis HUD"
        description="Three Gemini stages turn a 60-second recording into a pinned TinyFish script. Watch the tool-calls stream in real time."
        actions={
          <>
            <StatusPill
              connected={connected}
              usingFixture={usingFixture}
              error={error}
            />
            <span className="rounded-md border border-border bg-elevated px-2.5 py-1.5 font-mono text-[12px] tabular-nums text-muted-foreground">
              {formatDuration(elapsed)}
            </span>
          </>
        }
      />

      <div
        className={cn(
          "grid gap-4",
          "grid-cols-1",
          "lg:grid-cols-[320px_minmax(0,1fr)_360px]"
        )}
      >
        <section
          className="flex flex-col gap-4"
          aria-label="Pipeline stages"
        >
          {stages.map((stage, i) => (
            <GeminiStageCard
              key={stage.key}
              index={i + 1}
              title={stage.title}
              modelId={stage.modelId}
              thinkingLevel={stage.thinkingLevel}
              state={stage.state}
              elapsedSeconds={stage.elapsedSeconds}
              tokenCount={stage.tokenCount}
              toolCalls={stage.toolCalls}
              placeholder={stage.placeholder}
              footer={stage.footer}
              variant={stage.variant}
            />
          ))}
        </section>

        <section className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardContent className="space-y-3 p-4">
              <header className="flex items-baseline justify-between gap-2">
                <h2 className="text-[14px] font-semibold text-foreground">
                  Keyframes
                </h2>
                <span className="font-mono text-[11px] text-muted-foreground">
                  scene-change · 60 raw → {keyframes.length} key
                </span>
              </header>
              <KeyframeRibbon
                frames={keyframes}
                selected={selectedFrame}
                onSelect={setSelectedFrame}
              />
            </CardContent>
          </Card>

          <Card className="flex min-h-[340px] flex-1 flex-col overflow-hidden">
            <ScriptPanel lines={scriptLines} />
          </Card>
        </section>

        <section className="flex flex-col gap-4" aria-label="Intent tree">
          <Card>
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[14px] font-semibold text-foreground">
                  Intent abstraction
                </h2>
                <Badge variant="primary">{intent.steps.length} steps</Badge>
              </div>
              <IntentTree intent={intent} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <TraceTail events={trace} />
            </CardContent>
          </Card>

          <Link to={`/synthesize/${run.id}/dream-query`} className="w-full">
            <Button variant="secondary" size="lg" className="w-full">
              Open Cosmo Dream Query
              <ArrowRight className="size-4" />
            </Button>
          </Link>
        </section>
      </div>
    </div>
  );
}

function StatusPill({
  connected,
  usingFixture,
  error,
}: {
  connected: boolean;
  usingFixture: boolean;
  error: Error | null;
}) {
  if (error && !usingFixture) {
    return (
      <Badge variant="destructive">
        <WifiOff className="size-3" /> error
      </Badge>
    );
  }
  if (usingFixture) {
    return (
      <Badge variant="warning">
        <Radio className="size-3" /> demo fixture
      </Badge>
    );
  }
  return connected ? (
    <Badge variant="success">
      <Radio className="size-3" /> live · SSE
    </Badge>
  ) : (
    <Badge variant="warning">
      <WifiOff className="size-3" /> reconnecting
    </Badge>
  );
}

function TraceTail({ events }: { events: TraceEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="space-y-2">
        <h3 className="text-[13px] font-medium text-foreground">Trace</h3>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-full" />
        ))}
      </div>
    );
  }
  return (
    <div>
      <h3 className="mb-2 text-[13px] font-medium text-foreground">
        Trace
        <span className="ml-2 font-mono text-[10px] text-muted-foreground">
          {events.length} events
        </span>
      </h3>
      <ScrollArea className="max-h-[180px]">
        <ol className="space-y-1 pr-2">
          {events.map((ev, i) => (
            <li
              key={i}
              className="flex gap-2 font-mono text-[11px] leading-[1.5]"
            >
              <span className="shrink-0 text-faint tabular-nums">
                {relativeTime(ev.ts)}
              </span>
              <Badge variant="outline" className="h-4 shrink-0 px-1 text-[9px]">
                {ev.stage}
              </Badge>
              <span className="min-w-0 text-muted-foreground">
                {ev.message}
              </span>
            </li>
          ))}
        </ol>
      </ScrollArea>
      <Separator className="mt-3" />
    </div>
  );
}
