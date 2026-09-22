import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Cake,
  MapPin,
  Trophy,
  Briefcase,
  Palette,
  UtensilsCrossed,
  Heart,
  Smile,
  Laugh,
  Sparkles,
  Quote,
  Loader2,
  RefreshCw,
  Users,
} from "lucide-react";

import { chatApi, type FactsResponse, type PersonFact } from "../lib/api";

// ------------------------------------------------
// CATEGORY ICONS
// ------------------------------------------------

const categoryStyles: Record<
  string,
  { icon: typeof Cake; className: string }
> = {
  birthday: { icon: Cake, className: "bg-amber-500/10 text-amber-400" },
  place: { icon: MapPin, className: "bg-emerald-500/10 text-emerald-400" },
  milestone: { icon: Trophy, className: "bg-yellow-500/10 text-yellow-400" },
  work: { icon: Briefcase, className: "bg-sky-500/10 text-sky-400" },
  hobby: { icon: Palette, className: "bg-violet-500/10 text-violet-400" },
  food: { icon: UtensilsCrossed, className: "bg-orange-500/10 text-orange-400" },
  relationship: { icon: Heart, className: "bg-rose-500/10 text-rose-400" },
  personality: { icon: Smile, className: "bg-teal-500/10 text-teal-400" },
  funny: { icon: Laugh, className: "bg-fuchsia-500/10 text-fuchsia-400" },
  other: { icon: Sparkles, className: "bg-purple-500/10 text-purple-400" },
};

const avatarGradients = [
  "from-purple-500 to-fuchsia-500",
  "from-blue-500 to-cyan-400",
  "from-pink-500 to-rose-400",
  "from-emerald-500 to-teal-400",
  "from-amber-500 to-orange-500",
  "from-indigo-500 to-blue-400",
];

function gradientForPerson(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return avatarGradients[hash % avatarGradients.length];
}

function initialsForPerson(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

// ------------------------------------------------
// PIECES
// ------------------------------------------------

function FactRow({ fact, index }: { fact: PersonFact; index: number }) {
  const style =
    categoryStyles[fact.category] || categoryStyles.other;
  const Icon = style.icon;

  return (
    <motion.div
      initial={{ opacity: 0, x: -14 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.45, delay: index * 0.08 }}
      className="flex gap-4 py-4 first:pt-0 last:pb-0"
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${style.className}`}
        title={fact.category}
      >
        <Icon size={16} />
      </div>

      <div className="min-w-0">
        <p className="text-sm leading-6 text-gray-200">{fact.fact}</p>

        {fact.evidence && (
          <p className="mt-1.5 flex items-start gap-1.5 text-xs italic leading-5 text-gray-500">
            <Quote size={10} className="mt-1 shrink-0" />
            <span className="line-clamp-2">{fact.evidence}</span>
          </p>
        )}
      </div>
    </motion.div>
  );
}

function PersonFactsCard({
  person,
  facts,
  index,
}: {
  person: string;
  facts: PersonFact[];
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, delay: index * 0.12 }}
      className="glass-card glass-card-hover p-6 sm:p-7"
    >
      <div className="flex items-center gap-4">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${gradientForPerson(
            person
          )} text-base font-bold text-white shadow-lg`}
        >
          {initialsForPerson(person)}
        </div>

        <div className="min-w-0 flex-1">
          <h4 className="truncate text-lg font-semibold text-white">
            {person}
          </h4>

          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-gray-500">
            Fact file
          </p>
        </div>

        {facts.length > 0 && (
          <span className="shrink-0 rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
            {facts.length} {facts.length === 1 ? "fact" : "facts"}
          </span>
        )}
      </div>

      {facts.length > 0 ? (
        <div className="mt-5 divide-y divide-white/[0.06] border-t border-white/[0.06] pt-1">
          {facts.map((fact, factIndex) => (
            <FactRow key={factIndex} fact={fact} index={factIndex} />
          ))}
        </div>
      ) : (
        <p className="mt-5 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-gray-500">
          The chat didn&apos;t reveal enough clear facts about this person
          yet.
        </p>
      )}
    </motion.div>
  );
}

