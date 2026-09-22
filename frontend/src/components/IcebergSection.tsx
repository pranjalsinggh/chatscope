import { useEffect, useRef, useState } from "react";
import {
  motion,
  useScroll,
  useSpring,
  useTransform,
  useMotionTemplate,
  type MotionValue,
} from "framer-motion";
import { Bot, Fingerprint, Sparkles, Zap, type LucideIcon } from "lucide-react";

/**
 * THE ICEBERG — scrollytelling section.
 *
 * Surface: "what you think your chat is" (4,312 unread messages, vibes).
 * Scroll to dive below the waterline: the huge underwater mass reveals
 * what the chat ACTUALLY is, deep analysis, hidden patterns, and an AI
 * that answers with receipts. The abyss ends on the punchline and melts
 * into the exact site background.
 *
 * One spring-smoothed scroll progress drives everything. Every animated
 * property is transform/opacity only, and the whole scene respects
 * prefers-reduced-motion via the app-level MotionConfig.
 */

type DepthLabelProps = {
  progress: MotionValue<number>;
  range: [number, number, number, number];
  top: string;
  side: "left" | "right";
  icon: LucideIcon;
  title: string;
  text: string;
  hero?: boolean;
};

function DepthLabel({
  progress,
  range,
  top,
  side,
  icon: Icon,
  title,
  text,
  hero = false,
}: DepthLabelProps) {
  const opacity = useTransform(progress, range, [0, 1, 1, 0]);
  const y = useTransform(progress, range, [46, 0, -12, -52]);
  const scale = useTransform(progress, range, [0.82, 1, 1, 0.86]);
  const rotateY = useTransform(
    progress,
    range,
    side === "left" ? [-42, 0, 0, 30] : [42, 0, 0, -30]
  );
  const z = useTransform(progress, range, [-220, 60, 60, -160]);

  return (
    <motion.div
      style={{
        opacity,
        y,
        scale,
        rotateY,
        z,
        transformPerspective: 900,
        top,
      }}
      className={`absolute z-30 w-[min(72vw,300px)] ${
        side === "left"
          ? "left-3 text-left sm:left-[6%]"
          : "right-3 text-right sm:right-[6%]"
      }`}
    >
      <div
        className={`inline-flex flex-col gap-1.5 rounded-2xl border px-4 py-3 sm:px-5 ${
          hero
            ? "border-fuchsia-400/40 bg-fuchsia-500/[0.10] shadow-[0_0_80px_-14px_rgba(217,70,239,0.7)]"
            : "border-white/[0.08] bg-[#0a1530]/85"
        }`}
      >
        <div
          className={`flex items-center gap-2 ${
            side === "right" ? "flex-row-reverse" : ""
          }`}
        >
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ${
              hero
                ? "bg-fuchsia-500/20 text-fuchsia-200 ring-fuchsia-300/40"
                : "bg-sky-500/15 text-sky-200 ring-sky-300/30"
            }`}
          >
            <Icon size={14} />
          </span>
          <p
            className={`font-semibold text-white ${
              hero ? "text-[0.95rem]" : "text-sm"
            }`}
          >
            {title}
          </p>
        </div>
        <p className="text-[0.7rem] leading-5 text-gray-400 sm:text-xs">
          {text}
        </p>
      </div>
    </motion.div>
  );
}

const BUBBLES = [
  { left: "18%", size: 7, delay: 0, duration: 9 },
  { left: "30%", size: 5, delay: 2.4, duration: 11 },
  { left: "44%", size: 9, delay: 4.2, duration: 8 },
  { left: "58%", size: 5, delay: 1.2, duration: 12 },
  { left: "70%", size: 8, delay: 5.6, duration: 10 },
  { left: "82%", size: 6, delay: 3.1, duration: 9.5 },
  { left: "50%", size: 4, delay: 6.8, duration: 13 },
];

// Depth-label visibility windows. On wide screens labels sit on opposite
// sides, so their windows deliberately overlap for continuity. On phones
// both labels would collide horizontally, so each one fades out fully
// before the next fades in.
const DESKTOP_LABEL_RANGES: [number, number, number, number][] = [
  [0.26, 0.33, 0.48, 0.55],
  [0.42, 0.49, 0.62, 0.69],
  [0.56, 0.63, 0.74, 0.81],
  [0.68, 0.75, 0.86, 0.93],
];

const MOBILE_LABEL_RANGES: [number, number, number, number][] = [
  [0.16, 0.22, 0.3, 0.36],
  [0.36, 0.42, 0.48, 0.54],
  [0.54, 0.6, 0.64, 0.7],
  [0.7, 0.75, 0.78, 0.82],
];

function useIsWideScreen() {
  const [wide, setWide] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 640px)").matches
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const onChange = (event: MediaQueryListEvent) => setWide(event.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return wide;
}

function IcebergSection() {
  const ref = useRef<HTMLElement>(null);
  const isWide = useIsWideScreen();
  const labelRanges = isWide ? DESKTOP_LABEL_RANGES : MOBILE_LABEL_RANGES;
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });

  // Slow, heavy spring = buttery, cinematic response
  const progress = useSpring(scrollYProgress, {
    stiffness: 60,
    damping: 24,
    mass: 0.9,
  });

  // Sky fades, deep ocean fades in as you cross the waterline
  const skyOpacity = useTransform(progress, [0.1, 0.24], [1, 0]);
  const oceanOpacity = useTransform(progress, [0.08, 0.24], [0, 1]);

  // Surface copy fades out early
  const surfaceOpacity = useTransform(progress, [0.02, 0.13], [1, 0]);

  // The crossing moment
  const crossingOpacity = useTransform(
    progress,
    [0.1, 0.16, 0.28, 0.34],
    [0, 1, 1, 0]
  );
  const crossingY = useTransform(progress, [0.1, 0.34], [20, -20]);

  // The tip dims as we dive below the surface (looking up at it)
  const tipOpacity = useTransform(progress, [0.15, 0.34], [1, 0.25]);

  // Splash ring: one expanding ripple exactly as you punch through
  const splashScale = useTransform(progress, [0.12, 0.3], [0.4, 2.6]);
  const splashOpacity = useTransform(progress, [0.12, 0.18, 0.3], [0, 0.7, 0]);

  // Underwater mass reveal: clip wipes it downward into view
  const unRevealed = useTransform(progress, [0.17, 0.68], [100, 0]);
  const massClip = useMotionTemplate`inset(0% 0% ${unRevealed}% 0%)`;
  const massDrift = useTransform(progress, [0.17, 0.68], [30, -10]);
  const massSway = useTransform(progress, [0.17, 0.68], [-8, 8]);

  // 3D camera pitch: the whole berg leans as you descend
  const bergTilt = useTransform(progress, [0.08, 0.55, 1], [7, 0, -9]);

  // Punchline at the abyss
  const punchOpacity = useTransform(progress, [0.84, 0.92], [0, 1]);
  const punchScale = useTransform(progress, [0.84, 1], [0.9, 1]);
  const punchY = useTransform(progress, [0.84, 1], [40, -10]);
  const massDim = useTransform(progress, [0.82, 0.92], [1, 0.3]);
  const gaugeDim = useTransform(progress, [0.82, 0.92], [1, 0]);

  // Depth gauge
  const gaugeTop = useTransform(progress, [0, 1], ["0%", "100%"]);
  const depthText = useTransform(progress, (v) => {
    const meters = Math.round(v * 2000);
    return meters <= 5 ? "SURFACE" : `-${meters}M`;
  });

  return (
    <section ref={ref} className="relative h-[480vh]" aria-label="The iceberg">
      <div
        className="sticky top-0 h-screen overflow-hidden [perspective:1200px]"
      >
        {/* -------------------------------------------- SKY (surface) */}
        <motion.div
          style={{ opacity: skyOpacity }}
          className="absolute inset-0 will-change-[opacity]"
          aria-hidden="true"
        >
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, #060a1c 0%, #091231 42%, #0c1e4a 68%, #0f2f63 100%)",
            }}
          />
          <div
            className="absolute inset-x-0 top-[10vh] mx-auto h-[26vh] max-w-3xl rounded-full opacity-40 blur-3xl"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(96,165,250,0.35), transparent 70%)",
            }}
          />
        </motion.div>

        {/* -------------------------------------------- DEEP OCEAN */}
        <motion.div
          style={{ opacity: oceanOpacity }}
          className="absolute inset-0 will-change-[opacity]"
          aria-hidden="true"
        >
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, #0f2f63 0%, #0a2452 16%, #071a40 34%, #050f2c 56%, #04091e 78%, #07060c 100%)",
            }}
          />
          <div
            className="absolute inset-x-0 top-[30vh] h-[40vh]"
            style={{
              background:
                "radial-gradient(ellipse 60% 50% at 50% 40%, rgba(168,85,247,0.10), transparent 70%)",
            }}
          />
        </motion.div>

        {/* -------------------------------------------- BUBBLES */}
        <motion.div
          style={{ opacity: oceanOpacity }}
          className="absolute inset-x-0 bottom-0 top-[36vh] overflow-hidden"
          aria-hidden="true"
        >
          {BUBBLES.map((bubble, index) => (
            <span
              key={index}
              className="ice-bubble absolute rounded-full border border-sky-200/40 bg-sky-200/10"
              style={{
                left: bubble.left,
                width: bubble.size,
                height: bubble.size,
                animationDelay: `${bubble.delay}s`,
                animationDuration: `${bubble.duration}s`,
              }}
            />
          ))}
        </motion.div>

        {/* -------------------------------------------- WATERLINE */}
        <div
          className="absolute inset-x-0 z-10"
          style={{ top: "36vh" }}
          aria-hidden="true"
        >
          <div className="h-px w-full bg-gradient-to-r from-transparent via-sky-200/60 to-transparent" />
          <div className="h-20 w-full bg-gradient-to-b from-sky-300/[0.07] to-transparent" />
        </div>

        {/* -------------------------------------------- SPLASH RING */}
        <motion.div
          style={{
            opacity: splashOpacity,
            scale: splashScale,
            top: "36vh",
            x: "-50%",
            y: "-50%",
          }}
          className="absolute left-1/2 z-20 h-10 w-[46vw] max-w-[420px] rounded-[100%] border-2 border-sky-200/70"
          aria-hidden="true"
        />

        {/* -------------------------------------------- SURFACE COPY */}
        <motion.div
          style={{ opacity: surfaceOpacity }}
          className="absolute inset-x-0 top-[7vh] z-20 text-center"
        >
          <p className="eyebrow text-sky-300/80">The iceberg</p>
          <h2 className="mt-3 px-6 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            what you think your chat is
          </h2>
        </motion.div>

        <motion.div
          style={{ opacity: surfaceOpacity, top: "15vh" }}
          className="absolute left-1/2 z-20 -translate-x-1/2"
          aria-hidden="true"
        >
          <div className="glass-chip whitespace-nowrap rounded-full px-4 py-1.5 text-[0.7rem] text-sky-100/90">
            4,312 unread messages · just memes and 2am texts
          </div>
        </motion.div>

        {/* -------------------------------------------- ICEBERG TIP */}
        <motion.div
          style={{
            opacity: tipOpacity,
            left: "50%",
            top: "36vh",
            x: "-50%",
            y: "-100%",
          }}
          className="absolute z-20 w-[clamp(140px,20vw,220px)] will-change-transform"
          aria-hidden="true"
        >
          <motion.svg
            viewBox="0 0 220 120"
            className="h-auto w-full drop-shadow-[0_10px_30px_rgba(125,190,255,0.25)]"
            animate={{ y: [0, -7, 0], rotate: [0, -1.2, 0] }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          >
            <defs>
              <linearGradient id="ib-tip-a" x1="0" y1="0" x2="1" y2="0.4">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="60%" stopColor="#e3f2ff" />
                <stop offset="100%" stopColor="#b9dcff" />
              </linearGradient>
              <linearGradient id="ib-tip-b" x1="0" y1="0" x2="1" y2="0.3">
                <stop offset="0%" stopColor="#9ec9f7" />
                <stop offset="100%" stopColor="#5f9fdd" />
              </linearGradient>
            </defs>
            {/* right face, in shadow */}
            <polygon points="104,3 150,44 200,102 104,118" fill="url(#ib-tip-b)" />
            {/* left face, lit */}
            <polygon points="104,3 18,104 104,118" fill="url(#ib-tip-a)" />
            {/* ridge highlight along the lit slope */}
            <polygon points="104,3 84,58 104,118 66,102" fill="rgba(255,255,255,0.35)" />
            {/* small companion berg */}
            <polygon points="188,104 206,98 212,110 196,116" fill="#a9d2fb" opacity="0.75" />
          </motion.svg>
        </motion.div>

        {/* -------------------------------------------- UNDERWATER MASS */}
        <motion.div
          style={{ opacity: massDim, top: "36vh" }}
          className="absolute inset-x-0 z-10"
          aria-hidden="true"
        >
          <motion.div
            style={{
              clipPath: massClip,
              y: massDrift,
              rotateY: massSway,
              rotateX: bergTilt,
              transformPerspective: 1200,
              transformOrigin: "50% 0%",
            }}
            className="absolute left-1/2 w-[clamp(260px,46vw,460px)] -translate-x-1/2 will-change-[transform,clip-path]"
          >
            <svg viewBox="0 0 440 560" className="h-auto w-full">
              <defs>
                <linearGradient id="ib-back" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1d3f74" />
                  <stop offset="60%" stopColor="#0c2350" />
                  <stop offset="100%" stopColor="#050d20" />
                </linearGradient>
                <linearGradient id="ib-mid" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2a5a96" />
                  <stop offset="55%" stopColor="#123061" />
                  <stop offset="100%" stopColor="#081833" />
                </linearGradient>
                <linearGradient id="ib-front" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4a7fc0" />
                  <stop offset="50%" stopColor="#1c4276" />
                  <stop offset="100%" stopColor="#0b1f42" />
                </linearGradient>
                <radialGradient id="ib-glow" cx="0.5" cy="0.55" r="0.55">
                  <stop offset="0%" stopColor="rgba(168,85,247,0.35)" />
                  <stop offset="100%" stopColor="rgba(168,85,247,0)" />
                </radialGradient>
              </defs>
              <ellipse cx="220" cy="320" rx="200" ry="170" fill="url(#ib-glow)" />
              <polygon
                points="220,6 342,64 398,176 406,306 348,436 226,556 122,446 58,318 82,166 136,56"
                fill="url(#ib-back)"
              />
              <polygon
                points="220,12 312,74 352,186 342,308 280,438 198,506 140,386 130,226 160,86"
                fill="url(#ib-mid)"
              />
              <polygon
                points="220,18 272,84 290,186 266,326 206,436 166,336 164,196 184,94"
                fill="url(#ib-front)"
              />
            </svg>
          </motion.div>
        </motion.div>

        {/* -------------------------------------------- CROSSING LINE */}
        <motion.p
          style={{ opacity: crossingOpacity, y: crossingY, top: "41vh" }}
          className="absolute inset-x-0 z-30 px-6 text-center text-sm font-medium tracking-wide text-sky-100/90 sm:text-base"
          aria-hidden="true"
        >
          but there is a whole world under the surface
        </motion.p>

        {/* -------------------------------------------- DEPTH LABELS */}
        <DepthLabel
          progress={progress}
          range={labelRanges[0]}
          top="38vh"
          side="left"
          icon={Zap}
          title="decoded in seconds"
          text="Every message parsed the moment it lands. No waiting, no uploads to someone else's server."
        />
        <DepthLabel
          progress={progress}
          range={labelRanges[1]}
          top="50vh"
          side="right"
          icon={Fingerprint}
          title="patterns you never noticed"
          text="Reply times, peak hours, who texts first. The rhythms hiding in plain sight."
        />
        <DepthLabel
          progress={progress}
          range={labelRanges[2]}
          top="62vh"
          side="left"
          icon={Bot}
          title="AI that answers with receipts"
          text="Ask anything. It cites the exact messages behind every claim."
          hero
        />
        <DepthLabel
          progress={progress}
          range={labelRanges[3]}
          top="74vh"
          side="right"
          icon={Sparkles}
          title="secrets it never told you"
          text="Birthdays, favorite places, hidden drama. Five surprising facts per person."
        />

        {/* -------------------------------------------- PUNCHLINE */}
        <motion.div
          style={{ opacity: punchOpacity, scale: punchScale, y: punchY }}
          className="absolute inset-0 z-40 flex flex-col items-center justify-center px-6 text-center"
        >
          <p className="eyebrow text-fuchsia-300/90">2,000 meters down</p>
          <h2 className="mt-4 text-[2rem] font-bold leading-tight tracking-tight text-white sm:text-5xl md:text-6xl">
            your chats were never{" "}
            <span className="gradient-text">just chats.</span>
          </h2>
          <p className="mt-5 max-w-md text-sm leading-6 text-gray-400 sm:text-base">
            There is a whole story under the surface. Upload yours and see
            what was hiding in plain sight.
          </p>
          <a
            href="#upload"
            className="glass-chip mt-8 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white transition-all duration-300 hover:scale-[1.03] hover:bg-white/[0.08] active:scale-[0.98]"
          >
            reveal my chat's secrets
          </a>
        </motion.div>

        {/* -------------------------------------------- DEPTH GAUGE */}
        <motion.div
          style={{ opacity: gaugeDim, top: "50%" }}
          className="absolute right-5 z-30 hidden -translate-y-1/2 flex-col items-center gap-2 md:flex"
          aria-hidden="true"
        >
          <motion.span className="text-[0.6rem] font-semibold tracking-[0.2em] text-sky-200/70">
            {depthText}
          </motion.span>
          <div className="relative h-44 w-px bg-white/10">
            <motion.div
              style={{ top: gaugeTop }}
              className="absolute left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-sky-300 shadow-[0_0_10px_rgba(125,211,252,0.9)]"
            />
          </div>
          <span className="text-[0.55rem] tracking-[0.18em] text-gray-600">
            DATA ABYSS
          </span>
        </motion.div>
      </div>
    </section>
  );
}

export default IcebergSection;
