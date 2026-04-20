function createDefaultSummary() {
  return {
    dbAvailable: false,
    cacheAvailable: false,
    cacheFresh: false,
    validationSource: "none",
    gateSatisfied: false,
    compactGateHex: null,
    lastValidatedAt: null,
    expiresAt: null,
    storeError: null,
  };
}

function normalizeString(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
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

function parseTimestamp(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function cloneSummary(summary) {
  return {
    dbAvailable: Boolean(summary?.dbAvailable),
    cacheAvailable: Boolean(summary?.cacheAvailable),
    cacheFresh: Boolean(summary?.cacheFresh),
    validationSource: normalizeString(summary?.validationSource) || "none",
    gateSatisfied: Boolean(summary?.gateSatisfied),
    compactGateHex: normalizeString(summary?.compactGateHex),
    lastValidatedAt: normalizeString(summary?.lastValidatedAt),
    expiresAt: normalizeString(summary?.expiresAt),
    storeError: normalizeString(summary?.storeError),
  };
}

function normalizeCacheRecord(record = null) {
  if (!record || typeof record !== "object") {
    return null;
  }
  return {
    cacheFingerprint: normalizeString(record.cacheFingerprint),
    hostBindingDigest: normalizeString(record.hostBindingDigest),
    validationSource: normalizeString(record.validationSource) || "none",
    gateSatisfied: record.gateSatisfied === true || record.gateSatisfied === 1 || record.gateSatisfied === "1",
    compactGateHex: normalizeString(record.compactGateHex),
    lastValidatedAt: normalizeString(record.lastValidatedAt),
    expiresAt: normalizeString(record.expiresAt),
  };
}

export function createZoteroEntitlementCacheStore({
  zotero = null,
  addonRef,
  logger = null,
} = {}) {
  const tableName = `${sanitizeIdentifier(addonRef, "cleanroom")}_package_control_cache`;
  const quotedTableName = quoteIdentifier(tableName);
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
        cacheFingerprint TEXT PRIMARY KEY NOT NULL,
        hostBindingDigest TEXT,
        validationSource TEXT NOT NULL,
        gateSatisfied INTEGER NOT NULL,
        compactGateHex TEXT,
        lastValidatedAt TEXT NOT NULL,
        expiresAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )`,
      [],
    );
  }

  async function withDB(work) {
    const db = getDB();
    if (typeof db.executeTransaction === "function") {
      return db.executeTransaction(async () => work(db));
    }
    return work(db);
  }

  async function readRecord(db, cacheFingerprint) {
    const payload = await db.valueQueryAsync(
      `SELECT hostBindingDigest || CHAR(31) || validationSource || CHAR(31) || gateSatisfied || CHAR(31) || IFNULL(compactGateHex, '') || CHAR(31) || lastValidatedAt || CHAR(31) || expiresAt FROM ${quotedTableName} WHERE cacheFingerprint=? LIMIT 1`,
      [cacheFingerprint],
    );
    const serialized = normalizeString(payload);
    if (!serialized) {
      return null;
    }
    const parts = serialized.split(String.fromCharCode(31));
    return normalizeCacheRecord({
      cacheFingerprint,
      hostBindingDigest: parts[0],
      validationSource: parts[1],
      gateSatisfied: parts[2],
      compactGateHex: parts[3],
      lastValidatedAt: parts[4],
      expiresAt: parts[5],
    });
  }

  function updateSummary(patch = {}) {
    summary = cloneSummary({
      ...summary,
      ...patch,
    });
    if (logger && typeof logger.debug === "function") {
      logger.debug("packageProtection.entitlementCache.updated", {
        dbAvailable: summary.dbAvailable,
        cacheAvailable: summary.cacheAvailable,
        cacheFresh: summary.cacheFresh,
        validationSource: summary.validationSource,
        gateSatisfied: summary.gateSatisfied,
        storeError: summary.storeError,
      });
    }
    return cloneSummary(summary);
  }

  async function readFresh(cacheFingerprint, now = Date.now()) {
    const fingerprint = normalizeString(cacheFingerprint);
    if (!fingerprint) {
      return null;
    }

    try {
      return await withDB(async (db) => {
        await ensureTable(db);
        const record = await readRecord(db, fingerprint);
        const expiresAtMs = parseTimestamp(record?.expiresAt);
        const fresh = Boolean(record && expiresAtMs !== null && expiresAtMs > Number(now || Date.now()));
        updateSummary({
          dbAvailable: true,
          cacheAvailable: Boolean(record),
          cacheFresh: fresh,
          validationSource: fresh ? "cache" : "none",
          gateSatisfied: fresh ? record.gateSatisfied : false,
          compactGateHex: fresh ? record.compactGateHex : null,
          lastValidatedAt: record?.lastValidatedAt || null,
          expiresAt: record?.expiresAt || null,
          storeError: null,
        });
        return fresh ? record : null;
      });
    } catch (error) {
      updateSummary({
        dbAvailable: false,
        cacheAvailable: false,
        cacheFresh: false,
        validationSource: "none",
        gateSatisfied: false,
        compactGateHex: null,
        storeError: toErrorMessage(error),
      });
      return null;
    }
  }

  async function write(record = {}) {
    const normalized = normalizeCacheRecord(record);
    if (!normalized?.cacheFingerprint || !normalized.expiresAt || !normalized.lastValidatedAt) {
      updateSummary({
        storeError: "invalid-cache-record",
      });
      return false;
    }

    try {
      await withDB(async (db) => {
        await ensureTable(db);
        await db.queryAsync(
          `INSERT OR REPLACE INTO ${quotedTableName} (cacheFingerprint, hostBindingDigest, validationSource, gateSatisfied, compactGateHex, lastValidatedAt, expiresAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            normalized.cacheFingerprint,
            normalized.hostBindingDigest,
            normalized.validationSource,
            normalized.gateSatisfied ? 1 : 0,
            normalized.compactGateHex,
            normalized.lastValidatedAt,
            normalized.expiresAt,
            new Date().toISOString(),
          ],
        );
      });
      updateSummary({
        dbAvailable: true,
        cacheAvailable: true,
        cacheFresh: true,
        validationSource: normalized.validationSource,
        gateSatisfied: normalized.gateSatisfied,
        compactGateHex: normalized.compactGateHex,
        lastValidatedAt: normalized.lastValidatedAt,
        expiresAt: normalized.expiresAt,
        storeError: null,
      });
      return true;
    } catch (error) {
      updateSummary({
        dbAvailable: false,
        cacheAvailable: false,
        cacheFresh: false,
        validationSource: "none",
        gateSatisfied: false,
        compactGateHex: null,
        storeError: toErrorMessage(error),
      });
      return false;
    }
  }

  function getSummary() {
    return cloneSummary(summary);
  }

  return {
    readFresh,
    write,
    getSummary,
  };
}
