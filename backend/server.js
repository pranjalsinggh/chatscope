const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const multer = require("multer");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const { GoogleGenAI } = require("@google/genai");
require("dotenv").config();

const { parseWhatsAppChatText } = require("./parser");
const calculateAnalytics = require("./analytics");
const retrievalModule = require("./retrieval");
const { answerFromAnalytics, buildSuggestions } = require("./analyticsAnswer");
const embeddings = require("./embeddings");
const { extractFacts } = require("./facts");
const { getAskPersona } = require("./askPersonas");
const { wallOptions, listWall, publishStat } = require("./wall");
const { resolveDataFile, DATA_DIR, ROOT_DATA_DIR, ensureDataDir, getDataDir } = require("./dataDir");
const settingsStore = require("./settings");
const { redactText, redactMessages } = require("./redact");
const aiLog = require("./aiLog");

// ------------------------------------------------
// RETRIEVAL
// ------------------------------------------------

const retrieveRelevantMessages =
  typeof retrievalModule === "function"
    ? retrievalModule
    : retrievalModule.retrieveRelevantMessages;

if (typeof retrieveRelevantMessages !== "function") {
  console.error(
    "ERROR: retrieveRelevantMessages could not be loaded from retrieval.js"
  );

  process.exit(1);
}

// ------------------------------------------------
// APP
// ------------------------------------------------

const app = express();

// ------------------------------------------------
// MULTI-USER STATE BINDING
// ------------------------------------------------
// Every state variable below resolves to the REQUESTING user's
// context (guests keep the original root state object, zero
// behavior change). Implemented as a Proxy so all existing code
// that reads/writes these names works unchanged.
// ------------------------------------------------

const userContext = require("./userContext");

const STATE_VARIABLES = [
  "currentChatId",
  "currentMessages",
  "currentAnalytics",
  "currentChatInfo",
  "factsResult",
  "factsStatus",
  "factsError",
  "library",
  "answerCache",
];

const S = new Proxy(
  {},
  {
    get(_target, prop) {
      return userContext.getState()[prop];
    },
    set(_target, prop, value) {
      userContext.getState()[prop] = value;
      return true;
    },
  }
);

const PORT = process.env.PORT || 5000;

// ------------------------------------------------
// GEMINI
// ------------------------------------------------

if (!process.env.GEMINI_API_KEY) {
  if (process.env.ALLOW_ANALYTICS_ONLY === "1") {
    console.warn(
      "ALLOW_ANALYTICS_ONLY=1 — starting without Gemini. All AI features (Ask Your Chat, facts, persona, embeddings) are DISABLED."
    );
  } else {
    console.error(
      "FATAL: GEMINI_API_KEY is not set. Add it to backend/.env (see backend/.env.example).\n" +
        "If you intentionally want analytics-only mode with all AI features off,\n" +
        "start the server with ALLOW_ANALYTICS_ONLY=1."
    );
    process.exit(1);
  }
}

const rawAi = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// ------------------------------------------------
// RESOURCE METER, wrap the shared Gemini client so every call
// (ask, facts, persona, embeddings) reports usage, and every 429
// is attributed to the quota bucket that produced it. The meter
// prints to the terminal on errors, each interval when active, and
// is available at GET /api/resource-meter.
// ------------------------------------------------

const resourceMeter = require("./resourceMeter");

const ai = {
  models: {
    generateContent: async (params) => {
      try {
        const response = await rawAi.models.generateContent(params);
        const tokens =
          response?.usageMetadata?.promptTokenCount || 0;
        resourceMeter.record("gemini_flash", tokens);
        return response;
      } catch (error) {
        resourceMeter.record("gemini_flash", 0);
        const quota = resourceMeter.parseQuotaMetric(error);
        resourceMeter.recordError(
          "gemini_flash",
          String(error?.message || "").slice(0, 160),
          quota.metric
        );
        console.warn(
          `⚠️  Gemini Flash quota hit, ${quota.bucket}${
            quota.limit ? ` (limit ${quota.limit})` : ""
          }${quota.retryIn ? `, retry in ${quota.retryIn}` : ""}`
        );
        if (quota.bucket.includes("PER DAY")) {
          resourceMeter.markFlashDailyBlocked();
        }
        console.warn(`📊 ${resourceMeter.formatLine()}`);
        throw error;
      }
    },
    embedContent: async (params) => {
      try {
        const response = await rawAi.models.embedContent(params);
        resourceMeter.record("embeddings", 0);
        return response;
      } catch (error) {
        resourceMeter.record("embeddings", 0);
        resourceMeter.recordError(
          "embeddings",
          String(error?.message || "").slice(0, 160)
        );
        console.warn(`📊 ${resourceMeter.formatLine()}`);
        throw error;
      }
    },
    generateContentStream: async (params) => {
      try {
        const stream = await rawAi.models.generateContentStream(params);
        resourceMeter.record("gemini_flash", 0);
        return stream;
      } catch (error) {
        resourceMeter.record("gemini_flash", 0);
        const quota = resourceMeter.parseQuotaMetric(error);
        resourceMeter.recordError(
          "gemini_flash",
          String(error?.message || "").slice(0, 160),
          quota.metric
        );
        console.warn(
          `⚠️  Gemini Flash quota hit (stream): ${quota.metric || "unknown metric"}${
            quota.retryIn ? `, retry in ${quota.retryIn}` : ""
          }`
        );
        if (quota.bucket.includes("PER DAY")) {
          resourceMeter.markFlashDailyBlocked();
        }
        console.warn(`📊 ${resourceMeter.formatLine()}`);
        throw error;
      }
    },
  },
};

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.6-flash";

// Ask-stream fallback model: the primary model's own quota bucket can be
// dry while this sibling still has headroom (see geminiRetry.js).
const { FALLBACK_MODEL: FALLBACK_ASK_MODEL } = require("./geminiRetry");

// ------------------------------------------------
// GROQ FALLBACK (optional, free tier)
// ------------------------------------------------
// When GROQ_API_KEY is set, Ask Your Chat falls back to Groq's free,
// OpenAI-compatible API whenever Gemini is rate-limited or overloaded.
// Facts + embeddings stay on Gemini (they need its 1M-token context).
// ------------------------------------------------

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

/**
 * Groq free-tier orgs cap requests at a small token budget (~6K tokens
 * ≈ 20K chars) regardless of the model's advertised context, a huge
 * fresh chat will 413 every model. Build a compact fallback prompt:
 * drop the analytics section entirely, keep only the top of the ranked
 * evidence list, and hard-cap to a size the org accepts.
 */
function shrinkPromptForGroq(prompt) {
  let shrunk = prompt;

  const analyticsStart = shrunk.indexOf("FULL-CHAT ANALYTICS");
  const analyticsEnd = shrunk.indexOf("RETRIEVED CONVERSATION EVIDENCE");
  if (analyticsStart !== -1 && analyticsEnd > analyticsStart) {
    shrunk =
      shrunk.slice(0, analyticsStart) +
      "FULL-CHAT ANALYTICS\n\n(omitted, fallback model size limit)\n\n" +
      shrunk.slice(analyticsEnd);
  }

  // Evidence is rank-ordered by retrieval, keep only its head.
  const evidenceStart = shrunk.indexOf("RETRIEVED CONVERSATION EVIDENCE");
  const evidenceEnd = shrunk.indexOf("HOW TO REASON");
  if (evidenceStart !== -1 && evidenceEnd > evidenceStart) {
    const block = shrunk.slice(evidenceStart, evidenceEnd);
    if (block.length > 6000) {
      shrunk =
        shrunk.slice(0, evidenceStart) +
        block.slice(0, 6000) +
        "\n\n[... remaining evidence omitted to fit the fallback model ...]\n\n" +
        shrunk.slice(evidenceEnd);
    }
  }

  const MAX_CHARS = 18000;
  if (shrunk.length > MAX_CHARS) {
    shrunk =
      shrunk.slice(0, 12000) +
      "\n\n[... prompt truncated to fit the fallback model ...]\n\n" +
      shrunk.slice(-5000);
  }

  return shrunk;
}

async function callGroq(prompt, { isRetry = false } = {}) {
  let body = prompt;
  resourceMeter.record("groq", Math.ceil(prompt.length / 4));

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.6,
      messages: [{ role: "user", content: body }],
    }),
  });

  if (response.status === 413) {
    // Prompt exceeds the Groq model's context, shrink and retry once.
    console.warn(
      `Groq request too large (${prompt.length} chars), shrinking and retrying.`
    );
    resourceMeter.recordError(
      "groq",
      `413 request too large (${prompt.length} chars), shrunk and retried`
    );
    const retryResponse = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.6,
        messages: [{ role: "user", content: shrinkPromptForGroq(prompt) }],
      }),
    });

    if (!retryResponse.ok) {
      const detail = await retryResponse.text().catch(() => "");
      const error = new Error(
        `Groq API error (${retryResponse.status}): ${detail.slice(0, 140)}`
      );
      error.status = retryResponse.status;
      throw error;
    }

    const retryData = await retryResponse.json();
    const retryAnswer = retryData?.choices?.[0]?.message?.content?.trim();
    if (!retryAnswer) {
      throw new Error("Groq returned an empty response.");
    }
    return retryAnswer;
  }

  if (response.status === 429 && !isRetry) {
    // Groq per-minute window — wait briefly and retry once rather
    // than failing the whole answer. `isRetry` is a per-call local:
    // a failed retry must not disable retries for every future call.
    resourceMeter.recordError("groq", "429 rate limited, retrying once");
    await new Promise((resolve) => setTimeout(resolve, 12000));
    return callGroq(prompt, { isRetry: true });
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const error = new Error(
      `Groq API error (${response.status}): ${detail.slice(0, 140)}`
    );
    error.status = response.status;
    resourceMeter.recordError("groq", error.message);
    throw error;
  }

  const data = await response.json();
  const answer = data?.choices?.[0]?.message?.content?.trim();

  if (!answer) {
    throw new Error("Groq returned an empty response.");
  }

  return answer;
}

// Gemini first (best quality); Groq only when Gemini is unavailable
async function generateAnswerWithFallback(prompt) {
  try {
    return await generateAnswerWithRetry(prompt);
  } catch (geminiError) {
    if (!GROQ_API_KEY) throw geminiError;

    console.warn(
      `Gemini unavailable (${String(geminiError?.message || "").slice(0, 90)}), falling back to Groq (${GROQ_MODEL}).`
    );

    return callGroq(prompt);
  }
}

