import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download, MessageCircle, X } from "lucide-react";
import { downloadNodeAsPng } from "../../lib/cardExport";
import { computeRecords } from "../../lib/records";
import { computeVibeMatch } from "../../lib/vibe";
import type { Analytics } from "../../lib/api";

type WrappedModalProps = {
  open: boolean;
  onClose: () => void;
  analytics: Analytics;
  filename: string;
};

const CARD_W = 1080;
const CARD_H = 1920;

const COLORS = {
  bg: "#07060c",
  text: "#f4f2fa",
  secondary: "#a7a4b4",
  muted: "#6d6a7c",
  tile: "rgba(255,255,255,0.04)",
  tileBorder: "rgba(255,255,255,0.09)",
  glow1: "rgba(168,85,247,0.30)",
  glow2: "rgba(236,72,153,0.22)",
  glow3: "rgba(96,165,250,0.16)",
};

function cleanTitle(filename: string): string {
  return (
    String(filename || "Your chat")
      .replace(/\.txt$/i, "")
      .replace(/^WhatsApp Chat with /i, "")
      .trim() || "Your chat"
  );
}

function monthLabel(monthKey: string): string {
  const m = Number(monthKey.split("-")[1]);
  return ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"][m - 1] ?? "";
}

/**
 * ChatScope Wrapped, a 1080×1920 (9:16, story-native) recap of the chat:
 * monthly rhythm chart, personal records, emoji of the year and top words.
 * Same capture approach as the Share card: DOM rendered at full size,
 * exported with html-to-image. Pure computation, no AI, no backend.
 */
