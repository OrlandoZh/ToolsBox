import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  BUILD_MODULE_ID_MODE_ANONYMIZED,
  BUILD_MODULE_ID_MODE_ENV,
  BUILD_SEMANTIC_SCRUB_ENV,
  BUILD_SEMANTIC_SCRUB_PROTECTED,
} from "./build.mjs";
import {
  resolveAgentArtifactPath,
  resolveAgentArtifactsDir,
} from "./agent-artifacts.mjs";
import {
  assertScript,
  buildScriptFailureInfo,
  createScriptError,
  isExecutedAsScript,
  readJSONFile,
  wrapScriptError,
} from "./script-runtime-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

export const PACKAGE_PROTECTION_AUDIT_VARIANTS = Object.freeze([
  "plain",
  "encrypted",
  "shielded",
]);

export const PACKAGE_PROTECTION_SOURCE_PROXY_MODES = Object.freeze([
  "plain",
  "protected",
]);

export const PACKAGE_PROTECTION_ROUTE_AUDIT_BASE_ANCHORS = Object.freeze([
  {
    id: "plugin-api-agent-surface",
    label: "plugin.api.agent.* surface",
    needle: "plugin.api.agent.",
    category: "inner-bundle-semantics",
  },
  {
    id: "run-agent-action",
    label: "runAgentAction",
    needle: "runAgentAction",
    category: "inner-bundle-semantics",
  },
  {
    id: "list-agent-capabilities",
    label: "listAgentCapabilities",
    needle: "listAgentCapabilities",
    category: "inner-bundle-semantics",
  },
  {
    id: "package-protection-summary",
    label: "getPackageProtectionSummary",
    needle: "getPackageProtectionSummary",
    category: "inner-bundle-semantics",
  },
  {
    id: "lifecycle-telemetry-summary",
    label: "getLifecycleTelemetrySummary",
    needle: "getLifecycleTelemetrySummary",
    category: "inner-bundle-semantics",
  },
  {
    id: "capability-entrypoints",
    label: "capabilityManifest.entrypoints",
    needle: "entrypoints",
    category: "inner-bundle-semantics",
  },
  {
    id: "capability-owned-by",
    label: "capabilityManifest.ownedBy",
    needle: "ownedBy",
    category: "inner-bundle-semantics",
  },
  {
    id: "capability-success-signals",
    label: "capabilityManifest.successSignals",
    needle: "successSignals",
    category: "inner-bundle-semantics",
  },
  {
    id: "service-registry",
    label: "serviceRegistry",
    needle: "serviceRegistry",
    category: "inner-bundle-semantics",
  },
  {
    id: "optional-bundles",
    label: "optionalBundles",
    needle: "optionalBundles",
    category: "inner-bundle-semantics",
  },
  {
    id: "optional-agent-runtime",
    label: "agent-runtime",
    needle: "agent-runtime",
    category: "bundle-label",
  },
  {
    id: "optional-ai-service",
    label: "ai-service",
    needle: "ai-service",
    category: "bundle-label",
  },
  {
    id: "metadata-source-sha",
    label: "sourceSHA256",
    needle: "sourceSHA256",
    category: "loader-metadata",
  },
  {
    id: "metadata-generated-at",
    label: "generatedAt",
    needle: "generatedAt",
    category: "loader-metadata",
  },
]);

const STATUS_LABELS = Object.freeze({
  passed: "通过",
  attention: "关注",
  missing: "缺失",
});

function normalizeVariant(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "all" || !normalized) {
    return "all";
  }
  return PACKAGE_PROTECTION_AUDIT_VARIANTS.includes(normalized)
    ? normalized
    : null;
}

function countOccurrences(source, needle) {
  const text = String(source || "");
  const target = String(needle || "");
  if (!text || !target) {
    return 0;
  }

  let count = 0;
  let cursor = 0;
  while (cursor < text.length) {
    const nextIndex = text.indexOf(target, cursor);
    if (nextIndex === -1) {
      break;
    }
    count += 1;
    cursor = nextIndex + target.length;
  }
  return count;
}

function toCategoryKey(category) {
  const normalized = String(category || "").trim();
  return normalized || "unknown";
}

function buildCategoryCounts(matches = []) {
  return matches.reduce((summary, match) => {
    const key = toCategoryKey(match.category);
    summary[key] = Number(summary[key] || 0) + Number(match.count || 0);
    return summary;
  }, {});
}

function countTotalMatches(matches = []) {
  return matches.reduce((sum, match) => sum + Number(match?.count || 0), 0);
}

function getPresentMatches(matches = []) {
  return matches.filter((match) => match.present === true);
}

