/**
 * ----------------------------------------------------------------------------
 * CHATSCOPE - SEMANTIC EMBEDDING LAYER (optional, free-tier friendly)
 * ----------------------------------------------------------------------------
 * Uses Gemini's text-embedding model (free quota) to build one vector per
 * message after upload, plus one vector per question at ask time. Retrieval
 * blends cosine similarity into its ranking, so questions with zero lexical
 * overlap ("does she like cooking?" vs "I made pasta") find evidence without
 * a reformulation round-trip.
 *
 * Design constraints:
 * - The index is scoped per corpus fingerprint (chat isolation).
 * - Free-tier quota is limited per minute, so the build is PACED and
 *   429-aware: it waits out the window Google suggests, and when the quota
 *   stays dry it PAUSES (progress saved) instead of burning requests.
 * - Bounded: only the latest EMBED_MAX_MESSAGES messages are embedded, so
 *   build time and cache size stay predictable for huge chats.
 * - RAM-ONLY: embedding vectors encode message content, so they are
 *   never written to disk; a restart rebuilds the index lazily.
 * - Built asynchronously and non-blocking: analytics work even while the
 *   index is building, and lexical retrieval is always the fallback.
 * ----------------------------------------------------------------------------
 */

const { getDataDir } = require("./dataDir");
const { redactText } = require("./redact");
const aiLog = require("./aiLog");

const EMBED_MODEL =
  process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001";

const EMBED_BATCH_SIZE =
  Number(process.env.EMBED_BATCH_SIZE) || 50;

const EMBED_BATCH_INTERVAL_MS =
  Number(process.env.EMBED_BATCH_INTERVAL_MS) || 32000;

const EMBED_MAX_MESSAGES =
  Number(process.env.EMBED_MAX_MESSAGES) || 600;

const MAX_TEXT_CHARS = 300;
const MAX_BATCH_ATTEMPTS = 2;
const MAX_WAIT_MS = 95000;
const MAX_CONSECUTIVE_FAILED_BATCHES = 2;
const MAX_FAILURE_LOGS = 3;
const RESUME_DELAY_MS = 30 * 60 * 1000; // one gentle in-process retry after a pause

function deleteEmbeddingIndex(fingerprint, dir = getDataDir()) {
  // PRIVACY MODEL: nothing on disk — just drop this scope's RAM cache.
  vectorCaches.delete(cacheKey(fingerprint, dir));
}

// Per-context caches, keyed by `${dataDir}::${fingerprint}` so two
// users with the same chat never share (or overwrite) an index.
const vectorCaches = new Map(); // key → { fingerprint, vectors } | undefined marker
const buildingPromises = new Map(); // key → promise
const resumeTimers = new Map(); // key → timer

