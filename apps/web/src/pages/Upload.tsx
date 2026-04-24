// UPLOAD — beat 0:00-0:20. Drops a .mp4, probes first-frame thumb + duration
// locally, POSTs to /synthesize, navigates to the HUD. Historical recordings
// don't have a real API yet; we surface recent AGENTS as the closest proxy.
//
// Data shape: POST /synthesize -> SynthesizeAccepted (apps/api/schemas.py).

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileVideo, Clock, Sparkles, Info } from "lucide-react";
import { PageHeader } from "@/layouts/AppShell";
import { uploadRecording, ApiError, api } from "@/api/client";
import { DropZone } from "@/components/synthesis/DropZone";
import {
  UploadProgress,
  type StagedFile,
} from "@/components/synthesis/UploadProgress";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { Agent } from "@/api/types";

export default function Upload() {
  const nav = useNavigate();
  const [staged, setStaged] = useState<StagedFile | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stage = useCallback(async (file: File) => {
    setError(null);
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = url;
    video.muted = true;
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      video.onloadedmetadata = done;
      video.onerror = done;
    });
    const thumb = await captureThumb(video).catch(() => undefined);
    setStaged({
      file,
      durationSeconds: Number.isFinite(video.duration)
        ? video.duration
        : undefined,
      width: video.videoWidth || undefined,
      height: video.videoHeight || undefined,
      thumbDataUrl: thumb,
    });
    URL.revokeObjectURL(url);
  }, []);

  const startSynthesis = useCallback(async () => {
    if (!staged) return;
    setUploading(true);
    setProgress(0);
    setError(null);
    try {
      const res = await uploadRecording(staged.file, setProgress);
      toast.success("Synthesis kicked off", {
        description: `run-${res.synthesis_run_id.slice(0, 8)}`,
      });
      nav(`/synthesize/${res.synthesis_run_id}`);
    } catch (e) {
      setUploading(false);
      const message =
        e instanceof ApiError
          ? `${e.status}: ${e.message}`
          : e instanceof Error
          ? e.message
          : "upload failed";
      setError(message);
      toast.error("Upload failed", { description: message });
    }
  }, [staged, nav]);

  const cancel = useCallback(() => {
    setStaged(null);
    setProgress(0);
    setUploading(false);
    setError(null);
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="0:00 — 0:20 · record"
        title="Upload a web workflow recording"
        description="Drop a 60-second capture of the task you want an agent to learn. The synthesis pipeline converts it into a pinned, reproducible script."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-4">
          {!staged ? (
            <DropZone
              onFileSelect={stage}
              onError={(msg) => {
                setError(msg);
                toast.error("Invalid recording", { description: msg });
              }}
            />
          ) : (
            <UploadProgress
              staged={staged}
              progress={progress}
              uploading={uploading}
              onCancel={cancel}
              onStart={startSynthesis}
            />
          )}

          {error && (
            <div
              role="alert"
              className={cn(
                "rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2",
                "text-[13px] text-destructive"
              )}
            >
              {error}
            </div>
          )}

          <PipelinePreview />
        </section>

        <aside aria-label="Recent recordings">
          <RecentRecordings />
        </aside>
      </div>
    </div>
  );
}

function PipelinePreview() {
  const stages = [
    {
      label: "Action detection",
      model: "gemini-3-flash-lite",
      note: "4 tool_calls emitted per keyframe",
    },
    {
      label: "Intent abstraction",
      model: "gemini-3-pro",
      note: "thinking_level: high",
    },
    {
      label: "Script emission",
      model: "gemini-3-flash",
      note: "emits @tinyfish/cli TypeScript",
    },
  ];
  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <h3 className="text-[14px] font-semibold text-foreground">
            What happens next
          </h3>
        </div>
        <ol className="space-y-3">
          {stages.map((s, i) => (
            <li key={s.label} className="flex gap-3">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-border bg-elevated font-mono text-[10px] text-muted-foreground">
                {i + 1}
              </span>
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-foreground">
                  {s.label}
                </div>
                <div className="font-mono text-[11px] text-muted-foreground">
                  {s.model} · {s.note}
                </div>
              </div>
            </li>
          ))}
        </ol>
        <Separator className="my-4" />
        <div className="flex items-start gap-2 font-mono text-[11px] text-muted-foreground">
          <Info className="mt-0.5 size-3 text-faint" />
          <span>
            60 frames → 8 keyframes via OpenCV scene-change, ~10× token
            reduction before Gemini ever sees the video.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function RecentRecordings() {
  // TODO: live-wire to a dedicated /recordings endpoint once the backend
  // exposes one. For now, agents are a close proxy — each agent was born
  // from a recording, so surfacing them keeps the right-rail informative.
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listAgents()
      .then((list) => !cancelled && setAgents(list.slice(0, 6)))
      .catch((e) => {
        if (cancelled) return;
        setAgents([]);
        setErr(e instanceof Error ? e.message : "failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card className="sticky top-20">
      <CardContent className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileVideo className="size-4 text-muted-foreground" />
            <h3 className="text-[14px] font-semibold text-foreground">
              Recent recordings
            </h3>
          </div>
          <Badge variant="outline" className="text-faint">
            via /agents
          </Badge>
        </div>

        {agents === null && (
          <ul className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i} className="flex items-center gap-2">
                <Skeleton className="size-8 rounded-md" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-2 w-1/2" />
                </div>
              </li>
            ))}
          </ul>
        )}

        {agents && agents.length === 0 && (
          <p className="text-[12px] text-muted-foreground">
            {err ?? "No recordings yet — drop an .mp4 to get started."}
          </p>
        )}

        {agents && agents.length > 0 && (
          <ul className="space-y-1.5">
            {agents.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left",
                    "transition-colors duration-fast hover:bg-elevated",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  )}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-elevated text-muted-foreground">
                    <FileVideo className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-[11px] text-foreground">
                      {a.ams_namespace.replace("ams:agent:", "")}
                    </div>
                    <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                      <Clock className="size-2.5" />
                      <span className="truncate">
                        {a.graphql_endpoint.replace("https://", "")}
                      </span>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        <Separator className="my-3" />
        <p className="font-mono text-[10px] leading-[1.5] text-faint">
          TODO: live-wire /recordings endpoint · this list approximates history
          from the agents registry.
        </p>
      </CardContent>
    </Card>
  );
}

async function captureThumb(video: HTMLVideoElement): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const seek = Math.min(0.1, video.duration || 0.1);
    const onSeeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 180;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no canvas context"));
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.6));
      } catch (e) {
        reject(e);
      }
    };
    video.addEventListener("seeked", onSeeked, { once: true });
    try {
      video.currentTime = seek;
    } catch (e) {
      reject(e);
    }
  });
}
