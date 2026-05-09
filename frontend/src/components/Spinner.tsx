export default function Spinner({ size = "md", className = "" }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const s = size === "sm" ? "w-4 h-4" : size === "lg" ? "w-10 h-10" : "w-6 h-6";
  return <div className={`${s} border-2 border-accent/30 border-t-accent rounded-full animate-spin ${className}`} />;
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <Spinner size="lg" />
    </div>
  );
}

export function InlineLoader({ text = "加载中..." }: { text?: string }) {
  return (
    <div className="flex items-center gap-2 text-muted text-sm py-8 justify-center">
      <Spinner size="sm" />
      <span>{text}</span>
    </div>
  );
}
