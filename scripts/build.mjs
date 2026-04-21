import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createSurfaceDescriptors as createDefaultSurfaceDescriptors } from "../src/app/surface-descriptors.js";
import { createSurfaceDescriptors as createProtectedSurfaceDescriptors } from "../src/app/surface-descriptors-protected.js";
import {
  REACT_UI_DEMO_SHELL_PATH,
  WASM_KERNEL_PROBE_WORKER_PATH,
} from "../src/utils/optional-bundle-paths.js";
import {
  obfuscateBundleSource,
  SHIELDED_LOADER_OBFUSCATION_STAGE,
} from "./package-obfuscation-lib.mjs";
import { buildReactUI } from "./build-react-ui.mjs";
import { withBuildLock } from "./build-lock.mjs";
import { applyBuildInjection } from "./build-injection-lib.mjs";
import {
  loadOptionalBundleRegistry,
  listOptionalBundles,
} from "./optional-bundles-lib.mjs";
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
export const BUILD_MODULE_ID_MODE_ENV = "CLEANROOM_BUILD_MODULE_ID_MODE";
export const BUILD_MODULE_ID_MODE_PATH = "path";
export const BUILD_MODULE_ID_MODE_ANONYMIZED = "anonymized";
export const BUILD_SEMANTIC_SCRUB_ENV = "CLEANROOM_BUILD_SEMANTIC_SCRUB";
export const BUILD_SEMANTIC_SCRUB_NONE = "none";
export const BUILD_SEMANTIC_SCRUB_PROTECTED = "protected";
export const BUILD_PREFERENCE_BINDING_MODE_ENV = "CLEANROOM_BUILD_PREFERENCE_BINDING_MODE";
export const BUILD_PREFERENCE_BINDING_MODE_NATIVE = "native";
export const BUILD_PREFERENCE_BINDING_MODE_BRIDGE = "bridge";
export const BUILD_STATIC_SURFACE_MODE_ENV = "CLEANROOM_BUILD_STATIC_SURFACE_MODE";
export const BUILD_STATIC_SURFACE_MODE_STANDARD = "standard";
export const BUILD_STATIC_SURFACE_MODE_SCRUB = "scrub";
export const BUILD_ROUTE4_LEGACY_ENABLED_ENV = "CLEANROOM_BUILD_ROUTE4_LEGACY_ENABLED";
export const ROUTE4_LEGACY_ENDPOINT_ENV = "CLEANROOM_ROUTE4_LEGACY_ENDPOINT";
export const ROUTE4_LEGACY_SECRET_ENV = "CLEANROOM_ROUTE4_LEGACY_SECRET";
export const ROUTE4_LEGACY_IDENTITY_KIND_ENV = "CLEANROOM_ROUTE4_IDENTITY_KIND";
export const ROUTE4_LEGACY_CACHE_TTL_MS_ENV = "CLEANROOM_ROUTE4_LEGACY_CACHE_TTL_MS";

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

export function resolveBuildModuleIdMode(env = process.env) {
  const rawMode = String(env?.[BUILD_MODULE_ID_MODE_ENV] || "").trim().toLowerCase();
  return rawMode === BUILD_MODULE_ID_MODE_ANONYMIZED
    ? BUILD_MODULE_ID_MODE_ANONYMIZED
    : BUILD_MODULE_ID_MODE_PATH;
}

export function resolveBuildSemanticScrubMode(env = process.env) {
  const rawMode = String(env?.[BUILD_SEMANTIC_SCRUB_ENV] || "").trim().toLowerCase();
  return rawMode === BUILD_SEMANTIC_SCRUB_PROTECTED
    ? BUILD_SEMANTIC_SCRUB_PROTECTED
    : BUILD_SEMANTIC_SCRUB_NONE;
}

export function resolveBuildPreferenceBindingMode(env = process.env) {
  const rawMode = String(env?.[BUILD_PREFERENCE_BINDING_MODE_ENV] || "").trim().toLowerCase();
  return rawMode === BUILD_PREFERENCE_BINDING_MODE_BRIDGE
    ? BUILD_PREFERENCE_BINDING_MODE_BRIDGE
    : BUILD_PREFERENCE_BINDING_MODE_NATIVE;
}

