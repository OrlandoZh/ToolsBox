import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { withBuildLock } from "./build-lock.mjs";
import { applyBuildInjection } from "./build-injection-lib.mjs";
import {
  assertNonEmptyString,
  assertPlainObject,
  buildScriptFailureInfo,
  isExecutedAsScript,
  readJSONFile,
  wrapScriptError,
} from "./script-runtime-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const configPath = path.join(projectRoot, "config", "addon.config.json");
const staticRoot = path.join(projectRoot, "addon-static");
const srcRoot = path.join(projectRoot, "src");
const scriptStartedAt = Date.now();

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function removeDir(dirPath) {
  await fs.rm(dirPath, { recursive: true, force: true });
}

async function copyDir(source, target) {
  await ensureDir(target);
  const entries = await fs.readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(source, entry.name);
    const dstPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, dstPath);
      continue;
    }

    await ensureDir(path.dirname(dstPath));
    await fs.copyFile(srcPath, dstPath);
  }
}

export function validateBuildConfig(config, filePath = configPath) {
  assertPlainObject(config, "addon.config.json", {
    category: "config",
    failedStage: "validate-config",
    details: { configPath: filePath },
  });

  const required = [
    "addonName",
    "addonId",
    "addonRef",
    "addonVersion",
    "description",
    "author",
    "homepage",
    "strictMinVersion",
    "strictMaxVersion",
    "prefsPrefix",
    "instanceKey",
    "defaultPrefs",
  ];

  for (const key of required) {
    if (key === "defaultPrefs") {
      assertPlainObject(config[key], `addon.config.json:${key}`, {
        category: "config",
        failedStage: "validate-config",
        details: { configPath: filePath, field: key },
      });
      continue;
    }
    assertNonEmptyString(config[key], `addon.config.json:${key}`, {
      category: "config",
      failedStage: "validate-config",
      details: { configPath: filePath, field: key },
    });
  }

  assertNonEmptyString(config.defaultPrefs.logLevel, "addon.config.json:defaultPrefs.logLevel", {
    category: "config",
    failedStage: "validate-config",
    details: { configPath: filePath, field: "defaultPrefs.logLevel" },
  });

  return config;
}

function buildManifest(config) {
  const manifest = {
    manifest_version: 2,
    name: config.addonName,
    version: config.addonVersion,
    description: config.description,
    homepage_url: config.homepage,
    author: config.author,
    applications: {
      zotero: {
        id: config.addonId,
        strict_min_version: config.strictMinVersion,
        strict_max_version: config.strictMaxVersion,
      },
    },
  };

  if (config.updateURL) {
    manifest.applications.zotero.update_url = config.updateURL;
  }

  if (config.icons && typeof config.icons === "object") {
    manifest.icons = config.icons;
  }

  return manifest;
}

function encodePrefLine(key, value) {
  if (typeof value === "string") {
    const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `pref("${key}", "${escaped}");`;
  }

  return `pref("${key}", ${String(value)});`;
}

function buildPrefs(config) {
  return Object.entries(config.defaultPrefs)
    .map(([key, value]) => encodePrefLine(`${config.prefsPrefix}.${key}`, value))
    .join("\n");
}

