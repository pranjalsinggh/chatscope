import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  UploadCloud,
  ShieldCheck,
  Loader2,
  Sparkles,
  X,
  CheckCircle2,
  History,
  FlaskConical,
} from "lucide-react";
import { chatApi, type Analytics, type LibraryEntry } from "../lib/api";
import { friendlyError } from "../lib/errors";

const easeOut = [0.21, 0.6, 0.35, 1] as const;

type UploadSectionProps = {
  onAnalysisComplete: (
    analytics: Analytics,
    meta: { filename: string; messageCount: number },
    suggestions?: string[]
  ) => void;
  onSelectRecent: (entry: LibraryEntry) => void;
  /** Opens the dashboard with the bundled synthetic chat */
  onStartDemo?: (
    analytics: Analytics,
    meta: { filename: string; messageCount: number },
    suggestions?: string[]
  ) => void;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function UploadSection({
  onAnalysisComplete,
  onSelectRecent,
  onStartDemo,
}: UploadSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [recentChats, setRecentChats] = useState<LibraryEntry[]>([]);
  const [demoLoading, setDemoLoading] = useState(false);

  // Offer previously analyzed chats (user-initiated, never auto-restores)
  useEffect(() => {
    let cancelled = false;

    chatApi
      .library()
      .then((result) => {
        if (!cancelled && result.chats.length > 0) {
          setRecentChats(result.chats.slice(0, 6));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const handleFile = (file: File) => {
    setError("");
    setStatusMessage("");
    // Every new selection requires a fresh content confirmation
    setDisclaimerAccepted(false);

    if (!file.name.toLowerCase().endsWith(".txt")) {
      setError("Please select a WhatsApp .txt export file.");
      return;
    }

    if (file.size === 0) {
      setError("That file is empty. Please export the chat again from WhatsApp.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("That file is too large. The maximum size is 10 MB.");
      return;
    }

    setSelectedFile(file);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleChooseFile = () => {
    fileInputRef.current?.click();
  };

  const clearFile = () => {
    setSelectedFile(null);
    setDisclaimerAccepted(false);
    setError("");
    setStatusMessage("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile || isUploading) return;

    setError("");
    setIsUploading(true);
    setStatusMessage("Reading conversation...");

    try {
      const result = await chatApi.upload(selectedFile, setStatusMessage);
      onAnalysisComplete(
        result.analytics,
        {
          filename: result.filename,
          messageCount: result.messageCount,
        },
        result.suggestions
      );
    } catch (err: unknown) {
      console.error("Upload error:", err);
      setError(
        friendlyError(err, "Couldn't analyze that chat. Please try again.")
      );
      setStatusMessage("");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDemo = async () => {
    if (demoLoading || isUploading) return;

    setError("");
    setDemoLoading(true);

    try {
      const result = await chatApi.loadDemo();
      onStartDemo?.(
        result.analytics,
        {
          filename: result.filename,
          messageCount: result.messageCount,
        },
        result.suggestions
      );
    } catch (err: unknown) {
      setError(friendlyError(err, "Couldn't load the sample chat."));
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <section id="upload" className="relative scroll-mt-24 px-6 pb-28 pt-10 sm:pt-14">
      <div className="mx-auto max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.65, ease: easeOut }}
          className="text-center"
        >
          <p className="eyebrow text-purple-300">Get started</p>

          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Upload your conversation.
          </h2>

          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-gray-400 sm:text-base">
            Export your WhatsApp conversation as a text file and let ChatScope
            uncover the insights hidden inside.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 34 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7, delay: 0.12, ease: easeOut }}
          className="mt-11"
        >
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={!selectedFile && !isUploading ? handleChooseFile : undefined}
            className={`glass-panel glass-sheen relative rounded-3xl p-8 text-center transition-all duration-300 sm:p-12 ${
              isDragging
                ? "scale-[1.01] border-purple-400/60 bg-purple-500/[0.07] shadow-[0_0_80px_-25px_rgba(168,85,247,0.55)]"
                : "border-dashed"
            } ${isUploading ? "pointer-events-none" : ""} ${
              !selectedFile && !isUploading ? "cursor-pointer" : ""
            }`}
          >
            {/* Drag glow ring */}
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-0 rounded-3xl transition-opacity duration-500 ${
                isDragging ? "opacity-100" : "opacity-0"
              }`}
              style={{
                background:
                  "radial-gradient(60% 60% at 50% 40%, rgba(168,85,247,0.12), transparent)",
              }}
            />

            <motion.div
              animate={{
                scale: isDragging ? 1.08 : 1,
                y: isDragging ? -4 : 0,
              }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
              className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500/30 via-fuchsia-500/20 to-blue-500/25 text-white ring-1 ring-white/15"
            >
              <UploadCloud size={27} />
              <span className="absolute -inset-1 -z-10 rounded-2xl bg-purple-500/20 blur-xl" />
            </motion.div>

            <h3 className="relative mt-6 text-lg font-semibold text-white sm:text-xl">
              {isDragging
                ? "Drop it right here"
                : "Drop your WhatsApp chat here"}
            </h3>

            <p className="relative mt-2 text-sm text-gray-500">
              or click anywhere in this area to browse your files
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,text/plain"
              onChange={handleFileChange}
              onClick={(event) => event.stopPropagation()}
              className="hidden"
            />

            {/* Click surface opens the file picker (kept as a real button for a11y) */}
            {!selectedFile && (
              <button
                type="button"
                onClick={handleChooseFile}
                disabled={isUploading}
                className="group relative mx-auto mt-7 flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-medium text-black transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_0_35px_-8px_rgba(255,255,255,0.5)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FileText size={15} />
                Choose .txt file
              </button>
            )}

            {/* File selected card */}
            <AnimatePresence>
              {selectedFile && (
                <motion.div
                  key="file-card"
                  initial={{ opacity: 0, y: 14, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.97 }}
                  transition={{ duration: 0.35, ease: easeOut }}
                  className="relative mx-auto mt-7 max-w-md"
                >
                  <div className="glass-chip flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-500/15 text-purple-300">
                      <FileText size={18} />
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">
                        {selectedFile.name}
                      </p>

                      <p className="mt-0.5 text-xs text-gray-500">
                        {formatFileSize(selectedFile.size)} · ready to analyze
                      </p>
                    </div>

                    {!isUploading && (
                      <button
                        type="button"
                        onClick={clearFile}
                        aria-label="Remove selected file"
                        className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-white/[0.06] hover:text-gray-300"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>

                  {/* Content confirmation — required before analysis */}
                  <label
                    htmlFor="upload-consent"
                    className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3.5 py-3 text-left transition-colors hover:bg-white/[0.04]"
                  >
                    <input
                      id="upload-consent"
                      type="checkbox"
                      checked={disclaimerAccepted}
                      onChange={(event) =>
                        setDisclaimerAccepted(event.target.checked)
                      }
                      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-purple-500"
                    />
                    <span className="text-[0.7rem] leading-5 text-gray-400">
                      I confirm this export comes from my own conversations
                      and{" "}
                      <span className="text-gray-200">
                        contains no personal data I do not have the right to
                        share
                      </span>
                      . I am analysing it voluntarily for personal use and
                      accept full responsibility for the content I upload.
                    </span>
                  </label>

                  <motion.button
                    type="button"
                    onClick={handleUpload}
                    disabled={isUploading || !disclaimerAccepted}
                    whileTap={{ scale: 0.98 }}
                    title={
                      disclaimerAccepted
                        ? undefined
                        : "Please confirm the statement above first"
                    }
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 via-fuchsia-500 to-purple-500 bg-[length:200%_100%] bg-left px-6 py-3.5 text-sm font-semibold text-white shadow-[0_10px_35px_-12px_rgba(168,85,247,0.7)] transition-all duration-500 hover:bg-right disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        Analyze Chat
                      </>
                    )}
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Analysis progress */}
            <AnimatePresence>
              {isUploading && statusMessage && (
                <motion.div
                  key="status"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="relative mx-auto mt-5 flex max-w-xl items-center justify-center gap-2.5 text-sm text-purple-200"
                >
                  <Loader2 size={14} className="animate-spin text-purple-300" />
                  {statusMessage}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Success cue (visible briefly before the dashboard takes over) */}
            {isUploading && statusMessage === "Almost ready..." && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative mt-4 flex items-center justify-center gap-1.5 text-xs text-emerald-300"
              >
                <CheckCircle2 size={13} />
                Building your dashboard
              </motion.div>
            )}

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="relative mx-auto mt-5 max-w-xl rounded-xl border border-red-500/25 bg-red-500/[0.07] px-4 py-3 text-sm text-red-300"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Trust row */}
            <div className="relative mt-9 flex flex-wrap justify-center gap-5 text-xs text-gray-600">
              <span className="flex items-center gap-1.5">
                <FileText size={13} />
                WhatsApp .txt export
              </span>

              <span className="flex items-center gap-1.5">
                <ShieldCheck size={13} />
                Privacy focused
              </span>

              <span className="flex items-center gap-1.5">
                <Sparkles size={13} />
                AI insights in seconds
              </span>
            </div>
          </div>

          {/* Try-with-sample entry, loads the bundled synthetic chat */}
          {!isUploading && (
            <motion.button
              type="button"
              onClick={handleDemo}
              disabled={demoLoading}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: 0.1, ease: easeOut }}
              className="glass-chip group mx-auto mt-7 flex items-center gap-2 rounded-full px-5 py-2.5 text-xs text-gray-400 transition-all duration-300 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {demoLoading ? (
                <Loader2 size={13} className="animate-spin text-purple-300" />
              ) : (
                <FlaskConical size={13} className="text-purple-300/80" />
              )}
              {demoLoading
                ? "Loading sample chat..."
                : "Try with a sample chat, 200 synthetic messages, nothing personal"}
            </motion.button>
          )}

          {/* Recent analyses, jump back into a previous report */}
          {recentChats.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.55, delay: 0.2, ease: easeOut }}
              className="mt-8"
            >
              <p className="mb-3 flex items-center justify-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-gray-500">
                <History size={12} />
                Recent analyses
              </p>

              <div className="flex flex-wrap justify-center gap-2.5">
                {recentChats.map((chat) => (
                  <button
                    key={chat.id}
                    type="button"
                    onClick={() => onSelectRecent(chat)}
                    disabled={isUploading}
                    className="glass-chip group flex max-w-[260px] items-center gap-2.5 rounded-xl px-4 py-2.5 text-left transition-all duration-300 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <FileText
                      size={14}
                      className="shrink-0 text-purple-300/80"
                    />

                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium text-gray-200 group-hover:text-white">
                        {chat.filename}
                      </span>

                      <span className="block text-[0.65rem] text-gray-600">
                        {chat.messageCount.toLocaleString()} messages
                        {chat.hasFacts ? " · facts ready" : ""}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    </section>
  );
}

export default UploadSection;
