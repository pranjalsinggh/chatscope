// ------------------------------------------------
// RESOURCE METER — rolling-window usage tracker
// ------------------------------------------------
// Every AI call reports here: Gemini Flash (chat/extraction),
// Gemini Embeddings, and Groq (fallback). Buckets mirror how the
// providers actually meter:
//   • gemini-flash : requests/min + input tokens/min (free tier 5 / 250K)
//   • embeddings   : requests/min (free tier 100)
//   • groq         : requests/min (free tier ~30) + 6K-token/request cap
// The meter prints a line on every 429 (so errors say WHICH bucket
// died), a summary line each interval when there was activity, and is
// exposed at GET /api/resource-meter.
// ------------------------------------------------

const WINDOWS = 60_000; // rolling 60s window

const state = {
  // per-resource: { req60s: [{t, tokens}], boot: {req, tokens, errors}, lastError }
  gemini_flash: newResource(),
  embeddings: newResource(),
  groq: newResource(),
};

function newResource() {
  return {
    req60s: [], // { t, tokens }
    boot: { req: 0, tokens: 0, errors: 0 },
    lastError: null, // { t, metric, detail }
  };
}

function prune(resource, now) {
  while (resource.req60s.length > 0 && now - resource.req60s[0].t > WINDOWS) {
    resource.req60s.shift();
  }
}

/** Record one request. tokens = input tokens when known, else 0. */
function record(resourceKey, tokens) {
  const resource = state[resourceKey] || (state[resourceKey] = newResource());
  const now = Date.now();
  const entry = { t: now, tokens: tokens || 0 };
  resource.req60s.push(entry);
  resource.boot.req += 1;
  resource.boot.tokens += tokens || 0;
  prune(resource, now);
}

function recordError(resourceKey, detail, metric) {
  const resource = state[resourceKey] || (state[resourceKey] = newResource());
  const now = Date.now();
  resource.boot.errors += 1;
  resource.lastError = {
    t: new Date(now).toISOString(),
    metric: metric || "unknown",
    detail: String(detail || "").slice(0, 200),
  };
  prune(resource, now);
}

/** Pull the quota metric out of a Gemini 429 payload for attribution. */
function parseQuotaMetric(error) {
  const text = String(error?.message || "");

  // Raw JSON form: "quotaMetric":"generativelanguage.googleapis.com/..."
  const jsonMetric = text.match(/quotaMetric\\?":\\?"([^"\\]+)\\?"/i)?.[1];
  // Log-line form: Quota exceeded for metric: <name>
  const logMetric = text.match(/metric: ([\w./-]+)/i)?.[1];
  const quotaId = text.match(/quotaId\\?":\\?"([^"\\]+)\\?"/i)?.[1];
  const limit = text.match(/limit: (\d+)/i)?.[1];
  const retryIn = text.match(/retry in ([\d.]+)s/i)?.[1];

  const haystack = `${quotaId || ""} ${jsonMetric || ""}`;
  let bucket = "unknown bucket";
  if (/PerDay/i.test(haystack)) bucket = "requests PER DAY (RPD)";
  else if (/InputTokens/i.test(haystack)) bucket = "input tokens/minute (TPM)";
  else if (/PerMinute/i.test(haystack)) bucket = "requests/minute (RPM)";

  return {
    metric: jsonMetric || logMetric || quotaId || "unknown",
    bucket,
    limit,
    retryIn: retryIn ? `${Math.ceil(parseFloat(retryIn))}s` : undefined,
  };
}

function snapshot() {
  const now = Date.now();
  const out = {};
  for (const [name, resource] of Object.entries(state)) {
    prune(resource, now);
    const req60s = resource.req60s.length;
    const tok60s = resource.req60s.reduce((sum, r) => sum + r.tokens, 0);
    out[name] = {
      requestsLast60s: req60s,
      inputTokensLast60s: tok60s,
      sinceBoot: { ...resource.boot },
      lastError: resource.lastError,
    };
  }
  return out;
}

// Free-tier ceilings for the gauge display (informational — Google
// doesn't expose remaining quota, so this is usage-vs-known-limit).
const FREE_TIER = {
  gemini_flash: { rpm: 5, tpm: 250000 },
  embeddings: { rpm: 100 },
  groq: { rpm: 30 },
};

function formatLine() {
  const snap = snapshot();
  const fmtK = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));
  const parts = [];
  for (const [name, s] of Object.entries(snap)) {
    const cap = FREE_TIER[name];
    let line = `${name}: ${s.requestsLast60s}${cap ? `/${cap.rpm}` : ""} rpm`;
    if (cap?.tpm) line += ` · ${fmtK(s.inputTokensLast60s)}${cap ? `/${fmtK(cap.tpm)}` : ""} tpm`;
    if (s.sinceBoot.errors) line += ` · ${s.sinceBoot.errors} err`;
    parts.push(line);
  }
  return parts.join("  |  ");
}

// ------------------------------------------------
// DAILY CIRCUIT BREAKER — when a "requests PER DAY" 429 fires, Gemini
// Flash is useless until the Pacific-midnight reset. Remember that so
// asks skip straight to Groq and extractions report the real reason
// instead of burning attempts on a dead bucket.
// ------------------------------------------------

let flashDailyBlockedUntil = 0;

function nextPacificMidnightMs() {
  const now = new Date();
  const la = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })
  );
  const midnightLA = new Date(la);
  midnightLA.setHours(24, 0, 0, 0);
  return now.getTime() + (midnightLA - la) + 2 * 60 * 1000; // +2min buffer
}

function markFlashDailyBlocked() {
  flashDailyBlockedUntil = nextPacificMidnightMs();
  const until = new Date(flashDailyBlockedUntil).toLocaleTimeString(
    "en-IN",
    { hour: "2-digit", minute: "2-digit" }
  );
  console.warn(
    `🚫 Gemini Flash daily request cap reached — circuit breaker open until ~${until} IST. Asks will use Groq; extractions wait for the reset.`
  );
}

function isFlashDailyBlocked() {
  return Date.now() < flashDailyBlockedUntil;
}

module.exports = {
  record,
  recordError,
  parseQuotaMetric,
  snapshot,
  formatLine,
  FREE_TIER,
  state,
  markFlashDailyBlocked,
  isFlashDailyBlocked,
};