function collectImports(sourceCode) {
  const importRegex = /(^|\n)\s*import\s+([^;]+?)\s+from\s+["'](.+?)["'];?/g;
  const imports = [];

  sourceCode.replace(importRegex, (_, prefix, clause, specifier) => {
    imports.push({ clause: clause.trim(), specifier: specifier.trim() });
    return "";
  });

  return imports;
}

function namedClauseToObjectPattern(clause) {
  if (!clause.startsWith("{") || !clause.endsWith("}")) {
    throw new Error(`Unsupported import clause: ${clause}`);
  }

  const inner = clause.slice(1, -1).trim();
  if (!inner) {
    return "{}";
  }

  const members = inner.split(",").map((part) => part.trim()).filter(Boolean);
  const converted = members.map((member) => {
    if (!member.includes(" as ")) {
      return member;
    }

    const [from, to] = member.split(/\s+as\s+/);
    return `${from.trim()}: ${to.trim()}`;
  });

  return `{ ${converted.join(", ")} }`;
}

function transformModuleSource(sourceCode, importRows) {
  const importRegex = /(^|\n)\s*import\s+([^;]+?)\s+from\s+["'](.+?)["'];?/g;
  const exportBlockRegex = /(^|\n)\s*export\s*\{([^}]+)\}\s*;?/g;

  const exportNames = new Set();

  let transformed = sourceCode.replace(importRegex, "");

  transformed = transformed.replace(exportBlockRegex, (_, prefix, inner) => {
    const names = inner
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean)
      .map((token) => {
        const parts = token.split(/\s+as\s+/);
        if (parts.length === 2) {
          return { local: parts[0].trim(), exported: parts[1].trim() };
        }
        return { local: token, exported: token };
      });

    names.forEach(({ exported }) => exportNames.add(exported));
    return "";
  });

  transformed = transformed.replace(
    /\bexport\s+async\s+function\s+([A-Za-z_$][A-Za-z0-9_$]*)/g,
    (_, name) => {
      exportNames.add(name);
      return `async function ${name}`;
    },
  );

  transformed = transformed.replace(
    /\bexport\s+function\s+([A-Za-z_$][A-Za-z0-9_$]*)/g,
    (_, name) => {
      exportNames.add(name);
      return `function ${name}`;
    },
  );

  transformed = transformed.replace(
    /\bexport\s+class\s+([A-Za-z_$][A-Za-z0-9_$]*)/g,
    (_, name) => {
      exportNames.add(name);
      return `class ${name}`;
    },
  );

  transformed = transformed.replace(
    /\bexport\s+(const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g,
    (_, kind, name) => {
      exportNames.add(name);
      return `${kind} ${name}`;
    },
  );

  if (/\bexport\s+default\b/.test(transformed)) {
    throw new Error("Default export is not supported by local bundler");
  }

  const importPrelude = importRows
    .map(({ clause, depId }) => {
      const objectPattern = namedClauseToObjectPattern(clause);
      return `const ${objectPattern} = __require(${JSON.stringify(depId)});`;
    })
    .join("\n");

  const exportObject = `{ ${Array.from(exportNames).join(", ")} }`;

  return `${importPrelude}\n${transformed}\nreturn ${exportObject};`;
}

async function bundleEntry({ entryFile, srcRootPath, config }) {
  const moduleMap = new Map();

  async function visit(filePath) {
    const normalizedPath = path.resolve(filePath);
    if (moduleMap.has(normalizedPath)) {
      return;
    }

    const raw = await fs.readFile(normalizedPath, "utf-8");
    const imports = collectImports(raw);

    const rows = [];
    for (const item of imports) {
      if (!item.specifier.startsWith(".")) {
        throw new Error(`Only relative imports are supported: ${item.specifier}`);
      }

      const resolved = path.resolve(path.dirname(normalizedPath), item.specifier);
      const resolvedFile = resolved.endsWith(".js") ? resolved : `${resolved}.js`;
      await visit(resolvedFile);

      rows.push({
        clause: item.clause,
        depId: toPosix(path.relative(srcRootPath, resolvedFile)),
      });
    }

    moduleMap.set(normalizedPath, {
      id: toPosix(path.relative(srcRootPath, normalizedPath)),
      source: transformModuleSource(raw, rows),
    });
  }

  await visit(entryFile);

  const moduleDefs = Array.from(moduleMap.values())
    .map(
      (module) =>
        `${JSON.stringify(module.id)}: function(__require) {\n${module.source}\n}`,
    )
    .join(",\n");

  const entryId = toPosix(path.relative(srcRootPath, entryFile));

  return `/* Auto-generated by cleanroom build script */
(function(__global) {
  "use strict";
  __global.__CLEANROOM_TEMPLATE_CONFIG__ = ${JSON.stringify(config)};

  const __moduleDefs = {
${moduleDefs}
  };

  const __cache = {};

  function __require(id) {
    if (__cache[id]) {
      return __cache[id];
    }

    const factory = __moduleDefs[id];
    if (!factory) {
      throw new Error("Unknown module: " + id);
    }

    const exports = factory(__require);
    __cache[id] = exports;
    return exports;
  }

  const __entry = __require(${JSON.stringify(entryId)});
  if (__entry && typeof __entry.bootstrapPlugin === "function") {
    __global.bootstrapPlugin = __entry.bootstrapPlugin;
  }
})(this);
`;
}

function patchBootstrap(templateContent, config) {
  return templateContent
    .replaceAll("__ADDON_REF__", config.addonRef)
    .replaceAll("__INSTANCE_KEY__", config.instanceKey);
}

function patchPreferences(templateContent, config) {
  return templateContent.replaceAll("__PREFS_PREFIX__", config.prefsPrefix);
}

async function writeBuildReport({ buildRoot, bundlePath, config }) {
  const report = {
    generatedAt: new Date().toISOString(),
    addonRef: config.addonRef,
    addonVersion: config.addonVersion,
    buildRoot,
    bundlePath,
  };

  await fs.writeFile(
    path.join(buildRoot, "build-report.json"),
    JSON.stringify(report, null, 2),
    "utf-8",
  );
}

export async function main() {
  await withBuildLock("build.mjs", async () => {
    try {
      await applyBuildInjection();
    } catch (error) {
      throw wrapScriptError(error, {
        failedStage: "apply-build-injection",
      });
    }

    const config = await readJSONFile(configPath, {
      missingCategory: "environment",
      invalidCategory: "validation",
      missingStage: "read-config",
      invalidStage: "read-config",
      label: "config/addon.config.json",
    });
    validateBuildConfig(config, configPath);

    const buildRoot = path.join(projectRoot, "build", config.addonRef);
    const scriptsRoot = path.join(buildRoot, "content", "scripts");

    try {
      await removeDir(buildRoot);
      await copyDir(staticRoot, buildRoot);
      await ensureDir(scriptsRoot);
    } catch (error) {
      throw wrapScriptError(error, {
        failedStage: "prepare-build-root",
        details: { buildRoot },
      });
    }

    const manifest = buildManifest(config);
    try {
      await fs.writeFile(
        path.join(buildRoot, "manifest.json"),
        JSON.stringify(manifest, null, 2),
        "utf-8",
      );
    } catch (error) {
      throw wrapScriptError(error, {
        failedStage: "write-manifest",
        details: { buildRoot },
      });
    }

    const prefsContent = buildPrefs(config);
    try {
      await fs.writeFile(path.join(buildRoot, "prefs.js"), `${prefsContent}\n`, "utf-8");
    } catch (error) {
      throw wrapScriptError(error, {
        failedStage: "write-prefs",
        details: { buildRoot },
      });
    }

    try {
      const bootstrapTemplate = await fs.readFile(path.join(buildRoot, "bootstrap.js"), "utf-8");
      const patchedBootstrap = patchBootstrap(bootstrapTemplate, config);
      await fs.writeFile(path.join(buildRoot, "bootstrap.js"), patchedBootstrap, "utf-8");
    } catch (error) {
      throw wrapScriptError(error, {
        failedStage: "patch-bootstrap",
        details: { buildRoot },
      });
    }

    const prefsTemplatePath = path.join(buildRoot, "content", "preferences.xhtml");
    try {
      const prefsTemplate = await fs.readFile(prefsTemplatePath, "utf-8");
      const patchedPrefs = patchPreferences(prefsTemplate, config);
      await fs.writeFile(prefsTemplatePath, patchedPrefs, "utf-8");
    } catch (error) {
      throw wrapScriptError(error, {
        failedStage: "patch-preferences",
        details: { buildRoot },
      });
    }

    const entryFile = path.join(srcRoot, "main.js");
    let bundle = null;
    try {
      bundle = await bundleEntry({
        entryFile,
        srcRootPath: srcRoot,
        config,
      });
    } catch (error) {
      throw wrapScriptError(error, {
        failedStage: "bundle-entry",
        details: { entryFile },
      });
    }

    const bundlePath = path.join(scriptsRoot, `${config.addonRef}.js`);
    try {
      await fs.writeFile(bundlePath, bundle, "utf-8");
    } catch (error) {
      throw wrapScriptError(error, {
        failedStage: "write-bundle",
        details: { bundlePath },
      });
    }

    try {
      await writeBuildReport({
        buildRoot,
        bundlePath,
        config,
      });
    } catch (error) {
      throw wrapScriptError(error, {
        failedStage: "write-build-report",
        details: { buildRoot, bundlePath },
      });
    }

    console.log(`Build complete: ${buildRoot}`);
  });
}

if (isExecutedAsScript(import.meta.url)) {
  main().catch((error) => {
    const failureInfo = buildScriptFailureInfo(error, {
      durationMs: Math.max(0, Date.now() - scriptStartedAt),
    });
    console.error(`${failureInfo.errorCategoryLabel}: ${failureInfo.errorMessage}`);
    process.exit(1);
  });
}
