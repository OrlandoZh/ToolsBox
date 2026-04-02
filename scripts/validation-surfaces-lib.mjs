import fs from "node:fs";
import path from "node:path";
import { loadZoteroHostSemanticIndexRegistry } from "./zotero-host-semantic-index-lib.mjs";

export const DEFAULT_VALIDATION_SURFACES_RELATIVE_PATH = path.join("config", "validation-surfaces.json");
export const DEFAULT_PROJECT_VALIDATION_SURFACES_RELATIVE_PATH = path.join("config", "project-validation-surfaces.json");
export const DEFAULT_VALIDATION_SURFACES_DOC_RELATIVE_PATH = path.join("docs", "VALIDATION_SURFACES.md");

function fail(message) {
  throw new Error(message);
}

function safeReadText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function ensureArrayOfStrings(value, label, { allowEmpty = false } = {}) {
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

function normalizeValidationSurface(entry, index) {
  const prefix = `validation surfaces[${index}]`;
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    fail(`${prefix} must be an object.`);
  }

  const id = String(entry.id || "").trim();
  const summary = String(entry.summary || "").trim();
  const kind = String(entry.kind || "").trim();
  if (!id || !summary || !kind) {
    fail(`${prefix} must declare non-empty id, summary, and kind.`);
  }
  if (!Number.isInteger(entry.version) || entry.version <= 0) {
    fail(`${prefix}.version must be a positive integer.`);
  }

  return {
    id,
    version: entry.version,
    summary,
    kind,
    entryMatchers: ensureArrayOfStrings(entry.entryMatchers, `${prefix}.entryMatchers`),
    hostSemanticDomains: ensureArrayOfStrings(entry.hostSemanticDomains, `${prefix}.hostSemanticDomains`),
    requiredHostAssertions: ensureArrayOfStrings(entry.requiredHostAssertions, `${prefix}.requiredHostAssertions`),
    supportsVisualEvidence: entry.supportsVisualEvidence !== false,
    nonGoals: ensureArrayOfStrings(entry.nonGoals, `${prefix}.nonGoals`),
  };
}

function normalizeProjectValidationSurface(entry, index, contractIds) {
  const prefix = `project validation surfaces[${index}]`;
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    fail(`${prefix} must be an object.`);
  }

  const id = String(entry.id || "").trim();
  const contractSurfaceId = String(entry.contractSurfaceId || "").trim();
  const summary = String(entry.summary || "").trim();
  if (!id || !contractSurfaceId || !summary) {
    fail(`${prefix} must declare non-empty id, contractSurfaceId, and summary.`);
  }
  if (contractIds && !contractIds.has(contractSurfaceId)) {
    fail(`${prefix}.contractSurfaceId references unknown contract surface: ${contractSurfaceId}`);
  }

  return {
    id,
    contractSurfaceId,
    summary,
    ownerPaths: ensureArrayOfStrings(entry.ownerPaths || [], `${prefix}.ownerPaths`, { allowEmpty: true }),
    smokeChecks: ensureArrayOfStrings(entry.smokeChecks || [], `${prefix}.smokeChecks`, { allowEmpty: true }),
    visualEvidencePolicy: String(entry.visualEvidencePolicy || "optional").trim() || "optional",
  };
}

export function resolveValidationSurfacesPath(projectRoot, options = {}) {
  const customPath = String(options.validationSurfacesPath || options.registryPath || "").trim();
  return customPath
    ? path.resolve(customPath)
    : path.join(path.resolve(projectRoot), DEFAULT_VALIDATION_SURFACES_RELATIVE_PATH);
}

export function resolveProjectValidationSurfacesPath(projectRoot, options = {}) {
  const customPath = String(options.projectValidationSurfacesPath || options.mirrorPath || "").trim();
  return customPath
    ? path.resolve(customPath)
    : path.join(path.resolve(projectRoot), DEFAULT_PROJECT_VALIDATION_SURFACES_RELATIVE_PATH);
}

