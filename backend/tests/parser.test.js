/**
 * Parser unit tests — formats, multiline, system notices, flags.
 * Run: node tests/parser.test.js
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { parseWhatsAppChat } = require("../parser");

const FIXTURE = [
  // classic 12h, 2-digit year
  "23/08/25, 10:43 pm - Aditi: Hello there",
  // multiline continuation
  "23/08/25, 10:44 pm - Pranjal: First line",
  "second line without timestamp",
  "third line",
  // 24h + 4-digit year
  "24/08/2025, 22:43 - Aditi: Using 24h time",
  // iOS bracketed with seconds
  "[25/08/25, 11:30:45 AM] Pranjal: Bracketed iOS format",
  // short affirmative (Q&A stitching relies on these parsing cleanly)
  "[25/08/25, 11:31:02 AM] Aditi: Yeah",
  // media + deleted + link + emoji + unicode sender
  "26/08/25, 8:02 pm - Aditi: <Media omitted>",
  "26/08/25, 8:03 pm - Aditi: This message was deleted",
  "26/08/25, 8:04 pm - Aditi: see https://example.com/x 🔥",
  "26/08/25, 8:05 pm - राहुल: नमस्ते",
].join("\n");

const tmpFile = path.join(os.tmpdir(), `chatscope-parser-${Date.now()}.txt`);
fs.writeFileSync(tmpFile, FIXTURE, "utf-8");

const messages = parseWhatsAppChat(tmpFile);
fs.unlinkSync(tmpFile);

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

check("parsed all 9 messages", messages.length === 9);
check("12h pm converted (22:43)", messages[0].time === "22:43");
check(
  "multiline joined",
  messages[1].message === "First line\nsecond line without timestamp\nthird line"
);
check("24h time kept (22:43)", messages[2].time === "22:43");
check("4-digit year normalized (25/08/2025)", messages[2].date === "24/08/2025");
check("bracketed iOS parsed", messages[3].sender === "Pranjal" && messages[3].time === "11:30");
check("seconds dropped from display time", messages[3].time === "11:30");
check("media flag set", messages[5].isMedia === true);
check("deleted flag set", messages[6].isDeleted === true);
check("link extracted", messages[7].links.includes("https://example.com/x"));
check("emoji extracted", messages[7].emojis.includes("🔥"));
check("unicode sender intact", messages[8].sender === "राहुल");
check("timestamps present", messages.every((m) => typeof m.timestamp === "number"));
check("stable ids assigned", messages[0].id === 0 && messages[8].id === 8);

// Edge cases: empty file and garbage file
const emptyFile = path.join(os.tmpdir(), `chatscope-empty-${Date.now()}.txt`);
fs.writeFileSync(emptyFile, "", "utf-8");
check("empty file yields no messages", parseWhatsAppChat(emptyFile).length === 0);
fs.unlinkSync(emptyFile);

const garbageFile = path.join(os.tmpdir(), `chatscope-garbage-${Date.now()}.txt`);
fs.writeFileSync(garbageFile, "random text\nno timestamps here\n", "utf-8");
check("garbage file yields no messages", parseWhatsAppChat(garbageFile).length === 0);
fs.unlinkSync(garbageFile);

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
