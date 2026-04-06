import fs from "node:fs";
import path from "node:path";

export const DEFAULT_OPTIONAL_BUNDLE_REGISTRY_RELATIVE_PATH = path.join("config", "optional-bundles.json");

const OPTIONAL_BUNDLE_LANES = new Set(["js-core", "ts-isolated"]);
const OPTIONAL_BUNDLE_IMPLEMENTATION_STATUSES = new Set(["implemented", "planned"]);

function fail(message) {
  throw new Error(message);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureArrayOfStrings(value, label, { allowEmpty = true } = {}) {
  if (!Array.isArray(value)) {
    fail(`${label} must be an array.`);
  }
  const normalized = value.map((entry) => String(entry || "").trim()).filter(Boolean);
  if (!allowEmpty && normalized.length === 0) {
    fail(`${label} must contain at least one non-empty string.`);
  }
  if (normalized.length !== value.length) {
    fail(`${label} must contain only non-empty strings.`);
  }
  return normalized;
}

function ensureNonEmptyString(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    fail(`${label} must be a non-empty string.`);
  }
  return normalized;
}

function normalizeBuildContract(build, prefix) {
  if (!build || typeof build !== "object" || Array.isArray(build)) {
    fail(`${prefix}.build must be an object.`);
  }

  return {
    scriptName: ensureNonEmptyString(build.scriptName, `${prefix}.build.scriptName`),
    entry: ensureNonEmptyString(build.entry, `${prefix}.build.entry`),
    stylesheet: ensureNonEmptyString(build.stylesheet, `${prefix}.build.stylesheet`),
    shell: ensureNonEmptyString(build.shell, `${prefix}.build.shell`),
    outputScript: ensureNonEmptyString(build.outputScript, `${prefix}.build.outputScript`),
    outputStyle: ensureNonEmptyString(build.outputStyle, `${prefix}.build.outputStyle`),
  };
}

function normalizeOptionalBundle(bundle, index) {
  const prefix = `optional bundles[${index}]`;
  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) {
    fail(`${prefix} must be an object.`);
  }

  const id = ensureNonEmptyString(bundle.id, `${prefix}.id`);
  const lane = ensureNonEmptyString(bundle.lane, `${prefix}.lane`);
  if (!OPTIONAL_BUNDLE_LANES.has(lane)) {
    fail(`${prefix}.lane must be one of: ${Array.from(OPTIONAL_BUNDLE_LANES).join(", ")}`);
  }

  const implementationStatus = ensureNonEmptyString(
    bundle.implementationStatus,
    `${prefix}.implementationStatus`,
  );
  if (!OPTIONAL_BUNDLE_IMPLEMENTATION_STATUSES.has(implementationStatus)) {
    fail(
      `${prefix}.implementationStatus must be one of: `
      + `${Array.from(OPTIONAL_BUNDLE_IMPLEMENTATION_STATUSES).join(", ")}`,
    );
  }

  const normalized = {
    id,
    enabled: bundle.enabled === true,
    lane,
    implementationStatus,
    summary: ensureNonEmptyString(bundle.summary, `${prefix}.summary`),
    build: null,
    docs: ensureArrayOfStrings(bundle.docs || [], `${prefix}.docs`),
  };

  if (implementationStatus === "implemented") {
    normalized.build = normalizeBuildContract(bundle.build, prefix);
  } else if (bundle.build != null) {
    normalized.build = normalizeBuildContract(bundle.build, prefix);
  }

  return normalized;
}

export function resolveOptionalBundleRegistryPath(projectRoot, options = {}) {
  const customPath = String(options.registryPath || "").trim();
  return customPath
    ? path.resolve(customPath)
    : path.join(path.resolve(projectRoot), DEFAULT_OPTIONAL_BUNDLE_REGISTRY_RELATIVE_PATH);
}

