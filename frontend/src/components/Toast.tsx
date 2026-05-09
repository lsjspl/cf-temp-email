import { createContext, ReactNode, useCallback, useContext, useState } from "react";

type ToastKind = "ok" | "error" | "warn" | "info";
interface ToastItem { id: number; message: string; kind: ToastKind }

const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {});

export type ToastFn = (message: string, kind?: ToastKind) => void;
export function useToast(): ToastFn { return useContext(ToastContext); }

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback((message: string, kind: ToastKind = "info") => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, kind }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-2.5 max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`card px-4 py-3 text-sm animate-in slide-in-from-right ${
              t.kind === "ok" ? "border-accent/30" : t.kind === "error" ? "border-danger/30" : t.kind === "warn" ? "border-warning/30" : ""
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
