import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  Clock3,
  FileText,
  Link2,
  MessageCircle,
  Users,
  Zap,
  RotateCcw,
  CalendarRange,
  Trophy,
  Gauge,
  MessagesSquare,
  FileDown,
  ImageDown,
  Flame,
  CalendarDays,
  TrendingUp,
  Type,
  HeartHandshake,
  Megaphone,
  Sparkles,
  Smile,
  History,
  Share2,
  Trash2,
  ChevronDown,
  ShieldCheck,
} from "lucide-react";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

import type {
  Analytics,
  AppSettings,
  HealthReport,
  LibraryEntry,
} from "../lib/api";
import { chatApi } from "../lib/api";
import { friendlyError } from "../lib/errors";
import MessageBrowser from "./MessageBrowser";
import FactsSection from "./FactsSection";
import AskYourChat from "./AskYourChat";
import DashboardSidebar from "./dashboard/DashboardSidebar";
import GlassCard from "./ui/GlassCard";
import SectionHeader from "./ui/SectionHeader";
import StatCard from "./ui/StatCard";
import EmptyState from "./ui/EmptyState";
import GlassSwitch from "./ui/GlassSwitch";
import PurgeModal from "./PurgeModal";
// Code-split: these two pull in the heavy html-to-image dependency, so
// their chunks only load when the user first opens one of them.
const ShareCardModal = lazy(() => import("./dashboard/ShareCardModal"));
const WrappedModal = lazy(() => import("./dashboard/WrappedModal"));
import WallPublishModal from "./dashboard/WallPublishModal";
import { computeRecords, type ChatRecord } from "../lib/records";
import { computeVibeMatch } from "../lib/vibe";
import SettingsPanel from "./SettingsPanel";
import { useToast } from "../lib/useToast";
import { MoreHorizontal, FlaskConical } from "lucide-react";

function formatResponseTime(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) {
    return "N/A";
  }

  if (minutes < 1) {
    const seconds = Math.round(minutes * 60);
    return `${seconds} sec`;
  }

  if (minutes < 60) {
    return `${Math.round(minutes)} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);

  if (remainingMinutes === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${remainingMinutes} min`;
}

/* Shared chart appearance, data and series are unchanged */
const chartTooltipStyle = {
  background: "rgba(16, 13, 26, 0.95)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "12px",
  fontFamily: '"Red Rose", ui-serif, Georgia, serif',
  boxShadow: "0 18px 45px -22px rgba(0,0,0,0.9)",
} as const;

const chartLabelStyle = {
  color: "rgba(255,255,255,0.65)",
} as const;

