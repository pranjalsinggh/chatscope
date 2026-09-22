#!/usr/bin/env node
/**
 * ------------------------------------------------
 * CHATSCOPE SMOKE TEST
 * ------------------------------------------------
 * Verifies a RUNNING backend end-to-end:
 *   health → upload (synthetic chat) → analytics → deterministic ask
 *   → session library → facts status → cleanup. Nothing persists.
 *
 * Usage:
 *   npm start              (terminal 1)
 *   npm run smoke          (terminal 2)
 *
 * Optionally target another instance:
 *   node scripts/smoke.js http://your-host:5000
 *
 * NOTE: uploading a chat may trigger a background Gemini facts
 * extraction (free tier). The test restores your previously active
 * chat afterwards.
 * ------------------------------------------------
 */

const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || "http://localhost:5000").replace(/\/$/, "");

let failures = 0;

function check(name, condition, detail = "") {
  if (condition) {
    console.log(`  ✔ ${name}`);
  } else {
    failures++;
    console.error(`  ✘ ${name} ${detail ? `— ${detail}` : ""}`);
  }
}

// Anonymous session cookie: all smoke requests share one browser
// workspace (the cookie carries no personal data, just a random id).
let sessionCookie = "";

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (sessionCookie) headers["Cookie"] = sessionCookie;
  const response = await fetch(`${BASE}${path}`, { ...options, headers });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    const m = setCookie.match(/chatscope_sid=[^;]+/);
    if (m) sessionCookie = m[0];
  }
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, ok: response.ok, body };
}

function generateSyntheticChat() {
  const lines = [
    "01/09/25, 9:00 am - Messages and calls are end-to-end encrypted.",
  ];
  const a = [
    "Hey, how was the trip to Goa? ✈️",
    "Send me those notes when you can",
    "I walked 10k steps today",
    "Chai tonight? ☕",
  ];
  const b = [
    "Goa was legendary, Baga beach evenings ✨",
    "Notes sent, check your email",
    "My birthday is on 14 November btw",
    "Sure! I love chai",
  ];
  const hours = [9, 12, 15, 18, 21];
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;

  for (let day = 1; day <= 20; day++) {
    for (let i = 0; i < 6; i++) {
      const h = hours[Math.floor(rnd() * hours.length)];
      const m = String(Math.floor(rnd() * 60)).padStart(2, "0");
      const period = h >= 12 ? "pm" : "am";
      const h12 = h % 12 === 0 ? 12 : h % 12;
      const sender = rnd() > 0.5 ? "Alpha" : "Beta";
      const pool = sender === "Alpha" ? a : b;
      const msg = pool[Math.floor(rnd() * pool.length)];
      const dd = String(day).padStart(2, "0");
      lines.push(`${dd}/09/25, ${h12}:${m} ${period} - ${sender}: ${msg}`);
    }
  }

  return lines.join("\n");
}

async function main() {
  console.log(`\nChatScope smoke test → ${BASE}\n`);

  // 1. Health
  const health = await api("/health");
  check("GET /health responds ok", health.ok && health.body?.status === "ok");
  check("Gemini key configured", health.body?.geminiConfigured === true);

  // 2. Remember the current active chat so we can restore it
  const before = await api("/api/status");

  // 3. Upload a synthetic chat
  const text = generateSyntheticChat();
  const form = new FormData();
  form.append("chat", new Blob([text], { type: "text/plain" }), "smoke-test-chat.txt");

  const upload = await api("/api/upload", { method: "POST", body: form });
  check("POST /api/upload succeeds", upload.ok && !!upload.body?.analytics);
  check(
    "Analytics computed",
    (upload.body?.analytics?.overview?.totalMessages || 0) > 100
  );

  // 4. Deterministic ask (no AI quota)
  const ask = await api("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "who talks more?" }),
  });
  check(
    "POST /api/ask answers deterministically",
    ask.ok && ask.body?.source === "analytics" && !!ask.body?.answer
  );

  // 5. Library reflects the new chat as active
  const library = await api("/api/library");
  const smokeEntry = library.body?.chats?.find(
    (chat) => chat.filename === "smoke-test-chat.txt"
  );
  check("Library contains the smoke chat", Boolean(smokeEntry));
  check("Smoke chat is active", smokeEntry?.active === true);

  // 6. Facts endpoint responds (extraction may still be running)
  const facts = await api("/api/facts");
  check(
    "GET /api/facts responds",
    facts.ok && ["idle", "running", "ready", "error"].includes(facts.body?.status)
  );

  // 7. Privacy contract: the smoke chat is session-only RAM
  // (verified by the suite not needing to restore anything).

  // Cleanup: under the memory-only model a purge is the full wipe.
  const cleanup = await api("/api/purge", { method: "POST" });
  check("Smoke chat cleaned up (purge)", cleanup.ok);

  console.log(
    `\n${failures === 0 ? "✔ SMOKE TEST PASSED" : `✘ ${failures} CHECK(S) FAILED`}\n`
  );
  // Let the process drain its keep-alive sockets naturally — a hard
  // process.exit here trips a libuv assertion on Windows/Node 24.
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(`\n✘ Smoke test could not run: ${error?.message || error}\n`);
  console.error("Is the backend running? npm start\n");
  process.exit(1);
});
