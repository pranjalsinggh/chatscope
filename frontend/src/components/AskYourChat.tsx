import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Loader2,
  Quote,
  Bot,
  CornerDownRight,
} from "lucide-react";

import type { EvidenceItem } from "../lib/api";
import { ASK_PERSONA_OPTIONS, chatApi } from "../lib/api";
import { friendlyError } from "../lib/errors";

type AskTurn = {
  question: string;
  answer: string;
  evidence: EvidenceItem[];
  source: "analytics" | "ai" | null;
  confidence: number | null;
};

function confidenceLabel(confidence: number | null): {
  text: string;
  className: string;
} | null {
  if (confidence === null || confidence === undefined) return null;

  if (confidence >= 0.75) {
    return {
      text: "High confidence",
      className:
        "text-emerald-300 border-emerald-400/25 bg-emerald-500/10",
    };
  }
  if (confidence >= 0.45) {
    return {
      text: "Medium confidence",
      className: "text-amber-300 border-amber-400/25 bg-amber-500/10",
    };
  }
  return {
    text: "Low confidence",
    className: "text-orange-300 border-orange-400/25 bg-orange-500/10",
  };
}

function sourceBadge(source: AskTurn["source"]) {
  if (source === "analytics") {
    return { text: "Exact stats", icon: Sparkles };
  }
  if (source === "ai") {
    return { text: "AI answer", icon: Bot };
  }
  return null;
}

type AskYourChatProps = {
  suggestions: string[];
  chatMeta: { filename: string } | null;
};

