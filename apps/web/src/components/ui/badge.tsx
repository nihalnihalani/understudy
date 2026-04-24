import { type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-[11px] font-normal leading-[1.5] transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-border bg-elevated text-muted-foreground",
        primary:
          "border-primary/40 bg-primary/10 text-primary-soft",
        success:
          "border-success/35 bg-success/10 text-success",
        warning:
          "border-warning/35 bg-warning/10 text-warning",
        destructive:
          "border-destructive/35 bg-destructive/10 text-destructive",
        accent:
          "border-accent/35 bg-accent/10 text-accent",
        outline: "border-border-strong bg-transparent text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, className }))} {...props} />
  );
}

export { badgeVariants };