// ------------------------------------------------
// GEMINI CALL WITH RETRY (429/503/overload-safe)
// ------------------------------------------------

async function generateAnswerWithRetry(prompt) {
  // Daily cap blown → don't waste an attempt (or a minute) on Gemini;
  // throw immediately so the caller falls back to Groq.
  if (resourceMeter.isFlashDailyBlocked()) {
    throw Object.assign(
      new Error("Gemini daily quota exhausted (circuit breaker open)."),
      { status: 429 }
    );
  }

  const maxAttempts = 2;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
      });

      const answer =
        typeof response.text === "string"
          ? response.text.trim()
          : "";

      if (!answer) {
        throw new Error("Gemini returned an empty response.");
      }

      if (response.usageMetadata) {
        console.log(
          "Gemini usage:",
          response.usageMetadata
        );
      }

      return answer;
    } catch (error) {
      lastError = error;
      const status =
        error?.status || error?.response?.status;

      const retryable =
        status === 429 ||
        status === 503 ||
        /overload|rate[- ]limit|temporarily|quota|resource_exhausted|exceeded your current quota/i.test(
          error?.message || ""
        );

      if (retryable && attempt < maxAttempts) {
        console.warn(
          `Gemini transient failure (attempt ${attempt}), retrying in 2s...`
        );
        await new Promise((resolve) =>
          setTimeout(resolve, 2000)
        );
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

// ------------------------------------------------
// ANSWER CACHE (bounded, corpus-scoped)
// ------------------------------------------------
// The cache itself lives in the per-context state (S.answerCache).

const ANSWER_CACHE_LIMIT = 50;

function chatFingerprint() {
  const info = S.currentChatInfo || {};
  return [
    info.filename,
    info.uploadedAt,
    info.messageCount,
  ].join("###");
}

function getCachedAnswer(question) {
  const key = `${chatFingerprint()}###${question
    .toLowerCase()
    .trim()}`;
  return S.answerCache.get(key) || null;
}

function cacheAnswer(question, payload) {
  const key = `${chatFingerprint()}###${question
    .toLowerCase()
    .trim()}`;
  if (S.answerCache.has(key)) {
    S.answerCache.delete(key);
  }
  S.answerCache.set(key, payload);
  while (S.answerCache.size > ANSWER_CACHE_LIMIT) {
    const oldest = S.answerCache.keys().next().value;
    S.answerCache.delete(oldest);
  }
}

function invalidateAnswerCache() {
  S.answerCache.clear();
}

// ------------------------------------------------
// MIDDLEWARE
// ------------------------------------------------

// Only allow configured frontend origins (comma-separated in CORS_ORIGIN).
// When CORS_ORIGIN is not set, localhost dev origins are allowed plus any
// private-network origin, so phones on the same Wi-Fi can use the app
// (http://192.168.x.x:5173). Public origins are never trusted.
const isLocalOrigin = (origin) => {
  try {
    const hostname = new URL(origin).hostname;
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      /^192\.168\.\d+\.\d+$/.test(hostname) ||
      /^10\.\d+\.\d+\.\d+$/.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(hostname)
    );
  } catch {
    return false;
  }
};

const configuredOrigins = (
  process.env.CORS_ORIGIN || ""
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Non-browser clients (curl, same-origin) may send no origin
      if (!origin) {
        return callback(null, true);
      }

      const localFallbackAllowed =
        !process.env.CORS_ORIGIN && process.env.NODE_ENV !== "production";

      if (
        configuredOrigins.includes(origin) ||
        (localFallbackAllowed && isLocalOrigin(origin))
      ) {
        return callback(null, true);
      }

      return callback(null, false);
    },
    // Session cookies ride on cross-origin dev setups (Vite :5173 → :5000)
    credentials: true,
  })
);

app.use(
  express.json({
    limit: "1mb",
  })
);

// ------------------------------------------------
// COOKIE PARSING (tiny, dependency-free)
// ------------------------------------------------
// Only the session cookie is ever read; req.cookies gets a standard
// shape without pulling in cookie-parser.
// Correlation id per request: echoed to clients on errors, attached
// to server-side error logs, so a user-reported failure can be matched
// to exactly one log entry without exposing internals.
app.use((req, res, next) => {
  req.id = crypto.randomBytes(6).toString("hex");
  res.setHeader("X-Request-Id", req.id);
  next();
});

app.use((req, _res, next) => {
  if (req.cookies) return next();

  req.cookies = {};
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (!key) continue;
    try {
      req.cookies[key] = decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      req.cookies[key] = part.slice(eq + 1).trim();
    }
  }
  next();
});

// ------------------------------------------------
// SERVER HARDENING (helmet). CSP allows self + inline
// styles (Tailwind) + Google Fonts (Red Rose); connect-src
// covers the API origin and any configured CORS origin.
// Explicit per-response headers: nosniff, DENY framing,
// HSTS with a 1-year max-age (incl. subdomains).
// ------------------------------------------------

const cspConnectSrc = [
  "'self'",
  // Share-card export embeds Red Rose into the PNG by fetching the
  // same Google Fonts hosts already allowed for style-src/font-src.
  "https://fonts.googleapis.com",
  "https://fonts.gstatic.com",
  ...(configuredOrigins.length > 0 ? configuredOrigins : []),
];

app.use(
  helmet({
    noSniff: true,
    frameguard: { action: "deny" },
    strictTransportSecurity: {
      maxAgeSeconds: 60 * 60 * 24 * 365,
      includeSubDomains: true,
    },
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        "font-src": ["'self'", "https://fonts.googleapis.com", "https://fonts.gstatic.com", "data:"],
        "img-src": ["'self'", "data:", "blob:"],
        "connect-src": cspConnectSrc,
        "frame-src": ["'self'"],
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
      },
    },
    // The API speaks JSON only; a strict CSP still helps when the
    // built frontend is served from this same origin.
    crossOriginResourcePolicy: { policy: "same-site" },
  })
);

app.disable("x-powered-by");

// ------------------------------------------------
// USER CONTEXT, guests keep the root data dir + root
// state (byte-for-byte today's behavior); signed-in
// requests run inside their own scope for EVERY module
// that resolves data paths or state.
// ------------------------------------------------

app.use(userContext.userContextMiddleware);

// Visitor counter — privacy-friendly: counts distinct fresh session
// cookies only, dedupes on a one-way hash, stores aggregate numbers.
const visitors = require("./visitors");
app.use((req, res, next) => {
  visitors.countVisitor(req);
  next();
});



// ------------------------------------------------
// AI GATE, every AI-bound endpoint/trigger checks this
// ------------------------------------------------

function aiDisabledResponse(res) {
  return res.status(403).json({
    message: "AI features are turned off in settings.",
    aiEnabled: false,
  });
}

// Settings live-reload: the toggle in the UI must take effect
// immediately without a server restart.
function settings() {
  return settingsStore.getSettings();
}

// ------------------------------------------------
// ALIAS MODE, per-request participant → Person A/B map
// (sorted alphabetically so aliases stay stable). Applied
// ONLY to AI-bound payloads; the UI maps back on display.
// ------------------------------------------------

function buildAliasMap() {
  const participants =
    S.currentAnalytics?.overview?.participants ||
    [...new Set(S.currentMessages.map((m) => m.sender))].filter(Boolean);

  const sorted = [...participants].sort((a, b) =>
    String(a).localeCompare(String(b))
  );

  const map = new Map();
  sorted.forEach((name, index) => {
    map.set(name, `Person ${String.fromCharCode(65 + index)}`);
  });
  return map;
}

function applyAliasesToMessages(messages, aliasMap) {
  if (!aliasMap) return messages;
  return messages.map((m) => ({
    ...m,
    sender: aliasMap.get(m.sender) || m.sender,
  }));
}

/** The reverse map the frontend uses to display real names. */
function buildReverseAliasMap(aliasMap) {
  const reverse = {};
  for (const [real, alias] of aliasMap.entries()) {
    reverse[alias] = real;
  }
  return reverse;
}

// Protect the free Gemini quota and the upload endpoint from abuse
const askLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many questions in a short time. Please wait a few minutes.",
  },
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many uploads in a short time. Please wait a few minutes.",
  },
});

const purgeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many purge requests. Please wait a few minutes.",
  },
});

// Demo loads trigger background facts extraction + embedding builds
// against the SHARED free-tier AI quota — cap the burn.
const demoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many demo loads. Please wait a few minutes.",
  },
});

// Message search does real filter/paginate work per call.
const messagesLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many searches. Please slow down.",
  },
});

// Feedback writes to the session's learning memory.
const feedbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many feedback submissions. Please wait a few minutes.",
  },
});

// Library selection decrypts the stored chat payload per call.
const librarySelectLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many chat switches. Please wait a few minutes.",
  },
});

app.use((req, res, next) => {
  // PRIVACY: only the pathname - query strings carry user search terms
  console.log(
    `[${new Date().toISOString()}] [${req.id}] ${req.method} ${new URL(req.url, "http://local").pathname}`
  );

  next();
});

// ------------------------------------------------
// PERSISTENT CHAT LIBRARY (backend/data)
// ------------------------------------------------
// Every analyzed chat is stored as data/chats/<id>.json and indexed in
// data/library.json. The "active" chat serves all API endpoints; new
// uploads add entries, and /api/library switches between saved chats.
// ------------------------------------------------

const MAX_SAVED_CHATS = 12;

