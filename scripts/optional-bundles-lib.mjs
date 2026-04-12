import fs from "node:fs";
import path from "node:path";

export const DEFAULT_OPTIONAL_BUNDLE_REGISTRY_RELATIVE_PATH = path.join("config", "optional-bundles.json");

const OPTIONAL_BUNDLE_LANES = new Set(["js-core", "ts-isolated"]);
const OPTIONAL_BUNDLE_IMPLEMENTATION_STATUSES = new Set(["implemented", "planned"]);
const OPTIONAL_BUNDLE_ARTIFACT_KINDS = new Set(["window-shell", "surface-bridge"]);

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

function normalizeOptionalString(value, label) {
  if (value == null || value === "") {
    return null;
  }
  return ensureNonEmptyString(value, label);
}

function normalizeBuildArtifactContract(artifact, prefix, index) {
  const artifactPrefix = `${prefix}.build.artifacts[${index}]`;
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    fail(`${artifactPrefix} must be an object.`);
  }

  const kind = normalizeOptionalString(artifact.kind, `${artifactPrefix}.kind`) || "window-shell";
  if (!OPTIONAL_BUNDLE_ARTIFACT_KINDS.has(kind)) {
    fail(
      `${artifactPrefix}.kind must be one of: `
      + `${Array.from(OPTIONAL_BUNDLE_ARTIFACT_KINDS).join(", ")}`,
    );
  }

  const shell = normalizeOptionalString(artifact.shell, `${artifactPrefix}.shell`);
  if (kind === "window-shell" && !shell) {
    fail(`${artifactPrefix}.shell must be a non-empty string.`);
  }

  return {
    id: ensureNonEmptyString(artifact.id, `${artifactPrefix}.id`),
    kind,
    summary: ensureNonEmptyString(artifact.summary, `${artifactPrefix}.summary`),
    entry: ensureNonEmptyString(artifact.entry, `${artifactPrefix}.entry`),
    stylesheet: ensureNonEmptyString(artifact.stylesheet, `${artifactPrefix}.stylesheet`),
    shell,
    outputScript: ensureNonEmptyString(artifact.outputScript, `${artifactPrefix}.outputScript`),
    outputStyle: ensureNonEmptyString(artifact.outputStyle, `${artifactPrefix}.outputStyle`),
    globalKey: normalizeOptionalString(artifact.globalKey, `${artifactPrefix}.globalKey`),
  };
}

function normalizeBuildContract(build, prefix) {
  if (!build || typeof build !== "object" || Array.isArray(build)) {
    fail(`${prefix}.build must be an object.`);
  }

  let artifacts = [];
  if (Array.isArray(build.artifacts)) {
    artifacts = build.artifacts.map((artifact, index) => (
      normalizeBuildArtifactContract(artifact, prefix, index)
    ));
  } else if (
    typeof build.entry === "string"
    || typeof build.stylesheet === "string"
    || typeof build.shell === "string"
    || typeof build.outputScript === "string"
    || typeof build.outputStyle === "string"
  ) {
    artifacts = [
      normalizeBuildArtifactContract(
        {
          id: "default",
          kind: "window-shell",
          summary: "Legacy single-artifact build contract.",
          entry: build.entry,
          stylesheet: build.stylesheet,
          shell: build.shell,
          outputScript: build.outputScript,
          outputStyle: build.outputStyle,
          globalKey: build.globalKey,
        },
        prefix,
        0,
      ),
    ];
  } else {
    fail(`${prefix}.build.artifacts must be a non-empty array.`);
  }

  if (artifacts.length === 0) {
    fail(`${prefix}.build.artifacts must be a non-empty array.`);
  }

  const seenArtifactIDs = new Set();
  artifacts.forEach((artifact) => {
    if (seenArtifactIDs.has(artifact.id)) {
      fail(`${prefix}.build.artifacts has duplicate id: ${artifact.id}`);
    }
    seenArtifactIDs.add(artifact.id);
  });

  return {
    scriptName: ensureNonEmptyString(build.scriptName, `${prefix}.build.scriptName`),
    requiredPackages: ensureArrayOfStrings(
      build.requiredPackages || [],
      `${prefix}.build.requiredPackages`,
    ),
    artifacts,
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

export function listOptionalBundleRequiredPackages(registry) {
  const normalizedRegistry = normalizeOptionalBundleRegistry(registry);
  const packageNames = new Set();

  normalizedRegistry.bundles.forEach((bundle) => {
    if (!bundle.build) {
      return;
    }
    bundle.build.requiredPackages.forEach((packageName) => {
      packageNames.add(packageName);
    });
  });

  return Array.from(packageNames).sort();
}

function hasPackageDependency(packageJSON, packageName) {
  if (!packageJSON || typeof packageJSON !== "object") {
    return false;
  }

  return Boolean(
    packageJSON.dependencies?.[packageName]
    || packageJSON.devDependencies?.[packageName],
  );
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

    bundle.build.artifacts.forEach((artifact) => {
      const requiredFiles = [
        artifact.entry,
        artifact.stylesheet,
        ...(artifact.shell ? [artifact.shell] : []),
      ];

      requiredFiles.forEach((relativePath) => {
        if (!fs.existsSync(path.join(projectRoot, relativePath))) {
          issues.push({
            bundleId: bundle.id,
            artifactId: artifact.id,
            reason: "missing-build-input",
            file: relativePath,
            message: `Optional bundle \`${bundle.id}\` artifact \`${artifact.id}\` is missing required build input: ${relativePath}`,
          });
        }
      });
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

    bundle.build.requiredPackages.forEach((packageName) => {
      if (hasPackageDependency(packageJSON, packageName)) {
        return;
      }

      issues.push({
        bundleId: bundle.id,
        reason: "missing-required-package",
        packageName,
        message: `Optional bundle \`${bundle.id}\` requires package.json dependency \`${packageName}\`.`,
      });
    });
  });

  return {
    ok: issues.length === 0,
    registryPath,
    packagePath,
    registry,
    issues,
  };
}
