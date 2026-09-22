import { motion } from "framer-motion";
import {
  BarChart3,
  Lock,
  MessagesSquare,
  Cake,
  Timer,
  FileDown,
  ShieldCheck,
  FileUp,
  BrainCircuit,
  Compass,
} from "lucide-react";

const easeOut = [0.21, 0.6, 0.35, 1] as const;

const features = [
  {
    icon: Lock,
    tone: "text-fuchsia-300 bg-fuchsia-500/12 ring-fuchsia-400/25",
    title: "Encrypted by default",
    text: "The second you hit analyze, your chat is sealed with AES-256 encryption. Never saved, never copied. Gone when you leave.",
    badge: "NEW",
  },
  {
    icon: BarChart3,
    tone: "text-purple-300 bg-purple-500/12 ring-purple-400/20",
    title: "Deep analytics",
    text: "Message volume, hourly rhythms, weekday patterns and monthly momentum, your conversation, quantified.",
  },
  {
    icon: MessagesSquare,
    tone: "text-blue-300 bg-blue-500/12 ring-blue-400/20",
    title: "Ask Your Chat",
    text: "Ask anything in plain language. AI answers with receipts, the exact messages behind every claim.",
  },
  {
    icon: Cake,
    tone: "text-pink-300 bg-pink-500/12 ring-pink-400/20",
    title: "People facts",
    text: "Birthdays, favorite places, milestones and hobbies, five surprising facts surfaced for every person.",
  },
  {
    icon: Timer,
    tone: "text-amber-300 bg-amber-500/12 ring-amber-400/20",
    title: "Response intelligence",
    text: "Who replies in seconds, who lets chats simmer, and who fires the first message after days of silence.",
  },
  {
    icon: FileDown,
    tone: "text-emerald-300 bg-emerald-500/12 ring-emerald-400/20",
    title: "Shareable reports",
    text: "One click turns the full dashboard into a clean PDF you can keep or send.",
  },
  {
    icon: ShieldCheck,
    tone: "text-cyan-300 bg-cyan-500/12 ring-cyan-400/20",
    title: "Zero history",
    text: "No accounts, no history, no tracking. Restart the app and every trace is gone. Your chats exist in memory and nowhere else."
  },
];

const steps = [
  {
    icon: FileUp,
    step: "01",
    title: "Export your chat",
    text: "In WhatsApp, open any conversation, tap Export chat and save it as a plain .txt file.",
  },
  {
    icon: BrainCircuit,
    step: "02",
    title: "Let ChatScope read it",
    text: "Drop the file in. Parsing, statistics and AI indexing all happen instantly on your machine.",
  },
  {
    icon: Compass,
    step: "03",
    title: "Explore & ask",
    text: "Navigate the dashboard by section, browse raw messages, or just ask the AI anything you're curious about.",
  },
];

function LandingSections() {
  return (
    <>
      {/* ------------------------------------------------ FEATURES */}
      <section id="features" className="relative scroll-mt-28 px-6 py-24 sm:py-28">
        <div className="mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: easeOut }}
            className="mx-auto max-w-2xl text-center"
          >
            <p className="eyebrow text-purple-300">Features</p>

            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Everything your chats never told you
            </h2>

            <p className="mt-3 text-sm leading-6 text-gray-400 sm:text-base">
              Six ways ChatScope turns a plain text file into something that
              feels like a superpower.
            </p>
          </motion.div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => {
              const Icon = feature.icon;

              return (
                <motion.article
                  key={feature.title}
                  initial={{ opacity: 0, y: 26 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.55, delay: (index % 3) * 0.1, ease: easeOut }}
                  className={`glass-card glass-card-hover group p-6 ${feature.badge ? "border-fuchsia-400/25 shadow-[0_0_70px_-24px_rgba(217,70,239,0.5)]" : ""}`}
                >
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-xl ring-1 transition-transform duration-500 ease-out group-hover:-rotate-6 group-hover:scale-110 ${feature.tone}`}
                  >
                    <Icon size={20} />
                  </div>

                  <h3 className="mt-5 flex items-center gap-2 text-[1.05rem] font-semibold text-white">
                    {feature.title}
                    {feature.badge && (
                      <span className="rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-[0.55rem] font-bold uppercase tracking-[0.14em] text-fuchsia-300 ring-1 ring-fuchsia-400/40">
                        {feature.badge}
                      </span>
                    )}
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-gray-400">
                    {feature.text}
                  </p>
                </motion.article>
              );
            })}
          </div>
        </div>
      </section>

      {/* --------------------------------------------- HOW IT WORKS */}
      <section
        id="how-it-works"
        className="relative scroll-mt-28 px-6 py-24 sm:py-28"
      >
        <div className="mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: easeOut }}
            className="mx-auto max-w-2xl text-center"
          >
            <p className="eyebrow text-blue-300">How it works</p>

            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Three steps to insight
            </h2>
          </motion.div>

          <div className="relative mt-12 grid gap-5 md:grid-cols-3">
            {/* Connector line */}
            <div
              aria-hidden="true"
              className="absolute left-0 right-0 top-[3.4rem] hidden h-px bg-gradient-to-r from-transparent via-white/15 to-transparent md:block"
            />

            {steps.map((step, index) => {
              const Icon = step.icon;

              return (
                <motion.div
                  key={step.step}
                  initial={{ opacity: 0, y: 26 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.55, delay: index * 0.14, ease: easeOut }}
                  className="glass-card glass-card-hover group relative p-6 text-center"
                >
                  <div className="relative mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-purple-500/25 to-blue-500/15 text-white ring-1 ring-white/15 transition-transform duration-500 ease-out group-hover:scale-110">
                    <Icon size={19} />
                  </div>

                  <p className="mt-4 text-[0.68rem] font-semibold uppercase tracking-[0.3em] text-purple-300/80">
                    Step {step.step}
                  </p>

                  <h3 className="mt-1.5 text-[1.05rem] font-semibold text-white">
                    {step.title}
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-gray-400">
                    {step.text}
                  </p>
                </motion.div>
              );
            })}
          </div>

          {/* CTA into upload */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.6, ease: easeOut }}
            className="mt-12 text-center"
          >
            <a
              href="#upload"
              className="glass-chip inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-medium text-gray-200 transition-all duration-300 hover:bg-white/[0.08] hover:text-white"
            >
              Start analyzing
            </a>
          </motion.div>
        </div>
      </section>
    </>
  );
}

export default LandingSections;
