import { createContext, ReactNode, useCallback, useContext, useRef, useState } from "react";

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(async () => false);

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { open: boolean }) | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({ ...options, open: true });
    });
  }, []);

  function handleClose(result: boolean) {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setState(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state?.open && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm" onClick={() => handleClose(false)}>
          <div
            className={`card w-full max-w-sm overflow-hidden ${state.danger ? "border-danger/30" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-2">
              <h2 className={`text-lg font-semibold ${state.danger ? "text-red-200" : ""}`}>{state.title}</h2>
            </div>
            {state.message && (
              <div className="px-5 pb-4 text-sm text-muted">{state.message}</div>
            )}
            <div className="px-5 pb-5 flex justify-end gap-2.5">
              <button className="btn-ghost" onClick={() => handleClose(false)}>
                {state.cancelText ?? "取消"}
              </button>
              <button
                className={state.danger ? "btn-danger" : "btn-primary"}
                onClick={() => handleClose(true)}
                autoFocus
              >
                {state.confirmText ?? "确认"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
