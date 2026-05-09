import { ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  trigger?: ReactNode;
  children: ReactNode;
}

export default function Dropdown({ trigger, children }: Props) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (btnRef.current?.contains(e.target as Node)) return;
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + 4,
      left: Math.max(8, rect.right - 160),
    });
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        className="btn-ghost !px-3 !py-2 !text-sm !min-h-0"
        onClick={() => setOpen(!open)}
      >
        {trigger ?? "操作 ▾"}
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          className="fixed min-w-[140px] bg-panel-strong border border-line-strong rounded-md shadow-lg z-[9999] overflow-hidden"
          style={{ top: pos.top, left: pos.left }}
        >
          <div onClick={() => setOpen(false)}>{children}</div>
        </div>,
        document.body,
      )}
    </>
  );
}

export function DropdownItem({ children, danger, onClick }: { children: ReactNode; danger?: boolean; onClick?: () => void }) {
  return (
    <button
      className={`w-full text-left px-3.5 py-2.5 text-sm transition-colors ${
        danger ? "text-red-200 hover:bg-danger/15 hover:text-danger" : "text-white hover:bg-accent/10 hover:text-accent"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