const axisProps = {
  stroke: "rgba(255,255,255,0.3)",
  tick: { fill: "rgba(255,255,255,0.5)", fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

type DashboardProps = {
  analytics: Analytics;
  chatMeta: { filename: string; messageCount: number } | null;
  suggestions: string[];
  onReset: () => void;
  /** Switch the active chat from the in-dashboard library */
  onSwitchChat?: (id: string) => Promise<void>;
  /** True when the synthetic demo chat is loaded */
  isDemo?: boolean;
  /** Live user settings (drives AI gating in the UI) */
  settings?: AppSettings | null;
  onSettingsChange?: (next: AppSettings) => void;
};

function Dashboard({
  analytics,
  chatMeta,
  suggestions,
  onReset,
  onSwitchChat,
  isDemo = false,
  settings = null,
  onSettingsChange = () => {},
}: DashboardProps) {
  const { overview, messagesPerPerson } = analytics;
  const toast = useToast();

  const aiEnabled = settings?.aiEnabled ?? true;

  /* -------------------- LIBRARY / SHARE / HEALTH UI -------------------- */

  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryChats, setLibraryChats] = useState<LibraryEntry[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [aiHealth, setAiHealth] = useState<HealthReport | null>(null);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);

  /* -------------------- SHARE MENU (card / wrapped / wall / PDF) ------- */

  const [shareCardOpen, setShareCardOpen] = useState(false);
  const [wrappedOpen, setWrappedOpen] = useState(false);
  const [wallOpen, setWallOpen] = useState(false);
  const [wallOpenCount, setWallOpenCount] = useState(0);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);

  useEffect(() => {
    chatApi
      .health()
      .then(setAiHealth)
      .catch(() => {});
  }, []);

  const handlePurge = async () => {
    await chatApi.purge();
    toast("All data erased.");
    onReset();
  };

  const handleAiToggle = async (next: boolean) => {
    // Optimistic flip; the chip + sections follow immediately
    if (settings) {
      onSettingsChange({ ...settings, aiEnabled: next });
    }

    try {
      const saved = await chatApi.updateSettings({ aiEnabled: next });
      onSettingsChange(saved);
      toast(
        next
          ? "AI features on, Ask Your Chat is back."
          : "Analytics-only mode, no AI calls will be made."
      );
    } catch {
      if (settings) onSettingsChange(settings);
      toast("Could not change the AI setting.", "error");
    }
  };

  const toggleLibrary = async () => {
    const next = !libraryOpen;
    setLibraryOpen(next);

    if (next) {
      setLibraryLoading(true);
      try {
        const result = await chatApi.library();
        setLibraryChats(result.chats);
      } catch {
        setLibraryChats([]);
      } finally {
        setLibraryLoading(false);
      }
    }
  };

  const handleSwitchChat = async (id: string) => {
    if (!onSwitchChat || switchingTo) return;
    setSwitchingTo(id);
    try {
      await onSwitchChat(id);
      setLibraryOpen(false);
    } catch (error) {
      // App-level handler shows the failure banner; keep the menu usable
      console.warn("Chat switch failed:", friendlyError(error, "Could not switch chats."));
    } finally {
      setSwitchingTo(null);
    }
  };

  const handleDeleteChat = async (id: string) => {
    try {
      await chatApi.deleteChat(id);
      setLibraryChats((chats) => chats.filter((chat) => chat.id !== id));
    } catch (error) {
      toast(friendlyError(error, "Could not delete that chat."), "error");
    }
  };

  const aiChip = (() => {
    if (!aiHealth) return null;

    if (!aiEnabled) {
      return { dot: "bg-gray-500", label: "Analytics only" };
    }

    if (!aiHealth.geminiConfigured) {
      return { dot: "bg-red-400", label: "AI off" };
    }
    return aiHealth.groqFallbackConfigured
      ? { dot: "bg-emerald-400", label: "Gemini + Groq" }
      : { dot: "bg-emerald-400", label: "Gemini AI" };
  })();

  /* -------------------- DATA (unchanged calculations) -------------------- */

  const monthlyData = (analytics.monthlyTrends || []).map((m) => ({
    month: m.month,
    messages: m.count,
  }));

  const interactionData = analytics.interactions?.topPairs || [];
  const wordsByPerson = analytics.wordsByPerson || {};

  const maxWordCount = Math.max(
    1,
    ...(analytics.topWords || []).map((w) => w.count)
  );

  const wordCloudColors = [
    "text-purple-300",
    "text-sky-300",
    "text-pink-300",
    "text-emerald-300",
    "text-amber-200",
    "text-indigo-300",
  ];

  // One entry per active day — can reach thousands of rows on multi-year
  // chats, so memoize it against the analytics payload.
  const messagesOverTime = useMemo(
    () =>
      Object.entries(analytics.activity.messagesByDate).map(([date, count]) => ({
        date,
        messages: count,
      })),
    [analytics]
  );

  const messagesByHour = Array.from({ length: 24 }, (_, hour) => ({
    hour: `${hour}:00`,
    messages: analytics.activity.messagesByHour[hour] || 0,
  }));

  const messagesByDay = Object.entries(
    analytics.activity.messagesByDay
  ).map(([day, count]) => ({
    day,
    messages: count,
  }));

  const responseTimeData = Object.entries(
    analytics.responseTime?.byPerson || {}
  )
    .map(([person, data]) => ({
      person,
      averageResponseMinutes: data.averageResponseMinutes,
      fastestResponseMinutes: data.fastestResponseMinutes,
      totalResponses: data.totalResponses,
    }))
    .sort((a, b) => a.averageResponseMinutes - b.averageResponseMinutes);

  const conversationStarterData =
    analytics.conversationStarters?.byPerson || [];

  const topConversationStarter =
    analytics.conversationStarters?.topStarter || null;

  const messageLengthData = analytics.messageLength?.byPerson || [];

  const longestAverageMessageSender =
    analytics.messageLength?.longestAverageMessageSender || null;

  const participantEntries = Object.entries(messagesPerPerson);

  const mostTalkative =
    participantEntries.length > 0
      ? participantEntries.reduce((a, b) => (b[1] > a[1] ? b : a))
      : null;

  const mostTalkativePercentage =
    mostTalkative && overview.totalMessages > 0
      ? Math.round((mostTalkative[1] / overview.totalMessages) * 100)
      : 0;

  const fastestResponder =
    responseTimeData.length > 0 ? responseTimeData[0] : null;

  const mostUsedEmoji =
    analytics.topEmojis.length > 0 ? analytics.topEmojis[0] : null;

  const mostActiveDay =
    messagesByDay.length > 0
      ? messagesByDay.reduce((a, b) => (b.messages > a.messages ? b : a))
      : null;

  const stats = [
    {
      title: "Total messages",
      value: overview.totalMessages.toLocaleString(),
      icon: MessageCircle,
      tone: "purple" as const,
    },
    {
      title: "Participants",
      value: overview.totalParticipants,
      icon: Users,
      tone: "blue" as const,
    },
    {
      title: "Avg. length",
      value: `${overview.averageMessageLength} chars`,
      icon: FileText,
      tone: "pink" as const,
    },
    {
      title: "Links shared",
      value: overview.totalLinks.toLocaleString(),
      icon: Link2,
      tone: "emerald" as const,
    },
  ];

  const dateRange = overview.dateRange;

  const recordIcon = {
    flame: Flame,
    calendar: CalendarDays,
    trending: TrendingUp,
    type: Type,
  } as const;

  const recordTone = {
    flame: "text-orange-300 ring-orange-400/20 bg-orange-500/12",
    calendar: "text-sky-300 ring-sky-400/20 bg-sky-500/12",
    trending: "text-emerald-300 ring-emerald-400/20 bg-emerald-500/12",
    type: "text-purple-300 ring-purple-400/20 bg-purple-500/12",
  } as const;

  const chatRecords: ChatRecord[] = computeRecords(analytics);

  const vibeMatch = computeVibeMatch(analytics);

  return (
    <section id="dashboard" className="relative min-h-screen pb-24 pt-24">
      <DashboardSidebar
        hiddenIds={!aiEnabled ? ["ask", "facts"] : []}
      />

      {/* pointer-events-none on the column + auto on the inner container:
          the column's transparent left padding must not swallow clicks
          aimed at the sidebar rail (which sits below this column). */}
      <div className="pointer-events-none relative z-10 lg:pl-[240px] xl:pl-[252px]">
        <div className="pointer-events-auto mx-auto max-w-6xl px-4 sm:px-6">
          {/* ====================================================
              DASHBOARD HEADER
          ==================================================== */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <p className="eyebrow text-purple-300">
              ChatScope analysis
            </p>

            <h2 className="mt-2.5 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Conversation{" "}
              <span className="gradient-text inline-block">Overview</span>
            </h2>

            {/* Meta chips */}
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-400">
              {chatMeta && (
                <span className="glass-chip rounded-full px-3 py-1.5">
                  {chatMeta.filename}
                </span>
              )}

              <span className="glass-chip rounded-full px-3 py-1.5">
                {overview.totalMessages.toLocaleString()} messages
              </span>

              <span className="glass-chip rounded-full px-3 py-1.5">
                {overview.totalParticipants} participants
              </span>

              {dateRange?.firstDate && dateRange?.lastDate && (
                <span className="glass-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1.5">
                  <CalendarRange size={12} className="text-purple-300/80" />
                  {dateRange.firstDate}, {dateRange.lastDate}
                  {dateRange.durationDays
                    ? ` · ${dateRange.durationDays.toLocaleString()} days`
                    : ""}
                </span>
              )}

              {aiChip && (
                <span
                  className="glass-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1.5"
                  title={
                    !aiEnabled
                      ? "AI features are turned off, analytics still work"
                      : `Facts: ${aiHealth?.factsStatus ?? "?"} · Semantic index: ${
                          aiHealth?.embeddings?.available ? "ready" : "building/paused"
                        }`
                  }
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${aiChip.dot} shadow-[0_0_6px_currentColor]`}
                  />
                  {aiChip.label}
                </span>
              )}

              {isDemo && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-400/30 bg-purple-500/10 px-3 py-1.5 text-purple-200">
                  <FlaskConical size={12} />
                  Demo data
                </span>
              )}
            </div>

            <div className="mt-6 flex flex-wrap gap-2.5 print:hidden">
              {/* Library dropdown */}
              {onSwitchChat && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={toggleLibrary}
                    aria-expanded={libraryOpen}
                    className="glass-chip inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm text-gray-300 transition-all duration-300 hover:bg-white/[0.08] hover:text-white active:scale-[0.98]"
                  >
                    <History size={14} />
                    Library
                    <ChevronDown
                      size={13}
                      className={`transition-transform duration-300 ${libraryOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {libraryOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setLibraryOpen(false)}
                        aria-hidden="true"
                      />

                      <div className="glass-panel glass-menu absolute left-0 top-full z-50 mt-2 w-80 max-w-[85vw] p-2">
                        <p className="px-3 py-2 text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-gray-500">
                          Saved analyses
                        </p>

                        <div className="max-h-72 overflow-y-auto">
                          {libraryLoading && (
                            <p className="px-3 py-4 text-center text-xs text-gray-500">
                              Loading...
                            </p>
                          )}

                          {!libraryLoading && libraryChats.length === 0 && (
                            <p className="px-3 py-4 text-center text-xs text-gray-500">
                              No saved chats yet.
                            </p>
                          )}

                          {libraryChats.map((chat) => (
                            <div
                              key={chat.id}
                              className={`group flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors ${
                                chat.active ? "bg-purple-500/[0.12]" : "hover:bg-white/[0.05]"
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => handleSwitchChat(chat.id)}
                                disabled={chat.active || switchingTo !== null}
                                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left disabled:cursor-default"
                              >
                                <FileText
                                  size={13}
                                  className={`shrink-0 ${chat.active ? "text-purple-300" : "text-gray-600"}`}
                                />

                                <span className="min-w-0">
                                  <span className="block truncate text-xs font-medium text-gray-200">
                                    {chat.filename}
                                  </span>

                                  <span className="block text-[0.62rem] text-gray-600">
                                    {chat.messageCount.toLocaleString()} messages
                                    {chat.active ? " · currently open" : ""}
                                  </span>
                                </span>
                              </button>

                              {switchingTo === chat.id ? (
                                <RotateCcw size={13} className="shrink-0 animate-spin text-purple-300" />
                              ) : (
                                !chat.active && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteChat(chat.id)}
                                    aria-label={`Delete ${chat.filename}`}
                                    className="shrink-0 rounded-lg p-1.5 text-gray-600 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-300 group-hover:opacity-100"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Share, consolidated share/export menu */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShareMenuOpen((open) => !open)}
                  aria-expanded={shareMenuOpen}
                  aria-label="Share options"
                  className="glass-chip inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm text-gray-300 transition-all duration-300 hover:bg-white/[0.08] hover:text-white active:scale-[0.98]"
                >
                  <Share2 size={14} />
                  Share
                  <ChevronDown
                    size={13}
                    className={`transition-transform duration-300 ${shareMenuOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {shareMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShareMenuOpen(false)}
                      aria-hidden="true"
                    />

                    <div className="glass-panel glass-menu absolute left-0 top-full z-50 mt-2 w-64 max-w-[85vw] p-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShareMenuOpen(false);
                          setWallOpenCount((count) => count + 1);
                          setWallOpen(true);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-gray-300 transition-colors hover:bg-white/[0.05] hover:text-white"
                      >
                        <Megaphone size={14} className="text-amber-300/80" />
                        Publish to the wall
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShareMenuOpen(false);
                          setWrappedOpen(true);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-gray-300 transition-colors hover:bg-white/[0.05] hover:text-white"
                      >
                        <Sparkles size={14} className="text-pink-300/80" />
                        ChatScope Wrapped
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShareMenuOpen(false);
                          setShareCardOpen(true);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-gray-300 transition-colors hover:bg-white/[0.05] hover:text-white"
                      >
                        <ImageDown size={14} className="text-purple-300/80" />
                        Share card
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShareMenuOpen(false);
                          window.print();
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-gray-300 transition-colors hover:bg-white/[0.05] hover:text-white"
                      >
                        <FileDown size={14} className="text-sky-300/80" />
                        Download report (PDF)
                      </button>
                    </div>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={onReset}
                className="glass-chip inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm text-gray-300 transition-all duration-300 hover:bg-white/[0.08] hover:text-white active:scale-[0.98]"
              >
                <RotateCcw size={14} />
                Analyze another chat
              </button>

              {/* AI toggle, analytics-only mode */}
              {settings && (
                <span className="glass-chip inline-flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm text-gray-400">
                  <Zap
                    size={14}
                    className={
                      aiEnabled ? "text-emerald-300" : "text-gray-600"
                    }
                  />
                  AI features
                  <GlassSwitch
                    checked={aiEnabled}
                    onChange={handleAiToggle}
                    label="Toggle AI features"
                    tone={aiEnabled ? "emerald" : "amber"}
                  />
                </span>
              )}

              {/* Overflow: privacy page + destructive purge */}
              <div className="relative">
                  <button
                    type="button"
                    onClick={() => setOverflowOpen((open) => !open)}
                    aria-expanded={overflowOpen}
                    aria-label="More options"
                    className="glass-chip inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm text-gray-300 transition-all duration-300 hover:bg-white/[0.08] hover:text-white active:scale-[0.98]"
                  >
                    <MoreHorizontal size={14} />
                  </button>

                  {overflowOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setOverflowOpen(false)}
                        aria-hidden="true"
                      />

                      <div className="glass-panel glass-menu absolute right-0 top-full z-50 mt-2 w-64 max-w-[85vw] p-2">
                        <a
                          href="#/privacy"
                          onClick={() => setOverflowOpen(false)}
                          className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-gray-300 transition-colors hover:bg-white/[0.05] hover:text-white"
                        >
                          <ShieldCheck size={14} className="text-sky-300/80" />
                          Privacy page
                        </a>

                        <div className="my-1.5 h-px bg-white/[0.06]" />

                        <button
                          type="button"
                          onClick={() => {
                            setOverflowOpen(false);
                            setPurgeOpen(true);
                          }}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-red-300 transition-colors hover:bg-red-500/10"
                        >
                          <Trash2 size={14} />
                          Delete all data...
                        </button>
                      </div>
                    </>
                  )}
                </div>
            </div>

            {/* Purge confirmation modal */}
            <PurgeModal
              open={purgeOpen}
              onClose={() => setPurgeOpen(false)}
              onConfirm={handlePurge}
            />

            {/* Share card modal, social-share image (lazy chunk) */}
            <Suspense fallback={null}>
              <ShareCardModal
                open={shareCardOpen}
                onClose={() => setShareCardOpen(false)}
                analytics={analytics}
                filename={chatMeta?.filename ?? ""}
              />

              {/* Wrapped modal, 9:16 story recap (lazy chunk) */}
              <WrappedModal
                open={wrappedOpen}
                onClose={() => setWrappedOpen(false)}
                analytics={analytics}
                filename={chatMeta?.filename ?? ""}
              />
            </Suspense>

            {/* Wall publish modal, anonymous public stat.
                key bump per open → fresh state each time. */}
            <WallPublishModal
              key={`wall-${wallOpenCount}`}
              open={wallOpen}
              onClose={() => setWallOpen(false)}
            />
          </motion.div>

          {/* ====================================================
              OVERVIEW
          ==================================================== */}
          <section id="overview" className="mt-14 scroll-mt-28">
            <SectionHeader
              index="01"
              title="Overview"
              description="The key numbers and overall rhythm of your conversation."
            />

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {stats.map((stat, index) => {
                const Icon = stat.icon;
                return (
                  <StatCard
                    key={stat.title}
                    icon={Icon}
                    label={stat.title}
                    value={stat.value}
                    index={index}
                    tone={stat.tone}
                  />
                );
              })}
            </div>

            <GlassCard className="mt-5 p-6">
              <h3 className="text-base font-semibold text-white">
                Messages over time
              </h3>

              <p className="mt-1 text-sm text-gray-500">
                How your conversation activity changed day by day.
              </p>

              <div className="mt-6 h-72 w-full sm:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={messagesOverTime}>
                    <CartesianGrid
                      stroke="rgba(255,255,255,0.06)"
                      vertical={false}
                    />

                    <XAxis dataKey="date" {...axisProps} />

                    <YAxis {...axisProps} allowDecimals={false} />

                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      labelStyle={chartLabelStyle}
                    />

                    <Line
                      type="monotone"
                      dataKey="messages"
                      stroke="#a855f7"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
          </section>

          {/* ====================================================
              PARTICIPANTS
          ==================================================== */}
          <section id="participants" className="mt-20 scroll-mt-28">
            <SectionHeader
              index="02"
              title="Participants"
              description="How the conversation is shared, and who replies to whom."
              accent="blue"
            />

            <GlassCard className="p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/12 text-blue-300 ring-1 ring-blue-400/20">
                  <BarChart3 size={19} />
                </div>

                <div>
                  <h3 className="font-semibold text-white">
                    Messages by participant
                  </h3>

                  <p className="text-sm text-gray-500">
                    The share of the conversation each person carries.
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-5">
                {participantEntries.map(([person, count]) => {
                  const percentage =
                    overview.totalMessages > 0
                      ? (count / overview.totalMessages) * 100
                      : 0;

                  return (
                    <div key={person}>
                      <div className="mb-2 flex items-center justify-between gap-4">
                        <span className="text-sm text-gray-300">{person}</span>

                        <span className="text-sm text-gray-500">
                          {count.toLocaleString()} messages ·{" "}
                          {percentage.toFixed(0)}%
                        </span>
                      </div>

                      <div className="h-2 overflow-hidden rounded-full bg-white/[0.07]">
                        <motion.div
                          initial={{ width: 0 }}
                          whileInView={{ width: `${percentage}%` }}
                          viewport={{ once: true }}
                          transition={{ duration: 1, ease: "easeOut" }}
                          className="h-full rounded-full bg-gradient-to-r from-purple-500 to-blue-400"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </GlassCard>

            {/* Vibe match, two-person compatibility (pure computation) */}
            {vibeMatch && (
              <GlassCard className="mt-5 p-6" delay={0.06}>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-500/12 text-pink-300 ring-1 ring-pink-400/20">
                    <HeartHandshake size={19} />
                  </div>

                  <div className="min-w-0">
                    <h3 className="font-semibold text-white">Vibe match</h3>

                    <p className="text-sm text-gray-500">
                      {vibeMatch.names[0]} × {vibeMatch.names[1]}, computed
                      from your conversation's shape.
                    </p>
                  </div>

                  <div className="ml-auto shrink-0 text-right">
                    <p className="text-3xl font-semibold tracking-tight text-white">
                      {vibeMatch.score}
                      <span className="text-base text-gray-500">/100</span>
                    </p>

                    <p className="text-xs font-medium text-pink-300">
                      {vibeMatch.label}
                    </p>
                  </div>
                </div>

                <p className="mt-4 text-sm leading-relaxed text-gray-400">
                  {vibeMatch.blurb}
                </p>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {vibeMatch.parts.map((part) => (
                    <div
                      key={part.label}
                      className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-medium text-gray-300">
                          {part.label}
                        </span>

                        <span className="text-xs text-gray-500">
                          {part.score}
                        </span>
                      </div>

                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                        <motion.div
                          initial={{ width: 0 }}
                          whileInView={{ width: `${part.score}%` }}
                          viewport={{ once: true }}
                          transition={{ duration: 1, ease: "easeOut" }}
                          className="h-full rounded-full bg-gradient-to-r from-pink-400 to-purple-400"
                        />
                      </div>

                      <p className="mt-2 text-xs leading-relaxed text-gray-500">
                        {part.detail}
                      </p>
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}

            {interactionData.length > 0 && (
              <GlassCard className="mt-5 p-6" delay={0.08}>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-300 ring-1 ring-emerald-400/20">
                    <Users size={19} />
                  </div>

                  <div>
                    <h3 className="font-semibold text-white">
                      Who replies to whom
                    </h3>

                    <p className="text-sm text-gray-500">
                      Directed reply flows within conversation windows.
                    </p>
                  </div>
                </div>

                <div className="mt-6 space-y-4">
                  {interactionData.map((pair) => {
                    const maxCount = interactionData[0].count || 1;
                    const percentage = (pair.count / maxCount) * 100;

                    return (
                      <div key={`${pair.from}->${pair.to}`}>
                        <div className="mb-2 flex items-center justify-between gap-4">
                          <span className="text-sm text-gray-300">
                            {pair.from}{" "}
                            <span className="text-gray-600">→</span>{" "}
                            {pair.to}
                          </span>

                          <span className="text-sm text-gray-500">
                            {pair.count.toLocaleString()} replies
                          </span>
                        </div>

                        <div className="h-2 overflow-hidden rounded-full bg-white/[0.07]">
                          <motion.div
                            initial={{ width: 0 }}
                            whileInView={{ width: `${percentage}%` }}
                            viewport={{ once: true }}
                            transition={{ duration: 1, ease: "easeOut" }}
                            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </GlassCard>
            )}
          </section>

          {/* ====================================================
              ACTIVITY
          ==================================================== */}
          <section id="activity" className="mt-20 scroll-mt-28">
            <SectionHeader
              index="03"
              title="Activity"
              description="When your conversations happen, by hour, weekday and month."
              accent="cyan"
            />

            <GlassCard className="p-6">
              <h3 className="text-base font-semibold text-white">
                Messages by hour
              </h3>

              <p className="mt-1 text-sm text-gray-500">
                The clock your chats live on.
              </p>

              <div className="mt-6 h-72 w-full sm:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={messagesByHour}>
                    <CartesianGrid
                      stroke="rgba(255,255,255,0.06)"
                      vertical={false}
                    />

                    <XAxis dataKey="hour" {...axisProps} interval={1} />

                    <YAxis {...axisProps} allowDecimals={false} />

                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      labelStyle={chartLabelStyle}
                      formatter={(value) => [Number(value), "Messages"]}
                    />

                    <Bar dataKey="messages" fill="#a855f7" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>

            <GlassCard className="mt-5 p-6" delay={0.06}>
              <h3 className="text-base font-semibold text-white">
                Messages by day
              </h3>

              <p className="mt-1 text-sm text-gray-500">
                Which days of the week are the most active.
              </p>

              <div className="mt-6 h-72 w-full sm:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={messagesByDay}>
                    <CartesianGrid
                      stroke="rgba(255,255,255,0.06)"
                      vertical={false}
                    />

                    <XAxis dataKey="day" {...axisProps} />

                    <YAxis {...axisProps} allowDecimals={false} />

                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      labelStyle={chartLabelStyle}
                      formatter={(value) => [Number(value), "Messages"]}
                    />

                    <Bar dataKey="messages" fill="#60a5fa" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>

            {monthlyData.length > 1 && (
              <GlassCard className="mt-5 p-6" delay={0.1}>
                <h3 className="text-base font-semibold text-white">
                  Monthly trend
                </h3>

                <p className="mt-1 text-sm text-gray-500">
                  Message volume across months, how the conversation evolved.
                </p>

                <div className="mt-6 h-64 w-full sm:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData}>
                      <CartesianGrid
                        stroke="rgba(255,255,255,0.06)"
                        vertical={false}
                      />

                      <XAxis dataKey="month" {...axisProps} />

                      <YAxis {...axisProps} allowDecimals={false} />

                      <Tooltip
                        contentStyle={chartTooltipStyle}
                        labelStyle={chartLabelStyle}
                        formatter={(value) => [
                          Number(value).toLocaleString(),
                          "Messages",
                        ]}
                      />

                      <Bar
                        dataKey="messages"
                        fill="#c084fc"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </GlassCard>
            )}
          </section>

          {/* ====================================================
              RESPONSE TIME
          ==================================================== */}
          <section id="response-time" className="mt-20 scroll-mt-28">
            <SectionHeader
              index="04"
              title="Response time"
              description="How quickly participants get back to each other."
              accent="amber"
            />

            <GlassCard className="p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/12 text-amber-300 ring-1 ring-amber-400/20">
                  <Clock3 size={19} />
                </div>

                <div>
                  <h3 className="font-semibold text-white">Average response</h3>

                  <p className="text-sm text-gray-500">
                    Lower is faster, measured over every reply window.
                  </p>
                </div>
              </div>

              {responseTimeData.length > 0 ? (
                <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_300px]">
                  <div className="h-72 w-full sm:h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={responseTimeData}>
                        <CartesianGrid
                          stroke="rgba(255,255,255,0.06)"
                          vertical={false}
                        />

                        <XAxis dataKey="person" {...axisProps} />

                        <YAxis
                          {...axisProps}
                          allowDecimals={false}
                          label={{
                            value: "Minutes",
                            angle: -90,
                            position: "insideLeft",
                            fill: "rgba(255,255,255,0.4)",
                          }}
                        />

                        <Tooltip
                          contentStyle={chartTooltipStyle}
                          labelStyle={chartLabelStyle}
                          formatter={(value) => [
                            formatResponseTime(Number(value)),
                            "Avg. response",
                          ]}
                        />

                        <Bar
                          dataKey="averageResponseMinutes"
                          fill="#f59e0b"
                          radius={[6, 6, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="flex flex-col justify-center rounded-2xl border border-white/[0.07] bg-black/20 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                      Per person
                    </p>

                    <div className="mt-4 space-y-4">
                      {responseTimeData.map((person) => (
                        <div
                          key={person.person}
                          className="flex items-center justify-between gap-4"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm text-gray-300">
                              {person.person}
                            </p>

                            <p className="mt-1 text-xs text-gray-600">
                              {person.totalResponses.toLocaleString()} responses
                            </p>
                          </div>

                          <span className="shrink-0 text-sm font-medium text-white">
                            {formatResponseTime(person.averageResponseMinutes)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-6">
                  <EmptyState
                    icon={Gauge}
                    title="Not enough data to calculate response times."
                    hint="Response windows need a few back-and-forth exchanges."
                  />
                </div>
              )}
            </GlassCard>
          </section>

          {/* ====================================================
              CONVERSATION STARTERS
          ==================================================== */}
          <section id="starters" className="mt-20 scroll-mt-28">
            <SectionHeader
              index="05"
              title="Conversation starters"
              description="Who usually sends the first message after a long gap."
              accent="emerald"
            />

            <GlassCard className="p-6">
              {topConversationStarter ? (
                <div className="grid gap-7 lg:grid-cols-[1fr_1fr]">
                  {/* Main result */}
                  <div>
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-300 ring-1 ring-emerald-400/20">
                        <MessagesSquare size={20} />
                      </div>

                      <div>
                        <p className="text-xl font-semibold text-white">
                          {topConversationStarter.person}
                        </p>

                        <p className="text-sm text-gray-500">
                          starts conversations most often
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 flex items-end gap-2">
                      <span className="text-5xl font-bold text-emerald-300">
                        {topConversationStarter.percentage}%
                      </span>

                      <span className="pb-1.5 text-sm text-gray-500">
                        of conversations
                      </span>
                    </div>

                    <p className="mt-2 text-xs text-gray-600">
                      {topConversationStarter.count} out of{" "}
                      {analytics.conversationStarters.totalConversations}{" "}
                      conversations
                    </p>
                  </div>

                  {/* Breakdown */}
                  <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                      Starter breakdown
                    </p>

                    <div className="mt-4 space-y-4">
                      {conversationStarterData.map((person) => (
                        <div key={person.person}>
                          <div className="mb-2 flex items-center justify-between gap-4">
                            <span className="truncate text-sm text-gray-300">
                              {person.person}
                            </span>

                            <span className="shrink-0 text-sm text-gray-500">
                              {person.percentage}%
                            </span>
                          </div>

                          <div className="h-2 overflow-hidden rounded-full bg-white/[0.07]">
                            <motion.div
                              initial={{ width: 0 }}
                              whileInView={{ width: `${person.percentage}%` }}
                              viewport={{ once: true }}
                              transition={{ duration: 1, ease: "easeOut" }}
                              className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon={MessagesSquare}
                  title="Not enough data to determine conversation starters."
                  hint="Starters show up once the chat has a few long gaps."
                />
              )}
            </GlassCard>
          </section>

          {/* ====================================================
              MESSAGE LENGTH
          ==================================================== */}
          <section id="message-length" className="mt-20 scroll-mt-28">
            <SectionHeader
              index="06"
              title="Message length"
              description="Who writes more words per message on average."
              accent="pink"
            />

            <GlassCard className="p-6">
              {longestAverageMessageSender ? (
                <div className="grid gap-7 lg:grid-cols-[1fr_1fr]">
                  {/* Main result */}
                  <div>
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-pink-500/12 text-pink-300 ring-1 ring-pink-400/20">
                        <FileText size={20} />
                      </div>

                      <div>
                        <p className="text-xl font-semibold text-white">
                          {longestAverageMessageSender.person}
                        </p>

                        <p className="text-sm text-gray-500">
                          sends longer messages on average
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 flex items-end gap-2">
                      <span className="text-5xl font-bold text-blue-300">
                        {longestAverageMessageSender.averageMessageLength}
                      </span>

                      <span className="pb-1.5 text-sm text-gray-500">
                        chars / message
                      </span>
                    </div>

                    <p className="mt-2 text-xs text-gray-600">
                      Longest message:{" "}
                      {longestAverageMessageSender.longestMessageLength}{" "}
                      characters
                    </p>
                  </div>

                  {/* Breakdown */}
                  {messageLengthData.length > 0 && (
                    <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                        Average message length
                      </p>

                      <div className="mt-4 space-y-4">
                        {messageLengthData.map((person) => {
                          const maxAverage =
                            longestAverageMessageSender.averageMessageLength ||
                            1;

                          const percentage =
                            (person.averageMessageLength / maxAverage) * 100;

                          return (
                            <div key={person.person}>
                              <div className="mb-2 flex items-center justify-between gap-4">
                                <span className="truncate text-sm text-gray-300">
                                  {person.person}
                                </span>

                                <span className="shrink-0 text-sm text-gray-500">
                                  {person.averageMessageLength} chars
                                </span>
                              </div>

                              <div className="h-2 overflow-hidden rounded-full bg-white/[0.07]">
                                <motion.div
                                  initial={{ width: 0 }}
                                  whileInView={{ width: `${percentage}%` }}
                                  viewport={{ once: true }}
                                  transition={{ duration: 1, ease: "easeOut" }}
                                  className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState
                  icon={FileText}
                  title="Not enough data to calculate message length."
                />
              )}
            </GlassCard>
          </section>

          {/* ====================================================
              FUN INSIGHTS
          ==================================================== */}
          <section id="fun-insights" className="mt-20 scroll-mt-28">
            <SectionHeader
              index="07"
              title="Fun insights"
              description="The little records and quirks that make your conversation yours."
            />

            <div className="grid gap-5 md:grid-cols-2">
              {/* Who talks more */}
              <GlassCard className="p-6" delay={0}>
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-500/12 text-purple-300 ring-1 ring-purple-400/20">
                    <MessageCircle size={20} />
                  </div>

                  <div>
                    <h3 className="font-semibold text-white">Who talks more?</h3>

                    <p className="text-sm text-gray-500">Message share</p>
                  </div>
                </div>

                {mostTalkative ? (
                  <div className="mt-6">
                    <p className="text-xl font-semibold text-white">
                      {mostTalkative[0]}
                    </p>

                    <p className="mt-1 text-sm text-gray-400">
                      sent the most messages
                    </p>

                    <div className="mt-4 flex items-end gap-2">
                      <span className="text-4xl font-bold text-purple-300">
                        {mostTalkativePercentage}%
                      </span>

                      <span className="pb-1 text-sm text-gray-500">
                        of the conversation
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="mt-6 text-sm text-gray-500">Not enough data.</p>
                )}
              </GlassCard>

              {/* Who replies faster */}
              <GlassCard className="p-6" delay={0.06}>
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/12 text-amber-300 ring-1 ring-amber-400/20">
                    <Zap size={20} />
                  </div>

                  <div>
                    <h3 className="font-semibold text-white">
                      Who replies faster?
                    </h3>

                    <p className="text-sm text-gray-500">
                      Average response time
                    </p>
                  </div>
                </div>

                {fastestResponder ? (
                  <div className="mt-6">
                    <p className="text-xl font-semibold text-white">
                      {fastestResponder.person}
                    </p>

                    <p className="mt-1 text-sm text-gray-400">
                      replies the fastest on average
                    </p>

                    <p className="mt-4 text-4xl font-bold text-amber-300">
                      {formatResponseTime(fastestResponder.averageResponseMinutes)}
                    </p>

                    <p className="mt-1 text-xs text-gray-500">
                      average response time
                    </p>
                  </div>
                ) : (
                  <p className="mt-6 text-sm text-gray-500">
                    Not enough data to calculate response time.
                  </p>
                )}
              </GlassCard>

              {/* Most used emoji */}
              <GlassCard className="p-6" delay={0.1}>
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-pink-500/12 text-pink-300 ring-1 ring-pink-400/20">
                    <Sparkles size={20} />
                  </div>

                  <div>
                    <h3 className="font-semibold text-white">Most-used emoji</h3>

                    <p className="text-sm text-gray-500">
                      Your conversation&apos;s favorite
                    </p>
                  </div>
                </div>

                {mostUsedEmoji ? (
                  <div className="mt-6 flex items-center gap-5">
                    <span className="text-6xl">{mostUsedEmoji.emoji}</span>

                    <div>
                      <p className="text-3xl font-bold text-white">
                        {mostUsedEmoji.count.toLocaleString()}
                      </p>

                      <p className="text-sm text-gray-500">times used</p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-6 text-sm text-gray-500">No emojis found.</p>
                )}
              </GlassCard>

              {/* Most active day */}
              <GlassCard className="p-6" delay={0.14}>
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/12 text-blue-300 ring-1 ring-blue-400/20">
                    <Clock3 size={20} />
                  </div>

                  <div>
                    <h3 className="font-semibold text-white">Most active day</h3>

                    <p className="text-sm text-gray-500">
                      Your busiest day of the week
                    </p>
                  </div>
                </div>

                {mostActiveDay ? (
                  <div className="mt-6">
                    <p className="text-3xl font-bold text-white">
                      {mostActiveDay.day}
                    </p>

                    <p className="mt-2 text-sm text-gray-500">
                      {mostActiveDay.messages.toLocaleString()} messages
                    </p>
                  </div>
                ) : (
                  <p className="mt-6 text-sm text-gray-500">Not enough data.</p>
                )}
              </GlassCard>

              {/* Conversation extras */}
              <GlassCard className="p-6 md:col-span-2" delay={0.18}>
                <h3 className="font-semibold text-white">Conversation extras</h3>

                <div className="mt-5 grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-2xl font-semibold text-white sm:text-3xl">
                      {overview.mediaMessages.toLocaleString()}
                    </p>

                    <p className="mt-1 text-xs text-gray-500">Media</p>
                  </div>

                  <div>
                    <p className="text-2xl font-semibold text-white sm:text-3xl">
                      {overview.deletedMessages.toLocaleString()}
                    </p>

                    <p className="mt-1 text-xs text-gray-500">Deleted</p>
                  </div>

                  <div>
                    <p className="text-2xl font-semibold text-white sm:text-3xl">
                      {overview.totalCharacters.toLocaleString()}
                    </p>

                    <p className="mt-1 text-xs text-gray-500">Characters</p>
                  </div>
                </div>
              </GlassCard>
            </div>
          </section>

          {/* ====================================================
              PEOPLE FACTS
          ==================================================== */}
          {!aiEnabled ? (
            <section id="facts" className="mt-20 scroll-mt-28">
              <SectionHeader
                index="08"
                title="Facts about each person"
                description="The five most interesting facts the chat reveals about every participant."
                accent="amber"
              />

              <GlassCard className="p-8 text-center" hover={false}>
                <Sparkles size={22} className="mx-auto text-gray-600" />
                <p className="mt-3 text-sm text-gray-400">
                  AI facts are turned off. Your analytics still work, flip
                  the AI switch in the header to bring facts and Ask Your
                  Chat back.
                </p>
              </GlassCard>
            </section>
          ) : (
            <section id="facts" className="mt-20 scroll-mt-28">
              <SectionHeader
                index="08"
                title="Facts about each person"
                description="The five most interesting facts the chat reveals about every participant."
                accent="amber"
              />

              <FactsSection participants={overview.participants} />
            </section>
          )}

          {/* ====================================================
              WORDS & EMOJIS
          ==================================================== */}
          <section id="words-emojis" className="mt-20 scroll-mt-28">
            <SectionHeader
              index="09"
              title="Words & emojis"
              description="The vocabulary and reactions that define this conversation."
              accent="cyan"
            />

            <GlassCard className="p-6">
              <h3 className="font-semibold text-white">Most used words</h3>

              <div className="mt-6 flex flex-wrap items-baseline justify-center gap-x-4 gap-y-2">
                {analytics.topWords.slice(0, 24).map((item, index) => {
                  const scale = item.count / maxWordCount;

                  return (
                    <motion.span
                      key={item.word}
                      initial={{ opacity: 0, scale: 0.4, y: 10 }}
                      whileInView={{
                        opacity: 0.55 + scale * 0.45,
                        scale: 1,
                        y: 0,
                      }}
                      viewport={{ once: true, margin: "-40px" }}
                      transition={{
                        duration: 0.45,
                        delay: index * 0.04,
                        type: "spring",
                        stiffness: 300,
                        damping: 20,
                      }}
                      whileHover={{ scale: 1.18, opacity: 1 }}
                      className={`${wordCloudColors[index % wordCloudColors.length]} leading-tight`}
                      style={{
                        fontSize: `${11 + scale * 20}px`,
                      }}
                      title={`${item.count} uses`}
                    >
                      {item.word}
                    </motion.span>
                  );
                })}
              </div>

              {Object.keys(wordsByPerson).length > 0 && (
                <div className="mt-8 border-t border-white/[0.07] pt-6">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-gray-500">
                    Signature words by person
                  </p>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {Object.entries(wordsByPerson).map(([person, words]) => (
                      <div
                        key={person}
                        className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4"
                      >
                        <p className="text-sm font-medium text-gray-300">
                          {person}
                        </p>

                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {words.slice(0, 8).map((item) => (
                            <span
                              key={item.word}
                              className="glass-chip rounded-md px-2 py-1 text-xs text-gray-400"
                            >
                              {item.word}
                              <span className="ml-1 text-gray-600">
                                {item.count}
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </GlassCard>

            <GlassCard className="mt-5 p-6" delay={0.08}>
              <h3 className="font-semibold text-white">Top emojis</h3>

              {analytics.topEmojis.length > 0 ? (
                <div className="mt-5 flex flex-wrap gap-3">
                  {analytics.topEmojis.map((item) => (
                    <div
                      key={item.emoji}
                      className="glass-chip flex items-center gap-2.5 rounded-xl px-4 py-3 transition-transform duration-300 hover:scale-105"
                    >
                      <span className="text-2xl">{item.emoji}</span>

                      <span className="text-sm text-gray-400">{item.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-5">
                  <EmptyState
                    icon={Smile}
                    title="No emojis found in this conversation."
                  />
                </div>
              )}
            </GlassCard>
          </section>

          {/* ====================================================
              HIGHLIGHTS, records of the chat
          ==================================================== */}
          <section id="highlights" className="mt-20 scroll-mt-28">
            <SectionHeader
              index="10"
              title="Highlights"
              description="The records worth remembering, streaks, spikes and the messages behind them."
              accent="purple"
            />

            {/* Records strip, pure-computation personal records */}
            {chatRecords.length > 0 && (
              <div className="mb-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {chatRecords.map((record, index) => {
                  const Icon = recordIcon[record.icon];
                  return (
                    <GlassCard key={record.label} className="p-6" delay={index * 0.06}>
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-xl ring-1 ${recordTone[record.icon]}`}
                        >
                          <Icon size={18} />
                        </div>
                        <p className="eyebrow text-gray-400">{record.label}</p>
                      </div>

                      <p className="mt-4 flex items-baseline gap-1.5">
                        <span className="text-3xl font-semibold tracking-tight text-white">
                          {record.value}
                        </span>
                        <span className="text-sm text-gray-500">{record.unit}</span>
                      </p>

                      {record.sub && (
                        <p className="mt-2 text-xs text-gray-500">{record.sub}</p>
                      )}
                    </GlassCard>
                  );
                })}
              </div>
            )}

            <div className="grid gap-5 lg:grid-cols-2">
              {analytics.longestMessage && (
                <GlassCard className="p-6">
                  <p className="eyebrow text-purple-300">Longest message</p>

                  <p className="mt-4 text-[0.95rem] leading-relaxed text-gray-300">
                    &quot;{analytics.longestMessage.message}&quot;
                  </p>

                  <p className="mt-4 text-sm text-gray-500">
                    {analytics.longestMessage.sender} ·{" "}
                    {analytics.longestMessage.date} {analytics.longestMessage.time}
                  </p>
                </GlassCard>
              )}

              {analytics.responseTime?.fastestResponse && (
                <GlassCard className="p-6" delay={0.08}>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/12 text-amber-300 ring-1 ring-amber-400/20">
                      <Zap size={18} />
                    </div>

                    <div>
                      <p className="eyebrow text-amber-300">
                        Fastest response ever
                      </p>

                      <h3 className="mt-1 text-lg font-semibold text-white">
                        {formatResponseTime(
                          analytics.responseTime.fastestResponse.responseMinutes
                        )}
                      </h3>
                    </div>
                  </div>

                  <div className="mt-5 space-y-3">
                    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                      <p className="text-[0.65rem] uppercase tracking-[0.18em] text-gray-600">
                        Previous message
                      </p>

                      <p className="mt-2 text-sm leading-relaxed text-gray-300">
                        &quot;{analytics.responseTime.fastestResponse.previousMessage}&quot;
                      </p>

                      <p className="mt-2 text-xs text-gray-500">
                        {analytics.responseTime.fastestResponse.previousSender}
                      </p>
                    </div>

                    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                      <p className="text-[0.65rem] uppercase tracking-[0.18em] text-gray-600">
                        Response
                      </p>

                      <p className="mt-2 text-sm leading-relaxed text-gray-300">
                        &quot;{analytics.responseTime.fastestResponse.responseMessage}&quot;
                      </p>

                      <p className="mt-2 text-xs text-gray-500">
                        {analytics.responseTime.fastestResponse.responder} ·{" "}
                        {analytics.responseTime.fastestResponse.date}{" "}
                        {analytics.responseTime.fastestResponse.time}
                      </p>
                    </div>
                  </div>
                </GlassCard>
              )}

              {!analytics.longestMessage &&
                !analytics.responseTime?.fastestResponse && (
                  <div className="lg:col-span-2">
                    <EmptyState
                      icon={Trophy}
                      title="No records to show yet."
                      hint="Highlights appear once there are enough messages."
                    />
                  </div>
                )}
            </div>
          </section>

          {/* ====================================================
              EXPLORE MESSAGES
          ==================================================== */}
          <section id="explore" className="mt-20 scroll-mt-28 print:hidden">
            <SectionHeader
              index="11"
              title="Explore the conversation"
              description="Search and filter the raw messages behind every insight."
              accent="cyan"
            />

            <MessageBrowser participants={overview.participants} />
          </section>

          {/* ====================================================
              ASK YOUR CHAT (hidden in analytics-only mode)
          ==================================================== */}
          {aiEnabled && (
            <section id="ask" className="mt-20 scroll-mt-28">
              <SectionHeader
                index="12"
                title="Ask Your Chat"
                description="Natural-language answers, grounded in the actual messages."
                accent="purple"
              />

              <AskYourChat suggestions={suggestions} chatMeta={chatMeta} />
            </section>
          )}

          {/* ====================================================
              SETTINGS (privacy controls)
          ==================================================== */}
          <section id="settings" className="mt-20 scroll-mt-28">
            <SectionHeader
              index="13"
              title="Settings"
              description="Privacy controls for AI features."
              accent="cyan"
            />

            <div className="mt-6">
              <SettingsPanel
                settings={settings}
                onSettingsChange={onSettingsChange}
              />
            </div>
          </section>

          {/* Footer */}
          <footer className="mt-20 border-t border-white/[0.06] pt-8 text-center">
            <p className="text-xs text-gray-600">
              ChatScope · AI conversation intelligence, your data stays on
              your device.
            </p>

            <a
              href="#/privacy"
              className="mt-2 inline-block text-xs text-gray-500 underline-offset-4 transition-colors hover:text-gray-300 hover:underline"
            >
              Read the privacy page
            </a>
          </footer>
        </div>
      </div>
    </section>
  );
}

export default Dashboard;
