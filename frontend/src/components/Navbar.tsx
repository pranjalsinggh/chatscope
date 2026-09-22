import { useState } from "react";
import { motion, useMotionValueEvent, useScroll } from "framer-motion";
import { MessageCircle, ArrowUpRight } from "lucide-react";

function Navbar() {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);

  useMotionValueEvent(scrollY, "change", (latest) => {
    setScrolled(latest > 32);
  });

  return (
    <motion.nav
      initial={{ opacity: 0, y: -24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.21, 0.6, 0.35, 1] }}
      className="fixed inset-x-0 top-0 z-50 px-4 pt-4 sm:px-6"
    >
      <div
        className={`glass-panel glass-sheen mx-auto flex max-w-5xl items-center justify-between rounded-2xl transition-all duration-500 ${
          scrolled ? "px-4 py-2.5 shadow-[0_18px_50px_-25px_rgba(0,0,0,0.9)]" : "px-5 py-3.5"
        }`}
      >
        {/* Logo */}
        <a href="#top" className="flex items-center gap-2.5" aria-label="ChatScope home">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 via-fuchsia-500 to-blue-500 text-white shadow-[0_0_24px_-6px_rgba(168,85,247,0.8)]">
            <MessageCircle size={18} />
          </span>

          <span className="hidden min-[400px]:inline text-[1.05rem] font-semibold tracking-tight text-white">
            ChatScope
          </span>
        </a>

        {/* Links */}
        <div className="hidden items-center gap-1.5 text-sm text-gray-400 md:flex">
          {[
            { href: "#features", label: "Features" },
            { href: "#how-it-works", label: "How it works" },
          ].map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-lg px-3.5 py-2 transition-all duration-300 hover:bg-white/[0.06] hover:text-white"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* CTA */}
        <div className="flex items-center gap-2.5">
          <a
            href="#upload"
            className="group flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-sm min-[400px]:px-4 font-medium text-black transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_0_28px_-6px_rgba(255,255,255,0.45)] active:scale-[0.98]"
          >
            Analyze Chat

            <ArrowUpRight
              size={15}
              className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            />
          </a>
        </div>
      </div>
    </motion.nav>
  );
}

export default Navbar;
