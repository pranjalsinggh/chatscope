import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download, MessageCircle, X } from "lucide-react";
import { downloadNodeAsPng } from "../../lib/cardExport";
import type { Analytics } from "../../lib/api";

type ShareCardModalProps = {
  open: boolean;
  onClose: () => void;
  analytics: Analytics;
  filename: string;
};

const CARD_W = 1080;
const CARD_H = 1350;

/* Card palette, matches index.css design tokens (void, glow trio) */
const COLORS = {
  bg: "#07060c",
  text: "#f4f2fa",
  secondary: "#a7a4b4",
  muted: "#6d6a7c",
  tile: "rgba(255,255,255,0.04)",
  tileBorder: "rgba(255,255,255,0.09)",
  glow1: "rgba(168,85,247,0.30)",
  glow2: "rgba(236,72,153,0.20)",
  glow3: "rgba(96,165,250,0.16)",
};

function firstName(full: string): string {
  const first = String(full || "").trim().split(/\s+/)[0];
  return first || "Someone";
}

function cleanTitle(filename: string): string {
  return String(filename || "Your chat")
    .replace(/\.txt$/i, "")
    .replace(/^WhatsApp Chat with /i, "")
    .trim() || "Your chat";
}

function formatHourRange(hour: number): string {
  const fmt = (h: number) => {
    const norm = ((h % 24) + 24) % 24;
    if (norm === 0) return "12 AM";
    if (norm === 12) return "12 PM";
    return norm < 12 ? `${norm} AM` : `${norm - 12} PM`;
  };
  return `${fmt(hour)} to ${fmt(hour + 1)}`;
}

