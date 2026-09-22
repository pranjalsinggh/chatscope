import type { Analytics } from "./api";

export type VibePart = {
  label: string;
  /** 0-100 component score */
  score: number;
  /** One-line human explanation of this component */
  detail: string;
};

export type VibeMatch = {
  /** 0-100 overall score */
  score: number;
  /** Fun identity label, e.g. "Chaotic besties" */
  label: string;
  /** One-sentence blurb grounded in the components */
  blurb: string;
  /** The two participants, first-name form */
  names: [string, string];
  parts: VibePart[];
};

function firstName(full: string): string {
  return String(full || "").trim().split(/\s+/)[0] || "Someone";
}

/** 100 when perfectly even (50/50), drops as the split skews */
function balanceScore(shareA: number, shareB: number): number {
  const total = shareA + shareB;
  if (total <= 0) return 0;
  const aPct = (shareA / total) * 100;
  return Math.max(0, Math.round(100 - Math.abs(aPct - 50) * 2));
}

function vibeLabel(score: number): string {
  if (score >= 85) return "In perfect sync";
  if (score >= 70) return "Great chemistry";
  if (score >= 55) return "Chaotic besties";
  if (score >= 40) return "Opposites attract";
  return "Beautiful chaos";
}

/**
 * Two-person vibe match, pure computation, deterministic, no AI.
 * Combines how evenly the two carry the conversation, how evenly they
 * start conversations, how symmetric their reply speeds are, and how
 * much their emoji vocabulary overlaps. Only meaningful (and non-null)
 * for exactly-2-participant chats.
 */
export function computeVibeMatch(analytics: Analytics): VibeMatch | null {
  const participants = analytics.overview?.participants || [];
  if (participants.length !== 2) return null;

  const [a, b] = participants;
  const names: [string, string] = [firstName(a), firstName(b)];
  const parts: VibePart[] = [];

  // 1. How evenly the conversation is carried
  const msgA = analytics.messagesPerPerson?.[a] ?? 0;
  const msgB = analytics.messagesPerPerson?.[b] ?? 0;
  if (msgA + msgB > 0) {
    const score = balanceScore(msgA, msgB);
    const leader = msgA >= msgB ? names[0] : names[1];
    const skew = Math.round(
      Math.abs((msgA / (msgA + msgB)) * 100 - 50) * 2
    );
    parts.push({
      label: "Conversation balance",
      score,
      detail:
        score >= 85
          ? "You carry it almost exactly evenly."
          : `${leader} carries the conversation by ${skew}%.`,
    });
  }

  // 2. Who starts conversations, how evenly
  const starterList = analytics.conversationStarters?.byPerson || [];
  const startersA = starterList.find((s) => s.person === a)?.count ?? 0;
  const startersB = starterList.find((s) => s.person === b)?.count ?? 0;
  if (startersA + startersB > 0) {
    const score = balanceScore(startersA, startersB);
    const initiator = startersA >= startersB ? names[0] : names[1];
    parts.push({
      label: "First-message balance",
      score,
      detail:
        score >= 85
          ? "Either of you can be the one to reach out first."
          : `${initiator} usually starts the conversation.`,
    });
  }

  // 3. Reply-speed symmetry (ratio of the faster to the slower average)
  const replies = analytics.responseTime?.byPerson || {};
  const avgA = replies[a]?.averageResponseMinutes ?? 0;
  const avgB = replies[b]?.averageResponseMinutes ?? 0;
  if (avgA > 0 && avgB > 0) {
    const ratio = Math.min(avgA, avgB) / Math.max(avgA, avgB);
    const score = Math.round(ratio * 100);
    const faster = avgA <= avgB ? names[0] : names[1];
    parts.push({
      label: "Reply rhythm",
      score,
      detail:
        score >= 80
          ? "You reply at almost the same tempo."
          : `${faster} is the quicker texter of the two.`,
    });
  }

  // 4. Emoji vocabulary overlap (top-5 sets)
  const emojiByPerson = analytics.emojisPerPerson || {};
  const topSet = (person: string): Set<string> => {
    const raw = emojiByPerson[person];
    const counts: Record<string, number> =
      raw && typeof raw === "object" ? (raw as Record<string, number>) : {};
    return new Set(
      Object.entries(counts)
        .sort((x, y) => y[1] - x[1])
        .slice(0, 5)
        .map(([emoji]) => emoji)
    );
  };
  const setA = topSet(a);
  const setB = topSet(b);
  if (setA.size > 0 && setB.size > 0) {
    let shared = 0;
    for (const emoji of setA) if (setB.has(emoji)) shared += 1;
    const score = Math.round((shared / 5) * 100);
    parts.push({
      label: "Emoji language",
      score,
      detail:
        score >= 60
          ? `You share ${shared} of your top 5 emoji, same energy.`
          : `Only ${shared} of your top 5 emoji overlap, different vibes.`,
    });
  }

  if (parts.length < 2) return null; // not enough signal to judge

  const score = Math.round(
    parts.reduce((sum, part) => sum + part.score, 0) / parts.length
  );

  const strongest = [...parts].sort((x, y) => y.score - x.score)[0];
  const label = vibeLabel(score);

  const blurb = `${label}, ${strongest.detail.charAt(0).toLowerCase()}${strongest.detail.slice(1)}`;

  return { score, label, blurb, names, parts };
}
