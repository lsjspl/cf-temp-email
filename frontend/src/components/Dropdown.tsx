import { ReactNode, useEffect, useRef, useState } from "react";

interface Props {
  trigger?: ReactNode;
  children: ReactNode;
}

export default function Dropdown({ trigger, children }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        className="btn-ghost !px-2.5 !py-1.5 !text-xs !min-h-0"
        onClick={() => setOpen(!open)}
      >
        {trigger ?? "操作 ▾"}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 min-w-[140px] bg-panel-strong border border-line-strong rounded-md shadow-lg z-50 overflow-hidden">
          <div onClick={() => setOpen(false)}>{children}</div>
        </div>
      )}
    </div>
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
