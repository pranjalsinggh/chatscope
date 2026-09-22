import { motion, useScroll, useSpring, useTransform } from "framer-motion";

/**
 * The fixed environment behind the entire application, deep space
 * gradient, drifting glow orbs with scroll parallax, and a faint film
 * grain. Sections never draw their own backgrounds, so the page reads
 * as one continuous place.
 *
 * Performance: every glow is a pre-softened radial-gradient (no
 * `filter: blur()` surfaces, those repaint on every scroll frame and
 * were the main source of scroll jank). Motion is transform-only and
 * GPU-composited; reduced-motion users get a static scene via
 * MotionConfig in App.
 */
function AnimatedBackground() {
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, {
    stiffness: 60,
    damping: 20,
    mass: 0.6,
  });

  // Each layer drifts at its own speed → depth
  const yAurora = useTransform(progress, [0, 1], ["0vh", "-22vh"]);
  const yViolet = useTransform(progress, [0, 1], ["0vh", "26vh"]);
  const yBlue = useTransform(progress, [0, 1], ["0vh", "-30vh"]);
  const yPink = useTransform(progress, [0, 1], ["0vh", "18vh"]);
  const gridOpacity = useTransform(progress, [0, 0.5], [0.5, 0.15]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      {/* Base deep-space gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_0%,#14101f_0%,#0a0812_45%,#07060c_100%)]" />

      {/* Aurora, wide soft glow band near the top */}
      <motion.div
        style={{ y: yAurora, willChange: "transform" }}
        className="absolute -top-[34vh] left-1/2 h-[80vh] w-[140vw] -translate-x-1/2"
      >
        <div className="absolute inset-0 bg-[radial-gradient(42%_50%_at_38%_50%,rgba(168,85,247,0.17),transparent_70%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(40%_46%_at_62%_46%,rgba(59,130,246,0.13),transparent_70%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(30%_38%_at_52%_58%,rgba(236,72,153,0.1),transparent_72%)]" />
      </motion.div>

      {/* Violet orb */}
      <motion.div
        style={{ y: yViolet, willChange: "transform" }}
        className="absolute left-[-12vw] top-[10vh] h-[52vh] w-[52vh]"
      >
        <div className="absolute inset-0 bg-[radial-gradient(50%_50%_at_50%_50%,rgba(147,51,234,0.16),transparent_68%)]" />
      </motion.div>

      {/* Blue orb */}
      <motion.div
        style={{ y: yBlue, willChange: "transform" }}
        className="absolute right-[-14vw] top-[40vh] h-[58vh] w-[58vh]"
      >
        <div className="absolute inset-0 bg-[radial-gradient(50%_50%_at_50%_50%,rgba(37,99,235,0.14),transparent_68%)]" />
      </motion.div>

      {/* Pink orb */}
      <motion.div
        style={{ y: yPink, willChange: "transform" }}
        className="absolute bottom-[-20vh] left-[22vw] h-[50vh] w-[50vh]"
      >
        <div className="absolute inset-0 bg-[radial-gradient(50%_50%_at_50%_50%,rgba(219,39,119,0.11),transparent_70%)]" />
      </motion.div>

      {/* Faint blueprint grid that fades as you descend */}
      <motion.div
        style={{ opacity: gridOpacity }}
        className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:radial-gradient(75%_60%_at_50%_20%,black,transparent)]"
      />

      {/* Film grain */}
      <div className="noise-overlay absolute inset-0 opacity-[0.05]" />

      {/* Readability floor, keeps text above glass crisp */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#07060c]" />
    </div>
  );
}

export default AnimatedBackground;
