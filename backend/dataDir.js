// ------------------------------------------------
// Runtime data directory (backend/data) + USER SCOPING
// ------------------------------------------------
// All persisted runtime state (settings.json, library.json,
// embeddings/, etc.) lives in one folder. With accounts enabled,
// each signed-in user gets a private folder under data/users/<id>/.
//
// The active scope is tracked with AsyncLocalStorage so every module
// resolves paths PER REQUEST without threading a parameter through
// the entire codebase. The default scope (no user) is backend/data
// — the exact single-user layout this app has always used.
// ------------------------------------------------

const fs = require("fs");
const path = require("path");
const { AsyncLocalStorage } = require("async_hooks");

// Tests (and only tests) redirect the data directory via env var.
const ROOT_DATA_DIR =
  process.env.CHATSCOPE_DATA_DIR || path.join(__dirname, "data");

const USERS_DIR = path.join(ROOT_DATA_DIR, "users");

const scopeStorage = new AsyncLocalStorage();

/** The per-request (or per-user) data directory. */
function getDataDir() {
  const scoped = scopeStorage.getStore();
  if (scoped && typeof scoped === "string") {
    return scoped;
  }
  return ROOT_DATA_DIR;
}

// Legacy named export: still the ROOT dir for modules that only
// need "where is data/" (user registry lives there regardless).
const DATA_DIR = ROOT_DATA_DIR;

function ensureDataDir() {
  const dir = getDataDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function resolveDataFile(fileName) {
  ensureDataDir();

  const currentPath = path.join(getDataDir(), fileName);
  const legacyPath = path.join(__dirname, fileName);

  try {
    // Legacy migration only applies to the ROOT scope — user folders
    // never had legacy files at the backend root.
    if (getDataDir() === ROOT_DATA_DIR) {
      if (!fs.existsSync(currentPath) && fs.existsSync(legacyPath)) {
        fs.renameSync(legacyPath, currentPath);
        console.log(`Migrated ${fileName} into the data directory.`);
      }
    }
  } catch (error) {
    console.warn(`Could not migrate ${fileName}:`, error?.message || error);
  }

  return currentPath;
}

// ------------------------------------------------
// USER SCOPING (accounts)
// ------------------------------------------------

/** Run `fn` with every dataDir call resolved inside `dir`. */
function runInDataDirScope(dir, fn) {
  return scopeStorage.run(dir, fn);
}

/** Express middleware helper: attach a scoped dir to the request chain. */
function dataDirScopeMiddleware(dirSupplier, req, res, next) {
  const dir = typeof dirSupplier === "function" ? dirSupplier(req) : dirSupplier;
  scopeStorage.run(dir, () => next());
}

/** Create (if needed) and return a user's private data directory. */
function ensureUserDir(userId) {
  if (!/^[a-z]+_[a-f0-9]{4,64}$/.test(String(userId || ""))) {
    throw new Error("Invalid user id.");
  }
  const dir = path.join(USERS_DIR, userId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

module.exports = {
  DATA_DIR,
  ROOT_DATA_DIR,
  USERS_DIR,
  getDataDir,
  ensureDataDir,
  resolveDataFile,
  runInDataDirScope,
  dataDirScopeMiddleware,
  ensureUserDir,
};
