/**
 * Settings store unit tests — defaults, validation, persistence,
 * ask-persona validation. Run: node tests/settings.test.js
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

// Point dataDir at a scratch dir BEFORE requiring the modules
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), "chatscope-settings-"));
process.env.CHATSCOPE_DATA_DIR = SCRATCH;

// dataDir resolves DATA_DIR at require time; patch via require cache
const dataDir = require("../dataDir");
const settingsStore = require("../settings");

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

const defaults = settingsStore.getSettings();

check("default aiEnabled is true", defaults.aiEnabled === true);
check("default redactPII is true", defaults.redactPII === true);
check("default aliasMode is false", defaults.aliasMode === false);
check("default evidenceScope is 30", defaults.evidenceScope === 30);

// Valid updates
const updated = settingsStore.updateSettings({
  aiEnabled: false,
  evidenceScope: 50,
});
check("updateSettings applies aiEnabled", updated.aiEnabled === false);
check("updateSettings applies evidenceScope", updated.evidenceScope === 50);

// Invalid values fall back to defaults
const coerced = settingsStore.updateSettings({
  aiEnabled: "yes", // wrong type → ignored
  evidenceScope: 25, // not in [10, 30, 50] → ignored
});
check("invalid aiEnabled ignored", coerced.aiEnabled === false);
check("invalid evidenceScope ignored", coerced.evidenceScope === 50);

// Redact + alias toggles
const toggles = settingsStore.updateSettings({ redactPII: false, aliasMode: true });
check("redactPII toggle works", toggles.redactPII === false);
check("aliasMode toggle works", toggles.aliasMode === true);

// Persistence: a fresh require sees the same file — simulate by
// reading the settings file directly
const raw = JSON.parse(
  fs.readFileSync(path.join(dataDir.DATA_DIR, "settings.json"), "utf-8")
);
check("settings persisted to disk", raw.evidenceScope === 50);
check("persisted file has no PIN hash", !("appLockPinHash" in raw));

// Ask personas (Phase 6): validation + persistence
check("default askPersona is default", defaults.askPersona === "default");
const personaUpdate = settingsStore.updateSettings({ askPersona: "roast" });
check("askPersona accepts a valid preset", personaUpdate.askPersona === "roast");
const badPersona = settingsStore.updateSettings({ askPersona: "not-a-persona" });
check("askPersona rejects unknown ids", badPersona.askPersona === "roast");
const switchPersona = settingsStore.updateSettings({ askPersona: "detective" });
check("askPersona can switch presets", switchPersona.askPersona === "detective");

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);

fs.rmSync(SCRATCH, { recursive: true, force: true });

if (failed > 0) {
  process.exit(1);
}