function formatMinutes(minutes: number): string {
  if (minutes < 1) return `${Math.max(1, Math.round(minutes * 60))} sec`;
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`;
}

type CardTile = { label: string; value: string; sub?: string };

/**
 * Share card, a 1080×1350 (4:5, Instagram-native) image summarising the
 * chat's identity, styled in the app's dark liquid-glass language. Rendered
 * as DOM and exported with html-to-image (foreignObject, the browser does
 * the rendering, so gradients, Red Rose and emoji all survive the export).
 * Participant names are shortened to first names on the card for privacy.
 */
function ShareCardModal({ open, onClose, analytics, filename }: ShareCardModalProps) {
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

  // Keep the preview scaled to its container (0 when unmeasured → hidden)
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

  const tiles = useMemo<CardTile[]>(() => {
    const { overview, messagesPerPerson, activity, responseTime, conversationStarters, topEmojis } =
      analytics;

    const result: CardTile[] = [];

    const topChatter = Object.entries(messagesPerPerson).sort((a, b) => b[1] - a[1])[0];
    result.push({
      label: "People in the chat",
      value: String(overview.totalParticipants),
      sub: topChatter ? `most messages: ${firstName(topChatter[0])}` : undefined,
    });

    const days = overview.dateRange?.durationDays;
    if (days) {
      result.push({
        label: "Days of conversation",
        value: days.toLocaleString(),
        sub:
          overview.dateRange?.firstDate && overview.dateRange?.lastDate
            ? `${overview.dateRange.firstDate} → ${overview.dateRange.lastDate}`
            : undefined,
      });
    }

    const hourCounts = activity.messagesByHour;
    const peakHour = Object.keys(hourCounts)
      .map(Number)
      .sort((a, b) => (hourCounts[String(b)] ?? 0) - (hourCounts[String(a)] ?? 0))[0];
    if (peakHour !== undefined) {
      result.push({ label: "Peak texting hour", value: formatHourRange(peakHour) });
    }

    const fastest = Object.entries(responseTime.byPerson)
      .filter(([, stats]) => stats.averageResponseMinutes > 0)
      .sort((a, b) => a[1].averageResponseMinutes - b[1].averageResponseMinutes)[0];
    if (fastest) {
      result.push({
        label: "Fastest average reply",
        value: firstName(fastest[0]),
        sub: formatMinutes(fastest[1].averageResponseMinutes),
      });
    }

    const topEmoji = topEmojis?.[0];
    if (topEmoji) {
      result.push({
        label: "Signature emoji",
        value: topEmoji.emoji,
        sub: `${topEmoji.count.toLocaleString()} times`,
      });
    }

    const topStarter = conversationStarters.topStarter;
    if (topStarter) {
      result.push({
        label: "Conversation starter",
        value: firstName(topStarter.person),
        sub: `starts ${topStarter.percentage}% of conversations`,
      });
    }

    return result;
  }, [analytics]);

  const topEmojis = (analytics.topEmojis || []).slice(0, 5);

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
        slug,
      });
    } catch {
      setError("Could not render the image. Please try again.");
    } finally {
      setWorking(false);
    }
  };

  /* -------------------- THE CARD (shared markup, capture-safe) -------------------- */

  const card = (
    <div
      style={{
        width: CARD_W,
        height: CARD_H,
        backgroundColor: COLORS.bg,
        backgroundImage: [
          `radial-gradient(circle at 12% 8%, ${COLORS.glow1}, transparent 52%)`,
          `radial-gradient(circle at 92% 92%, ${COLORS.glow2}, transparent 50%)`,
          `radial-gradient(circle at 85% 18%, ${COLORS.glow3}, transparent 45%)`,
        ].join(", "),
        color: COLORS.text,
        fontFamily: '"Red Rose", Georgia, serif',
        padding: "56px 64px",
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
          Chat analysis
        </span>
      </div>

      {/* Title */}
      <div style={{ marginTop: 44 }}>
        <p style={{ margin: 0, fontSize: 23, letterSpacing: 7, textTransform: "uppercase", color: "#c084fc" }}>
          {title}
        </p>
        <h1
          style={{
            margin: "14px 0 0",
            fontSize: 78,
            lineHeight: 1.02,
            fontWeight: 700,
            letterSpacing: -2,
            backgroundImage: "linear-gradient(90deg, #c084fc, #ec4899, #60a5fa)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          Finally
          <br />
          understood.
        </h1>
      </div>

      {/* Hero number */}
      <div style={{ marginTop: 38, display: "flex", alignItems: "baseline", gap: 20 }}>
        <span style={{ fontSize: 96, fontWeight: 700, letterSpacing: -3, lineHeight: 1 }}>
          {analytics.overview.totalMessages.toLocaleString()}
        </span>
        <span style={{ fontSize: 30, color: COLORS.secondary }}>messages analyzed</span>
      </div>

      {/* Stat tiles, flexes to absorb layout slack inside the fixed card */}
      <div
        style={{
          marginTop: 40,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridAutoRows: "1fr",
          gap: 20,
          flex: 1,
          minHeight: 0,
        }}
      >
        {tiles.map((tile) => (
          <div
            key={tile.label}
            style={{
              backgroundColor: COLORS.tile,
              border: `1px solid ${COLORS.tileBorder}`,
              borderRadius: 24,
              padding: "20px 28px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 6,
              minWidth: 0,
              overflow: "hidden",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 18,
                letterSpacing: 3,
                textTransform: "uppercase",
                color: COLORS.muted,
              }}
            >
              {tile.label}
            </p>
            <p
              style={{
                margin: 0,
                fontSize: tile.value.length > 14 ? 38 : 44,
                fontWeight: 700,
                letterSpacing: -1,
                lineHeight: 1.1,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {tile.value}
            </p>
            {tile.sub && (
              <p style={{ margin: 0, fontSize: 20, color: COLORS.secondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tile.sub}</p>
            )}
          </div>
        ))}
      </div>

      {/* Emoji strip */}
      {topEmojis.length > 0 && (
        <div
          style={{
            marginTop: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: COLORS.tile,
            border: `1px solid ${COLORS.tileBorder}`,
            borderRadius: 24,
            padding: "18px 36px",
          }}
        >
          {topEmojis.map((item) => (
            <div key={item.emoji} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 44, lineHeight: 1.2 }}>{item.emoji}</div>
              <div style={{ fontSize: 19, color: COLORS.muted, marginTop: 2 }}>
                {item.count.toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: 30 }}>
        <div style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />
        <div
          style={{
            marginTop: 20,
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

  /* -------------------- MODAL -------------------- */

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
            aria-label="Share card"
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.3, ease: [0.21, 0.6, 0.35, 1] }}
            className="glass-panel glass-sheen fixed left-1/2 top-1/2 z-[90] max-h-[92vh] w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-white">Share card</h3>
                <p className="mt-1 text-xs leading-relaxed text-gray-400">
                  A 4:5 image of your chat's identity, made for stories and posts.
                  Names appear as first names only.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close share card"
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
                <Download size={14} className="text-purple-300" />
                {working ? "Rendering..." : "Download PNG"}
              </button>
              <button
                type="button"
                onClick={close}
                className="glass-chip rounded-xl px-4 py-2.5 text-sm text-gray-300 transition-all duration-300 hover:bg-white/[0.08] hover:text-white active:scale-[0.98]"
              >
                Cancel
              </button>
            </div>

            <p className="mt-3 text-center text-[0.62rem] text-gray-600">
              Tip: on iPhone, open the downloaded image and long-press → Save to Photos.
            </p>
          </motion.div>

          {/* Full-size hidden render, the capture source. The off-screen
              offset MUST live on this wrapper, not on the captured node:
              html-to-image preserves the node's own position in the clone,
              so a node at left:-20000 exports a blank image. */}
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

export default ShareCardModal;