function buildAuditSummary(reportByVariant) {
  const plain = reportByVariant.get("plain") || null;
  const encrypted = reportByVariant.get("encrypted") || null;
  const shielded = reportByVariant.get("shielded") || null;

  const shieldedPresent = getPresentMatches(shielded?.anchors);
  const encryptedPresent = getPresentMatches(encrypted?.anchors);
  const plainPresent = getPresentMatches(plain?.anchors);

  const plainCandidateAnchors = plainPresent.filter((match) => match.category !== "loader-metadata");
  const rawProtectedLeaks = [...encryptedPresent, ...shieldedPresent];

  if (!plain || !encrypted || !shielded) {
    return {
      status: "missing",
      nextAction: "rerun-package-build",
      summary: "缺少 plain / encrypted / shielded 其中一条导出物审计结果，先补齐控制组。",
      comparison: {
        plainCandidateAnchorCount: plainCandidateAnchors.length,
        encryptedRawAnchorCount: encryptedPresent.length,
        shieldedRawAnchorCount: shieldedPresent.length,
        nextPriority: "collect-variants",
      },
    };
  }

  if (rawProtectedLeaks.length > 0) {
    return {
      status: "attention",
      nextAction: "trim-loader-surface",
      summary: "受保护导出物的原始脚本仍暴露高层语义或描述性 metadata，下一步先收紧 loader / raw export 表面。",
      comparison: {
        plainCandidateAnchorCount: plainCandidateAnchors.length,
        encryptedRawAnchorCount: encryptedPresent.length,
        shieldedRawAnchorCount: shieldedPresent.length,
        nextPriority: "loader-surface",
      },
    };
  }

  if (plainCandidateAnchors.length > 0) {
    return {
      status: "attention",
      nextAction: "open-inner-semantic-scrub",
      summary: "raw protected export 已基本收干净；当前更值得优先处理的是 inner bundle 在解密后的高层语义锚点。",
      comparison: {
        plainCandidateAnchorCount: plainCandidateAnchors.length,
        encryptedRawAnchorCount: encryptedPresent.length,
        shieldedRawAnchorCount: shieldedPresent.length,
        nextPriority: "inner-bundle-semantics",
      },
    };
  }

  return {
    status: "passed",
    nextAction: "keep-current-route",
    summary: "当前 raw protected export 与 plain source proxy 都未观测到约定锚点，暂不需要追加新的语义减噪批次。",
    comparison: {
      plainCandidateAnchorCount: plainCandidateAnchors.length,
      encryptedRawAnchorCount: encryptedPresent.length,
      shieldedRawAnchorCount: shieldedPresent.length,
      nextPriority: "none",
    },
  };
}

function buildVariantPackageArgs(variant) {
  switch (variant) {
    case "plain":
      return ["scripts/package.mjs", "--skip-release-metadata"];
    case "encrypted":
      return ["scripts/package.mjs", "--encrypt-bundle", "--skip-release-metadata"];
    case "shielded":
      return ["scripts/package.mjs", "--shield-bundle", "--skip-release-metadata"];
    default:
      throw createScriptError("args", `unsupported package protection audit variant: ${variant}`, {
        failedStage: "build-variant-args",
        details: { variant },
      });
  }
}

async function readAddonConfig(projectRootPath) {
  return readJSONFile(path.join(projectRootPath, "config", "addon.config.json"), {
    missingCategory: "environment",
    invalidCategory: "validation",
    failedStage: "read-addon-config",
    label: "config/addon.config.json",
  });
}

function buildDynamicAnchors(config = {}) {
  const addonRef = String(config.addonRef || "").trim();
  const addonVersion = String(config.addonVersion || "").trim();
  const dynamicAnchors = [];

  if (addonRef) {
    dynamicAnchors.push({
      id: "addon-ref-literal",
      label: "addonRef literal",
      needle: addonRef,
      category: "loader-metadata",
    });
  }

  if (addonVersion) {
    dynamicAnchors.push({
      id: "addon-version-literal",
      label: "addonVersion literal",
      needle: addonVersion,
      category: "loader-metadata",
    });
  }

  return dynamicAnchors;
}

export function buildPackageProtectionAuditAnchors(config = {}) {
  return [
    ...buildDynamicAnchors(config),
    ...PACKAGE_PROTECTION_ROUTE_AUDIT_BASE_ANCHORS,
  ];
}

