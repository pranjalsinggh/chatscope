import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Megaphone, X } from "lucide-react";
import { chatApi, type WallOption } from "../../lib/api";

type WallPublishModalProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * Publish-to-wall modal: lists the stats computed from the ACTIVE chat,
 * user picks one, only the stat id is sent. The text is generated
 * server-side from templates, never free text, never names.
 */
function WallPublishModal({ open, onClose }: WallPublishModalProps) {
  const [options, setOptions] = useState<WallOption[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [published, setPublished] = useState(false);

  const close = () => {
    onClose();
  };

  // The parent remounts this component (key bump) on every open, so
  // state starts fresh, the fetch only touches state asynchronously.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    chatApi
      .wallOptions()
      .then((data) => {
        if (!cancelled) setOptions(data.options || []);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load your stats. Try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handlePublish = async () => {
    if (!selected || publishing) return;
    setPublishing(true);
    setError("");
    try {
      await chatApi.wallPublish(selected);
      setPublished(true);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setPublishing(false);
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
            role="dialog"
            aria-modal="true"
            aria-label="Publish to the wall"
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.3, ease: [0.21, 0.6, 0.35, 1] }}
            className="glass-panel glass-sheen fixed left-1/2 top-1/2 z-[90] max-h-[92vh] w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500/30 via-fuchsia-500/30 to-blue-500/30 text-purple-200 ring-1 ring-purple-400/30">
                  <Megaphone size={16} />
                </span>
                <div>
                  <h3 className="text-lg font-semibold text-white">The Wall</h3>
                  <p className="text-xs text-gray-500">
                    One anonymous stat from this chat, on the landing page.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close wall publishing"
                className="glass-chip rounded-xl p-2 text-gray-400 transition-all duration-300 hover:bg-white/[0.08] hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {published ? (
              <div className="mt-6 rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.08] p-5 text-center">
                <p className="text-sm font-medium text-emerald-200">
                  You're on the wall! 🎉
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-gray-400">
                  Your stat is now scrolling on the landing page, no name, no
                  chat attached, just the number.
                </p>
                <button
                  type="button"
                  onClick={close}
                  className="glass-chip mt-4 rounded-xl px-4 py-2 text-xs text-gray-300 transition-all duration-300 hover:bg-white/[0.08] hover:text-white"
                >
                  Done
                </button>
              </div>
            ) : loading ? (
              <p className="mt-6 text-center text-sm text-gray-500">
                Computing your stats...
              </p>
            ) : (options ?? []).length === 0 ? (
              <p className="mt-6 text-center text-sm leading-relaxed text-gray-500">
                This chat doesn't have a stat worth the wall yet, keep
                chatting and check back.
              </p>
            ) : (
              <>
                <div className="mt-5 space-y-2">
                  {options!.map((option) => {
                    const active = selected === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setSelected(option.id)}
                        aria-pressed={active}
                        className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-300 ${
                          active
                            ? "border-purple-400/50 bg-purple-500/[0.12]"
                            : "border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.05]"
                        }`}
                      >
                        <span className="text-lg leading-none">{option.emoji}</span>
                        <span className="text-sm text-gray-200">{option.text}</span>
                      </button>
                    );
                  })}
                </div>

                {error && (
                  <p className="mt-3 text-xs text-red-300">{error}</p>
                )}

                <p className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-[0.68rem] leading-relaxed text-gray-500">
                  Fully anonymous: the wall never stores your name, chat or
                  account, only the sentence you pick. It can't be removed
                  later, so publish only what you're comfortable seeing in
                  public.
                </p>

                <div className="mt-5 flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handlePublish}
                    disabled={!selected || publishing}
                    className="glass-chip inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-all duration-300 hover:bg-white/[0.08] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Megaphone size={14} className="text-purple-300" />
                    {publishing ? "Publishing..." : "Publish to the wall"}
                  </button>
                  <button
                    type="button"
                    onClick={close}
                    className="glass-chip rounded-xl px-4 py-2.5 text-sm text-gray-300 transition-all duration-300 hover:bg-white/[0.08] hover:text-white active:scale-[0.98]"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function friendlyErrorMessage(err: unknown): string {
  const response = (err as { response?: { data?: { message?: string } } })?.response;
  return response?.data?.message || "Could not publish. Try again.";
}

export default WallPublishModal;
