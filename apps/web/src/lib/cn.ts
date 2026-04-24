import clsx, { type ClassValue } from "clsx";

export function cn(...parts: ClassValue[]): string {
  return clsx(parts);
}
