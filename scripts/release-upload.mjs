import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  assertScript,
  buildScriptFailureInfo,
  createScriptError,
  parseBooleanEnvFlag,
  parseEnumOption,
  readJSONFile,
  resolvePathOption,
  writeJSONArtifact,
} from "./script-runtime-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultProjectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

const PROVIDER_LABELS = Object.freeze({
  "gitee-release": "Gitee Release",
  "github-release": "GitHub Release",
  "generic-http": "Generic HTTP",
});

function assert(condition, message, options = {}) {
  assertScript(condition, message, {
    category: options.category || "validation",
    failedStage: options.failedStage || "validate-upload-plan",
    details: options.details,
  });
}

function parseRequiredString(rawValue, options = {}) {
  const value = String(rawValue || "").trim();
  if (!value) {
    throw createScriptError(options.category || "args", `${options.name || "value"} must be a non-empty string`, {
      failedStage: options.failedStage || "parse-args",
      details: {
        field: options.name || "value",
        received: rawValue ?? null,
      },
    });
  }
  return value;
}

function normalizeURL(rawValue, options = {}) {
  const value = parseRequiredString(rawValue, options);
  try {
    return new URL(value).toString();
  } catch (error) {
    throw createScriptError(options.category || "args", `${options.name || "url"} must be a valid URL`, {
      failedStage: options.failedStage || "parse-args",
      details: {
        field: options.name || "url",
        received: rawValue ?? null,
      },
      cause: error,
    });
  }
}

function normalizeBaseURL(rawValue, options = {}) {
  const normalized = new URL(normalizeURL(rawValue, options));
  normalized.search = "";
  normalized.hash = "";
  if (!normalized.pathname.endsWith("/")) {
    normalized.pathname = `${normalized.pathname}/`;
  }
  return normalized.toString();
}

function deriveBaseURL(rawURL, options = {}) {
  return new URL(".", normalizeURL(rawURL, options)).toString();
}

function buildUploadActions({ projectRoot, provider, releaseTag, xpiName, updateURL, updateLink }) {
  return [
    {
      step: 1,
      type: "upload-asset",
      provider,
      releaseTag,
      asset: "update.json",
      sourcePath: path.join(projectRoot, "dist", "update.json"),
      targetURL: updateURL,
      required: true,
      manualRequired: true,
    },
    {
      step: 2,
      type: "upload-asset",
      provider,
      releaseTag,
      asset: xpiName,
      sourcePath: path.join(projectRoot, "dist", xpiName),
      targetURL: updateLink,
      required: true,
      manualRequired: true,
    },
    {
      step: 3,
      type: "verify-remote",
      command: "npm run release:preflight -- --verify-remote",
      required: true,
      manualRequired: true,
    },
    {
      step: 4,
      type: "refresh-release-consumers",
      command: "npm run release:prepare && npm run release:matrix",
      required: true,
      manualRequired: true,
    },
    {
      step: 5,
      type: "release-gate",
      command: "npm run agent:gate:release",
      required: true,
      manualRequired: true,
    },
  ];
}

function buildProviderHints(provider) {
  if (provider === "github-release") {
    return [
      "Confirm the target release tag exists before manual upload.",
      "Upload both `update.json` and the `.xpi` as release assets under the same tag.",
    ];
  }
  if (provider === "gitee-release") {
    return [
      "Confirm the target release tag exists before manual upload.",
      "Upload both `update.json` and the `.xpi` into the same Gitee release asset directory.",
    ];
  }
  return [
    "Publish both files under the same base URL so `update.json` and `.xpi` stay co-located.",
    "Ensure the uploaded files remain anonymously reachable over HTTPS.",
  ];
}

