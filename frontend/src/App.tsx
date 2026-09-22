import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";

import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import LandingSections from "./components/LandingSections";
import UploadSection from "./components/UploadSection";
// Code-split: the dashboard (and its heavy recharts dependency) only
// loads once a chat has actually been analyzed.
const Dashboard = lazy(() => import("./components/Dashboard"));
import ErrorBoundary from "./components/ErrorBoundary";
import AnimatedBackground from "./components/AnimatedBackground";
import ScrollProgress from "./components/ui/ScrollProgress";
// Code-split: only fetched when the visitor opens the privacy page
const PrivacyPage = lazy(() => import("./components/PrivacyPage"));
import WallMarquee from "./components/WallMarquee";
import IcebergSection from "./components/IcebergSection";
import { ToastProvider } from "./components/ui/Toast";
import { friendlyError } from "./lib/errors";
import {
  chatApi,
  type Analytics,
  type AppSettings,
  type LibraryEntry,
} from "./lib/api";

type ChatMeta = {
  filename: string;
  messageCount: number;
};


function App() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [chatMeta, setChatMeta] = useState<ChatMeta | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isDemo, setIsDemo] = useState(false);

  // User settings (AI on/off etc.), shared with the Dashboard
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

  const [switchingChat, setSwitchingChat] = useState(false);

  // Anonymous visitor counter for the landing footer (self-hosted,
  // aggregate numbers only — see backend/visitors.js)
  const [visitorCount, setVisitorCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    chatApi
      .visitorStats()
      .then((stats) => {
        if (!cancelled) setVisitorCount(stats.totalVisitors);
      })
      .catch(() => {
        // counter unreachable — footer just shows without it
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ------------------------------------------------
  // PRIVACY MODEL: no accounts, no sessions, no sign-in. Every visitor
  // is a guest; nothing chat-related persists anywhere.

  // Accent tone: one data-attribute layer in index.css (purple default
  // = pixel-identical). Applied from the shared settings.
  useEffect(() => {
    const tone = appSettings?.accentTone;
    if (tone && tone !== "purple") {
      document.documentElement.setAttribute("data-accent", tone);
    } else {
      document.documentElement.removeAttribute("data-accent");
    }
  }, [appSettings?.accentTone]);

  // Privacy page via hash routing (#/privacy)
  const [showPrivacy, setShowPrivacy] = useState(() =>
    window.location.hash === "#/privacy"
  );

  const exitPrivacy = useCallback(() => {
    setShowPrivacy(false);
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      setShowPrivacy(window.location.hash === "#/privacy");
    };

    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Load settings on boot
  useEffect(() => {
    let cancelled = false;

    chatApi
      .settings()
      .then((settings) => {
        if (!cancelled) setAppSettings(settings);
      })
      .catch(() => {
        // offline backend — defaults apply
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // NOTE: the app intentionally always starts on the landing page.
  // The backend keeps the last chat warm for its own caches, but a page
  // load or refresh must never drop the user back into an old report.
  const handleAnalysisComplete = (
    data: Analytics,
    meta: ChatMeta,
    nextSuggestions?: string[],
    demo = false
  ) => {
    setAnalytics(data);
    setChatMeta(meta);
    setSuggestions(nextSuggestions || []);
    setIsDemo(demo);

    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }, 60);
  };

  const [switchError, setSwitchError] = useState("");
  const switchErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSwitchError = (message: string) => {
    setSwitchError(message);
    if (switchErrorTimer.current) clearTimeout(switchErrorTimer.current);
    switchErrorTimer.current = setTimeout(() => setSwitchError(""), 4000);
  };

  const handleSelectRecent = async (entry: LibraryEntry) => {
    if (switchingChat) return;
    setSwitchingChat(true);
    setSwitchError("");

    try {
      const result = await chatApi.selectChat(entry.id);
      handleAnalysisComplete(
        result.analytics,
        { filename: result.filename, messageCount: result.messageCount },
        result.suggestions
      );
    } catch (error) {
      showSwitchError(friendlyError(error, "Could not open that chat."));
    } finally {
      setSwitchingChat(false);
    }
  };

  const handleSwitchChat = async (id: string) => {
    try {
      const result = await chatApi.selectChat(id);
      setAnalytics(result.analytics);
      setChatMeta({
        filename: result.filename,
        messageCount: result.messageCount,
      });
      setSuggestions(result.suggestions || []);
      setIsDemo(false);
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    } catch (error) {
      showSwitchError(friendlyError(error, "Could not switch to that chat."));
    }
  };

  const handleReset = () => {
    setAnalytics(null);
    setChatMeta(null);
    setSuggestions([]);
    setIsDemo(false);

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const showDashboard = Boolean(analytics);

  // ---------------------------------------------- PRIVACY PAGE
  if (showPrivacy) {
    return (
      <MotionConfig reducedMotion="user">
        <ToastProvider>
          <div className="relative min-h-screen">
            <AnimatedBackground />
            <ScrollProgress />
            <ErrorBoundary>
              <Suspense fallback={null}>
                <PrivacyPage onExit={exitPrivacy} />
              </Suspense>
            </ErrorBoundary>
          </div>
        </ToastProvider>
      </MotionConfig>
    );
  }

  // ---------------------------------------------- NORMAL APP
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <div className="relative min-h-screen">
          {/* One continuous environment behind every screen */}
          <AnimatedBackground />

          <ScrollProgress />

          {/* Chat switch / open failure (App sits above the toast provider) */}
          <AnimatePresence>
            {switchError && (
              <motion.div
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="fixed left-1/2 top-20 z-[60] -translate-x-1/2 rounded-xl border border-red-500/25 bg-[#1a0b12]/95 px-4 py-2.5 text-sm text-red-300 shadow-[0_18px_45px_-20px_rgba(0,0,0,0.9)] print:hidden"
                role="alert"
              >
                {switchError}
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {!showDashboard ? (
              <motion.div
                key="landing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, y: -18 }}
                transition={{ duration: 0.45 }}
                className="relative z-10"
              >
                <Navbar
                />

                <main>
                  <Hero />
                  <WallMarquee />
                  <IcebergSection />
                  <LandingSections />
                <UploadSection
                  onAnalysisComplete={handleAnalysisComplete}
                  onSelectRecent={handleSelectRecent}
                  onStartDemo={(analyticsData, meta, nextSuggestions) =>
                    handleAnalysisComplete(
                      analyticsData,
                      meta,
                      nextSuggestions,
                      true
                    )
                  }
                />
                </main>

                <footer className="relative z-10 border-t border-white/[0.05] px-6 py-10 text-center">
                  <p className="text-xs tracking-wide text-gray-600">
                    {visitorCount !== null &&
                      `${visitorCount.toLocaleString()} ${visitorCount === 1 ? "conversation" : "conversations"} explored · `}
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
              </motion.div>
            ) : (
              analytics && (
                <motion.div
                  key="dashboard"
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.55, ease: [0.21, 0.6, 0.35, 1] }}
                  className="relative z-10"
                >
                  <ErrorBoundary>
                    <Suspense
                      fallback={
                        <div className="flex min-h-[60vh] items-center justify-center gap-3 text-sm text-gray-400">
                          <motion.span
                            animate={{ opacity: [0.4, 1, 0.4] }}
                            transition={{ duration: 1.4, repeat: Infinity }}
                            className="h-2 w-2 rounded-full bg-purple-400"
                          />
                          Building your dashboard...
                        </div>
                      }
                    >
                      <Dashboard
                        analytics={analytics}
                        chatMeta={chatMeta}
                        suggestions={suggestions}
                        onReset={handleReset}
                        onSwitchChat={handleSwitchChat}
                        isDemo={isDemo}
                        settings={appSettings}
                        onSettingsChange={setAppSettings}
                      />
                    </Suspense>
                  </ErrorBoundary>
                </motion.div>
              )
            )}
          </AnimatePresence>
        </div>
      </ToastProvider>
    </MotionConfig>
  );
}

export default App;
