import fs from "node:fs";
import path from "node:path";
import { inspectExpansionWaveScaffold } from "./expansion-wave-contracts-lib.mjs";
import { inspectSurfaceVerificationScaffold } from "./validation-surfaces-lib.mjs";

export const DEFAULT_BUNDLE_REGISTRY_RELATIVE_PATH = path.join("config", "framework-backfill-bundles.json");
export const DEFAULT_BUNDLE_DOC_RELATIVE_PATH = path.join("docs", "FRAMEWORK_BACKFILL_BUNDLES.md");
export const DEFAULT_RUN_ALL_RELATIVE_PATH = path.join("tests", "run-all.js");

function fail(message) {
  throw new Error(message);
}

function ensureArrayOfStrings(value, label) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || String(entry).trim() === "")) {
    fail(`${label} must be an array of non-empty strings.`);
  }
}

function normalizeStringArray(value) {
  return value.map((entry) => String(entry).trim());
}

function describePackageScriptRule(rule) {
  if (typeof rule.exact === "string") {
    return `\`${rule.name}\` = \`${rule.exact}\``;
  }
  return `\`${rule.name}\` includes ${rule.includes.map((entry) => `\`${entry}\``).join(" + ")}`;
}

function normalizeAgentRule(rule, label) {
  if (typeof rule === "string") {
    const normalized = String(rule).trim();
    if (!normalized) {
      fail(`${label} must be a non-empty string.`);
    }
    return {
      label: normalized,
      match: {
        anyOf: [normalized],
      },
      legacyShape: "string",
    };
  }

  if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
    fail(`${label} must be a string or object.`);
  }

  const normalizedLabel = String(rule.label || "").trim();
  if (!normalizedLabel) {
    fail(`${label}.label must be a non-empty string.`);
  }

  if (rule.match && (typeof rule.match !== "object" || Array.isArray(rule.match))) {
    fail(`${label}.match must be an object when provided.`);
  }

  const legacyAnyOf = Array.isArray(rule.anyOf) ? normalizeStringArray(rule.anyOf) : null;
  const matchAnyOf = Array.isArray(rule.match?.anyOf) ? normalizeStringArray(rule.match.anyOf) : null;
  const matchAllOf = Array.isArray(rule.match?.allOf) ? normalizeStringArray(rule.match.allOf) : null;

  if (legacyAnyOf && legacyAnyOf.length === 0) {
    fail(`${label}.anyOf must be an array of non-empty strings.`);
  }
  if (matchAnyOf && matchAnyOf.length === 0) {
    fail(`${label}.match.anyOf must be an array of non-empty strings.`);
  }
  if (matchAllOf && matchAllOf.length === 0) {
    fail(`${label}.match.allOf must be an array of non-empty strings.`);
  }

  const normalizedMatch = {};
  if (matchAnyOf?.length) {
    normalizedMatch.anyOf = matchAnyOf;
  } else if (legacyAnyOf?.length) {
    normalizedMatch.anyOf = legacyAnyOf;
  }
  if (matchAllOf?.length) {
    normalizedMatch.allOf = matchAllOf;
  }

  if (!normalizedMatch.anyOf && !normalizedMatch.allOf) {
    fail(`${label} must declare match.anyOf or match.allOf.`);
  }

  return {
    label: normalizedLabel,
    match: normalizedMatch,
    legacyShape: legacyAnyOf?.length ? "label-anyOf" : "match-object",
  };
}

function describeAgentRule(rule) {
  return rule.label;
}

function matchAgentRule(source, rule) {
  const normalizedSource = String(source || "");
  const anyOfMatch = Array.isArray(rule.match.anyOf)
    ? rule.match.anyOf.find((entry) => normalizedSource.includes(entry)) || null
    : null;
  const allOfMatches = Array.isArray(rule.match.allOf)
    ? rule.match.allOf.filter((entry) => normalizedSource.includes(entry))
    : [];
  const missingAllOf = Array.isArray(rule.match.allOf)
    ? rule.match.allOf.filter((entry) => !normalizedSource.includes(entry))
    : [];
  const ok = (!Array.isArray(rule.match.anyOf) || anyOfMatch !== null)
    && (!Array.isArray(rule.match.allOf) || missingAllOf.length === 0);

  return {
    ok,
    matchedVariant: {
      label: rule.label,
      anyOf: anyOfMatch,
      allOf: allOfMatches,
    },
    actual: anyOfMatch || (allOfMatches.length > 0 ? allOfMatches.join(" + ") : null),
    missingAllOf,
  };
}

function normalizeBundle(bundle, index, registrySchemaVersion) {
  const prefix = `bundles[${index}]`;
  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) {
    fail(`${prefix} must be an object.`);
  }

  const normalizedId = String(bundle.id || "").trim();
  if (!normalizedId) {
    fail(`${prefix}.id must be a non-empty string.`);
  }
  if (!Number.isInteger(bundle.version) || bundle.version <= 0) {
    fail(`${prefix}.version must be a positive integer.`);
  }
  const normalizedSummary = String(bundle.summary || "").trim();
  if (!normalizedSummary) {
    fail(`${prefix}.summary must be a non-empty string.`);
  }

  ensureArrayOfStrings(bundle.requiredFiles, `${prefix}.requiredFiles`);
  ensureArrayOfStrings(bundle.requiredTests, `${prefix}.requiredTests`);
  ensureArrayOfStrings(bundle.nonGoals, `${prefix}.nonGoals`);

  const lifecycle = String(bundle.lifecycle || (registrySchemaVersion >= 2 ? "" : "active")).trim();
  if (!["active", "deprecated", "superseded"].includes(lifecycle)) {
    fail(`${prefix}.lifecycle must be one of active, deprecated, superseded.`);
  }
  const supersededBy = bundle.supersededBy == null ? null : String(bundle.supersededBy).trim();
  if (lifecycle === "superseded") {
    if (!supersededBy) {
      fail(`${prefix}.supersededBy must be a non-empty string when lifecycle is superseded.`);
    }
  } else if (supersededBy) {
    fail(`${prefix}.supersededBy is only allowed when lifecycle is superseded.`);
  }

  if (!Array.isArray(bundle.requiredAgentRules) || bundle.requiredAgentRules.length === 0) {
    fail(`${prefix}.requiredAgentRules must be a non-empty array.`);
  }
  const requiredAgentRules = bundle.requiredAgentRules.map((rule, ruleIndex) => normalizeAgentRule(
    rule,
    `${prefix}.requiredAgentRules[${ruleIndex}]`,
  ));

  if (!Array.isArray(bundle.requiredPackageScripts) || bundle.requiredPackageScripts.length === 0) {
    fail(`${prefix}.requiredPackageScripts must be a non-empty array.`);
  }
  const requiredPackageScripts = bundle.requiredPackageScripts.map((rule, ruleIndex) => {
    const rulePrefix = `${prefix}.requiredPackageScripts[${ruleIndex}]`;
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
      fail(`${rulePrefix} must be an object.`);
    }
    const name = String(rule.name || "").trim();
    if (!name) {
      fail(`${rulePrefix}.name must be a non-empty string.`);
    }
    const exact = typeof rule.exact === "string" ? String(rule.exact).trim() : null;
    const includes = Array.isArray(rule.includes) ? normalizeStringArray(rule.includes) : null;
    if (!exact && !(includes && includes.length > 0)) {
      fail(`${rulePrefix} must declare exact or includes.`);
    }
    if (includes) {
      ensureArrayOfStrings(includes, `${rulePrefix}.includes`);
    }
    return {
      name,
      ...(exact ? { exact } : {}),
      ...(includes?.length ? { includes } : {}),
    };
  });

  return {
    id: normalizedId,
    version: bundle.version,
    bundleVersion: bundle.version,
    summary: normalizedSummary,
    lifecycle,
    bundleLifecycle: lifecycle,
    ...(supersededBy ? { supersededBy } : {}),
    requiredFiles: normalizeStringArray(bundle.requiredFiles),
    requiredPackageScripts,
    requiredAgentRules,
    requiredTests: normalizeStringArray(bundle.requiredTests),
    nonGoals: normalizeStringArray(bundle.nonGoals),
  };
}

export function resolveBundleRegistryPath(projectRoot, options = {}) {
  const customPath = String(options.registryPath || "").trim();
  return customPath
    ? path.resolve(customPath)
    : path.join(path.resolve(projectRoot), DEFAULT_BUNDLE_REGISTRY_RELATIVE_PATH);
}

export function normalizeFrameworkBackfillBundleRegistry(registry) {
  if (!registry || typeof registry !== "object" || Array.isArray(registry)) {
    fail("Framework backfill bundle registry must be an object.");
  }
  if (!Number.isInteger(registry.schemaVersion) || registry.schemaVersion <= 0) {
    fail("Framework backfill bundle registry must declare a positive integer schemaVersion.");
  }
  const governanceGoal = String(registry.governanceGoal || "").trim();
  if (!governanceGoal) {
    fail("Framework backfill bundle registry must declare a non-empty governanceGoal.");
  }
  ensureArrayOfStrings(registry.bundleCreationCriteria, "bundleCreationCriteria");
  if (!Array.isArray(registry.bundles) || registry.bundles.length === 0) {
    fail("Framework backfill bundle registry must declare at least one bundle.");
  }

  const seenIds = new Set();
  const bundles = registry.bundles.map((bundle, index) => {
    const normalized = normalizeBundle(bundle, index, registry.schemaVersion);
    if (seenIds.has(normalized.id)) {
      fail(`Duplicate bundle id: ${normalized.id}`);
    }
    seenIds.add(normalized.id);
    return normalized;
  });

  return {
    schemaVersion: registry.schemaVersion,
    governanceGoal,
    bundleCreationCriteria: normalizeStringArray(registry.bundleCreationCriteria),
    bundles,
  };
}

export function loadFrameworkBackfillBundleRegistry(projectRoot, options = {}) {
  const registryPath = resolveBundleRegistryPath(projectRoot, options);
  const source = fs.readFileSync(registryPath, "utf-8");
  const registry = normalizeFrameworkBackfillBundleRegistry(JSON.parse(source));
  validateFrameworkBackfillBundleRegistry(registry);
  return {
    registryPath,
    registry,
  };
}

export function validateFrameworkBackfillBundleRegistry(registry) {
  normalizeFrameworkBackfillBundleRegistry(registry);
}

export function renderFrameworkBackfillBundleMarkdown(registry) {
  const normalizedRegistry = normalizeFrameworkBackfillBundleRegistry(registry);
  const lines = [
    "# Framework Backfill Bundles",
    "",
    "> Generated from `config/framework-backfill-bundles.json`. Edit the registry and run `npm run docs:sync-backfill-bundles`.",
    "",
    "## Governance Goal",
    "",
    `- ${normalizedRegistry.governanceGoal}`,
    "",
    "## AGENTS Rule Policy",
    "",
    "- 下游项目可以对 AGENTS 规则做产品化表述，但不得改变治理语义。",
    "- 模板审计以 matcher label 对应的治理意图为准，而不是逐字复读模板原句。",
    "",
    "## Bundle Admission Rules",
    "",
    ...normalizedRegistry.bundleCreationCriteria.map((item, index) => `${index + 1}. ${item}`),
    "",
    "## Bundles",
    "",
  ];

  normalizedRegistry.bundles.forEach((bundle, index) => {
    if (index > 0) {
      lines.push("");
    }
    lines.push(`### \`${bundle.id}\``);
    lines.push("");
    lines.push(`- Version: \`${bundle.version}\``);
    lines.push(`- Lifecycle: \`${bundle.lifecycle}\``);
    if (bundle.supersededBy) {
      lines.push(`- Superseded By: \`${bundle.supersededBy}\``);
    }
    lines.push(`- Summary: ${bundle.summary}`);
    lines.push("- Required Files:");
    bundle.requiredFiles.forEach((entry) => lines.push(`  - \`${entry}\``));
    lines.push("- Required Package Scripts:");
    bundle.requiredPackageScripts.forEach((entry) => lines.push(`  - ${describePackageScriptRule(entry)}`));
    lines.push("- Required AGENTS Rules:");
    bundle.requiredAgentRules.forEach((entry) => lines.push(`  - ${describeAgentRule(entry)}`));
    lines.push("- Required Tests:");
    bundle.requiredTests.forEach((entry) => lines.push(`  - \`${entry}\``));
    lines.push("- Non-Goals:");
    bundle.nonGoals.forEach((entry) => lines.push(`  - ${entry}`));
  });

  return `${lines.join("\n")}\n`;
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

