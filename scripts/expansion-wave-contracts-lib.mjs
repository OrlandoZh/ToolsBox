import fs from "node:fs";
import path from "node:path";

export const DEFAULT_EXPANSION_WAVE_CONTRACTS_RELATIVE_PATH = path.join("config", "expansion-wave-contracts.json");
export const DEFAULT_PROJECT_EXPANSION_WAVE_RELATIVE_PATH = path.join("config", "project-expansion-wave.json");
export const DEFAULT_EXPANSION_WAVE_CONTRACT_DOC_RELATIVE_PATH = path.join("docs", "EXPANSION_WAVE_CONTRACTS.md");

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

function normalizeModuleArchetype(entry, index, labelPrefix) {
  const prefix = `${labelPrefix}[${index}]`;
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    fail(`${prefix} must be an object.`);
  }
  const id = String(entry.id || "").trim();
  const summary = String(entry.summary || "").trim();
  const defaultValidationProfile = String(entry.defaultValidationProfile || "").trim();
  if (!id || !summary || !defaultValidationProfile) {
    fail(`${prefix} must declare non-empty id, summary, and defaultValidationProfile.`);
  }
  return {
    id,
    summary,
    defaultValidationProfile,
  };
}

function normalizeExpansionWaveContract(entry, index) {
  const prefix = `contracts[${index}]`;
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    fail(`${prefix} must be an object.`);
  }
  const id = String(entry.id || "").trim();
  const summary = String(entry.summary || "").trim();
  const defaultValidationProfile = String(entry.defaultValidationProfile || "").trim();
  if (!id || !summary || !defaultValidationProfile) {
    fail(`${prefix} must declare non-empty id, summary, and defaultValidationProfile.`);
  }
  if (!Number.isInteger(entry.version) || entry.version <= 0) {
    fail(`${prefix}.version must be a positive integer.`);
  }

  const moduleArchetypes = Array.isArray(entry.moduleArchetypes)
    ? entry.moduleArchetypes.map((item, itemIndex) => normalizeModuleArchetype(item, itemIndex, `${prefix}.moduleArchetypes`))
    : fail(`${prefix}.moduleArchetypes must be an array.`);
  const seenArchetypes = new Set();
  moduleArchetypes.forEach((item) => {
    if (seenArchetypes.has(item.id)) {
      fail(`${prefix}.moduleArchetypes contains duplicate archetype id: ${item.id}`);
    }
    seenArchetypes.add(item.id);
  });

  return {
    id,
    version: entry.version,
    summary,
    moduleArchetypes,
    defaultValidationProfile,
    requiredPlanningArtifacts: ensureArrayOfStrings(entry.requiredPlanningArtifacts, `${prefix}.requiredPlanningArtifacts`),
    requiredGateSignals: ensureArrayOfStrings(entry.requiredGateSignals, `${prefix}.requiredGateSignals`),
    nonGoals: ensureArrayOfStrings(entry.nonGoals, `${prefix}.nonGoals`),
  };
}

function normalizeProjectModuleArchetype(entry, index) {
  const prefix = `moduleArchetypes[${index}]`;
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    fail(`${prefix} must be an object.`);
  }
  const module = String(entry.module || "").trim();
  const archetype = String(entry.archetype || "").trim();
  if (!module || !archetype) {
    fail(`${prefix} must declare non-empty module and archetype.`);
  }
  return { module, archetype };
}

export function resolveExpansionWaveContractsPath(projectRoot, options = {}) {
  const customPath = String(options.expansionWaveContractsPath || options.registryPath || "").trim();
  return customPath
    ? path.resolve(customPath)
    : path.join(path.resolve(projectRoot), DEFAULT_EXPANSION_WAVE_CONTRACTS_RELATIVE_PATH);
}

export function resolveProjectExpansionWavePath(projectRoot, options = {}) {
  const customPath = String(options.projectExpansionWavePath || options.mirrorPath || "").trim();
  return customPath
    ? path.resolve(customPath)
    : path.join(path.resolve(projectRoot), DEFAULT_PROJECT_EXPANSION_WAVE_RELATIVE_PATH);
}

