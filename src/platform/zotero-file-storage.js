function normalizeDirectorySegments(input) {
  const values = Array.isArray(input) ? input : [input];
  const segments = [];

  values.forEach((value) => {
    if (value === null || value === undefined) {
      return;
    }

    String(value)
      .split(/[\\/]+/u)
      .forEach((rawSegment) => {
        const segment = rawSegment.trim();
        if (!segment || segment === ".") {
          return;
        }
        if (segment === "..") {
          throw new Error("directory segments must not contain '..'");
        }
        segments.push(segment);
      });
  });

  return segments;
}

function normalizeFileName(fileName) {
  const normalized = String(fileName || "").trim();
  if (!normalized) {
    throw new Error("file name is required");
  }
  if (normalized === "." || normalized === ".." || /[\\/]/u.test(normalized)) {
    throw new Error("file name must not contain path separators");
  }
  return normalized;
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
    return chromeUtils.importESModule("resource://gre/modules/PathUtils.sys.mjs").PathUtils;
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
    return chromeUtils.importESModule("resource://gre/modules/IOUtils.sys.mjs").IOUtils;
  }
  catch {
    return null;
  }
}

export function createZoteroTextFileStorage(options = {}) {
  const {
    globalScope,
    directorySegments = [],
    fileName,
    rootDir = null,
  } = options;

  if (!globalScope || typeof globalScope !== "object") {
    throw new Error("globalScope is required");
  }

  const chromeUtils = getChromeUtils(globalScope);
  const pathUtils = getPathUtils(globalScope, chromeUtils);
  const ioUtils = getIOUtils(globalScope, chromeUtils);

  if (!pathUtils || typeof pathUtils.join !== "function") {
    throw new Error("PathUtils is unavailable");
  }
  if (!ioUtils || typeof ioUtils.exists !== "function") {
    throw new Error("IOUtils.exists() is unavailable");
  }
  if (typeof ioUtils.makeDirectory !== "function") {
    throw new Error("IOUtils.makeDirectory() is unavailable");
  }
  if (typeof ioUtils.readUTF8 !== "function") {
    throw new Error("IOUtils.readUTF8() is unavailable");
  }
  if (typeof ioUtils.writeUTF8 !== "function") {
    throw new Error("IOUtils.writeUTF8() is unavailable");
  }

  const normalizedSegments = normalizeDirectorySegments(directorySegments);
  const normalizedFileName = normalizeFileName(fileName);

  function getDataDirectory() {
    const dataDirectory = String(rootDir || globalScope?.Zotero?.DataDirectory?.dir || "").trim();
    if (!dataDirectory) {
      throw new Error("Zotero.DataDirectory.dir is unavailable");
    }
    return dataDirectory;
  }

  function resolveDirectoryPath() {
    const dataDirectory = getDataDirectory();
    if (normalizedSegments.length === 0) {
      return dataDirectory;
    }
    return pathUtils.join(dataDirectory, ...normalizedSegments);
  }

  function resolveFilePath() {
    return pathUtils.join(resolveDirectoryPath(), normalizedFileName);
  }

  async function ensureDirectory() {
    const directoryPath = resolveDirectoryPath();
    if (!(await ioUtils.exists(directoryPath))) {
      await ioUtils.makeDirectory(directoryPath, {
        ignoreExisting: true,
      });
    }
    return directoryPath;
  }

  async function exists() {
    return Boolean(await ioUtils.exists(resolveFilePath()));
  }

  async function readText() {
    const filePath = resolveFilePath();
    if (!(await ioUtils.exists(filePath))) {
      return null;
    }
    return ioUtils.readUTF8(filePath);
  }

  async function writeText(source) {
    await ensureDirectory();
    const filePath = resolveFilePath();
    await ioUtils.writeUTF8(filePath, String(source ?? ""));
    return filePath;
  }

  async function removeText() {
    const filePath = resolveFilePath();
    const fileExists = await ioUtils.exists(filePath);
    if (!fileExists) {
      return false;
    }
    if (typeof ioUtils.remove !== "function") {
      throw new Error("IOUtils.remove() is unavailable");
    }
    await ioUtils.remove(filePath, {
      ignoreAbsent: true,
    });
    return true;
  }

  function getAdapter() {
    return {
      readText,
      writeText,
    };
  }

  return {
    resolveDirectoryPath,
    resolveFilePath,
    ensureDirectory,
    exists,
    readText,
    writeText,
    removeText,
    getAdapter,
  };
}
