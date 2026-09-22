import { motion } from "framer-motion";
import type { ReactNode } from "react";

type GlassCardProps = {
  children: ReactNode;
  className?: string;
  /** Animate in when the card scrolls into view */
  reveal?: boolean;
  delay?: number;
  hover?: boolean;
};

/**
 * The standard surface of the design system, a quiet translucent
 * glass panel. Floating layers (navbar, sidebar, dropzone) use the
 * heavier `.glass-panel` class instead.
 */
function GlassCard({
  children,
  className = "",
  reveal = true,
  delay = 0,
  hover = true,
}: GlassCardProps) {
  return (
    <motion.div
      initial={reveal ? { opacity: 0, y: 26, scale: 0.985 } : false}
      whileInView={reveal ? { opacity: 1, y: 0, scale: 1 } : undefined}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, delay, ease: [0.21, 0.6, 0.35, 1] }}
      className={`glass-card ${hover ? "glass-card-hover" : ""} ${className}`}
    >
      {children}
    </motion.div>
  );
}

export default GlassCard;
