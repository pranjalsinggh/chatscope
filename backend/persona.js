// ------------------------------------------------
// CHAT PERSONA (Gemini), Phase 3 onboarding personality
// ------------------------------------------------
// Distills a chat's computed analytics into a short identity badge
// (e.g. "The 2AM Paragraphers") plus one explaining line. Deliberately
// person-free: the prompt only sees aggregate numbers and symbols, never
// names or message text, so alias mode and redaction don't apply and
// nothing personal can leak into the persona.
// ------------------------------------------------

const { callGeminiWithRetry } = require("./geminiRetry");

/**
 * Pure: reduce the full analytics payload to the handful of aggregates
 * the persona prompt is allowed to see. No names, no message content.
 */
function buildPersonaStats(analytics) {
  if (!analytics || typeof analytics !== "object") return null;

  const overview = analytics.overview || {};
  const totalMessages = overview.totalMessages;
  if (!Number.isFinite(totalMessages) || totalMessages <= 0) return null;

  const byHour = analytics.activity?.messagesByHour || {};
  const peakHourEntry = Object.entries(byHour).sort(
    (a, b) => b[1] - a[1]
  )[0];
  const peakHour =
    peakHourEntry && peakHourEntry[1] > 0 ? Number(peakHourEntry[0]) : null;

  const nightShare = (() => {
    const keys = Object.keys(byHour);
    if (keys.length === 0) return null;
    let night = 0;
    let total = 0;
    for (const key of keys) {
      const count = Number(byHour[key]) || 0;
      total += count;
      const hour = Number(key);
      if (hour >= 22 || hour < 5) night += count;
    }
    return total > 0 ? Math.round((night / total) * 100) : null;
  })();

  const fastest = Object.entries(analytics.responseTime?.byPerson || {})
    .filter(([, stats]) => stats.averageResponseMinutes > 0)
    .sort(
      (a, b) => a[1].averageResponseMinutes - b[1].averageResponseMinutes
    )[0];

  const dayEntries = Object.entries(analytics.activity?.messagesByDate || {});
  const busiestDay = dayEntries.sort((a, b) => b[1] - a[1])[0];

  return {
    totalMessages,
    totalWords: overview.totalWords || null,
    participants: overview.totalParticipants || null,
    durationDays: overview.dateRange?.durationDays || null,
    averageMessageLength: overview.averageMessageLength || null,
    mediaMessages: overview.mediaMessages || null,
    links: overview.totalLinks || null,
    peakHour,
    nightSharePct: nightShare,
    topEmojis: (analytics.topEmojis || []).slice(0, 5).map((e) => e.emoji),
    topWords: (analytics.topWords || []).slice(0, 8).map((w) => w.word),
    fastestReplyMinutes: fastest ? fastest[1].averageResponseMinutes : null,
    busiestDayCount: busiestDay ? busiestDay[1] : null,
  };
}

/** Pure: the exact prompt sent to Gemini for a stats object. */
function buildPersonaPrompt(stats) {
  return `You invent a short, fun PERSONALITY BADGE for a WhatsApp conversation, Spotify-Wrapped style.

Return ONLY valid JSON, nothing else:
{"badge":"...","line":"..."}

RULES:
1. "badge" is 2-5 words, title case, starting with "The", e.g. "The 2AM Paragraphers", "The Emoji Historians", "The Rapid-Fire Duo". It must feel earned by the data, not generic.
2. "line" is ONE sentence (max 22 words) explaining the badge, citing at least one concrete number from the stats.
3. Warm, playful, Gen-Z friendly. Never cringe-forced slang. No emojis in the output.
4. Ground everything in the stats below. NEVER invent numbers.
5. Do not mention any person's name (you don't have names anyway).

CHAT STATS (aggregates only):
${JSON.stringify(stats)}`;
}

/** Pure: validate + normalize the model's JSON answer. */
function normalizePersona(parsed) {
  if (!parsed || typeof parsed !== "object") return null;

  const badge = String(parsed.badge || "").trim();
  const line = String(parsed.line || "").trim();

  if (!badge || !line) return null;

  return {
    badge: badge.slice(0, 60),
    line: line.slice(0, 180),
  };
}

/** Pure: parse Gemini's possibly-fenced output. */
function parsePersonaJson(text) {
  if (typeof text !== "string" || !text.trim()) return null;

  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) return null;

  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function extractPersona(ai, model, analytics) {
  const stats = buildPersonaStats(analytics);
  if (!stats) {
    throw new Error("Not enough chat data to build a persona.");
  }

  const text = await callGeminiWithRetry(ai, model, buildPersonaPrompt(stats), {
    maxAttempts: 3,
    label: "Persona",
  });

  const parsed = parsePersonaJson(text);
  const persona = normalizePersona(parsed);

  if (!persona) {
    throw new Error("Could not parse the persona response.");
  }

  return persona;
}

module.exports = {
  buildPersonaStats,
  buildPersonaPrompt,
  normalizePersona,
  parsePersonaJson,
  extractPersona,
};