function makeChatId() {
  return `${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
}

function chatFingerprintOf(info) {
  return [info?.filename, info?.uploadedAt, info?.messageCount].join("###");
}

function updateLibraryEntry(id, patch) {
  let entry = S.library.chats.find((chat) => chat.id === id);

  if (!entry) {
    entry = { id, savedAt: new Date().toISOString() };
    S.library.chats.push(entry);
  }

  Object.assign(entry, patch);
}

// ------------------------------------------------
// PER-PERSON FACTS (Gemini-extracted, cached)
// ------------------------------------------------



function startFactsExtraction() {
  if (S.currentChatId === "demo") {
    S.factsStatus = "unavailable";
    return;
  }

  if (!process.env.GEMINI_API_KEY) {
    S.factsStatus = "unavailable";
    return;
  }

  // Daily Gemini cap already blown → don't burn attempts until reset
  if (resourceMeter.isFlashDailyBlocked()) {
    S.factsStatus = "error";
    S.factsError =
      "Gemini's daily free quota (20 requests) is used up. Facts will succeed after the daily reset (~12:30 PM IST), press Try again then.";
    return;
  }

  // Analytics-only mode: never call the AI
  if (!settings().aiEnabled) {
    S.factsStatus = "unavailable";
    S.factsError = "AI features are turned off in settings.";
    return;
  }

  if (
    S.factsStatus === "running" ||
    S.factsStatus === "ready"
  ) {
    return;
  }

  if (
    !Array.isArray(S.currentMessages) ||
    S.currentMessages.length === 0
  ) {
    return;
  }

  S.factsStatus = "running";
  S.factsError = null;

  const participants =
    (S.currentAnalytics?.overview?.participants) ||
    [...new Set(S.currentMessages.map((m) => m.sender))].filter(Boolean);

  const extractionChatId = S.currentChatId;

  console.log(
    `Facts extraction started for ${participants.length} participant(s)...`
  );

  // Privacy pipeline for the transcript: optional redaction + aliases.
  // In alias mode the AI sees "Person A/B" keys; the facts are
  // mapped back to real names before they touch disk or the UI.
  const aiMessages = prepareAiMessages(S.currentMessages);
  const aliasMap = settings().aliasMode ? buildAliasMap() : null;
  const aiParticipants = aliasMap
    ? participants.map((p) => aliasMap.get(p) || p)
    : participants;

  extractFacts(ai, GEMINI_MODEL, aiMessages, aiParticipants)
    .then((aiFacts) => {
      // Map aliased fact keys back to real participant names
      const facts = aliasMap
        ? Object.fromEntries(
            participants.map((person) => [
              person,
              aiFacts?.[aliasMap.get(person) || person] || [],
            ])
          )
        : aiFacts;

      aiLog.logAiCall({
        sessionId: userContext.getSessionId(),
        chatId: extractionChatId,
        feature: "facts",
        messagesSent: aiMessages.length,
        provider: "gemini",
      });

      // The active chat may have changed while Gemini was working,
      // never write another chat's facts into this one.
      if (S.currentChatId !== extractionChatId) {
        console.log(
          "Facts extraction finished but the active chat changed, discarding stale facts."
        );

        if (S.factsStatus !== "ready" && S.factsStatus !== "running") {
          S.factsStatus = "idle";
          startFactsExtraction();
        }
        return;
      }

      S.factsResult = {
        facts,
        extractedAt: new Date().toISOString(),
      };

      S.factsStatus = "ready";
      saveChatState();

      console.log("Facts extraction finished successfully.");
    })
    .catch((error) => {
      if (S.currentChatId !== extractionChatId) {
        console.log(
          "Facts extraction failed for a previous chat, ignoring."
        );
        return;
      }

      S.factsStatus = "error";
      S.factsError = friendlyAiError(
        error?.message,
        "Facts extraction"
      );

      console.warn(
        "Facts extraction failed:",
        S.factsError,
        "\n(detail):",
        error?.message
      );
    });
}

// ------------------------------------------------
// AI PRIVACY PIPELINE (redaction + aliases), applied
// at send-time only; stored data stays original.
// ------------------------------------------------

/**
 * Raw provider errors (429 JSON blobs etc.) must never reach the UI.
 * Map the common cases to short human sentences; log the full detail
 * server-side only.
 */
function friendlyAiError(raw, feature) {
  const text = String(raw || "");
  if (/daily quota exhausted/i.test(text)) {
    return "Gemini's daily free quota (20 requests) is used up. It resets around 12:30 PM IST, press Try again then.";
  }
  if (/429|RESOURCE_EXHAUSTED|quota|exceeded your current quota|rate[- ]limit/i.test(text)) {
    return "Gemini's free quota is busy right now, extraction retries automatically, or try again in a minute.";
  }
  if (/503|overload|temporarily unavailable/i.test(text)) {
    return "Gemini is temporarily overloaded, it retries automatically. Try again in a moment.";
  }
  return `${feature} failed. Please try again.`;
}

function prepareAiMessages(messages) {
  const currentSettings = settings();
  let result = messages;

  if (currentSettings.aliasMode) {
    result = applyAliasesToMessages(result, buildAliasMap());
  }

  if (currentSettings.redactPII) {
    result = redactMessages(result);
  }

  return result;
}

// ------------------------------------------------
// LOAD CHAT LIBRARY (with one-time legacy migration)
// ------------------------------------------------

function loadLibrary() {
  // PRIVACY MODEL: nothing chat-related is persisted. Every boot starts
  // with an empty in-memory workspace; uploads live in RAM for the
  // current server process only.
  S.library = { activeId: null, chats: [] };
}

// ------------------------------------------------
// SAVE ACTIVE CHAT (in-memory session store ONLY — never disk)
// ------------------------------------------------

// ------------------------------------------------
// SESSION CHAT ENCRYPTION (AES-256-GCM)
// ------------------------------------------------

function encryptChatPayload(payload, keyHex) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    Buffer.from(keyHex, "hex"),
    iv
  );

  const json = Buffer.from(JSON.stringify(payload), "utf-8");
  const data = Buffer.concat([cipher.update(json), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: data.toString("base64"),
  };
}

function decryptChatPayload(envelope, keyHex) {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    Buffer.from(keyHex, "hex"),
    Buffer.from(envelope.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));

  const json = Buffer.concat([
    decipher.update(Buffer.from(envelope.data, "base64")),
    decipher.final(),
  ]);

  return JSON.parse(json.toString("utf-8"));
}

function saveChatState() {
  // The in-memory active chat is the source of truth for the pointer
  if (S.currentChatId) {
    S.library.activeId = S.currentChatId;
  }

  if (!S.currentChatId || S.currentChatId === "demo") return;

  // The moment analysis completes, the stored copy is encrypted.
  userContext.sessionChats().set(
    S.currentChatId,
    encryptChatPayload(
      {
        chatInfo: S.currentChatInfo,
        messages: S.currentMessages,
        analytics: S.currentAnalytics,
        facts: S.factsResult,
        savedAt: new Date().toISOString(),
      },
      userContext.getSessionKey()
    )
  );

  updateLibraryEntry(S.currentChatId, {
    filename: S.currentChatInfo.filename,
    messageCount: S.currentMessages.length,
    uploadedAt: S.currentChatInfo.uploadedAt,
    participants: S.currentAnalytics?.overview?.participants || [],
    hasFacts: Boolean(S.factsResult),
    savedAt: new Date().toISOString(),
  });
}

// ------------------------------------------------
// SELECT / DELETE CHATS
// ------------------------------------------------

function selectChat(id) {
  // Session store only: after a restart the chat simply no longer
  // exists (the library entry is gone too) — nothing is reloaded.
  // Decryption is transient: the payload is plaintext only while this
  // chat is the active working set.
  const envelope = userContext.sessionChats().get(id);

  if (!envelope) {
    const error = new Error("That chat is no longer available.");
    error.status = 404;
    throw error;
  }

  const data = decryptChatPayload(envelope, userContext.getSessionKey());

  S.currentChatId = id;
  S.currentMessages = Array.isArray(data.messages) ? data.messages : [];
  S.currentAnalytics = data.analytics || null;
  S.currentChatInfo = data.chatInfo || {
    filename: null,
    uploadedAt: null,
    messageCount: S.currentMessages.length,
  };
  S.factsResult = data.facts && typeof data.facts === "object" ? data.facts : null;
  S.factsStatus = S.factsResult ? "ready" : "idle";
  S.factsError = null;
  S.library.activeId = id;

  invalidateAnswerCache();
  embeddings.invalidateEmbeddingIndex(userContext.getEmbeddingScope());
}

function deleteChatData(id) {
  if (id === "demo") return; // demo is memory-only

  // In-memory cleanup only: no chat files exist on disk to delete.
  const envelope = userContext.sessionChats().get(id);
  if (envelope) {
    const data = decryptChatPayload(envelope, userContext.getSessionKey());
    if (data?.chatInfo) {
      embeddings.deleteEmbeddingIndex(chatFingerprintOf(data.chatInfo), userContext.getEmbeddingScope());
    }
  }
  userContext.sessionChats().delete(id);

  S.library.chats = S.library.chats.filter((chat) => chat.id !== id);
  if (S.library.activeId === id) S.library.activeId = null;
}

function pruneLibrary() {
  const deletable = S.library.chats
    .filter((chat) => chat.id !== S.library.activeId)
    .sort((a, b) => String(a.savedAt || "").localeCompare(String(b.savedAt || "")));

  while (S.library.chats.length > MAX_SAVED_CHATS && deletable.length > 0) {
    const oldest = deletable.shift();
    deleteChatData(oldest.id);
  }
}

// Load the library and restore the active chat BEFORE accepting requests
loadLibrary();

// PRIVACY MODEL: no chat is ever restored at boot — the previous
// process' workspace died with it. Every visitor starts fresh.


const upload = multer({
  // PRIVACY: keep the uploaded file in memory — it is parsed
  // straight from the buffer and never written to disk.
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 10 * 1024 * 1024,
  },

  fileFilter: (req, file, cb) => {
    const extension = path
      .extname(file.originalname)
      .toLowerCase();

    if (extension !== ".txt") {
      return cb(
        new Error(
          "Only .txt files are allowed."
        )
      );
    }

    cb(null, true);
  },
});

// ------------------------------------------------
// RESOURCE METER, live AI usage snapshot (debugging aid)
// ------------------------------------------------

app.get("/api/visitors", (req, res) => {
  return res.json(visitors.getVisitorStats());
});

app.get("/api/resource-meter", (req, res) => {
  return res.json({
    freeTier: resourceMeter.FREE_TIER,
    usage: resourceMeter.snapshot(),
    note: "requestsLast60s/inputTokensLast60s are rolling windows; sinceBoot is cumulative. Free-tier limits: gemini-flash 5 req/min + 250K input tokens/min, embeddings 100 req/min.",
  });
});

// ------------------------------------------------
// TEST ROUTE
// ------------------------------------------------
// When a frontend build exists, "/" serves the app (single-service
// mode, see the STATIC FRONTEND block at the bottom); the JSON ping
// remains the fallback for dev without a built frontend.

app.get("/", (req, res) => {
  const builtIndex = path.join(
    __dirname,
    "..",
    "frontend",
    "dist",
    "index.html"
  );
  if (fs.existsSync(builtIndex)) {
    return res.sendFile(builtIndex);
  }
  res.json({
    message:
      "ChatScope backend is running 🚀",
  });
});

// ------------------------------------------------
// HEALTH (for uptime monitors / deployment probes)
// ------------------------------------------------

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptimeSeconds: Math.round(process.uptime()),
    chatLoaded: S.currentMessages.length > 0,
    messageCount: S.currentMessages.length,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    groqFallbackConfigured: Boolean(GROQ_API_KEY),
    aiEnabled: settings().aiEnabled,
    factsStatus: S.factsStatus,
    embeddings: embeddings.getEmbeddingStatus(chatFingerprint(), userContext.getEmbeddingScope()),
  });
});

// ------------------------------------------------
// STATUS
// ------------------------------------------------

app.get("/api/status", (req, res) => {
  res.json({
    chatLoaded:
      S.currentMessages.length > 0,

    chatId: S.currentChatId,

    messageCount:
      S.currentMessages.length,

    filename:
      S.currentChatInfo.filename,

    uploadedAt:
      S.currentChatInfo.uploadedAt,

    analyticsLoaded:
      S.currentAnalytics !== null,

    // Frontend restores the whole dashboard from this after a refresh
    analytics: S.currentAnalytics,

    suggestions: buildSuggestions(S.currentAnalytics),

    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),

    aiEnabled: settings().aiEnabled,

    embeddings: embeddings.getEmbeddingStatus(chatFingerprint(), userContext.getEmbeddingScope()),
  });
});

// ------------------------------------------------
// SETTINGS
// ------------------------------------------------

app.get("/api/settings", (req, res) => {
  const current = settingsStore.getSettings();

  res.json({ ...current });
});

app.put("/api/settings", (req, res) => {
  const patch = req.body || {};

  const updated = settingsStore.updateSettings(patch);
  res.json({ ...updated });
});

// ------------------------------------------------
// PURGE — wipes every trace of chat activity. With the memory-only
// model there is almost nothing on disk; this clears the in-memory
// workspace and any legacy files.
// ------------------------------------------------

app.post("/api/purge", purgeLimiter, (req, res) => {
  try {
    ensureDataDir();

    const preservedFiles = new Set([
      path.basename(settingsStore.settingsFile()),
      "wall.json",
    ]);

    for (const entry of fs.readdirSync(DATA_DIR)) {
      if (preservedFiles.has(entry)) continue;

      const entryPath = path.join(DATA_DIR, entry);
      fs.rmSync(entryPath, { recursive: true, force: true });
    }

    // Reset the caller's in-memory state
    userContext.resetCurrentState();

    embeddings.invalidateEmbeddingIndex(userContext.getEmbeddingScope());

    console.log(
      "Purge complete: all chat data deleted."
    );
    return res.json({ ok: true });
  } catch (error) {
    console.error(`[${req.id}] Purge failed:`, error?.message || error);
    return res.status(500).json({
      message: "Could not delete the data.",
      requestId: req.id,
    });
  }
});

// ------------------------------------------------
// AI TRANSPARENCY LOG (counts only, newest last)
// ------------------------------------------------

app.get("/api/ai-log", (req, res) => {
  // Privacy model: each browser sees only its own AI activity.
  res.json({ entries: aiLog.getAiLog(userContext.getSessionId()) });
});

app.delete("/api/ai-log", (req, res) => {
  aiLog.clearAiLog(userContext.getSessionId());
  res.json({ ok: true });
});

// ------------------------------------------------
// ANALYTICS CONTEXT
// ------------------------------------------------

function createAnalyticsContext(analytics) {
  if (!analytics) {
    return "No analytics are available.";
  }

  return JSON.stringify(
    {
      overview:
        analytics.overview,

      messagesPerPerson:
        analytics.messagesPerPerson,

      responseTime:
        analytics.responseTime,

      conversationStarters:
        analytics.conversationStarters,

      messageLength:
        analytics.messageLength,

      activity:
        analytics.activity,

      longestMessage:
        analytics.longestMessage,

      topEmojis:
        analytics.topEmojis,

      topWords:
        analytics.topWords,
    },
    null,
    2
  );
}


// ------------------------------------------------
// GEMINI-ASSISTED QUERY REFORMULATION
// ------------------------------------------------
// When the first retrieval attempt yields weak or no evidence, ask Gemini
// to expand the question into conversation-plausible search keywords
// (synonyms, related concepts, likely word forms) and re-retrieve once.
// This handles indirect questions like "does X like cooking?" where the
// chat says "I made pasta today" and never uses the word "cooking".
// ------------------------------------------------

async function reformulateQuery(question) {
  const vocabulary = (S.currentAnalytics?.topWords || [])
    .slice(0, 80)
    .map((w) => w.word)
    .join(", ");

  // Alias mode: the AI never learns real participant names
  const aliasMap = settings().aliasMode ? buildAliasMap() : null;
  const rawParticipants =
    S.currentAnalytics?.overview?.participants || [];
  const participants = (
    aliasMap ? rawParticipants.map((p) => aliasMap.get(p) || p) : rawParticipants
  ).join(", ");

  const prompt = `You expand a user question into search keywords for finding relevant messages in a WhatsApp conversation.

Return ONLY valid JSON, nothing else:
{"keywords": ["word1", "word2", ...]}

Rules:
- 4 to 10 keywords
- Include synonyms, related concepts, and likely word forms (activities, objects, verbs)
- Use words likely to appear in casual chat about the topic
- No question words (who, what, does, is...)
- The vocabulary sample below shows the conversation's language; keywords need not appear in it
${participants ? `- Participants in the chat: ${participants}\n` : ""}
Vocabulary sample: ${vocabulary || "(unavailable)"}

Question: ${settings().redactPII ? redactText(question) : question}`;

  const text = await generateAnswerWithRetry(prompt);

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (Array.isArray(parsed.keywords)) {
      return parsed.keywords
        .filter((k) => typeof k === "string" && k.trim())
        .slice(0, 10)
        .join(" ");
    }
    return null;
  } catch {
    return null;
  }
}

async function retrieveWithReformulation(question, relevantMessages, questionType, semanticStrong = false) {
  const confidence =
    typeof relevantMessages?.confidence === "number"
      ? relevantMessages.confidence
      : 0;

  const needsHelp =
    questionType === "conversation_question" &&
    !semanticStrong &&
    (relevantMessages.length === 0 || confidence < 0.35);

  if (!needsHelp) return relevantMessages;

  try {
    const keywordQuery = await reformulateQuery(question);
    if (!keywordQuery) return relevantMessages;

    console.log("Low retrieval confidence, reformulated query attempted.");

    const expanded = retrieveRelevantMessages(
      S.currentMessages,
      keywordQuery,
      settings().evidenceScope,
      { scope: userContext.getEmbeddingScope() }
    );

    if (!Array.isArray(expanded) || expanded.length === 0) {
      return relevantMessages;
    }

    // Merge, keeping original evidence first and avoiding duplicates
    const seen = new Set(
      relevantMessages.map(
        (m) => `${m.sender}|${m.date}|${m.time}|${m.message}`
      )
    );

    const merged = [...relevantMessages];
    for (const msg of expanded) {
      const key = `${msg.sender}|${msg.date}|${msg.time}|${msg.message}`;
      if (!seen.has(key)) {
        merged.push(msg);
        seen.add(key);
      }
    }

    console.log(
      `Reformulated retrieval added ${merged.length - relevantMessages.length} evidence message(s).`
    );

    // Preserve the calibrated metadata: take the better of the two
    // retrievals so the reformulated answer still carries confidence
    // (the plain merge would drop it entirely).
    const confidence = Math.max(
      relevantMessages.confidence || 0,
      expanded.confidence || 0
    );

    const result = merged.slice(0, 30);
    result.confidence = confidence;
    result.reason = relevantMessages.reason || expanded.reason || null;
    result.intent = relevantMessages.intent || expanded.intent || null;
    result.entities = relevantMessages.entities || expanded.entities || [];
    result.retrievalPass =
      relevantMessages.retrievalPass || expanded.retrievalPass || null;
    result.semanticUsed = Boolean(
      relevantMessages.semanticUsed || expanded.semanticUsed
    );
    result.messages = result;
    return result;
  } catch (error) {
    console.warn(
      "Query reformulation skipped:",
      error?.message || "unknown error"
    );
    return relevantMessages;
  }
}

// ------------------------------------------------
// QUESTION TYPE
// ------------------------------------------------

function detectQuestionType(question) {
  const q = question
    .toLowerCase()
    .trim();

  if (
    /\b(who|which).*(talk|message|text|speak)/i.test(
      q
    ) ||
    /who talks more/i.test(q)
  ) {
    return "message_statistics";
  }

  if (
    /reply faster/i.test(q) ||
    /respond faster/i.test(q) ||
    /response time/i.test(q)
  ) {
    return "response_statistics";
  }

  if (
    /longer messages/i.test(q) ||
    /long messages/i.test(q) ||
    /message length/i.test(q)
  ) {
    return "message_length_statistics";
  }

  if (
    /start.*conversation/i.test(q) ||
    /conversation.*start/i.test(q)
  ) {
    return "conversation_statistics";
  }

  return "conversation_question";
}

// ------------------------------------------------
// UPLOAD AND ANALYZE
// ------------------------------------------------

app.post(
  "/api/upload",
  uploadLimiter,
  upload.single("chat"),
  (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          message:
            "No chat file uploaded.",
        });
      }

      console.log(
        // PRIVACY: WhatsApp export filenames contain the contact's
        // name ('WhatsApp Chat with X.txt') - log shape only
        `Processing uploaded file: ${req.file.originalname.length} chars, ${path.extname(req.file.originalname) || "no extension"}`
      );

      // ------------------------------------------
      // PARSE
      // ------------------------------------------

      // PRIVACY: parse straight from the in-memory buffer — the raw
      // chat file NEVER touches the disk, not even as a temp file.
      const messages = parseWhatsAppChatText(
        req.file.buffer.toString("utf-8")
      );

      if (!Array.isArray(messages)) {
        throw new Error(
          "Parser did not return a valid message array."
        );
      }

      if (messages.length === 0) {
        throw Object.assign(
          new Error(
            "No WhatsApp messages could be parsed from this file."
          ),
          { status: 400 }
        );
      }

      console.log(
        `Parsed ${messages.length} messages`
      );

      // ------------------------------------------
      // ANALYTICS
      // ------------------------------------------

      const analytics =
        calculateAnalytics(messages);

      if (!analytics) {
        throw new Error(
          "Analytics calculation returned no data."
        );
      }

      // ------------------------------------------
      // UPDATE STATE
      // ------------------------------------------

      S.currentMessages = messages;

      S.currentAnalytics = analytics;

      S.currentChatId = makeChatId();

      S.currentChatInfo = {
        filename:
          req.file.originalname,

        uploadedAt:
          new Date().toISOString(),

        messageCount:
          messages.length,
      };

      // ------------------------------------------
      // SAVE TO DISK (new library entry)
      // ------------------------------------------

      saveChatState();
      pruneLibrary();

      invalidateAnswerCache();

      // Rebuild the semantic embedding index for the new chat (async,
      // non-blocking; lexical retrieval works meanwhile)
      embeddings.invalidateEmbeddingIndex(userContext.getEmbeddingScope());
      if (process.env.GEMINI_API_KEY && settings().aiEnabled) {
        embeddings
          .buildEmbeddingIndex(ai, prepareAiMessages(messages), chatFingerprint(), userContext.getEmbeddingScope())
          .catch(() => {});
      }

      // New chat → drop any previously extracted facts and re-extract
      // in the background (the section polls /api/facts until ready)
      S.factsResult = null;
      S.factsStatus = "idle";
      S.factsError = null;
      startFactsExtraction();

      console.log(
        `Chat ready for AI questions: ${S.currentMessages.length} messages`
      );

      // ------------------------------------------
      // RESPONSE
      // ------------------------------------------

      return res.json({
        message:
          "Chat analyzed successfully.",

        analytics,

        chatLoaded: true,

        messageCount:
          messages.length,

        filename:
          req.file.originalname,

        suggestions: buildSuggestions(analytics),
      });
    } catch (error) {
      console.error(
        "Upload/analysis error:",
        error?.message || error
      );

      const status = error?.status || 500;

      if (status >= 500) {
        console.error(`[${req.id}] Upload analysis failed:`, error?.message || error);
      }

      return res.status(status).json({
        message:
          status < 500
            ? error?.message || "Failed to analyze the chat."
            : "Failed to analyze the chat.",

        ...(status < 500 ? {} : { requestId: req.id }),
      });
    }
  }
);

// ------------------------------------------------
// ASK YOUR CHAT
// ------------------------------------------------

app.post(
  "/api/ask",
  askLimiter,
  async (req, res) => {
    try {
      if (!settings().aiEnabled) {
        return aiDisabledResponse(res);
      }

      const cleanQuestion =
        typeof req.body?.question ===
        "string"
          ? req.body.question.trim()
          : "";

      if (!cleanQuestion) {
        return res.status(400).json({
          message:
            "Please enter a question.",
        });
      }

      if (cleanQuestion.length > 500) {
        return res.status(400).json({
          message:
            "Question is too long. Please keep it under 500 characters.",
        });
      }

      // ------------------------------------------
      // CHECK CHAT
      // ------------------------------------------

      if (
        !Array.isArray(
          S.currentMessages
        ) ||
        S.currentMessages.length === 0
      ) {
        return res.status(400).json({
          message:
            "Please upload and analyze a chat first.",

          chatLoaded: false,
        });
      }

      if (!S.currentAnalytics) {
        S.currentAnalytics =
          calculateAnalytics(
            S.currentMessages
          );

        saveChatState();
      }

      // PRIVACY: question text is never logged, only its shape
      console.log(
        `\nAI question received: ${cleanQuestion.length} chars`
      );

      // ------------------------------------------
      // CACHED ANSWER
      // ------------------------------------------

      const cached = getCachedAnswer(cleanQuestion);
      if (cached) {
        console.log("Served from answer cache.");
        return res.json({ ...cached, cached: true });
      }

      // ------------------------------------------
      // ANALYTICS-FIRST ROUTING
      // ------------------------------------------
      // Deterministic statistical questions skip
      // retrieval + Gemini entirely (saves quota,
      // guarantees exact numbers).
      // ------------------------------------------

      const deterministic = answerFromAnalytics(
        cleanQuestion,
        S.currentAnalytics
      );

      if (deterministic) {
        const payload = {
          message: "Answer generated successfully.",
          question: cleanQuestion,
          answer: deterministic.answer,
          chatLoaded: true,
          messageCount: S.currentMessages.length,
          retrievedCount: 0,
          evidence: [],
          confidence: 1,
          source: "analytics",
        };

        cacheAnswer(cleanQuestion, payload);

        console.log("Answered deterministically from analytics.");
        return res.json(payload);
      }

      // ------------------------------------------
      // QUESTION TYPE
      // ------------------------------------------

      const questionType =
        detectQuestionType(
          cleanQuestion
        );

      console.log(
        `Question type: ${questionType}`
      );

      // ------------------------------------------
      // RETRIEVE RELEVANT MESSAGES
      // ------------------------------------------

      let relevantMessages = [];

      try {
        // Semantic pass: if the embedding index is ready, blend cosine
        // similarity into retrieval ranking (free-tier embedding model).
        let semanticScores = null;
        try {
          semanticScores = await embeddings.getSemanticScores(
            ai,
            cleanQuestion,
            chatFingerprint(),
            userContext.getEmbeddingScope()
          );
        } catch {
          semanticScores = null;
        }

        relevantMessages = retrieveRelevantMessages(
          S.currentMessages,
          cleanQuestion,
          settings().evidenceScope,
          semanticScores
            ? { semanticScores, scope: userContext.getEmbeddingScope() }
            : { scope: userContext.getEmbeddingScope() }
        );

        // Progressive reformulation: only when embeddings were unavailable
        // or weak, expand the question once via Gemini and re-retrieve.
        const semanticStrong =
          semanticScores instanceof Map && semanticScores.size > 0;

        relevantMessages = await retrieveWithReformulation(
          cleanQuestion,
          relevantMessages,
          questionType,
          semanticStrong
        );
      } catch (retrievalError) {
        console.error(
          "Retrieval error:",
          retrievalError
        );

        relevantMessages = [];
      }

      // ------------------------------------------
      // RETRIEVAL DEBUG (opt-in only; avoids
      // logging private chat content by default)
      // ------------------------------------------

      if (process.env.DEBUG_RETRIEVAL === "1") {
        console.log(
          "\n========== RETRIEVAL DEBUG =========="
        );

        // PRIVACY: question and evidence are PII-redacted and truncated —
        // enough to debug retrieval quality, never raw chat content.
        console.log(
          "QUESTION (redacted):",
          redactText(cleanQuestion).slice(0, 120)
        );
        console.log("QUESTION TYPE:", questionType);
        console.log(
          "TOTAL CHAT MESSAGES:",
          S.currentMessages.length
        );
        console.log(
          "RETRIEVED MESSAGES:",
          relevantMessages.length,
          "| pass:",
          relevantMessages.retrievalPass || "n/a",
          "| confidence:",
          relevantMessages.confidence?.toFixed(2) ?? "n/a"
        );

        relevantMessages.forEach((msg, index) => {
          console.log(
            `${index + 1}. ${msg.date}, ${msg.time} - sender: ${redactText(String(msg.message || "")).slice(0, 80)}`
          );
        });

        console.log("====================================\n");
      }

      // ------------------------------------------
      // SAFETY CHECK
      // ------------------------------------------

      if (
        !Array.isArray(
          relevantMessages
        )
      ) {
        relevantMessages = [];
      }

      // ------------------------------------------
      // GEMINI PROMPT + CALL
      // ------------------------------------------
      // Privacy pipeline: the prompt only ever sees redacted
      // and/or aliased evidence (when those settings are on).
      // The evidence returned to the UI stays original.
      // ------------------------------------------

      const aiEvidenceMessages = prepareAiMessages(relevantMessages);

      const prompt = buildAiPrompt(
        cleanQuestion,
        questionType,
        aiEvidenceMessages
      );

      // ------------------------------------------
      // GEMINI (with transient-failure retry), then
      // Groq fallback if configured
      // ------------------------------------------

      const answer = await generateAnswerWithFallback(prompt);

      aiLog.logAiCall({
        sessionId: userContext.getSessionId(),
        chatId: S.currentChatId,
        feature: "ask",
        messagesSent: aiEvidenceMessages.length,
        provider: GROQ_API_KEY ? "gemini+groq-fallback" : "gemini",
      });

      console.log(
        "Gemini response received successfully."
      );

      // ------------------------------------------
      // NOTE:
      //
      // DO NOT call learnQuery() here.
      //
      // The new retrieval.js already learns inside
      // retrieveRelevantMessages().
      //
      // Calling it here again would store the same
      // question twice.
      // ------------------------------------------

      // ------------------------------------------
      // EVIDENCE (minimal, for the answer card)
      // ------------------------------------------

      const evidence = relevantMessages
        .slice(0, 4)
        .map((msg) => ({
          date: msg.date,
          time: msg.time,
          sender: msg.sender,
          message: String(msg.message || "").slice(0, 200),
        }));

      const payload = {
        message:
          "Answer generated successfully.",

        question:
          cleanQuestion,

        answer,

        confidence:
          typeof relevantMessages.confidence === "number"
            ? relevantMessages.confidence
            : null,

        evidence,

        chatLoaded: true,

        messageCount:
          S.currentMessages.length,

        retrievedCount:
          relevantMessages.length,

        source: "ai",
      };

      cacheAnswer(cleanQuestion, payload);

      return res.json(payload);
    } catch (error) {
      console.error(
        "Gemini/API error:",
        error
      );

      const status =
        error?.status ||
        error?.response?.status ||
        500;

      let errorMessage =
        error?.message ||
        "Unknown error.";

      if (status === 429) {
        errorMessage =
          "Gemini API rate limit reached. Please try again later.";
      }

      if (status === 503) {
        errorMessage =
          "Gemini is temporarily overloaded. Please try again in a moment.";
      }

      return res.status(500).json({
        message:
          "Both AI providers are busy or unavailable right now. Please try again in a minute.",

        error: errorMessage,

        chatLoaded:
          S.currentMessages.length > 0,
      });
    }
  }
);

// ------------------------------------------------
// STREAMING ASK (Server-Sent Events)
// ------------------------------------------------
// Emits: meta (evidence + confidence) -> token* -> done,
// or a single error event. Same retrieval pipeline as /api/ask.
// ------------------------------------------------

function sseSend(res, event, data) {
  // Silent no-op once the client is gone: writing to a dead socket
  // would otherwise throw inside the streaming loop.
  if (res.writableEnded || res.destroyed) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

app.post(
  "/api/ask/stream",
  askLimiter,
  async (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // Stop generating when the client disconnects mid-answer — no point
    // streaming (and paying) tokens nobody will read.
    let clientGone = false;
    req.on("close", () => {
      clientGone = true;
    });

    if (!settings().aiEnabled) {
      sseSend(res, "error", {
        message: "AI features are turned off in settings.",
        aiEnabled: false,
        code: "AI_DISABLED",
      });
      return res.end();
    }

    const cleanQuestion =
      typeof req.body?.question === "string"
        ? req.body.question.trim()
        : "";

    if (!cleanQuestion || cleanQuestion.length > 500) {
      sseSend(res, "error", {
        message: !cleanQuestion
          ? "Please enter a question."
          : "Question is too long. Please keep it under 500 characters.",
      });
      return res.end();
    }

    if (
      !Array.isArray(S.currentMessages) ||
      S.currentMessages.length === 0
    ) {
      sseSend(res, "error", {
        message: "Please upload and analyze a chat first.",
        chatLoaded: false,
      });
      return res.end();
    }

    if (!S.currentAnalytics) {
      S.currentAnalytics = calculateAnalytics(S.currentMessages);
      saveChatState();
    }

    // PRIVACY: question text is never logged, only its shape
    console.log(`\nAI question (stream): ${cleanQuestion.length} chars`);

    try {
      // ---- cached ----
      const cached = getCachedAnswer(cleanQuestion);
      if (cached) {
        sseSend(res, "meta", {
          source: cached.source || "ai",
          confidence: cached.confidence ?? null,
          evidence: cached.evidence || [],
          cached: true,
        });
        sseSend(res, "token", { text: cached.answer });
        sseSend(res, "done", {});
        return res.end();
      }

      // ---- deterministic ----
      const deterministic = answerFromAnalytics(cleanQuestion, S.currentAnalytics);
      if (deterministic) {
        console.log("Answered deterministically from analytics.");
        const payload = {
          message: "Answer generated successfully.",
          question: cleanQuestion,
          answer: deterministic.answer,
          chatLoaded: true,
          messageCount: S.currentMessages.length,
          retrievedCount: 0,
          evidence: [],
          confidence: 1,
          source: "analytics",
        };
        cacheAnswer(cleanQuestion, payload);
        sseSend(res, "meta", {
          source: "analytics",
          confidence: 1,
          evidence: [],
          cached: false,
        });
        sseSend(res, "token", { text: deterministic.answer });
        sseSend(res, "done", {});
        return res.end();
      }

      // ---- retrieval + Gemini (streamed) ----
      const questionType = detectQuestionType(cleanQuestion);

      let relevantMessages = [];
      let semanticScores = null;
      try {
        try {
          semanticScores = await embeddings.getSemanticScores(
            ai,
            cleanQuestion,
            chatFingerprint(),
            userContext.getEmbeddingScope()
          );
        } catch {
          semanticScores = null;
        }

        relevantMessages = retrieveRelevantMessages(
          S.currentMessages,
          cleanQuestion,
          settings().evidenceScope,
          semanticScores
            ? { semanticScores, scope: userContext.getEmbeddingScope() }
            : { scope: userContext.getEmbeddingScope() }
        );

        const semanticStrong =
          semanticScores instanceof Map && semanticScores.size > 0;

        relevantMessages = await retrieveWithReformulation(
          cleanQuestion,
          relevantMessages,
          questionType,
          semanticStrong
        );
      } catch (retrievalError) {
        console.error("Retrieval error:", retrievalError);
        relevantMessages = [];
      }

      if (!Array.isArray(relevantMessages)) relevantMessages = [];

      const evidence = relevantMessages
        .slice(0, 4)
        .map((msg) => ({
          date: msg.date,
          time: msg.time,
          sender: msg.sender,
          message: String(msg.message || "").slice(0, 200),
        }));

      const confidence =
        typeof relevantMessages.confidence === "number"
          ? relevantMessages.confidence
          : null;

      sseSend(res, "meta", {
        source: "ai",
        confidence,
        evidence,
        cached: false,
      });

      const aiEvidenceMessages = prepareAiMessages(relevantMessages);

      const prompt = buildAiPrompt(cleanQuestion, questionType, aiEvidenceMessages);

      let fullAnswer = "";
      let usedProvider = "gemini";

      // Gemini stream first (skipped entirely while the daily-quota
      // circuit breaker is open); if it fails before producing any text,
      // try the fallback model, then Groq, answering in one piece.
      const geminiStreamAttempt = async (model) => {
        const stream = await ai.models.generateContentStream({
          model,
          contents: prompt,
        });

        for await (const chunk of stream) {
          if (clientGone) break;
          const text =
            typeof chunk?.text === "string" ? chunk.text : "";
          if (text) {
            fullAnswer += text;
            sseSend(res, "token", { text });
          }
        }
      };

      try {
        if (!resourceMeter.isFlashDailyBlocked()) {
          try {
            await geminiStreamAttempt(GEMINI_MODEL);
          } catch (primaryError) {
            if (clientGone || fullAnswer.length > 0) throw primaryError;

            const primaryStatus =
              primaryError?.status || primaryError?.response?.status;
            const worthFallback =
              !primaryStatus || primaryStatus === 429 || primaryStatus === 503;

            // The primary model's own quota bucket may be dry while the
            // alias model still has headroom — one extra attempt is cheap.
            if (
              worthFallback &&
              FALLBACK_ASK_MODEL &&
              FALLBACK_ASK_MODEL !== GEMINI_MODEL
            ) {
              console.warn(
                `Gemini stream unavailable on ${GEMINI_MODEL} (${String(primaryError?.message || "").slice(0, 80)}), retrying on ${FALLBACK_ASK_MODEL}.`
              );
              await geminiStreamAttempt(FALLBACK_ASK_MODEL);
              usedProvider = `gemini:${FALLBACK_ASK_MODEL}`;
            } else {
              throw primaryError;
            }
          }
        } else {
          console.log(
            "Gemini Flash daily cap open (circuit breaker), streaming via fallback/Groq."
          );
        }

        if (!fullAnswer.trim() && GROQ_API_KEY && !clientGone) {
          console.warn(
            "Gemini stream produced no answer, falling back to Groq."
          );
          usedProvider = "groq";
          fullAnswer = await callGroq(prompt);
          sseSend(res, "token", { text: fullAnswer });
        }
      } catch (streamError) {
        if (clientGone || fullAnswer.length > 0) throw streamError;

        // Last resort: Groq one-shot, even if Gemini failed mid-attempt
        if (GROQ_API_KEY) {
          console.warn(
            `Gemini stream failed (${String(streamError?.message || "").slice(0, 90)}), falling back to Groq (${GROQ_MODEL}).`
          );
          usedProvider = "groq";
          fullAnswer = await callGroq(prompt);
          sseSend(res, "token", { text: fullAnswer });
        } else {
          throw streamError;
        }
      }

      if (!fullAnswer.trim()) {
        throw new Error("Gemini returned an empty response.");
      }

      aiLog.logAiCall({
        sessionId: userContext.getSessionId(),
        chatId: S.currentChatId,
        feature: "ask",
        messagesSent: aiEvidenceMessages.length,
        provider: usedProvider,
      });

      const payload = {
        message: "Answer generated successfully.",
        question: cleanQuestion,
        answer: fullAnswer.trim(),
        confidence,
        evidence,
        chatLoaded: true,
        messageCount: S.currentMessages.length,
        retrievedCount: relevantMessages.length,
        source: "ai",
      };

      cacheAnswer(cleanQuestion, payload);
      sseSend(res, "done", {});
      res.end();
    } catch (error) {
      console.error("Streaming ask error:", error?.message || error);

      const status = error?.status || error?.response?.status;
      let errorMessage =
        error?.message || "Unknown error while generating the answer.";

      if (status === 429) {
        errorMessage = resourceMeter.isFlashDailyBlocked()
          ? "Gemini's daily free quota (20 requests) is used up. Ask answers will use the fallbacks until it resets (~12:30 PM IST)."
          : "Gemini API rate limit reached. Please try again later.";
      } else if (status === 503) {
        errorMessage =
          "Gemini is temporarily overloaded. Please try again in a moment.";
      }

      sseSend(res, "error", {
        message:
          "The AI service is temporarily unavailable. Your chat analytics are still available.",
        detail: errorMessage,
        chatLoaded: true,
      });
      res.end();
    }
  }
);

// ------------------------------------------------
// CHAT LIBRARY
// ------------------------------------------------

app.get("/api/library", (req, res) => {
  const chats = [...S.library.chats].sort((a, b) =>
    String(b.savedAt || "").localeCompare(String(a.savedAt || ""))
  );

  res.json({
    activeId: S.library.activeId,
    chats: chats.map((chat) => ({
      id: chat.id,
      filename: chat.filename || "Untitled chat",
      messageCount: chat.messageCount || 0,
      uploadedAt: chat.uploadedAt || null,
      participants: chat.participants || [],
      hasFacts: Boolean(chat.hasFacts),
      active: chat.id === S.library.activeId,
      savedAt: chat.savedAt || null,
    })),
  });
});

app.post(
  "/api/library/select",
  librarySelectLimiter,
  (req, res) => {
    const id = typeof req.body?.id === "string" ? req.body.id : "";

    if (!id || !S.library.chats.some((chat) => chat.id === id)) {
      return res.status(404).json({
        message: "That chat is not in the library.",
      });
    }

    try {
      selectChat(id);
    } catch (error) {
      return res.status(error?.status || 500).json({
        message:
          error?.status === 404
            ? "That chat is no longer available (nothing is kept between sessions)."
            : "Could not open that chat.",
      });
    }

    // Rebuild this chat's semantic index in RAM for this session
    if (process.env.GEMINI_API_KEY && S.currentMessages.length > 0 && settings().aiEnabled) {
      embeddings
        .buildEmbeddingIndex(ai, prepareAiMessages(S.currentMessages), chatFingerprint(), userContext.getEmbeddingScope())
        .catch(() => {});
    }

    console.log(`Switched active chat to ${id}.`);

    return res.json({
      chatId: id,
      analytics: S.currentAnalytics,
      filename: S.currentChatInfo.filename,
      messageCount: S.currentMessages.length,
      suggestions: buildSuggestions(S.currentAnalytics),
    });
  }
);

app.delete(
  "/api/library/:id",
  (req, res) => {
    const id = req.params.id;

    if (!S.library.chats.some((chat) => chat.id === id)) {
      return res.status(404).json({
        message: "That chat is not in the library.",
      });
    }

    if (id === S.library.activeId) {
      return res.status(400).json({
        message: "This chat is currently open. Switch to another chat before deleting it.",
      });
    }

    deleteChatData(id);

    return res.json({ ok: true });
  }
);

// ------------------------------------------------
// MESSAGE BROWSER (search + filter + pagination)
// ------------------------------------------------

app.get("/api/messages", messagesLimiter, (req, res) => {
  if (
    !Array.isArray(S.currentMessages) ||
    S.currentMessages.length === 0
  ) {
    return res.status(400).json({
      message: "Please upload and analyze a chat first.",
      chatLoaded: false,
    });
  }

  const search = String(req.query.search || "").toLowerCase().trim();
  const sender = String(req.query.sender || "").trim();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(10, parseInt(req.query.pageSize, 10) || 50)
  );

  let filtered = S.currentMessages;

  if (sender) {
    filtered = filtered.filter(
      (m) => String(m.sender || "").toLowerCase() === sender.toLowerCase()
    );
  }

  if (search) {
    filtered = filtered.filter((m) =>
      String(m.message || "").toLowerCase().includes(search)
    );
  }

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;

  return res.json({
    total,
    page: safePage,
    totalPages,
    pageSize,
    messages: filtered
      .slice(start, start + pageSize)
      .map((m) => ({
        date: m.date,
        time: m.time,
        sender: m.sender,
        message: m.message,
      })),
  });
});

// ------------------------------------------------
// DEMO MODE, synthetic chat, memory-only
// ------------------------------------------------

app.post("/api/demo", demoLimiter, (req, res) => {
  let demoChat;

  try {
    demoChat = JSON.parse(
      fs.readFileSync(path.join(__dirname, "demo_chat.json"), "utf-8")
    );
  } catch {
    return res.status(500).json({
      message: "The demo chat could not be loaded.",
    });
  }

  const messages = Array.isArray(demoChat.messages) ? demoChat.messages : [];

  if (messages.length === 0) {
    return res.status(500).json({
      message: "The demo chat is empty.",
    });
  }

  const analytics = calculateAnalytics(messages);

  // Memory-only: no writes to data/chats/ or library.json
  S.currentChatId = "demo";
  S.currentMessages = messages;
  S.currentAnalytics = analytics;
  S.currentChatInfo = {
    filename: "Sample conversation (demo)",
    uploadedAt: new Date().toISOString(),
    messageCount: messages.length,
  };

  // Demo never hits the AI for facts, pre-baked JSON instead
  try {
    const demoFacts = JSON.parse(
      fs.readFileSync(path.join(__dirname, "demo_facts.json"), "utf-8")
    );
    S.factsResult = demoFacts;
    S.factsStatus = "ready";
  } catch {
    S.factsResult = null;
    S.factsStatus = "idle";
  }
  S.factsError = null;

  // Drop any previously loaded chat's library pointer so the demo
  // session behaves like a fresh analysis
  S.library.activeId = null;

  invalidateAnswerCache();
  embeddings.invalidateEmbeddingIndex(userContext.getEmbeddingScope());

  console.log("Demo chat loaded (memory-only).");

  return res.json({
    message: "Demo chat loaded.",
    analytics,
    chatLoaded: true,
    messageCount: messages.length,
    filename: S.currentChatInfo.filename,
    demo: true,
    suggestions: buildSuggestions(analytics),
  });
});

// ------------------------------------------------
// VAULT — REMOVED. It encrypted chat files at rest, but the privacy
// model no longer writes any chat file to disk: there is nothing to
// encrypt. Automatic AES-256-GCM replaces it (see session crypto above).
// ------------------------------------------------

// ------------------------------------------------
// PER-PERSON FACTS
// ------------------------------------------------
// Gemini-extracted fun facts (birthdays, places, milestones...)
// for every participant. Extraction runs once per chat in the
// background and is cached with the saved chat state.
// `?retry=1` re-runs extraction after a failure.
// ------------------------------------------------

// Per-session timestamp of the last forced facts re-extraction (abuse guard)
const factsRetryAt = new Map();

app.get("/api/facts", (req, res) => {
  if (!settings().aiEnabled) {
    return res.status(403).json({
      message: "AI features are turned off in settings.",
      aiEnabled: false,
      status: "unavailable",
      facts: null,
    });
  }

  if (
    !Array.isArray(S.currentMessages) ||
    S.currentMessages.length === 0
  ) {
    return res.status(400).json({
      message:
        "Please upload and analyze a chat first.",

      chatLoaded: false,

      status: "idle",
    });
  }

  const wantsRetry =
    req.query.retry === "1" || req.query.retry === "true";

  // ABUSE GUARD: retry=1 forces a fresh Gemini extraction — the shared
  // free-tier quota's most expensive single call. One retry per session
  // per minute (the "Try again" button is a manual action; the section's
  // 4s polling never sets retry).
  if (wantsRetry) {
    const sessionId = userContext.getSessionId();
    const lastRetry = factsRetryAt.get(sessionId) || 0;
    if (Date.now() - lastRetry < 60 * 1000) {
      return res.status(429).json({
        message: "Facts were just re-extracted. Please wait a minute before retrying.",
        status: S.factsStatus,
        facts: S.factsResult,
      });
    }
    factsRetryAt.set(sessionId, Date.now());
    if (factsRetryAt.size > 500) {
      const oldest = factsRetryAt.keys().next().value;
      factsRetryAt.delete(oldest);
    }
  }

  // Force a fresh extraction (unless one is already running), used by the
  // section's "Try again" button and to refresh stale facts.
  if (
    wantsRetry &&
    (S.factsStatus === "error" || S.factsStatus === "ready")
  ) {
    S.factsResult = null;
    S.factsStatus = "idle";
  }

  // Lazy trigger: the first poll after an upload or a server
  // restart kicks off the background extraction.
  if (S.factsStatus === "idle") {
    startFactsExtraction();
  }

  return res.json({
    status: S.factsStatus,

    facts: S.factsResult?.facts || null,

    extractedAt: S.factsResult?.extractedAt || null,

    error: S.factsError,

    participants:
      S.currentAnalytics?.overview?.participants || [],
  });
});

// ------------------------------------------------
// PUBLIC WALL (opt-in, anonymized stats)
// ------------------------------------------------

const wallPublishLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many wall publishes. Try again later." },
});

// Public: the wall itself, no auth, no identity, landing-page feed
app.get("/api/wall", (req, res) => {
  return res.json({ entries: listWall() });
});

// The caller's publishable stats (computed from THEIR active chat)
app.get("/api/wall/options", (req, res) => {
  if (!S.currentAnalytics) {
    return res.status(400).json({
      message: "Please upload and analyze a chat first.",
      options: [],
    });
  }

  return res.json({ options: wallOptions(S.currentAnalytics) });
});

// Publish one stat, the client only sends a stat id; the text is
// generated server-side from templates (never free text, never names)
app.post("/api/wall/publish", wallPublishLimiter, (req, res) => {
  if (!S.currentAnalytics) {
    return res.status(400).json({
      message: "Please upload and analyze a chat first.",
    });
  }

  const result = publishStat(S.currentAnalytics, req.body?.statId);

  if (!result.ok) {
    const status = result.reason === "unknown_stat" ? 400 : 422;
    return res.status(status).json({
      message:
        result.reason === "no_data"
          ? "This chat doesn't have enough data for that stat."
          : "Unknown stat.",
      reason: result.reason,
    });
  }

  console.log("Wall stat published (anonymous).");

  return res.json({
    message: "Published to the wall.",
    entry: result.entry,
  });
});

// ------------------------------------------------
// ANSWER FEEDBACK (trains retrieval scoring)
// ------------------------------------------------

app.post("/api/feedback", feedbackLimiter, (req, res) => {
  const question =
    typeof req.body?.question === "string" ? req.body.question.trim() : "";

  const isPositive = req.body?.isPositive === true;

  if (!question) {
    return res.status(400).json({
      message: "Question is required for feedback.",
    });
  }

  const recordFeedback =
    typeof retrievalModule === "object" && retrievalModule
      ? retrievalModule.recordFeedback
      : null;

  if (typeof recordFeedback !== "function") {
    return res.status(501).json({
      message: "Feedback is not supported by this build.",
    });
  }

  const ok = recordFeedback(
    question,
    isPositive,
    [],
    userContext.getEmbeddingScope()
  );

  return res.json({
    message: ok ? "Feedback recorded." : "Feedback could not be recorded.",
    recorded: ok,
  });
});

// ------------------------------------------------
// MULTER ERROR HANDLER
// ------------------------------------------------

app.use(
  (
    error,
    req,
    res,
    next
  ) => {
    if (
      error instanceof
      multer.MulterError
    ) {
      return res.status(400).json({
        message:
          "File upload error.",

        error:
          error.message,
      });
    }

    if (
      error?.message ===
      "Only .txt files are allowed."
    ) {
      return res.status(400).json({
        message:
          "Only .txt files are allowed.",
      });
    }

    next(error);
  }
);

// ------------------------------------------------
// STATIC FRONTEND (production single-service mode)
// If frontend/dist exists, serve it from the same port.
// ------------------------------------------------

const frontendDist = path.join(__dirname, "..", "frontend", "dist");

if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));

  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      // File-looking paths (.env, .git/config, foo.js) that did not
      // match a real asset get a 404 — not the SPA shell — so probes
      // for internal files never get a misleading 200.
      // Any dotted path segment (.env, .git/config, foo.js) that did
      // not match a real asset gets a 404, never the SPA shell.
      const looksLikeFile = req.path
        .split("/")
        .some((segment) => segment.startsWith(".") || path.extname(segment));
      if (looksLikeFile) {
        return res.status(404).end();
      }
      return res.sendFile(path.join(frontendDist, "index.html"));
    }
    next();
  });
}

// ------------------------------------------------
// GENERAL ERROR HANDLER
// ------------------------------------------------

app.use(
  (
    error,
    req,
    res,
    next
  ) => {
    console.error(
      `[${req.id}] Unhandled server error:`,
      error
    );

    // Client errors (bad JSON, over-limit bodies, explicit status)
    // should not masquerade as 500s. Parse failures get a generic
    // message so the JSON position is never echoed back. 500s return
    // a generic message + correlation id — internals stay in logs.
    const status =
      error?.type === "entity.parse.failed"
        ? 400
        : error?.status || error?.statusCode || 500;

    const message =
      error?.type === "entity.parse.failed"
        ? "Invalid JSON in the request body."
        : status < 500
          ? error?.message || "Request failed."
          : "An unexpected server error occurred.";

    res.status(status).json({
      message,
      ...(status < 500 ? {} : { requestId: req.id }),
    });
  }
);

// ------------------------------------------------
// GRACEFUL SHUTDOWN
// Persist the chat state on Ctrl+C / container stop so a
// session is never lost to an abrupt kill mid-write.
// ------------------------------------------------
// (Superseded by the privacy model: nothing is persisted.)

function shutdown(signal) {
  // PRIVACY MODEL: nothing chat-related persists, so shutdown IS the
  // data wipe — intentionally no state saving here.
  console.log(`\n${signal} received, shutting down (no chat data persisted).`);
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// ------------------------------------------------
// START SERVER
// ------------------------------------------------

// Resource meter heartbeat: print one line every 30s, but only when
// something actually happened in that window (silent when idle).
setInterval(() => {
  const snap = resourceMeter.snapshot();
  const active = Object.values(snap).some(
    (s) => s.requestsLast60s > 0
  );
  if (active) {
    console.log(`📊 RESOURCES  ${resourceMeter.formatLine()}`);
  }
}, 30000).unref();

// Captured so tests (privacy.test.js boots the app in-process) can
// close the server gracefully instead of hard-exiting mid-teardown.
const httpServer = app.listen(
  PORT,
  () => {
    console.log(
      "----------------------------------------"
    );

    console.log(
      `ChatScope backend running at http://localhost:${PORT}`
    );

    console.log(
      `Gemini model: ${GEMINI_MODEL}`
    );

    if (!process.env.GEMINI_API_KEY) {
      console.warn(
        "WARNING: GEMINI_API_KEY is not set, AI answers are disabled until it is added to .env"
      );
    }

    console.log(
      `Retrieval system: ${
        typeof retrieveRelevantMessages ===
        "function"
          ? "READY"
          : "NOT READY"
      }`
    );

    console.log(
      `Saved chat state: ${
        S.currentMessages.length > 0
          ? "LOADED"
          : "EMPTY"
      }`
    );

    console.log(
      "----------------------------------------"
    );
  }
);// ------------------------------------------------
// GEMINI PROMPT BUILDER (shared by /api/ask and the
// streaming endpoint)
// ------------------------------------------------

