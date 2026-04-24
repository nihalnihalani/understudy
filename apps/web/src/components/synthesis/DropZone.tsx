import { useCallback, useRef, useState, type DragEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
    <motion.label
      htmlFor="recording-file-input"
      onDragOver={(e: DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      initial={false}
      animate={{
        scale: dragOver ? 1.02 : 1,
        borderColor: dragOver ? "hsl(var(--primary))" : "hsl(var(--border))",
        backgroundColor: dragOver ? "hsl(var(--primary) / 0.05)" : "hsl(var(--surface))",
      }}
      whileHover={{ borderColor: "hsl(var(--border-strong))" }}
      className={cn(
        "relative flex cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border px-8 py-10 text-center",
        "transition-shadow duration-500 ease-out",
        "focus-within:ring-2 focus-within:ring-ring",
        dragOver && "shadow-[0_0_50px_hsl(var(--primary)/0.15)]"
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

      <motion.div
        animate={{
          scale: dragOver ? 1.1 : 1,
          backgroundColor: dragOver ? "hsl(var(--primary) / 0.1)" : "hsl(var(--elevated))",
          color: dragOver ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
        }}
        className={cn(
          "flex h-16 w-16 items-center justify-center rounded-full border border-border-strong shadow-sm",
          dragOver && "shadow-[0_0_30px_hsl(var(--primary)/0.2)]"
        )}
        aria-hidden
      >
        <AnimatePresence mode="wait">
          {dragOver ? (
            <motion.div
              key="video"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
            >
              <FileVideo className="size-7" />
            </motion.div>
          ) : (
            <motion.div
              key="upload"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
            >
              <UploadCloud className="size-7" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <div className="space-y-2">
        <h2 className="text-[24px] font-semibold leading-tight tracking-tight text-foreground">
          Drop a 60-second web workflow recording
        </h2>
        <p className="mx-auto max-w-[52ch] text-[14px] text-muted-foreground">
          Scene-change keyframing trims this to 5–8 frames before Gemini 3.1
          Flash-Lite reads it. Drag a .mp4 here or click to browse.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Badge variant="outline" className="text-[12px]">video/mp4</Badge>
        <Badge variant="outline" className="text-[12px]">max 200 MB</Badge>
        <Badge variant="outline" className="text-[12px]">≤ 60s recommended</Badge>
      </div>

      <div className="flex items-center gap-2 text-[12px] text-faint">
        <Kbd>Space</Kbd>
        <span>or drop anywhere in this area</span>
      </div>
    </motion.label>
  );
}
