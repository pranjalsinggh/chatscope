// ------------------------------------------------
// PERSONA TESTS — pure logic only (no Gemini calls)
// ------------------------------------------------

const {
  buildPersonaStats,
  buildPersonaPrompt,
  parsePersonaJson,
  normalizePersona,
} = require("../persona");

const results = [];

function check(name, condition) {
  results.push({ name, ok: Boolean(condition) });
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}`);
}

// ------------------------------------------------
// buildPersonaStats
// ------------------------------------------------

const analytics = {
  overview: {
    totalMessages: 100,
    totalParticipants: 2,
    totalWords: 1200,
    averageMessageLength: 42,
    mediaMessages: 7,
    totalLinks: 3,
    dateRange: { firstDate: "01/01/2025", lastDate: "10/01/2025", durationDays: 10 },
  },
  activity: {
    messagesByHour: { "23": 30, "0": 10, "12": 20 },
    messagesByDate: { "01/01/2025": 40, "02/01/2025": 60 },
  },
  responseTime: {
    byPerson: {
      "Person A": { averageResponseMinutes: 5 },
      "Person B": { averageResponseMinutes: 0.2 },
    },
  },
  topEmojis: [{ emoji: "😂", count: 20 }, { emoji: "🔥", count: 5 }],
  topWords: [{ word: "lol", count: 30 }, { word: "bro", count: 12 }],
};

const stats = buildPersonaStats(analytics);

check("stats: extracts totals", stats && stats.totalMessages === 100 && stats.totalWords === 1200);
check("stats: peak hour is most active", stats && stats.peakHour === 23);
check("stats: night share computed ((30+10)/60 = 67%)", stats && stats.nightSharePct === 67);
check("stats: fastest reply picked", stats && stats.fastestReplyMinutes === 0.2);
check("stats: top emojis/words truncated", stats && stats.topEmojis.length === 2 && stats.topWords.length === 2);
check("stats: contains NO participant names", stats && !JSON.stringify(stats).includes("Person A"));
check("stats: null for empty analytics", buildPersonaStats({}) === null);
check("stats: null for missing analytics", buildPersonaStats(null) === null);

// ------------------------------------------------
// buildPersonaPrompt
// ------------------------------------------------

const prompt = buildPersonaPrompt(stats);
check("prompt: embeds the stats JSON", prompt.includes('"totalMessages":100'));
check("prompt: asks for badge+line JSON shape", prompt.includes('"badge"') && prompt.includes('"line"'));
check("prompt: forbids inventing numbers", /NEVER invent/i.test(prompt));

// ------------------------------------------------
// parsePersonaJson + normalizePersona
// ------------------------------------------------

const good = parsePersonaJson('```json\n{"badge":"The 2AM Paragraphers","line":"40% of your 100 messages land after 10 PM."}\n```');
check("parse: strips code fences", good && good.badge === "The 2AM Paragraphers");

check("parse: rejects non-JSON", parsePersonaJson("hello world") === null);
check("parse: rejects empty input", parsePersonaJson("") === null);
check("parse: handles surrounding prose", parsePersonaJson('Here you go: {"badge":"X","line":"Y"} — enjoy!') !== null);

const normalized = normalizePersona(good);
check("normalize: keeps valid persona", normalized && normalized.badge === "The 2AM Paragraphers" && normalized.line.length > 0);

check("normalize: null on missing fields", normalizePersona({ badge: "Only badge" }) === null);
check("normalize: truncates oversized values", normalizePersona({ badge: "B".repeat(200), line: "L".repeat(300) }).badge.length <= 60);

check("normalize: rejects arrays", normalizePersona(["badge"]) === null);
check("normalize: rejects null", normalizePersona(null) === null);

// ------------------------------------------------
// SUMMARY
// ------------------------------------------------

const failed = results.filter((r) => !r.ok);
console.log(`\n=== RESULT: ${results.length - failed.length} passed, ${failed.length} failed ===`);
process.exit(failed.length > 0 ? 1 : 0);
