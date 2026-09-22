import { motion, useScroll, useSpring, useTransform } from "framer-motion";
import { ArrowRight, ArrowDown, Sparkles, MessagesSquare, Brain, ShieldCheck } from "lucide-react";

const easeOut = [0.21, 0.6, 0.35, 1] as const;

function Hero() {
  // Subtle per-chip drift while scrolling, transform-only parallax
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 60, damping: 20 });
  const yChipLeft = useTransform(progress, [0, 0.7], ["0vh", "9vh"]);
  const yChipRight = useTransform(progress, [0, 0.7], ["0vh", "4vh"]);
  const yChipBottom = useTransform(progress, [0, 0.7], ["0vh", "12vh"]);

  return (
    <section
      id="top"
      className="relative flex min-h-[100svh] flex-col items-center justify-center overflow-visible px-6 pb-16 pt-32"
    >
      {/* Floating decorative chips, glass depth around the headline */}
      <motion.div
        aria-hidden="true"
        style={{ y: yChipLeft }}
        className="pointer-events-none absolute left-[7%] top-[24%] hidden lg:block"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.9, ease: easeOut }}
        >
          <div className="glass-panel glass-panel--solid animate-float-slow flex items-center gap-3 rounded-2xl px-4 py-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/15 text-purple-300">
              <MessagesSquare size={16} />
            </span>
            <div>
              <p className="text-sm font-semibold text-white">2,534</p>
              <p className="text-[0.68rem] uppercase tracking-[0.14em] text-gray-500">
                messages read
              </p>
            </div>
          </div>
        </motion.div>
      </motion.div>

      <motion.div
        aria-hidden="true"
        style={{ y: yChipRight }}
        className="pointer-events-none absolute right-[6%] top-[32%] hidden lg:block"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 1.1, ease: easeOut }}
        >
          <div className="glass-panel glass-panel--solid animate-float-slower flex items-center gap-3 rounded-2xl px-4 py-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/15 text-blue-300">
              <Brain size={16} />
            </span>
            <div>
              <p className="text-sm font-semibold text-white">Ask anything</p>
              <p className="text-[0.68rem] uppercase tracking-[0.14em] text-gray-500">
                AI answers with evidence
              </p>
            </div>
          </div>
        </motion.div>
      </motion.div>

      <motion.div
        aria-hidden="true"
        style={{ y: yChipBottom }}
        className="pointer-events-none absolute bottom-[22%] left-[12%] hidden lg:block"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 1.3, ease: easeOut }}
        >
          <div className="glass-panel glass-panel--solid animate-float-slower flex items-center gap-3 rounded-2xl px-4 py-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300">
              <ShieldCheck size={16} />
            </span>
            <div>
              <p className="text-sm font-semibold text-white">100% private</p>
              <p className="text-[0.68rem] uppercase tracking-[0.14em] text-gray-500">
                nothing leaves your device*
              </p>
            </div>
          </div>
        </motion.div>
      </motion.div>

      <div className="relative z-10 mx-auto max-w-4xl text-center">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: easeOut }}
          className="glass-chip mx-auto mb-8 inline-flex items-center gap-2 rounded-full px-4 py-2 text-[0.82rem] text-gray-300"
        >
          <Sparkles size={14} className="text-purple-300" />
          AI-powered conversation intelligence
        </motion.div>

        {/* Heading */}
        <motion.h1
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.85, delay: 0.08, ease: easeOut }}
          className="text-[2.6rem] font-bold leading-[1.06] tracking-tight text-white sm:text-6xl md:text-7xl"
        >
          Your conversations.
          <br />
          <span className="gradient-text inline-block">Finally understood.</span>
        </motion.h1>

        {/* Description */}
        <motion.p
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.22, ease: easeOut }}
          className="mx-auto mt-7 max-w-2xl text-base leading-relaxed text-gray-400 sm:text-lg"
        >
          Upload your WhatsApp conversation and discover patterns,
          relationships, trends and hidden insights, powered by data science
          and AI.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.34, ease: easeOut }}
          className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <a
            href="#upload"
            className="group flex items-center gap-2 rounded-xl bg-white px-7 py-3.5 text-[0.95rem] font-medium text-black transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_0_45px_-8px_rgba(255,255,255,0.5)] active:scale-[0.98]"
          >
            Analyze your chat
            <ArrowRight
              size={17}
              className="transition-transform duration-300 group-hover:translate-x-1"
            />
          </a>

          <a
            href="#how-it-works"
            className="glass-chip rounded-xl px-7 py-3.5 text-[0.95rem] font-medium text-gray-300 transition-all duration-300 hover:bg-white/[0.08] hover:text-white active:scale-[0.98]"
          >
            See how it works
          </a>
        </motion.div>

        {/* Privacy note */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.55 }}
          className="mt-6 text-xs tracking-wide text-gray-600"
        >
          Private by design · Your chat never leaves this app
        </motion.p>
      </div>

      {/* Scroll cue */}
      <motion.a
        href="#features"
        aria-label="Scroll to features"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1.4 }}
        className="absolute bottom-7 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-1.5 text-gray-600 transition-colors hover:text-gray-400 sm:flex"
      >
        <span className="text-[0.62rem] font-medium uppercase tracking-[0.3em]">
          Scroll
        </span>
        <motion.span
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        >
          <ArrowDown size={15} />
        </motion.span>
      </motion.a>
    </section>
  );
}

export default Hero;
