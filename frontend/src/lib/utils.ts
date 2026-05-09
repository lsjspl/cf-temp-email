export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(diff);
  const future = diff < 0;
  if (abs < 60000) return future ? "即将" : "刚刚";
  if (abs < 3600000) { const m = Math.floor(abs / 60000); return future ? `${m}分钟后` : `${m}分钟前`; }
  if (abs < 86400000) { const h = Math.floor(abs / 3600000); return future ? `${h}小时后` : `${h}小时前`; }
  const d = Math.floor(abs / 86400000);
  return future ? `${d}天后` : `${d}天前`;
}

/** 格式化时间：绝对时间 + 相对时间 */
export function formatTimeWithRelative(iso: string | null | undefined): { absolute: string; relative: string } {
  return { absolute: formatTime(iso), relative: relativeTime(iso) };
}

export function statusTag(value: string | boolean | null | undefined): "good" | "warn" | "bad" | "default" {
  if (["active", "ok", "admin", "ready"].includes(String(value))) return "good";
  if (["pending"].includes(String(value))) return "warn";
  if (["disabled", "failed", "revoked", "missing", "incomplete"].includes(String(value))) return "bad";
  return "default";
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