export function scanBundleAnchors(bundleSource, anchors = []) {
  const normalizedAnchors = Array.isArray(anchors) ? anchors : [];
  const matches = normalizedAnchors.map((anchor) => {
    const count = countOccurrences(bundleSource, anchor.needle);
    return {
      id: anchor.id,
      label: anchor.label,
      needle: anchor.needle,
      category: anchor.category,
      count,
      present: count > 0,
    };
  });

  return {
    totalAnchorCount: getPresentMatches(matches).length,
    totalMatchCount: countTotalMatches(matches),
    categoryCounts: buildCategoryCounts(matches),
    anchors: matches,
  };
}

function buildSourceProxyBuildEnv(mode) {
  if (mode === "protected") {
    return {
      [BUILD_MODULE_ID_MODE_ENV]: BUILD_MODULE_ID_MODE_ANONYMIZED,
      [BUILD_SEMANTIC_SCRUB_ENV]: BUILD_SEMANTIC_SCRUB_PROTECTED,
    };
  }
  return {};
}

export function parsePackageProtectionAnchorAuditArgs(argv = process.argv.slice(2)) {
  const options = {
    variants: [...PACKAGE_PROTECTION_AUDIT_VARIANTS],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || "").trim();
    if (!token) {
      continue;
    }

    switch (token) {
      case "--variant": {
        const variant = normalizeVariant(argv[index + 1]);
        assertScript(Boolean(variant), "--variant must be one of plain|encrypted|shielded|all", {
          category: "args",
          failedStage: "parse-args",
        });
        options.variants = variant === "all"
          ? [...PACKAGE_PROTECTION_AUDIT_VARIANTS]
          : [variant];
        index += 1;
        break;
      }
      default:
        throw createScriptError("args", `Unknown option: ${token}`, {
          failedStage: "parse-args",
          details: { option: token },
        });
    }
  }

  return options;
}

async function buildVariantAudit({ projectRootPath, config, variant, anchors }) {
  const args = buildVariantPackageArgs(variant);
  const bundlePath = path.join(projectRootPath, "build", config.addonRef, "content", "scripts", `${config.addonRef}.js`);
  const xpiName = variant === "plain"
    ? `${config.addonRef}-${config.addonVersion}.xpi`
    : `${config.addonRef}-${config.addonVersion}-${variant}.xpi`;
  const xpiPath = path.join(projectRootPath, "dist", xpiName);

  try {
    execFileSync(process.execPath, args, {
      cwd: projectRootPath,
      stdio: "pipe",
      env: process.env,
    });
  } catch (error) {
    throw wrapScriptError(error, {
      failedStage: "build-variant",
      details: {
        variant,
        args,
      },
    });
  }

  const source = await fs.readFile(bundlePath, "utf-8");
  const bundleStats = await fs.stat(bundlePath);
  const xpiStats = await fs.stat(xpiPath);
  const scan = scanBundleAnchors(source, anchors);

  return {
    variant,
    bundlePath,
    bundleSizeBytes: bundleStats.size,
    xpiPath,
    xpiSizeBytes: xpiStats.size,
    ...scan,
  };
}

async function buildSourceProxyAudit({ projectRootPath, config, mode, anchors }) {
  const bundlePath = path.join(projectRootPath, "build", config.addonRef, "content", "scripts", `${config.addonRef}.js`);

  try {
    execFileSync(process.execPath, ["scripts/build.mjs"], {
      cwd: projectRootPath,
      stdio: "pipe",
      env: {
        ...process.env,
        ...buildSourceProxyBuildEnv(mode),
      },
    });
  } catch (error) {
    throw wrapScriptError(error, {
      failedStage: "build-source-proxy",
      details: {
        mode,
      },
    });
  }

  const source = await fs.readFile(bundlePath, "utf-8");
  const bundleStats = await fs.stat(bundlePath);
  const scan = scanBundleAnchors(source, anchors);

  return {
    mode,
    bundlePath,
    bundleSizeBytes: bundleStats.size,
    ...scan,
  };
}

