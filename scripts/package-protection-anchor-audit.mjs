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
  REACT_UI_DEMO_SHELL_PATH,
  WASM_KERNEL_PROBE_PATH,
  WASM_KERNEL_PROBE_WORKER_PATH,
} from "../src/utils/optional-bundle-paths.js";
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
import {
  resolveJSConfuserToolSelection,
} from "./package-protection-jsconfuser-preflight.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();
const PACKAGE_JSCONFUSER_TOOL_PATH_ENV = "CLEANROOM_PACKAGE_JSCONFUSER_TOOL_PATH";
const PACKAGE_JSCONFUSER_TOOL_ENTRY_ENV = "CLEANROOM_PACKAGE_JSCONFUSER_TOOL_ENTRY";

export const PACKAGE_PROTECTION_AUDIT_BASE_VARIANTS = Object.freeze([
  "plain",
  "encrypted",
  "shielded",
]);

export const PACKAGE_PROTECTION_AUDIT_EXPERIMENTAL_VARIANTS = Object.freeze([
  "descriptor-bind",
  "jsconfuser-string",
  "pref-bridge",
  "surface-scrub",
  "surface-scrub-wasm-digest",
  "surface-scrub-wasm-stage2-derive",
  "surface-scrub-wasm-entitlement-legacy",
]);

export const PACKAGE_PROTECTION_AUDIT_VARIANTS = Object.freeze([
  ...PACKAGE_PROTECTION_AUDIT_BASE_VARIANTS,
  ...PACKAGE_PROTECTION_AUDIT_EXPERIMENTAL_VARIANTS,
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
    id: "capability-baseline-registration",
    label: "capability id baseline-registration",
    needle: "baseline-registration",
    category: "inner-bundle-semantics",
  },
  {
    id: "capability-reader-summary",
    label: "capability id reader-summary",
    needle: "reader-summary",
    category: "inner-bundle-semantics",
  },
  {
    id: "capability-host-actions",
    label: "capability id host-actions",
    needle: "host-actions",
    category: "inner-bundle-semantics",
  },
  {
    id: "capability-settings-governance",
    label: "capability id settings-governance",
    needle: "settings-governance",
    category: "inner-bundle-semantics",
  },
  {
    id: "capability-runtime-bridge-report",
    label: "capability id runtime-bridge-report",
    needle: "runtime-bridge-report",
    category: "inner-bundle-semantics",
  },
  {
    id: "capability-label-baseline-registration",
    label: "capability label 基线注册",
    needle: "基线注册",
    category: "inner-bundle-semantics",
  },
  {
    id: "capability-label-item-presentation",
    label: "capability label 条目展示摘要",
    needle: "条目展示摘要",
    category: "inner-bundle-semantics",
  },
  {
    id: "capability-label-notifier-sync",
    label: "capability label 通知器联动",
    needle: "通知器联动",
    category: "inner-bundle-semantics",
  },
  {
    id: "capability-label-reader-summary",
    label: "capability label Reader 摘要",
    needle: "Reader 摘要",
    category: "inner-bundle-semantics",
  },
  {
    id: "capability-label-reader-annotation-roundtrip",
    label: "capability label Reader 批注回环",
    needle: "Reader 批注回环",
    category: "inner-bundle-semantics",
  },
  {
    id: "capability-label-reader-ui-state",
    label: "capability label Reader UI 状态",
    needle: "Reader UI 状态",
    category: "inner-bundle-semantics",
  },
  {
    id: "capability-label-reader-event-hooks",
    label: "capability label Reader 事件桥",
    needle: "Reader 事件桥",
    category: "inner-bundle-semantics",
  },
  {
    id: "capability-label-command-nonblocking",
    label: "capability label 无阻塞动作执行",
    needle: "无阻塞动作执行",
    category: "inner-bundle-semantics",
  },
  {
    id: "capability-label-host-actions",
    label: "capability label 宿主动作编排",
    needle: "宿主动作编排",
    category: "inner-bundle-semantics",
  },
  {
    id: "capability-label-settings-governance",
    label: "capability label 设置治理",
    needle: "设置治理",
    category: "inner-bundle-semantics",
  },
  {
    id: "capability-label-multi-window-mount",
    label: "capability label 多窗口挂载",
    needle: "多窗口挂载",
    category: "inner-bundle-semantics",
  },
  {
    id: "capability-label-runtime-bridge-report",
    label: "capability label 运行时桥接报告",
    needle: "运行时桥接报告",
    category: "inner-bundle-semantics",
  },
  {
    id: "scenario-reader-current",
    label: "agent scenario reader-current",
    needle: "reader-current",
    category: "inner-bundle-semantics",
  },
  {
    id: "scenario-settings-snapshot",
    label: "agent scenario settings-snapshot",
    needle: "settings-snapshot",
    category: "inner-bundle-semantics",
  },
  {
    id: "scenario-window-snapshot",
    label: "agent scenario window-snapshot",
    needle: "window-snapshot",
    category: "inner-bundle-semantics",
  },
  {
    id: "scenario-command-no-ui",
    label: "agent scenario command-no-ui",
    needle: "command-no-ui",
    category: "inner-bundle-semantics",
  },
  {
    id: "scenario-capability-manifest",
    label: "agent scenario capability-manifest",
    needle: "capability-manifest",
    category: "inner-bundle-semantics",
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
  {
    id: "tools-menu-item-id",
    label: "tools menu item id",
    needle: "cleanroom-template-menuitem",
    category: "inner-bundle-semantics",
  },
  {
    id: "tools-menu-style-id",
    label: "tools menu stylesheet id",
    needle: "cleanroom-template-style",
    category: "inner-bundle-semantics",
  },
  {
    id: "command-copy-open-cleanroom-action",
    label: "Open Cleanroom Action",
    needle: "Open Cleanroom Action",
    category: "inner-bundle-semantics",
  },
  {
    id: "reader-copy-demo-summary",
    label: "Show Reader Demo Summary",
    needle: "Show Reader Demo Summary",
    category: "inner-bundle-semantics",
  },
  {
    id: "reader-copy-selection-snapshot",
    label: "Show Reader Selection Snapshot",
    needle: "Show Reader Selection Snapshot",
    category: "inner-bundle-semantics",
  },
  {
    id: "demo-copy-idle",
    label: "No notifier event yet.",
    needle: "No notifier event yet.",
    category: "inner-bundle-semantics",
  },
  {
    id: "demo-copy-ready",
    label: "Baseline demos ready",
    needle: "Baseline demos ready",
    category: "inner-bundle-semantics",
  },
  {
    id: "react-copy-command",
    label: "Open Optional React UI Demo",
    needle: "Open Optional React UI Demo",
    category: "inner-bundle-semantics",
  },
  {
    id: "react-copy-surface",
    label: "Optional React Host Surface",
    needle: "Optional React Host Surface",
    category: "inner-bundle-semantics",
  },
  {
    id: "service-label-runtime-core",
    label: "Runtime Core",
    needle: "Runtime Core",
    category: "inner-bundle-semantics",
  },
  {
    id: "service-label-host-signals",
    label: "Host Signal Collector",
    needle: "Host Signal Collector",
    category: "inner-bundle-semantics",
  },
  {
    id: "service-label-host-nonce",
    label: "Host Nonce Store",
    needle: "Host Nonce Store",
    category: "inner-bundle-semantics",
  },
  {
    id: "service-label-runtime-bridge",
    label: "Runtime Bridge",
    needle: "Runtime Bridge",
    category: "inner-bundle-semantics",
  },
  {
    id: "host-action-open-pane",
    label: "preferences.openPane",
    needle: "preferences.openPane",
    category: "inner-bundle-semantics",
  },
  {
    id: "host-action-reader-open",
    label: "reader.open",
    needle: "reader.open",
    category: "inner-bundle-semantics",
  },
  {
    id: "host-action-runtime-probe-wasm",
    label: "runtime.probeWasmKernel",
    needle: "runtime.probeWasmKernel",
    category: "inner-bundle-semantics",
  },
  {
    id: "host-action-runtime-digest-wasm",
    label: "runtime.deriveWasmKernelDigest",
    needle: "runtime.deriveWasmKernelDigest",
    category: "inner-bundle-semantics",
  },
  {
    id: "host-action-window-react-demo",
    label: "window.openReactDemo",
    needle: "window.openReactDemo",
    category: "inner-bundle-semantics",
  },
  {
    id: "host-action-catalog-authoritative-source",
    label: "authoritativeSource",
    needle: "authoritativeSource",
    category: "inner-bundle-semantics",
  },
  {
    id: "host-action-catalog-readiness-assertions",
    label: "readinessAssertions",
    needle: "readinessAssertions",
    category: "inner-bundle-semantics",
  },
]);

