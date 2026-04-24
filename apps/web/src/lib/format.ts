export function truncateDigest(digest: string, head = 8, tail = 4): string {
  if (!digest) return "";
  if (digest.length <= head + tail + 3) return digest;
  return `${digest.slice(0, head)}…${digest.slice(-tail)}`;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms));
  const mm = Math.floor(total / 60000);
  const ss = Math.floor((total % 60000) / 1000);
  const msec = total % 1000;
  return `${mm.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}.${msec
    .toString()
    .padStart(3, "0")}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const delta = Math.max(0, now - then);
  if (delta < 60_000) return `${Math.floor(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return `${Math.floor(delta / 86_400_000)}d ago`;
}
