import { cn } from "@/lib/utils";

interface LushGradientProps {
  className?: string;
  children: React.ReactNode;
}

export const LushGradient = ({ className, children }: LushGradientProps) => {
  return (
    <div
      className={cn(
        "relative rounded-xl overflow-hidden bg-surface border border-border/50",
        className
      )}
    >
      <div className="absolute inset-0 z-0 opacity-20">
        <div className="absolute -left-[20%] -top-[20%] h-[150%] w-[150%] animate-[spin_20s_linear_infinite] bg-[conic-gradient(from_0deg,hsl(var(--brand-indigo)),hsl(var(--brand-purple)),hsl(var(--brand-pink)),hsl(var(--brand-indigo)))] [mask-image:radial-gradient(circle,white,transparent_70%)]" />
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
};