function buildUploadPlanMarkdown(summary) {
  const lines = [
    "# Release Upload Plan",
    "",
    `- 状态: \`${summary.status === "passed" ? "通过" : "失败"}\``,
    `- 模式: \`${summary.executionMode}\``,
    `- 供应端: \`${summary.providerLabel || summary.provider || "-"}\``,
    `- Release Tag: \`${summary.releaseTag || "-"}\``,
    `- Target Base URL: \`${summary.targetBaseURL || "-"}\``,
    `- 远端上传执行: \`${summary.networkActionsPerformed ? "performed" : "not-performed"}\``,
    "",
    "## Canonical Remote URLs",
    `- update.json: \`${summary.updateURL || "-"}\``,
    `- update_link: \`${summary.updateLink || "-"}\``,
    "",
    "## Local Artifacts",
  ];

  for (const artifact of summary.localArtifacts || []) {
    lines.push(`- ${artifact.id}: \`${artifact.path}\` (${artifact.exists ? "present" : "missing"}, ${artifact.sizeBytes} bytes)`);
  }

  lines.push("", "## Provider Hints");
  for (const hint of summary.providerHints || []) {
    lines.push(`- ${hint}`);
  }

  lines.push("", "## Upload Steps");
  for (const action of summary.uploadActions || []) {
    if (action.type === "upload-asset") {
      lines.push(`${action.step}. Manually upload \`${path.basename(action.sourcePath)}\` to \`${action.targetURL}\`.`);
      continue;
    }
    lines.push(`${action.step}. Run \`${action.command}\`.`);
  }

  lines.push(
    "",
    "## Notes",
    "- This script is plan-only. It does not perform any network upload, release creation, or asset mutation.",
    "- The canonical remote URLs come from `dist/release-manifest.json`; change `config/addon.config.json` first if you need different release URLs.",
    "",
  );

  return lines.join("\n");
}

function parseArgs(argv, env = process.env) {
  const options = {
    projectRoot: defaultProjectRoot,
    provider: null,
    releaseTag: null,
    targetBaseURL: null,
    dryRunRequested: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      console.log([
        "Usage: node scripts/release-upload.mjs [--project-root <path>]",
        "--provider <gitee-release|github-release|generic-http>",
        "--release-tag <tag>",
        "--target-base-url <url>",
        "[--dry-run]",
      ].join(" "));
      process.exit(0);
    }
    if (arg === "--project-root") {
      options.projectRoot = resolvePathOption(argv[index + 1], {
        name: "project-root",
        baseDir: defaultProjectRoot,
      });
      index += 1;
      continue;
    }
    if (arg === "--provider") {
      options.provider = parseRequiredString(argv[index + 1], {
        name: "provider",
        failedStage: "parse-args",
      });
      index += 1;
      continue;
    }
    if (arg === "--release-tag") {
      options.releaseTag = parseRequiredString(argv[index + 1], {
        name: "release-tag",
        failedStage: "parse-args",
      });
      index += 1;
      continue;
    }
    if (arg === "--target-base-url") {
      options.targetBaseURL = normalizeBaseURL(argv[index + 1], {
        name: "target-base-url",
        failedStage: "parse-args",
      });
      index += 1;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRunRequested = true;
      continue;
    }
    throw createScriptError("args", `Unknown option: ${arg}`, {
      failedStage: "parse-args",
    });
  }

  options.provider = parseEnumOption(options.provider || env.RELEASE_UPLOAD_PROVIDER, {
    name: "provider",
    allowed: Object.keys(PROVIDER_LABELS),
    failedStage: "parse-args",
  });
  options.releaseTag = parseRequiredString(options.releaseTag || env.RELEASE_UPLOAD_TAG, {
    name: "release-tag",
    failedStage: "parse-args",
  });
  options.targetBaseURL = normalizeBaseURL(options.targetBaseURL || env.RELEASE_UPLOAD_TARGET_BASE_URL, {
    name: "target-base-url",
    failedStage: "parse-args",
  });
  options.dryRunRequested = options.dryRunRequested || parseBooleanEnvFlag(env, "RELEASE_UPLOAD_DRY_RUN", {
    defaultValue: false,
    failedStage: "read-environment",
  });

  return options;
}

