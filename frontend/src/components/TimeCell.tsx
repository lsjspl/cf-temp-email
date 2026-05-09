import { formatTime, relativeTime } from "../lib/utils";

export default function TimeCell({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-muted">-</span>;
  const abs = formatTime(value);
  const rel = relativeTime(value);
  return (
    <span className="inline-flex flex-col gap-0.5" title={abs}>
      <span className="text-sm">{abs}</span>
      {rel && <span className="text-xs text-muted">{rel}</span>}
    </span>
  );
}
