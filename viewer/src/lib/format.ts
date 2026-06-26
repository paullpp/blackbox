/** mm:ss.mmm relative timestamp. */
export function fmtTime(ms: number): string {
  const total = Math.max(0, ms);
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const millis = Math.floor(total % 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(
    millis,
  ).padStart(3, "0")}`;
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function fmtDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/** Last path segment (or host) of a URL, for compact display. */
export function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    return (last || u.hostname) + (u.search ? u.search : "");
  } catch {
    return url;
  }
}

export function statusClass(status: number): string {
  if (status === 0) return "net-pending";
  if (status >= 500) return "net-5xx";
  if (status >= 400) return "net-4xx";
  if (status >= 300) return "net-3xx";
  return "net-2xx";
}