export function resolveBuildStaticSurfaceMode(env = process.env) {
  const rawMode = String(env?.[BUILD_STATIC_SURFACE_MODE_ENV] || "").trim().toLowerCase();
  return rawMode === BUILD_STATIC_SURFACE_MODE_SCRUB
    ? BUILD_STATIC_SURFACE_MODE_SCRUB
    : BUILD_STATIC_SURFACE_MODE_STANDARD;
}

function normalizeBuildString(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeBuildNumber(value, fallback, { min = 0 } = {}) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(min, numeric) : fallback;
}

export function resolveBuildRoute4LegacyConfig(env = process.env) {
  const enabled = String(env?.[BUILD_ROUTE4_LEGACY_ENABLED_ENV] || "").trim() === "1";
  if (!enabled) {
    return null;
  }

  return {
    enabled: true,
    endpoint: normalizeBuildString(env?.[ROUTE4_LEGACY_ENDPOINT_ENV]),
    secret: normalizeBuildString(env?.[ROUTE4_LEGACY_SECRET_ENV]),
    identityKind: normalizeBuildString(env?.[ROUTE4_LEGACY_IDENTITY_KIND_ENV]) || "zotero-user-id",
    cacheTTLMS: normalizeBuildNumber(env?.[ROUTE4_LEGACY_CACHE_TTL_MS_ENV], 86400000, { min: 1 }),
  };
}

function attachRoute4LegacyConfig(config, route4LegacyConfig = null) {
  if (!route4LegacyConfig) {
    return config;
  }
  return {
    ...config,
    packageProtectionControlPlane: {
      ...(config.packageProtectionControlPlane && typeof config.packageProtectionControlPlane === "object"
        ? config.packageProtectionControlPlane
        : {}),
      route4Legacy: route4LegacyConfig,
    },
  };
}

export function createBundleModuleId(filePath, srcRootPath, mode = BUILD_MODULE_ID_MODE_PATH) {
  const relativePath = toPosix(path.relative(srcRootPath, filePath));
  if (mode !== BUILD_MODULE_ID_MODE_ANONYMIZED) {
    return relativePath;
  }

  return `m_${crypto.createHash("sha256").update(relativePath).digest("hex").slice(0, 24)}`;
}

function resolveBuildModuleAliases(
  srcRootPath,
  semanticScrubMode = BUILD_SEMANTIC_SCRUB_NONE,
  preferenceBindingMode = BUILD_PREFERENCE_BINDING_MODE_NATIVE,
) {
  const aliases = new Map();
  if (semanticScrubMode !== BUILD_SEMANTIC_SCRUB_PROTECTED) {
    return aliases;
  }

  aliases.set(
    path.resolve(srcRootPath, "app", "agent-scenario-ids.js"),
    path.resolve(srcRootPath, "app", "agent-scenario-ids-protected.js"),
  );
  aliases.set(
    path.resolve(srcRootPath, "app", "capability-ids.js"),
    path.resolve(srcRootPath, "app", "capability-ids-protected.js"),
  );
  aliases.set(
    path.resolve(srcRootPath, "app", "host-action-ids.js"),
    path.resolve(srcRootPath, "app", "host-action-ids-protected.js"),
  );
  aliases.set(
    path.resolve(srcRootPath, "app", "host-action-owner-modules.js"),
    path.resolve(srcRootPath, "app", "host-action-owner-modules-protected.js"),
  );
  aliases.set(
    path.resolve(srcRootPath, "app", "host-action-catalog.js"),
    path.resolve(srcRootPath, "app", "host-action-catalog-protected.js"),
  );
  aliases.set(
    path.resolve(srcRootPath, "app", "host-action-readiness-ids.js"),
    path.resolve(srcRootPath, "app", "host-action-readiness-ids-protected.js"),
  );
  aliases.set(
    path.resolve(srcRootPath, "core", "i18n.js"),
    path.resolve(srcRootPath, "core", "i18n-protected.js"),
  );
  aliases.set(
    path.resolve(srcRootPath, "app", "capability-manifest.js"),
    path.resolve(srcRootPath, "app", "capability-manifest-protected.js"),
  );
  aliases.set(
    path.resolve(srcRootPath, "app", "copy-fallbacks.js"),
    path.resolve(srcRootPath, "app", "copy-fallbacks-protected.js"),
  );
  aliases.set(
    path.resolve(srcRootPath, "app", "surface-descriptors.js"),
    path.resolve(
      srcRootPath,
      "app",
      preferenceBindingMode === BUILD_PREFERENCE_BINDING_MODE_BRIDGE
        ? "surface-descriptors-protected-pref-bridge.js"
        : "surface-descriptors-protected.js",
    ),
  );
  return aliases;
}