export function normalizeOptionalBundleRegistry(registry) {
  if (!registry || typeof registry !== "object" || Array.isArray(registry)) {
    fail("Optional bundle registry must be an object.");
  }
  if (!Number.isInteger(registry.schemaVersion) || registry.schemaVersion <= 0) {
    fail("Optional bundle registry must declare a positive integer schemaVersion.");
  }

  const summary = ensureNonEmptyString(registry.summary, "optional bundle registry.summary");
  if (!Array.isArray(registry.bundles) || registry.bundles.length === 0) {
    fail("Optional bundle registry must declare at least one bundle.");
  }

  const bundles = registry.bundles.map((bundle, index) => normalizeOptionalBundle(bundle, index));
  const seenIDs = new Set();
  bundles.forEach((bundle) => {
    if (seenIDs.has(bundle.id)) {
      fail(`Duplicate optional bundle id: ${bundle.id}`);
    }
    seenIDs.add(bundle.id);
  });

  return {
    schemaVersion: registry.schemaVersion,
    summary,
    bundles,
  };
}

export function loadOptionalBundleRegistry(projectRoot, options = {}) {
  const registryPath = resolveOptionalBundleRegistryPath(projectRoot, options);
  const registry = normalizeOptionalBundleRegistry(JSON.parse(fs.readFileSync(registryPath, "utf-8")));
  return {
    registryPath,
    registry,
  };
}

export function listOptionalBundles(registry) {
  return normalizeOptionalBundleRegistry(registry).bundles.map((entry) => clone(entry));
}

export function getOptionalBundle(registry, bundleId) {
  const id = String(bundleId || "").trim();
  if (!id) {
    return null;
  }
  const matched = normalizeOptionalBundleRegistry(registry).bundles.find((entry) => entry.id === id);
  return matched ? clone(matched) : null;
}

export function isOptionalBundleEnabled(registry, bundleId) {
  return Boolean(getOptionalBundle(registry, bundleId)?.enabled);
}

export function inspectOptionalBundleContracts(projectRoot, options = {}) {
  const { registryPath, registry } = options.registry
    ? {
        registryPath: resolveOptionalBundleRegistryPath(projectRoot, options),
        registry: normalizeOptionalBundleRegistry(options.registry),
      }
    : loadOptionalBundleRegistry(projectRoot, options);

  const packagePath = path.join(path.resolve(projectRoot), "package.json");
  const packageJSON = options.packageJSON
    || (fs.existsSync(packagePath) ? JSON.parse(fs.readFileSync(packagePath, "utf-8")) : null);

  const issues = [];

  registry.bundles.forEach((bundle) => {
    if (bundle.enabled && bundle.implementationStatus !== "implemented") {
      issues.push({
        bundleId: bundle.id,
        reason: "enabled-but-not-implemented",
        message: `Optional bundle \`${bundle.id}\` is enabled but only declared as ${bundle.implementationStatus}.`,
      });
    }

    if (!bundle.build) {
      return;
    }

    const requiredFiles = [
      bundle.build.entry,
      bundle.build.stylesheet,
      bundle.build.shell,
    ];

    requiredFiles.forEach((relativePath) => {
      if (!fs.existsSync(path.join(projectRoot, relativePath))) {
        issues.push({
          bundleId: bundle.id,
          reason: "missing-build-input",
          file: relativePath,
          message: `Optional bundle \`${bundle.id}\` is missing required build input: ${relativePath}`,
        });
      }
    });

    const buildScript = String(bundle.build.scriptName || "").trim();
    if (buildScript && typeof packageJSON?.scripts?.[buildScript] !== "string") {
      issues.push({
        bundleId: bundle.id,
        reason: "missing-package-script",
        scriptName: buildScript,
        message: `Optional bundle \`${bundle.id}\` requires package.json script \`${buildScript}\`.`,
      });
    }
  });

  return {
    ok: issues.length === 0,
    registryPath,
    packagePath,
    registry,
    issues,
  };
}