function WrappedModal({ open, onClose, analytics, filename }: WrappedModalProps) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [previewWidth, setPreviewWidth] = useState(0);
  const captureRef = useRef<HTMLDivElement>(null);
  const previewBoxRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setError("");
    setWorking(false);
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const box = previewBoxRef.current;
    if (!box) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setPreviewWidth(width);
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [open]);

  const title = useMemo(() => cleanTitle(filename), [filename]);
  const records = useMemo(() => computeRecords(analytics), [analytics]);

  const months = useMemo(() => {
    const list = [...(analytics.monthlyTrends || [])].slice(-12);
    const max = Math.max(1, ...list.map((m) => m.count));
    return list.map((m) => ({ ...m, pct: Math.round((m.count / max) * 100) }));
  }, [analytics]);

  const topEmoji = analytics.topEmojis?.[0];
  const topEmojis = (analytics.topEmojis || []).slice(1, 5);
  const topWords = (analytics.topWords || []).slice(0, 6);
  const vibe = useMemo(() => computeVibeMatch(analytics), [analytics]);

  const handleDownload = async () => {
    if (!captureRef.current || working) return;
    setWorking(true);
    setError("");
    const slug =
      title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") ||
      "chat";
    try {
      await downloadNodeAsPng(captureRef.current, {
        width: CARD_W,
        height: CARD_H,
        slug: `wrapped-${slug}`,
      });
    } catch {
      setError("Could not render the image. Please try again.");
    } finally {
      setWorking(false);
    }
  };

  const card = (
    <div
      style={{
        width: CARD_W,
        height: CARD_H,
        backgroundColor: COLORS.bg,
        backgroundImage: [
          `radial-gradient(circle at 15% 6%, ${COLORS.glow1}, transparent 45%)`,
          `radial-gradient(circle at 90% 96%, ${COLORS.glow2}, transparent 42%)`,
          `radial-gradient(circle at 85% 40%, ${COLORS.glow3}, transparent 40%)`,
        ].join(", "),
        color: COLORS.text,
        fontFamily: '"Red Rose", Georgia, serif',
        padding: "72px 76px",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {/* Brand row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 58,
              height: 58,
              borderRadius: 17,
              background: "linear-gradient(135deg, #a855f7, #ec4899, #60a5fa)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MessageCircle size={30} color="#ffffff" strokeWidth={2.2} />
          </div>
          <span style={{ fontSize: 31, fontWeight: 600, letterSpacing: -0.5 }}>
            ChatScope
          </span>
        </div>
        <span
          style={{
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: COLORS.secondary,
          }}
        >
          Wrapped
        </span>
      </div>

      {/* Title */}
      <div style={{ marginTop: 56 }}>
        <p style={{ margin: 0, fontSize: 24, letterSpacing: 7, textTransform: "uppercase", color: "#c084fc" }}>
          {title}
        </p>
        <h1
          style={{
            margin: "14px 0 0",
            fontSize: 96,
            lineHeight: 1.0,
            fontWeight: 700,
            letterSpacing: -2.5,
            backgroundImage: "linear-gradient(90deg, #c084fc, #ec4899, #60a5fa)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          Your year
          <br />
          in messages.
        </h1>
      </div>

      {/* Hero number */}
      <div style={{ marginTop: 48, display: "flex", alignItems: "baseline", gap: 22 }}>
        <span style={{ fontSize: 132, fontWeight: 700, letterSpacing: -4, lineHeight: 1 }}>
          {analytics.overview.totalMessages.toLocaleString()}
        </span>
        <span style={{ fontSize: 32, color: COLORS.secondary }}>
          messages
          {analytics.overview.totalParticipants
            ? ` · ${analytics.overview.totalParticipants} people`
            : ""}
        </span>
      </div>

      {/* Monthly rhythm */}
      {months.length > 1 && (
        <div
          style={{
            marginTop: 52,
            backgroundColor: COLORS.tile,
            border: `1px solid ${COLORS.tileBorder}`,
            borderRadius: 28,
            padding: "32px 36px 24px",
          }}
        >
          <p style={{ margin: 0, fontSize: 19, letterSpacing: 4, textTransform: "uppercase", color: COLORS.muted }}>
            The monthly rhythm
          </p>
          <div
            style={{
              marginTop: 26,
              display: "flex",
              alignItems: "flex-end",
              gap: 10,
              height: 180,
            }}
          >
            {months.map((m) => (
              <div
                key={m.month}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                  height: "100%",
                  justifyContent: "flex-end",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    height: `${Math.max(4, m.pct)}%`,
                    borderRadius: 10,
                    background: "linear-gradient(180deg, #c084fc, #7c3aed)",
                  }}
                />
                <span style={{ fontSize: 19, color: COLORS.muted }}>
                  {monthLabel(m.month)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Records grid, flexes to absorb slack */}
      <div
        style={{
          marginTop: 44,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridAutoRows: "1fr",
          gap: 20,
          flex: 1,
          minHeight: 0,
        }}
      >
        {records.map((record) => (
          <div
            key={record.label}
            style={{
              backgroundColor: COLORS.tile,
              border: `1px solid ${COLORS.tileBorder}`,
              borderRadius: 24,
              padding: "24px 30px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 8,
              minWidth: 0,
              overflow: "hidden",
            }}
          >
            <p style={{ margin: 0, fontSize: 18, letterSpacing: 3, textTransform: "uppercase", color: COLORS.muted }}>
              {record.label}
            </p>
            <p style={{ margin: 0, fontSize: 46, fontWeight: 700, letterSpacing: -1, lineHeight: 1.1 }}>
              {record.value}
              <span style={{ fontSize: 24, fontWeight: 400, color: COLORS.secondary, marginLeft: 8 }}>
                {record.unit}
              </span>
            </p>
            {record.sub && (
              <p style={{ margin: 0, fontSize: 20, color: COLORS.secondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {record.sub}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Vibe match strip, only for two-person chats */}
      {vibe && (
        <div
          style={{
            marginTop: 32,
            display: "flex",
            alignItems: "center",
            gap: 28,
            backgroundColor: COLORS.tile,
            border: `1px solid ${COLORS.tileBorder}`,
            borderRadius: 28,
            padding: "26px 36px",
          }}
        >
          <div
            style={{
              fontSize: 64,
              fontWeight: 700,
              letterSpacing: -2,
              backgroundImage: "linear-gradient(90deg, #f472b6, #c084fc)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              whiteSpace: "nowrap",
            }}
          >
            {vibe.score}
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 19, letterSpacing: 4, textTransform: "uppercase", color: COLORS.muted }}>
              Vibe match · {vibe.names[0]} × {vibe.names[1]}
            </p>
            <p style={{ margin: "6px 0 0", fontSize: 30, fontWeight: 700 }}>
              {vibe.label}
            </p>
          </div>
        </div>
      )}

      {/* Emoji of the year */}
      {topEmoji && (
        <div
          style={{
            marginTop: 40,
            display: "flex",
            alignItems: "center",
            gap: 32,
            backgroundColor: COLORS.tile,
            border: `1px solid ${COLORS.tileBorder}`,
            borderRadius: 28,
            padding: "28px 40px",
          }}
        >
          <div style={{ fontSize: 110, lineHeight: 1 }}>{topEmoji.emoji}</div>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 19, letterSpacing: 4, textTransform: "uppercase", color: COLORS.muted }}>
              Emoji of the chat
            </p>
            <p style={{ margin: "8px 0 0", fontSize: 34, fontWeight: 700 }}>
              {topEmoji.count.toLocaleString()} times
            </p>
            {topEmojis.length > 0 && (
              <p style={{ margin: "10px 0 0", fontSize: 40, letterSpacing: 6 }}>
                {topEmojis.map((e) => e.emoji).join(" ")}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Top words */}
      {topWords.length > 0 && (
        <div style={{ marginTop: 32, display: "flex", flexWrap: "wrap", gap: 14 }}>
          {topWords.map((w) => (
            <span
              key={w.word}
              style={{
                fontSize: 26,
                padding: "12px 26px",
                borderRadius: 999,
                border: `1px solid ${COLORS.tileBorder}`,
                backgroundColor: COLORS.tile,
                color: COLORS.text,
              }}
            >
              {w.word}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: 36 }}>
        <div style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />
        <div
          style={{
            marginTop: 22,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: 22, color: COLORS.secondary }}>
            Your conversations. Finally understood.
          </span>
          <span style={{ fontSize: 22, fontWeight: 600, color: "#c084fc" }}>
            made with ChatScope
          </span>
        </div>
      </div>
    </div>
  );

  const previewScale = previewWidth > 0 ? previewWidth / CARD_W : 0;

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
            aria-label="ChatScope Wrapped"
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.3, ease: [0.21, 0.6, 0.35, 1] }}
            className="glass-panel glass-sheen fixed left-1/2 top-1/2 z-[90] max-h-[94vh] w-[92vw] max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-white">ChatScope Wrapped</h3>
                <p className="mt-1 text-xs leading-relaxed text-gray-400">
                  A 9:16 story recap of your chat, monthly rhythm, records and
                  the emoji of the year. Made for stories and reels.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close Wrapped"
                className="glass-chip rounded-xl p-2 text-gray-400 transition-all duration-300 hover:bg-white/[0.08] hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div ref={previewBoxRef} className="mt-5 w-full">
              <div
                className="mx-auto w-full overflow-hidden rounded-2xl border border-white/10"
                style={{ height: previewScale > 0 ? previewWidth * (CARD_H / CARD_W) : undefined }}
              >
                <div
                  style={{
                    transform: `scale(${previewScale})`,
                    transformOrigin: "top left",
                    width: CARD_W,
                    visibility: previewScale > 0 ? "visible" : "hidden",
                  }}
                >
                  {card}
                </div>
              </div>
            </div>

            {error && (
              <p className="mt-3 text-center text-xs text-red-300">{error}</p>
            )}

            <div className="mt-5 flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleDownload}
                disabled={working || previewScale === 0}
                className="glass-chip inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-all duration-300 hover:bg-white/[0.08] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download size={14} className="text-pink-300" />
                {working ? "Rendering..." : "Download story"}
              </button>
              <button
                type="button"
                onClick={close}
                className="glass-chip rounded-xl px-4 py-2.5 text-sm text-gray-300 transition-all duration-300 hover:bg-white/[0.08] hover:text-white active:scale-[0.98]"
              >
                Cancel
              </button>
            </div>
          </motion.div>

          {/* Full-size hidden render, the capture source. The off-screen
              offset MUST live on this wrapper, not on the captured node:
              html-to-image preserves the node's own position in the clone. */}
          <div
            aria-hidden="true"
            style={{
              position: "fixed",
              left: -20000,
              top: 0,
              pointerEvents: "none",
              opacity: open ? 1 : 0,
            }}
          >
            <div ref={captureRef}>{card}</div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

export default WrappedModal;