function safeReadJSON(filePath) {
  const source = safeReadText(filePath);
  if (source === null) {
    return null;
  }
  try {
    return JSON.parse(source);
  } catch (error) {
    fail(`Invalid JSON: ${filePath}: ${error.message}`);
  }
}

function loadOptionalRegistryMirror(projectRoot) {
  const registryPath = resolveBundleRegistryPath(projectRoot);
  const source = safeReadText(registryPath);
  if (source === null) {
    return {
      status: "missing",
      registryPath,
      registry: null,
      error: null,
    };
  }
  try {
    return {
      status: "loaded",
      registryPath,
      registry: normalizeFrameworkBackfillBundleRegistry(JSON.parse(source)),
      error: null,
    };
  } catch (error) {
    return {
      status: "invalid",
      registryPath,
      registry: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function listImportedTestFiles(runAllSource) {
  return Array.from(String(runAllSource || "").matchAll(/import\s+['"]\.\/([^'"]+\.test\.js)['"];?/gu))
    .map((match) => String(match[1] || "").trim())
    .filter(Boolean);
}

function projectRetainsFrameworkGovernance(packageScripts) {
  return ["framework:governance:check", "framework:bundle:audit", "docs:sync-backfill-bundles"]
    .some((scriptName) => typeof packageScripts?.[scriptName] === "string" && String(packageScripts[scriptName]).trim() !== "");
}

function compareRegistryMirrorForBundle(bundle, options) {
  const { localRegistryInfo, requireLocalMirror } = options;

  if (!requireLocalMirror && localRegistryInfo.status === "missing") {
    return {
      status: "current",
      reasons: ["Project does not retain framework governance commands; local registry mirror is not required."],
      localBundleId: null,
      localBundleVersion: null,
      localBundleLifecycle: null,
    };
  }

  if (localRegistryInfo.status === "missing") {
    return {
      status: "missing-local-registry",
      reasons: ["Local framework bundle registry mirror is missing while framework governance commands are present."],
      localBundleId: null,
      localBundleVersion: null,
      localBundleLifecycle: null,
    };
  }

  if (localRegistryInfo.status === "invalid") {
    return {
      status: "drifted",
      reasons: [`Local framework bundle registry is invalid: ${localRegistryInfo.error}`],
      localBundleId: null,
      localBundleVersion: null,
      localBundleLifecycle: null,
    };
  }

  const reasons = [];
  if (localRegistryInfo.registry.schemaVersion !== options.authoritativeRegistry.schemaVersion) {
    reasons.push(`schemaVersion drift: local=${localRegistryInfo.registry.schemaVersion}; authoritative=${options.authoritativeRegistry.schemaVersion}`);
  }

  const localBundle = localRegistryInfo.registry.bundles.find((entry) => entry.id === bundle.id) || null;
  if (!localBundle) {
    reasons.push(`local bundle missing: ${bundle.id}`);
    return {
      status: "drifted",
      reasons,
      localBundleId: null,
      localBundleVersion: null,
      localBundleLifecycle: null,
    };
  }

  if (localBundle.version !== bundle.version) {
    reasons.push(`version drift: local=${localBundle.version}; authoritative=${bundle.version}`);
  }
  if (localBundle.lifecycle !== bundle.lifecycle) {
    reasons.push(`lifecycle drift: local=${localBundle.lifecycle}; authoritative=${bundle.lifecycle}`);
  }
  if (localBundle.summary !== bundle.summary) {
    reasons.push("summary drift");
  }
  if ((localBundle.supersededBy || null) !== (bundle.supersededBy || null)) {
    reasons.push(`supersededBy drift: local=${localBundle.supersededBy || "null"}; authoritative=${bundle.supersededBy || "null"}`);
  }

  return {
    status: reasons.length > 0 ? "drifted" : "current",
    reasons,
    localBundleId: localBundle.id,
    localBundleVersion: localBundle.version,
    localBundleLifecycle: localBundle.lifecycle,
  };
}

function buildExpansionWaveSemanticChecks(projectRoot) {
  const inspection = inspectExpansionWaveScaffold(projectRoot);
  return inspection.checks.map((check) => ({
    type: `expansionWave:${check.type}`,
    key: check.key,
    ok: check.ok,
    expected: check.expected,
    actual: check.actual,
  }));
}

function buildExpansionWaveSemanticDetails(projectRoot) {
  const inspection = inspectExpansionWaveScaffold(projectRoot);
  const mirror = inspection.projectMirror;
  return {
    status: inspection.status,
    mirrorPath: inspection.projectMirrorPath,
    contractRegistryPath: inspection.contractRegistryPath,
    projectWaveStatus: mirror?.status || null,
    currentContractId: mirror?.currentContractId || null,
    currentWaveName: mirror?.currentWaveName || null,
    acceptanceTrack: mirror?.acceptanceTrack || null,
    inScopeModules: Array.isArray(mirror?.inScopeModules) ? mirror.inScopeModules : [],
    outOfScopeModules: Array.isArray(mirror?.outOfScopeModules) ? mirror.outOfScopeModules : [],
    explicitVisualUpgradeModules: Array.isArray(mirror?.explicitVisualUpgradeModules)
      ? mirror.explicitVisualUpgradeModules
      : [],
  };
}

function inspectSurfaceVerificationScaffoldSafely(projectRoot) {
  try {
    return inspectSurfaceVerificationScaffold(projectRoot);
  } catch (error) {
    return {
      status: "missing-contract-registry",
      contractRegistryPath: path.join(path.resolve(projectRoot), "config", "validation-surfaces.json"),
      projectMirrorPath: path.join(path.resolve(projectRoot), "config", "project-validation-surfaces.json"),
      projectMirror: {
        status: "missing",
        surfaces: [],
      },
      checks: [
        {
          type: "contractRegistry",
          key: "config/validation-surfaces.json",
          ok: false,
          expected: "`config/validation-surfaces.json` exists and declares template validation surfaces.",
          actual: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}

function buildSurfaceVerificationSemanticChecks(projectRoot) {
  const inspection = inspectSurfaceVerificationScaffoldSafely(projectRoot);
  return inspection.checks.map((check) => ({
    type: `surfaceVerification:${check.type}`,
    key: check.key,
    ok: check.ok,
    expected: check.expected,
    actual: check.actual,
  }));
}

function buildSurfaceVerificationSemanticDetails(projectRoot) {
  const inspection = inspectSurfaceVerificationScaffoldSafely(projectRoot);
  const mirror = inspection.projectMirror;
  return {
    status: inspection.status,
    projectSurfaceStatus: mirror?.status || null,
    contractRegistryPath: inspection.contractRegistryPath,
    projectMirrorPath: inspection.projectMirrorPath,
    surfaceCount: Array.isArray(mirror?.surfaces) ? mirror.surfaces.length : 0,
    contractSurfaceIds: Array.isArray(mirror?.surfaces)
      ? mirror.surfaces.map((entry) => entry.contractSurfaceId)
      : [],
  };
}

export function inspectFrameworkBackfillBundleAdoption(projectRoot, registry, options = {}) {
  const authoritativeRegistry = normalizeFrameworkBackfillBundleRegistry(registry);
  const absoluteProjectRoot = path.resolve(projectRoot);
  const authoritativeRegistryPath = options.registryPath ? path.resolve(options.registryPath) : null;
  const packageJSON = safeReadJSON(path.join(absoluteProjectRoot, "package.json"));
  const packageScripts = packageJSON?.scripts && typeof packageJSON.scripts === "object"
    ? packageJSON.scripts
    : {};
  const agentsSource = safeReadText(path.join(absoluteProjectRoot, "AGENTS.md")) || "";
  const runAllSource = safeReadText(path.join(absoluteProjectRoot, DEFAULT_RUN_ALL_RELATIVE_PATH)) || "";
  const importedTests = new Set(listImportedTestFiles(runAllSource));
  const localRegistryInfo = loadOptionalRegistryMirror(absoluteProjectRoot);
  const requireLocalMirror = projectRetainsFrameworkGovernance(packageScripts);

  const bundles = authoritativeRegistry.bundles.map((bundle) => {
    const checks = [];

    bundle.requiredFiles.forEach((relativePath) => {
      checks.push({
        type: "file",
        key: relativePath,
        ok: fs.existsSync(path.join(absoluteProjectRoot, relativePath)),
        expected: `\`${relativePath}\``,
      });
    });

    bundle.requiredPackageScripts.forEach((rule) => {
      const actual = typeof packageScripts?.[rule.name] === "string" ? packageScripts[rule.name] : null;
      const ok = typeof rule.exact === "string"
        ? actual === rule.exact
        : (actual !== null && rule.includes.every((entry) => actual.includes(entry)));
      checks.push({
        type: "packageScript",
        key: rule.name,
        ok,
        expected: describePackageScriptRule(rule),
        actual,
      });
    });

    bundle.requiredAgentRules.forEach((rule) => {
      const match = matchAgentRule(agentsSource, rule);
      checks.push({
        type: "agentRule",
        key: describeAgentRule(rule),
        ok: match.ok,
        expected: describeAgentRule(rule),
        actual: match.actual,
        matchedAgentRuleVariant: match.ok ? match.matchedVariant : null,
        missingAllOf: match.missingAllOf,
      });
    });

    bundle.requiredTests.forEach((testFile) => {
      const fileExists = fs.existsSync(path.join(absoluteProjectRoot, "tests", testFile));
      const imported = importedTests.has(testFile);
      checks.push({
        type: "test",
        key: testFile,
        ok: fileExists && imported,
        expected: `\`${testFile}\` exists and is imported by tests/run-all.js`,
        actual: `fileExists=${fileExists}; imported=${imported}`,
      });
    });

    const expansionWaveDetails = bundle.id === "expansion-wave-scaffold-v1"
      ? buildExpansionWaveSemanticDetails(absoluteProjectRoot)
      : null;
    const surfaceVerificationDetails = bundle.id === "surface-verification-v1"
      ? buildSurfaceVerificationSemanticDetails(absoluteProjectRoot)
      : null;

    if (bundle.id === "expansion-wave-scaffold-v1") {
      checks.push(...buildExpansionWaveSemanticChecks(absoluteProjectRoot));
    }
    if (bundle.id === "surface-verification-v1") {
      checks.push(...buildSurfaceVerificationSemanticChecks(absoluteProjectRoot));
    }

    const adoptionPassed = checks.filter((item) => item.ok).length;
    const adoptionTotal = checks.length;
    let adoptionStatus = "missing";
    if (adoptionPassed === adoptionTotal) {
      adoptionStatus = "adopted";
    } else if (adoptionPassed > 0) {
      adoptionStatus = "partial";
    }

    const mirrorComparison = compareRegistryMirrorForBundle(bundle, {
      authoritativeRegistry,
      localRegistryInfo,
      requireLocalMirror,
    });

    return {
      id: bundle.id,
      version: bundle.version,
      bundleVersion: bundle.version,
      lifecycle: bundle.lifecycle,
      bundleLifecycle: bundle.lifecycle,
      summary: bundle.summary,
      adoptionStatus,
      mirrorStatus: mirrorComparison.status,
      status: adoptionStatus,
      passedChecks: adoptionPassed,
      totalChecks: adoptionTotal,
      missingChecks: checks.filter((item) => !item.ok),
      checks,
      matchedAgentRuleVariant: checks
        .filter((item) => item.type === "agentRule" && item.matchedAgentRuleVariant)
        .map((item) => item.matchedAgentRuleVariant),
      mirrorComparison: {
        registryPath: localRegistryInfo.registryPath,
        status: mirrorComparison.status,
        reasons: mirrorComparison.reasons,
        localBundleId: mirrorComparison.localBundleId,
        localBundleVersion: mirrorComparison.localBundleVersion,
        localBundleLifecycle: mirrorComparison.localBundleLifecycle,
      },
      expansionWaveDetails,
      surfaceVerificationDetails,
      nonGoals: bundle.nonGoals,
    };
  });

  const extraLocalBundles = localRegistryInfo.status === "loaded"
    ? localRegistryInfo.registry.bundles
      .filter((localBundle) => !authoritativeRegistry.bundles.some((bundle) => bundle.id === localBundle.id))
      .map((bundle) => ({
        id: bundle.id,
        version: bundle.version,
        lifecycle: bundle.lifecycle,
      }))
    : [];

  let reportMirrorStatus = "current";
  if (localRegistryInfo.status === "missing" && requireLocalMirror) {
    reportMirrorStatus = "missing-local-registry";
  } else if (bundles.some((bundle) => bundle.mirrorStatus === "drifted") || localRegistryInfo.status === "invalid") {
    reportMirrorStatus = "drifted";
  } else if (extraLocalBundles.length > 0) {
    reportMirrorStatus = "extra-local-only";
  }

  const summary = {
    totalBundles: bundles.length,
    adoptedBundles: bundles.filter((item) => item.adoptionStatus === "adopted").length,
    partialBundles: bundles.filter((item) => item.adoptionStatus === "partial").length,
    missingBundles: bundles.filter((item) => item.adoptionStatus === "missing").length,
    currentMirrorBundles: bundles.filter((item) => item.mirrorStatus === "current").length,
    driftedMirrorBundles: bundles.filter((item) => item.mirrorStatus === "drifted").length,
    missingLocalRegistryBundles: bundles.filter((item) => item.mirrorStatus === "missing-local-registry").length,
    extraLocalOnlyBundles: extraLocalBundles.length,
  };

  return {
    generatedAt: new Date().toISOString(),
    projectRoot: absoluteProjectRoot,
    registryPath: authoritativeRegistryPath || DEFAULT_BUNDLE_REGISTRY_RELATIVE_PATH,
    mirrorStatus: reportMirrorStatus,
    localRegistry: {
      required: requireLocalMirror,
      status: localRegistryInfo.status,
      registryPath: localRegistryInfo.registryPath,
      schemaVersion: localRegistryInfo.registry?.schemaVersion ?? null,
      error: localRegistryInfo.error,
      extraLocalBundles,
    },
    summary,
    bundles,
  };
}

export function renderFrameworkBackfillAuditMarkdown(report, options = {}) {
  const registryPath = options.registryPath ? path.resolve(options.registryPath) : report.registryPath;
  const expansionWaveBundle = report.bundles.find((bundle) => bundle.expansionWaveDetails) || null;
  const surfaceVerificationBundle = report.bundles.find((bundle) => bundle.surfaceVerificationDetails) || null;
  const lines = [
    "# Framework Backfill Audit",
    "",
    `- Generated At: \`${report.generatedAt}\``,
    `- Project Root: \`${report.projectRoot}\``,
    `- Registry: \`${registryPath || DEFAULT_BUNDLE_REGISTRY_RELATIVE_PATH}\``,
    `- Adoption Summary: adopted ${report.summary.adoptedBundles} / partial ${report.summary.partialBundles} / missing ${report.summary.missingBundles}`,
    `- Registry Mirror: \`${report.mirrorStatus}\``,
    "",
  ];

  if (expansionWaveBundle?.expansionWaveDetails) {
    lines.push("## Expansion Wave Overview");
    lines.push("");
    lines.push(`- Bundle: \`${expansionWaveBundle.id}\``);
    lines.push(`- Scaffold Status: \`${expansionWaveBundle.expansionWaveDetails.status}\``);
    lines.push(`- Project Wave Status: \`${expansionWaveBundle.expansionWaveDetails.projectWaveStatus || "null"}\``);
    lines.push(`- Contract: \`${expansionWaveBundle.expansionWaveDetails.currentContractId || "null"}\``);
    lines.push(`- Wave Name: \`${expansionWaveBundle.expansionWaveDetails.currentWaveName || "-"}\``);
    lines.push(`- Acceptance Track: \`${expansionWaveBundle.expansionWaveDetails.acceptanceTrack || "-"}\``);
    lines.push("");
  }

  if (surfaceVerificationBundle?.surfaceVerificationDetails) {
    lines.push("## Surface Verification Overview");
    lines.push("");
    lines.push(`- Bundle: \`${surfaceVerificationBundle.id}\``);
    lines.push(`- Scaffold Status: \`${surfaceVerificationBundle.surfaceVerificationDetails.status}\``);
    lines.push(`- Project Surface Status: \`${surfaceVerificationBundle.surfaceVerificationDetails.projectSurfaceStatus || "null"}\``);
    lines.push(`- Surface Count: \`${surfaceVerificationBundle.surfaceVerificationDetails.surfaceCount}\``);
    lines.push(`- Contract Surface IDs: ${surfaceVerificationBundle.surfaceVerificationDetails.contractSurfaceIds.length > 0
      ? surfaceVerificationBundle.surfaceVerificationDetails.contractSurfaceIds.map((entry) => `\`${entry}\``).join("、")
      : "-"}`);
    lines.push("");
  }

  lines.push("## Registry Mirror");
  lines.push("");
  lines.push(`- Required: \`${report.localRegistry.required}\``);
  lines.push(`- Local Registry Path: \`${report.localRegistry.registryPath}\``);
  lines.push(`- Local Registry Status: \`${report.localRegistry.status}\``);
  lines.push(`- Local Schema Version: \`${report.localRegistry.schemaVersion ?? "null"}\``);

  if (report.localRegistry.error) {
    lines.push(`- Local Registry Error: ${report.localRegistry.error}`);
  }
  if (report.localRegistry.extraLocalBundles.length > 0) {
    lines.push("- Extra Local Bundles:");
    report.localRegistry.extraLocalBundles.forEach((bundle) => {
      lines.push(`  - \`${bundle.id}\` (version=\`${bundle.version}\`, lifecycle=\`${bundle.lifecycle}\`)`);
    });
  }

  lines.push("");
  lines.push("## Bundle Status");
  lines.push("");
  lines.push("| Bundle | Adoption | Mirror | Wave | Checks |");
  lines.push("| --- | --- | --- | --- | --- |");
  report.bundles.forEach((bundle) => {
    const waveSummary = bundle.expansionWaveDetails
      ? `\`${bundle.expansionWaveDetails.projectWaveStatus || "null"}\``
      : "-";
    lines.push(`| \`${bundle.id}\` | \`${bundle.adoptionStatus}\` | \`${bundle.mirrorStatus}\` | ${waveSummary} | ${bundle.passedChecks}/${bundle.totalChecks} |`);
  });

  report.bundles.forEach((bundle) => {
    lines.push("");
    lines.push(`### \`${bundle.id}\``);
    lines.push("");
    lines.push(`- Version: \`${bundle.bundleVersion}\``);
    lines.push(`- Lifecycle: \`${bundle.bundleLifecycle}\``);
    lines.push(`- Adoption Status: \`${bundle.adoptionStatus}\``);
    lines.push(`- Mirror Status: \`${bundle.mirrorStatus}\``);
    lines.push(`- Summary: ${bundle.summary}`);

    lines.push("- Matched AGENTS Rule:");
    if (bundle.matchedAgentRuleVariant.length === 0) {
      lines.push("  - none");
    } else {
      bundle.matchedAgentRuleVariant.forEach((entry) => {
        const matchedParts = [];
        if (entry.anyOf) {
          matchedParts.push(`anyOf=\`${entry.anyOf}\``);
        }
        if (Array.isArray(entry.allOf) && entry.allOf.length > 0) {
          matchedParts.push(`allOf=${entry.allOf.map((item) => `\`${item}\``).join(" + ")}`);
        }
        lines.push(`  - ${entry.label}${matchedParts.length > 0 ? ` (${matchedParts.join("; ")})` : ""}`);
      });
    }

    lines.push("- Registry Mirror:");
    if (bundle.mirrorComparison.reasons.length === 0) {
      lines.push("  - current");
    } else {
      bundle.mirrorComparison.reasons.forEach((reason) => lines.push(`  - ${reason}`));
    }

    if (bundle.expansionWaveDetails) {
      lines.push("- Expansion Wave:");
      lines.push(`  - status=\`${bundle.expansionWaveDetails.status}\``);
      lines.push(`  - projectWaveStatus=\`${bundle.expansionWaveDetails.projectWaveStatus || "null"}\``);
      lines.push(`  - contract=\`${bundle.expansionWaveDetails.currentContractId || "null"}\``);
      lines.push(`  - wave=\`${bundle.expansionWaveDetails.currentWaveName || "-"}\``);
      lines.push(`  - acceptanceTrack=\`${bundle.expansionWaveDetails.acceptanceTrack || "-"}\``);
      lines.push(`  - inScope=${bundle.expansionWaveDetails.inScopeModules.length}`);
      lines.push(`  - explicitVisualUpgrade=${bundle.expansionWaveDetails.explicitVisualUpgradeModules.length}`);
    }

    if (bundle.surfaceVerificationDetails) {
      lines.push("- Surface Verification:");
      lines.push(`  - status=\`${bundle.surfaceVerificationDetails.status}\``);
      lines.push(`  - projectSurfaceStatus=\`${bundle.surfaceVerificationDetails.projectSurfaceStatus || "null"}\``);
      lines.push(`  - surfaceCount=\`${bundle.surfaceVerificationDetails.surfaceCount}\``);
      lines.push(`  - contractSurfaceIds=${bundle.surfaceVerificationDetails.contractSurfaceIds.length > 0
        ? bundle.surfaceVerificationDetails.contractSurfaceIds.map((entry) => `\`${entry}\``).join("、")
        : "-"}`);
    }

    if (bundle.missingChecks.length === 0) {
      lines.push("- Missing Checks: none");
    } else {
      lines.push("- Missing Checks:");
      bundle.missingChecks.forEach((item) => {
        const actual = item.actual ? ` (actual: \`${item.actual}\`)` : "";
        lines.push(`  - [${item.type}] ${item.expected}${actual}`);
      });
    }

    lines.push("- Non-Goals:");
    bundle.nonGoals.forEach((entry) => lines.push(`  - ${entry}`));
  });

  return `${lines.join("\n")}\n`;
}
