// ------------------------------------------------
// USER SETTINGS (settings.json — one per data context)
// ------------------------------------------------
// Single source of truth for every user preference. Guests use the
// root data folder exactly as before; signed-in users each get their
// own settings.json inside data/users/<id>/. The active settings
// object is tracked with AsyncLocalStorage so every call resolves
// PER REQUEST without threading parameters — same pattern as
// dataDir's scope.
//
// Graceful degradation is guaranteed: any key missing from the file
// falls back to its documented default, so a partial/corrupt file
// never breaks the app.
// ------------------------------------------------

const fs = require("fs");
const crypto = require("crypto");
const { resolveDataFile } = require("./dataDir");
const { isAskPersona } = require("./askPersonas");

// Resolved lazily per call so each context reads/writes its OWN
// settings.json.
function settingsFile() {
  return resolveDataFile("settings.json");
}

const DEFAULT_SETTINGS = {
  aiEnabled: true,
  redactPII: true,
  aliasMode: false,
  evidenceScope: 30,
  displayName: null,
  avatarUrl: null,
  accentTone: "purple",
  askPersona: "default",
};

// Coercion rules: what a "valid" value looks like per key.
// Anything invalid silently falls back to the default.
const SETTERS = {
  aiEnabled: (value) => (typeof value === "boolean" ? value : undefined),
  redactPII: (value) => (typeof value === "boolean" ? value : undefined),
  aliasMode: (value) => (typeof value === "boolean" ? value : undefined),
  evidenceScope: (value) =>
    [10, 30, 50].includes(Number(value)) ? Number(value) : undefined,
  displayName: (value) =>
    typeof value === "string" && value.trim().length >= 1 && value.length <= 60
      ? value.trim()
      : value === null
        ? null
        : undefined,
  avatarUrl: (value) => {
    if (value === null) return null;
    if (
      typeof value === "string" &&
      /^https:\/\//.test(value) &&
      value.length <= 500
    ) {
      return value;
    }
    return undefined;
  },
  accentTone: (value) =>
    ["purple", "blue", "pink", "emerald"].includes(value) ? value : undefined,
  askPersona: (value) => (isAskPersona(value) ? value : undefined),
};

// ------------------------------------------------
// PER-CONTEXT SETTINGS OBJECTS
// ------------------------------------------------
// The GUEST context keeps a single module-level object (loaded once at
// boot — identical to the original behavior). Signed-in user contexts
// load their own file on first touch.

const settingsStorage = new (require("async_hooks").AsyncLocalStorage)();

// Map<contextKey, settings object>. Key: "guest" or "user:<userId>"
const contextSettings = new Map();
const guestKey = "guest";

function currentKey() {
  const scoped = settingsStorage.getStore();
  return scoped || guestKey;
}

/** Run fn with a specific settings context bound. */
function runInSettingsContext(key, fn) {
  return settingsStorage.run(key, fn);
}

// PRIVACY MODEL: session contexts ("session:<id>") are in-memory only —
// they never read or write settings.json, so one visitor's preferences
// (AI toggle, persona, accent) can never affect another.
const SESSION_CONTEXT_PREFIX = "session:";

function isSessionContext(key) {
  return typeof key === "string" && key.startsWith(SESSION_CONTEXT_PREFIX);
}

function loadSettingsFor(key) {
  const base = { ...DEFAULT_SETTINGS };

  if (isSessionContext(key)) {
    return base;
  }

  try {
    return settingsStorage.run(key, () => {
      const file = settingsFile();
      if (!fs.existsSync(file)) return base;

      const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
      if (!parsed || typeof parsed !== "object") return base;

      for (const [settingsKey, defaultValue] of Object.entries(
        DEFAULT_SETTINGS
      )) {
        if (!(settingsKey in parsed)) continue;

        const valid = SETTERS[settingsKey]
          ? SETTERS[settingsKey](parsed[settingsKey])
          : undefined;
        base[settingsKey] = valid === undefined ? defaultValue : valid;
      }

      return base;
    });
  } catch (error) {
    console.warn(
      "Could not read settings.json — using defaults:",
      error?.message || error
    );
    return { ...DEFAULT_SETTINGS };
  }
}

function getSettingsObject() {
  const key = currentKey();

  if (!contextSettings.has(key)) {
    contextSettings.set(key, loadSettingsFor(key));
  }

  return contextSettings.get(key);
}

/**
 * Drop the cached settings of one session context ("session:<id>") —
 * called when the session is evicted or idles out, so the cache cannot
 * grow unboundedly across a long server uptime.
 */
function disposeSession(sessionId) {
  contextSettings.delete(`session:${sessionId}`);
}

function saveSettings() {
  try {
    const key = currentKey();
    if (isSessionContext(key)) {
      // In-memory only: nothing to persist for a private session.
      return;
    }
    settingsStorage.run(key, () => {
      const temporaryFile = `${settingsFile()}.tmp`;
      fs.writeFileSync(
        temporaryFile,
        JSON.stringify(contextSettings.get(key) || DEFAULT_SETTINGS, null, 2),
        "utf-8"
      );
      fs.renameSync(temporaryFile, settingsFile());
    });
  } catch (error) {
    console.warn(
      "Could not save settings.json:",
      error?.message || error
    );
  }
}

// The per-context "settings" name used across server.js
const settingsProxy = new Proxy(
  {},
  {
    get(_t, prop) {
      return getSettingsObject()[prop];
    },
    set(_t, prop, value) {
      getSettingsObject()[prop] = value;
      return true;
    },
  }
);

// server.js's settingsStore usage maps to this proxy + helpers.
const settingsStore = {
  DEFAULT_SETTINGS,
  getSettings: () => ({ ...getSettingsObject() }),
  getSetting: (key) => getSettingsObject()[key],
  updateSettings(patch) {
    const obj = getSettingsObject();

    if (!patch || typeof patch !== "object") return { ...obj };

    for (const [key, value] of Object.entries(patch)) {
      // Object.hasOwn: "in" walks the prototype chain, so keys like
      // "__proto__" from a malicious body would slip through and crash.
      if (!Object.hasOwn(DEFAULT_SETTINGS, key)) continue;
      if (!Object.hasOwn(SETTERS, key)) continue;
      const valid = SETTERS[key](value);
      if (valid !== undefined) {
        obj[key] = valid;
      }
    }

    saveSettings();
    return { ...obj };
  },
  // The proxy: reads/writes resolve to the active context's object
  settings: settingsProxy,
  settingsFile,
  runInSettingsContext,
  disposeSession,
};

module.exports = settingsStore;
