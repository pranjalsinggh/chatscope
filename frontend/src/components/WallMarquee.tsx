import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { chatApi, type WallEntry } from "../lib/api";

/**
 * The Wall, opt-in, anonymized one-line stats published by real users,
 * shown on the landing page as a slow marquee. Loads once on mount and
 * silently disappears when the wall is empty (never blocks the page).
 */
function WallMarquee() {
  const [entries, setEntries] = useState<WallEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    chatApi
      .wallList()
      .then((data) => {
        if (!cancelled) setEntries(data.entries || []);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Empty wall: keep the section visible with an invitation so people
  // know the feature exists (it only fills up when users publish).
  if (!entries || entries.length === 0) {
    return (
      <section className="relative z-10 py-6" aria-label="The Wall, stats published by users">
        <div className="mx-auto mb-4 flex max-w-6xl items-center justify-center gap-2 px-4 text-center">
          <MessageCircle size={13} className="text-purple-300/80" />
          <p className="eyebrow text-gray-500">The wall · real stats, published anonymously</p>
        </div>
        <div className="flex justify-center px-4">
          <a
            href="#upload"
            className="glass-chip flex items-center gap-2.5 rounded-full px-5 py-2.5 transition-all duration-300 hover:bg-white/[0.08]"
          >
            <span className="text-base leading-none">✨</span>
            <span className="text-xs text-gray-400">
              No stats yet, analyze a chat and be the first to publish one
            </span>
          </a>
        </div>
      </section>
    );
  }

  // Duplicate the track so the CSS loop is seamless
  const track = [...entries, ...entries];

  return (
    <section className="relative z-10 py-6" aria-label="The Wall, stats published by users">
      <div className="mx-auto mb-4 flex max-w-6xl items-center justify-center gap-2 px-4 text-center">
        <MessageCircle size={13} className="text-purple-300/80" />
        <p className="eyebrow text-gray-500">The wall · real stats, published anonymously</p>
      </div>

      <div className="wall-marquee-mask relative overflow-hidden py-1">
        <div className="wall-marquee-track flex w-max items-stretch gap-3 px-3">
          {track.map((entry, index) => (
            <div
              key={`${entry.id}-${index}`}
              aria-hidden={index >= entries.length}
              className="glass-chip flex shrink-0 items-center gap-2.5 rounded-full px-5 py-2.5"
            >
              <span className="text-base leading-none">{entry.emoji}</span>
              <span className="whitespace-nowrap text-xs text-gray-300">{entry.text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default WallMarquee;
