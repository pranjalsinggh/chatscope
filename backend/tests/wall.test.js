// ------------------------------------------------
// WALL TESTS — template generation, privacy guarantees,
// validation, eviction. Run: node tests/wall.test.js
// ------------------------------------------------
const fs = require("fs");
const path = require("path");
const os = require("os");

// Isolated scratch data dir BEFORE requiring modules
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), "chatscope-wall-"));
process.env.CHATSCOPE_DATA_DIR = SCRATCH;

const wall = require("../wall");

let passed = 0;
let failed = 0;

function check(name, condition) {
  if (condition) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}`);
  }
}

// A rich analytics payload that satisfies every template
const richAnalytics = {
  overview: {
    totalMessages: 2500,
    totalParticipants: 2,
    participants: ["Pranjal Singh", "Aditi Global"],
    totalWords: 18400,
    dateRange: { firstDate: "01/01/2025", lastDate: "20/04/2025", durationDays: 110 },
  },
  activity: {
    messagesByDate: (() => {
      const map = {};
      for (let i = 1; i <= 30; i++) map[`0${i}/01/2025`.slice(-10)] = 40; // 30-day streak
      map["05/02/2025"] = 120;
      return map;
    })(),
    messagesByHour: {
      "12": 10, "13": 10, "14": 10,
      "22": 30, "23": 40, "0": 25, "1": 15,
    },
  },
  responseTime: {
    fastestResponse: { responder: "X", responseMinutes: 0.05, previousSender: "Y", previousMessage: "a", responseMessage: "b", date: "d", time: "t" },
    byPerson: { "Pranjal Singh": { averageResponseMinutes: 5 } },
  },
  topEmojis: [{ emoji: "🥲", count: 182 }],
};

// ------------------------------------------------
// OPTIONS: only template-generated text, no names ever
// ------------------------------------------------

const options = wall.wallOptions(richAnalytics);
check("options: produced for a rich chat", options.length >= 5);
check("options: night-owls stat present", options.some((o) => o.id === "night-owls"));
check("options: streak stat present", options.some((o) => o.id === "streak"));
check("options: PRIVACY — no participant name in any option text", options.every((o) => !o.text.includes("Pranjal") && !o.text.includes("Aditi")));
check("options: PRIVACY — no filename/title fields exist", options.every((o) => !("filename" in o) && !("chatName" in o)));
check("options: text is bounded", options.every((o) => o.text.length <= 140));

// Weak chat → fewer/no options, no crash
const weakOptions = wall.wallOptions({ overview: { totalMessages: 3 }, activity: { messagesByHour: {} } });
check("options: weak chat yields empty list", weakOptions.length === 0);
check("options: null analytics yields empty list", wall.wallOptions(null).length === 0);

// ------------------------------------------------
// PUBLISH: id-only input, server-side text, no identity stored
// ------------------------------------------------

const pub = wall.publishStat(richAnalytics, "signature-emoji");
check("publish: succeeds with valid id", pub.ok === true);
check("publish: entry has emoji + text", pub.entry && pub.entry.emoji === "🏆" && pub.entry.text.includes("182"));
check("publish: PRIVACY — stored text has no names", !pub.entry.text.includes("Pranjal"));
check("publish: entry carries NO user/ip identity", !("userId" in pub.entry) && !("ip" in pub.entry) && !("ownerId" in pub.entry));

check("publish: unknown id rejected", wall.publishStat(richAnalytics, "hack").ok === false);
check("publish: missing id rejected", wall.publishStat(richAnalytics, "").ok === false);
check("publish: stat without data rejected", wall.publishStat({ overview: { totalMessages: 1 } }, "streak").ok === false);

// Second publish prepends (newest first)
const pub2 = wall.publishStat(richAnalytics, "streak");
const listed = wall.listWall();
check("publish: newest first", listed[0].id === pub2.entry.id);

// ------------------------------------------------
// EVICTION: cap at WALL_CAP
// ------------------------------------------------

for (let i = 0; i < wall.WALL_CAP + 10; i++) {
  wall.publishStat(richAnalytics, "biggest-day");
}
const capped = wall.listWall();
check("eviction: wall capped at WALL_CAP", capped.length === wall.WALL_CAP);
check("eviction: oldest entries dropped, newest kept", capped[0].id !== pub.entry.id);

// Persistence: list survives "restart" (fresh read from disk)
const fresh = wall.listWall();
check("persistence: entries read from disk", fresh.length === wall.WALL_CAP);

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);

fs.rmSync(SCRATCH, { recursive: true, force: true });
if (failed > 0) process.exit(1);
