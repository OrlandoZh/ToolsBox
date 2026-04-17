function createDefaultSummary() {
  return {
    signalVersion: 1,
    available: false,
    profileHash: null,
    schemaBucket: null,
    zoteroVersionBucket: null,
    profileBasenameBucket: null,
    dataDirHash: null,
    collectionError: null,
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

function getChromeUtils(globalScope) {
  if (globalScope?.ChromeUtils) {
    return globalScope.ChromeUtils;
  }
  try {
    return ChromeUtils;
  }
  catch {
    return null;
  }
}

function getPathUtils(globalScope, chromeUtils) {
  if (globalScope?.PathUtils) {
    return globalScope.PathUtils;
  }
  try {
    if (typeof PathUtils !== "undefined") {
      return PathUtils;
    }
  }
  catch {}
  try {
    return chromeUtils?.importESModule?.("resource://gre/modules/PathUtils.sys.mjs")?.PathUtils || null;
  }
  catch {
    return null;
  }
}

function getIOUtils(globalScope, chromeUtils) {
  if (globalScope?.IOUtils) {
    return globalScope.IOUtils;
  }
  try {
    if (typeof IOUtils !== "undefined") {
      return IOUtils;
    }
  }
  catch {}
  try {
    return chromeUtils?.importESModule?.("resource://gre/modules/IOUtils.sys.mjs")?.IOUtils || null;
  }
  catch {
    return null;
  }
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

function getPathBasename(path) {
  const normalized = normalizeString(path);
  if (!normalized) {
    return null;
  }
  const segments = normalized.split(/[\\/]+/u).filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : null;
}

function normalizeProfileBasename(path) {
  const basename = normalizeString(getPathBasename(path));
  if (!basename) {
    return null;
  }
  const dotIndex = basename.indexOf(".");
  const token = dotIndex >= 0 && dotIndex < basename.length - 1
    ? basename.slice(dotIndex + 1)
    : basename;
  return normalizeString(token?.toLowerCase?.() || token);
}

function bucketInteger(value, size = 10) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }
  const lower = Math.floor(numeric / size) * size;
  const upper = lower + size - 1;
  return `${lower}-${upper}`;
}

function bucketZoteroVersion(version) {
  const normalized = normalizeString(version);
  if (!normalized) {
    return null;
  }
  const match = normalized.match(/(\d+)(?:\.(\d+))?/u);
  if (!match) {
    return normalized.toLowerCase();
  }
  return `${Number(match[1])}.x`;
}

async function resolveRealPath(path, { pathUtils, ioUtils }) {
  const normalized = normalizeString(path);
  if (!normalized) {
    return null;
  }

  try {
    if (pathUtils && typeof pathUtils.realpath === "function") {
      const resolved = await pathUtils.realpath(normalized);
      const finalPath = normalizeString(resolved);
      if (finalPath) {
        return finalPath;
      }
    }
  }
  catch {}

  try {
    if (ioUtils && typeof ioUtils.realPath === "function") {
      const resolved = await ioUtils.realPath(normalized);
      const finalPath = normalizeString(resolved);
      if (finalPath) {
        return finalPath;
      }
    }
  }
  catch {}

  return normalized;
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

async function resolveSchemaVersion(zotero) {
  if (!zotero || typeof zotero !== "object") {
    return null;
  }

  if (typeof zotero?.Schema?.getDBVersion === "function") {
    const result = await zotero.Schema.getDBVersion("userdata");
    const numeric = Number(result);
    return Number.isFinite(numeric) ? numeric : null;
  }

  const candidates = [
    zotero?.Schema?.dbSchemaVersion,
    zotero?.Schema?.schemaVersion,
    zotero?.Schema?.userdataVersion,
  ];
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }

  return null;
}

function cloneSummary(summary) {
  return {
    signalVersion: Number(summary?.signalVersion || 1),
    available: Boolean(summary?.available),
    profileHash: normalizeString(summary?.profileHash),
    schemaBucket: normalizeString(summary?.schemaBucket),
    zoteroVersionBucket: normalizeString(summary?.zoteroVersionBucket),
    profileBasenameBucket: normalizeString(summary?.profileBasenameBucket),
    dataDirHash: normalizeString(summary?.dataDirHash),
    collectionError: normalizeString(summary?.collectionError),
  };
}

export function createZoteroHostSignals({
  globalScope,
  zotero = globalScope?.Zotero || null,
  logger = null,
} = {}) {
  if (!globalScope || typeof globalScope !== "object") {
    throw new Error("globalScope is required");
  }

  const chromeUtils = getChromeUtils(globalScope);
  const pathUtils = getPathUtils(globalScope, chromeUtils);
  const ioUtils = getIOUtils(globalScope, chromeUtils);
  const subtle = getSubtleCrypto(globalScope);
  const TextEncoderCtor = getTextEncoderCtor(globalScope);
  let summary = createDefaultSummary();

  async function init() {
    const nextSummary = createDefaultSummary();
    const errors = [];

    try {
      const profileDir = normalizeString(zotero?.Profile?.dir);
      if (profileDir) {
        const canonicalProfileDir = await resolveRealPath(profileDir, {
          pathUtils,
          ioUtils,
        });
        nextSummary.profileHash = await hashToken(canonicalProfileDir, {
          subtle,
          TextEncoderCtor,
        });
        nextSummary.profileBasenameBucket = await hashToken(
          normalizeProfileBasename(canonicalProfileDir),
          {
            subtle,
            TextEncoderCtor,
          },
        );
      }
    }
    catch (error) {
      errors.push(`profile:${toErrorMessage(error)}`);
    }

    try {
      const dataDirectory = normalizeString(zotero?.DataDirectory?.dir);
      if (dataDirectory) {
        const canonicalDataDirectory = await resolveRealPath(dataDirectory, {
          pathUtils,
          ioUtils,
        });
        nextSummary.dataDirHash = await hashToken(canonicalDataDirectory, {
          subtle,
          TextEncoderCtor,
        });
      }
    }
    catch (error) {
      errors.push(`dataDir:${toErrorMessage(error)}`);
    }

    try {
      nextSummary.schemaBucket = bucketInteger(await resolveSchemaVersion(zotero));
    }
    catch (error) {
      errors.push(`schema:${toErrorMessage(error)}`);
    }

    try {
      nextSummary.zoteroVersionBucket = bucketZoteroVersion(zotero?.version);
    }
    catch (error) {
      errors.push(`version:${toErrorMessage(error)}`);
    }

    nextSummary.available = Boolean(
      nextSummary.profileHash
      || nextSummary.schemaBucket
      || nextSummary.zoteroVersionBucket
      || nextSummary.profileBasenameBucket
      || nextSummary.dataDirHash,
    );
    nextSummary.collectionError = errors.length > 0 ? errors.join(" | ") : null;
    summary = cloneSummary(nextSummary);

    if (logger && typeof logger.debug === "function") {
      logger.debug("packageProtection.hostSignals.collected", {
        available: summary.available,
        profileHashPresent: Boolean(summary.profileHash),
        schemaBucket: summary.schemaBucket,
        zoteroVersionBucket: summary.zoteroVersionBucket,
        collectionError: summary.collectionError,
      });
    }

    return cloneSummary(summary);
  }

  function getSummary() {
    return cloneSummary(summary);
  }

  return {
    init,
    getSummary,
  };
}