function createProtectedOptionalBundleRegistryView(optionalBundleRegistry = null) {
  const bundles = Array.isArray(optionalBundleRegistry?.bundles)
    ? optionalBundleRegistry.bundles
      .filter((bundle) => bundle?.enabled === true)
      .map((bundle) => ({
        id: String(bundle?.id || "").trim(),
        enabled: true,
      }))
      .filter((bundle) => bundle.id)
    : [];

  return {
    schemaVersion: Number(optionalBundleRegistry?.schemaVersion || 1),
    summary: "Protected build registry view.",
    bundles,
  };
}

function resolveOptionalBundleRegistryBuildView(
  optionalBundleRegistry = null,
  semanticScrubMode = BUILD_SEMANTIC_SCRUB_NONE,
) {
  if (semanticScrubMode === BUILD_SEMANTIC_SCRUB_PROTECTED) {
    return createProtectedOptionalBundleRegistryView(optionalBundleRegistry);
  }
  return optionalBundleRegistry;
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

function escapeXHTML(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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

function buildManifest(
  config,
  staticSurfaceMode = BUILD_STATIC_SURFACE_MODE_STANDARD,
) {
  const useScrubbedSurface = staticSurfaceMode === BUILD_STATIC_SURFACE_MODE_SCRUB;
  const manifest = {
    manifest_version: 2,
    name: useScrubbedSurface
      ? "Zotero Tool Package"
      : config.addonName,
    version: config.addonVersion,
    description: useScrubbedSurface
      ? "Protected Zotero add-on package."
      : config.description,
    author: useScrubbedSurface
      ? "Tool Package"
      : config.author,
    applications: {
      zotero: {
        id: config.addonId,
        strict_min_version: config.strictMinVersion,
        strict_max_version: config.strictMaxVersion,
      },
    },
  };

  if (!useScrubbedSurface && config.homepage) {
    manifest.homepage_url = config.homepage;
  }

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

function buildPrefs(
  config,
  semanticScrubMode = BUILD_SEMANTIC_SCRUB_NONE,
  preferenceBindingMode = BUILD_PREFERENCE_BINDING_MODE_NATIVE,
) {
  const prefNames = preferenceBindingMode === BUILD_PREFERENCE_BINDING_MODE_BRIDGE
    && semanticScrubMode === BUILD_SEMANTIC_SCRUB_PROTECTED
    ? buildPreferencePlaceholderNameMap(
      resolveBuildSurfaceDescriptors(config, semanticScrubMode),
    )
    : buildPreferenceNameMap(config);
  return Object.entries(config.defaultPrefs)
    .map(([key, value]) => encodePrefLine(prefNames[key] || `${config.prefsPrefix}.${key}`, value))
    .join("\n");
}

export function stripProtectedSourceComments(sourceCode) {
  const lines = String(sourceCode || "").split("\n");
  const stripped = [];
  let inBlockComment = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (inBlockComment) {
      if (trimmed.includes("*/")) {
        inBlockComment = false;
      }
      continue;
    }

    if (!trimmed) {
      stripped.push(line);
      continue;
    }

    if (trimmed.startsWith("//")) {
      continue;
    }

    if (trimmed.startsWith("/*")) {
      if (!trimmed.includes("*/")) {
        inBlockComment = true;
      }
      continue;
    }

    stripped.push(line);
  }

  return stripped.join("\n");
}

const PROTECTED_SOURCE_LITERAL_REPLACEMENTS = Object.freeze({
  "main.js": Object.freeze([
    ["cleanroom.bootstrap", "tool.bootstrap"],
    ["console-bridge", "cb"],
    ["capability-report", "runtime-report"],
  ]),
  "features/reader.js": Object.freeze([
    ["reader.openReader", "reader.r0"],
    ["reader.openByURI", "reader.r1"],
  ]),
  "app/host-actions.js": Object.freeze([
    ["reader.openReader", "reader.r0"],
  ]),
  "app/surface-descriptors-protected.js": Object.freeze([
    ["cleanroomtemplate", "tool"],
  ]),
  "features/react-ui-demo.js": Object.freeze([
    ["cleanroomtemplate", "tool"],
    ["Cleanroom Template", "Tool"],
  ]),
  "features/wasm-kernel-probe.js": Object.freeze([
    ["cleanroomtemplate", "tool"],
  ]),
  "services/wasm-loader.js": Object.freeze([
    ["WebAssembly.instantiate is required", "wasm instantiate unavailable"],
  ]),
});

export function scrubProtectedSourceLiterals(sourceCode, filePath, srcRootPath = srcRoot) {
  const relativePath = toPosix(path.relative(srcRootPath, filePath));
  const replacements = PROTECTED_SOURCE_LITERAL_REPLACEMENTS[relativePath];
  if (!Array.isArray(replacements) || replacements.length === 0) {
    return String(sourceCode || "");
  }

  return replacements.reduce(
    (source, [from, to]) => source.replaceAll(from, to),
    String(sourceCode || ""),
  );
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

function createProtectedConfigObjectExpression(value) {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }

  if (typeof value === "string") {
    return encodeJSStringExpression(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => createProtectedConfigObjectExpression(item) || "null").join(", ")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .map(([key, item]) => {
        const expression = createProtectedConfigObjectExpression(item);
        return typeof expression === "string"
          ? `${JSON.stringify(key)}: ${expression}`
          : null;
      })
      .filter(Boolean);
    return `({${entries.join(", ")}})`;
  }

  return undefined;
}

export function createBuildConfigExpression(
  config,
  semanticScrubMode = BUILD_SEMANTIC_SCRUB_NONE,
) {
  if (semanticScrubMode !== BUILD_SEMANTIC_SCRUB_PROTECTED) {
    return JSON.stringify(config);
  }
  return createProtectedConfigObjectExpression(config) || "({})";
}

export async function bundleEntry({
  entryFile,
  srcRootPath,
  config,
  optionalBundleRegistry = null,
  moduleIdMode = BUILD_MODULE_ID_MODE_PATH,
  semanticScrubMode = BUILD_SEMANTIC_SCRUB_NONE,
  preferenceBindingMode = BUILD_PREFERENCE_BINDING_MODE_NATIVE,
}) {
  const moduleMap = new Map();
  const moduleAliases = resolveBuildModuleAliases(srcRootPath, semanticScrubMode, preferenceBindingMode);
  const bundledOptionalBundleRegistry = resolveOptionalBundleRegistryBuildView(
    optionalBundleRegistry,
    semanticScrubMode,
  );

  async function visit(filePath) {
    const normalizedPath = path.resolve(filePath);
    if (moduleMap.has(normalizedPath)) {
      return;
    }

    const raw = await fs.readFile(normalizedPath, "utf-8");
    const sourceCode = semanticScrubMode === BUILD_SEMANTIC_SCRUB_PROTECTED
      ? scrubProtectedSourceLiterals(
        stripProtectedSourceComments(raw),
        normalizedPath,
        srcRootPath,
      )
      : raw;
    const imports = collectImports(sourceCode);

    const rows = [];
    for (const item of imports) {
      if (!item.specifier.startsWith(".")) {
        throw new Error(`Only relative imports are supported: ${item.specifier}`);
      }

      const resolved = path.resolve(path.dirname(normalizedPath), item.specifier);
      const resolvedFile = resolved.endsWith(".js") ? resolved : `${resolved}.js`;
      const aliasedFile = moduleAliases.get(path.resolve(resolvedFile)) || resolvedFile;
      await visit(aliasedFile);

      rows.push({
        clause: item.clause,
        depId: createBundleModuleId(aliasedFile, srcRootPath, moduleIdMode),
      });
    }

    moduleMap.set(normalizedPath, {
      id: createBundleModuleId(normalizedPath, srcRootPath, moduleIdMode),
      source: transformModuleSource(sourceCode, rows),
    });
  }

  await visit(entryFile);

  const moduleDefs = Array.from(moduleMap.values())
    .map(
      (module) =>
        `${JSON.stringify(module.id)}: function(__require) {\n${module.source}\n}`,
    )
    .join(",\n");

  const entryId = createBundleModuleId(entryFile, srcRootPath, moduleIdMode);
  const configExpression = createBuildConfigExpression(config, semanticScrubMode);
  const optionalBundleRegistryExpression = createBuildConfigExpression(
    bundledOptionalBundleRegistry,
    semanticScrubMode,
  );

return `/* Auto-generated by cleanroom build script */
(function(__global) {
  "use strict";
  __global.__CLEANROOM_TEMPLATE_CONFIG__ = ${configExpression};
  __global.__CLEANROOM_TEMPLATE_OPTIONAL_BUNDLES__ = ${optionalBundleRegistryExpression};

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

function encodeJSStringExpression(value = "") {
  const codeUnits = Array.from(String(value || ""))
    .map((character) => character.charCodeAt(0));
  if (codeUnits.length === 0) {
    return '""';
  }
  return `String.fromCharCode(${codeUnits.join(", ")})`;
}

function patchBootstrap(
  templateContent,
  config,
  staticSurfaceMode = BUILD_STATIC_SURFACE_MODE_STANDARD,
) {
  const scrubbedTemplate = staticSurfaceMode === BUILD_STATIC_SURFACE_MODE_SCRUB
    ? [
      ["startup.cleanup.failed", "boot.cleanup.failed"],
      ["startup.failed", "boot.start.failed"],
      ["shutdown.failed", "boot.stop.failed"],
      ["cleanroom.bootstrap", "tool.bootstrap"],
      ["console-bridge", "cb"],
      ["capability-report", "runtime-report"],
    ].reduce((source, [from, to]) => source.replaceAll(from, to), templateContent)
    : templateContent;
  const addonRefValue = staticSurfaceMode === BUILD_STATIC_SURFACE_MODE_SCRUB
    ? encodeJSStringExpression(config.addonRef)
    : JSON.stringify(config.addonRef);
  const instanceKeyValue = staticSurfaceMode === BUILD_STATIC_SURFACE_MODE_SCRUB
    ? encodeJSStringExpression(config.instanceKey)
    : JSON.stringify(config.instanceKey);
  return scrubbedTemplate
    .replaceAll('"__ADDON_REF__"', addonRefValue)
    .replaceAll('"__INSTANCE_KEY__"', instanceKeyValue);
}

function resolveBuildSurfaceDescriptors(config, semanticScrubMode = BUILD_SEMANTIC_SCRUB_NONE) {
  if (semanticScrubMode === BUILD_SEMANTIC_SCRUB_PROTECTED) {
    return createProtectedSurfaceDescriptors(config);
  }
  return createDefaultSurfaceDescriptors(config);
}

function buildPreferenceNameMap(config = {}) {
  const prefsPrefix = String(config?.prefsPrefix || "").trim();
  return {
    enabled: `${prefsPrefix}.enabled`,
    menuLabel: `${prefsPrefix}.menuLabel`,
    logLevel: `${prefsPrefix}.logLevel`,
    themeMode: `${prefsPrefix}.themeMode`,
  };
}

function buildPreferencePlaceholderNameMap(surfaceDescriptors = null) {
  const paneScope = String(surfaceDescriptors?.preferencePaneID || "").trim() || "crp0";
  const prefsPrefix = `extensions.zotero.${paneScope}`;
  return {
    enabled: `${prefsPrefix}.p0`,
    menuLabel: `${prefsPrefix}.p1`,
    logLevel: `${prefsPrefix}.p2`,
    themeMode: `${prefsPrefix}.p3`,
  };
}

function patchPreferences(
  templateContent,
  config,
  semanticScrubMode = BUILD_SEMANTIC_SCRUB_NONE,
  preferenceBindingMode = BUILD_PREFERENCE_BINDING_MODE_NATIVE,
) {
  const surfaceDescriptors = resolveBuildSurfaceDescriptors(config, semanticScrubMode);
  const prefNames = preferenceBindingMode === BUILD_PREFERENCE_BINDING_MODE_BRIDGE
    ? buildPreferencePlaceholderNameMap(surfaceDescriptors)
    : buildPreferenceNameMap(config);
  return templateContent
    .replaceAll("__PREF_ENABLED_NAME__", prefNames.enabled)
    .replaceAll("__PREF_MENU_LABEL_NAME__", prefNames.menuLabel)
    .replaceAll("__PREF_LOG_LEVEL_NAME__", prefNames.logLevel)
    .replaceAll("__PREF_THEME_MODE_NAME__", prefNames.themeMode)
    .replaceAll("__PREFERENCE_ROOT_ID__", surfaceDescriptors.preferenceRootID);
}

function patchReactUIDemoShell(
  templateContent,
  config,
  staticSurfaceMode = BUILD_STATIC_SURFACE_MODE_STANDARD,
) {
  const shellAddonRef = staticSurfaceMode === BUILD_STATIC_SURFACE_MODE_SCRUB
    ? "tool"
    : String(config?.addonRef || "").trim() || "tool";
  const shellAddonName = staticSurfaceMode === BUILD_STATIC_SURFACE_MODE_SCRUB
    ? "Tool"
    : String(config?.addonName || "").trim() || "Tool";
  const shellWindowTitle = staticSurfaceMode === BUILD_STATIC_SURFACE_MODE_SCRUB
    ? "Tool Panel"
    : `${shellAddonName} React UI Demo`;
  const shellNoScript = staticSurfaceMode === BUILD_STATIC_SURFACE_MODE_SCRUB
    ? "This panel requires JavaScript."
    : "React UI demo requires JavaScript.";
  return templateContent
    .replaceAll("__SHELL_ADDON_REF__", escapeXHTML(shellAddonRef))
    .replaceAll("__SHELL_ADDON_NAME__", escapeXHTML(shellAddonName))
    .replaceAll("__SHELL_WINDOW_TITLE__", escapeXHTML(shellWindowTitle))
    .replaceAll("__SHELL_NOSCRIPT__", escapeXHTML(shellNoScript));
}

const PROTECTED_STATIC_REPLACEMENTS = Object.freeze({
  "locale/en-US/main.ftl": Object.freeze([
    ["Open Cleanroom Action", "Open Tool"],
    ["Show Reader Demo Summary", "Open Current View"],
    ["Cleanroom Template Preferences", "Tool Preferences"],
    ["Enable plugin", "Enable tool"],
    ["Cleanroom Summary", "Current Summary"],
    ["Cleanroom Demo", "Current Panel"],
    ["Cleanroom Template", "Tool"],
    ["Plugin command executed successfully.", "Action completed."],
  ]),
  "locale/zh-CN/main.ftl": Object.freeze([
    ["打开模板动作", "打开工具"],
    ["显示 Reader 示例摘要", "打开当前视图"],
    ["Cleanroom 模板首选项", "工具首选项"],
    ["启用插件", "启用工具"],
    ["模板摘要", "当前摘要"],
    ["模板示例", "当前面板"],
    ["模板插件", "工具"],
    ["插件命令执行成功。", "操作已完成。"],
  ]),
  "locale/zh-TW/main.ftl": Object.freeze([
    ["開啟範本動作", "開啟工具"],
    ["顯示 Reader 示例摘要", "開啟目前視圖"],
    ["Cleanroom 範本偏好設定", "工具偏好設定"],
    ["啟用外掛", "啟用工具"],
    ["範本摘要", "目前摘要"],
    ["範本示例", "目前面板"],
    ["範本外掛", "工具"],
    ["外掛命令已成功執行。", "操作已完成。"],
  ]),
  [REACT_UI_DEMO_SHELL_PATH]: Object.freeze([
    ["React UI Demo", "Panel"],
    ["React UI demo requires JavaScript.", "This panel requires JavaScript."],
  ]),
});

async function applyProtectedStaticScrub(buildRoot) {
  for (const [relativePath, replacements] of Object.entries(PROTECTED_STATIC_REPLACEMENTS)) {
    const targetPath = path.join(buildRoot, relativePath);
    let source = await fs.readFile(targetPath, "utf-8");
    for (const [from, to] of replacements) {
      source = source.replaceAll(from, to);
    }
    await fs.writeFile(targetPath, source, "utf-8");
  }
}

const PROTECTED_STATIC_SCRIPT_PATHS = Object.freeze([
  "content/preferences.js",
  "content/preference-pane-load-bridge.js",
  "content/theme.js",
]);

const PROTECTED_SCRUB_ONLY_STATIC_SCRIPT_PATHS = Object.freeze([
  WASM_KERNEL_PROBE_WORKER_PATH,
]);

function resolveProtectedStaticScriptPaths(
  staticSurfaceMode = BUILD_STATIC_SURFACE_MODE_STANDARD,
) {
  if (staticSurfaceMode !== BUILD_STATIC_SURFACE_MODE_SCRUB) {
    return PROTECTED_STATIC_SCRIPT_PATHS.slice();
  }
  return [
    ...PROTECTED_STATIC_SCRIPT_PATHS,
    ...PROTECTED_SCRUB_ONLY_STATIC_SCRIPT_PATHS,
  ];
}

async function obfuscateProtectedStaticScripts(
  buildRoot,
  staticSurfaceMode = BUILD_STATIC_SURFACE_MODE_STANDARD,
) {
  for (const relativePath of resolveProtectedStaticScriptPaths(staticSurfaceMode)) {
    const targetPath = path.join(buildRoot, relativePath);
    const source = await fs.readFile(targetPath, "utf-8");
    const obfuscated = obfuscateBundleSource(source, {
      stage: SHIELDED_LOADER_OBFUSCATION_STAGE,
    });
    await fs.writeFile(targetPath, `${obfuscated.obfuscatedSource}\n`, "utf-8");
  }
}

async function writeBuildReport({
  buildRoot,
  bundlePath,
  config,
  optionalBundles = [],
  moduleIdMode = BUILD_MODULE_ID_MODE_PATH,
  semanticScrubMode = BUILD_SEMANTIC_SCRUB_NONE,
  staticSurfaceMode = BUILD_STATIC_SURFACE_MODE_STANDARD,
}) {
  const report = {
    generatedAt: new Date().toISOString(),
    addonRef: config.addonRef,
    addonVersion: config.addonVersion,
    buildRoot,
    bundlePath,
    optionalBundles,
    moduleIdMode,
    semanticScrubMode,
    staticSurfaceMode,
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

    const baseConfig = await readJSONFile(configPath, {
      missingCategory: "environment",
      invalidCategory: "validation",
      missingStage: "read-config",
      invalidStage: "read-config",
      label: "config/addon.config.json",
    });
    validateBuildConfig(baseConfig, configPath);
    const config = attachRoute4LegacyConfig(baseConfig, resolveBuildRoute4LegacyConfig(process.env));
    let optionalBundleRegistry = null;
    try {
      optionalBundleRegistry = loadOptionalBundleRegistry(projectRoot).registry;
    } catch (error) {
      throw wrapScriptError(error, {
        failedStage: "read-optional-bundle-registry",
      });
    }

    const moduleIdMode = resolveBuildModuleIdMode(process.env);
    const semanticScrubMode = resolveBuildSemanticScrubMode(process.env);
    const preferenceBindingMode = resolveBuildPreferenceBindingMode(process.env);
    const staticSurfaceMode = resolveBuildStaticSurfaceMode(process.env);
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

    const manifest = buildManifest(config, staticSurfaceMode);
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

    const prefsContent = buildPrefs(config, semanticScrubMode, preferenceBindingMode);
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
      const patchedBootstrap = patchBootstrap(bootstrapTemplate, config, staticSurfaceMode);
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
      const patchedPrefs = patchPreferences(
        prefsTemplate,
        config,
        semanticScrubMode,
        preferenceBindingMode,
      );
      await fs.writeFile(prefsTemplatePath, patchedPrefs, "utf-8");
    } catch (error) {
      throw wrapScriptError(error, {
        failedStage: "patch-preferences",
        details: { buildRoot },
      });
    }

    const reactUIDemoShellPath = path.join(buildRoot, ...REACT_UI_DEMO_SHELL_PATH.split("/"));
    try {
      const reactUIDemoShell = await fs.readFile(reactUIDemoShellPath, "utf-8");
      const patchedReactUIDemoShell = patchReactUIDemoShell(
        reactUIDemoShell,
        config,
        staticSurfaceMode,
      );
      await fs.writeFile(reactUIDemoShellPath, patchedReactUIDemoShell, "utf-8");
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw wrapScriptError(error, {
          failedStage: "patch-react-ui-shell",
          details: { reactUIDemoShellPath },
        });
      }
    }

    if (semanticScrubMode === BUILD_SEMANTIC_SCRUB_PROTECTED) {
      try {
        await applyProtectedStaticScrub(buildRoot);
      } catch (error) {
        throw wrapScriptError(error, {
          failedStage: "apply-protected-static-scrub",
          details: { buildRoot },
        });
      }

      try {
        await obfuscateProtectedStaticScripts(buildRoot, staticSurfaceMode);
      } catch (error) {
        throw wrapScriptError(error, {
          failedStage: "obfuscate-protected-static-scripts",
          details: { buildRoot },
        });
      }
    }

    const entryFile = path.join(srcRoot, "main.js");
    let bundle = null;
    try {
      bundle = await bundleEntry({
        entryFile,
        srcRootPath: srcRoot,
        config,
        optionalBundleRegistry,
        moduleIdMode,
        semanticScrubMode,
        preferenceBindingMode,
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

    let reactUIBuildResult = null;
    try {
      reactUIBuildResult = await buildReactUI({
        config,
        buildRoot,
        registry: optionalBundleRegistry,
      });
    } catch (error) {
      throw wrapScriptError(error, {
        failedStage: "build-react-ui",
        details: {
          buildRoot,
          bundleId: "react-ui",
        },
      });
    }

    const optionalBundleResults = listOptionalBundles(optionalBundleRegistry).map((bundle) => {
      if (bundle.id === "react-ui") {
        return reactUIBuildResult || {
          bundleId: bundle.id,
          enabled: bundle.enabled,
          lane: bundle.lane,
          implementationStatus: bundle.implementationStatus,
          status: "skipped",
          reason: "not-built",
        };
      }

      return {
        bundleId: bundle.id,
        enabled: bundle.enabled,
        lane: bundle.lane,
        implementationStatus: bundle.implementationStatus,
        status: bundle.implementationStatus === "planned" ? "planned" : "skipped",
        reason: bundle.implementationStatus === "planned" ? "not-implemented" : "not-built",
      };
    });

    try {
      await writeBuildReport({
        buildRoot,
        bundlePath,
        config,
        optionalBundles: optionalBundleResults,
        moduleIdMode,
        semanticScrubMode,
        staticSurfaceMode,
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