export function normalizeExpansionWaveContractsRegistry(registry) {
  if (!registry || typeof registry !== "object" || Array.isArray(registry)) {
    fail("Expansion wave contract registry must be an object.");
  }
  if (!Number.isInteger(registry.schemaVersion) || registry.schemaVersion <= 0) {
    fail("Expansion wave contract registry must declare a positive integer schemaVersion.");
  }
  const summary = String(registry.summary || "").trim();
  if (!summary) {
    fail("Expansion wave contract registry must declare a non-empty summary.");
  }
  if (!Array.isArray(registry.contracts) || registry.contracts.length === 0) {
    fail("Expansion wave contract registry must declare at least one contract.");
  }

  const contracts = registry.contracts.map((entry, index) => normalizeExpansionWaveContract(entry, index));
  return {
    schemaVersion: registry.schemaVersion,
    summary,
    contracts,
  };
}

export function loadExpansionWaveContractsRegistry(projectRoot, options = {}) {
  const registryPath = resolveExpansionWaveContractsPath(projectRoot, options);
  return {
    registryPath,
    registry: normalizeExpansionWaveContractsRegistry(JSON.parse(fs.readFileSync(registryPath, "utf-8"))),
  };
}

export function normalizeProjectExpansionWaveMirror(mirror, contractRegistry = null) {
  if (!mirror || typeof mirror !== "object" || Array.isArray(mirror)) {
    fail("Project expansion wave mirror must be an object.");
  }
  if (!Number.isInteger(mirror.schemaVersion) || mirror.schemaVersion <= 0) {
    fail("Project expansion wave mirror must declare a positive integer schemaVersion.");
  }

  const status = String(mirror.status || "").trim();
  if (!["not-entered", "active", "completed"].includes(status)) {
    fail("Project expansion wave mirror status must be one of not-entered, active, completed.");
  }

  const currentContractId = String(mirror.currentContractId || "").trim();
  const currentWaveName = String(mirror.currentWaveName || "").trim();
  const summary = String(mirror.summary || "").trim();
  const inScopeModules = ensureArrayOfStrings(mirror.inScopeModules || [], "inScopeModules", { allowEmpty: true });
  const outOfScopeModules = ensureArrayOfStrings(mirror.outOfScopeModules || [], "outOfScopeModules", { allowEmpty: true });
  const moduleArchetypes = Array.isArray(mirror.moduleArchetypes)
    ? mirror.moduleArchetypes.map((entry, index) => normalizeProjectModuleArchetype(entry, index))
    : fail("moduleArchetypes must be an array.");
  const acceptanceTrack = String(mirror.acceptanceTrack || "").trim();
  const explicitVisualUpgradeModules = ensureArrayOfStrings(
    mirror.explicitVisualUpgradeModules || [],
    "explicitVisualUpgradeModules",
    { allowEmpty: true },
  );

  if (!currentContractId) {
    fail("Project expansion wave mirror must declare currentContractId.");
  }
  if (!summary) {
    fail("Project expansion wave mirror must declare a non-empty summary.");
  }

  let contract = null;
  if (contractRegistry) {
    contract = contractRegistry.contracts.find((entry) => entry.id === currentContractId);
    if (!contract) {
      fail(`Project expansion wave mirror references unknown contract: ${currentContractId}`);
    }
    const allowedArchetypes = new Set(contract.moduleArchetypes.map((entry) => entry.id));
    moduleArchetypes.forEach((entry) => {
      if (!allowedArchetypes.has(entry.archetype)) {
        fail(`Unknown module archetype in project expansion wave mirror: ${entry.archetype}`);
      }
    });
  }

  const moduleSet = new Set();
  moduleArchetypes.forEach((entry) => {
    if (moduleSet.has(entry.module)) {
      fail(`Duplicate moduleArchetypes entry: ${entry.module}`);
    }
    moduleSet.add(entry.module);
  });

  if (status === "not-entered") {
    if (currentWaveName) {
      fail("Not-entered expansion wave mirrors must keep currentWaveName empty.");
    }
    if (inScopeModules.length > 0) {
      fail("Not-entered expansion wave mirrors must keep inScopeModules empty.");
    }
    if (moduleArchetypes.length > 0) {
      fail("Not-entered expansion wave mirrors must keep moduleArchetypes empty.");
    }
    if (acceptanceTrack) {
      fail("Not-entered expansion wave mirrors must keep acceptanceTrack empty.");
    }
    if (explicitVisualUpgradeModules.length > 0) {
      fail("Not-entered expansion wave mirrors must keep explicitVisualUpgradeModules empty.");
    }
  } else {
    if (!currentWaveName) {
      fail("Active/completed expansion waves must declare currentWaveName.");
    }
    if (inScopeModules.length === 0) {
      fail("Active/completed expansion waves must declare at least one inScopeModules entry.");
    }
    if (!acceptanceTrack) {
      fail("Active/completed expansion waves must declare acceptanceTrack.");
    }
    inScopeModules.forEach((module) => {
      if (!moduleSet.has(module)) {
        fail(`Missing moduleArchetypes entry for in-scope module: ${module}`);
      }
    });
    moduleArchetypes.forEach((entry) => {
      if (!inScopeModules.includes(entry.module)) {
        fail(`moduleArchetypes contains module not declared in inScopeModules: ${entry.module}`);
      }
    });
    explicitVisualUpgradeModules.forEach((module) => {
      if (!inScopeModules.includes(module)) {
        fail(`explicitVisualUpgradeModules contains module outside inScopeModules: ${module}`);
      }
    });
  }

  return {
    schemaVersion: mirror.schemaVersion,
    status,
    currentContractId,
    currentWaveName,
    summary,
    inScopeModules,
    outOfScopeModules,
    moduleArchetypes,
    acceptanceTrack,
    explicitVisualUpgradeModules,
    availableArchetypes: contract ? contract.moduleArchetypes.map((entry) => entry.id) : [],
  };
}

