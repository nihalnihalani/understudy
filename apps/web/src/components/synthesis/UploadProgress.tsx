import { Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatBytes } from "@/lib/format";

export interface StagedFile {
  file: File;
  durationSeconds?: number;
  width?: number;
  height?: number;
  thumbDataUrl?: string;
}

interface UploadProgressProps {
  staged: StagedFile;
  progress: number;
  uploading: boolean;
  onCancel: () => void;
  onStart: () => void;
}

export function UploadProgress({
  staged,
  progress,
  uploading,
  onCancel,
  onStart,
}: UploadProgressProps) {
  const complete = progress >= 100;

  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div
          className={cn(
            "relative h-[90px] w-[160px] shrink-0 overflow-hidden rounded-md border border-border bg-elevated",
            "flex items-center justify-center"
          )}
        >
          {staged.thumbDataUrl ? (
            <img
              src={staged.thumbDataUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="font-mono text-[10px] text-faint">no preview</span>
          )}
          {staged.durationSeconds !== undefined && (
            <span className="absolute bottom-1 right-1 rounded-xs bg-background/80 px-1.5 py-0.5 font-mono text-[10px] text-foreground">
              {staged.durationSeconds.toFixed(1)}s
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px] font-medium text-foreground">
              {staged.file.name}
            </span>
            {complete && (
              <Badge variant="success">
                <CheckCircle2 className="size-3" /> uploaded
              </Badge>
            )}
          </div>
          <div className="mt-1 font-mono text-[11px] text-muted-foreground">
            {staged.width ? `${staged.width}×${staged.height} · ` : ""}
            {formatBytes(staged.file.size)}
            {" · "}
            {staged.file.type || "video/mp4"}
          </div>

          <div className="mt-3 space-y-1.5">
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-border">
              <div
                className={cn(
                  "absolute inset-y-0 left-0 rounded-full bg-primary",
                  "transition-[width] duration-base"
                )}
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                aria-label="Upload progress"
              />
            </div>
            <div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground">
              <span className="truncate">
                {uploading
                  ? `uploading to s3://understudy-recordings/ … ${progress}%`
                  : "ready to synthesize"}
              </span>
              <span className="tabular-nums">{progress}%</span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 gap-2 sm:flex-col">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={uploading}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={onStart} disabled={uploading}>
            {uploading ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Uploading…
              </>
            ) : (
              "Start synthesis"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
