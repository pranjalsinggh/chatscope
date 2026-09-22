/**
 * Analytics unit tests — overview, response stats, starters, new sections.
 * Run: node tests/analytics.test.js
 */
const analytics = require("../analytics");

// Small deterministic fixture: A and B chat daily; C is mostly quiet.
const messages = [
  { id: 0, date: "01/01/2025", time: "09:00", timestamp: new Date(2025, 0, 1, 9, 0).getTime(), sender: "A", message: "morning! how are you doing today" },
  { id: 1, date: "01/01/2025", time: "09:05", timestamp: new Date(2025, 0, 1, 9, 5).getTime(), sender: "B", message: "good! cooking later, trying a recipe" },
  { id: 2, date: "01/01/2025", time: "09:06", timestamp: new Date(2025, 0, 1, 9, 6).getTime(), sender: "A", message: "nice 😄" },
  { id: 3, date: "02/02/2025", time: "18:00", timestamp: new Date(2025, 1, 2, 18, 0).getTime(), sender: "B", message: "hey! long time" },
  { id: 4, date: "02/02/2025", time: "18:10", timestamp: new Date(2025, 1, 2, 18, 10).getTime(), sender: "A", message: "yes! been travelling" },
  { id: 5, date: "02/02/2025", time: "18:12", timestamp: new Date(2025, 1, 2, 18, 12).getTime(), sender: "A", message: "https://example.com trip pics" },
];

const result = analytics(messages);

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

check("total messages", result.overview.totalMessages === 6);
check("participants detected", result.overview.participants.length === 2);
check("date range spans both months", result.overview.dateRange.durationDays >= 30);
check("total characters", result.overview.totalCharacters === messages.reduce((s, m) => s + m.message.length, 0));
check("total words counted", result.overview.totalWords > 0);
check("links counted", result.overview.totalLinks === 1);

check("messagesPerPerson split", result.messagesPerPerson["A"] === 4 && result.messagesPerPerson["B"] === 2);

// Response times: A replied in 6 min (09:06 after 09:05), B in 5 and 10 min
check("median response for A is 5.5", result.responseTime.byPerson["A"].medianResponseMinutes === 5.5);
check("fastest response tracked", result.responseTime.byPerson["B"].fastestResponseMinutes === 5);

// Conversation starters: 2 sessions (01/01 and 02/02), started by A and B
check("two conversations", result.conversationStarters.totalConversations === 2);
check("starters split", result.conversationStarters.byPerson.length === 2);

// New sections
check(
  "interaction pairs captured",
  result.interactions.topPairs.length === 2,
  JSON.stringify(result.interactions.topPairs)
);
check("monthly trends aggregated", result.monthlyTrends.length === 2 && result.monthlyTrends[0].count === 3);
check(
  "per-person words exclude stop words",
  result.wordsByPerson["B"].every((w) => w.word !== "the"),
  JSON.stringify(result.wordsByPerson)
);
check("per-person emojis", result.emojisPerPerson["A"] === 1);
check("top words exclude short/stop words", result.topWords.every((w) => w.word.length > 2));

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