export const PACKAGE_PROTECTION_UNPACKED_SURFACE_TARGETS = Object.freeze([
  "manifest.json",
  "bootstrap.js",
  "prefs.js",
  "content/preferences.js",
  "content/preference-pane-load-bridge.js",
  "content/theme.js",
  "content/preferences.xhtml",
  REACT_UI_DEMO_SHELL_PATH,
  WASM_KERNEL_PROBE_PATH,
  WASM_KERNEL_PROBE_WORKER_PATH,
  "locale/en-US/main.ftl",
  "locale/zh-CN/main.ftl",
  "locale/zh-TW/main.ftl",
]);

const PACKAGE_PROTECTION_UNPACKED_SURFACE_ANCHOR_IDS = new Set([
  "addon-ref-literal",
  "addon-name-literal",
  "addon-version-literal",
  "author-literal",
  "homepage-url-literal",
  "update-url-literal",
  "instance-key-literal",
  "preference-pane-root-id",
  "tools-menu-item-id",
  "tools-menu-style-id",
  "command-copy-open-cleanroom-action",
  "reader-copy-demo-summary",
  "reader-copy-selection-snapshot",
  "demo-copy-idle",
  "demo-copy-ready",
  "react-copy-command",
  "react-copy-surface",
  "service-label-runtime-core",
  "service-label-host-signals",
  "service-label-host-nonce",
  "service-label-runtime-bridge",
  "host-action-open-pane",
  "host-action-runtime-probe-wasm",
  "host-action-runtime-digest-wasm",
  "host-action-window-react-demo",
  "host-action-catalog-authoritative-source",
  "host-action-catalog-readiness-assertions",
  "bootstrap-log-prefix",
  "bootstrap-console-bridge",
  "bootstrap-capability-report",
  "wasm-worker-fetch-failure",
  "wasm-worker-instantiate",
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
  if (normalized === "wasm-digest") {
    return "surface-scrub-wasm-digest";
  }
  if (normalized === "wasm-stage2-derive") {
    return "surface-scrub-wasm-stage2-derive";
  }
  if (normalized === "wasm-entitlement-legacy") {
    return "surface-scrub-wasm-entitlement-legacy";
  }
  return PACKAGE_PROTECTION_AUDIT_VARIANTS.includes(normalized)
    ? normalized
    : null;
}

function dedupeVariants(variants = []) {
  return Array.from(new Set(
    (Array.isArray(variants) ? variants : [])
      .map((variant) => String(variant || "").trim())
      .filter(Boolean),
  ));
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
    case "descriptor-bind":
      return ["scripts/package.mjs", "--descriptor-bind", "--skip-release-metadata"];
    case "jsconfuser-string":
      return ["scripts/package.mjs", "--jsconfuser-string", "--skip-release-metadata"];
    case "pref-bridge":
      return ["scripts/package.mjs", "--pref-bridge", "--skip-release-metadata"];
    case "surface-scrub":
      return ["scripts/package.mjs", "--surface-scrub", "--skip-release-metadata"];
    case "surface-scrub-wasm-digest":
      return ["scripts/package.mjs", "--surface-scrub-wasm-digest", "--skip-release-metadata"];
    case "surface-scrub-wasm-stage2-derive":
      return ["scripts/package.mjs", "--surface-scrub-wasm-stage2-derive", "--skip-release-metadata"];
    case "surface-scrub-wasm-entitlement-legacy":
      return ["scripts/package.mjs", "--surface-scrub-wasm-entitlement-legacy", "--skip-release-metadata"];
    default:
      throw createScriptError("args", `unsupported package protection audit variant: ${variant}`, {
        failedStage: "build-variant-args",
        details: { variant },
      });
  }
}