function cacheKey(fingerprint, dir = getDataDir()) {
  return `${dir}::${fingerprint}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function embedTextForMessage(msg, redactPII = true) {
  const sender = msg?.sender ? `${msg.sender}: ` : "";
  let text = String(msg?.message || "");
  // Privacy: mask PII in the text sent to the embedding API
  if (redactPII) text = redactText(text);
  return `${sender}${text}`.slice(0, MAX_TEXT_CHARS);
}

async function embedBatch(ai, texts) {
  const response = await ai.models.embedContent({
    model: EMBED_MODEL,
    contents: texts,
  });

  const embeddings = response?.embeddings;
  if (!Array.isArray(embeddings) || embeddings.length !== texts.length) {
    throw new Error("Embedding response shape mismatch.");
  }
  return embeddings.map((e) => Float32Array.from(e.values || []));
}

// Google puts the suggested wait in the message ("Please retry in 59s")
// and in the error details ("retryDelay":"59s").
function parseRetryDelaySeconds(error) {
  const message = String(error?.message || "");
  const match =
    message.match(/retry in ([\d.]+)\s*s/i) ||
    message.match(/retryDelay\\?":\\?"([\d.]+)s/);
  return match ? parseFloat(match[1]) : 0;
}

function isRetryableEmbedError(error) {
  const status = error?.status || error?.response?.status;
  if (status === 429 || status === 503) return true;
  return /RESOURCE_EXHAUSTED|rate|quota|overload|temporarily|fetch failed|network|ECONN|ETIMEDOUT|socket/i.test(
    String(error?.message || "")
  );
}

function describeEmbedError(error) {
  const message = String(error?.message || "unknown error");
  if (error?.status === 429 || /RESOURCE_EXHAUSTED|rate limit|quota/i.test(message)) {
    return "rate limited (quota window exhausted)";
  }
  if (error?.status === 503 || /overload/i.test(message)) {
    return "service temporarily unavailable";
  }
  if (/fetch failed|network|ECONN|ETIMEDOUT|socket/i.test(message)) {
    return "network error";
  }
  return message.slice(0, 100);
}

function scheduleResume(ai, messages, fingerprint, dir) {
  const key = cacheKey(fingerprint, dir);
  if (resumeTimers.has(key)) clearTimeout(resumeTimers.get(key));

  const timer = setTimeout(() => {
    resumeTimers.delete(key);

    // Only resume if the same chat is still loaded and nothing is running
    if (buildingPromises.has(key)) return;
    const cached = vectorCaches.get(key);
    if (cached && cached.fingerprint === fingerprint) {
      const complete = cached.vectors.every(Boolean);
      if (complete) return;
    }

    console.log("Retrying embedding index build...");
    buildEmbeddingIndex(ai, messages, fingerprint, dir).catch(() => {});
  }, RESUME_DELAY_MS);

  if (typeof timer.unref === "function") timer.unref();
  resumeTimers.set(key, timer);
}

/**
 * Build (or resume) the embedding index for a corpus. Safe to call
 * repeatedly: a completed in-memory index for the same fingerprint is
 * reused, missing batches are rebuilt incrementally, and concurrent
 * builds for the same corpus share one promise. `dir` is the isolation
 * scope key (e.g. the caller's session scope); it defaults to the
 * active data-dir scope.
 */
async function buildEmbeddingIndex(ai, messages, fingerprint, dir = getDataDir()) {
  if (!Array.isArray(messages) || messages.length === 0) return null;
  if (!fingerprint) return null;

  const key = cacheKey(fingerprint, dir);
  const cachedVectors = vectorCaches.get(key);

  if (cachedVectors && cachedVectors.fingerprint === fingerprint) {
    if (cachedVectors.vectors.every(Boolean)) {
      return cachedVectors;
    }
  }

  if (buildingPromises.has(key)) return buildingPromises.get(key);

  const buildingPromise = (async () => {
    // Start from whatever is already embedded for this fingerprint
    const vectors =
      cachedVectors && cachedVectors.fingerprint === fingerprint
        ? cachedVectors.vectors.slice()
        : new Array(messages.length).fill(null);

    // Embed only the latest window — keeps quota use, build time and the
    // cache file bounded no matter how large the chat is.
    const startOffset = Math.max(0, messages.length - EMBED_MAX_MESSAGES);
    const totalBatches = Math.ceil(
      (messages.length - startOffset) / EMBED_BATCH_SIZE
    );

    // Resume support: skip batches that are already fully embedded
    const pendingBatches = [];
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const scopeStart = startOffset + batchIndex * EMBED_BATCH_SIZE;
      const scopeEnd = Math.min(messages.length, scopeStart + EMBED_BATCH_SIZE);

      let missing = 0;
      for (let i = scopeStart; i < scopeEnd; i++) {
        if (!vectors[i]) missing++;
      }
      if (missing > 0) {
        pendingBatches.push({ start: scopeStart, end: scopeEnd });
      }
    }

    if (pendingBatches.length === 0) {
      vectorCaches.set(key, { fingerprint, vectors });
      return vectorCaches.get(key);
    }

    const pendingMessages = pendingBatches.reduce(
      (sum, batch) => sum + (batch.end - batch.start),
      0
    );

    console.log(
      `Building embedding index in background: ${pendingMessages} message(s) in ${pendingBatches.length} paced batch(es)...`
    );

    let failedBatches = 0;
    let loggedFailures = 0;
    let consecutiveFailures = 0;

    for (const batch of pendingBatches) {
      const batchTexts = messages
        .slice(batch.start, batch.end)
        .map((m) => embedTextForMessage(m));

      let batchVectors = null;

      for (let attempt = 1; attempt <= MAX_BATCH_ATTEMPTS; attempt++) {
        try {
          batchVectors = await embedBatch(ai, batchTexts);

          // Transparency: record the count (never content) of what
          // left for the embedding API.
          aiLog.logAiCall({
            chatId: fingerprint,
            feature: "embeddings",
            messagesSent: batchTexts.length,
            provider: EMBED_MODEL,
          });

          break;
        } catch (error) {
          if (
            !isRetryableEmbedError(error) ||
            attempt === MAX_BATCH_ATTEMPTS
          ) {
            failedBatches++;
            consecutiveFailures++;
            if (loggedFailures < MAX_FAILURE_LOGS) {
              loggedFailures++;
              console.warn(
                `Embedding batch ${batch.start}-${batch.end} skipped: ${describeEmbedError(error)}`
              );
            }
            break;
          }

          // Rate limited or transient — wait out the quota window
          const retrySeconds = parseRetryDelaySeconds(error);
          const waitMs = Math.min(
            MAX_WAIT_MS,
            Math.max(EMBED_BATCH_INTERVAL_MS, (retrySeconds + 5) * 1000)
          );
          await sleep(waitMs);
        }
      }

      if (batchVectors) {
        for (let i = 0; i < batchVectors.length; i++) {
          vectors[batch.start + i] = batchVectors[i];
        }

        // Persist progress in RAM so a paused build resumes in place
        vectorCaches.set(key, { fingerprint, vectors });
        consecutiveFailures = 0;
      }

      // Quota clearly dry — pause instead of burning requests. Progress is
      // kept in memory; the build resumes after the scheduled delay.
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILED_BATCHES) {
        console.warn(
          "Embedding quota appears exhausted — pausing the build. Progress is kept in memory and it will resume automatically."
        );
        scheduleResume(ai, messages, fingerprint, dir);
        buildingPromises.delete(key);
        return vectors.some(Boolean)
          ? { fingerprint, vectors }
          : null;
      }

      if (batch !== pendingBatches[pendingBatches.length - 1]) {
        // Pace the requests to stay inside the per-minute quota
        await sleep(EMBED_BATCH_INTERVAL_MS);
      }
    }

    const embedded = vectors.filter(Boolean).length;
    if (embedded === 0) {
      console.warn(
        "Embedding index unavailable (all batches failed). Lexical retrieval still works."
      );
      return null;
    }

    console.log(
      `Embedding index ready: ${embedded}/${messages.length} messages embedded (in memory).`
    );

    vectorCaches.set(key, { fingerprint, vectors });

    return vectorCaches.get(key);
  })();

  buildingPromises.set(key, buildingPromise);

  try {
    return await buildingPromise;
  } finally {
    buildingPromises.delete(key);
  }
}

/**
 * Embed a question and return Map<messageIndex, cosineScore in [0,1]> for
 * messages whose similarity clears a floor. Returns null when no index is
 * available or embedding fails — callers must treat null as "no signal".
 */
async function getSemanticScores(ai, question, fingerprint, dir = getDataDir()) {
  const cachedVectors = vectorCaches.get(cacheKey(fingerprint, dir));
  if (!cachedVectors || cachedVectors.fingerprint !== fingerprint) return null;

  try {
    const [queryVector] = await embedBatch(ai, [
      String(question).slice(0, MAX_TEXT_CHARS),
    ]);
    const scores = new Map();

    cachedVectors.vectors.forEach((vector, index) => {
      if (!vector) return;
      if (vector.length !== queryVector.length) return;
      const similarity = cosineSimilarity(queryVector, vector);
      // Map [-1,1] into [0,1] and keep only genuinely related hits.
      const normalized = (similarity + 1) / 2;
      if (normalized >= 0.55) {
        scores.set(index, normalized);
      }
    });

    return scores;
  } catch (error) {
    console.warn(
      "Query embedding failed:",
      error?.message || "unknown error"
    );
    return null;
  }
}

function getEmbeddingStatus(fingerprint, dir = getDataDir()) {
  const cachedVectors = vectorCaches.get(cacheKey(fingerprint, dir));
  return {
    available: Boolean(
      cachedVectors && cachedVectors.fingerprint === fingerprint
    ),
  };
}

// Note: the disk file is intentionally kept — it only hydrates when the
// fingerprint matches, and each successful batch overwrites it with progress.
function invalidateEmbeddingIndex(dir = getDataDir()) {
  // Drop only the ACTIVE context's cache entry — other sessions'
  // indexes stay warm in memory.
  for (const key of [...vectorCaches.keys()]) {
    if (key.startsWith(`${dir}::`)) vectorCaches.delete(key);
  }
  for (const [key, promise] of buildingPromises) {
    if (key.startsWith(`${dir}::`)) {
      // Let an in-flight build finish (it writes its own scope) but stop
      // deduping against it from this context.
      buildingPromises.delete(key);
      void promise;
    }
  }
  for (const [key, timer] of resumeTimers) {
    if (key.startsWith(`${dir}::`)) {
      clearTimeout(timer);
      resumeTimers.delete(key);
    }
  }
}

/**
 * Drop every cache entry belonging to one isolation scope (used when a
 * session is evicted or idles out, so its vectors die with it).
 */
function disposeEmbeddingScope(dir) {
  const prefix = `${dir}::`;
  for (const key of [...vectorCaches.keys()]) {
    if (key.startsWith(prefix)) vectorCaches.delete(key);
  }
  for (const [key, timer] of resumeTimers) {
    if (key.startsWith(prefix)) {
      clearTimeout(timer);
      resumeTimers.delete(key);
    }
  }
}

module.exports = {
  buildEmbeddingIndex,
  getSemanticScores,
  getEmbeddingStatus,
  invalidateEmbeddingIndex,
  deleteEmbeddingIndex,
  disposeEmbeddingScope,
};
