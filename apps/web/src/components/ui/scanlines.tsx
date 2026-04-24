import { cn } from "@/lib/utils";

export const Scanlines = ({ className }: { className?: string }) => {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-10 overflow-hidden",
        className
      )}
    >
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.03),rgba(0,255,0,0.01),rgba(0,0,255,0.03))] bg-[size:100%_4px,3px_100%]" />
      <div className="absolute inset-0 animate-[scan_8s_linear_infinite] bg-gradient-to-b from-transparent via-white/[0.02] to-transparent" />
    </div>
  );
};
