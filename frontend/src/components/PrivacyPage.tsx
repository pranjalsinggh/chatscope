import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  Smartphone,
  EyeOff,
  Sparkles,
  BarChart3,
  ArrowRight,
  Bot,
  ArrowLeft,
  Lock,
  FileClock,
  UserRound,
} from "lucide-react";

import { chatApi, type AiLogEntry, type AppSettings } from "../lib/api";
import AnimatedBackground from "./AnimatedBackground";
import GlassCard from "./ui/GlassCard";
import GlassSwitch from "./ui/GlassSwitch";

const easeOut = [0.21, 0.6, 0.35, 1] as const;

function formatTimestamp(timestamp: string): string {
  try {
    return new Date(timestamp).toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return timestamp;
  }
}

const featureLabels: Record<string, string> = {
  ask: "Ask Your Chat",
  facts: "People facts",
  embeddings: "Semantic index",
};

/** Static flow diagram: your device → redaction → AI → answers back. */
function FlowDiagram() {
  const steps = [
    {
      icon: Smartphone,
      title: "Your device",
      text: "Your chat file is parsed and stored locally. Nothing is uploaded anywhere else.",
    },
    {
      icon: EyeOff,
      title: "Redaction",
      text: "Phone numbers, emails, OTPs, cards and UPI IDs are masked before anything leaves.",
    },
    {
      icon: Bot,
      title: "Gemini / Groq",
      text: "Only the relevant evidence (or the masked transcript for facts) reaches the AI.",
    },
    {
      icon: Sparkles,
      title: "Answers back",
      text: "Grounded answers and analytics return to you. Analytics never leave this device.",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-4">
      {steps.map((step, index) => {
        const Icon = step.icon;
        return (
          <motion.div
            key={step.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.5, delay: index * 0.1, ease: easeOut }}
            className="relative"
          >
            <GlassCard className="h-full p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/12 text-purple-300 ring-1 ring-purple-400/20">
                <Icon size={18} />
              </div>

              <h3 className="mt-4 text-sm font-semibold text-white">
                {step.title}
              </h3>

              <p className="mt-1.5 text-xs leading-5 text-gray-500">
                {step.text}
              </p>
            </GlassCard>

            {index < steps.length - 1 && (
              <ArrowRight
                size={15}
                className="absolute -right-[13px] top-1/2 hidden -translate-y-1/2 text-gray-600 md:block"
              />
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

/** "What was sent to AI", counts-only timeline, newest first. */
function AiTimeline() {
  const [entries, setEntries] = useState<AiLogEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    chatApi
      .aiLog()
      .then((result) => {
        if (!cancelled) setEntries([...result.entries].reverse());
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/12 text-blue-300 ring-1 ring-blue-400/20">
          <FileClock size={18} />
        </div>

        <div>
          <h3 className="font-semibold text-white">What was sent to AI</h3>
          <p className="text-sm text-gray-500">
            Counts only, never message content. Newest first.
          </p>
        </div>
      </div>

      {entries === null ? (
        <p className="mt-5 text-sm text-gray-500">Loading the log...</p>
      ) : entries.length === 0 ? (
        <p className="mt-5 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-gray-500">
          Nothing has been sent to any AI provider yet.
        </p>
      ) : (
        <div className="mt-5 max-h-72 space-y-2.5 overflow-y-auto pr-1">
          {entries.map((entry, index) => (
            <motion.div
              key={`${entry.timestamp}-${index}`}
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: Math.min(index, 8) * 0.04 }}
              className="glass-chip flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-4 py-2.5 text-xs"
            >
              <span className="text-gray-300">
                {formatTimestamp(entry.timestamp)}
              </span>

              <span className="rounded-md bg-purple-500/15 px-2 py-0.5 font-medium text-purple-200">
                {featureLabels[entry.feature] || entry.feature}
              </span>

              <span className="text-gray-500">
                {entry.messagesSent.toLocaleString()} message
                {entry.messagesSent === 1 ? "" : "s"}
              </span>

              <span className="ml-auto text-gray-600">{entry.provider}</span>
            </motion.div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}

/** "Accounts", the no-accounts privacy story. */
function AccountsSection() {
  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-300 ring-1 ring-emerald-400/20">
          <UserRound size={18} />
        </div>

        <div>
          <h3 className="font-semibold text-white">No accounts, by design</h3>
          <p className="text-sm text-gray-500">
            ChatScope has no sign-in at all. Nothing to create, nothing to leak.
          </p>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-xl border border-white/[0.06]">
        {[
          {
            label: "Your chat",
            text: "Never written to disk. The moment analysis completes, the stored copy is encrypted with AES-256-GCM under a key that exists only in server memory and dies with your visit. Another device sees nothing of yours.",
          },
          {
            label: "History",
            text: "There is none. Restarting the app wipes every workspace automatically, and idle workspaces are wiped after 2 hours. Nothing is saved between visits.",
          },
          {
            label: "Accounts & sign-in",
            text: "Removed entirely. No logins, no profiles, no credentials exist in this app, so none can be stolen or subpoenaed.",
          },
          {
            label: "What is stored",
            text: "Only non-personal preferences (AI on/off, accent color) and counts for the transparency log. Never messages, names, numbers or files.",
          },
          {
            label: "The public wall",
            text: "Publishing is optional and anonymous: only a server-computed sentence (like \u201c40% of our messages land after 10 PM\u201d) goes public, never your name or chat.",
          },
        ].map((row, index) => (
          <div
            key={row.label}
            className={`flex flex-col gap-1.5 p-4 sm:flex-row sm:gap-6 ${
              index > 0 ? "border-t border-white/[0.06]" : ""
            }`}
          >
            <p className="w-32 shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 sm:pt-0.5">
              {row.label}
            </p>
            <p className="text-xs leading-5 text-gray-400">{row.text}</p>
          </div>
        ))}
      </div>

      <p className="mt-4 text-[0.68rem] leading-5 text-gray-600">
        For absolute certainty, use the "Delete all data" action in any
        dashboard's overflow menu before you walk away.
      </p>
    </GlassCard>
  );
}

type PrivacyPageProps = {
  onExit: () => void;
};

function PrivacyPage({ onExit }: PrivacyPageProps) {
  const [liveSettings, setLiveSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    let cancelled = false;

    chatApi
      .settings()
      .then((result) => {
        if (!cancelled) setLiveSettings(result);
      })
      .catch(() => {
        if (!cancelled) setLiveSettings(null);
      });


    return () => {
      cancelled = true;
    };
  }, []);

  const toggleSetting = async (key: keyof AppSettings, value: boolean) => {
    if (!liveSettings) return;
    const next = { ...liveSettings, [key]: value };
    setLiveSettings(next);
    try {
      const saved = await chatApi.updateSettings({ [key]: value });
      setLiveSettings(saved);
    } catch {
      setLiveSettings(liveSettings); // revert on failure
    }
  };

  const settingsRows: {
    key: keyof AppSettings;
    label: string;
    hint: string;
  }[] = [
    {
      key: "aiEnabled",
      label: "AI features",
      hint: "When off, ChatScope runs analytics-only, no AI call is ever made.",
    },
    {
      key: "redactPII",
      label: "Redact personal data",
      hint: "Masks phones, emails, OTPs, cards and UPI IDs in everything sent to AI.",
    },
    {
      key: "aliasMode",
      label: "Use aliases (Person A, B…)",
      hint: "Replaces participant names with Person A/B in everything sent to AI.",
    },
  ];

  return (
    <div className="relative min-h-screen px-6 pb-24 pt-28">
      <AnimatedBackground />

      <div className="relative z-10 mx-auto max-w-4xl">
        <button
          type="button"
          onClick={onExit}
          className="glass-chip inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm text-gray-300 transition-all duration-300 hover:bg-white/[0.08] hover:text-white"
        >
          <ArrowLeft size={14} />
          Back to ChatScope
        </button>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: easeOut }}
          className="mt-8"
        >
          <p className="eyebrow text-purple-300">Privacy</p>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            What <span className="gradient-text inline-block">leaves</span> your
            device
          </h1>

          <p className="mt-4 max-w-2xl text-sm leading-6 text-gray-400 sm:text-base">
            ChatScope is built to be private by default. This page explains, in
            plain language, exactly what data goes where, and gives you the
            switches to control it.
          </p>
        </motion.div>

        {/* What leaves your device */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: easeOut }}
          className="mt-10"
        >
          <FlowDiagram />
        </motion.div>

        {/* The two paths */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.6, ease: easeOut }}
          className="mt-6 grid gap-5 md:grid-cols-2"
        >
          <GlassCard className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/12 text-purple-300 ring-1 ring-purple-400/20">
                <Bot size={18} />
              </div>

              <h3 className="font-semibold text-white">The AI path</h3>
            </div>

            <p className="mt-3 text-sm leading-6 text-gray-400">
              Questions and facts use Gemini (with optional Groq fallback).
              Only the retrieved evidence, up to your evidence scope, after
              redaction, or a masked transcript for facts is sent. Answers
              stream back and are never stored on any remote server.
            </p>
          </GlassCard>

          <GlassCard className="p-6" delay={0.08}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-300 ring-1 ring-emerald-400/20">
                <BarChart3 size={18} />
              </div>

              <h3 className="font-semibold text-white">The analytics path</h3>
            </div>

            <p className="mt-3 text-sm leading-6 text-gray-400">
              Every number on your dashboard, totals, response times, word
              clouds, trends, is computed locally on your machine. Analytics
              never leave your device.
            </p>
          </GlassCard>
        </motion.div>

        {/* Live settings */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.6, ease: easeOut }}
          className="mt-6"
        >
          <GlassCard className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/12 text-amber-300 ring-1 ring-amber-400/20">
                <ShieldCheck size={18} />
              </div>

              <div>
                <h3 className="font-semibold text-white">
                  Your privacy settings
                </h3>
                <p className="text-sm text-gray-500">
                  Live from the server, changes apply immediately.
                </p>
              </div>
            </div>

            {liveSettings === null ? (
              <p className="mt-5 text-sm text-gray-500">
                Could not load settings, the backend may be offline.
              </p>
            ) : (
              <div className="mt-5 space-y-4">
                {settingsRows.map((row) => (
                  <div
                    key={row.key}
                    className="flex items-start justify-between gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-200">
                        {row.label}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-gray-500">
                        {row.hint}
                      </p>
                    </div>

                    <GlassSwitch
                      checked={Boolean(liveSettings[row.key])}
                      onChange={(next) => toggleSetting(row.key, next)}
                      label={row.label}
                      tone={
                        row.key === "aiEnabled" && !liveSettings.aiEnabled
                          ? "amber"
                          : "emerald"
                      }
                    />
                  </div>
                ))}

                <div className="flex items-start justify-between gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-200">
                      Evidence scope
                    </p>
                    <p className="mt-1 text-xs leading-5 text-gray-500">
                      How many messages are sent to the AI per question.
                    </p>
                  </div>

                  <span className="glass-chip shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-purple-200">
                    {liveSettings.evidenceScope} messages
                  </span>
                </div>
              </div>
            )}
          </GlassCard>
        </motion.div>

        {/* Storage */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.6, ease: easeOut }}
          className="mt-6"
        >
          <GlassCard className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/12 text-sky-300 ring-1 ring-sky-400/20">
                <Lock size={18} />
              </div>

              <div>
                <h3 className="font-semibold text-white">
                  Where your data lives
                </h3>
                <p className="text-sm text-gray-500">
                  Nothing saved. Encrypted in memory. Always deletable.
                </p>
              </div>
            </div>

            <ul className="mt-4 space-y-2.5 text-sm leading-6 text-gray-400">
              <li>
                • Chats are analyzed straight from memory. The uploaded file
                never touches the disk, not even as a temporary file.
              </li>
              <li>
                • Automatic AES-256-GCM encryption: the stored copy of every
                chat is encrypted the moment analysis completes, under a key
                that exists only in server memory.
              </li>
              <li>
                • "Delete all data" wipes every chat and cache in one click.
              </li>
            </ul>
          </GlassCard>
        </motion.div>

        {/* Accounts, what each optional sign-in shares */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.6, ease: easeOut }}
          className="mt-6"
        >
          <AccountsSection />
        </motion.div>

        {/* AI log timeline */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.6, ease: easeOut }}
          className="mt-6"
        >
          <AiTimeline />
        </motion.div>

        <footer className="mt-16 border-t border-white/[0.06] pt-8 text-center">
          <p className="text-xs text-gray-600">
            ChatScope · AI conversation intelligence, your data stays on
            your device.
          </p>
        </footer>
      </div>
    </div>
  );
}

export default PrivacyPage;
