import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Trash2, X } from "lucide-react";

type PurgeModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
};

/**
 * Destructive-action confirmation: the user must type DELETE
 * exactly. Red-tinted, glass-styled, esc/dismissable.
 */
function PurgeModal({ open, onClose, onConfirm }: PurgeModalProps) {
  const [confirmText, setConfirmText] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset local state when the modal closes (event-driven, not in an effect)
  const close = () => {
    setConfirmText("");
    setError("");
    setWorking(false);
    onClose();
  };

  useEffect(() => {
    if (!open) return;

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    // focus + listeners are side effects on external systems, allowed
    inputRef.current?.focus();

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleConfirm = async () => {
    if (confirmText !== "DELETE" || working) return;

    setWorking(true);
    setError("");

    try {
      await onConfirm();
      close();
    } catch {
      setError("Could not delete the data. Please try again.");
      setWorking(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={close}
            className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm"
            aria-hidden="true"
          />

          <motion.div
            key="modal"
            role="alertdialog"
            aria-modal="true"
            aria-label="Delete all data"
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.3, ease: [0.21, 0.6, 0.35, 1] }}
            className="fixed inset-x-4 top-1/2 z-[90] mx-auto max-w-md -translate-y-1/2"
          >
            <div className="glass-panel border-red-500/25 p-7">
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-500/15 text-red-300 ring-1 ring-red-400/30">
                  <AlertTriangle size={22} />
                </div>

                <button
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-white/[0.06] hover:text-gray-300"
                >
                  <X size={16} />
                </button>
              </div>

              <h2 className="mt-4 text-lg font-semibold text-white">
                Delete all data?
              </h2>

              <p className="mt-2 text-sm leading-6 text-gray-400">
                This permanently erases every saved chat, the library, all
                caches and AI logs on the server. Settings are
                kept. There is no undo.
              </p>

              <div className="mt-5">
                <label
                  htmlFor="purge-confirm"
                  className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500"
                >
                  Type DELETE to confirm
                </label>

                <input
                  id="purge-confirm"
                  ref={inputRef}
                  value={confirmText}
                  onChange={(event) => setConfirmText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleConfirm();
                  }}
                  autoComplete="off"
                  placeholder="DELETE"
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm tracking-[0.2em] text-red-200 placeholder:text-gray-600 focus:border-red-400/40 focus:outline-none"
                />
              </div>

              {error && (
                <p className="mt-3 text-xs text-red-400">{error}</p>
              )}

              <div className="mt-6 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={close}
                  disabled={working}
                  className="glass-chip rounded-xl px-4 py-2.5 text-sm text-gray-300 transition-all hover:bg-white/[0.08] hover:text-white disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={confirmText !== "DELETE" || working}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-rose-500 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_-12px_rgba(244,63,94,0.7)] transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 size={14} />
                  {working ? "Erasing..." : "Delete everything"}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default PurgeModal;