export function normalizeValidationSurfacesRegistry(registry) {
  if (!registry || typeof registry !== "object" || Array.isArray(registry)) {
    fail("Validation surfaces registry must be an object.");
  }
  if (!Number.isInteger(registry.schemaVersion) || registry.schemaVersion <= 0) {
    fail("Validation surfaces registry must declare a positive integer schemaVersion.");
  }
  const summary = String(registry.summary || "").trim();
  if (!summary) {
    fail("Validation surfaces registry must declare a non-empty summary.");
  }
  if (!Array.isArray(registry.surfaces) || registry.surfaces.length === 0) {
    fail("Validation surfaces registry must declare at least one surface.");
  }

  const surfaces = registry.surfaces.map((entry, index) => normalizeValidationSurface(entry, index));
  const seenIds = new Set();
  surfaces.forEach((entry) => {
    if (seenIds.has(entry.id)) {
      fail(`Duplicate validation surface id: ${entry.id}`);
    }
    seenIds.add(entry.id);
  });

  return {
    schemaVersion: registry.schemaVersion,
    summary,
    surfaces,
  };
}

export function loadValidationSurfacesRegistry(projectRoot, options = {}) {
  const registryPath = resolveValidationSurfacesPath(projectRoot, options);
  const semanticRegistry = loadZoteroHostSemanticIndexRegistry(projectRoot, options).registry;
  const semanticDomainIds = new Set(semanticRegistry.domains.map((entry) => entry.id));
  const registry = normalizeValidationSurfacesRegistry(JSON.parse(fs.readFileSync(registryPath, "utf-8")));
  registry.surfaces.forEach((entry) => {
    entry.hostSemanticDomains.forEach((domainId) => {
      if (!semanticDomainIds.has(domainId)) {
        fail(`Validation surface ${entry.id} references unknown host semantic domain: ${domainId}`);
      }
    });
  });
  return {
    registryPath,
    registry,
  };
}

export function normalizeProjectValidationSurfacesMirror(mirror, registry = null) {
  if (!mirror || typeof mirror !== "object" || Array.isArray(mirror)) {
    fail("Project validation surfaces mirror must be an object.");
  }
  if (!Number.isInteger(mirror.schemaVersion) || mirror.schemaVersion <= 0) {
    fail("Project validation surfaces mirror must declare a positive integer schemaVersion.");
  }

  const status = String(mirror.status || "").trim();
  if (!["not-entered", "active", "completed"].includes(status)) {
    fail("Project validation surfaces mirror status must be one of not-entered, active, completed.");
  }

  const summary = String(mirror.summary || "").trim();
  if (!summary) {
    fail("Project validation surfaces mirror must declare a non-empty summary.");
  }

  const contractIds = registry ? new Set(registry.surfaces.map((entry) => entry.id)) : null;
  const surfaces = Array.isArray(mirror.surfaces)
    ? mirror.surfaces.map((entry, index) => normalizeProjectValidationSurface(entry, index, contractIds))
    : fail("Project validation surfaces mirror must declare surfaces.");

  if (status === "not-entered" && surfaces.length > 0) {
    fail("Not-entered project validation surfaces mirrors must keep surfaces empty.");
  }
  if (status !== "not-entered" && surfaces.length === 0) {
    fail("Active/completed project validation surfaces mirrors must declare at least one surface.");
  }

  const seenIds = new Set();
  surfaces.forEach((entry) => {
    if (seenIds.has(entry.id)) {
      fail(`Duplicate project validation surface id: ${entry.id}`);
    }
    seenIds.add(entry.id);
    if (status !== "not-entered") {
      if (entry.ownerPaths.length === 0) {
        fail(`Project validation surface ${entry.id} must declare ownerPaths when active/completed.`);
      }
      if (entry.smokeChecks.length === 0) {
        fail(`Project validation surface ${entry.id} must declare smokeChecks when active/completed.`);
      }
    }
  });

  return {
    schemaVersion: mirror.schemaVersion,
    status,
    summary,
    surfaces,
  };
}

