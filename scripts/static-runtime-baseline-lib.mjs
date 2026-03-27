import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const BASELINE_STATIC_RUNTIME_ENTRIES = Object.freeze([
  Object.freeze({
    file: "addon-static/bootstrap.js",
    kind: "bootstrap",
    label: "bootstrap 启动脚本",
    baselineSourceFile: "scripts/baselines/bootstrap.js.txt",
  }),
  Object.freeze({
    file: "addon-static/content/preferences.xhtml",
    kind: "preferences-pane",
    label: "偏好设置面板资源",
    baselineSourceFile: "scripts/baselines/preferences.xhtml.txt",
  }),
  Object.freeze({
    file: "addon-static/content/style/main.css",
    kind: "main-style",
    label: "主窗口样式资源",
    baselineSourceFile: "scripts/baselines/main.css.txt",
  }),
]);

function uniqueByFile(entries = []) {
  const seen = new Set();
  return entries.filter((entry) => {
    const file = String(entry?.file || "").trim();
    if (!file || seen.has(file)) {
      return false;
    }
    seen.add(file);
    return true;
  });
}

function normalizeAddonStaticRelativePath(filePath) {
  const normalized = path.posix.normalize(String(filePath || "").trim().replaceAll("\\", "/").replace(/^\/+/u, ""));
  if (!normalized || normalized === "." || normalized.startsWith("../")) {
    return null;
  }
  return normalized;
}

export function resolveConfiguredStaticRuntimeEntries(config = {}) {
  const icons = config?.icons && typeof config.icons === "object"
    ? Object.values(config.icons)
    : [];

  return uniqueByFile(
    icons.map((iconPath) => {
      const normalized = normalizeAddonStaticRelativePath(iconPath);
      if (!normalized) {
        return null;
      }
      return {
        file: `addon-static/${normalized}`,
        kind: "icon",
        label: "配置声明的 icon 资源",
        baselineSourceFile: `scripts/baselines/icons/${path.posix.basename(normalized)}`,
      };
    }).filter(Boolean),
  );
}

export function resolveStaticRuntimeBaselineEntries(config = {}) {
  return uniqueByFile([
    ...BASELINE_STATIC_RUNTIME_ENTRIES,
    ...resolveConfiguredStaticRuntimeEntries(config),
  ]);
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function hashBuffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function readBufferIfExists(targetPath) {
  return await fs.readFile(targetPath)
    .catch((error) => {
      if (error && error.code === "ENOENT") {
        return null;
      }
      throw error;
    });
}

async function resolveBaselineBuffer(projectRoot, entry) {
  const baselineSourceFile = String(entry?.baselineSourceFile || "").trim();
  if (!baselineSourceFile) {
    return null;
  }

  const absoluteSourceFile = path.join(projectRoot, baselineSourceFile);
  const workspaceSourceFile = path.join(__dirname, "..", baselineSourceFile);
  const sourcePath = await pathExists(absoluteSourceFile)
    ? absoluteSourceFile
    : (await pathExists(workspaceSourceFile) ? workspaceSourceFile : null);
  if (!sourcePath) {
    return null;
  }

  const sourceBuffer = await readBufferIfExists(sourcePath);
  if (!sourceBuffer) {
    return null;
  }

  return {
    sourceFile: path.relative(projectRoot, sourcePath).split(path.sep).join("/"),
    buffer: sourceBuffer,
    sha256: hashBuffer(sourceBuffer),
  };
}

export async function inspectStaticRuntimeBaselineFiles(projectRoot, config = {}) {
  const entries = resolveStaticRuntimeBaselineEntries(config);
  const missingEntries = [];
  const driftEntries = [];

  for (const entry of entries) {
    const file = String(entry.file || "").trim();
    const absoluteFile = path.join(projectRoot, file);
    if (!(await pathExists(absoluteFile))) {
      missingEntries.push({
        file,
        kind: entry.kind || "unknown",
        label: entry.label || "",
        reason: "file-missing",
      });
      continue;
    }

    const baseline = await resolveBaselineBuffer(projectRoot, entry);
    if (!baseline) {
      continue;
    }

    const targetBuffer = await readBufferIfExists(absoluteFile);
    if (!targetBuffer) {
      continue;
    }

    const actualSha256 = hashBuffer(targetBuffer);
    if (actualSha256 === baseline.sha256) {
      continue;
    }

    driftEntries.push({
      file,
      kind: entry.kind || "unknown",
      label: entry.label || "",
      reason: "content-drift",
      baselineSourceFile: baseline.sourceFile || entry.baselineSourceFile || null,
      expectedSha256: baseline.sha256,
      actualSha256,
    });
  }

  return {
    ok: missingEntries.length === 0,
    baselineOK: missingEntries.length === 0 && driftEntries.length === 0,
    missingCount: missingEntries.length,
    missingEntries,
    driftCount: driftEntries.length,
    driftEntries,
    checkedFiles: entries.map((entry) => entry.file),
  };
}