export function summarizePackageProtectionSourceProxy(sourceProxyReports = []) {
  const reportByMode = new Map(
    (Array.isArray(sourceProxyReports) ? sourceProxyReports : [])
      .map((report) => [String(report?.mode || "").trim(), report]),
  );
  const plain = reportByMode.get("plain") || null;
  const protectedReport = reportByMode.get("protected") || null;

  if (!plain || !protectedReport) {
    return {
      present: false,
      plain: null,
      protected: null,
      reducedAnchorCount: 0,
      reducedMatchCount: 0,
      removedAnchorIds: [],
      remainingAnchorIds: [],
    };
  }

  const plainPresent = getPresentMatches(plain.anchors);
  const protectedPresent = getPresentMatches(protectedReport.anchors);
  const protectedPresentIds = new Set(protectedPresent.map((anchor) => anchor.id));

  return {
    present: true,
    plain: {
      bundlePath: plain.bundlePath,
      bundleSizeBytes: plain.bundleSizeBytes,
      totalAnchorCount: plain.totalAnchorCount,
      totalMatchCount: plain.totalMatchCount,
      categoryCounts: plain.categoryCounts,
      presentAnchors: plainPresent.map((anchor) => ({
        id: anchor.id,
        label: anchor.label,
        count: anchor.count,
      })),
    },
    protected: {
      bundlePath: protectedReport.bundlePath,
      bundleSizeBytes: protectedReport.bundleSizeBytes,
      totalAnchorCount: protectedReport.totalAnchorCount,
      totalMatchCount: protectedReport.totalMatchCount,
      categoryCounts: protectedReport.categoryCounts,
      presentAnchors: protectedPresent.map((anchor) => ({
        id: anchor.id,
        label: anchor.label,
        count: anchor.count,
      })),
    },
    reducedAnchorCount: Math.max(0, plain.totalAnchorCount - protectedReport.totalAnchorCount),
    reducedMatchCount: Math.max(0, plain.totalMatchCount - protectedReport.totalMatchCount),
    removedAnchorIds: plainPresent
      .map((anchor) => anchor.id)
      .filter((id) => !protectedPresentIds.has(id)),
    remainingAnchorIds: protectedPresent.map((anchor) => anchor.id),
  };
}

export function summarizePackageProtectionAnchorAudit(variantReports = [], options = {}) {
  const reportByVariant = new Map(
    (Array.isArray(variantReports) ? variantReports : [])
      .map((report) => [String(report?.variant || "").trim(), report]),
  );
  const summary = buildAuditSummary(reportByVariant);
  const sourceProxy = summarizePackageProtectionSourceProxy(options.sourceProxyReports);

  return {
    generatedAt: new Date().toISOString(),
    advisory: true,
    status: summary.status,
    statusLabel: STATUS_LABELS[summary.status] || STATUS_LABELS.attention,
    summary: summary.summary,
    nextAction: summary.nextAction,
    comparison: summary.comparison,
    sourceProxy,
    variants: PACKAGE_PROTECTION_AUDIT_VARIANTS.map((variant) => {
      const report = reportByVariant.get(variant);
      if (!report) {
        return {
          variant,
          present: false,
          bundlePath: null,
          bundleSizeBytes: null,
          xpiPath: null,
          xpiSizeBytes: null,
          totalAnchorCount: 0,
          totalMatchCount: 0,
          categoryCounts: {},
          presentAnchors: [],
          anchors: [],
        };
      }
      return {
        variant,
        present: true,
        bundlePath: report.bundlePath,
        bundleSizeBytes: report.bundleSizeBytes,
        xpiPath: report.xpiPath,
        xpiSizeBytes: report.xpiSizeBytes,
        totalAnchorCount: report.totalAnchorCount,
        totalMatchCount: report.totalMatchCount,
        categoryCounts: report.categoryCounts,
        presentAnchors: getPresentMatches(report.anchors).map((anchor) => ({
          id: anchor.id,
          label: anchor.label,
          category: anchor.category,
          count: anchor.count,
        })),
        anchors: report.anchors,
      };
    }),
    anchors: Array.isArray(options.anchors)
      ? options.anchors.map((anchor) => ({
        id: anchor.id,
        label: anchor.label,
        needle: anchor.needle,
        category: anchor.category,
      }))
      : [],
  };
}

