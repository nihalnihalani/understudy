import { cn } from "@/lib/utils";

interface ShinyTextProps {
  children: React.ReactNode;
  className?: string;
  shimmerWidth?: number;
  duration?: number;
}

export const ShinyText = ({
  children,
  className,
  shimmerWidth = 100,
  duration = 2,
}: ShinyTextProps) => {
  return (
    <span
      style={
        {
          "--shiny-width": `${shimmerWidth}px`,
          "--duration": `${duration}s`,
        } as React.CSSProperties
      }
      className={cn(
        "mx-auto max-w-md text-neutral-600/50 dark:text-neutral-400/50",

        // Shimmer effect
        "animate-shiny-text bg-clip-text bg-no-repeat [background-position:0_0] [background-size:var(--shiny-width)_100%] [transition:background-position_1s_cubic-bezier(.6,.6,0,1)]",

        // Shimmer gradient
        "bg-gradient-to-r from-transparent via-foreground via-50% to-transparent",

        className
      )}
    >
      {children}
    </span>
  );
};
