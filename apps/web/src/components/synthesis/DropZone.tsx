import { useCallback, useRef, useState, type DragEvent } from "react";
import { UploadCloud, FileVideo } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/kbd";

interface DropZoneProps {
  accept?: string;
  maxBytes?: number;
  onFileSelect: (file: File) => void;
  onError?: (message: string) => void;
}

export function DropZone({
  accept = "video/mp4",
  maxBytes = 200 * 1024 * 1024,
  onFileSelect,
  onError,
}: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const validate = useCallback(
    (file: File): string | null => {
      if (accept && file.type && file.type !== accept) {
        return `Expected ${accept}, got ${file.type || "unknown"}.`;
      }
      if (file.size > maxBytes) {
        const mb = (file.size / 1024 / 1024).toFixed(1);
        const cap = Math.round(maxBytes / 1024 / 1024);
        return `${mb} MB exceeds the ${cap} MB cap.`;
      }
      return null;
    },
    [accept, maxBytes]
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      const err = validate(file);
      if (err) {
        onError?.(err);
        return;
      }
      onFileSelect(file);
    },
    [validate, onError, onFileSelect]
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      setDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  return (
    <label
      htmlFor="recording-file-input"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={cn(
        "relative flex cursor-pointer flex-col items-center justify-center gap-5 rounded-xl border-2 border-dashed border-border-strong bg-surface p-14 text-center",
        "transition-colors duration-fast",
        "hover:border-primary/60 hover:bg-elevated/40",
        "focus-within:border-primary focus-within:ring-2 focus-within:ring-ring",
        dragOver &&
          "border-primary bg-primary/5 ring-2 ring-primary/30 shadow-[0_0_0_6px_hsl(var(--primary)/0.08)]"
      )}
      aria-label="Drop a video recording to upload"
    >
      <input
        ref={inputRef}
        id="recording-file-input"
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div
        className={cn(
          "flex h-16 w-16 items-center justify-center rounded-full border border-border-strong bg-elevated text-muted-foreground",
          "transition-colors duration-fast",
          dragOver && "border-primary/60 bg-primary/10 text-primary"
        )}
        aria-hidden
      >
        {dragOver ? (
          <FileVideo className="size-7" />
        ) : (
          <UploadCloud className="size-7" />
        )}
      </div>

      <div className="space-y-2">
        <h2 className="text-[20px] font-semibold leading-tight tracking-tight text-foreground">
          Drop a 60-second web workflow recording
        </h2>
        <p className="mx-auto max-w-[52ch] text-[13px] text-muted-foreground">
          Scene-change keyframing trims this to 5–8 frames before Gemini 3.1
          Flash-Lite reads it. Drag a .mp4 here or click to browse.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Badge variant="outline">video/mp4</Badge>
        <Badge variant="outline">max 200 MB</Badge>
        <Badge variant="outline">≤ 60s recommended</Badge>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-faint">
        <Kbd>Space</Kbd>
        <span>or drop anywhere in this area</span>
      </div>
    </label>
  );
}