function resolveFailureProjectRoot(argv = process.argv.slice(2)) {
  const index = argv.indexOf("--project-root");
  if (index === -1) {
    return defaultProjectRoot;
  }
  const candidate = String(argv[index + 1] || "").trim();
  return candidate
    ? path.resolve(defaultProjectRoot, candidate)
    : defaultProjectRoot;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const projectRoot = options.projectRoot;
  const distRoot = path.join(projectRoot, "dist");
  const configPath = path.join(projectRoot, "config", "addon.config.json");
  const releaseManifestPath = path.join(distRoot, "release-manifest.json");
  const preflightPath = path.join(distRoot, "release-preflight.json");
  const updateManifestPath = path.join(distRoot, "update.json");

  const config = await readJSONFile(configPath, {
    missingCategory: "environment",
    invalidCategory: "validation",
    missingStage: "read-config",
    invalidStage: "read-config",
    label: "config/addon.config.json",
  });
  const releaseManifest = await readJSONFile(releaseManifestPath, {
    missingCategory: "environment",
    invalidCategory: "validation",
    missingStage: "read-release-inputs",
    invalidStage: "read-release-inputs",
    label: "dist/release-manifest.json",
  });
  const preflight = await readJSONFile(preflightPath, {
    missingCategory: "environment",
    invalidCategory: "validation",
    missingStage: "read-release-inputs",
    invalidStage: "read-release-inputs",
    label: "dist/release-preflight.json",
  });
  const updateManifest = await readJSONFile(updateManifestPath, {
    missingCategory: "environment",
    invalidCategory: "validation",
    missingStage: "read-release-inputs",
    invalidStage: "read-release-inputs",
    label: "dist/update.json",
  });

  const xpiName = parseRequiredString(releaseManifest.xpiName, {
    name: "release-manifest.xpiName",
    category: "validation",
    failedStage: "validate-local-artifacts",
  });
  const xpiPath = path.join(distRoot, xpiName);

  let xpiStats;
  try {
    xpiStats = await fs.stat(xpiPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw createScriptError("environment", `Missing XPI package: dist/${xpiName}`, {
        failedStage: "validate-local-artifacts",
        details: {
          filePath: xpiPath,
        },
        cause: error,
      });
    }
    throw error;
  }

  assert(releaseManifest.status === "passed", "release-manifest must be passed before upload planning", {
    failedStage: "validate-local-artifacts",
    details: { filePath: releaseManifestPath, status: releaseManifest.status || null },
  });
  assert(preflight.status === "passed", "release-preflight must be passed before upload planning", {
    failedStage: "validate-local-artifacts",
    details: { filePath: preflightPath, status: preflight.status || null },
  });
  assert(releaseManifest.addonId === config.addonId, "release-manifest addonId mismatch", {
    failedStage: "validate-local-artifacts",
    details: {
      expectedAddonId: config.addonId || null,
      observedAddonId: releaseManifest.addonId || null,
    },
  });
  assert(releaseManifest.addonVersion === config.addonVersion, "release-manifest addonVersion mismatch", {
    failedStage: "validate-local-artifacts",
    details: {
      expectedAddonVersion: config.addonVersion || null,
      observedAddonVersion: releaseManifest.addonVersion || null,
    },
  });
  assert(releaseManifest.xpiName === `${config.addonRef}-${config.addonVersion}.xpi`, "release-manifest xpiName mismatch", {
    failedStage: "validate-local-artifacts",
    details: {
      expectedXpiName: `${config.addonRef}-${config.addonVersion}.xpi`,
      observedXpiName: releaseManifest.xpiName || null,
    },
  });
  assert(Number(xpiStats.size || 0) > 0, "XPI package is empty", {
    failedStage: "validate-local-artifacts",
    details: { filePath: xpiPath, sizeBytes: Number(xpiStats.size || 0) },
  });

  const updateEntry = updateManifest.addons?.[config.addonId]?.updates?.[0];
  assert(updateEntry, `update.json missing first update entry for addon: ${config.addonId}`, {
    failedStage: "validate-local-artifacts",
    details: {
      addonId: config.addonId || null,
      filePath: updateManifestPath,
    },
  });
  assert(updateEntry.version === config.addonVersion, "update.json version mismatch", {
    failedStage: "validate-local-artifacts",
    details: {
      expectedAddonVersion: config.addonVersion || null,
      observedAddonVersion: updateEntry?.version || null,
    },
  });

  const manifestUpdateURL = normalizeURL(releaseManifest.updateURL, {
    name: "release-manifest.updateURL",
    category: "validation",
    failedStage: "validate-local-artifacts",
  });
  const manifestUpdateLink = normalizeURL(releaseManifest.updateLink, {
    name: "release-manifest.updateLink",
    category: "validation",
    failedStage: "validate-local-artifacts",
  });

  assert(updateEntry.update_link === manifestUpdateLink, "update.json update_link mismatch", {
    failedStage: "validate-local-artifacts",
    details: {
      expectedUpdateLink: manifestUpdateLink,
      observedUpdateLink: updateEntry?.update_link || null,
    },
  });

  const updateURLBase = deriveBaseURL(manifestUpdateURL, {
    name: "release-manifest.updateURL",
    category: "validation",
    failedStage: "validate-upload-target",
  });
  const updateLinkBase = deriveBaseURL(manifestUpdateLink, {
    name: "release-manifest.updateLink",
    category: "validation",
    failedStage: "validate-upload-target",
  });
  assert(updateURLBase === updateLinkBase, "release-manifest updateURL/updateLink base mismatch", {
    failedStage: "validate-upload-target",
    details: {
      updateURLBase,
      updateLinkBase,
    },
  });
  assert(options.targetBaseURL === updateURLBase, "target-base-url does not match release-manifest remote base", {
    failedStage: "validate-upload-target",
    details: {
      providedTargetBaseURL: options.targetBaseURL,
      expectedTargetBaseURL: updateURLBase,
    },
  });
  assert(new URL("update.json", options.targetBaseURL).toString() === manifestUpdateURL, "target-base-url does not reproduce release-manifest updateURL", {
    failedStage: "validate-upload-target",
    details: {
      derivedUpdateURL: new URL("update.json", options.targetBaseURL).toString(),
      expectedUpdateURL: manifestUpdateURL,
    },
  });
  assert(new URL(releaseManifest.xpiName, options.targetBaseURL).toString() === manifestUpdateLink, "target-base-url does not reproduce release-manifest updateLink", {
    failedStage: "validate-upload-target",
    details: {
      derivedUpdateLink: new URL(releaseManifest.xpiName, options.targetBaseURL).toString(),
      expectedUpdateLink: manifestUpdateLink,
    },
  });

  const summary = {
    generatedAt: new Date().toISOString(),
    status: "passed",
    executionMode: "plan-only",
    networkActionsPerformed: false,
    provider: options.provider,
    providerLabel: PROVIDER_LABELS[options.provider] || options.provider,
    releaseTag: options.releaseTag,
    targetBaseURL: options.targetBaseURL,
    dryRunRequested: Boolean(options.dryRunRequested),
    addonId: config.addonId,
    addonRef: config.addonRef,
    addonVersion: config.addonVersion,
    xpiName: releaseManifest.xpiName,
    updateURL: manifestUpdateURL,
    updateLink: manifestUpdateLink,
    localArtifacts: [
      {
        id: "release-manifest",
        path: releaseManifestPath,
        exists: true,
        sizeBytes: Buffer.byteLength(JSON.stringify(releaseManifest), "utf-8"),
      },
      {
        id: "release-preflight",
        path: preflightPath,
        exists: true,
        sizeBytes: Buffer.byteLength(JSON.stringify(preflight), "utf-8"),
      },
      {
        id: "update.json",
        path: updateManifestPath,
        exists: true,
        sizeBytes: Buffer.byteLength(JSON.stringify(updateManifest), "utf-8"),
      },
      {
        id: "xpi",
        path: xpiPath,
        exists: true,
        sizeBytes: Number(xpiStats.size || 0),
      },
    ],
    checks: {
      releaseManifestPassed: releaseManifest.status === "passed",
      preflightPassed: preflight.status === "passed",
      updateManifestHasEntry: Boolean(updateEntry),
      updateLinkMatchesManifest: updateEntry?.update_link === manifestUpdateLink,
      targetBaseURLMatchesManifest: options.targetBaseURL === updateURLBase,
      networkUploadImplemented: false,
    },
    providerHints: buildProviderHints(options.provider),
    uploadActions: buildUploadActions({
      projectRoot,
      provider: options.provider,
      releaseTag: options.releaseTag,
      xpiName: releaseManifest.xpiName,
      updateURL: manifestUpdateURL,
      updateLink: manifestUpdateLink,
    }),
    nextSteps: [
      "Manually upload `dist/update.json` and the packaged `.xpi` to the canonical remote URLs above.",
      "Run `npm run release:preflight -- --verify-remote` after the remote files are live.",
      "Run `npm run release:prepare && npm run release:matrix`, then confirm `npm run agent:gate:release`.",
    ],
    durationMs: Math.max(0, Date.now() - scriptStartedAt),
    errorCategory: null,
    errorCategoryLabel: null,
    errorMessage: null,
    failedStage: null,
  };

  await fs.mkdir(distRoot, { recursive: true });
  await writeJSONArtifact(path.join(distRoot, "release-upload-plan.json"), summary);
  await fs.writeFile(path.join(distRoot, "release-upload-plan.md"), `${buildUploadPlanMarkdown(summary)}\n`, "utf-8");

  console.log(`Release upload plan generated: ${path.join(distRoot, "release-upload-plan.json")}`);
}

