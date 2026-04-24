// In-browser screen recording for synthesis ingest.
// Uses getDisplayMedia + MediaRecorder; on stop, hands the recorded
// Blob to the parent as a File via onRecorded(file). Auto-stops at
// MAX_SECONDS so the user can't accidentally record a 5-minute clip
// the API will reject.

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Circle, Square, ScreenShare, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAX_SECONDS = 90;

interface ScreenRecorderProps {
  onRecorded: (file: File) => void;
  disabled?: boolean;
}

export function ScreenRecorder({ onRecorded, disabled }: ScreenRecorderProps) {
  const [state, setState] = useState<"idle" | "recording" | "stopping">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<number | null>(null);

  const supported =
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getDisplayMedia === "function" &&
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined";

  const cleanup = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const stop = useCallback(() => {
    if (state !== "recording") return;
    setState("stopping");
    recorderRef.current?.stop();
  }, [state]);

  const start = useCallback(async () => {
    setError(null);
    setElapsed(0);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 15 },
        audio: false,
      });
    } catch (e) {
      const msg =
        e instanceof Error && e.name === "NotAllowedError"
          ? "Screen capture cancelled."
          : e instanceof Error
          ? e.message
          : "Could not start screen capture.";
      setError(msg);
      return;
    }

    // Pick the best mime the browser supports for MediaRecorder.
    const candidates = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
      "video/mp4",
    ];
    const mimeType =
      candidates.find((m) =>
        typeof MediaRecorder.isTypeSupported === "function"
          ? MediaRecorder.isTypeSupported(m)
          : false
      ) ?? "";

    let recorder: MediaRecorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      setError(e instanceof Error ? e.message : "MediaRecorder rejected the stream.");
      return;
    }

    chunksRef.current = [];
    streamRef.current = stream;
    recorderRef.current = recorder;

    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
    };
    recorder.onstop = () => {
      const usedMime = recorder.mimeType || mimeType || "video/webm";
      const ext = usedMime.includes("mp4") ? "mp4" : "webm";
      const blob = new Blob(chunksRef.current, { type: usedMime });
      const file = new File([blob], `screen-${Date.now()}.${ext}`, {
        type: usedMime,
      });
      cleanup();
      setState("idle");
      setElapsed(0);
      if (file.size > 0) onRecorded(file);
    };

    // If the user picks "Stop sharing" in the browser bar, we should stop too.
    stream.getVideoTracks()[0]?.addEventListener("ended", () => {
      if (recorder.state !== "inactive") recorder.stop();
    });

    if (previewRef.current) {
      previewRef.current.srcObject = stream;
      previewRef.current.play().catch(() => undefined);
    }

    recorder.start(1000); // 1s timeslices keep chunks reasonable
    setState("recording");
    timerRef.current = window.setInterval(() => {
      setElapsed((s) => {
        const next = s + 1;
        if (next >= MAX_SECONDS) {
          stop();
        }
        return next;
      });
    }, 1000);
  }, [cleanup, onRecorded, stop]);

  if (!supported) {
    return (
      <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[12px] text-warning flex items-center gap-2">
        <AlertCircle className="size-3.5" />
        Screen recording requires a Chromium- or Firefox-based browser with
        getDisplayMedia support.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <AnimatePresence mode="wait">
        {state !== "idle" && (
          <motion.div
            key="preview"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="relative overflow-hidden rounded-lg border border-border bg-black"
          >
            <video
              ref={previewRef}
              className="h-44 w-full object-contain"
              muted
              playsInline
            />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-3 py-2 font-mono text-[11px]">
              <span className="inline-flex items-center gap-2 text-destructive">
                <Circle className="size-2 animate-pulse fill-destructive" />
                REC · {String(elapsed).padStart(2, "0")}s
              </span>
              <span className="text-muted-foreground">
                auto-stop at {MAX_SECONDS}s
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-2">
        {state === "idle" ? (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={start}
            disabled={disabled}
          >
            <ScreenShare className="size-3.5" />
            Record screen
          </Button>
        ) : (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={stop}
            disabled={state === "stopping"}
          >
            <Square className="size-3.5 fill-current" />
            {state === "stopping" ? "Saving…" : "Stop"}
          </Button>
        )}
        <span
          className={cn(
            "font-mono text-[11px]",
            state === "idle" ? "text-faint" : "text-muted-foreground"
          )}
        >
          {state === "idle"
            ? "Captures a tab, window, or full screen → webm at 15fps"
            : `${MAX_SECONDS - elapsed}s remaining`}
        </span>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive"
        >
          {error}
        </div>
      )}
    </div>
  );
}
