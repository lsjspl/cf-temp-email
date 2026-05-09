import { ReactNode, useEffect, useRef } from "react";

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  onConfirm?: () => void;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  loading?: boolean;
  children: ReactNode;
}

export default function Modal({ open, title, onClose, onConfirm, confirmText = "确认", cancelText = "取消", danger, loading, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      const first = ref.current?.querySelector<HTMLElement>("input, select, textarea, button[data-focus]");
      first?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={onClose}>
      <div
        ref={ref}
        className={`card w-full max-w-md overflow-hidden animate-in zoom-in-95 ${danger ? "border-danger/30" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-2">
          <h2 className={`text-lg font-semibold ${danger ? "text-red-200" : ""}`}>{title}</h2>
        </div>
        <div className="px-5 pb-4 text-sm text-muted">{children}</div>
        <div className="px-5 pb-5 flex justify-end gap-2.5">
          <button className="btn-ghost text-sm" onClick={onClose}>{cancelText}</button>
          {onConfirm && (
            <button
              className={`${danger ? "btn-danger" : "btn-primary"} text-sm`}
              onClick={onConfirm}
              disabled={loading}
            >
              {loading ? "..." : confirmText}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