function FactsSkeleton({ participants }: { participants: string[] }) {
  const placeholders =
    participants.length > 0 ? participants : ["Person 1", "Person 2"];

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {placeholders.map((person, index) => (
        <div
          key={`${person}-${index}`}
          className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 sm:p-7"
        >
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 animate-pulse rounded-2xl bg-white/10" />

            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 animate-pulse rounded-full bg-white/10" />
              <div className="h-2.5 w-1/5 animate-pulse rounded-full bg-white/5" />
            </div>
          </div>

          <div className="mt-6 space-y-5">
            {[0, 1, 2, 3, 4].map((row) => (
              <div key={row} className="flex items-start gap-4">
                <div
                  className="h-9 w-9 shrink-0 animate-pulse rounded-xl bg-white/10"
                  style={{ animationDelay: `${row * 120}ms` }}
                />

                <div className="w-full space-y-2 pt-1">
                  <div
                    className="h-3 animate-pulse rounded-full bg-white/10"
                    style={{
                      width: `${88 - row * 9}%`,
                      animationDelay: `${row * 120}ms`,
                    }}
                  />
                  <div
                    className="h-2.5 w-1/2 animate-pulse rounded-full bg-white/5"
                    style={{ animationDelay: `${row * 120}ms` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------
// SECTION
// ------------------------------------------------

type FactsSectionProps = {
  participants: string[];
};

function FactsSection({ participants }: FactsSectionProps) {
  const [data, setData] = useState<FactsResponse | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [retrying, setRetrying] = useState(false);

  // Poll /api/facts until extraction finishes. The first call also
  // triggers the background extraction on the server (lazy start).
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let attempts = 0;

    const MAX_ATTEMPTS = 45; // ~3 minutes at 4s intervals

    const tick = async () => {
      attempts += 1;

      let settled = false;

      try {
        const result = await chatApi.facts();

        if (cancelled) return;

        setData(result);

        if (
          result.status === "ready" ||
          result.status === "error" ||
          result.status === "unavailable"
        ) {
          settled = true;
        }
      } catch {
        // Backend hiccup, keep polling until the attempt budget runs out
      }

      if (cancelled || settled) return;

      if (attempts >= MAX_ATTEMPTS) {
        setData((prev) =>
          prev && prev.status === "ready"
            ? prev
            : {
                status: "error",
                facts: null,
                error:
                  "Fact extraction is taking unusually long. You can try again.",
              }
        );
        return;
      }

      timer = window.setTimeout(tick, 4000);
    };

    tick();

    return () => {
      cancelled = true;

      if (timer) window.clearTimeout(timer);
    };
  }, [reloadKey]);

  const handleRetry = async () => {
    setRetrying(true);

    try {
      await chatApi.facts(true);
    } catch {
      // The polling loop below will surface the server's response
    }

    setReloadKey((key) => key + 1);
    setRetrying(false);
  };

  const isWaiting =
    !data || data.status === "idle" || data.status === "running";

  const personEntries =
    data?.status === "ready" && data.facts
      ? participants.map((person) => ({
          person,
          facts: data.facts?.[person] || [],
        }))
      : [];

  return (
    <div>
      {isWaiting && (
        <div className="glass-chip mb-6 flex items-center gap-3 rounded-2xl px-5 py-4">
          <Loader2 size={16} className="animate-spin text-amber-300" />

          <p className="text-sm text-gray-400">
            Digging through your conversation for interesting facts about
            everyone...
          </p>
        </div>
      )}

      {isWaiting && <FactsSkeleton participants={participants} />}

      {data?.status === "error" && (
        <div className="rounded-2xl border border-red-500/25 bg-red-500/[0.06] p-6 text-center">
          <p className="text-sm text-red-300">
            {data.error ||
              "Something went wrong while extracting facts from your chat."}
          </p>

          <button
            type="button"
            onClick={handleRetry}
            disabled={retrying}
            className="glass-chip mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm text-gray-300 transition-all hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={15} className={retrying ? "animate-spin" : ""} />
            {retrying ? "Retrying..." : "Try again"}
          </button>
        </div>
      )}

      {data?.status === "unavailable" && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
          <Users size={22} className="mx-auto text-gray-500" />

          <p className="mt-3 text-sm text-gray-400">
            AI fact extraction needs a Gemini API key on the server. The rest
            of your analytics still work normally.
          </p>
        </div>
      )}

      {data?.status === "ready" && personEntries.length > 0 && (
        <div className="grid gap-5 md:grid-cols-2">
          {personEntries.map((entry, index) => (
            <PersonFactsCard
              key={entry.person}
              person={entry.person}
              facts={entry.facts}
              index={index}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default FactsSection;