export function resolvePackageProtectionAuditOutputSuffix(variant) {
  switch (String(variant || "").trim()) {
    case "plain":
      return "";
    case "encrypted":
      return "encrypted";
    case "shielded":
      return "shielded";
    case "descriptor-bind":
      return "shielded-descriptor-bind";
    case "jsconfuser-string":
      return "shielded-jsconfuser-string";
    case "pref-bridge":
      return "shielded-pref-bridge";
    case "surface-scrub":
      return "shielded-surface-scrub";
    case "surface-scrub-wasm-digest":
      return "shielded-surface-scrub-wasm-digest";
    case "surface-scrub-wasm-stage2-derive":
      return "shielded-surface-scrub-wasm-stage2-derive";
    case "surface-scrub-wasm-entitlement-legacy":
      return "shielded-surface-scrub-wasm-entitlement-legacy";
    default:
      throw createScriptError("args", `unsupported package protection audit variant: ${variant}`, {
        failedStage: "resolve-output-suffix",
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
  const addonName = String(config.addonName || "").trim();
  const addonRef = String(config.addonRef || "").trim();
  const addonVersion = String(config.addonVersion || "").trim();
  const author = String(config.author || "").trim();
  const homepage = String(config.homepage || "").trim();
  const updateURL = String(config.updateURL || "").trim();
  const instanceKey = String(config.instanceKey || "").trim();
  const dynamicAnchors = [];

  if (addonName) {
    dynamicAnchors.push({
      id: "addon-name-literal",
      label: "addonName literal",
      needle: addonName,
      category: "loader-metadata",
    });
  }

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

  if (author) {
    dynamicAnchors.push({
      id: "author-literal",
      label: "author literal",
      needle: author,
      category: "loader-metadata",
    });
  }

  if (homepage) {
    dynamicAnchors.push({
      id: "homepage-url-literal",
      label: "homepage_url literal",
      needle: homepage,
      category: "loader-metadata",
    });
  }

  if (updateURL) {
    dynamicAnchors.push({
      id: "update-url-literal",
      label: "update_url literal",
      needle: updateURL,
      category: "loader-metadata",
    });
  }

  if (instanceKey) {
    dynamicAnchors.push({
      id: "instance-key-literal",
      label: "instanceKey literal",
      needle: instanceKey,
      category: "loader-metadata",
    });
  }

  if (addonRef) {
    [
      ["preference-pane-id", `${addonRef}-preferences`],
      ["preference-pane-root-id", `${addonRef}-preferences-root`],
      ["primary-action-command-id", `${addonRef}-primary-action`],
      ["reader-summary-entry-id", `${addonRef}-reader-summary`],
      ["reader-selection-command-id", `${addonRef}-reader-selection-snapshot`],
      ["react-ui-demo-command-id", `${addonRef}-open-react-ui-demo`],
      ["context-action-menu-id", `${addonRef}-context-action`],
      ["demo-info-row-id", `${addonRef}-selection-summary`],
      ["demo-section-id", `${addonRef}-details`],
      ["demo-column-key", `${addonRef}-status`],
      ["demo-notifier-id", `${addonRef}-activity`],
      ["runtime-core-service-id", `${addonRef}.runtime-core`],
      ["host-signals-service-id", `${addonRef}.host-signals`],
      ["host-nonce-service-id", `${addonRef}.host-nonce`],
      ["runtime-bridge-service-id", `${addonRef}.runtime-bridge`],
      ["react-ui-demo-service-id", `${addonRef}.react-ui-demo`],
    ].forEach(([id, needle]) => {
      dynamicAnchors.push({
        id,
        label: id,
        needle,
        category: "inner-bundle-semantics",
      });
    });
  }

  return dynamicAnchors;
}

export function buildPackageProtectionAuditAnchors(config = {}) {
  return [
    ...buildDynamicAnchors(config),
    ...PACKAGE_PROTECTION_ROUTE_AUDIT_BASE_ANCHORS,
    {
      id: "bootstrap-log-prefix",
      label: "bootstrap log prefix",
      needle: "cleanroom.bootstrap",
      category: "inner-bundle-semantics",
    },
    {
      id: "bootstrap-console-bridge",
      label: "console-bridge",
      needle: "console-bridge",
      category: "inner-bundle-semantics",
    },
    {
      id: "bootstrap-capability-report",
      label: "capability-report",
      needle: "capability-report",
      category: "inner-bundle-semantics",
    },
    {
      id: "wasm-worker-fetch-failure",
      label: "worker cannot fetch wasm bytes",
      needle: "worker cannot fetch wasm bytes",
      category: "inner-bundle-semantics",
    },
    {
      id: "wasm-worker-instantiate",
      label: "WebAssembly.instantiate",
      needle: "WebAssembly.instantiate",
      category: "inner-bundle-semantics",
    },
  ];
}

export function buildPackageProtectionUnpackedSurfaceAnchors(config = {}) {
  return buildPackageProtectionAuditAnchors(config)
    .filter((anchor) => PACKAGE_PROTECTION_UNPACKED_SURFACE_ANCHOR_IDS.has(anchor?.id));
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

export function scanPackageProtectionSurfaceFiles(files = [], anchors = []) {
  const entries = Array.isArray(files) ? files : [];
  const byFile = entries.map((entry) => {
    const relativePath = String(entry?.relativePath || "").trim() || null;
    const source = String(entry?.source || "");
    const scan = scanBundleAnchors(source, anchors);
    return {
      relativePath,
      absolutePath: String(entry?.absolutePath || "").trim() || null,
      sizeBytes: Number(entry?.sizeBytes || Buffer.byteLength(source, "utf-8") || 0),
      totalAnchorCount: scan.totalAnchorCount,
      totalMatchCount: scan.totalMatchCount,
      categoryCounts: scan.categoryCounts,
      presentAnchors: getPresentMatches(scan.anchors).map((anchor) => ({
        id: anchor.id,
        label: anchor.label,
        category: anchor.category,
        count: anchor.count,
      })),
      anchors: scan.anchors,
    };
  });

  const exposedFiles = byFile
    .filter((entry) => entry.totalAnchorCount > 0)
    .map((entry) => entry.relativePath)
    .filter(Boolean);

  return {
    totalAnchorCount: byFile.reduce((sum, entry) => sum + Number(entry.totalAnchorCount || 0), 0),
    totalMatchCount: byFile.reduce((sum, entry) => sum + Number(entry.totalMatchCount || 0), 0),
    exposedFiles,
    byFile,
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
    variants: [...PACKAGE_PROTECTION_AUDIT_BASE_VARIANTS],
    includeDescriptorBind: false,
    includeJSConfuserString: false,
    includePrefBridge: false,
    jsConfuserToolEntry: null,
    jsConfuserToolPath: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || "").trim();
    if (!token) {
      continue;
    }

    switch (token) {
      case "--variant": {
        const variant = normalizeVariant(argv[index + 1]);
        assertScript(Boolean(variant), "--variant must be one of plain|encrypted|shielded|descriptor-bind|jsconfuser-string|pref-bridge|surface-scrub|surface-scrub-wasm-digest|surface-scrub-wasm-stage2-derive|surface-scrub-wasm-entitlement-legacy|all", {
          category: "args",
          failedStage: "parse-args",
        });
        options.variants = variant === "all"
          ? [...PACKAGE_PROTECTION_AUDIT_BASE_VARIANTS]
          : [variant];
        index += 1;
        break;
      }
      case "--include-descriptor-bind":
        options.includeDescriptorBind = true;
        break;
      case "--include-jsconfuser-string":
        options.includeJSConfuserString = true;
        break;
      case "--include-pref-bridge":
        options.includePrefBridge = true;
        break;
      case "--include-surface-scrub":
        options.variants = dedupeVariants([
          ...options.variants,
          "surface-scrub",
        ]);
        break;
      case "--include-surface-scrub-wasm-digest":
        options.variants = dedupeVariants([
          ...options.variants,
          "surface-scrub-wasm-digest",
        ]);
        break;
      case "--include-surface-scrub-wasm-stage2-derive":
        options.variants = dedupeVariants([
          ...options.variants,
          "surface-scrub-wasm-stage2-derive",
        ]);
        break;
      case "--include-surface-scrub-wasm-entitlement-legacy":
        options.variants = dedupeVariants([
          ...options.variants,
          "surface-scrub-wasm-entitlement-legacy",
        ]);
        break;
      case "--jsconfuser-tool-path":
        options.jsConfuserToolPath = String(argv[index + 1] || "").trim() || null;
        index += 1;
        break;
      case "--jsconfuser-tool-entry":
        options.jsConfuserToolEntry = String(argv[index + 1] || "").trim() || null;
        index += 1;
        break;
      default:
        throw createScriptError("args", `Unknown option: ${token}`, {
          failedStage: "parse-args",
          details: { option: token },
        });
    }
  }

  if (options.includeDescriptorBind) {
    options.variants = dedupeVariants([
      ...options.variants,
      "descriptor-bind",
    ]);
  }

  if (options.includeJSConfuserString) {
    options.variants = dedupeVariants([
      ...options.variants,
      "jsconfuser-string",
    ]);
  }

  if (options.includePrefBridge) {
    options.variants = dedupeVariants([
      ...options.variants,
      "pref-bridge",
    ]);
  }

  return options;
}

function resolveAuditJSConfuserToolOptions(options = {}, env = process.env) {
  const toolPath = String(
    options.jsConfuserToolPath
    || env[PACKAGE_JSCONFUSER_TOOL_PATH_ENV]
    || "",
  ).trim() || null;
  const toolEntry = String(
    options.jsConfuserToolEntry
    || env[PACKAGE_JSCONFUSER_TOOL_ENTRY_ENV]
    || "",
  ).trim() || null;

  return {
    toolPath,
    toolEntry,
  };
}

async function buildVariantAudit({ projectRootPath, config, variant, anchors, options = {} }) {
  const args = buildVariantPackageArgs(variant);
  const bundlePath = path.join(projectRootPath, "build", config.addonRef, "content", "scripts", `${config.addonRef}.js`);
  const outputSuffix = resolvePackageProtectionAuditOutputSuffix(variant);
  const xpiName = outputSuffix
    ? `${config.addonRef}-${config.addonVersion}-${outputSuffix}.xpi`
    : `${config.addonRef}-${config.addonVersion}.xpi`;
  const xpiPath = path.join(projectRootPath, "dist", xpiName);

  try {
    const env = {
      ...process.env,
    };
    if (variant === "jsconfuser-string") {
      const jsConfuserTool = resolveAuditJSConfuserToolOptions(options);
      const toolSelection = await resolveJSConfuserToolSelection({
        toolPath: jsConfuserTool.toolPath,
        toolEntry: jsConfuserTool.toolEntry,
        projectRootPath,
        env,
      });
      env[PACKAGE_JSCONFUSER_TOOL_PATH_ENV] = toolSelection.toolPath;
      if (toolSelection.toolEntry) {
        env[PACKAGE_JSCONFUSER_TOOL_ENTRY_ENV] = toolSelection.toolEntry;
      }
    }
    execFileSync(process.execPath, args, {
      cwd: projectRootPath,
      stdio: "pipe",
      env,
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
  const unpackedSurfaceAnchors = buildPackageProtectionUnpackedSurfaceAnchors(config);
  const unpackedSurfaceFiles = await readPackageProtectionSurfaceFilesFromXpi({
    xpiPath,
    targetFiles: PACKAGE_PROTECTION_UNPACKED_SURFACE_TARGETS,
  });

  return {
    variant,
    bundlePath,
    bundleSizeBytes: bundleStats.size,
    xpiPath,
    xpiSizeBytes: xpiStats.size,
    ...scan,
    unpackedSurface: {
      xpiPath,
      targetFiles: PACKAGE_PROTECTION_UNPACKED_SURFACE_TARGETS.slice(),
      ...scanPackageProtectionSurfaceFiles(unpackedSurfaceFiles, unpackedSurfaceAnchors),
    },
  };
}

async function readPackageProtectionSurfaceFilesFromXpi({ xpiPath, targetFiles = [] } = {}) {
  const archiveListing = execFileSync("unzip", ["-Z1", xpiPath], {
    encoding: "utf-8",
    maxBuffer: 32 * 1024 * 1024,
  });
  const archiveEntries = new Set(
    String(archiveListing || "")
      .split(/\r?\n/u)
      .map((entry) => String(entry || "").trim())
      .filter(Boolean),
  );
  const unpackedFiles = [];

  for (const relativePath of Array.isArray(targetFiles) ? targetFiles : []) {
    if (!archiveEntries.has(relativePath)) {
      continue;
    }

    let source = "";
    try {
      source = execFileSync("unzip", ["-p", xpiPath, relativePath], {
        encoding: "utf-8",
        maxBuffer: 32 * 1024 * 1024,
      });
    } catch (error) {
      throw wrapScriptError(error, {
        failedStage: "scan-variant-unpacked-surface",
        details: {
          xpiPath,
          relativePath,
        },
      });
    }

    unpackedFiles.push({
      relativePath,
      absolutePath: `${xpiPath}#${relativePath}`,
      sizeBytes: Buffer.byteLength(source, "utf-8"),
      source,
    });
  }

  return unpackedFiles;
}

async function buildSourceProxyAudit({ projectRootPath, config, mode, anchors }) {
  const bundlePath = path.join(projectRootPath, "build", config.addonRef, "content", "scripts", `${config.addonRef}.js`);
  const buildRootPath = path.join(projectRootPath, "build", config.addonRef);

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
  const unpackedSurfaceAnchors = buildPackageProtectionUnpackedSurfaceAnchors(config);
  const unpackedSurfaceFiles = [];
  for (const relativePath of PACKAGE_PROTECTION_UNPACKED_SURFACE_TARGETS) {
    const absolutePath = path.join(buildRootPath, relativePath);
    try {
      const [fileSource, fileStats] = await Promise.all([
        fs.readFile(absolutePath, "utf-8"),
        fs.stat(absolutePath),
      ]);
      unpackedSurfaceFiles.push({
        relativePath,
        absolutePath,
        sizeBytes: Number(fileStats.size || 0),
        source: fileSource,
      });
    } catch (error) {
      if (error?.code === "ENOENT") {
        continue;
      }
      throw wrapScriptError(error, {
        failedStage: "scan-unpacked-surface",
        details: {
          mode,
          relativePath,
          absolutePath,
        },
      });
    }
  }

  return {
    mode,
    bundlePath,
    bundleSizeBytes: bundleStats.size,
    ...scan,
    unpackedSurface: {
      buildRootPath,
      targetFiles: PACKAGE_PROTECTION_UNPACKED_SURFACE_TARGETS.slice(),
      ...scanPackageProtectionSurfaceFiles(unpackedSurfaceFiles, unpackedSurfaceAnchors),
    },
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

export function summarizePackageProtectionUnpackedSurface(sourceProxyReports = []) {
  const reportByMode = new Map(
    (Array.isArray(sourceProxyReports) ? sourceProxyReports : [])
      .map((report) => [String(report?.mode || "").trim(), report?.unpackedSurface || null]),
  );
  const plain = reportByMode.get("plain") || null;
  const protectedReport = reportByMode.get("protected") || null;

  if (!plain || !protectedReport) {
    return {
      present: false,
      totalAnchorCount: 0,
      totalMatchCount: 0,
      exposedFiles: [],
      byFile: [],
      nextAction: "collect-unpacked-surface",
      summary: "缺少 plain 或 protected 的 unpacked surface 视图，暂时无法判断静态 support surface 的减噪幅度。",
    };
  }

  const reductionRatio = Number(plain.totalAnchorCount || 0) > 0
    ? Number(protectedReport.totalAnchorCount || 0) / Number(plain.totalAnchorCount || 1)
    : 0;
  const reducedAnchorCount = Math.max(0, Number(plain.totalAnchorCount || 0) - Number(protectedReport.totalAnchorCount || 0));
  const reducedMatchCount = Math.max(0, Number(plain.totalMatchCount || 0) - Number(protectedReport.totalMatchCount || 0));

  let nextAction = "keep-surface-scrub";
  let summary = "protected source proxy 的 unpacked support surface 已基本收敛。";
  if (protectedReport.totalAnchorCount > 0 && reductionRatio > 0.4) {
    nextAction = "trim-unpacked-surface";
    summary = "protected source proxy 仍在 unpacked support surface 暴露较多描述性锚点，若未来要继续压低 AI 高层归纳速度，可再收紧静态 support surface。";
  } else if (protectedReport.totalAnchorCount > 0) {
    nextAction = "keep-surface-scrub-advisory";
    summary = "protected source proxy 已明显压缩 unpacked support surface，但仍保留少量可见 support surface 锚点；当前更适合作为后续 hardening 候选，而不是立即重开主线。";
  }

  return {
    present: true,
    totalAnchorCount: Number(protectedReport.totalAnchorCount || 0),
    totalMatchCount: Number(protectedReport.totalMatchCount || 0),
    exposedFiles: Array.isArray(protectedReport.exposedFiles) ? protectedReport.exposedFiles.slice() : [],
    byFile: Array.isArray(protectedReport.byFile) ? protectedReport.byFile : [],
    targetFiles: Array.isArray(protectedReport.targetFiles) ? protectedReport.targetFiles.slice() : [],
    nextAction,
    summary,
    plain: {
      buildRootPath: plain.buildRootPath,
      totalAnchorCount: Number(plain.totalAnchorCount || 0),
      totalMatchCount: Number(plain.totalMatchCount || 0),
      exposedFiles: Array.isArray(plain.exposedFiles) ? plain.exposedFiles.slice() : [],
      byFile: Array.isArray(plain.byFile) ? plain.byFile : [],
    },
    protected: {
      buildRootPath: protectedReport.buildRootPath,
      totalAnchorCount: Number(protectedReport.totalAnchorCount || 0),
      totalMatchCount: Number(protectedReport.totalMatchCount || 0),
      exposedFiles: Array.isArray(protectedReport.exposedFiles) ? protectedReport.exposedFiles.slice() : [],
      byFile: Array.isArray(protectedReport.byFile) ? protectedReport.byFile : [],
    },
    reducedAnchorCount,
    reducedMatchCount,
  };
}

export function summarizeDescriptorBindComparison(variantReports = []) {
  const reportByVariant = new Map(
    (Array.isArray(variantReports) ? variantReports : [])
      .map((report) => [String(report?.variant || "").trim(), report]),
  );
  const shielded = reportByVariant.get("shielded") || null;
  const descriptorBind = reportByVariant.get("descriptor-bind") || null;

  if (!shielded || !descriptorBind) {
    return {
      present: false,
      shieldedPresent: Boolean(shielded),
      descriptorBindPresent: Boolean(descriptorBind),
      sameRawSurface: false,
      rawAnchorDeltaCount: null,
      rawMatchDeltaCount: null,
      xpiSizeDeltaBytes: null,
      bundleSizeDeltaBytes: null,
      interpretation: "descriptor-bind 对比样本不完整，暂不生成增量结论。",
      recommendedReading: "collect-descriptor-bind-audit",
    };
  }

  const rawAnchorDeltaCount = Number(descriptorBind.totalAnchorCount || 0) - Number(shielded.totalAnchorCount || 0);
  const rawMatchDeltaCount = Number(descriptorBind.totalMatchCount || 0) - Number(shielded.totalMatchCount || 0);
  const xpiSizeDeltaBytes = Number(descriptorBind.xpiSizeBytes || 0) - Number(shielded.xpiSizeBytes || 0);
  const bundleSizeDeltaBytes = Number(descriptorBind.bundleSizeBytes || 0) - Number(shielded.bundleSizeBytes || 0);
  const sameRawSurface = rawAnchorDeltaCount === 0 && rawMatchDeltaCount === 0;

  return {
    present: true,
    shieldedPresent: true,
    descriptorBindPresent: true,
    sameRawSurface,
    rawAnchorDeltaCount,
    rawMatchDeltaCount,
    xpiSizeDeltaBytes,
    bundleSizeDeltaBytes,
    interpretation: sameRawSurface
      ? "descriptor-bind 没有改变 raw export 暴露面，增量更可能落在 runtime semantic recovery。"
      : "descriptor-bind 改变了 raw export 暴露面，需要重新判断它是 hardening 还是 regression。",
    recommendedReading: sameRawSurface
      ? "runtime-semantic-recovery"
      : "recheck-raw-export-surface",
  };
}

export function summarizeJSConfuserStringComparison(variantReports = []) {
  const reportByVariant = new Map(
    (Array.isArray(variantReports) ? variantReports : [])
      .map((report) => [String(report?.variant || "").trim(), report]),
  );
  const shielded = reportByVariant.get("shielded") || null;
  const jsConfuserString = reportByVariant.get("jsconfuser-string") || null;

  if (!shielded || !jsConfuserString) {
    return {
      present: false,
      shieldedPresent: Boolean(shielded),
      jsConfuserStringPresent: Boolean(jsConfuserString),
      sameRawSurface: false,
      rawAnchorDeltaCount: null,
      rawMatchDeltaCount: null,
      xpiSizeDeltaBytes: null,
      bundleSizeDeltaBytes: null,
      interpretation: "jsconfuser-string 对比样本不完整，暂不生成增量结论。",
      recommendedReading: "collect-jsconfuser-string-audit",
    };
  }

  const rawAnchorDeltaCount = Number(jsConfuserString.totalAnchorCount || 0) - Number(shielded.totalAnchorCount || 0);
  const rawMatchDeltaCount = Number(jsConfuserString.totalMatchCount || 0) - Number(shielded.totalMatchCount || 0);
  const xpiSizeDeltaBytes = Number(jsConfuserString.xpiSizeBytes || 0) - Number(shielded.xpiSizeBytes || 0);
  const bundleSizeDeltaBytes = Number(jsConfuserString.bundleSizeBytes || 0) - Number(shielded.bundleSizeBytes || 0);
  const sameRawSurface = rawAnchorDeltaCount === 0 && rawMatchDeltaCount === 0;

  return {
    present: true,
    shieldedPresent: true,
    jsConfuserStringPresent: true,
    sameRawSurface,
    rawAnchorDeltaCount,
    rawMatchDeltaCount,
    xpiSizeDeltaBytes,
    bundleSizeDeltaBytes,
    interpretation: sameRawSurface
      ? "jsconfuser-string 没有改变 raw export 暴露面，增量更可能落在 inner semantic suppression 与手工解读阻力。"
      : "jsconfuser-string 改变了 raw export 暴露面，需要重新判断它是 hardening 还是 regression。",
    recommendedReading: sameRawSurface
      ? "jsconfuser-targeted-string-smoke"
      : "recheck-raw-export-surface",
  };
}

export function summarizePrefBridgeComparison(variantReports = []) {
  const reportByVariant = new Map(
    (Array.isArray(variantReports) ? variantReports : [])
      .map((report) => [String(report?.variant || "").trim(), report]),
  );
  const shielded = reportByVariant.get("shielded") || null;
  const prefBridge = reportByVariant.get("pref-bridge") || null;

  if (!shielded || !prefBridge) {
    return {
      present: false,
      shieldedPresent: Boolean(shielded),
      prefBridgePresent: Boolean(prefBridge),
      sameRawSurface: null,
      rawAnchorDeltaCount: null,
      rawMatchDeltaCount: null,
      sameUnpackedSurface: null,
      unpackedAnchorDeltaCount: null,
      unpackedMatchDeltaCount: null,
      xpiSizeDeltaBytes: null,
      bundleSizeDeltaBytes: null,
      interpretation: "pref-bridge 对比样本不完整，暂不生成增量结论。",
      recommendedReading: "collect-pref-bridge-audit",
    };
  }

  const rawAnchorDeltaCount = Number(prefBridge.totalAnchorCount || 0) - Number(shielded.totalAnchorCount || 0);
  const rawMatchDeltaCount = Number(prefBridge.totalMatchCount || 0) - Number(shielded.totalMatchCount || 0);
  const unpackedAnchorDeltaCount = Number(prefBridge.unpackedSurface?.totalAnchorCount || 0)
    - Number(shielded.unpackedSurface?.totalAnchorCount || 0);
  const unpackedMatchDeltaCount = Number(prefBridge.unpackedSurface?.totalMatchCount || 0) - Number(shielded.unpackedSurface?.totalMatchCount || 0);
  const xpiSizeDeltaBytes = Number(prefBridge.xpiSizeBytes || 0) - Number(shielded.xpiSizeBytes || 0);
  const bundleSizeDeltaBytes = Number(prefBridge.bundleSizeBytes || 0) - Number(shielded.bundleSizeBytes || 0);
  const sameRawSurface = rawAnchorDeltaCount === 0 && rawMatchDeltaCount === 0;
  const sameUnpackedSurface = unpackedAnchorDeltaCount === 0 && unpackedMatchDeltaCount === 0;

  let interpretation = "pref-bridge 当前没有改变可观测静态表面。";
  let recommendedReading = "keep-pref-bridge-advisory";
  if (sameRawSurface && (unpackedAnchorDeltaCount < 0 || unpackedMatchDeltaCount < 0)) {
    interpretation = "pref-bridge 没有改变 raw export 暴露面，但确实压缩了最终 XPI 的 unpacked support surface。";
    recommendedReading = "static-support-surface-hardening";
  } else if (!sameRawSurface) {
    interpretation = "pref-bridge 改变了 raw export 暴露面，需要先确认这不是意外静态回归。";
    recommendedReading = "recheck-raw-export-surface";
  } else if (!sameUnpackedSurface) {
    interpretation = "pref-bridge 改变了最终 XPI 的 unpacked support surface，需要结合运行时和自动化评分继续判断收益。";
    recommendedReading = "recheck-unpacked-support-surface";
  }

  return {
    present: true,
    shieldedPresent: true,
    prefBridgePresent: true,
    sameRawSurface,
    rawAnchorDeltaCount,
    rawMatchDeltaCount,
    sameUnpackedSurface,
    unpackedAnchorDeltaCount,
    unpackedMatchDeltaCount,
    xpiSizeDeltaBytes,
    bundleSizeDeltaBytes,
    interpretation,
    recommendedReading,
  };
}

export function summarizeSurfaceScrubComparison(variantReports = []) {
  const reportByVariant = new Map(
    (Array.isArray(variantReports) ? variantReports : [])
      .map((report) => [String(report?.variant || "").trim(), report]),
  );
  const shielded = reportByVariant.get("shielded") || null;
  const surfaceScrub = reportByVariant.get("surface-scrub") || null;

  if (!shielded || !surfaceScrub) {
    return {
      present: false,
      shieldedPresent: Boolean(shielded),
      surfaceScrubPresent: Boolean(surfaceScrub),
      sameRawSurface: null,
      rawAnchorDeltaCount: null,
      rawMatchDeltaCount: null,
      sameUnpackedSurface: null,
      unpackedAnchorDeltaCount: null,
      unpackedMatchDeltaCount: null,
      residualExposedFiles: [],
      residualAnchorIds: [],
      residualFloorReached: false,
      xpiSizeDeltaBytes: null,
      bundleSizeDeltaBytes: null,
      interpretation: "surface-scrub 对比样本不完整，暂不生成增量结论。",
      recommendedReading: "collect-surface-scrub-audit",
    };
  }

  const rawAnchorDeltaCount = Number(surfaceScrub.totalAnchorCount || 0) - Number(shielded.totalAnchorCount || 0);
  const rawMatchDeltaCount = Number(surfaceScrub.totalMatchCount || 0) - Number(shielded.totalMatchCount || 0);
  const unpackedAnchorDeltaCount = Number(surfaceScrub.unpackedSurface?.totalAnchorCount || 0)
    - Number(shielded.unpackedSurface?.totalAnchorCount || 0);
  const unpackedMatchDeltaCount = Number(surfaceScrub.unpackedSurface?.totalMatchCount || 0) - Number(shielded.unpackedSurface?.totalMatchCount || 0);
  const xpiSizeDeltaBytes = Number(surfaceScrub.xpiSizeBytes || 0) - Number(shielded.xpiSizeBytes || 0);
  const bundleSizeDeltaBytes = Number(surfaceScrub.bundleSizeBytes || 0) - Number(shielded.bundleSizeBytes || 0);
  const sameRawSurface = rawAnchorDeltaCount === 0 && rawMatchDeltaCount === 0;
  const sameUnpackedSurface = unpackedAnchorDeltaCount === 0 && unpackedMatchDeltaCount === 0;
  const residualExposedFiles = Array.isArray(surfaceScrub.unpackedSurface?.exposedFiles)
    ? surfaceScrub.unpackedSurface.exposedFiles.slice()
    : [];
  const residualAnchorIds = Array.isArray(surfaceScrub.unpackedSurface?.byFile)
    ? surfaceScrub.unpackedSurface.byFile
      .filter((entry) => entry?.relativePath === "manifest.json" && Number(entry?.totalAnchorCount || 0) > 0)
      .flatMap((entry) => Array.isArray(entry?.presentAnchors) ? entry.presentAnchors.map((anchor) => anchor?.id).filter(Boolean) : [])
    : [];
  const residualAnchorIDSet = new Set(residualAnchorIds);
  const residualFloorReached = residualExposedFiles.length === 1
    && residualExposedFiles[0] === "manifest.json"
    && residualAnchorIDSet.size > 0
    && Array.from(residualAnchorIDSet).every((id) => id === "addon-version-literal" || id === "update-url-literal");

  let interpretation = "surface-scrub 当前没有改变可观测静态表面。";
  let recommendedReading = "keep-surface-scrub-advisory";
  if (sameRawSurface && (unpackedAnchorDeltaCount < 0 || unpackedMatchDeltaCount < 0)) {
    if (residualFloorReached) {
      interpretation = "surface-scrub 没有改变 raw export 暴露面，并已把 unpacked support surface 压到 manifest 兼容性下限；当前残余只剩 addonVersion / update_url。";
      recommendedReading = "surface-scrub-floor-reached";
    } else {
      interpretation = "surface-scrub 没有改变 raw export 暴露面，但继续压缩了最终 XPI 的 unpacked support surface。";
      recommendedReading = "surface-scrub-hardening";
    }
  } else if (!sameRawSurface) {
    interpretation = "surface-scrub 改变了 raw export 暴露面，需要先确认这不是新的静态回归。";
    recommendedReading = "recheck-raw-export-surface";
  } else if (!sameUnpackedSurface) {
    interpretation = "surface-scrub 改变了最终 XPI 的 unpacked support surface，需要结合运行时和自动化评分继续判断收益。";
    recommendedReading = "recheck-unpacked-support-surface";
  }

  return {
    present: true,
    shieldedPresent: true,
    surfaceScrubPresent: true,
    sameRawSurface,
    rawAnchorDeltaCount,
    rawMatchDeltaCount,
    sameUnpackedSurface,
    unpackedAnchorDeltaCount,
    unpackedMatchDeltaCount,
    residualExposedFiles,
    residualAnchorIds: Array.from(residualAnchorIDSet),
    residualFloorReached,
    xpiSizeDeltaBytes,
    bundleSizeDeltaBytes,
    interpretation,
    recommendedReading,
  };
}

function summarizeSurfaceScrubBoundedWasmComparison(variantReports = [], candidateVariant = "surface-scrub-wasm-digest") {
  const reportByVariant = new Map(
    (Array.isArray(variantReports) ? variantReports : [])
      .map((report) => [String(report?.variant || "").trim(), report]),
  );
  const surfaceScrub = reportByVariant.get("surface-scrub") || null;
  const wasmCandidate = reportByVariant.get(candidateVariant) || null;
  const candidateLabel = String(candidateVariant || "surface-scrub-wasm-digest").trim() || "surface-scrub-wasm-digest";

  if (!surfaceScrub || !wasmCandidate) {
    return {
      present: false,
      surfaceScrubPresent: Boolean(surfaceScrub),
      wasmDigestPresent: Boolean(wasmCandidate),
      sameRawSurface: null,
      rawAnchorDeltaCount: null,
      rawMatchDeltaCount: null,
      sameUnpackedSurface: null,
      unpackedAnchorDeltaCount: null,
      unpackedMatchDeltaCount: null,
      newExposedFiles: [],
      unexpectedExposedFiles: [],
      packageBoundaryWithinWasmAssets: false,
      xpiSizeDeltaBytes: null,
      bundleSizeDeltaBytes: null,
      interpretation: `${candidateLabel} 对比样本不完整，暂不生成增量结论。`,
      recommendedReading: `collect-${candidateLabel}-audit`,
    };
  }

  const rawAnchorDeltaCount = Number(wasmCandidate.totalAnchorCount || 0) - Number(surfaceScrub.totalAnchorCount || 0);
  const rawMatchDeltaCount = Number(wasmCandidate.totalMatchCount || 0) - Number(surfaceScrub.totalMatchCount || 0);
  const unpackedAnchorDeltaCount = Number(wasmCandidate.unpackedSurface?.totalAnchorCount || 0)
    - Number(surfaceScrub.unpackedSurface?.totalAnchorCount || 0);
  const unpackedMatchDeltaCount = Number(wasmCandidate.unpackedSurface?.totalMatchCount || 0)
    - Number(surfaceScrub.unpackedSurface?.totalMatchCount || 0);
  const xpiSizeDeltaBytes = Number(wasmCandidate.xpiSizeBytes || 0) - Number(surfaceScrub.xpiSizeBytes || 0);
  const bundleSizeDeltaBytes = Number(wasmCandidate.bundleSizeBytes || 0) - Number(surfaceScrub.bundleSizeBytes || 0);
  const sameRawSurface = rawAnchorDeltaCount === 0 && rawMatchDeltaCount === 0;
  const sameUnpackedSurface = unpackedAnchorDeltaCount === 0 && unpackedMatchDeltaCount === 0;

  const baseFileSet = new Set(
    Array.isArray(surfaceScrub.unpackedSurface?.byFile)
      ? surfaceScrub.unpackedSurface.byFile.map((entry) => String(entry?.relativePath || "").trim()).filter(Boolean)
      : [],
  );
  const candidateFileSet = new Set(
    Array.isArray(wasmCandidate.unpackedSurface?.byFile)
      ? wasmCandidate.unpackedSurface.byFile.map((entry) => String(entry?.relativePath || "").trim()).filter(Boolean)
      : [],
  );
  const newExposedFiles = Array.from(candidateFileSet)
    .filter((relativePath) => !baseFileSet.has(relativePath))
    .sort((left, right) => left.localeCompare(right));
  const unexpectedExposedFiles = newExposedFiles
    .filter((relativePath) => !relativePath.startsWith("content/lib/w/"));
  const packageBoundaryWithinWasmAssets = unexpectedExposedFiles.length === 0;

  let interpretation = `${candidateLabel} 当前没有扩大 surface-scrub 的 package-boundary 暴露。`;
  let recommendedReading = "keep-wasm-candidate-bounded";
  if (!packageBoundaryWithinWasmAssets) {
    interpretation = `${candidateLabel} 新增了超出 content/lib/w/* 的 package-boundary 暴露，属于设计越界。`;
    recommendedReading = "stop-wasm-candidate-boundary-violation";
  } else if (newExposedFiles.length > 0) {
    interpretation = `${candidateLabel} 的新增 package-boundary 暴露仅限 content/lib/w/* 资产：${newExposedFiles.join(", ")}。`;
    recommendedReading = "bounded-wasm-asset-exposure";
  } else if (!sameUnpackedSurface || !sameRawSurface) {
    interpretation = `${candidateLabel} 虽未新增越界资产，但仍改变了静态面，需要结合 compare / perf 继续复核。`;
    recommendedReading = "recheck-wasm-candidate-surface";
  }

  return {
    present: true,
    surfaceScrubPresent: true,
    wasmDigestPresent: true,
    sameRawSurface,
    rawAnchorDeltaCount,
    rawMatchDeltaCount,
    sameUnpackedSurface,
    unpackedAnchorDeltaCount,
    unpackedMatchDeltaCount,
    newExposedFiles,
    unexpectedExposedFiles,
    packageBoundaryWithinWasmAssets,
    xpiSizeDeltaBytes,
    bundleSizeDeltaBytes,
    interpretation,
    recommendedReading,
  };
}

export function summarizeSurfaceScrubWasmDigestComparison(variantReports = []) {
  return summarizeSurfaceScrubBoundedWasmComparison(variantReports, "surface-scrub-wasm-digest");
}

export function summarizeSurfaceScrubWasmStage2DeriveComparison(variantReports = []) {
  return summarizeSurfaceScrubBoundedWasmComparison(variantReports, "surface-scrub-wasm-stage2-derive");
}

export function summarizeSurfaceScrubWasmEntitlementLegacyComparison(variantReports = []) {
  return summarizeSurfaceScrubBoundedWasmComparison(variantReports, "surface-scrub-wasm-entitlement-legacy");
}

export function summarizePackageProtectionAnchorAudit(variantReports = [], options = {}) {
  const reportByVariant = new Map(
    (Array.isArray(variantReports) ? variantReports : [])
      .map((report) => [String(report?.variant || "").trim(), report]),
  );
  const summary = buildAuditSummary(reportByVariant);
  const sourceProxy = summarizePackageProtectionSourceProxy(options.sourceProxyReports);
  const unpackedSurface = summarizePackageProtectionUnpackedSurface(options.sourceProxyReports);
  const descriptorBindComparison = summarizeDescriptorBindComparison(variantReports);
  const jsConfuserStringComparison = summarizeJSConfuserStringComparison(variantReports);
  const prefBridgeComparison = summarizePrefBridgeComparison(variantReports);
  const surfaceScrubComparison = summarizeSurfaceScrubComparison(variantReports);
  const surfaceScrubWasmDigestComparison = summarizeSurfaceScrubWasmDigestComparison(variantReports);
  const surfaceScrubWasmStage2DeriveComparison = summarizeSurfaceScrubWasmStage2DeriveComparison(variantReports);
  const surfaceScrubWasmEntitlementLegacyComparison = summarizeSurfaceScrubWasmEntitlementLegacyComparison(variantReports);
  const variantOrder = dedupeVariants(
    Array.isArray(options.variantOrder) && options.variantOrder.length > 0
      ? options.variantOrder
      : PACKAGE_PROTECTION_AUDIT_BASE_VARIANTS,
  );

  return {
    generatedAt: new Date().toISOString(),
    advisory: true,
    status: summary.status,
    statusLabel: STATUS_LABELS[summary.status] || STATUS_LABELS.attention,
    summary: summary.summary,
    nextAction: summary.nextAction,
    comparison: summary.comparison,
    sourceProxy,
    unpackedSurface,
    descriptorBindComparison,
    jsConfuserStringComparison,
    prefBridgeComparison,
    surfaceScrubComparison,
    surfaceScrubWasmDigestComparison,
    surfaceScrubWasmStage2DeriveComparison,
    surfaceScrubWasmEntitlementLegacyComparison,
    variants: variantOrder.map((variant) => {
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
          unpackedSurface: null,
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
        unpackedSurface: report.unpackedSurface || null,
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

  const descriptorBindReport = Array.isArray(report.variants)
    ? report.variants.find((variantReport) => variantReport?.variant === "descriptor-bind" && variantReport.present)
    : null;
  if (descriptorBindReport) {
    lines.push(`- descriptorBindRawAnchorCount: \`${descriptorBindReport.totalAnchorCount}\``);
    lines.push(`- descriptorBindRawMatchCount: \`${descriptorBindReport.totalMatchCount}\``);
    lines.push("");
  }

  const jsConfuserStringReport = Array.isArray(report.variants)
    ? report.variants.find((variantReport) => variantReport?.variant === "jsconfuser-string" && variantReport.present)
    : null;
  if (jsConfuserStringReport) {
    lines.push(`- jsconfuserStringRawAnchorCount: \`${jsConfuserStringReport.totalAnchorCount}\``);
    lines.push(`- jsconfuserStringRawMatchCount: \`${jsConfuserStringReport.totalMatchCount}\``);
    lines.push("");
  }

  if (report.descriptorBindComparison?.present) {
    lines.push("## Descriptor-Bind Comparison", "");
    lines.push(`- sameRawSurface: \`${report.descriptorBindComparison.sameRawSurface ? "yes" : "no"}\``);
    lines.push(`- rawAnchorDeltaCount: \`${report.descriptorBindComparison.rawAnchorDeltaCount}\``);
    lines.push(`- rawMatchDeltaCount: \`${report.descriptorBindComparison.rawMatchDeltaCount}\``);
    lines.push(`- xpiSizeDeltaBytes: \`${report.descriptorBindComparison.xpiSizeDeltaBytes}\``);
    lines.push(`- bundleSizeDeltaBytes: \`${report.descriptorBindComparison.bundleSizeDeltaBytes}\``);
    lines.push(`- interpretation: ${report.descriptorBindComparison.interpretation}`);
    lines.push(`- recommendedReading: \`${report.descriptorBindComparison.recommendedReading}\``);
    lines.push("");
  }

  if (report.jsConfuserStringComparison?.present) {
    lines.push("## JSConfuser String Comparison", "");
    lines.push(`- sameRawSurface: \`${report.jsConfuserStringComparison.sameRawSurface ? "yes" : "no"}\``);
    lines.push(`- rawAnchorDeltaCount: \`${report.jsConfuserStringComparison.rawAnchorDeltaCount}\``);
    lines.push(`- rawMatchDeltaCount: \`${report.jsConfuserStringComparison.rawMatchDeltaCount}\``);
    lines.push(`- xpiSizeDeltaBytes: \`${report.jsConfuserStringComparison.xpiSizeDeltaBytes}\``);
    lines.push(`- bundleSizeDeltaBytes: \`${report.jsConfuserStringComparison.bundleSizeDeltaBytes}\``);
    lines.push(`- interpretation: ${report.jsConfuserStringComparison.interpretation}`);
    lines.push(`- recommendedReading: \`${report.jsConfuserStringComparison.recommendedReading}\``);
    lines.push("");
  }

  if (report.prefBridgeComparison?.present) {
    lines.push("## Pref-Bridge Comparison", "");
    lines.push(`- sameRawSurface: \`${report.prefBridgeComparison.sameRawSurface ? "yes" : "no"}\``);
    lines.push(`- rawAnchorDeltaCount: \`${report.prefBridgeComparison.rawAnchorDeltaCount}\``);
    lines.push(`- rawMatchDeltaCount: \`${report.prefBridgeComparison.rawMatchDeltaCount}\``);
    lines.push(`- sameUnpackedSurface: \`${report.prefBridgeComparison.sameUnpackedSurface ? "yes" : "no"}\``);
    lines.push(`- unpackedAnchorDeltaCount: \`${report.prefBridgeComparison.unpackedAnchorDeltaCount}\``);
    lines.push(`- unpackedMatchDeltaCount: \`${report.prefBridgeComparison.unpackedMatchDeltaCount}\``);
    lines.push(`- xpiSizeDeltaBytes: \`${report.prefBridgeComparison.xpiSizeDeltaBytes}\``);
    lines.push(`- bundleSizeDeltaBytes: \`${report.prefBridgeComparison.bundleSizeDeltaBytes}\``);
    lines.push(`- interpretation: ${report.prefBridgeComparison.interpretation}`);
    lines.push(`- recommendedReading: \`${report.prefBridgeComparison.recommendedReading}\``);
    lines.push("");
  }

  if (report.surfaceScrubComparison?.present) {
    lines.push("## surface-scrub");
    lines.push("");
    lines.push(`- sameRawSurface: \`${report.surfaceScrubComparison.sameRawSurface ? "yes" : "no"}\``);
    lines.push(`- rawAnchorDeltaCount: \`${report.surfaceScrubComparison.rawAnchorDeltaCount}\``);
    lines.push(`- rawMatchDeltaCount: \`${report.surfaceScrubComparison.rawMatchDeltaCount}\``);
    lines.push(`- sameUnpackedSurface: \`${report.surfaceScrubComparison.sameUnpackedSurface ? "yes" : "no"}\``);
    lines.push(`- unpackedAnchorDeltaCount: \`${report.surfaceScrubComparison.unpackedAnchorDeltaCount}\``);
    lines.push(`- unpackedMatchDeltaCount: \`${report.surfaceScrubComparison.unpackedMatchDeltaCount}\``);
    lines.push(`- xpiSizeDeltaBytes: \`${report.surfaceScrubComparison.xpiSizeDeltaBytes}\``);
    lines.push(`- bundleSizeDeltaBytes: \`${report.surfaceScrubComparison.bundleSizeDeltaBytes}\``);
    lines.push(`- interpretation: ${report.surfaceScrubComparison.interpretation}`);
    lines.push(`- recommendedReading: \`${report.surfaceScrubComparison.recommendedReading}\``);
    lines.push("");
  }

  if (report.surfaceScrubWasmDigestComparison?.present) {
    lines.push("## surface-scrub-wasm-digest");
    lines.push("");
    lines.push(`- sameRawSurface: \`${report.surfaceScrubWasmDigestComparison.sameRawSurface ? "yes" : "no"}\``);
    lines.push(`- rawAnchorDeltaCount: \`${report.surfaceScrubWasmDigestComparison.rawAnchorDeltaCount}\``);
    lines.push(`- rawMatchDeltaCount: \`${report.surfaceScrubWasmDigestComparison.rawMatchDeltaCount}\``);
    lines.push(`- sameUnpackedSurface: \`${report.surfaceScrubWasmDigestComparison.sameUnpackedSurface ? "yes" : "no"}\``);
    lines.push(`- unpackedAnchorDeltaCount: \`${report.surfaceScrubWasmDigestComparison.unpackedAnchorDeltaCount}\``);
    lines.push(`- unpackedMatchDeltaCount: \`${report.surfaceScrubWasmDigestComparison.unpackedMatchDeltaCount}\``);
    lines.push(`- packageBoundaryWithinWasmAssets: \`${report.surfaceScrubWasmDigestComparison.packageBoundaryWithinWasmAssets ? "yes" : "no"}\``);
    lines.push(`- newExposedFiles: \`${(report.surfaceScrubWasmDigestComparison.newExposedFiles || []).join(", ") || "-"}\``);
    lines.push(`- unexpectedExposedFiles: \`${(report.surfaceScrubWasmDigestComparison.unexpectedExposedFiles || []).join(", ") || "-"}\``);
    lines.push(`- xpiSizeDeltaBytes: \`${report.surfaceScrubWasmDigestComparison.xpiSizeDeltaBytes}\``);
    lines.push(`- bundleSizeDeltaBytes: \`${report.surfaceScrubWasmDigestComparison.bundleSizeDeltaBytes}\``);
    lines.push(`- interpretation: ${report.surfaceScrubWasmDigestComparison.interpretation}`);
    lines.push(`- recommendedReading: \`${report.surfaceScrubWasmDigestComparison.recommendedReading}\``);
    lines.push("");
  }

  if (report.surfaceScrubWasmStage2DeriveComparison?.present) {
    lines.push("## surface-scrub-wasm-stage2-derive");
    lines.push("");
    lines.push(`- sameRawSurface: \`${report.surfaceScrubWasmStage2DeriveComparison.sameRawSurface ? "yes" : "no"}\``);
    lines.push(`- rawAnchorDeltaCount: \`${report.surfaceScrubWasmStage2DeriveComparison.rawAnchorDeltaCount}\``);
    lines.push(`- rawMatchDeltaCount: \`${report.surfaceScrubWasmStage2DeriveComparison.rawMatchDeltaCount}\``);
    lines.push(`- sameUnpackedSurface: \`${report.surfaceScrubWasmStage2DeriveComparison.sameUnpackedSurface ? "yes" : "no"}\``);
    lines.push(`- unpackedAnchorDeltaCount: \`${report.surfaceScrubWasmStage2DeriveComparison.unpackedAnchorDeltaCount}\``);
    lines.push(`- unpackedMatchDeltaCount: \`${report.surfaceScrubWasmStage2DeriveComparison.unpackedMatchDeltaCount}\``);
    lines.push(`- packageBoundaryWithinWasmAssets: \`${report.surfaceScrubWasmStage2DeriveComparison.packageBoundaryWithinWasmAssets ? "yes" : "no"}\``);
    lines.push(`- newExposedFiles: \`${(report.surfaceScrubWasmStage2DeriveComparison.newExposedFiles || []).join(", ") || "-"}\``);
    lines.push(`- unexpectedExposedFiles: \`${(report.surfaceScrubWasmStage2DeriveComparison.unexpectedExposedFiles || []).join(", ") || "-"}\``);
    lines.push(`- xpiSizeDeltaBytes: \`${report.surfaceScrubWasmStage2DeriveComparison.xpiSizeDeltaBytes}\``);
    lines.push(`- bundleSizeDeltaBytes: \`${report.surfaceScrubWasmStage2DeriveComparison.bundleSizeDeltaBytes}\``);
    lines.push(`- interpretation: ${report.surfaceScrubWasmStage2DeriveComparison.interpretation}`);
    lines.push(`- recommendedReading: \`${report.surfaceScrubWasmStage2DeriveComparison.recommendedReading}\``);
    lines.push("");
  }

  if (report.surfaceScrubWasmEntitlementLegacyComparison?.present) {
    lines.push("## surface-scrub-wasm-entitlement-legacy");
    lines.push("");
    lines.push(`- sameRawSurface: \`${report.surfaceScrubWasmEntitlementLegacyComparison.sameRawSurface ? "yes" : "no"}\``);
    lines.push(`- rawAnchorDeltaCount: \`${report.surfaceScrubWasmEntitlementLegacyComparison.rawAnchorDeltaCount}\``);
    lines.push(`- rawMatchDeltaCount: \`${report.surfaceScrubWasmEntitlementLegacyComparison.rawMatchDeltaCount}\``);
    lines.push(`- sameUnpackedSurface: \`${report.surfaceScrubWasmEntitlementLegacyComparison.sameUnpackedSurface ? "yes" : "no"}\``);
    lines.push(`- unpackedAnchorDeltaCount: \`${report.surfaceScrubWasmEntitlementLegacyComparison.unpackedAnchorDeltaCount}\``);
    lines.push(`- unpackedMatchDeltaCount: \`${report.surfaceScrubWasmEntitlementLegacyComparison.unpackedMatchDeltaCount}\``);
    lines.push(`- packageBoundaryWithinWasmAssets: \`${report.surfaceScrubWasmEntitlementLegacyComparison.packageBoundaryWithinWasmAssets ? "yes" : "no"}\``);
    lines.push(`- newExposedFiles: \`${(report.surfaceScrubWasmEntitlementLegacyComparison.newExposedFiles || []).join(", ") || "-"}\``);
    lines.push(`- unexpectedExposedFiles: \`${(report.surfaceScrubWasmEntitlementLegacyComparison.unexpectedExposedFiles || []).join(", ") || "-"}\``);
    lines.push(`- xpiSizeDeltaBytes: \`${report.surfaceScrubWasmEntitlementLegacyComparison.xpiSizeDeltaBytes}\``);
    lines.push(`- bundleSizeDeltaBytes: \`${report.surfaceScrubWasmEntitlementLegacyComparison.bundleSizeDeltaBytes}\``);
    lines.push(`- interpretation: ${report.surfaceScrubWasmEntitlementLegacyComparison.interpretation}`);
    lines.push(`- recommendedReading: \`${report.surfaceScrubWasmEntitlementLegacyComparison.recommendedReading}\``);
    lines.push("");
  }

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

  if (report.unpackedSurface?.present) {
    lines.push("## Unpacked Surface", "");
    lines.push(`- protectedAnchorCount: \`${report.unpackedSurface.totalAnchorCount ?? 0}\``);
    lines.push(`- protectedMatchCount: \`${report.unpackedSurface.totalMatchCount ?? 0}\``);
    lines.push(`- plainAnchorCount: \`${report.unpackedSurface.plain?.totalAnchorCount ?? 0}\``);
    lines.push(`- plainMatchCount: \`${report.unpackedSurface.plain?.totalMatchCount ?? 0}\``);
    lines.push(`- reducedAnchorCount: \`${report.unpackedSurface.reducedAnchorCount ?? 0}\``);
    lines.push(`- reducedMatchCount: \`${report.unpackedSurface.reducedMatchCount ?? 0}\``);
    lines.push(`- exposedFiles: \`${(report.unpackedSurface.exposedFiles || []).join(", ") || "-"}\``);
    lines.push(`- nextAction: \`${report.unpackedSurface.nextAction || "-"}\``);
    lines.push(`- summary: ${report.unpackedSurface.summary || "-"}`);
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
    if (variantReport.unpackedSurface) {
      lines.push(`- unpackedSurfaceAnchorCount: \`${variantReport.unpackedSurface.totalAnchorCount ?? 0}\``);
      lines.push(`- unpackedSurfaceMatchCount: \`${variantReport.unpackedSurface.totalMatchCount ?? 0}\``);
      lines.push(`- unpackedSurfaceExposedFiles: \`${(variantReport.unpackedSurface.exposedFiles || []).join(", ") || "-"}\``);
    }
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
      options,
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
    variantOrder: variants,
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
