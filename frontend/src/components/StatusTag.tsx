import { statusTag } from "../lib/utils";
import { t } from "../lib/i18n";

export default function StatusTag({ value }: { value: string | null | undefined }) {
  const kind = statusTag(value);
  const labels = t().status as Record<string, string>;
  const label = labels[value ?? ""] ?? value ?? "-";
  const cls = kind === "good" ? "tag-good" : kind === "warn" ? "tag-warn" : kind === "bad" ? "tag-bad" : "tag-default";
  return <span className={cls}>{label}</span>;
}
