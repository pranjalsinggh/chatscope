// ------------------------------------------------
// PUBLIC WALL, opt-in, anonymized one-liners
// ------------------------------------------------
// Users can publish ONE computed stat from their chat to a shared
// wall shown on the landing page. Safety model:
//   • Text is ALWAYS generated here from templates, the client only
//     picks a stat id. No free text can ever enter the wall.
//   • Templates never include participant names, filenames or
//     message content, only aggregate numbers and emojis.
//   • Entries carry no identity (no user id, no IP).
//   • Hard cap of WALL_CAP entries, oldest evicted.
// File lives at the ROOT data dir (shared, like users/index.json).
// ------------------------------------------------

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { ROOT_DATA_DIR } = require("./dataDir");

const WALL_CAP = 50;

function wallFile() {
  return path.join(ROOT_DATA_DIR, "wall.json");
}

const fmt = (n) => Number(n).toLocaleString("en-US");

// ------------------------------------------------
// STAT TEMPLATES, each returns a string or null
// (null = the chat lacks data for this stat)
// ------------------------------------------------

const TEMPLATES = [
  {
    id: "night-owls",
    emoji: "🌙",
    build: (a) => {
      const byHour = a?.activity?.messagesByHour || {};
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
      if (total < 100) return null;
      const pct = Math.round((night / total) * 100);
      if (pct < 20) return null; // not worth claiming
      return `${pct}% of our messages land after 10 PM`;
    },
  },
  {
    id: "streak",
    emoji: "🔥",
    build: (a) => {
      const days = Object.keys(a?.activity?.messagesByDate || {}).length;
      if (days === 0) return null;
      const byDate = a.activity.messagesByDate;
      const epoch = Object.keys(byDate)
        .map((k) => {
          const [d, m, y] = k.split("/").map(Number);
          return d && m && y ? Math.floor(new Date(y, m - 1, d).getTime() / 86400000) : null;
        })
        .filter((x) => x !== null)
        .sort((x, y) => x - y);
      let best = 1;
      let run = 1;
      for (let i = 1; i < epoch.length; i++) {
        if (epoch[i] === epoch[i - 1] + 1) run += 1;
        else run = 1;
        if (run > best) best = run;
      }
      if (best < 7) return null;
      return `we chatted ${best} days in a row without missing one`;
    },
  },
  {
    id: "biggest-day",
    emoji: "📈",
    build: (a) => {
      const entries = Object.entries(a?.activity?.messagesByDate || {});
      const best = entries.sort((x, y) => y[1] - x[1])[0];
      if (!best || best[1] < 50) return null;
      return `${fmt(best[1])} messages in a single day. one day.`;
    },
  },
  {
    id: "fastest-reply",
    emoji: "⚡",
    build: (a) => {
      const fastest = a?.responseTime?.fastestResponse;
      if (!fastest || fastest.responseMinutes === null) return null;
      const seconds = Math.round(fastest.responseMinutes * 60);
      if (seconds < 1 || seconds > 300) return null;
      return `fastest reply ever: ${seconds} seconds`;
    },
  },
  {
    id: "signature-emoji",
    emoji: "🏆",
    build: (a) => {
      const top = (a?.topEmojis || [])[0];
      if (!top || top.count < 50) return null;
      return `this chat used ${top.emoji} ${fmt(top.count)} times. ${fmt(top.count)} times.`;
    },
  },
  {
    id: "words",
    emoji: "📚",
    build: (a) => {
      const words = a?.overview?.totalWords;
      if (!words || words < 1000) return null;
      return `${fmt(words)} words, longer than some novels`;
    },
  },
  {
    id: "marathon",
    emoji: "📆",
    build: (a) => {
      const days = a?.overview?.dateRange?.durationDays;
      const messages = a?.overview?.totalMessages;
      if (!days || days < 30 || !messages) return null;
      return `${fmt(messages)} messages over ${fmt(days)} days`;
    },
  },
];

// ------------------------------------------------
// OPTIONS (for the publish UI), computed for the CALLER's analytics
// ------------------------------------------------

function wallOptions(analytics) {
  if (!analytics || typeof analytics !== "object") return [];
  const result = [];
  for (const template of TEMPLATES) {
    let text = null;
    try {
      text = template.build(analytics);
    } catch {
      text = null;
    }
    if (text) {
      result.push({ id: template.id, emoji: template.emoji, text: text.slice(0, 140) });
    }
  }
  return result;
}

// ------------------------------------------------
// PERSISTENCE
// ------------------------------------------------

function loadWall() {
  try {
    if (fs.existsSync(wallFile())) {
      const parsed = JSON.parse(fs.readFileSync(wallFile(), "utf-8"));
      if (Array.isArray(parsed?.entries)) return parsed.entries;
    }
  } catch {
    // corrupt file → start fresh
  }
  return [];
}

function saveWall(entries) {
  fs.mkdirSync(ROOT_DATA_DIR, { recursive: true });
  const tmp = `${wallFile()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ entries }, null, 2), "utf-8");
  fs.renameSync(tmp, wallFile());
}

function listWall() {
  return loadWall().slice(0, WALL_CAP);
}

function publishStat(analytics, statId) {
  if (typeof statId !== "string" || !statId) {
    return { ok: false, reason: "invalid_id" };
  }

  const template = TEMPLATES.find((t) => t.id === statId);
  if (!template) {
    return { ok: false, reason: "unknown_stat" };
  }

  let text = null;
  try {
    text = template.build(analytics);
  } catch {
    text = null;
  }
  if (!text) {
    return { ok: false, reason: "no_data" };
  }

  const entry = {
    id: crypto.randomUUID(),
    statId,
    emoji: template.emoji,
    text: text.slice(0, 140),
    createdAt: new Date().toISOString(),
  };

  const entries = [entry, ...loadWall()].slice(0, WALL_CAP);
  saveWall(entries);

  return { ok: true, entry };
}

module.exports = { wallOptions, listWall, publishStat, WALL_CAP };
