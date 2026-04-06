import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  buildPendingRemoteReleaseVerification,
  normalizeRemoteReleaseVerification,
} from "./release-remote-verification-lib.mjs";
import {
  buildReleaseGateContract,
  buildReleaseNextSteps,
  buildReleaseWorkflowState,
} from "./release-flow-contract-lib.mjs";
import {
  assertScript,
  buildScriptFailureInfo,
  createScriptError,
  resolvePathOption,
  writeJSONArtifact,
} from "./script-runtime-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultProjectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

function assert(condition, message, options = {}) {
  assertScript(condition, message, {
    category: options.category || "validation",
    failedStage: options.failedStage || "read-release-inputs",
    details: options.details,
  });
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJSON(filePath) {
  const content = await fs.readFile(filePath, "utf-8")
    .catch((error) => {
      if (error?.code === "ENOENT") {
        throw createScriptError("environment", `Missing JSON file: ${filePath}`, {
          failedStage: "read-release-inputs",
          details: { filePath },
          cause: error,
        });
      }
      throw error;
    });
  try {
    return JSON.parse(content);
  } catch (error) {
    throw createScriptError("validation", `Invalid JSON file: ${filePath}`, {
      failedStage: "read-release-inputs",
      details: { filePath },
      cause: error,
    });
  }
}

function collectWarnings(config, releaseManifest) {
  const warnings = [];

  const updateURL = String(config.updateURL || "");
  if (updateURL.includes("example.com")) {
    warnings.push("`config.addon.config.json` still uses example.com in updateURL");
  }

  if (String(config.author || "").trim().toLowerCase() === "your team") {
    warnings.push("`author` is still placeholder value `Your Team`");
  }

  if (!String(config.homepage || "").startsWith("https://")) {
    warnings.push("`homepage` should use https URL for public release");
  }

  if (!String(releaseManifest.updateLink || "").startsWith("https://")) {
    warnings.push("`update_link` should be an https URL before public release");
  }

  return warnings;
}

function collectRemoteWarnings(remoteVerification) {
  if (!remoteVerification || typeof remoteVerification !== "object") {
    return [];
  }

  if (remoteVerification.status === "passed" && remoteVerification.releaseReady === true) {
    return [];
  }
  if (remoteVerification.status === "passed") {
    return [
      remoteVerification.summary || "远端验证仅覆盖 synthetic / 本地内联 URL，仍需真实 HTTP(S) 发布端验证。",
    ];
  }
  if (remoteVerification.status === "unconfigured") {
    return [
      remoteVerification.summary || "远端发布验证尚未配置完成",
    ];
  }
  if (remoteVerification.status === "pending") {
    return [
      remoteVerification.summary || "远端 update.json / update_link 尚未验证",
    ];
  }
  return Array.isArray(remoteVerification.issues) && remoteVerification.issues.length > 0
    ? remoteVerification.issues
    : [remoteVerification.summary || "远端发布验证未通过"];
}

function buildReleaseNotesMarkdown({
  config,
  releaseManifest,
  preflight,
  warnings,
  remoteVerification,
  workflowState,
  gateContract,
  nextSteps,
}) {
  const lines = [
    `# Release ${config.addonVersion}`,
    "",
    "## Artifacts",
    `- Add-on ID: \`${config.addonId}\``,
    `- XPI: \`${releaseManifest.xpiName}\``,
    `- SHA256: \`${preflight.xpiSHA256}\``,
    `- Size: \`${preflight.xpiSizeBytes}\` bytes`,
    `- update.json URL: \`${releaseManifest.updateURL}\``,
    `- update_link: \`${releaseManifest.updateLink}\``,
    "",
    "## Compatibility",
    `- Zotero min: \`${config.strictMinVersion}\``,
    `- Zotero max: \`${config.strictMaxVersion}\``,
    "",
    "## Validation",
    "- `npm run check` passed",
    "- `npm run release:local` passed",
    "- `npm run zotero:test` passed",
    "",
    "## Workflow State",
    `- State: \`${workflowState?.label || "未知"}\``,
    `- Summary: ${workflowState?.summary || "-"}`,
    `- Gate-tracked local run: \`${gateContract?.preferredPreparationCommand || "-"}\``,
    `- Required telemetry: \`${gateContract?.requiredRunName || "-"}\``,
    "",
    "## Remote Verification",
    `- Status: \`${remoteVerification?.statusLabel || "缺失"}\``,
    `- Summary: ${remoteVerification?.summary || "-"}`,
    `- Evidence Mode: \`${remoteVerification?.evidenceModeLabel || remoteVerification?.evidenceMode || "未知"}\``,
    `- Release Ready: \`${remoteVerification?.releaseReady === true ? "yes" : "no"}\``,
    `- update.json target: \`${remoteVerification?.effectiveUpdateURL || releaseManifest.updateURL || "-"}\``,
    `- Expected update_link: \`${remoteVerification?.expectedUpdateLink || releaseManifest.updateLink || "-"}\``,
    `- Observed update_link: \`${remoteVerification?.observedUpdateLink || "-"}\``,
    "",
    "## Release Gate Contract",
    `- Preferred local prep: \`${gateContract?.preferredPreparationCommand || "-"}\``,
    `- Remote verify: \`${gateContract?.remoteVerificationCommand || "-"}\``,
    `- Refresh consumers: \`${gateContract?.refreshReleaseConsumersCommand || "-"}\``,
    `- Final gate: \`${gateContract?.releaseGateCommand || "-"}\``,
    "",
    "## Changelog",
    "- Replace this section with user-facing changes.",
    "",
    "## Upload Steps",
    "1. Run `npm run release:upload -- --provider <provider> --release-tag <tag> --target-base-url <url>` to validate the upload contract and generate a plan-only checklist.",
    "2. Manually upload `.xpi` and `update.json` to your release CDN or GitHub Release assets.",
    "3. Verify uploaded `update.json` contains the same `update_link` as above.",
    "4. Verify `update_link` points to the uploaded `.xpi` and is publicly reachable.",
    "5. Run `npm run release:preflight -- --verify-remote` to record remote verification against the live release URLs.",
    "6. Re-run `npm run release:prepare && npm run release:matrix` to refresh release-facing consumers.",
    "7. Run `npm run agent:gate:release` to confirm the release profile is green.",
    "8. Publish release notes with checksum.",
  ];

  if (Array.isArray(nextSteps) && nextSteps.length > 0) {
    lines.push("", "## Next Steps");
    nextSteps.forEach((step) => lines.push(`- ${step}`));
  }

  if (Array.isArray(remoteVerification?.issues) && remoteVerification.issues.length > 0) {
    lines.push("## Remote Verification Issues", "");
    remoteVerification.issues.forEach((item) => lines.push(`- ${item}`));
    lines.push("");
  }

  if (warnings.length > 0) {
    lines.push("", "## Release Warnings");
    for (const warning of warnings) {
      lines.push(`- ${warning}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

function parseArgs(argv) {
  const options = {
    projectRoot: defaultProjectRoot,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/release-prepare.mjs [--project-root <path>]");
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
    throw createScriptError("args", `Unknown option: ${arg}`, {
      failedStage: "parse-args",
    });
  }

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
  const configPath = path.join(projectRoot, "config", "addon.config.json");
  const releaseManifestPath = path.join(projectRoot, "dist", "release-manifest.json");
  const preflightPath = path.join(projectRoot, "dist", "release-preflight.json");
  const updateManifestPath = path.join(projectRoot, "dist", "update.json");

  assert(await exists(configPath), "Missing config/addon.config.json", {
    category: "environment",
    details: { filePath: configPath },
  });
  assert(await exists(releaseManifestPath), "Missing dist/release-manifest.json (run `npm run release:local` first)", {
    category: "environment",
    details: { filePath: releaseManifestPath },
  });
  assert(await exists(preflightPath), "Missing dist/release-preflight.json (run `npm run release:local` first)", {
    category: "environment",
    details: { filePath: preflightPath },
  });
  assert(await exists(updateManifestPath), "Missing dist/update.json (run `npm run release:local` first)", {
    category: "environment",
    details: { filePath: updateManifestPath },
  });

  const config = await readJSON(configPath);
  const releaseManifest = await readJSON(releaseManifestPath);
  const preflight = await readJSON(preflightPath);
  const updateManifest = await readJSON(updateManifestPath);
  assert(releaseManifest.status !== "failed", "release-manifest generation failed", {
    failedStage: "validate-release-artifacts",
    details: { filePath: releaseManifestPath },
  });
  assert(preflight.status === "passed", "release-preflight did not pass", {
    failedStage: "validate-release-artifacts",
    details: { filePath: preflightPath, status: preflight.status || null },
  });

  const remoteVerification = normalizeRemoteReleaseVerification(preflight.remoteVerification, {
    config,
    releaseManifest,
  }) || buildPendingRemoteReleaseVerification({ config, releaseManifest });
  const gateContract = buildReleaseGateContract();
  const workflowState = buildReleaseWorkflowState(remoteVerification);
  const nextSteps = buildReleaseNextSteps(remoteVerification, gateContract);
  const warnings = [
    ...collectWarnings(config, releaseManifest),
    ...collectRemoteWarnings(remoteVerification),
  ];

  const plan = {
    generatedAt: new Date().toISOString(),
    status: "passed",
    addonId: config.addonId,
    addonVersion: config.addonVersion,
    artifactFiles: [
      releaseManifest.xpiName,
      "update.json",
      "release-manifest.json",
      "release-preflight.json",
      "release-notes.md",
    ],
    updateURL: releaseManifest.updateURL,
    updateLink: releaseManifest.updateLink,
    checksum: preflight.xpiSHA256,
    sizeBytes: preflight.xpiSizeBytes,
    warnings,
    workflowState,
    gateContract,
    nextSteps,
    remoteVerification,
    checks: {
      updateManifestHasEntry: Boolean(updateManifest.addons?.[config.addonId]?.updates?.[0]),
      updateLinkMatchesManifest:
        updateManifest.addons?.[config.addonId]?.updates?.[0]?.update_link === releaseManifest.updateLink,
    },
    durationMs: Math.max(0, Date.now() - scriptStartedAt),
    errorCategory: null,
    errorCategoryLabel: null,
    errorMessage: null,
    failedStage: null,
  };

  const releaseNotes = buildReleaseNotesMarkdown({
    config,
    releaseManifest,
    preflight,
    warnings,
    remoteVerification,
    workflowState,
    gateContract,
    nextSteps,
  });

  await writeJSONArtifact(path.join(projectRoot, "dist", "release-plan.json"), plan);
  await fs.writeFile(path.join(projectRoot, "dist", "release-notes.md"), releaseNotes, "utf-8");

  if (warnings.length > 0) {
    console.log(`Release prepare complete with warnings: ${warnings.length}`);
    warnings.forEach((message, index) => {
      console.log(`  ${index + 1}. ${message}`);
    });
  } else {
    console.log("Release prepare complete: no warnings");
  }
}

main().catch(async (error) => {
  const failureInfo = buildScriptFailureInfo(error, {
    durationMs: Math.max(0, Date.now() - scriptStartedAt),
  });
  try {
    const releasePlanPath = path.join(resolveFailureProjectRoot(), "dist", "release-plan.json");
    const releaseNotesPath = path.join(resolveFailureProjectRoot(), "dist", "release-notes.md");
    await fs.mkdir(path.dirname(releasePlanPath), { recursive: true });
    await writeJSONArtifact(releasePlanPath, {
      generatedAt: new Date().toISOString(),
      status: "failed",
      addonId: null,
      addonVersion: null,
      artifactFiles: [],
      updateURL: null,
      updateLink: null,
      checksum: null,
      sizeBytes: 0,
      warnings: [],
      workflowState: null,
      gateContract: buildReleaseGateContract(),
      nextSteps: [],
      remoteVerification: null,
      checks: {},
      ...failureInfo,
    });
    await fs.writeFile(
      releaseNotesPath,
      [
        "# Release Prepare",
        "",
        "- 状态: 失败",
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
