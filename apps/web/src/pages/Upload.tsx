// UPLOAD screen — beat 0:00-0:20 (the record-capture preamble).
// Drops a .mp4, previews the first frame, POSTs to /synthesize, routes to HUD.
// Data shape: POST /synthesize -> SynthesizeAccepted (apps/api/schemas.py).

import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { uploadRecording, ApiError } from "@/api/client";
import { formatBytes } from "@/lib/format";
import { MeterBar } from "@/components/MeterBar";
import { cn } from "@/lib/cn";

interface Staged {
  file: File;
  durationSeconds?: number;
  width?: number;
  height?: number;
  thumbDataUrl?: string;
}

export default function Upload() {
  const nav = useNavigate();
  const [staged, setStaged] = useState<Staged | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const stage = useCallback(async (file: File) => {
    setErr(null);
    if (file.type && file.type !== "video/mp4") {
      setErr(`expected video/mp4, got ${file.type}`);
      return;
    }
    if (file.size > 200 * 1024 * 1024) {
      setErr(`${formatBytes(file.size)} > 200 MB cap`);
      return;
    }
    // Probe the mp4 for duration + first-frame thumb (no server round-trip).
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = url;
    video.muted = true;
    await new Promise<void>((resolve) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => resolve();
    });
    const thumb = await captureThumb(video).catch(() => undefined);
    setStaged({
      file,
      durationSeconds: isFinite(video.duration) ? video.duration : undefined,
      width: video.videoWidth || undefined,
      height: video.videoHeight || undefined,
      thumbDataUrl: thumb,
    });
    URL.revokeObjectURL(url);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      const f = e.dataTransfer.files?.[0];
      if (f) void stage(f);
    },
    [stage]
  );

  const startSynthesis = useCallback(async () => {
    if (!staged) return;
    setUploading(true);
    setProgress(0);
    setErr(null);
    try {
      const res = await uploadRecording(staged.file, setProgress);
      nav(`/synthesize/${res.synthesis_run_id}`);
    } catch (e) {
      setUploading(false);
      setErr(
        e instanceof ApiError
          ? `${e.status}: ${e.message}`
          : e instanceof Error
          ? e.message
          : "upload failed"
      );
    }
  }, [staged, nav]);

  return (
    <div className="max-w-[860px] mx-auto py-2">
      {/* TRUE-style hero */}
      <header className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-10 items-end pb-10 mb-8 border-b border-border-subtle">
        <div>
          <div className="section-tag mb-4">Mission Brief — 001</div>
          <h1 className="font-display font-normal leading-[0.9] tracking-[-0.035em] text-[clamp(48px,7vw,96px)] m-0 text-fg [font-variation-settings:'opsz'_144,'SOFT'_20]">
            Show it <em className="font-display-italic [font-variation-settings:'opsz'_144,'SOFT'_100]">once.</em><br />
            <span className="text-fg-dim italic [font-variation-settings:'opsz'_144,'SOFT'_100]">Understudy</span> takes over.
          </h1>
        </div>
        <p className="max-w-[360px] text-[14px] leading-[1.6] text-fg-muted border-l border-border-strong pl-5 pb-2">
          Drop a 60-second screen recording.{" "}
          <strong className="text-fg font-medium">Three Gemini models</strong>{" "}
          synthesize a signed, federated, deployed web agent in ~90 seconds.
          Every artifact is replayable, signed, and verifiable.
        </p>
      </header>

      {!staged && (
        <label
          htmlFor="file-input"
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          className={cn(
            "block border border-dashed p-16 text-center cursor-pointer transition-colors",
            "border-border-strong hover:border-accent-amber bg-canvas-panel/40 hover:bg-primary-soft"
          )}
          aria-label="Drop an mp4 recording here"
        >
          <input
            ref={inputRef}
            id="file-input"
            type="file"
            accept="video/mp4"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void stage(f);
            }}
          />
          <div className="flex flex-col items-center gap-5">
            <div className="brand-mark w-14 h-14 text-[26px]">▶</div>
            <div className="font-display text-[28px] leading-tight tracking-[-0.01em] text-fg [font-variation-settings:'opsz'_36,'SOFT'_30]">
              Drop your <em className="font-display-italic [font-variation-settings:'opsz'_144,'SOFT'_100]">.mp4</em> recording
            </div>
            <div className="text-[13px] text-fg-muted max-w-md leading-[1.6]">
              60 seconds or less. Scene-change keyframing will cut this to 5–8
              frames before Gemini 3.1 Flash-Lite sees it.
            </div>
            <div className="chip mt-2">max 200 MB · video/mp4</div>
          </div>
        </label>
      )}

      {staged && (
        <section className="card p-4 flex items-center gap-4" aria-label="Staged recording">
          <div className="w-[96px] h-[54px] bg-canvas-elevated rounded border border-border-subtle overflow-hidden flex items-center justify-center">
            {staged.thumbDataUrl ? (
              <img
                src={staged.thumbDataUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-fg-faint text-mono-xs">no preview</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-medium truncate">
              {staged.file.name}
            </div>
            <div className="text-mono-base font-mono text-fg-muted mt-1">
              {staged.durationSeconds
                ? `${staged.durationSeconds.toFixed(1)}s`
                : "—"}
              {" · "}
              {staged.width ? `${staged.width}×${staged.height}` : "resolution tbd"}
              {" · "}
              {formatBytes(staged.file.size)}
            </div>
            <div className="mt-2">
              <MeterBar
                value={progress}
                tone={progress === 100 ? "emerald" : "indigo"}
                label="upload progress"
                className="h-1"
              />
              <div className="mt-1.5 text-mono-sm font-mono text-fg-muted truncate">
                {uploading
                  ? `Uploading to /synthesize…  ${progress}%`
                  : "Ready. Click Start synthesis to kick off the 3-Gemini pipeline."}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setStaged(null);
                setProgress(0);
                setUploading(false);
                setErr(null);
              }}
              disabled={uploading}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={startSynthesis}
              disabled={uploading}
            >
              {uploading ? "Uploading…" : "Start synthesis"}
            </button>
          </div>
        </section>
      )}

      {err && (
        <div
          className="mt-4 border border-accent-crimson/40 bg-accent-crimson/5 text-accent-crimson text-[13px] rounded px-3 py-2"
          role="alert"
        >
          {err}
        </div>
      )}

      <footer className="mt-10 flex items-center justify-between text-mono-sm font-mono text-fg-faint">
        <span>pipeline: flash-lite → 3.1 pro → 3 flash</span>
        <span>SLSA L2 · Chainguard · cosign</span>
      </footer>
    </div>
  );
}

async function captureThumb(video: HTMLVideoElement): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const seek = Math.min(0.1, video.duration || 0.1);
    const onSeeked = () => {
      try {
        const c = document.createElement("canvas");
        c.width = video.videoWidth || 192;
        c.height = video.videoHeight || 108;
        const ctx = c.getContext("2d");
        if (!ctx) return reject(new Error("no ctx"));
        ctx.drawImage(video, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.6));
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
