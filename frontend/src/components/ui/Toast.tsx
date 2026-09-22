import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, X } from "lucide-react";
import type { ReactNode } from "react";

import { ToastContext } from "../../lib/useToast";

type Toast = {
  id: number;
  message: string;
  tone: "success" | "error";
};

let nextToastId = 1;

/**
 * Glass toast notifications, top-center. Usage:
 *   const toast = useToast();
 *   toast("All data erased.", "success");
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = (id: number) =>
    setToasts((current) => current.filter((t) => t.id !== id));

  const push = useCallback(
    (message: string, tone: "success" | "error" = "success") => {
      const id = nextToastId++;
      setToasts((current) => [...current, { id, message, tone }]);
      setTimeout(() => dismiss(id), 4200);
    },
    []
  );

  return (
    <ToastContext.Provider value={push}>
      {children}

      <div className="pointer-events-none fixed inset-x-0 top-6 z-[100] flex flex-col items-center gap-2 px-4 print:hidden">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.96 }}
              transition={{ duration: 0.3, ease: [0.21, 0.6, 0.35, 1] }}
              className={`glass-panel pointer-events-auto flex max-w-md items-center gap-2.5 rounded-2xl px-4 py-3 text-sm ${
                toast.tone === "success" ? "text-emerald-200" : "text-red-200"
              }`}
            >
              {toast.tone === "success" ? (
                <CheckCircle2 size={16} className="shrink-0 text-emerald-300" />
              ) : (
                <AlertTriangle size={16} className="shrink-0 text-red-300" />
              )}

              <span className="min-w-0">{toast.message}</span>

              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss"
                className="ml-1 shrink-0 rounded-lg p-1 text-gray-500 transition-colors hover:text-gray-300"
              >
                <X size={13} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