// Replace participant names with aliases inside the analytics JSON
// so alias mode never leaks real names through the FULL-CHAT
// ANALYTICS block.
function aliasAnalytics(analytics, aliasMap) {
  if (!aliasMap || !analytics) return analytics;

  const swapKeys = (obj) => {
    if (!obj || typeof obj !== "object") return obj;
    const out = {};
    for (const [key, value] of Object.entries(obj)) {
      out[aliasMap.get(key) || key] = value;
    }
    return out;
  };

  const swapPerson = (item) =>
    item && typeof item === "object"
      ? { ...item, person: aliasMap.get(item.person) || item.person }
      : item;

  return {
    ...analytics,
    overview: analytics.overview
      ? {
          ...analytics.overview,
          participants: (analytics.overview.participants || []).map(
            (p) => aliasMap.get(p) || p
          ),
        }
      : analytics.overview,
    messagesPerPerson: swapKeys(analytics.messagesPerPerson),
    responseTime: analytics.responseTime
      ? {
          ...analytics.responseTime,
          byPerson: Object.fromEntries(
            Object.entries(analytics.responseTime.byPerson || {}).map(
              ([person, data]) => [aliasMap.get(person) || person, data]
            )
          ),
          fastestResponse: analytics.responseTime.fastestResponse
            ? {
                ...analytics.responseTime.fastestResponse,
                responder:
                  aliasMap.get(analytics.responseTime.fastestResponse.responder) ||
                  analytics.responseTime.fastestResponse.responder,
                previousSender:
                  aliasMap.get(analytics.responseTime.fastestResponse.previousSender) ||
                  analytics.responseTime.fastestResponse.previousSender,
              }
            : analytics.responseTime.fastestResponse,
        }
      : analytics.responseTime,
    conversationStarters: analytics.conversationStarters
      ? {
          ...analytics.conversationStarters,
          byPerson: (analytics.conversationStarters.byPerson || []).map(swapPerson),
          topStarter: swapPerson(analytics.conversationStarters.topStarter),
        }
      : analytics.conversationStarters,
    messageLength: analytics.messageLength
      ? {
          ...analytics.messageLength,
          byPerson: (analytics.messageLength.byPerson || []).map((p) =>
            p && typeof p === "object"
              ? {
                  ...p,
                  person: aliasMap.get(p.person) || p.person,
                }
              : p
          ),
          longestAverageMessageSender: swapPerson(
            analytics.messageLength.longestAverageMessageSender
          ),
        }
      : analytics.messageLength,
    activity: analytics.activity,
    longestMessage: analytics.longestMessage
      ? {
          ...analytics.longestMessage,
          sender: aliasMap.get(analytics.longestMessage.sender) || analytics.longestMessage.sender,
        }
      : analytics.longestMessage,
    topEmojis: analytics.topEmojis,
    topWords: analytics.topWords,
  };
}

