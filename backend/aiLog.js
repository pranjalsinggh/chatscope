// ------------------------------------------------
// AI TRANSPARENCY LOG (ai_log.json — one per data context)
// ------------------------------------------------
// Counts-only record of every AI-bound call: WHAT was sent
// (feature, message count, provider) and WHEN — never the
// content itself. Bounded to the newest 500 entries.
// Guests use the root data folder exactly as before; signed-in
// users each get their own ai_log.json inside data/users/<id>/.
// ------------------------------------------------

const fs = require("fs");
const path = require("path");
const { resolveDataFile, getDataDir, ROOT_DATA_DIR } = require("./dataDir");

const AI_LOG_LIMIT = 500;

// Per-context log caches, keyed by the resolved data dir. The root
// entry is loaded at boot (identical to the original module-level
// behavior for guests).
const logsByDir = new Map(); // dir → entries[]

function aiLogFileIn(dir) {
  // Root keeps the legacy migration path (backend/ai_log.json → data/)
  return dir === ROOT_DATA_DIR
    ? resolveDataFile("ai_log.json")
    : path.join(dir, "ai_log.json");
}

function loadLog(dir) {
  try {
    const file = aiLogFileIn(dir);
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // unreadable log → start empty
  }
  return [];
}

function logEntries() {
  const dir = getDataDir();
  if (!logsByDir.has(dir)) {
    logsByDir.set(dir, loadLog(dir));
  }
  return logsByDir.get(dir);
}

function saveLog() {
  try {
    const file = aiLogFileIn(getDataDir());
    const temporaryFile = `${file}.tmp`;
    fs.writeFileSync(
      temporaryFile,
      JSON.stringify(logEntries(), null, 2),
      "utf-8"
    );
    fs.renameSync(temporaryFile, file);
  } catch {
    // Best-effort: a failed log write must never break an AI call
  }
}

/**
 * Record one AI-bound call. Fields: counts + metadata only —
 * NEVER message content, questions, or answers.
 */
const crypto = require("crypto");

function logAiCall({ chatId, feature, messagesSent, provider, sessionId }) {
  const entries = logEntries();

  entries.push({
    timestamp: new Date().toISOString(),
    // PRIVACY: chatId embeds the export filename (contains the contact's
    // name) — store a one-way fingerprint instead, still unique per chat.
    chatId:
      typeof chatId === "string"
        ? crypto.createHash("sha256").update(chatId).digest("hex").slice(0, 16)
        : null,
    // Anonymous session tag: lets the log be filtered per browser
    // without exposing anything (random id, server-side only).
    sessionId: sessionId ? String(sessionId).slice(0, 32) : null,
    feature: String(feature || "unknown"),
    messagesSent: Number(messagesSent) || 0,
    provider: String(provider || "unknown"),
  });

  if (entries.length > AI_LOG_LIMIT) {
    entries.splice(0, entries.length - AI_LOG_LIMIT);
  }

  saveLog();
}

function getAiLog(sessionId) {
  const entries = [...logEntries()];
  if (!sessionId) return entries;
  return entries.filter((entry) => entry.sessionId === sessionId);
}

/** Clear only the calling session's entries (privacy model). */
function clearAiLog(sessionId) {
  const entries = logEntries();
  if (!sessionId) {
    logsByDir.set(getDataDir(), []);
  } else {
    const remaining = entries.filter((entry) => entry.sessionId !== sessionId);
    logsByDir.set(getDataDir(), remaining);
  }
  saveLog();
}

module.exports = { logAiCall, getAiLog, clearAiLog };
