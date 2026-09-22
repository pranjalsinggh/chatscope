import { motion } from "framer-motion";

type SectionHeaderProps = {
  index?: string;
  title: string;
  description?: string;
  accent?: "purple" | "blue" | "pink" | "amber" | "cyan" | "emerald";
};

const accentClasses: Record<string, string> = {
  purple: "text-purple-300",
  blue: "text-blue-300",
  pink: "text-pink-300",
  amber: "text-amber-300",
  cyan: "text-cyan-300",
  emerald: "text-emerald-300",
};

function SectionHeader({
  index,
  title,
  description,
  accent = "purple",
}: SectionHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5 }}
      className="mb-7"
    >
      {index && (
        <div className="flex items-center gap-3">
          <motion.span
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.45 }}
            className={`eyebrow ${accentClasses[accent]}`}
          >
            {index}
          </motion.span>

          <motion.span
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.21, 0.6, 0.35, 1] }}
            className="h-px w-10 origin-left bg-gradient-to-r from-white/25 to-transparent"
          />
        </div>
      )}

      <h3 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-[1.7rem]">
        {title}
      </h3>

      {description && (
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-gray-400">
          {description}
        </p>
      )}
    </motion.div>
  );
}

export default SectionHeader;
