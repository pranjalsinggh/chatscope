// ------------------------------------------------
// USER CONTEXT — anonymous per-browser session workspaces
// ------------------------------------------------
// PRIVACY MODEL (no accounts, no disk):
//   • Every browser gets a random session id (cookie, no personal
//     data) and its own in-memory workspace.
//   • Two devices on the same server see completely different chats —
//     neither can read the other's.
//   • Workspaces live in RAM only: gone when the server stops, gone
//     after the idle TTL, evicted under pressure. Nothing is ever
//     written to disk.
// ------------------------------------------------

const crypto = require("crypto");
const { AsyncLocalStorage } = require("async_hooks");
const { runInDataDirScope, ROOT_DATA_DIR } = require("./dataDir");
const settingsStore = require("./settings");
const embeddings = require("./embeddings");
const retrieval = require("./retrieval");

const ctxStorage = new AsyncLocalStorage();

const SESSION_COOKIE = "chatscope_sid";
const SESSION_IDLE_TTL_MS = 2 * 60 * 60 * 1000; // 2h idle → auto-wiped
const MAX_SESSIONS = 25; // LRU cap; evicted sessions are wiped

const SESSIONS = new Map(); // sessionId -> { state, chats, lastSeen }

// Drop every per-session side cache (settings snapshot, embedding
// vectors) — called on LRU eviction and idle expiry so nothing outlives
// the session it belongs to.
function disposeSession(sessionId) {
  settingsStore.disposeSession(sessionId);
  embeddings.disposeEmbeddingScope(`session-${sessionId}`);
  retrieval.disposeRetrievalMemory(`session-${sessionId}`);
}

function freshState() {
  return {
    currentChatId: null,
    currentMessages: [],
    currentAnalytics: null,
    currentChatInfo: {
      filename: null,
      uploadedAt: null,
      messageCount: 0,
    },
    factsResult: null,
    factsStatus: "idle",
    factsError: null,
    library: { chats: [], activeId: null },
    answerCache: new Map(),
  };
}

function createSession() {
  const sessionId = crypto.randomBytes(16).toString("hex");
  const workspace = {
    state: freshState(),
    chats: new Map(), // chatId -> ENCRYPTED payload, this session only
    // Random 256-bit key born with the session, dies with it. Used to
    // encrypt stored chat payloads at rest in memory.
    key: crypto.randomBytes(32).toString("hex"),
    lastSeen: Date.now(),
  };
  SESSIONS.set(sessionId, workspace);

  // LRU eviction: the oldest session is wiped entirely
  while (SESSIONS.size > MAX_SESSIONS) {
    const oldest = SESSIONS.keys().next().value;
    SESSIONS.delete(oldest);
    disposeSession(oldest);
  }
  return { sessionId, workspace };
}

function getSessionWorkspace(sessionId) {
  const existing = sessionId && SESSIONS.get(sessionId);
  if (existing) {
    existing.lastSeen = Date.now();
    // LRU refresh
    SESSIONS.delete(sessionId);
    SESSIONS.set(sessionId, existing);
    return { sessionId, workspace: existing, fresh: false };
  }
  return createSession();
}

// Idle sweep: privacy auto-wipe for abandoned browsers
setInterval(() => {
  const now = Date.now();
  for (const [id, ws] of SESSIONS) {
    if (now - ws.lastSeen > SESSION_IDLE_TTL_MS) {
      SESSIONS.delete(id);
      disposeSession(id);
    }
  }
}, 10 * 60 * 1000).unref();

function userContextMiddleware(req, res, next) {
  const { sessionId, workspace, fresh } = getSessionWorkspace(
    req.cookies?.[SESSION_COOKIE]
  );

  // (Re)issue the anonymous session cookie. It carries no personal
  // data — just a random pointer to this browser's RAM workspace.
  if (fresh || req.cookies?.[SESSION_COOKIE] !== sessionId) {
    res.cookie(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      // Deployments are https — never let the session id travel
      // unencrypted there. Localhost http still works (browsers exempt
      // localhost from the secure restriction for testing).
      secure: process.env.NODE_ENV === "production",
    });
  }

  const ctx = {
    sessionId,
    sessionKey: workspace.key,
    state: workspace.state,
    chats: workspace.chats,
    userId: null,
    user: null,
  };

  ctxStorage.run(ctx, () =>
    runInDataDirScope(ROOT_DATA_DIR, () =>
      settingsStore.runInSettingsContext(`session:${sessionId}`, () => next())
    )
  );
}

/** The active request's context. */
function getContext() {
  return (
    ctxStorage.getStore() || {
      sessionId: "anonymous",
      state: createSession().workspace.state,
      chats: new Map(),
      userId: null,
    }
  );
}

function getState() {
  return getContext().state;
}

/** This browser's session-only chat store (chatId → payload). */
function sessionChats() {
  return getContext().chats;
}

/** This browser's session id (for embedding-cache key separation). */
function getSessionId() {
  return getContext().sessionId;
}

function getUser() {
  return null;
}

function getUserId() {
  return null;
}

function isGuest() {
  return true;
}

/** Reset THIS browser's in-memory state (purge). */
function resetCurrentState() {
  const ctx = getContext();
  const fresh = freshState();
  Object.assign(ctx.state, fresh);
  ctx.chats.clear();
  return ctx.state;
}

// Retained for call-site compatibility.
function dropUserState() {}
function persistUserStateIfAny() {}

/** Stable per-session key used to isolate in-RAM embedding caches. */
function getEmbeddingScope() {
  return `session-${getContext().sessionId}`;
}

/** This session's AES-256 key (hex) for encrypting stored chats. */
function getSessionKey() {
  const ctx = getContext();
  return ctx.sessionKey || null;
}

module.exports = {
  getEmbeddingScope,
  userContextMiddleware,
  getContext,
  getState,
  getUser,
  getUserId,
  getSessionId,
  getSessionKey,
  sessionChats,
  isGuest,
  dropUserState,
  persistUserStateIfAny,
  freshState,
  resetCurrentState,
  SESSION_COOKIE,
  SESSION_IDLE_TTL_MS,
};