main().catch(async (error) => {
  const failureInfo = buildScriptFailureInfo(error, {
    durationMs: Math.max(0, Date.now() - scriptStartedAt),
  });
  const failureProjectRoot = resolveFailureProjectRoot();
  const failureDistRoot = path.join(failureProjectRoot, "dist");

  try {
    await fs.mkdir(failureDistRoot, { recursive: true });
    await writeJSONArtifact(path.join(failureDistRoot, "release-upload-plan.json"), {
      generatedAt: new Date().toISOString(),
      status: "failed",
      executionMode: "plan-only",
      networkActionsPerformed: false,
      provider: null,
      providerLabel: null,
      releaseTag: null,
      targetBaseURL: null,
      dryRunRequested: false,
      addonId: null,
      addonRef: null,
      addonVersion: null,
      xpiName: null,
      updateURL: null,
      updateLink: null,
      localArtifacts: [],
      checks: {},
      providerHints: [],
      uploadActions: [],
      nextSteps: [],
      ...failureInfo,
    });
    await fs.writeFile(
      path.join(failureDistRoot, "release-upload-plan.md"),
      [
        "# Release Upload Plan",
        "",
        "- 状态: 失败",
        "- 模式: `plan-only`",
        `- 分类: \`${failureInfo.errorCategoryLabel}\``,
        `- 阶段: \`${failureInfo.failedStage}\``,
        `- 信息: ${failureInfo.errorMessage}`,
        `- 耗时: \`${failureInfo.durationMs}ms\``,
        "",
      ].join("\n"),
      "utf-8",
    );
  } catch {
    // ignore secondary failure
  }

  console.error(`${failureInfo.errorCategoryLabel}: ${failureInfo.errorMessage}`);
  process.exit(1);
});