export function renderPackageProtectionAnchorAuditMarkdown(report) {
  const lines = [
    "# Package Protection Anchor Audit",
    "",
    `- 生成时间: \`${report.generatedAt}\``,
    `- Advisory: \`${report.advisory ? "yes" : "no"}\``,
    `- 状态: \`${report.statusLabel}\``,
    `- nextAction: \`${report.nextAction}\``,
    `- 摘要: ${report.summary}`,
    "",
    "## Comparison",
    "",
    `- plainCandidateAnchorCount: \`${report.comparison?.plainCandidateAnchorCount ?? 0}\``,
    `- encryptedRawAnchorCount: \`${report.comparison?.encryptedRawAnchorCount ?? 0}\``,
    `- shieldedRawAnchorCount: \`${report.comparison?.shieldedRawAnchorCount ?? 0}\``,
    `- nextPriority: \`${report.comparison?.nextPriority || "unknown"}\``,
    "",
  ];

  if (report.sourceProxy?.present) {
    lines.push("## Source Proxy Reduction", "");
    lines.push(`- plainAnchorCount: \`${report.sourceProxy.plain?.totalAnchorCount ?? 0}\``);
    lines.push(`- protectedAnchorCount: \`${report.sourceProxy.protected?.totalAnchorCount ?? 0}\``);
    lines.push(`- reducedAnchorCount: \`${report.sourceProxy.reducedAnchorCount ?? 0}\``);
    lines.push(`- plainMatchCount: \`${report.sourceProxy.plain?.totalMatchCount ?? 0}\``);
    lines.push(`- protectedMatchCount: \`${report.sourceProxy.protected?.totalMatchCount ?? 0}\``);
    lines.push(`- reducedMatchCount: \`${report.sourceProxy.reducedMatchCount ?? 0}\``);
    lines.push(`- removedAnchorIds: \`${(report.sourceProxy.removedAnchorIds || []).join(", ") || "-"}\``);
    lines.push(`- remainingAnchorIds: \`${(report.sourceProxy.remainingAnchorIds || []).join(", ") || "-"}\``);
    lines.push("");
  }

  lines.push("## Variant Reports", "");

  report.variants.forEach((variantReport) => {
    lines.push(`### ${variantReport.variant}`);
    lines.push("");
    lines.push(`- present: \`${variantReport.present ? "yes" : "no"}\``);
    if (!variantReport.present) {
      lines.push("");
      return;
    }
    lines.push(`- bundle: \`${variantReport.bundlePath}\``);
    lines.push(`- bundleSizeBytes: \`${variantReport.bundleSizeBytes}\``);
    lines.push(`- xpi: \`${variantReport.xpiPath}\``);
    lines.push(`- xpiSizeBytes: \`${variantReport.xpiSizeBytes}\``);
    lines.push(`- totalAnchorCount: \`${variantReport.totalAnchorCount}\``);
    lines.push(`- totalMatchCount: \`${variantReport.totalMatchCount}\``);
    lines.push(`- categoryCounts: \`${JSON.stringify(variantReport.categoryCounts)}\``);
    if (variantReport.presentAnchors.length === 0) {
      lines.push("- presentAnchors: 无");
    } else {
      lines.push("- presentAnchors:");
      variantReport.presentAnchors.forEach((anchor) => {
        lines.push(`  - \`${anchor.id}\` / ${anchor.label} / ${anchor.category} / count=${anchor.count}`);
      });
    }
    lines.push("");
  });

  return lines.join("\n");
}

export async function persistPackageProtectionAnchorAudit(report, options = {}) {
  const projectRootPath = path.resolve(options.projectRootPath || projectRoot);
  const reportPath = resolveAgentArtifactPath(projectRootPath, "package-protection-anchor-audit.json");
  const reportMDPath = resolveAgentArtifactPath(projectRootPath, "package-protection-anchor-audit.md");

  await fs.mkdir(resolveAgentArtifactsDir(projectRootPath), { recursive: true });
  await Promise.all([
    fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8"),
    fs.writeFile(reportMDPath, `${renderPackageProtectionAnchorAuditMarkdown(report)}\n`, "utf-8"),
  ]);

  return {
    reportPath,
    reportMDPath,
  };
}

export async function runPackageProtectionAnchorAudit(options = {}) {
  const projectRootPath = path.resolve(options.projectRootPath || projectRoot);
  const config = await readAddonConfig(projectRootPath);
  const anchors = buildPackageProtectionAuditAnchors(config);
  const variants = Array.isArray(options.variants) && options.variants.length > 0
    ? options.variants
    : [...PACKAGE_PROTECTION_AUDIT_VARIANTS];

  const variantReports = [];
  for (const variant of variants) {
    variantReports.push(await buildVariantAudit({
      projectRootPath,
      config,
      variant,
      anchors,
    }));
  }

  const sourceProxyReports = [];
  for (const mode of PACKAGE_PROTECTION_SOURCE_PROXY_MODES) {
    sourceProxyReports.push(await buildSourceProxyAudit({
      projectRootPath,
      config,
      mode,
      anchors,
    }));
  }

  const report = summarizePackageProtectionAnchorAudit(variantReports, {
    anchors,
    sourceProxyReports,
  });
  const paths = await persistPackageProtectionAnchorAudit(report, {
    projectRootPath,
  });

  return {
    report,
    paths,
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parsePackageProtectionAnchorAuditArgs(argv);
  const { report, paths } = await runPackageProtectionAnchorAudit(options);
  console.log(`Package protection anchor audit generated: ${paths.reportPath}`);
  console.log(`Package protection anchor audit nextAction: ${report.nextAction}`);
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
