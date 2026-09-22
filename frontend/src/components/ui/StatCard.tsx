import { useEffect, useRef } from "react";
import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion";
import type { LucideIcon } from "lucide-react";

type StatCardProps = {
  icon: LucideIcon;
  label: string;
  value: string | number;
  index?: number;
  tone?: "purple" | "blue" | "pink" | "emerald" | "amber";
};

const toneClasses: Record<string, { tile: string; glow: string }> = {
  purple: {
    tile: "from-purple-500/25 to-purple-500/5 text-purple-300",
    glow: "group-hover:shadow-[0_0_45px_-18px_rgba(168,85,247,0.55)]",
  },
  blue: {
    tile: "from-blue-500/25 to-blue-500/5 text-blue-300",
    glow: "group-hover:shadow-[0_0_45px_-18px_rgba(96,165,250,0.55)]",
  },
  pink: {
    tile: "from-pink-500/25 to-pink-500/5 text-pink-300",
    glow: "group-hover:shadow-[0_0_45px_-18px_rgba(236,72,153,0.55)]",
  },
  emerald: {
    tile: "from-emerald-500/25 to-emerald-500/5 text-emerald-300",
    glow: "group-hover:shadow-[0_0_45px_-18px_rgba(16,185,129,0.55)]",
  },
  amber: {
    tile: "from-amber-500/25 to-amber-500/5 text-amber-300",
    glow: "group-hover:shadow-[0_0_45px_-18px_rgba(245,158,11,0.55)]",
  },
};

/**
 * Counts up to the final value when the card scrolls into view.
 * Driven by a motion value → the text updates without React re-renders.
 * Non-numeric values (e.g. "24 chars") render statically.
 */
function AnimatedValue({ value }: { value: string }) {
  const isPureNumber = /^[\d,]+$/.test(value);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduceMotion = useReducedMotion();

  const count = useMotionValue(0);
  const display = useTransform(count, (latest) =>
    Math.round(latest).toLocaleString()
  );

  const target = parseFloat(value.replace(/,/g, ""));

  useEffect(() => {
    if (!inView || !isPureNumber || !Number.isFinite(target)) return;

    if (reduceMotion) {
      count.set(target);
      return;
    }

    const controls = animate(count, target, {
      duration: 1.3,
      ease: [0.22, 1, 0.36, 1],
    });

    return () => controls.stop();
  }, [inView, isPureNumber, target, reduceMotion, count]);

  if (!isPureNumber || !Number.isFinite(target)) {
    return <span>{value}</span>;
  }

  return (
    <span ref={ref}>
      <motion.span>{display}</motion.span>
    </span>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  index = 0,
  tone = "purple",
}: StatCardProps) {
  const tones = toneClasses[tone];

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.55, delay: index * 0.09, ease: [0.21, 0.6, 0.35, 1] }}
      className={`glass-card glass-card-hover group p-5 ${tones.glow} sm:p-6`}
    >
      <motion.div
        initial={{ rotate: -8, scale: 0.85 }}
        whileInView={{ rotate: 0, scale: 1 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.55, delay: index * 0.09 + 0.15, type: "spring", stiffness: 260, damping: 18 }}
        className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${tones.tile} ring-1 ring-white/10`}
      >
        <Icon size={20} />
      </motion.div>

      <p className="mt-5 text-2xl font-semibold tracking-tight text-white sm:text-[1.65rem]">
        <AnimatedValue value={String(value)} />
      </p>

      <p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-gray-500">
        {label}
      </p>
    </motion.div>
  );
}

export default StatCard;