function AskYourChat({ suggestions, chatMeta }: AskYourChatProps) {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<AskTurn[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState("");
  const [feedbackGiven, setFeedbackGiven] = useState<Record<number, boolean>>({});
  const [persona, setPersona] = useState<string>("default");

  // Abort an in-flight stream when the dashboard is left, so the backend
  // stops generating tokens nobody will read.
  const askAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => askAbortRef.current?.abort();
  }, []);

  // Load the saved ask persona for this context (guest or signed-in user)
  useEffect(() => {
    let cancelled = false;
    chatApi
      .settings()
      .then((settings) => {
        if (!cancelled) setPersona(settings.askPersona || "default");
      })
      .catch(() => {
        // picker stays on the default if settings can't be read
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectPersona = (id: string) => {
    if (id === persona) return;
    const previous = persona;
    setPersona(id);
    chatApi
      .updateSettings({ askPersona: id })
      .catch(() => setPersona(previous));
  };

  const handleAsk = async (event?: React.FormEvent) => {
    event?.preventDefault();

    const currentQuestion = question.trim();
    if (!currentQuestion || isAsking) return;

    const controller = new AbortController();
    askAbortRef.current = controller;

    try {
      setIsAsking(true);
      setError("");
      setQuestion("");

      // Progressive answer: open a turn immediately and stream into it
      const turnIndex = history.length;

      setHistory((prev) => [
        ...prev,
        {
          question: currentQuestion,
          answer: "",
          evidence: [],
          source: null,
          confidence: null,
        },
      ]);

      let streamFailed = false;

      await chatApi.askStream(currentQuestion, {
        onMeta: (meta) => {
          setHistory((prev) =>
            prev.map((turn, index) =>
              index === turnIndex
                ? {
                    ...turn,
                    evidence: meta.evidence || [],
                    source: meta.source ?? null,
                    confidence: meta.confidence ?? null,
                  }
                : turn
            )
          );
        },
        onToken: (text) => {
          setHistory((prev) =>
            prev.map((turn, index) =>
              index === turnIndex ? { ...turn, answer: turn.answer + text } : turn
            )
          );
        },
        onError: (message) => {
          streamFailed = true;
          setError(message);
          setHistory((prev) => prev.slice(0, turnIndex));
        },
      }, { signal: controller.signal });

      if (streamFailed) return;

      setHistory((prev) =>
        prev.map((turn, index) =>
          index === turnIndex && !turn.answer.trim()
            ? { ...turn, answer: "No answer was generated." }
            : turn
        )
      );
    } catch (err: unknown) {
      // Deliberate cancel (leaving the dashboard): not an error
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Ask Chat error:", err);
      setError(
        friendlyError(
          err,
          "Couldn't get an answer. Please make sure the backend is running."
        )
      );
      setHistory((prev) => prev.slice(0, -1));
    } finally {
      setIsAsking(false);
      if (askAbortRef.current === controller) askAbortRef.current = null;
    }
  };

  const handleFeedback = async (turnIndex: number, isPositive: boolean) => {
    if (feedbackGiven[turnIndex]) return;

    setFeedbackGiven((prev) => ({ ...prev, [turnIndex]: isPositive }));

    await chatApi.sendFeedback(history[turnIndex].question, isPositive);
  };

  const fallbackSuggestions = [
    "Who talks more?",
    "Who replies faster?",
    "What are the main topics?",
    "What interesting patterns can you find?",
  ];

  const activeSuggestions =
    suggestions.length > 0 ? suggestions : fallbackSuggestions;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.65 }}
    >
      <div className="glass-panel glass-sheen relative overflow-hidden p-6 sm:p-9">
        {/* Ambient glow behind the AI surface */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[36rem] max-w-full -translate-x-1/2 rounded-full bg-purple-500/[0.14] blur-[90px]"
        />

        <div className="relative text-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500/35 via-fuchsia-500/25 to-blue-500/30 text-white ring-1 ring-white/20"
          >
            <Sparkles size={24} />
            <span className="absolute -inset-1.5 -z-10 rounded-2xl bg-purple-500/25 blur-xl" />
          </motion.div>

          <p className="eyebrow mt-5 text-purple-300">AI powered</p>

          <h3 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
            Ask Your Chat
          </h3>

          <p className="mx-auto mt-2.5 max-w-xl text-sm leading-6 text-gray-400">
            Ask anything about{" "}
            <span className="text-gray-300">
              {chatMeta?.filename || "this conversation"}
            </span>. Every answer is grounded in the actual messages.
          </p>
        </div>

        <form onSubmit={handleAsk} className="relative mx-auto mt-8 max-w-3xl">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <CornerDownRight
                size={15}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-600"
              />

              <input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask something about your conversation..."
                aria-label="Ask a question about your conversation"
                className="w-full rounded-xl border border-white/10 bg-black/30 py-3.5 pl-11 pr-4 text-sm text-white outline-none transition-all placeholder:text-gray-600 focus:border-purple-400/50 focus:ring-2 focus:ring-purple-500/15"
                disabled={isAsking}
              />
            </div>

            <button
              type="submit"
              disabled={isAsking || !question.trim()}
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 via-fuchsia-500 to-purple-500 bg-[length:200%_100%] bg-left px-7 py-3.5 text-sm font-semibold text-white shadow-[0_10px_35px_-12px_rgba(168,85,247,0.7)] transition-all duration-500 hover:bg-right active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
            >
              {isAsking ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Thinking...
                </>
              ) : (
                "Ask AI"
              )}
            </button>
          </div>

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {activeSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setQuestion(suggestion)}
                disabled={isAsking}
                className="glass-chip rounded-full px-3.5 py-2 text-xs text-gray-400 transition-all duration-300 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>

          {/* Ask persona, voice presets, persisted per user/guest */}
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {ASK_PERSONA_OPTIONS.map((option) => {
              const active = persona === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  title={option.description}
                  aria-pressed={active}
                  onClick={() => selectPersona(option.id)}
                  disabled={isAsking}
                  className={`glass-chip rounded-full px-3 py-1.5 text-[11px] font-medium transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-50 ${
                    active
                      ? "bg-purple-500/[0.14] text-white ring-1 ring-purple-400/50"
                      : "text-gray-500 hover:bg-white/[0.08] hover:text-gray-300"
                  }`}
                >
                  <span className="mr-1">{option.emoji}</span>
                  {option.label}
                </button>
              );
            })}
          </div>
        </form>

        <AnimatePresence>
          {error && (
            <motion.div
              key="ask-error"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="relative mx-auto mt-6 max-w-3xl rounded-xl border border-red-500/25 bg-red-500/[0.07] p-4 text-sm text-red-300"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative mx-auto mt-8 max-w-3xl space-y-5">
          <AnimatePresence initial={false}>
            {history.map((turn, index) => {
              const badge = confidenceLabel(turn.confidence);
              const source = sourceBadge(turn.source);
              const isStreaming =
                isAsking && index === history.length - 1 && !turn.answer;

              return (
                <motion.article
                  key={index}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="glass-card p-5 sm:p-6"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-purple-200">
                      {turn.question}
                    </p>

                    <div className="flex items-center gap-2">
                      {source && (
                        <span className="glass-chip rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-gray-300">
                          {source.text}
                        </span>
                      )}

                      {badge && (
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide ${badge.className}`}
                        >
                          {badge.text}
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-gray-300">
                    {turn.answer || ""}
                    {isStreaming && (
                      <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse rounded-sm bg-purple-300 align-middle" />
                    )}
                  </p>

                  {!isAsking && turn.answer && index === history.length - 1 && (
                    <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
                      <span>Was this helpful?</span>

                      <button
                        type="button"
                        onClick={() => handleFeedback(index, true)}
                        disabled={feedbackGiven[index] !== undefined}
                        className={`rounded-lg border px-2 py-1 transition disabled:cursor-default ${
                          feedbackGiven[index] === true
                            ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
                            : "border-white/10 bg-white/[0.03] hover:bg-white/[0.08]"
                        }`}
                        aria-label="Helpful answer"
                      >
                        👍
                      </button>

                      <button
                        type="button"
                        onClick={() => handleFeedback(index, false)}
                        disabled={feedbackGiven[index] !== undefined}
                        className={`rounded-lg border px-2 py-1 transition disabled:cursor-default ${
                          feedbackGiven[index] === false
                            ? "border-red-400/40 bg-red-500/10 text-red-300"
                            : "border-white/10 bg-white/[0.03] hover:bg-white/[0.08]"
                        }`}
                        aria-label="Not helpful answer"
                      >
                        👎
                      </button>
                    </div>
                  )}

                  {turn.evidence.length > 0 && (
                    <div className="mt-5 border-t border-white/[0.07] pt-4">
                      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-gray-500">
                        Supporting evidence
                      </p>

                      <div className="mt-3 space-y-2.5">
                        {turn.evidence.map((item, evidenceIndex) => (
                          <motion.div
                            key={evidenceIndex}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.35, delay: evidenceIndex * 0.07 }}
                            className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3"
                          >
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <Quote size={10} />
                              <span className="truncate font-medium text-purple-200/90">
                                {item.sender}
                              </span>
                              <span>
                                · {item.date} {item.time}
                              </span>
                            </div>

                            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-300">
                              {item.message}
                            </p>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.article>
              );
            })}
          </AnimatePresence>

          {isAsking && (
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card flex items-center gap-3 p-5"
            >
              <Loader2 size={15} className="animate-spin text-purple-300" />
              <p className="text-sm text-gray-400">
                Searching your conversation for evidence...
              </p>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default AskYourChat;
