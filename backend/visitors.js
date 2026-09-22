// ------------------------------------------------
// VISITOR COUNTER (privacy-friendly, self-hosted)
// ------------------------------------------------
// Counts DISTINCT visitors: one visit = one fresh session cookie.
// No fingerprinting, no IP storage, no third-party trackers — the
// session id is hashed before it is remembered, so the counter can
// dedupe without ever being able to reverse a hash back to a session.
//
// Aggregate stats persist to data/visitors.json (resets on hosts
// without a persistent disk, e.g. Render free tier).
// ------------------------------------------------

const fs = require("fs");
const crypto = require("crypto");
const { resolveDataFile } = require("./dataDir");

const SEEN_CAP = 10000; // bound the dedup set (oldest entries dropped)

let seenHashes = new Set();
let stats = null;
let saveTimer = null;

function visitorsFile() {
  return resolveDataFile("visitors.json");
}

function loadStats() {
  if (stats) return stats;
  try {
    if (fs.existsSync(visitorsFile())) {
      const parsed = JSON.parse(fs.readFileSync(visitorsFile(), "utf8"));
      stats = {
        totalVisitors: Number(parsed.totalVisitors) || 0,
        perDay: parsed.perDay && typeof parsed.perDay === "object" ? parsed.perDay : {},
        seenHashes: Array.isArray(parsed.seenHashes) ? parsed.seenHashes : [],
      };
      seenHashes = new Set(stats.seenHashes);
      return stats;
    }
  } catch {
    // corrupt file — start fresh
  }
  stats = { totalVisitors: 0, perDay: {}, seenHashes: [] };
  return stats;
}

function saveStats() {
  // Throttled: at most one disk write per minute
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      stats.seenHashes = [...seenHashes].slice(-SEEN_CAP);
      const tmp = `${visitorsFile()}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(stats, null, 2), "utf8");
      fs.renameSync(tmp, visitorsFile());
    } catch {
      // best-effort — a failed counter write must never break a request
    }
  }, 60 * 1000);
  if (typeof saveTimer.unref === "function") saveTimer.unref();
}

/** Count this request as a visit iff its session has never been seen. */
function countVisitor(req) {
  const sessionId = req.cookies?.chatscope_sid;
  if (!sessionId) return; // no session yet — middleware ordering

  const hash = crypto
    .createHash("sha256")
    .update(sessionId)
    .digest("hex")
    .slice(0, 24);

  if (seenHashes.has(hash)) return; // returning visitor — already counted

  const s = loadStats();
  seenHashes.add(hash);
  if (seenHashes.size > SEEN_CAP) {
    const oldest = seenHashes.values().next().value;
    seenHashes.delete(oldest);
  }

  const today = new Date().toISOString().slice(0, 10);
  s.totalVisitors += 1;
  s.perDay[today] = (s.perDay[today] || 0) + 1;
  stats = s;
  saveStats();
}

function getVisitorStats() {
  const s = loadStats();
  const today = new Date().toISOString().slice(0, 10);
  return {
    totalVisitors: s.totalVisitors,
    todayVisitors: s.perDay[today] || 0,
    days: Object.keys(s.perDay).length,
  };
}

module.exports = { countVisitor, getVisitorStats };
