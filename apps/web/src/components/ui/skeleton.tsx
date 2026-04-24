import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-elevated",
        "relative overflow-hidden before:absolute before:inset-0",
        "before:-translate-x-full before:animate-[shimmer_1.6s_infinite]",
        "before:bg-gradient-to-r before:from-transparent before:via-border-strong/50 before:to-transparent",
        className
      )}
      {...props}
    />
  );
}