function buildAiPrompt(cleanQuestion, questionType, relevantMessages) {
  const aliasMap = settings().aliasMode ? buildAliasMap() : null;

  // Ask persona: tone-only override selected in settings (guest or
  // per-user). Grounding rules in the prompt always win over tone.
  const askPersona = getAskPersona(settings().askPersona);

  // PRIVACY: the question is AI-bound text too — apply the same PII
  // masking the evidence messages get, per the user's setting.
  const outgoingQuestion = settings().redactPII
    ? redactText(cleanQuestion)
    : cleanQuestion;

  const conversationContext = relevantMessages
    .map((message, index) => {
      const sender = aliasMap
        ? aliasMap.get(message.sender) || message.sender
        : message.sender;
      return `[${index + 1}] ${message.date}, ${message.time} - ${sender}: ${message.message}`;
    })
    .join("\n");

  const analyticsContext = createAnalyticsContext(
    aliasAnalytics(S.currentAnalytics, aliasMap)
  );

  return `
You are ChatScope AI.
${askPersona.prompt ? `\n${askPersona.prompt}\n` : ""}
You answer questions about a user's WhatsApp conversation.

STYLE RULE: Never use em dashes or en dashes in your answer. Use only commas, colons and full stops.

Your job is to reason over the supplied evidence and answer the user's question accurately.

==================================================
USER QUESTION
==================================================

${outgoingQuestion}

==================================================
QUESTION TYPE
==================================================

${questionType}

==================================================
FULL-CHAT ANALYTICS
==================================================

${analyticsContext}

==================================================
RETRIEVED CONVERSATION EVIDENCE
==================================================

${
  conversationContext ||
  "No relevant conversation evidence was retrieved."
}

==================================================
HOW TO REASON
==================================================

The retrieved messages are evidence selected from the
uploaded WhatsApp conversation.

Do NOT require the exact words from the user's question
to appear inside the messages.

For example, if the user asks:

"Does someone like food?"

and the evidence contains that person explicitly saying
they like or want a particular food, that may be relevant
evidence even though the word "food" itself is not present.

Similarly:

"Does someone like cooking?"

may have relevant evidence such as the person talking
about cooking, making dishes, recipes, baking, preparing
food, or explicitly saying they enjoy those activities.

However, do NOT make unsupported assumptions.

Distinguish between:

1. Explicit evidence
2. Strong reasonable inference
3. Weak/ambiguous evidence
4. No evidence

If evidence is indirect, say that it is an inference.

==================================================
STRICT ACCURACY RULES
==================================================

1. Use the uploaded conversation as the source of truth.

2. Never invent messages, events, preferences, relationships,
   dates, opinions, or facts.

3. Never claim certainty about someone's internal feelings,
   intentions, attraction, or thoughts unless the conversation
   explicitly supports that conclusion.

4. Behavioral evidence can support an inference, but it does
   not automatically prove an internal feeling.

5. Negative evidence matters.

   For example:
   "I don't like cooking"
   is evidence against liking cooking.

6. Positive evidence matters.

   For example:
   "I love cooking"
   is strong evidence that the person likes cooking.

7. A specific example can sometimes support a broader category,
   but explain that it is an inference.

8. Do not confuse:
   - mentioning something
   - doing something once
   - liking something
   - frequently doing something
   - being interested in something

9. For "why" questions, only provide a reason if the chat
   supports it.

10. For "when", "where", and date-related questions, preserve
    the actual date/time from the conversation.

11. For statistical questions, use the FULL-CHAT ANALYTICS,
    not just the retrieved messages.

12. For person-specific questions, pay close attention to the
    sender of each message.

13. Pay attention to surrounding messages and conversation flow.

14. A short answer from someone can still be important evidence.

15. Do not ignore short messages merely because they contain
    only a few words.

16. Understand normal Hinglish and Roman Hindi.

Examples:

kyu / kyun / kyon
kya
kab
kaha / kahan
kaun
nahi / nhi / ni
hai / h
haan / han / hn
karna / krna
karta / krta
karti / krti
pata / pta
bata / bta
matlab / mtlb
mujhe
tumhe
mera / mra
meri / mri

==================================================
ANSWER FORMAT
==================================================

For a simple question:

Answer:
Give the direct answer.

Reasoning:
Briefly explain why.

Evidence:
Mention the strongest relevant chat evidence.

Confidence:
High / Medium / Low

For an inference:

Answer:
Give the conclusion and clearly say that it is an inference.

Reasoning:
Explain what evidence supports the inference.

Evidence:
Give the relevant messages.

Confidence:
High / Medium / Low

For insufficient evidence:

Answer:
"I couldn't find enough information in the chat to determine that."

Then briefly explain what evidence was missing.

Do not invent an answer simply to avoid saying
there is insufficient evidence.

==================================================
STATISTICAL QUESTIONS
==================================================

Use the full-chat analytics when applicable.

For "who talks more":
Use messagesPerPerson.

For response speed:
Use responseTime.

For message length:
Use messageLength.

For conversation starters:
Use conversationStarters.

==================================================
IMPORTANT
==================================================

Do not mention:
- retrieval
- backend
- frontend
- API
- model
- prompt
- implementation
- question classification
- technical pipeline

Just answer as ChatScope AI.

Keep the answer concise but evidence-based.

==================================================
ANSWER NOW
==================================================
`;
}

// Exported for in-process test boots only (never used by the app itself).
if (typeof module !== "undefined" && module.exports !== undefined) {
  module.exports = httpServer;
}
