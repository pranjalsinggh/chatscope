// ------------------------------------------------
// GEMINI CALL WITH RETRY + MODEL FALLBACK
// ------------------------------------------------
// Shared by the background Gemini extractions (facts, persona).
// Retries transient failures (429/503) honoring Google's suggested
// delays, and when the primary model STAYS overloaded (503 "high
// demand"), spends the same retry budget on a sibling model — the
// stable `gemini-flash-latest` alias — before giving up.
// ------------------------------------------------

// Circuit breaker: when Gemini's daily cap is blown, abort retries
// immediately instead of burning minutes on a dead bucket.
const { isFlashDailyBlocked } = require("./resourceMeter");

// Override with GEMINI_FALLBACK_MODEL in .env if needed.
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-flash-latest";

/** Google's 429s carry "Please retry in Ns", honor it (plus buffer). */
function suggestedDelayMs(error) {
  const text = String(error?.message || "");
  const seconds = text.match(/retry in ([\d.]+)s/i);
  if (seconds) return Math.ceil(parseFloat(seconds[1]) * 1000) + 2000;
  return null;
}

function isRetryable(error) {
  const status = error?.status || error?.response?.status;
  return (
    status === 429 ||
    status === 503 ||
    /overload|rate[- ]limit|temporarily|quota|resource_exhausted|exceeded your current quota/i.test(
      error?.message || ""
    )
  );
}

/**
 * Model-side overload (503 "high demand") — a different model can
 * plausibly fix this. A 429 is a per-key quota problem, so no point
 * falling back to a sibling model there.
 */
function isOverloaded(error) {
  const status = error?.status || error?.response?.status;
  return (
    status === 503 ||
    /overload|unavailable|high demand/i.test(error?.message || "")
  );
}

function assertDailyCapOpen() {
  if (isFlashDailyBlocked()) {
    throw Object.assign(
      new Error("Gemini daily quota exhausted, waiting for the daily reset."),
      { status: 429, daily: true }
    );
  }
}

async function attemptWithRetry(ai, model, prompt, maxAttempts, label) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
      });

      const text = typeof response.text === "string" ? response.text : "";

      if (!text.trim()) {
        throw new Error("Gemini returned an empty response.");
      }

      return text;
    } catch (error) {
      lastError = error;

      if (isRetryable(error) && attempt < maxAttempts) {
        assertDailyCapOpen();

        // Per-minute quotas need the FULL window to clear, a short
        // backoff just burns another attempt inside the same minute.
        const waitMs = Math.max(suggestedDelayMs(error) || 0, attempt * 15000);

        console.warn(
          `${label} transient failure on ${model} (attempt ${attempt}), retrying in ${Math.round(waitMs / 1000)}s...`
        );

        await new Promise((resolve) => setTimeout(resolve, waitMs));

        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

/**
 * Call Gemini with per-model retries; on persistent model overload,
 * re-run the whole retry budget on the fallback model.
 */
async function callGeminiWithRetry(ai, model, prompt, opts = {}) {
  const maxAttempts = opts.maxAttempts || 4;
  const label = opts.label || "Gemini";

  const chain =
    model === FALLBACK_MODEL ? [model] : [model, FALLBACK_MODEL];

  let lastError = null;

  for (let index = 0; index < chain.length; index++) {
    try {
      return await attemptWithRetry(
        ai,
        chain[index],
        prompt,
        maxAttempts,
        label
      );
    } catch (error) {
      lastError = error;

      const next = chain[index + 1];
      if (!next || error?.daily || !isOverloaded(error)) throw error;

      console.warn(
        `${label}: ${chain[index]} stayed overloaded, retrying on ${next}`
      );
    }
  }

  throw lastError;
}

module.exports = { callGeminiWithRetry, FALLBACK_MODEL };
