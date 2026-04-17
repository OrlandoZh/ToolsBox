function createDefaultSummary() {
  return {
    dbAvailable: false,
    noncePresent: false,
    nonceSource: "unavailable",
    nonceHash: null,
    storeError: null,
  };
}

function toErrorMessage(error) {
  if (!error) {
    return "unknown";
  }
  if (typeof error === "string") {
    return error;
  }
  return String(error.message || error);
}

function normalizeString(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function getSubtleCrypto(globalScope) {
  if (globalScope?.crypto?.subtle) {
    return globalScope.crypto.subtle;
  }
  try {
    if (typeof crypto !== "undefined" && crypto?.subtle) {
      return crypto.subtle;
    }
  }
  catch {}
  return null;
}

function getCrypto(globalScope) {
  if (globalScope?.crypto) {
    return globalScope.crypto;
  }
  try {
    if (typeof crypto !== "undefined") {
      return crypto;
    }
  }
  catch {}
  return null;
}

function getTextEncoderCtor(globalScope) {
  if (typeof globalScope?.TextEncoder === "function") {
    return globalScope.TextEncoder;
  }
  try {
    if (typeof TextEncoder === "function") {
      return TextEncoder;
    }
  }
  catch {}
  return null;
}

function sanitizeIdentifier(input, fallback = "cleanroom") {
  const normalized = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
  const candidate = normalized || fallback;
  return /^[a-z_]/u.test(candidate) ? candidate : `a_${candidate}`;
}

function quoteIdentifier(identifier) {
  return `"${String(identifier || "").replace(/"/gu, "\"\"")}"`;
}

async function hashToken(value, { subtle, TextEncoderCtor }) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }
  if (!subtle) {
    throw new Error("crypto.subtle is unavailable");
  }
  if (typeof TextEncoderCtor !== "function") {
    throw new Error("TextEncoder is unavailable");
  }
  const bytes = new TextEncoderCtor().encode(normalized);
  const digestBuffer = await subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digestBuffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex.slice(0, 24)}`;
}

function createFallbackNonce() {
  return `fallback-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 18)}`;
}

function createRandomNonce(globalScope) {
  const runtimeCrypto = getCrypto(globalScope);
  if (runtimeCrypto && typeof runtimeCrypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    runtimeCrypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return createFallbackNonce();
}

function cloneSummary(summary) {
  return {
    dbAvailable: Boolean(summary?.dbAvailable),
    noncePresent: Boolean(summary?.noncePresent),
    nonceSource: normalizeString(summary?.nonceSource) || "unavailable",
    nonceHash: normalizeString(summary?.nonceHash),
    storeError: normalizeString(summary?.storeError),
  };
}

export function createZoteroPluginNonceStore({
  globalScope,
  zotero = globalScope?.Zotero || null,
  addonRef,
  logger = null,
} = {}) {
  if (!globalScope || typeof globalScope !== "object") {
    throw new Error("globalScope is required");
  }

  const subtle = getSubtleCrypto(globalScope);
  const TextEncoderCtor = getTextEncoderCtor(globalScope);
  const tableName = `${sanitizeIdentifier(addonRef, "cleanroom")}_package_nonce`;
  const quotedTableName = quoteIdentifier(tableName);
  const nonceScope = "profile";
  let nonce = null;
  let summary = createDefaultSummary();

  function getDB() {
    const db = zotero?.DB || null;
    if (!db || typeof db !== "object") {
      throw new Error("Zotero.DB is unavailable");
    }
    if (typeof db.queryAsync !== "function" || typeof db.valueQueryAsync !== "function") {
      throw new Error("Zotero.DB query APIs are unavailable");
    }
    return db;
  }

  async function ensureTable(db) {
    const exists = typeof db.tableExists === "function"
      ? await db.tableExists(tableName)
      : false;
    if (exists) {
      return;
    }
    await db.queryAsync(
      `CREATE TABLE IF NOT EXISTS ${quotedTableName} (
        scope TEXT PRIMARY KEY NOT NULL,
        nonce TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )`,
      [],
    );
  }

  async function readStoredNonce(db) {
    return normalizeString(
      await db.valueQueryAsync(
        `SELECT nonce FROM ${quotedTableName} WHERE scope=? LIMIT 1`,
        [nonceScope],
      ),
    );
  }

  async function writeNonce(db, value) {
    const now = new Date().toISOString();
    const existing = await readStoredNonce(db);
    if (existing) {
      await db.queryAsync(
        `UPDATE ${quotedTableName} SET nonce=?, updatedAt=? WHERE scope=?`,
        [value, now, nonceScope],
      );
      return;
    }
    await db.queryAsync(
      `INSERT INTO ${quotedTableName} (scope, nonce, createdAt, updatedAt) VALUES (?, ?, ?, ?)`,
      [nonceScope, value, now, now],
    );
  }

  async function withTransaction(work) {
    const db = getDB();
    if (typeof db.executeTransaction === "function") {
      return db.executeTransaction(async () => {
        return work(db);
      });
    }
    return work(db);
  }

  async function updateSummary({ dbAvailable, nonceValue, nonceSource, storeError }) {
    let nonceHash = null;
    try {
      nonceHash = nonceValue
        ? await hashToken(nonceValue, { subtle, TextEncoderCtor })
        : null;
    }
    catch (error) {
      storeError = storeError || `hash:${toErrorMessage(error)}`;
    }

    summary = cloneSummary({
      dbAvailable,
      noncePresent: Boolean(nonceValue),
      nonceSource: nonceSource || (nonceValue ? "existing" : "unavailable"),
      nonceHash,
      storeError,
    });

    if (logger && typeof logger.debug === "function") {
      logger.debug("packageProtection.hostNonce.updated", {
        dbAvailable: summary.dbAvailable,
        noncePresent: summary.noncePresent,
        nonceSource: summary.nonceSource,
        storeError: summary.storeError,
      });
    }

    return cloneSummary(summary);
  }

  async function getOrCreateNonce() {
    try {
      const value = await withTransaction(async (db) => {
        await ensureTable(db);
        const existing = await readStoredNonce(db);
        if (existing) {
          return {
            nonce: existing,
            source: "existing",
          };
        }
        const created = createRandomNonce(globalScope);
        await writeNonce(db, created);
        return {
          nonce: created,
          source: "created",
        };
      });

      nonce = value.nonce;
      await updateSummary({
        dbAvailable: true,
        nonceValue: nonce,
        nonceSource: value.source,
        storeError: null,
      });
      return nonce;
    }
    catch (error) {
      nonce = null;
      await updateSummary({
        dbAvailable: false,
        nonceValue: null,
        nonceSource: "unavailable",
        storeError: toErrorMessage(error),
      });
      return null;
    }
  }

  async function resetNonce() {
    try {
      const nextNonce = createRandomNonce(globalScope);
      await withTransaction(async (db) => {
        await ensureTable(db);
        await writeNonce(db, nextNonce);
      });

      nonce = nextNonce;
      await updateSummary({
        dbAvailable: true,
        nonceValue: nonce,
        nonceSource: "reset",
        storeError: null,
      });
      return nonce;
    }
    catch (error) {
      nonce = null;
      await updateSummary({
        dbAvailable: false,
        nonceValue: null,
        nonceSource: "unavailable",
        storeError: toErrorMessage(error),
      });
      return null;
    }
  }

  async function init() {
    await getOrCreateNonce();
    return cloneSummary(summary);
  }

  function getSummary() {
    return cloneSummary(summary);
  }

  return {
    init,
    getOrCreateNonce,
    resetNonce,
    getSummary,
    getTableName() {
      return tableName;
    },
  };
}
