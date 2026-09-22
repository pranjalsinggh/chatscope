import { motion, useScroll, useSpring } from "framer-motion";

/**
 * Thin luminous scroll-progress line across the top of the page.
 * Transform-only (scaleX), no layout, no paint per frame.
 */
function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    mass: 0.3,
  });

  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-[80] h-[2.5px] origin-left bg-gradient-to-r from-purple-500 via-pink-400 to-blue-400 shadow-[0_0_12px_rgba(168,85,247,0.7)]"
    />
  );
}

export default ScrollProgress;
