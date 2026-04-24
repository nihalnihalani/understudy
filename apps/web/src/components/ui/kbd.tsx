import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Keyboard key label — tiny monospace chip used in menus, command palette hints,
 * and tooltips. Use instead of raw "⌘K" strings so every hotkey renders identically.
 */
export function Kbd({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[18px] select-none items-center rounded-xs border border-border-strong bg-elevated px-1.5",
        "font-mono text-[10px] font-medium leading-none text-muted-foreground",
        className
      )}
      {...props}
    >
      {children}
    </kbd>
  );
}