export function loadProjectValidationSurfacesMirror(projectRoot, options = {}) {
  const mirrorPath = resolveProjectValidationSurfacesPath(projectRoot, options);
  const source = safeReadText(mirrorPath);
  if (source === null) {
    return {
      mirrorPath,
      mirror: null,
      missing: true,
    };
  }
  const { registry } = loadValidationSurfacesRegistry(projectRoot, options);
  return {
    mirrorPath,
    mirror: normalizeProjectValidationSurfacesMirror(JSON.parse(source), registry),
    missing: false,
  };
}

export function inspectSurfaceVerificationScaffold(projectRoot, options = {}) {
  const { registryPath, registry } = loadValidationSurfacesRegistry(projectRoot, options);
  const projectMirrorPath = resolveProjectValidationSurfacesPath(projectRoot, options);
  const source = safeReadText(projectMirrorPath);

  if (source === null) {
    return {
      status: "missing-project-mirror",
      contractRegistryPath: registryPath,
      projectMirrorPath,
      projectMirror: {
        status: "missing",
        surfaces: [],
      },
      checks: [
        {
          type: "projectMirror",
          key: DEFAULT_PROJECT_VALIDATION_SURFACES_RELATIVE_PATH,
          ok: false,
          expected: `\`${DEFAULT_PROJECT_VALIDATION_SURFACES_RELATIVE_PATH}\` exists and declares the current host-visible surfaces.`,
          actual: "missing",
        },
      ],
    };
  }

  const mirror = normalizeProjectValidationSurfacesMirror(JSON.parse(source), registry);
  const checks = [
    {
      type: "projectMirror",
      key: DEFAULT_PROJECT_VALIDATION_SURFACES_RELATIVE_PATH,
      ok: true,
      expected: `\`${DEFAULT_PROJECT_VALIDATION_SURFACES_RELATIVE_PATH}\` exists and declares the current host-visible surfaces.`,
      actual: `status=${mirror.status}; surfaces=${mirror.surfaces.length}`,
    },
  ];

  return {
    status: "passed",
    contractRegistryPath: registryPath,
    projectMirrorPath,
    projectMirror: mirror,
    checks,
  };
}

export function renderValidationSurfacesMarkdown(registry) {
  const normalized = normalizeValidationSurfacesRegistry(registry);
  const lines = [
    "# Validation Surfaces",
    "",
    "> Generated from `config/validation-surfaces.json`. Edit the registry and run `npm run docs:sync-validation-surfaces`.",
    "",
    `- Summary: ${normalized.summary}`,
    "",
    "## Contract Surfaces",
    "",
  ];

  normalized.surfaces.forEach((entry, index) => {
    if (index > 0) {
      lines.push("");
    }
    lines.push(`### \`${entry.id}\``);
    lines.push("");
    lines.push(`- Version: \`${entry.version}\``);
    lines.push(`- Kind: \`${entry.kind}\``);
    lines.push(`- Summary: ${entry.summary}`);
    lines.push(`- Supports Visual Evidence: \`${entry.supportsVisualEvidence}\``);
    lines.push("- Entry Matchers:");
    entry.entryMatchers.forEach((matcher) => lines.push(`  - \`${matcher}\``));
    lines.push("- Host Semantic Domains:");
    entry.hostSemanticDomains.forEach((domainId) => lines.push(`  - \`${domainId}\``));
    lines.push("- Required Host Assertions:");
    entry.requiredHostAssertions.forEach((assertion) => lines.push(`  - ${assertion}`));
    lines.push("- Non-Goals:");
    entry.nonGoals.forEach((goal) => lines.push(`  - ${goal}`));
  });

  return `${lines.join("\n")}\n`;
}
