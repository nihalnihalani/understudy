import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...parts: ClassValue[]): string {
  return twMerge(clsx(parts));
}