export function loadProjectExpansionWaveMirror(projectRoot, options = {}) {
  const mirrorPath = resolveProjectExpansionWavePath(projectRoot, options);
  const { registry } = options.contractRegistry
    ? { registry: normalizeExpansionWaveContractsRegistry(options.contractRegistry) }
    : loadExpansionWaveContractsRegistry(projectRoot, options);
  return {
    mirrorPath,
    mirror: normalizeProjectExpansionWaveMirror(JSON.parse(fs.readFileSync(mirrorPath, "utf-8")), registry),
  };
}

export function renderExpansionWaveContractMarkdown(registry) {
  const normalizedRegistry = normalizeExpansionWaveContractsRegistry(registry);
  const lines = [
    "# Expansion Wave Contracts",
    "",
    "> Generated from `config/expansion-wave-contracts.json`. Edit the registry and run `npm run docs:sync-expansion-wave-contracts`.",
    "",
    "## Summary",
    "",
    `- ${normalizedRegistry.summary}`,
    "",
    "## Contracts",
    "",
  ];

  normalizedRegistry.contracts.forEach((contract, index) => {
    if (index > 0) {
      lines.push("");
    }
    lines.push(`### \`${contract.id}\``);
    lines.push("");
    lines.push(`- Version: \`${contract.version}\``);
    lines.push(`- Summary: ${contract.summary}`);
    lines.push(`- Default Validation Profile: \`${contract.defaultValidationProfile}\``);
    lines.push("- Module Archetypes:");
    contract.moduleArchetypes.forEach((entry) => {
      lines.push(`  - \`${entry.id}\`: ${entry.summary} (default=\`${entry.defaultValidationProfile}\`)`);
    });
    lines.push("- Required Planning Artifacts:");
    contract.requiredPlanningArtifacts.forEach((entry) => lines.push(`  - ${entry}`));
    lines.push("- Required Gate Signals:");
    contract.requiredGateSignals.forEach((entry) => lines.push(`  - \`${entry}\``));
    lines.push("- Non-Goals:");
    contract.nonGoals.forEach((entry) => lines.push(`  - ${entry}`));
  });

  return `${lines.join("\n")}\n`;
}

