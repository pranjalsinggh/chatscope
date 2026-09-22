// ------------------------------------------------
// PRIVACY CONTRACT TESTS — the ephemerality guarantee
// ------------------------------------------------
// ChatScope's promise: a visitor uploads a chat, analyzes it, leaves,
// and NOTHING chat-related was ever written to disk. Also: two
// browsers on the same server must see completely different
// workspaces (per-device isolation, no accounts).
// ------------------------------------------------
const fs = require("fs");
const path = require("path");
const os = require("os");

// Isolated scratch data dir BEFORE requiring the server
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), "chatscope-privacy-"));
process.env.CHATSCOPE_DATA_DIR = SCRATCH;
// The tests never need AI features; skip the production fail-fast on a
// missing GEMINI_API_KEY so CI (which has no keys) can boot the server.
process.env.ALLOW_ANALYTICS_ONLY = "1";

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

const chatText = [
  "18/07/25, 22:12 - Pranjal: hello there my friend",
  "18/07/25, 22:13 - Aditi: hey! how are you doing today",
  "18/07/25, 22:14 - Pranjal: pretty good, working on my project",
].join("\n");

const snapshotDataDir = () => {
  const out = {};
  if (fs.existsSync(SCRATCH)) {
    for (const entry of fs.readdirSync(SCRATCH)) {
      const p = path.join(SCRATCH, entry);
      out[entry] = fs.statSync(p).isDirectory()
        ? fs.readdirSync(p).join(",")
        : "file";
    }
  }
  return out;
};

const beforeUpload = snapshotDataDir();

// ------------------------------------------------
// Boot the real server in-process
// ------------------------------------------------

const server = require("../server");

const PORT = 5000;
const BASE = `http://127.0.0.1:${PORT}`;

/**
 * A tiny browser: holds its own anonymous session cookie so all of
 * its requests belong to one isolated workspace.
 */
function makeBrowser() {
  let cookie = "";
  return async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (cookie) headers["Cookie"] = cookie;
    const res = await fetch(BASE + path, { ...options, headers });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      const m = setCookie.match(/chatscope_sid=[^;]+/);
      if (m) cookie = m[0];
    }
    return res;
  };
}

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

(async () => {
  const up = await waitForServer();
  check("server boots", up);

  if (!up) {
    console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
    process.exit(1);
  }

  const browserA = makeBrowser(); // the "PC"
  const browserB = makeBrowser(); // the "other device"

  // ------------------------------------------------
  // No sign-in surface exists anymore
  // ------------------------------------------------

  const session = await browserA("/api/auth/session");
  check("auth endpoints removed (session 404)", session.status === 404);

  const google = await browserA("/api/auth/google", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  check("auth endpoints removed (google 404)", google.status === 404);

  // ------------------------------------------------
  // Device A: full analysis session as an anonymous guest
  // ------------------------------------------------

  const form = new FormData();
  form.append(
    "chat",
    new Blob([chatText], { type: "text/plain" }),
    "privacy-test.txt"
  );

  const upload = await browserA("/api/upload", { method: "POST", body: form });
  const uploadBody = await upload.json();
  check("guest upload succeeds with no credentials", upload.status === 200);
  check("analytics computed in-memory", uploadBody?.analytics?.overview?.totalMessages === 3);

  const statusA = await browserA("/api/status").then((r) => r.json());
  check("device A sees its own chat", statusA.chatLoaded === true);

  const ask = await browserA("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "who talks more?" }),
  }).then((r) => r.json());
  check("deterministic ask works", ask?.source === "analytics" && !!ask?.answer);

  const libraryA = await browserA("/api/library").then((r) => r.json());
  check("session library lists the chat (device A)", libraryA?.chats?.length === 1);

  // ------------------------------------------------
  // THE ISOLATION CONTRACT: device B sees NOTHING of device A
  // ------------------------------------------------

  const statusB = await browserB("/api/status").then((r) => r.json());
  check(
    "CROSS-DEVICE: device B sees no active chat",
    statusB.chatLoaded === false && statusB.analytics === null
  );

  const libraryB = await browserB("/api/library").then((r) => r.json());
  check(
    "CROSS-DEVICE: device B sees an empty library",
    Array.isArray(libraryB?.chats) && libraryB.chats.length === 0
  );

  const messagesB = await browserB("/api/messages");
  check("CROSS-DEVICE: device B cannot read device A's messages", messagesB.status === 400);

  // Device A still sees everything after B poked around
  const statusA2 = await browserA("/api/status").then((r) => r.json());
  check("device A unaffected by device B", statusA2.chatLoaded === true);

  // ------------------------------------------------
  // THE DISK CONTRACT: nothing chat-related touched the disk
  // ------------------------------------------------

  const duringSession = snapshotDataDir();
  const chatLikeDirs = Object.keys(duringSession).filter((entry) =>
    /^(chats|embeddings|users)$/i.test(entry)
  );
  check(
    "no chats/embeddings/users directories exist during a session",
    chatLikeDirs.length === 0
  );
  check(
    "no library.json or share_tokens.json written during a session",
    !duringSession["library.json"] && !duringSession["share_tokens.json"]
  );

  // ------------------------------------------------
  // Purge: wipes device A's workspace instantly
  // ------------------------------------------------

  const purge = await browserA("/api/purge", { method: "POST" });
  check("purge succeeds", purge.status === 200);

  const afterPurge = await browserA("/api/status").then((r) => r.json());
  check("after purge: no active chat", afterPurge.chatLoaded === false);
  check("after purge: analytics gone", afterPurge.analytics === null);

  const afterPurgeData = snapshotDataDir();
  check(
    "after purge: data dir has no chat-related entries",
    Object.keys(afterPurgeData).every((k) =>
      ["settings.json", "retrieval_memory.json", "wall.json", "ai_log.json"].includes(k)
    )
  );

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);

  // Graceful teardown: hard process.exit() with open handles trips a
  // Windows libuv assertion (UV_HANDLE_CLOSING). Close the server, drop
  // every connection (server side AND the fetch pool), set the exit
  // code, and let the event loop drain to a natural, clean exit.
  server.closeAllConnections?.();
  server.close(() => {
    process.exitCode = failed > 0 ? 1 : 0;
  });
})();
