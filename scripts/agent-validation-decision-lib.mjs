import fs from "node:fs";
import { promises as fsp } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { resolveAgentArtifactPath } from "./agent-artifacts.mjs";
import { isPureVisualReaderFailure } from "./agent-zotero-validation-lib.mjs";

const VISUAL_POLICY_OVERRIDE_ENV = "AGENT_VISUAL_POLICY_OVERRIDE";
const DEFAULT_VALIDATION_DOMAINS_RELATIVE_PATH = path.join("config", "validation-domains.json");
const DEFAULT_PROJECT_VALIDATION_OVERRIDES_RELATIVE_PATH = path.join("config", "project-validation-overrides.json");

const VISUAL_LEVEL = Object.freeze({
  required: "visual-required",
  recommended: "visual-recommended",
  notNeeded: "visual-not-needed",
});

const VISUAL_LEVEL_LABELS = Object.freeze({
  [VISUAL_LEVEL.required]: "需要视觉验证",
  [VISUAL_LEVEL.recommended]: "建议视觉验证",
  [VISUAL_LEVEL.notNeeded]: "无需视觉验证",
});

const VISUAL_LEVEL_PRIORITY = Object.freeze({
  [VISUAL_LEVEL.notNeeded]: 1,
  [VISUAL_LEVEL.recommended]: 2,
  [VISUAL_LEVEL.required]: 3,
});

function fail(message) {
  throw new Error(message);
}

function normalizePath(value) {
  return String(value || "")
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "");
}

function uniqueStrings(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean),
  ));
}

function safeReadJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
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

function normalizeDecisionLevel(value, label) {
  const normalized = String(value || "").trim();
  if (!Object.values(VISUAL_LEVEL).includes(normalized)) {
    fail(`${label} must be one of ${Object.values(VISUAL_LEVEL).join(", ")}.`);
  }
  return normalized;
}

function compilePathMatchers(pathMatchers, label) {
  return ensureArrayOfStrings(pathMatchers, label).map((pattern, index) => {
    try {
      return {
        pattern,
        regex: new RegExp(pattern, "u"),
        index,
      };
    } catch (error) {
      fail(`${label}[${index}] is not a valid regex: ${error.message}`);
    }
  });
}

function normalizeValidationDomain(domain, index) {
  const prefix = `validation domains[${index}]`;
  if (!domain || typeof domain !== "object" || Array.isArray(domain)) {
    fail(`${prefix} must be an object.`);
  }

  const id = String(domain.id || "").trim();
  const summary = String(domain.summary || "").trim();
  if (!id) {
    fail(`${prefix}.id must be a non-empty string.`);
  }
  if (!Number.isInteger(domain.version) || domain.version <= 0) {
    fail(`${prefix}.version must be a positive integer.`);
  }
  if (!summary) {
    fail(`${prefix}.summary must be a non-empty string.`);
  }

  return {
    id,
    version: domain.version,
    summary,
    pathMatchers: compilePathMatchers(domain.pathMatchers, `${prefix}.pathMatchers`),
    defaultDecision: normalizeDecisionLevel(domain.defaultDecision, `${prefix}.defaultDecision`),
    requiredChecks: ensureArrayOfStrings(domain.requiredChecks, `${prefix}.requiredChecks`),
    escalationSignals: ensureArrayOfStrings(domain.escalationSignals, `${prefix}.escalationSignals`),
    nonGoals: ensureArrayOfStrings(domain.nonGoals, `${prefix}.nonGoals`),
  };
}

function normalizeProjectOverride(override, index) {
  const prefix = `project validation overrides[${index}]`;
  if (!override || typeof override !== "object" || Array.isArray(override)) {
    fail(`${prefix} must be an object.`);
  }

  const id = String(override.id || "").trim();
  const summary = String(override.summary || "").trim();
  if (!id) {
    fail(`${prefix}.id must be a non-empty string.`);
  }
  if (!summary) {
    fail(`${prefix}.summary must be a non-empty string.`);
  }

  return {
    id,
    summary,
    pathMatchers: compilePathMatchers(override.pathMatchers, `${prefix}.pathMatchers`),
    decision: normalizeDecisionLevel(override.decision, `${prefix}.decision`),
    requiredChecks: ensureArrayOfStrings(
      Array.isArray(override.requiredChecks) ? override.requiredChecks : [],
      `${prefix}.requiredChecks`,
      { allowEmpty: true },
    ),
    nonGoals: ensureArrayOfStrings(
      Array.isArray(override.nonGoals) ? override.nonGoals : [],
      `${prefix}.nonGoals`,
      { allowEmpty: true },
    ),
  };
}