export function inspectExpansionWaveScaffold(projectRoot, options = {}) {
  const absoluteProjectRoot = path.resolve(projectRoot);
  const result = {
    status: "failed",
    contractRegistryPath: resolveExpansionWaveContractsPath(absoluteProjectRoot, options),
    projectMirrorPath: resolveProjectExpansionWavePath(absoluteProjectRoot, options),
    docPath: path.join(absoluteProjectRoot, DEFAULT_EXPANSION_WAVE_CONTRACT_DOC_RELATIVE_PATH),
    checks: [],
    contractRegistry: null,
    projectMirror: null,
  };

  let registry = null;
  try {
    registry = loadExpansionWaveContractsRegistry(absoluteProjectRoot, options).registry;
    result.contractRegistry = registry;
    result.checks.push({
      type: "contractRegistry",
      key: DEFAULT_EXPANSION_WAVE_CONTRACTS_RELATIVE_PATH,
      ok: true,
      expected: `\`${DEFAULT_EXPANSION_WAVE_CONTRACTS_RELATIVE_PATH}\` is valid`,
      actual: "valid",
    });
  } catch (error) {
    result.checks.push({
      type: "contractRegistry",
      key: DEFAULT_EXPANSION_WAVE_CONTRACTS_RELATIVE_PATH,
      ok: false,
      expected: `\`${DEFAULT_EXPANSION_WAVE_CONTRACTS_RELATIVE_PATH}\` is valid`,
      actual: error instanceof Error ? error.message : String(error),
    });
  }

  const docSource = safeReadText(result.docPath);
  if (registry && docSource !== null) {
    const expectedDoc = renderExpansionWaveContractMarkdown(registry);
    result.checks.push({
      type: "docMirror",
      key: DEFAULT_EXPANSION_WAVE_CONTRACT_DOC_RELATIVE_PATH,
      ok: docSource === expectedDoc,
      expected: `\`${DEFAULT_EXPANSION_WAVE_CONTRACT_DOC_RELATIVE_PATH}\` matches rendered expansion wave contract markdown`,
      actual: docSource === expectedDoc ? "in sync" : "drifted",
    });
  } else {
    result.checks.push({
      type: "docMirror",
      key: DEFAULT_EXPANSION_WAVE_CONTRACT_DOC_RELATIVE_PATH,
      ok: false,
      expected: `\`${DEFAULT_EXPANSION_WAVE_CONTRACT_DOC_RELATIVE_PATH}\` matches rendered expansion wave contract markdown`,
      actual: docSource === null ? "file missing" : "registry unavailable",
    });
  }

  try {
    const mirrorSource = safeReadText(result.projectMirrorPath);
    if (mirrorSource === null) {
      throw new Error(`Missing project expansion wave mirror: ${DEFAULT_PROJECT_EXPANSION_WAVE_RELATIVE_PATH}`);
    }
    const parsedMirror = JSON.parse(mirrorSource);
    const mirror = normalizeProjectExpansionWaveMirror(parsedMirror, registry);
    result.projectMirror = mirror;
    result.checks.push({
      type: "projectWaveMirror",
      key: DEFAULT_PROJECT_EXPANSION_WAVE_RELATIVE_PATH,
      ok: true,
      expected: `\`${DEFAULT_PROJECT_EXPANSION_WAVE_RELATIVE_PATH}\` declares a valid expansion wave state`,
      actual: `status=${mirror.status}; contract=${mirror.currentContractId}`,
    });
  } catch (error) {
    result.checks.push({
      type: "projectWaveMirror",
      key: DEFAULT_PROJECT_EXPANSION_WAVE_RELATIVE_PATH,
      ok: false,
      expected: `\`${DEFAULT_PROJECT_EXPANSION_WAVE_RELATIVE_PATH}\` declares a valid expansion wave state`,
      actual: error instanceof Error ? error.message : String(error),
    });
  }

  result.status = result.checks.every((entry) => entry.ok) ? "passed" : "failed";
  return result;
}
