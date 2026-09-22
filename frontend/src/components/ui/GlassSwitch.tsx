import { motion } from "framer-motion";

type GlassSwitchProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  title?: string;
  disabled?: boolean;
  /** Red accent for destructive-feeling states (e.g. "off") */
  tone?: "purple" | "emerald" | "amber";
};

const toneMap = {
  purple: {
    on: "bg-gradient-to-r from-purple-500 to-fuchsia-500",
    glow: "shadow-[0_0_14px_-2px_rgba(168,85,247,0.8)]",
  },
  emerald: {
    on: "bg-gradient-to-r from-emerald-500 to-teal-400",
    glow: "shadow-[0_0_14px_-2px_rgba(52,211,153,0.8)]",
  },
  amber: {
    on: "bg-gradient-to-r from-amber-500 to-orange-400",
    glow: "shadow-[0_0_14px_-2px_rgba(245,158,11,0.8)]",
  },
} as const;

/**
 * The design-system switch, a quiet glass pill whose knob slides
 * with a spring, matching glass-chip/glass-card styling.
 */
function GlassSwitch({
  checked,
  onChange,
  label,
  title,
  disabled = false,
  tone = "purple",
}: GlassSwitchProps) {
  const styles = toneMap[tone];

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`glass-chip relative inline-flex h-[26px] w-[48px] shrink-0 items-center rounded-full transition-all duration-300 ${
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:border-white/25"
      } ${checked ? styles.on : "bg-white/[0.06]"}`}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
        className={`h-[19px] w-[19px] rounded-full bg-white shadow-md ${
          checked ? `ml-auto mr-[3px] ${styles.glow}` : "ml-[3px] mr-auto"
        }`}
      />
    </button>
  );
}

export default GlassSwitch;