export function resolveValidationDomainsPath(projectRoot, options = {}) {
  const customPath = String(options.validationDomainsPath || "").trim();
  return customPath
    ? path.resolve(customPath)
    : path.join(path.resolve(projectRoot), DEFAULT_VALIDATION_DOMAINS_RELATIVE_PATH);
}

export function resolveProjectValidationOverridesPath(projectRoot, options = {}) {
  const customPath = String(options.projectValidationOverridesPath || "").trim();
  return customPath
    ? path.resolve(customPath)
    : path.join(path.resolve(projectRoot), DEFAULT_PROJECT_VALIDATION_OVERRIDES_RELATIVE_PATH);
}

export function loadValidationDomainsRegistry(projectRoot, options = {}) {
  const registryPath = resolveValidationDomainsPath(projectRoot, options);
  const parsed = JSON.parse(fs.readFileSync(registryPath, "utf-8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail("Validation domains registry must be an object.");
  }
  if (!Number.isInteger(parsed.schemaVersion) || parsed.schemaVersion <= 0) {
    fail("Validation domains registry must declare a positive integer schemaVersion.");
  }
  const summary = String(parsed.summary || "").trim();
  if (!summary) {
    fail("Validation domains registry must declare a non-empty summary.");
  }
  const domains = Array.isArray(parsed.domains)
    ? parsed.domains.map((entry, index) => normalizeValidationDomain(entry, index))
    : fail("Validation domains registry must declare domains.");

  return {
    registryPath,
    registry: {
      schemaVersion: parsed.schemaVersion,
      summary,
      domains,
    },
  };
}

export function loadProjectValidationOverrides(projectRoot, options = {}) {
  const overridePath = resolveProjectValidationOverridesPath(projectRoot, options);
  if (!fs.existsSync(overridePath)) {
    return {
      overridePath,
      registry: {
        schemaVersion: 1,
        summary: "missing-project-validation-overrides",
        overrides: [],
      },
      missing: true,
    };
  }

  const parsed = JSON.parse(fs.readFileSync(overridePath, "utf-8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail("Project validation overrides must be an object.");
  }
  if (!Number.isInteger(parsed.schemaVersion) || parsed.schemaVersion <= 0) {
    fail("Project validation overrides must declare a positive integer schemaVersion.");
  }
  const summary = String(parsed.summary || "").trim();
  if (!summary) {
    fail("Project validation overrides must declare a non-empty summary.");
  }

  return {
    overridePath,
    registry: {
      schemaVersion: parsed.schemaVersion,
      summary,
      overrides: Array.isArray(parsed.overrides)
        ? parsed.overrides.map((entry, index) => normalizeProjectOverride(entry, index))
        : fail("Project validation overrides must declare overrides."),
    },
    missing: false,
  };
}

function matchByPath(entries, filePath, key = "pathMatchers") {
  const normalizedPath = normalizePath(filePath);
  return (Array.isArray(entries) ? entries : []).find((entry) => {
    const matchers = Array.isArray(entry?.[key]) ? entry[key] : [];
    return matchers.some((matcher) => matcher.regex.test(normalizedPath));
  }) || null;
}

function normalizeOverride(env = process.env) {
  const raw = String(env?.[VISUAL_POLICY_OVERRIDE_ENV] || "").trim().toLowerCase();
  if (!raw) {
    return null;
  }
  if (raw === "required") {
    return VISUAL_LEVEL.required;
  }
  if (raw === "recommended") {
    return VISUAL_LEVEL.recommended;
  }
  if (raw === "not-needed") {
    return VISUAL_LEVEL.notNeeded;
  }
  return null;
}

function listGitChangedPaths(projectRoot) {
  const commands = [
    ["diff", "--name-only", "--diff-filter=ACMR"],
    ["diff", "--name-only", "--cached", "--diff-filter=ACMR"],
    ["ls-files", "--others", "--exclude-standard"],
  ];

  const results = [];
  commands.forEach((args) => {
    const command = spawnSync("git", args, {
      cwd: projectRoot,
      encoding: "utf-8",
    });
    if (command.status !== 0) {
      return;
    }
    String(command.stdout || "")
      .split("\n")
      .map((entry) => normalizePath(entry))
      .filter(Boolean)
      .forEach((entry) => results.push(entry));
  });
  return uniqueStrings(results);
}

function matcherPatternToPathHint(pattern) {
  const source = String(pattern || "").trim();
  if (!source) {
    return null;
  }
  let normalized = source.replace(/^\^/, "");
  let buffer = "";
  let escaped = false;
  for (const character of normalized) {
    if (escaped) {
      buffer += character === "." ? "." : character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if ("([{$+*?|".includes(character) || character === "$") {
      break;
    }
    buffer += character;
  }

  const hint = normalizePath(buffer).replace(/\/+$/, "").replace(/\.+$/, "");
  return hint || null;
}

function loadExpansionWaveHintPaths(projectRoot) {
  const parsed = safeReadJSON(path.join(projectRoot, "config", "project-expansion-wave.json"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      status: parsed === null ? "missing" : "invalid",
      paths: [],
    };
  }
  if (String(parsed.status || "").trim() === "not-entered") {
    return {
      status: "not-entered",
      paths: [],
    };
  }
  return {
    status: String(parsed.status || "").trim() || "active",
    paths: uniqueStrings([
      ...(Array.isArray(parsed.inScopeModules) ? parsed.inScopeModules : []),
      ...(Array.isArray(parsed.explicitVisualUpgradeModules) ? parsed.explicitVisualUpgradeModules : []),
      ...(Array.isArray(parsed.moduleArchetypes) ? parsed.moduleArchetypes.map((entry) => entry?.module) : []),
    ]).map((entry) => normalizePath(entry)),
  };
}

function loadProjectOverrideHintPaths(projectRoot, options = {}) {
  const { registry, missing } = loadProjectValidationOverrides(projectRoot, options);
  if (missing) {
    return {
      status: "missing",
      paths: [],
    };
  }
  return {
    status: "present",
    paths: uniqueStrings(
      registry.overrides.flatMap((entry) => entry.pathMatchers.map((matcher) => matcherPatternToPathHint(matcher.pattern))).filter(Boolean),
    ),
  };
}

function collectDecisionPaths(options = {}) {
  const validationContext = options.validationContext && typeof options.validationContext === "object"
    ? options.validationContext
    : {};
  return uniqueStrings([
    ...(Array.isArray(options.changedPaths) ? options.changedPaths : []),
    ...(Array.isArray(validationContext.changedPaths) ? validationContext.changedPaths : []),
    ...(Array.isArray(validationContext.reviewChangedPaths) ? validationContext.reviewChangedPaths : []),
    ...(Array.isArray(validationContext.gitChangedPaths) ? validationContext.gitChangedPaths : []),
    ...(Array.isArray(validationContext.expansionWavePaths) ? validationContext.expansionWavePaths : []),
    ...(Array.isArray(validationContext.projectOverridePaths) ? validationContext.projectOverridePaths : []),
  ]).map((entry) => normalizePath(entry));
}

function classifyBySignals(e2e) {
  const summary = e2e && typeof e2e === "object" ? e2e : {};
  if (!summary.present) {
    return null;
  }
  if (isPureVisualReaderFailure(summary)) {
    return {
      level: VISUAL_LEVEL.required,
      reason: "当前 E2E 主阻断属于 Reader 视觉链路，需按视觉验证收口。",
      signal: "pure-visual-reader-failure",
    };
  }
  if (Number(summary.visualDriftCount || 0) > 0) {
    return {
      level: VISUAL_LEVEL.required,
      reason: `E2E 报告包含视觉漂移信号（drift=${Number(summary.visualDriftCount || 0)}）。`,
      signal: "visual-drift",
    };
  }
  if (Number(summary.visualMissingCount || 0) > 0) {
    return {
      level: VISUAL_LEVEL.required,
      reason: `E2E 报告包含视觉缺失信号（missing=${Number(summary.visualMissingCount || 0)}）。`,
      signal: "visual-missing",
    };
  }
  return null;
}

function buildPathClassifications(changedPaths, domains, overrides) {
  const normalizedPaths = uniqueStrings(changedPaths).map((item) => normalizePath(item));
  return normalizedPaths.map((filePath) => {
    const matchedDomain = matchByPath(domains, filePath);
    const matchedOverride = matchByPath(overrides, filePath);
    const level = matchedOverride?.decision || matchedDomain?.defaultDecision || VISUAL_LEVEL.recommended;
    const requiredChecks = uniqueStrings([
      ...(matchedOverride?.requiredChecks || []),
      ...(matchedDomain?.requiredChecks || []),
    ]);

    return {
      path: filePath,
      level,
      matchedDomain,
      matchedOverride,
      requiredChecks,
    };
  });
}

function pickHighestPriorityLevel(classifications) {
  return classifications.reduce((selected, entry) => {
    if (!selected) {
      return entry.level;
    }
    return VISUAL_LEVEL_PRIORITY[entry.level] > VISUAL_LEVEL_PRIORITY[selected]
      ? entry.level
      : selected;
  }, null) || VISUAL_LEVEL.recommended;
}

function buildLevelReasons(level, classifications) {
  const matching = classifications.filter((entry) => entry.level === level);
  const samplePaths = matching.slice(0, 3).map((entry) => entry.path);
  const overrideIds = uniqueStrings(matching.map((entry) => entry.matchedOverride?.id).filter(Boolean));
  const domainIds = uniqueStrings(matching.map((entry) => entry.matchedDomain?.id).filter(Boolean));

  if (level === VISUAL_LEVEL.required) {
    if (overrideIds.length > 0) {
      return [`当前批次命中项目级 visible-surface 覆盖：${overrideIds.join("、")}（示例：${samplePaths.join("、") || "-"}）。`];
    }
    return [`当前批次命中需要视觉验证的验证域：${domainIds.join("、") || "visible-surface"}（示例：${samplePaths.join("、") || "-"}）。`];
  }

  if (level === VISUAL_LEVEL.notNeeded) {
    if (overrideIds.length > 0) {
      return [`当前批次命中项目级非可见面覆盖：${overrideIds.join("、")}，默认无需视觉阻断。`];
    }
    return [`当前变更域集中在 ${domainIds.join("、") || "runtime-config / governance-docs"}，默认无需视觉阻断。`];
  }

  if (overrideIds.length > 0) {
    return [`当前批次命中项目级补证覆盖：${overrideIds.join("、")}，先完成功能闭环，再补视觉证据。`];
  }
  if (domainIds.length > 0) {
    return [`当前变更域命中 ${domainIds.join("、")} 或未知路径（示例：${samplePaths.join("、") || "-"}），先非阻断推进功能闭环并补证视觉验证。`];
  }
  return ["当前缺少稳定的变更域信息，默认先非阻断并补证视觉验证。"];
}

function buildLevelRequiredChecks(level, classifications) {
  const matching = classifications.filter((entry) => entry.level === level);
  const configured = uniqueStrings(matching.flatMap((entry) => entry.requiredChecks || []));
  if (configured.length > 0) {
    return configured;
  }
  if (level === VISUAL_LEVEL.required) {
    return [
      "最近一轮 `agent:zotero:e2e` 结果存在且状态为 `passed`。",
      "视觉证据已采集，且 failing 证据项为 0。",
    ];
  }
  if (level === VISUAL_LEVEL.recommended) {
    return [
      "先完成 `npm run check` -> `npm run agent:zotero:e2e` -> `npm run agent:monitor` / `npm run agent:gate`。",
      "建议补充一轮视觉证据用于归档（非阻断）。",
    ];
  }
  return [
    "继续以 `npm run check` -> `npm run agent:zotero:e2e` -> `npm run agent:monitor` / `npm run agent:gate` 完成功能闭环。",
  ];
}

function evaluateVisualEvidence(level, e2e) {
  const report = e2e && typeof e2e === "object" ? e2e : {};
  const hasE2E = report.present === true;
  const visualEvidencePresent = hasE2E && (
    report.visualEvidenceObserved === true
    || Number(report.visualEvidenceItemCount || 0) > 0
  );
  const visualEvidenceFailingCount = hasE2E ? Number(report.visualEvidenceFailingItemCount || 0) : 0;
  const visualEvidenceItems = Array.isArray(report.visualEvidenceItems) ? report.visualEvidenceItems : [];
  const hasScopeAwareEvidenceItems = visualEvidenceItems.some((item) => {
    return typeof item?.scope === "string" && item.scope.trim().length > 0;
  });
  const blockingVisualEvidenceFailingCount = hasE2E
    ? (
      hasScopeAwareEvidenceItems
        ? visualEvidenceItems.filter((item) => String(item?.scope || "").trim() === "surface-local").length
        : visualEvidenceFailingCount
    )
    : 0;
  const e2ePassed = hasE2E && String(report.status || "") === "passed";

  const evidence = {
    hasE2E,
    e2eStatus: report.status || "missing",
    visualEvidencePresent,
    visualEvidenceItemCount: hasE2E ? Number(report.visualEvidenceItemCount || 0) : 0,
    visualEvidenceFailingCount,
    blockingVisualEvidenceFailingCount,
    missing: false,
    failed: false,
  };

  if (level === VISUAL_LEVEL.required) {
    evidence.missing = !hasE2E || !visualEvidencePresent;
    evidence.failed = hasE2E && visualEvidencePresent && (!e2ePassed || blockingVisualEvidenceFailingCount > 0);
  }

  return evidence;
}

export function buildValidationDecision(options = {}) {
  const changedPaths = collectDecisionPaths(options);
  const e2e = options.e2e && typeof options.e2e === "object" ? options.e2e : null;
  const env = options.env || process.env;
  const projectRoot = path.resolve(options.projectRoot || ".");
  const validationDomains = options.validationDomains
    ? { domains: options.validationDomains.map((entry, index) => normalizeValidationDomain(entry, index)) }
    : loadValidationDomainsRegistry(projectRoot, options).registry;
  const projectOverrides = options.projectValidationOverrides
    ? { overrides: options.projectValidationOverrides.map((entry, index) => normalizeProjectOverride(entry, index)) }
    : loadProjectValidationOverrides(projectRoot, options).registry;

  const overrideLevel = normalizeOverride(env);
  const signalDecision = classifyBySignals(e2e);
  const pathClassifications = buildPathClassifications(
    changedPaths,
    validationDomains.domains,
    projectOverrides.overrides,
  );

  let level = VISUAL_LEVEL.recommended;
  let decisionSource = "fallback-unknown";
  let reasons = [];
  let escalatedByRuntimeSignals = false;

  if (overrideLevel) {
    level = overrideLevel;
    decisionSource = "env-override";
    reasons = [`已通过 ${VISUAL_POLICY_OVERRIDE_ENV} 覆盖默认验证策略。`];
  } else if (signalDecision) {
    level = signalDecision.level;
    decisionSource = "runtime-signals";
    reasons = [signalDecision.reason];
    escalatedByRuntimeSignals = true;
  } else if (pathClassifications.length === 0) {
    level = VISUAL_LEVEL.recommended;
    decisionSource = "fallback-unknown";
    reasons = ["当前缺少稳定的变更域信息，默认先非阻断并补证视觉验证。"];
  } else {
    level = pickHighestPriorityLevel(pathClassifications);
    decisionSource = pathClassifications.some((entry) => entry.matchedOverride)
      ? "project-override"
      : pathClassifications.some((entry) => entry.matchedDomain)
        ? "validation-domain"
        : "fallback-unknown";
    reasons = buildLevelReasons(level, pathClassifications);
  }

  const evidence = evaluateVisualEvidence(level, e2e);
  const requiredChecks = buildLevelRequiredChecks(level, pathClassifications);
  let deferredEvidenceAction = null;
  let blocking = false;
  let issue = null;
  let recommendation = null;

  if (level === VISUAL_LEVEL.required) {
    blocking = evidence.missing || evidence.failed;
    if (evidence.missing) {
      issue = "当前改动域要求视觉验证，但视觉证据缺失。";
      recommendation = "先执行 `npm run agent:zotero:e2e` 产出最新视觉证据后再过 gate。";
    } else if (evidence.failed) {
      issue = "当前改动域要求视觉验证，但视觉证据未通过。";
      recommendation = "先修复视觉阻断并重新执行 `npm run agent:zotero:e2e`。";
    }
  } else if (level === VISUAL_LEVEL.recommended) {
    if (!evidence.hasE2E || !evidence.visualEvidencePresent || evidence.e2eStatus !== "passed") {
      deferredEvidenceAction = "建议在下一次合并前执行 `npm run agent:zotero:e2e` 补齐视觉证据（非阻断）。";
    }
  }

  return {
    level,
    levelLabel: VISUAL_LEVEL_LABELS[level] || VISUAL_LEVEL_LABELS[VISUAL_LEVEL.recommended],
    source: decisionSource,
    decisionSource,
    reasons: uniqueStrings(reasons),
    requiredChecks,
    requiredEvidence: requiredChecks,
    matchedDomain: uniqueStrings(pathClassifications.map((entry) => entry.matchedDomain?.id).filter(Boolean)),
    matchedProjectOverride: uniqueStrings(pathClassifications.map((entry) => entry.matchedOverride?.id).filter(Boolean)),
    escalatedByRuntimeSignals,
    deferredEvidenceAction,
    evidence,
    blocking,
    issue,
    recommendation,
  };
}

export async function collectValidationContext(projectRoot, options = {}) {
  const maxEntries = Math.max(1, Number(options.maxEntries || 20));
  const delegationRoot = resolveAgentArtifactPath(projectRoot, "agent-delegation");

  const base = {
    generatedAt: new Date().toISOString(),
    source: "merged-review-git-project-mirrors",
    reviewWindowCount: 0,
    changedPaths: [],
    reviewChangedPaths: [],
    gitChangedPaths: [],
    expansionWavePaths: [],
    projectOverridePaths: [],
    latestTaskIds: [],
    reviewSummary: {
      accepted: 0,
      reworkedByCodex: 0,
      needsFix: 0,
      rejected: 0,
      other: 0,
    },
  };

  let entries = [];
  try {
    entries = await fsp.readdir(delegationRoot, { withFileTypes: true });
  } catch (error) {
    if (!(error && error.code === "ENOENT")) {
      throw error;
    }
  }

  const reviews = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const taskId = entry.name;
    const reviewPath = path.join(delegationRoot, taskId, "review.json");
    try {
      const parsed = JSON.parse(await fsp.readFile(reviewPath, "utf-8"));
      reviews.push({ taskId, review: parsed });
    } catch (error) {
      if (error && error.code === "ENOENT") {
        continue;
      }
      throw error;
    }
  }

  reviews.sort((left, right) => {
    const leftAt = Date.parse(String(left.review?.reviewedAt || "")) || 0;
    const rightAt = Date.parse(String(right.review?.reviewedAt || "")) || 0;
    return rightAt - leftAt;
  });

  const recent = reviews.slice(0, maxEntries);
  const changedPaths = [];
  recent.forEach(({ taskId, review }) => {
    base.latestTaskIds.push(taskId);
    const reviewStatus = String(review?.reviewStatus || "").trim();
    if (reviewStatus === "accepted") {
      base.reviewSummary.accepted += 1;
    } else if (reviewStatus === "reworked-by-codex") {
      base.reviewSummary.reworkedByCodex += 1;
    } else if (reviewStatus === "needs-fix") {
      base.reviewSummary.needsFix += 1;
    } else if (reviewStatus === "rejected") {
      base.reviewSummary.rejected += 1;
    } else {
      base.reviewSummary.other += 1;
    }

    const fileEntries = Array.isArray(review?.changedFiles) ? review.changedFiles : [];
    fileEntries.forEach((item) => {
      const filePath = normalizePath(item?.path);
      if (filePath) {
        changedPaths.push(filePath);
      }
    });
    const acceptedFiles = Array.isArray(review?.acceptedFiles) ? review.acceptedFiles : [];
    acceptedFiles.forEach((item) => {
      const filePath = normalizePath(item);
      if (filePath) {
        changedPaths.push(filePath);
      }
    });
  });

  base.reviewWindowCount = recent.length;
  base.reviewChangedPaths = uniqueStrings(changedPaths).slice(0, 200);
  base.latestTaskIds = uniqueStrings(base.latestTaskIds).slice(0, maxEntries);
  base.gitChangedPaths = listGitChangedPaths(projectRoot).slice(0, 200);
  base.expansionWavePaths = loadExpansionWaveHintPaths(projectRoot).paths.slice(0, 200);
  base.projectOverridePaths = loadProjectOverrideHintPaths(projectRoot, options).paths.slice(0, 200);
  base.changedPaths = uniqueStrings([
    ...base.reviewChangedPaths,
    ...base.gitChangedPaths,
    ...base.expansionWavePaths,
    ...base.projectOverridePaths,
  ]).slice(0, 200);
  return base;
}

export {
  DEFAULT_PROJECT_VALIDATION_OVERRIDES_RELATIVE_PATH,
  DEFAULT_VALIDATION_DOMAINS_RELATIVE_PATH,
  VISUAL_LEVEL,
  VISUAL_LEVEL_LABELS,
  VISUAL_POLICY_OVERRIDE_ENV,
};
