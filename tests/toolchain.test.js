import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it, assert } from "./test-framework.js";
import {
  buildPackageZipArgs,
  parsePackageArgs,
  resolvePackageBuildEnv,
  resolvePackageJSConfuserToolOptions,
  resolvePackageZipExcludePatterns,
} from "../scripts/package.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const currentProjectExpansionWave = JSON.parse(
  fs.readFileSync(path.join(projectRoot, "config", "project-expansion-wave.json"), "utf-8"),
);
const currentProjectWaveStatus = String(currentProjectExpansionWave.status || "").trim() || "not-entered";
const currentProjectWaveName = String(currentProjectExpansionWave.currentWaveName || "").trim() || "null";
const currentProjectWaveContractId = String(currentProjectExpansionWave.currentContractId || "").trim() || "null";
const currentProjectAcceptanceTrack = String(currentProjectExpansionWave.acceptanceTrack || "").trim() || "null";

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function writeJSON(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

function removeIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true });
  }
}

function removeDirIfExists(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

function makeFakeJSConfuserTool() {
  const toolRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fake-jsconfuser-"));
  const distRoot = path.join(toolRoot, "dist");
  const nodeModulesRoot = path.join(toolRoot, "node_modules");
  fs.mkdirSync(distRoot, { recursive: true });
  fs.mkdirSync(nodeModulesRoot, { recursive: true });
  fs.writeFileSync(path.join(toolRoot, "package.json"), `${JSON.stringify({
    name: "js-confuser",
    version: "0.0.0-test",
    main: "dist/index.js",
  }, null, 2)}\n`, "utf-8");
  fs.writeFileSync(path.join(distRoot, "index.js"), `
exports.obfuscate = async function obfuscate(source) {
  return "/* js-confuser transformed */\\n" + String(source || "");
};
`, "utf-8");
  return toolRoot;
}

function makeTempReferenceRoot() {
  const referenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate-cleanroom-reference-"));
  fs.writeFileSync(path.join(referenceRoot, "snapshot.md"), "temporary reference snapshot\n", "utf-8");
  return referenceRoot;
}

async function execNodeAsync(args, options = {}) {
  const {
    cwd = projectRoot,
    env = process.env,
  } = options;

  await new Promise((resolve, reject) => {
    execFile("node", args, {
      cwd,
      env,
      maxBuffer: 10 * 1024 * 1024,
    }, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function execNodeResult(args, options = {}) {
  const {
    cwd = projectRoot,
    env = process.env,
  } = options;

  return await new Promise((resolve) => {
    execFile("node", args, {
      cwd,
      env,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    }, (error, stdout = "", stderr = "") => {
      resolve({
        code: error?.code ?? 0,
        stdout,
        stderr,
      });
    });
  });
}

function makeTempReleaseUploadProject(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate-release-upload-"));
  const config = {
    addonId: "cleanroom-template@example.com",
    addonRef: "cleanroomtemplate",
    addonVersion: "1.1.0",
    strictMinVersion: "7.0",
    strictMaxVersion: "8.*",
    updateURL: "https://example.com/releases/1.1.0/update.json",
    homepage: "https://example.com/cleanroom-template",
    ...(options.config || {}),
  };
  const distRoot = path.join(root, "dist");
  const xpiName = `${config.addonRef}-${config.addonVersion}.xpi`;
  const xpiPath = path.join(distRoot, xpiName);
  const updateLink = new URL(xpiName, new URL(".", config.updateURL)).toString();
  const releaseManifest = {
    generatedAt: "2026-03-31T00:00:00.000Z",
    status: "passed",
    addonId: config.addonId,
    addonRef: config.addonRef,
    addonVersion: config.addonVersion,
    xpiName,
    xpiPath,
    updateURL: config.updateURL,
    updateLink,
    durationMs: 12,
    errorCategory: null,
    errorCategoryLabel: null,
    errorMessage: null,
    failedStage: null,
    ...(options.releaseManifest || {}),
  };
  const updateManifest = {
    addons: {
      [config.addonId]: {
        updates: [
          {
            version: config.addonVersion,
            update_link: releaseManifest.updateLink,
            applications: {
              zotero: {
                strict_min_version: config.strictMinVersion,
                strict_max_version: config.strictMaxVersion,
              },
            },
          },
        ],
      },
    },
    ...(options.updateManifest || {}),
  };
  const preflight = {
    generatedAt: "2026-03-31T00:00:01.000Z",
    status: "passed",
    addonId: config.addonId,
    addonVersion: config.addonVersion,
    xpiName,
    xpiSizeBytes: 8,
    xpiSHA256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    updateLink: releaseManifest.updateLink,
    strictMinVersion: config.strictMinVersion,
    strictMaxVersion: config.strictMaxVersion,
    remoteVerification: {
      status: "pending",
      statusLabel: "待验证",
      summary: "远端 update.json 与 update_link 尚未验证",
    },
    ...(options.preflight || {}),
  };

  writeJSON(path.join(root, "config", "addon.config.json"), config);
  fs.mkdirSync(distRoot, { recursive: true });
  fs.writeFileSync(xpiPath, "fake-xpi", "utf-8");
  writeJSON(path.join(distRoot, "release-manifest.json"), releaseManifest);
  writeJSON(path.join(distRoot, "release-preflight.json"), preflight);
  writeJSON(path.join(distRoot, "update.json"), updateManifest);

  return {
    root,
    config,
    distRoot,
    xpiName,
    xpiPath,
    releaseManifest,
    preflight,
    updateManifest,
    targetBaseURL: new URL(".", releaseManifest.updateURL).toString(),
  };
}

function buildMinimalMonitorSummary() {
  return {
    generatedAt: new Date().toISOString(),
    total: 1,
    passed: 1,
    failed: 0,
    passRate: 100,
    averageDurationMs: 25,
    runs: [
      {
        runName: "check",
        success: true,
        exitCode: 0,
        status: "passed",
        startedAtISO: new Date().toISOString(),
      },
    ],
  };
}

function resetLocalReleaseArtifacts() {
  const config = readJSON(path.join(projectRoot, "config", "addon.config.json"));
  const distRoot = path.join(projectRoot, "dist");
  const buildRoot = path.join(projectRoot, "build", config.addonRef);
  const xpiName = `${config.addonRef}-${config.addonVersion}.xpi`;

  removeDirIfExists(buildRoot);
  [
    path.join(distRoot, xpiName),
    path.join(distRoot, "release-manifest.json"),
    path.join(distRoot, "release-preflight.json"),
    path.join(distRoot, "release-plan.json"),
    path.join(distRoot, "release-notes.md"),
    path.join(distRoot, "release-matrix.json"),
    path.join(distRoot, "release-matrix.md"),
    path.join(distRoot, "update.json"),
  ].forEach(removeIfExists);
}

function prepareLocalReleasePreflight(options = {}) {
  const {
    verifyRemote = false,
    remoteArgs = [],
  } = options;
  const referenceRoot = makeTempReferenceRoot();

  resetLocalReleaseArtifacts();
  execFileSync("node", ["scripts/package.mjs"], {
    cwd: projectRoot,
    stdio: "pipe",
  });

  const config = readJSON(path.join(projectRoot, "config", "addon.config.json"));
  assert.ok(fs.existsSync(path.join(projectRoot, "build", config.addonRef, "build-report.json")));

  try {
    execFileSync("node", [
      "scripts/release-preflight.mjs",
      ...(verifyRemote ? ["--verify-remote", ...remoteArgs] : []),
    ], {
      cwd: projectRoot,
      stdio: "pipe",
      env: {
        ...process.env,
        CLEANROOM_REFERENCE_ROOT: referenceRoot,
      },
    });
  } finally {
    fs.rmSync(referenceRoot, { recursive: true, force: true });
  }
}

const EXPORTED_STATIC_RUNTIME_BASELINE = [
  "addon-static/bootstrap.js",
  "addon-static/content/preferences.xhtml",
  "addon-static/content/style/main.css",
  "addon-static/content/icons/icon-48.png",
  "addon-static/content/icons/icon-96.png",
  "addon-static/locale/en-US/main.ftl",
  "addon-static/locale/zh-CN/main.ftl",
  "addon-static/locale/zh-TW/main.ftl",
];

describe("Toolchain Scripts", () => {
  it("should pass lint/format/typecheck/verify/cleanroom-audit checks", () => {
    execFileSync("node", ["scripts/lint.mjs"], {
      cwd: projectRoot,
      stdio: "pipe",
    });
    execFileSync("node", ["scripts/format-check.mjs"], {
      cwd: projectRoot,
      stdio: "pipe",
    });
    execFileSync("node", ["scripts/typecheck.mjs"], {
      cwd: projectRoot,
      stdio: "pipe",
    });
    execFileSync("node", ["scripts/verify.mjs"], {
      cwd: projectRoot,
      stdio: "pipe",
    });
    execFileSync("node", ["scripts/cleanroom-audit.mjs"], {
      cwd: projectRoot,
      stdio: "pipe",
    });
  });

  it("should generate release metadata files in dist", () => {
    execFileSync("node", ["scripts/release-metadata.mjs"], {
      cwd: projectRoot,
      stdio: "pipe",
    });

    const config = readJSON(path.join(projectRoot, "config", "addon.config.json"));
    const updateJSON = readJSON(path.join(projectRoot, "dist", "update.json"));
    const releaseManifest = readJSON(path.join(projectRoot, "dist", "release-manifest.json"));

    const updates = updateJSON.addons?.[config.addonId]?.updates || [];
    assert.ok(Array.isArray(updates));
    assert.equal(updates[0].version, config.addonVersion);
    assert.ok(typeof updates[0].update_link === "string");
    assert.equal(releaseManifest.status, "passed");
    assert.equal(releaseManifest.addonId, config.addonId);
    assert.equal(releaseManifest.addonVersion, config.addonVersion);
    assert.equal(releaseManifest.errorCategory, null);
    assert.equal(releaseManifest.failedStage, null);
    assert.ok(releaseManifest.xpiName.endsWith(".xpi"));
  });

  it("should build a manual encrypted package variant without writing release metadata", () => {
    const config = readJSON(path.join(projectRoot, "config", "addon.config.json"));
    const distRoot = path.join(projectRoot, "dist");
    const buildRoot = path.join(projectRoot, "build", config.addonRef);
    const encryptedXpiName = `${config.addonRef}-${config.addonVersion}-encrypted.xpi`;
    const encryptedXpiPath = path.join(distRoot, encryptedXpiName);
    const releaseManifestPath = path.join(distRoot, "release-manifest.json");
    const updateManifestPath = path.join(distRoot, "update.json");
    const protectedBundlePath = path.join(buildRoot, "content", "scripts", `${config.addonRef}.js`);
    const buildReportPath = path.join(buildRoot, "build-report.json");

    removeDirIfExists(buildRoot);
    removeIfExists(encryptedXpiPath);
    removeIfExists(releaseManifestPath);
    removeIfExists(updateManifestPath);

    execFileSync("node", ["scripts/package.mjs", "--encrypt-bundle", "--skip-release-metadata"], {
      cwd: projectRoot,
      stdio: "pipe",
    });

    assert.ok(fs.existsSync(encryptedXpiPath));
    assert.equal(fs.existsSync(releaseManifestPath), false);
    assert.equal(fs.existsSync(updateManifestPath), false);
    assert.ok(fs.existsSync(protectedBundlePath));
    assert.ok(fs.existsSync(buildReportPath));

    const protectedBundleSource = fs.readFileSync(protectedBundlePath, "utf-8");
    const buildReport = readJSON(buildReportPath);
    assert.ok(protectedBundleSource.includes("__CLEANROOM_ENCRYPTED_BUNDLE__"));
    assert.ok(protectedBundleSource.includes("subtle.decrypt"));
    assert.equal(protectedBundleSource.includes("__moduleDefs"), false);
    assert.equal(buildReport.moduleIdMode, "anonymized");

    const encryptedZipListing = execFileSync("unzip", ["-l", encryptedXpiPath], {
      cwd: projectRoot,
      encoding: "utf-8",
      stdio: "pipe",
    });
    assert.equal(encryptedZipListing.includes("build-report.json"), false);

    removeDirIfExists(buildRoot);
    removeIfExists(encryptedXpiPath);
  });

  it("should build a manual descriptor-bind shielded package variant without writing release metadata", () => {
    const config = readJSON(path.join(projectRoot, "config", "addon.config.json"));
    const distRoot = path.join(projectRoot, "dist");
    const buildRoot = path.join(projectRoot, "build", config.addonRef);
    const xpiName = `${config.addonRef}-${config.addonVersion}-shielded-descriptor-bind.xpi`;
    const xpiPath = path.join(distRoot, xpiName);
    const protectedBundlePath = path.join(buildRoot, "content", "scripts", `${config.addonRef}.js`);
    const releaseManifestPath = path.join(distRoot, "release-manifest.json");
    const updateManifestPath = path.join(distRoot, "update.json");

    removeDirIfExists(buildRoot);
    removeIfExists(xpiPath);
    removeIfExists(releaseManifestPath);
    removeIfExists(updateManifestPath);

    execFileSync("node", ["scripts/package.mjs", "--descriptor-bind", "--skip-release-metadata"], {
      cwd: projectRoot,
      stdio: "pipe",
    });

    assert.ok(fs.existsSync(xpiPath));
    assert.equal(fs.existsSync(releaseManifestPath), false);
    assert.equal(fs.existsSync(updateManifestPath), false);

    const protectedBundleSource = fs.readFileSync(protectedBundlePath, "utf-8");
    assert.ok(protectedBundleSource.includes("__CLEANROOM_SHIELDED_BUNDLE__"));
    assert.equal(protectedBundleSource.includes("plugin.api.agent.runHostAction"), false);
    assert.equal(protectedBundleSource.includes("src/app/host-actions.js"), false);
    assert.equal(protectedBundleSource.includes("overlay description"), false);

    removeDirIfExists(buildRoot);
    removeIfExists(xpiPath);
  });

  it("should build a manual js-confuser string shielded package variant without writing release metadata", () => {
    const config = readJSON(path.join(projectRoot, "config", "addon.config.json"));
    const distRoot = path.join(projectRoot, "dist");
    const buildRoot = path.join(projectRoot, "build", config.addonRef);
    const xpiName = `${config.addonRef}-${config.addonVersion}-shielded-jsconfuser-string.xpi`;
    const xpiPath = path.join(distRoot, xpiName);
    const protectedBundlePath = path.join(buildRoot, "content", "scripts", `${config.addonRef}.js`);
    const releaseManifestPath = path.join(distRoot, "release-manifest.json");
    const updateManifestPath = path.join(distRoot, "update.json");
    const toolRoot = makeFakeJSConfuserTool();

    removeDirIfExists(buildRoot);
    removeIfExists(xpiPath);
    removeIfExists(releaseManifestPath);
    removeIfExists(updateManifestPath);

    try {
      execFileSync("node", [
        "scripts/package.mjs",
        "--jsconfuser-string",
        "--skip-release-metadata",
        "--jsconfuser-tool-path",
        toolRoot,
      ], {
        cwd: projectRoot,
        stdio: "pipe",
      });

      assert.ok(fs.existsSync(xpiPath));
      assert.equal(fs.existsSync(releaseManifestPath), false);
      assert.equal(fs.existsSync(updateManifestPath), false);

      const protectedBundleSource = fs.readFileSync(protectedBundlePath, "utf-8");
      assert.ok(protectedBundleSource.includes("__CLEANROOM_SHIELDED_BUNDLE__"));
      assert.equal(protectedBundleSource.includes("js-confuser transformed"), false);
      assert.equal(protectedBundleSource.includes("__moduleDefs"), false);
    } finally {
      removeDirIfExists(buildRoot);
      removeIfExists(xpiPath);
      removeDirIfExists(toolRoot);
    }
  });

  it("should keep protected package build env and zip exclusions scoped to custom variants", () => {
    assert.deepEqual(resolvePackageBuildEnv({}), {});
    assert.deepEqual(resolvePackageBuildEnv({ encryptBundle: true }), {
      CLEANROOM_BUILD_MODULE_ID_MODE: "anonymized",
      CLEANROOM_BUILD_SEMANTIC_SCRUB: "protected",
    });
    assert.deepEqual(resolvePackageBuildEnv({ shieldBundle: true }), {
      CLEANROOM_BUILD_MODULE_ID_MODE: "anonymized",
      CLEANROOM_BUILD_SEMANTIC_SCRUB: "protected",
    });
    assert.deepEqual(resolvePackageBuildEnv({ descriptorBind: true, outputSuffix: "shielded-descriptor-bind" }), {
      CLEANROOM_BUILD_MODULE_ID_MODE: "anonymized",
      CLEANROOM_BUILD_SEMANTIC_SCRUB: "protected",
    });
    assert.deepEqual(resolvePackageBuildEnv({ jsConfuserString: true, outputSuffix: "shielded-jsconfuser-string" }), {
      CLEANROOM_BUILD_MODULE_ID_MODE: "anonymized",
      CLEANROOM_BUILD_SEMANTIC_SCRUB: "protected",
    });

    assert.deepEqual(resolvePackageZipExcludePatterns({}), []);
    assert.deepEqual(resolvePackageZipExcludePatterns({ encryptBundle: true }), ["build-report.json"]);
    assert.deepEqual(resolvePackageZipExcludePatterns({ shieldBundle: true }), ["build-report.json"]);
    assert.deepEqual(resolvePackageZipExcludePatterns({ descriptorBind: true, outputSuffix: "shielded-descriptor-bind" }), ["build-report.json"]);
    assert.deepEqual(resolvePackageZipExcludePatterns({ jsConfuserString: true, outputSuffix: "shielded-jsconfuser-string" }), ["build-report.json"]);

    assert.deepEqual(buildPackageZipArgs("/tmp/demo.xpi", {}), ["-r", "/tmp/demo.xpi", "."]);
    assert.deepEqual(
      buildPackageZipArgs("/tmp/demo.xpi", { shieldBundle: true }),
      ["-r", "/tmp/demo.xpi", ".", "-x", "build-report.json"],
    );

    const descriptorBindArgs = parsePackageArgs(["--descriptor-bind", "--skip-release-metadata"]);
    assert.equal(descriptorBindArgs.encryptBundle, true);
    assert.equal(descriptorBindArgs.shieldBundle, true);
    assert.equal(descriptorBindArgs.descriptorBind, true);
    assert.equal(descriptorBindArgs.outputSuffix, "shielded-descriptor-bind");

    const jsConfuserArgs = parsePackageArgs([
      "--jsconfuser-string",
      "--skip-release-metadata",
      "--jsconfuser-tool-path",
      "/tmp/js-confuser",
      "--jsconfuser-tool-entry",
      "dist/index.js",
    ]);
    assert.equal(jsConfuserArgs.encryptBundle, true);
    assert.equal(jsConfuserArgs.shieldBundle, true);
    assert.equal(jsConfuserArgs.jsConfuserString, true);
    assert.equal(jsConfuserArgs.outputSuffix, "shielded-jsconfuser-string");
    assert.equal(jsConfuserArgs.jsConfuserToolPath, "/tmp/js-confuser");
    assert.equal(jsConfuserArgs.jsConfuserToolEntry, "dist/index.js");

    assert.deepEqual(resolvePackageJSConfuserToolOptions({
      jsConfuserToolPath: "/tmp/js-confuser",
      jsConfuserToolEntry: "dist/index.js",
    }), {
      toolPath: "/tmp/js-confuser",
      toolEntry: "dist/index.js",
    });
  });

  it("should pass release preflight and generate integrity report", () => {
    prepareLocalReleasePreflight();

    const preflightReport = readJSON(path.join(projectRoot, "dist", "release-preflight.json"));
    assert.equal(preflightReport.status, "passed");
    assert.ok(typeof preflightReport.xpiSHA256 === "string");
    assert.equal(preflightReport.xpiSHA256.length, 64);
    assert.ok(Number(preflightReport.xpiSizeBytes) > 0);
    assert.equal(preflightReport.cleanroomAuditStatus, "passed");
    assert.equal(preflightReport.cleanroomAuditMode, "release");
    assert.equal(preflightReport.cleanroomSimilarityStatus, "available");
    assert.equal(preflightReport.chinaLegalStatus, "ready");
    assert.equal(preflightReport.chinaCommercialDeliveryGateOK, true);
    assert.deepEqual(preflightReport.chinaLegalMissingDocs, []);
  });

  it("should generate release upload plan and notes", () => {
    prepareLocalReleasePreflight();

    execFileSync("node", ["scripts/release-prepare.mjs"], {
      cwd: projectRoot,
      stdio: "pipe",
    });

    const releasePlan = readJSON(path.join(projectRoot, "dist", "release-plan.json"));
    const releaseNotes = fs.readFileSync(path.join(projectRoot, "dist", "release-notes.md"), "utf-8");

    assert.equal(releasePlan.status, "passed");
    assert.equal(releasePlan.addonId, "cleanroom-template@example.com");
    assert.equal(releasePlan.errorCategory, null);
    assert.equal(releasePlan.failedStage, null);
    assert.ok(Array.isArray(releasePlan.artifactFiles));
    assert.ok(releasePlan.artifactFiles.includes("release-notes.md"));
    assert.equal(releasePlan.remoteVerification?.status, "pending");
    assert.equal(releasePlan.workflowState?.id, "remote-verification-pending");
    assert.equal(releasePlan.gateContract?.requiredRunName, "release-plan");
    assert.equal(releasePlan.gateContract?.preferredPreparationCommand, "npm run agent:release");
    assert.ok(Array.isArray(releasePlan.nextSteps));
    assert.ok(releasePlan.nextSteps.some((item) => String(item).includes("npm run agent:release")));
    assert.ok(releasePlan.nextSteps.some((item) => String(item).includes("release:install-smoke:stable")));
    assert.ok(releaseNotes.includes("## Upload Steps"));
    assert.ok(releaseNotes.includes("## Workflow State"));
    assert.ok(releaseNotes.includes("## Release Gate Contract"));
    assert.ok(releaseNotes.includes("## Remote Verification"));
    assert.ok(releaseNotes.includes("SHA256"));
    assert.ok(releaseNotes.includes("npm run agent:release"));
    assert.ok(releaseNotes.includes("npm run agent:gate:release"));
    assert.ok(releaseNotes.includes("npm run release:upload -- --provider <provider> --release-tag <tag> --target-base-url <url>"));
  });

  it("should fail release upload shell when required upload args are missing", async () => {
    const fixture = makeTempReleaseUploadProject();

    try {
      const result = await execNodeResult([
        "scripts/release-upload.mjs",
        "--project-root",
        fixture.root,
      ]);

      const uploadPlan = readJSON(path.join(fixture.distRoot, "release-upload-plan.json"));
      const uploadPlanMD = fs.readFileSync(path.join(fixture.distRoot, "release-upload-plan.md"), "utf-8");

      assert.equal(result.code, 1);
      assert.equal(uploadPlan.status, "failed");
      assert.equal(uploadPlan.executionMode, "plan-only");
      assert.equal(uploadPlan.errorCategory, "args");
      assert.equal(uploadPlan.failedStage, "parse-args");
      assert.ok(uploadPlanMD.includes("模式: `plan-only`"));
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("should fail release upload shell when local release artifacts are missing", async () => {
    const fixture = makeTempReleaseUploadProject();

    try {
      removeIfExists(path.join(fixture.distRoot, "update.json"));

      const result = await execNodeResult([
        "scripts/release-upload.mjs",
        "--project-root",
        fixture.root,
        "--provider",
        "gitee-release",
        "--release-tag",
        "1.1.0",
        "--target-base-url",
        fixture.targetBaseURL,
      ]);

      const uploadPlan = readJSON(path.join(fixture.distRoot, "release-upload-plan.json"));

      assert.equal(result.code, 1);
      assert.equal(uploadPlan.status, "failed");
      assert.equal(uploadPlan.executionMode, "plan-only");
      assert.equal(uploadPlan.errorCategory, "environment");
      assert.equal(uploadPlan.failedStage, "read-release-inputs");
      assert.ok(String(uploadPlan.errorMessage).includes("Missing JSON file"));
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("should generate a plan-only release upload artifact using release-manifest URLs", async () => {
    const fixture = makeTempReleaseUploadProject();

    try {
      const result = await execNodeResult([
        "scripts/release-upload.mjs",
        "--project-root",
        fixture.root,
        "--provider",
        "gitee-release",
        "--release-tag",
        "1.1.0",
        "--target-base-url",
        fixture.targetBaseURL,
        "--dry-run",
      ]);

      const uploadPlan = readJSON(path.join(fixture.distRoot, "release-upload-plan.json"));
      const uploadPlanMD = fs.readFileSync(path.join(fixture.distRoot, "release-upload-plan.md"), "utf-8");

      assert.equal(result.code, 0);
      assert.equal(uploadPlan.status, "passed");
      assert.equal(uploadPlan.executionMode, "plan-only");
      assert.equal(uploadPlan.networkActionsPerformed, false);
      assert.equal(uploadPlan.provider, "gitee-release");
      assert.equal(uploadPlan.releaseTag, "1.1.0");
      assert.equal(uploadPlan.targetBaseURL, fixture.targetBaseURL);
      assert.equal(uploadPlan.updateURL, fixture.releaseManifest.updateURL);
      assert.equal(uploadPlan.updateLink, fixture.releaseManifest.updateLink);
      assert.equal(uploadPlan.checks.releaseManifestPassed, true);
      assert.equal(uploadPlan.checks.preflightPassed, true);
      assert.equal(uploadPlan.checks.targetBaseURLMatchesManifest, true);
      assert.equal(uploadPlan.checks.networkUploadImplemented, false);
      assert.equal(uploadPlan.gateContract?.requiredRunName, "release-plan");
      assert.equal(uploadPlan.gateContract?.preferredPreparationCommand, "npm run agent:release");
      assert.ok(Array.isArray(uploadPlan.nextSteps));
      assert.ok(uploadPlan.nextSteps.some((item) => String(item).includes("npm run agent:release")));
      assert.equal(uploadPlan.uploadActions[0].targetURL, fixture.releaseManifest.updateURL);
      assert.equal(uploadPlan.uploadActions[1].targetURL, fixture.releaseManifest.updateLink);
      assert.equal(uploadPlan.uploadActions[2].command, "npm run release:preflight -- --verify-remote");
      assert.equal(uploadPlan.uploadActions[4].command, "npm run agent:gate:release");
      assert.ok(uploadPlanMD.includes("## Release Gate Contract"));
      assert.ok(uploadPlanMD.includes("## Next Steps"));
      assert.ok(uploadPlanMD.includes("This script is plan-only."));
      assert.ok(uploadPlanMD.includes("does not create `release-plan` telemetry"));
      assert.ok(uploadPlanMD.includes("npm run agent:release"));
      assert.ok(uploadPlanMD.includes("Manually upload `update.json`"));
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("should accept release upload provider and dry-run from environment for all supported providers", async () => {
    const providers = ["gitee-release", "github-release", "generic-http"];

    for (const provider of providers) {
      const fixture = makeTempReleaseUploadProject();

      try {
        const result = await execNodeResult([
          "scripts/release-upload.mjs",
          "--project-root",
          fixture.root,
        ], {
          env: {
            ...process.env,
            RELEASE_UPLOAD_PROVIDER: provider,
            RELEASE_UPLOAD_TAG: "v1.1.0",
            RELEASE_UPLOAD_TARGET_BASE_URL: fixture.targetBaseURL,
            RELEASE_UPLOAD_DRY_RUN: "true",
          },
        });

        const uploadPlan = readJSON(path.join(fixture.distRoot, "release-upload-plan.json"));

        assert.equal(result.code, 0);
        assert.equal(uploadPlan.status, "passed");
        assert.equal(uploadPlan.provider, provider);
        assert.equal(uploadPlan.dryRunRequested, true);
        assert.equal(uploadPlan.executionMode, "plan-only");
      } finally {
        fs.rmSync(fixture.root, { recursive: true, force: true });
      }
    }
  });

  it("should generate local release matrix artifacts", () => {
    prepareLocalReleasePreflight();
    execFileSync("node", ["scripts/release-prepare.mjs"], {
      cwd: projectRoot,
      stdio: "pipe",
    });

    removeIfExists(path.join(projectRoot, "dist", "release-install-smoke.json"));
    removeIfExists(path.join(projectRoot, "dist", "release-install-smoke.md"));
    removeIfExists(path.join(projectRoot, "dist", "release-install-smoke-stable.json"));
    removeIfExists(path.join(projectRoot, "dist", "release-install-smoke-beta.json"));

    execFileSync("node", ["scripts/release-matrix.mjs"], {
      cwd: projectRoot,
      stdio: "pipe",
    });

    const releaseMatrix = readJSON(path.join(projectRoot, "dist", "release-matrix.json"));
    const releaseMatrixMD = fs.readFileSync(path.join(projectRoot, "dist", "release-matrix.md"), "utf-8");

    assert.equal(releaseMatrix.addonId, "cleanroom-template@example.com");
    assert.equal(releaseMatrix.status, "attention");
    assert.equal(releaseMatrix.artifactPassed, true);
    assert.equal(releaseMatrix.profiles.length, 2);
    assert.equal(releaseMatrix.profiles[0].id, "stable");
    assert.equal(releaseMatrix.profiles[1].id, "beta");
    assert.equal(releaseMatrix.profiles.every((item) => item.metadataConsistent === true), true);
    assert.equal(releaseMatrix.profiles.every((item) => item.packageConsistent === true), true);
    assert.equal(releaseMatrix.profiles.every((item) => item.installSmokePresent === false), true);
    assert.equal(releaseMatrix.remoteVerification?.status, "pending");
    assert.ok(releaseMatrixMD.includes("## 渠道矩阵"));
    assert.ok(releaseMatrixMD.includes("## 远端发布验证"));
    assert.ok(releaseMatrixMD.includes("## 运行时错误画像"));
    assert.ok(releaseMatrixMD.includes("待补验证"));
  });

  it("should verify remote release URLs and carry the result into plan and matrix", async () => {
    const config = readJSON(path.join(projectRoot, "config", "addon.config.json"));

    try {
      resetLocalReleaseArtifacts();
      execFileSync("node", ["scripts/package.mjs"], {
        cwd: projectRoot,
        stdio: "pipe",
      });
      const outputName = `${config.addonRef}-${config.addonVersion}.xpi`;
      const sourceUpdateManifest = readJSON(path.join(projectRoot, "dist", "update.json"));
      const sourceXpiBuffer = fs.readFileSync(path.join(projectRoot, "dist", outputName));
      const remoteUpdateLink = `data:application/x-xpinstall;base64,${sourceXpiBuffer.toString("base64")}`;
      const remoteUpdateManifest = {
        ...sourceUpdateManifest,
        addons: {
          ...sourceUpdateManifest.addons,
          [config.addonId]: {
            ...(sourceUpdateManifest.addons?.[config.addonId] || {}),
            updates: [
              {
                ...(sourceUpdateManifest.addons?.[config.addonId]?.updates?.[0] || {}),
                version: config.addonVersion,
                update_link: remoteUpdateLink,
                applications: {
                  zotero: {
                    strict_min_version: config.strictMinVersion,
                    strict_max_version: config.strictMaxVersion,
                  },
                },
              },
            ],
          },
        },
      };
      const remoteUpdateURL = `data:application/json,${encodeURIComponent(JSON.stringify(remoteUpdateManifest))}`;
      prepareLocalReleasePreflight({
        verifyRemote: true,
        remoteArgs: [
          "--remote-update-url",
          remoteUpdateURL,
          "--remote-expected-update-link",
          remoteUpdateLink,
        ],
      });
      await execNodeAsync(["scripts/release-prepare.mjs"]);
      await execNodeAsync(["scripts/release-matrix.mjs"]);

      const preflight = readJSON(path.join(projectRoot, "dist", "release-preflight.json"));
      const releasePlan = readJSON(path.join(projectRoot, "dist", "release-plan.json"));
      const releaseMatrix = readJSON(path.join(projectRoot, "dist", "release-matrix.json"));
      const releaseNotes = fs.readFileSync(path.join(projectRoot, "dist", "release-notes.md"), "utf-8");

      assert.equal(preflight.status, "passed");
      assert.equal(preflight.remoteVerification?.status, "passed");
      assert.equal(preflight.remoteVerification?.evidenceMode, "synthetic");
      assert.equal(preflight.remoteVerification?.releaseReady, false);
      assert.ok(String(preflight.remoteVerification?.summary || "").includes("data: 内联 URL"));
      assert.equal(releasePlan.remoteVerification?.status, "passed");
      assert.equal(releasePlan.workflowState?.id, "remote-verification-synthetic");
      assert.equal(releasePlan.remoteVerification?.evidenceMode, "synthetic");
      assert.equal(releasePlan.remoteVerification?.releaseReady, false);
      assert.ok(String(releasePlan.remoteVerification?.summary || "").includes("data: 内联 URL"));
      assert.equal(releaseMatrix.status, "attention");
      assert.equal(releaseMatrix.remoteVerification?.status, "passed");
      assert.equal(releaseMatrix.remoteVerification?.evidenceMode, "synthetic");
      assert.equal(releaseMatrix.remoteVerification?.releaseReady, false);
      assert.ok(String(releaseMatrix.remoteVerification?.summary || "").includes("data: 内联 URL"));
      assert.equal(releaseMatrix.remoteVerification?.observedUpdateLink, remoteUpdateLink);
      assert.ok(releaseMatrix.attentionIssues.some((item) => String(item).includes("远端发布验证")));
      assert.ok(releaseNotes.includes("Status: `通过`"));
      assert.ok(releaseNotes.includes("## Workflow State"));
      assert.ok(releaseNotes.includes("仅测试型验证"));
      assert.ok(releaseNotes.includes("Evidence Mode: `测试型`"));
      assert.ok(releaseNotes.includes("Release Ready: `no`"));
    } finally {
      resetLocalReleaseArtifacts();
    }
  });

  it("should wire governance and guard scripts into package workflows", () => {
    const packageJSON = readJSON(path.join(projectRoot, "package.json"));
    assert.equal(packageJSON.scripts["docs:sync-backfill-bundles"], "node scripts/docs-sync-backfill-bundles.mjs");
    assert.equal(packageJSON.scripts["docs:sync-expansion-wave-contracts"], "node scripts/docs-sync-expansion-wave-contracts.mjs");
    assert.equal(packageJSON.scripts["docs:sync-validation-surfaces"], "node scripts/docs-sync-validation-surfaces.mjs");
    assert.equal(packageJSON.scripts["docs:sync-zotero-host-semantic-index"], "node scripts/docs-sync-zotero-host-semantic-index.mjs");
    assert.equal(packageJSON.scripts["docs:sync-zotero-host-interface-contracts"], "node scripts/docs-sync-zotero-host-interface-contracts.mjs");
    assert.equal(packageJSON.scripts["framework:governance:check"], "node scripts/framework-governance-check.mjs");
    assert.equal(packageJSON.scripts["framework:bundle:audit"], "node scripts/framework-bundle-audit.mjs");
    assert.equal(packageJSON.scripts["build:react-ui"], "node scripts/build-react-ui.mjs");
    assert.equal(packageJSON.scripts["package:encrypted"], "node scripts/package.mjs --encrypt-bundle --skip-release-metadata");
    assert.equal(packageJSON.scripts["package:shielded"], "node scripts/package.mjs --shield-bundle --skip-release-metadata");
    assert.equal(packageJSON.scripts["package:shielded:descriptor-bind"], "node scripts/package.mjs --descriptor-bind --skip-release-metadata");
    assert.equal(packageJSON.scripts["package:shielded:jsconfuser:string"], "node scripts/package.mjs --jsconfuser-string --skip-release-metadata");
    assert.equal(packageJSON.scripts["package:protection:smoke"], "node scripts/package-protection-smoke.mjs");
    assert.equal(packageJSON.scripts["package:protection:smoke:plain"], "node scripts/package-protection-smoke.mjs --variant plain");
    assert.equal(packageJSON.scripts["package:protection:smoke:encrypted"], "node scripts/package-protection-smoke.mjs --variant encrypted");
    assert.equal(packageJSON.scripts["package:protection:smoke:shielded"], "node scripts/package-protection-smoke.mjs --variant shielded");
    assert.equal(packageJSON.scripts["package:protection:smoke:shielded:descriptor-bind"], "node scripts/package-protection-smoke.mjs --variant shielded-descriptor-bind");
    assert.equal(packageJSON.scripts["package:protection:smoke:shielded:jsconfuser:string"], "node scripts/package-protection-smoke.mjs --variant shielded-jsconfuser-string");
    assert.equal(packageJSON.scripts["package:protection:webcrack"], "node scripts/package-protection-webcrack-audit.mjs");
    assert.equal(packageJSON.scripts["package:protection:webcrack:shielded"], "node scripts/package-protection-webcrack-audit.mjs --variant shielded");
    assert.equal(packageJSON.scripts["package:protection:webcrack:shielded:descriptor-bind"], "node scripts/package-protection-webcrack-audit.mjs --variant shielded-descriptor-bind");
    assert.equal(packageJSON.scripts["package:protection:webcrack:shielded:jsconfuser:string"], "node scripts/package-protection-webcrack-audit.mjs --variant shielded-jsconfuser-string");
    assert.equal(packageJSON.scripts["package:protection:webcrack:score"], "node scripts/package-protection-webcrack-score.mjs");
    assert.equal(packageJSON.scripts["package:protection:audit"], "node scripts/package-protection-anchor-audit.mjs");
    assert.equal(packageJSON.scripts["package:protection:audit:descriptor-bind"], "node scripts/package-protection-anchor-audit.mjs --include-descriptor-bind");
    assert.equal(packageJSON.scripts["package:protection:audit:jsconfuser:string"], "node scripts/package-protection-anchor-audit.mjs --include-jsconfuser-string");
    assert.equal(packageJSON.scripts["package:protection:compare"], "node scripts/package-protection-experiment-compare.mjs");
    assert.equal(packageJSON.scripts["package:protection:compare:descriptor-bind"], "node scripts/package-protection-experiment-compare.mjs --variant shielded-descriptor-bind");
    assert.equal(packageJSON.scripts["package:protection:compare:jsconfuser:string"], "node scripts/package-protection-experiment-compare.mjs --variant shielded-jsconfuser-string");
    assert.equal(packageJSON.scripts["package:protection:jsconfuser:bootstrap"], "node scripts/package-protection-jsconfuser-bootstrap.mjs");
    assert.equal(packageJSON.scripts["package:protection:jsconfuser:preflight"], "node scripts/package-protection-jsconfuser-preflight.mjs");
    assert.equal(packageJSON.scripts["package:protection:jsconfuser:string:preflight"], "node scripts/package-protection-jsconfuser-preflight.mjs --profile targeted-string-concealing");
    assert.equal(packageJSON.scripts["package:protection:lightweight:preflight"], "node scripts/package-protection-lightweight-preflight.mjs");
    assert.equal(packageJSON.scripts["package:protection:inner:audit"], "node scripts/package-protection-inner-audit.mjs");
    assert.equal(packageJSON.scripts["package:protection:inner:audit:shielded"], "node scripts/package-protection-inner-audit.mjs --variant shielded");
    assert.equal(packageJSON.scripts["package:protection:inner:audit:descriptor-bind"], "node scripts/package-protection-inner-audit.mjs --variant shielded-descriptor-bind");
    assert.equal(packageJSON.scripts["package:protection:inner:audit:jsconfuser:string"], "node scripts/package-protection-inner-audit.mjs --variant shielded-jsconfuser-string");
    assert.equal(packageJSON.scripts["package:protection:score"], "node scripts/package-protection-manual-score.mjs");
    assert.equal(packageJSON.scripts["package:protection:score:llm"], "node scripts/package-protection-llm-score.mjs");
    assert.equal(packageJSON.scripts["package:protection:verdict"], "node scripts/package-protection-verdict.mjs");
    assert.equal(packageJSON.devDependencies.esbuild, "^0.21.5");
    assert.equal(packageJSON.devDependencies["javascript-obfuscator"], "^5.4.1");
    assert.equal(packageJSON.devDependencies.react, "^18.3.1");
    assert.equal(packageJSON.devDependencies["react-dom"], "^18.3.1");
    assert.equal(packageJSON.scripts["agent:workspace:guard"], "node scripts/agent-workspace-guard.mjs");
    assert.equal(packageJSON.scripts["agent:workspace:guard:strict"], "node scripts/agent-workspace-guard.mjs --strict");
    assert.equal(packageJSON.scripts["agent:context"], "node scripts/agent-context.mjs");
    assert.equal(packageJSON.scripts["agent:context:guard"], "node scripts/agent-context-guard.mjs");
    assert.equal(packageJSON.scripts["agent:context:guard:strict"], "node scripts/agent-context-guard.mjs --strict");
    assert.equal(packageJSON.scripts["agent:obsidian:guard"], "node scripts/agent-obsidian-guard.mjs");
    assert.equal(packageJSON.scripts["agent:obsidian:guard:strict"], "node scripts/agent-obsidian-guard.mjs --strict");
    assert.equal(packageJSON.scripts["agent:host:guard"], "node scripts/zotero-host-interface-guard.mjs");
    assert.equal(packageJSON.scripts["agent:host:guard:strict"], "node scripts/zotero-host-interface-guard.mjs --strict");
    assert.equal(packageJSON.scripts["agent:host:semantic:guard"], "node scripts/zotero-host-semantic-index-guard.mjs");
    assert.equal(packageJSON.scripts["agent:host:semantic:guard:strict"], "node scripts/zotero-host-semantic-index-guard.mjs --strict");
    assert.equal(packageJSON.scripts["init:workspace"], "node scripts/init-workspace.mjs");
    assert.equal(packageJSON.scripts["agent:sync"], "node scripts/agent-sync.mjs");
    assert.ok(String(packageJSON.scripts.check || "").includes("framework:governance:check"));
    assert.ok(String(packageJSON.scripts["agent:gate"] || "").includes("agent:workspace:guard:strict"));
    assert.ok(String(packageJSON.scripts["agent:gate"] || "").includes("agent:host:guard:strict"));
    assert.ok(String(packageJSON.scripts["agent:gate"] || "").includes("agent:host:semantic:guard:strict"));
    assert.ok(String(packageJSON.scripts["agent:gate"] || "").includes("agent:monitor"));
    assert.equal(String(packageJSON.scripts["agent:gate"] || "").includes("npm run agent:context &&"), false);
    assert.ok(String(packageJSON.scripts["agent:gate:release"] || "").includes("agent:workspace:guard:strict"));
    assert.ok(String(packageJSON.scripts["agent:gate:release"] || "").includes("agent:host:guard:strict"));
    assert.ok(String(packageJSON.scripts["agent:gate:release"] || "").includes("agent:host:semantic:guard:strict"));
    assert.ok(String(packageJSON.scripts["agent:gate:release"] || "").includes("agent:monitor"));
    assert.equal(String(packageJSON.scripts["agent:gate:release"] || "").includes("npm run agent:context &&"), false);
    assert.ok(String(packageJSON.scripts.check || "").includes("agent:workspace:guard"));
    assert.ok(String(packageJSON.scripts.check || "").includes("agent:obsidian:guard"));
    assert.ok(String(packageJSON.scripts.check || "").includes("agent:host:guard"));
    assert.ok(String(packageJSON.scripts.check || "").includes("agent:host:semantic:guard"));
  });

  it("should pass framework governance check for the current template", async () => {
    const result = await execNodeResult(["scripts/framework-governance-check.mjs"]);
    assert.equal(result.code, 0);
    assert.ok(result.stdout.includes("Framework governance check passed"));
  });

  it("should pass host interface guard for the current template", async () => {
    const result = await execNodeResult(["scripts/zotero-host-interface-guard.mjs", "--strict"]);
    assert.equal(result.code, 0);
    assert.ok(result.stdout.includes("Host interface guard (strict): passed"));
  });

  it("should pass host semantic guard for the current template", async () => {
    const result = await execNodeResult(["scripts/zotero-host-semantic-index-guard.mjs", "--strict"]);
    assert.equal(result.code, 0);
    assert.ok(result.stdout.includes("Host semantic guard (strict): passed"));
  });

  it("should generate adopted framework bundle audit for the current template", async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate-framework-audit-"));
    try {
      const result = await execNodeResult([
        "scripts/framework-bundle-audit.mjs",
        "--output-dir",
        outputDir,
      ]);
      assert.equal(result.code, 0);
      const auditJSON = readJSON(path.join(outputDir, "framework-bundle-audit.json"));
      const auditMarkdown = fs.readFileSync(path.join(outputDir, "framework-bundle-audit.md"), "utf-8");
      assert.equal(auditJSON.summary.adoptedBundles, auditJSON.summary.totalBundles);
      assert.equal(auditJSON.mirrorStatus, "current");
      assert.ok(auditJSON.bundles.every((bundle) => bundle.adoptionStatus === "adopted"));
      assert.ok(auditJSON.bundles.every((bundle) => bundle.mirrorStatus === "current"));
      assert.ok(auditJSON.bundles.every((bundle) => typeof bundle.bundleLifecycle === "string"));
      assert.ok(auditJSON.bundles.every((bundle) => typeof bundle.bundleVersion === "number"));
      const expansionWaveBundle = auditJSON.bundles.find((bundle) => bundle.id === "expansion-wave-scaffold-v1");
      assert.ok(expansionWaveBundle);
      assert.equal(expansionWaveBundle.expansionWaveDetails.projectWaveStatus, currentProjectWaveStatus);
      assert.ok(result.stdout.includes(`expansion-wave: ${currentProjectWaveStatus} / ${currentProjectWaveContractId} / ${currentProjectWaveName} / ${currentProjectAcceptanceTrack}`));
      assert.ok(auditMarkdown.includes("Framework Backfill Audit"));
      assert.ok(auditMarkdown.includes("Expansion Wave Overview"));
      assert.ok(auditMarkdown.includes("Surface Verification Overview"));
      assert.ok(auditMarkdown.includes("Registry Mirror"));
      assert.ok(auditMarkdown.includes("Matched AGENTS Rule"));
      assert.ok(auditMarkdown.includes(`Project Wave Status: \`${currentProjectWaveStatus}\``));
      assert.ok(auditMarkdown.includes("| Bundle | Adoption | Mirror | Wave | Checks |"));
      assert.ok(auditMarkdown.includes(`projectWaveStatus=\`${currentProjectWaveStatus}\``));
      assert.ok(auditMarkdown.includes("workspace-init-guard-v1"));
      assert.ok(auditMarkdown.includes("validation-decision-v1"));
      assert.ok(auditMarkdown.includes("validation-decision-v2"));
      assert.ok(auditMarkdown.includes("expansion-wave-scaffold-v1"));
      assert.ok(auditMarkdown.includes("host-interface-contract-v1"));
      assert.ok(auditMarkdown.includes("host-semantic-index-v1"));
      assert.ok(auditMarkdown.includes("surface-verification-v1"));
    } finally {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("should warn in host guard warn mode and fail in strict mode when contract adoption is incomplete", async () => {
    const emptyProjectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate-host-guard-project-"));
    const registryPath = path.join(projectRoot, "config", "zotero-host-interface-contracts.json");

    try {
      const warnResult = await execNodeResult([
        "scripts/zotero-host-interface-guard.mjs",
        "--project-root",
        emptyProjectRoot,
        "--registry",
        registryPath,
      ]);
      const strictResult = await execNodeResult([
        "scripts/zotero-host-interface-guard.mjs",
        "--strict",
        "--project-root",
        emptyProjectRoot,
        "--registry",
        registryPath,
      ]);

      assert.equal(warnResult.code, 0);
      assert.equal(strictResult.code, 2);
      assert.ok(warnResult.stdout.includes("Host interface guard (warn): warning"));
      assert.ok(warnResult.stdout.includes("Contract menu-manager is failed."));
      assert.ok(strictResult.stdout.includes("Contract menu-manager is failed."));
    } finally {
      fs.rmSync(emptyProjectRoot, { recursive: true, force: true });
    }
  });

  it("should warn in host semantic guard warn mode and fail in strict mode when semantic index adoption is incomplete", async () => {
    const emptyProjectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate-host-semantic-guard-project-"));
    const registryPath = path.join(projectRoot, "config", "zotero-host-semantic-index.json");

    try {
      const warnResult = await execNodeResult([
        "scripts/zotero-host-semantic-index-guard.mjs",
        "--project-root",
        emptyProjectRoot,
        "--registry",
        registryPath,
      ]);
      const strictResult = await execNodeResult([
        "scripts/zotero-host-semantic-index-guard.mjs",
        "--strict",
        "--project-root",
        emptyProjectRoot,
        "--registry",
        registryPath,
      ]);

      assert.equal(warnResult.code, 0);
      assert.equal(strictResult.code, 2);
      assert.ok(warnResult.stdout.includes("Host semantic guard (warn): warning"));
      assert.ok(warnResult.stdout.includes("Semantic domain menu-manager is failed."));
      assert.ok(strictResult.stdout.includes("Semantic domain menu-manager is failed."));
    } finally {
      fs.rmSync(emptyProjectRoot, { recursive: true, force: true });
    }
  });

  it("should warn in workspace guard warn mode and fail in strict mode when init-workspace report is missing", async () => {
    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate-workspace-guard-"));

    try {
      const warnResult = await execNodeResult(["scripts/agent-workspace-guard.mjs"], {
        env: {
          ...process.env,
          AGENT_ARTIFACTS_DIR: artifactsDir,
        },
      });
      const strictResult = await execNodeResult(["scripts/agent-workspace-guard.mjs", "--strict"], {
        env: {
          ...process.env,
          AGENT_ARTIFACTS_DIR: artifactsDir,
        },
      });

      assert.equal(warnResult.code, 0);
      assert.equal(strictResult.code, 2);
      assert.ok(warnResult.stdout.includes("missing-init-report"));
      assert.ok(strictResult.stdout.includes("init:workspace"));
    } finally {
      fs.rmSync(artifactsDir, { recursive: true, force: true });
    }
  });

  it("should warn on external obsidian workspaceDir in warn mode and fail in strict mode", async () => {
    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate-obsidian-guard-script-"));
    const externalWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate-obsidian-external-"));
    try {
      writeJSON(path.join(artifactsDir, "agent-obsidian-handoff.json"), {
        generatedAt: new Date().toISOString(),
        success: true,
        workspaceDir: externalWorkspace,
      });

      const warnResult = await execNodeResult(["scripts/agent-obsidian-guard.mjs"], {
        env: {
          ...process.env,
          AGENT_ARTIFACTS_DIR: artifactsDir,
        },
      });
      assert.equal(warnResult.code, 0);
      assert.ok(warnResult.stdout.includes("external-blocked"));

      const strictResult = await execNodeResult(["scripts/agent-obsidian-guard.mjs", "--strict"], {
        env: {
          ...process.env,
          AGENT_ARTIFACTS_DIR: artifactsDir,
        },
      });
      assert.equal(strictResult.code, 2);
      assert.ok(strictResult.stdout.includes("external-blocked"));
    } finally {
      fs.rmSync(artifactsDir, { recursive: true, force: true });
      fs.rmSync(externalWorkspace, { recursive: true, force: true });
    }
  });

  it("should block gate when obsidian workspaceDir points outside project root", async () => {
    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate-gate-obsidian-guard-"));
    const externalWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate-gate-external-"));
    try {
      writeJSON(path.join(artifactsDir, "agent-monitor.json"), buildMinimalMonitorSummary());
      writeJSON(path.join(artifactsDir, "agent-obsidian-handoff.json"), {
        generatedAt: new Date().toISOString(),
        success: true,
        workspaceDir: externalWorkspace,
      });
      const result = await execNodeResult(["scripts/agent-gate.mjs"], {
        env: {
          ...process.env,
          AGENT_ARTIFACTS_DIR: artifactsDir,
        },
      });
      assert.equal(result.code, 2);
      const gateJSON = readJSON(path.join(artifactsDir, "agent-gate.json"));
      assert.equal(gateJSON.gatePassed, false);
      assert.ok(Array.isArray(gateJSON.issues));
      assert.ok(gateJSON.issues.some((item) => String(item).includes("Obsidian workspaceDir 越界")));
    } finally {
      fs.rmSync(artifactsDir, { recursive: true, force: true });
      fs.rmSync(externalWorkspace, { recursive: true, force: true });
    }
  });

  it("should initialize workspace and generate fresh obsidian handoff in project-owned path", async () => {
    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate-init-workspace-"));
    try {
      fs.mkdirSync(path.join(artifactsDir, "agent-runs"), { recursive: true });
      fs.mkdirSync(path.join(artifactsDir, "agent-delegation", "TASK-OLD"), { recursive: true });
      writeJSON(path.join(artifactsDir, "agent-memory.json"), {
        projectRoot: "/tmp/legacy-project",
      });

      const result = await execNodeResult(["scripts/init-workspace.mjs"], {
        env: {
          ...process.env,
          AGENT_ARTIFACTS_DIR: artifactsDir,
        },
      });
      assert.equal(result.code, 0);

      const handoff = readJSON(path.join(artifactsDir, "agent-obsidian-handoff.json"));
      assert.ok(typeof handoff.workspaceDir === "string");
      assert.ok(handoff.workspaceDir.startsWith(path.join(projectRoot, "obsidian", "agent-workbench")));
      assert.equal(handoff.bootstrapShell, true);
      assert.equal(handoff.summarySource, "bootstrap-shell");
      assert.equal(handoff.runnableNextCommand, "npm run agent:sync");

      const initReport = readJSON(path.join(artifactsDir, "init-workspace.json"));
      assert.equal(initReport.success, true);
      assert.equal(initReport.markerVersion, 1);
      assert.equal(initReport.projectRoot, projectRoot);
      assert.equal(initReport.guard.status, "within-project");
      assert.equal(initReport.guard.scope, "path");
      assert.ok(Array.isArray(initReport.cleanedArtifactPaths));
      assert.ok(initReport.cleanedArtifactPaths.some((item) => item.endsWith(path.join("agent-runs"))));
      assert.equal(fs.existsSync(path.join(artifactsDir, "agent-runs")), false);
      assert.equal(fs.existsSync(path.join(artifactsDir, "agent-delegation")), false);
      assert.equal(fs.existsSync(path.join(artifactsDir, "agent-memory.json")), false);
    } finally {
      fs.rmSync(artifactsDir, { recursive: true, force: true });
    }
  });

  it("should export pure project package without agent framework extras", () => {
    execFileSync("node", ["scripts/export-project.mjs"], {
      cwd: projectRoot,
      stdio: "pipe",
    });

    const exportRoot = path.join(projectRoot, "dist", "cleanroomtemplate-0.1.0-pure-project");
    const exportManifest = readJSON(path.join(exportRoot, "export-manifest.json"));
    const exportPackage = readJSON(path.join(exportRoot, "package.json"));
    const exportReadme = fs.readFileSync(path.join(exportRoot, "README.md"), "utf-8");

    assert.equal(exportManifest.addonRef, "cleanroomtemplate");
    assert.ok(fs.existsSync(path.join(exportRoot, "src", "main.js")));
    assert.ok(fs.existsSync(path.join(exportRoot, "types", "index.d.ts")));
    assert.ok(fs.existsSync(path.join(exportRoot, "scripts", "static-runtime-baseline-lib.mjs")));
    assert.ok(fs.existsSync(path.join(exportRoot, "scripts", "package-obfuscation-lib.mjs")));
    assert.ok(fs.existsSync(path.join(exportRoot, "scripts", "package-protection-lib.mjs")));
    assert.ok(fs.existsSync(path.join(exportRoot, "scripts", "package-protection-anchor-audit.mjs")));
    assert.ok(fs.existsSync(path.join(exportRoot, "scripts", "package-protection-jsconfuser-preflight.mjs")));
    assert.ok(fs.existsSync(path.join(exportRoot, "scripts", "package-protection-lightweight-preflight.mjs")));
    assert.ok(fs.existsSync(path.join(exportRoot, "scripts", "package-protection-inner-audit.mjs")));
    assert.ok(fs.existsSync(path.join(exportRoot, "scripts", "package-protection-smoke.mjs")));
    assert.ok(fs.existsSync(path.join(exportRoot, "scripts", "package-protection-webcrack-audit.mjs")));
    assert.ok(fs.existsSync(path.join(exportRoot, "scripts", "package-protection-webcrack-score.mjs")));
    assert.ok(fs.existsSync(path.join(exportRoot, "scripts", "package-protection-manual-score.mjs")));
    assert.ok(fs.existsSync(path.join(exportRoot, "scripts", "package-protection-verdict.mjs")));
    assert.ok(fs.existsSync(path.join(exportRoot, "scripts", "zotero-runner-lib.mjs")));
    assert.ok(fs.existsSync(path.join(exportRoot, "scripts", "zotero-agent-runtime-lib.mjs")));
    assert.ok(fs.existsSync(path.join(exportRoot, "LEGAL_RISK_CHECKLIST.md")));
    assert.ok(fs.existsSync(path.join(exportRoot, "CODE_PROVENANCE.md")));
    assert.ok(fs.existsSync(path.join(exportRoot, "THIRD_PARTY_NOTICES.md")));
    assert.ok(fs.existsSync(path.join(exportRoot, "COMMERCIAL_DELIVERY_RIGHTS_NOTICE.md")));
    EXPORTED_STATIC_RUNTIME_BASELINE.forEach((relativePath) => {
      assert.ok(fs.existsSync(path.join(exportRoot, relativePath)), `missing exported baseline file: ${relativePath}`);
      assert.ok(exportManifest.staticRuntimeBaselineFiles.includes(relativePath), `missing baseline manifest entry: ${relativePath}`);
    });
    assert.ok(exportManifest.includedPaths.includes("CODE_PROVENANCE.md"));
    assert.ok(exportManifest.includedPaths.includes("THIRD_PARTY_NOTICES.md"));
    assert.ok(exportManifest.includedPaths.includes("COMMERCIAL_DELIVERY_RIGHTS_NOTICE.md"));
    assert.equal(exportPackage.scripts.build, "node scripts/build.mjs");
    assert.equal(exportPackage.scripts["build:react-ui"], "node scripts/build-react-ui.mjs");
    assert.equal(exportPackage.scripts["package:encrypted"], "node scripts/package.mjs --encrypt-bundle --skip-release-metadata");
    assert.equal(exportPackage.scripts["package:shielded"], "node scripts/package.mjs --shield-bundle --skip-release-metadata");
    assert.equal(exportPackage.scripts["package:shielded:descriptor-bind"], "node scripts/package.mjs --descriptor-bind --skip-release-metadata");
    assert.equal(exportPackage.scripts["package:shielded:jsconfuser:string"], "node scripts/package.mjs --jsconfuser-string --skip-release-metadata");
    assert.equal(exportPackage.scripts["package:protection:smoke"], "node scripts/package-protection-smoke.mjs");
    assert.equal(exportPackage.scripts["package:protection:smoke:plain"], "node scripts/package-protection-smoke.mjs --variant plain");
    assert.equal(exportPackage.scripts["package:protection:smoke:encrypted"], "node scripts/package-protection-smoke.mjs --variant encrypted");
    assert.equal(exportPackage.scripts["package:protection:smoke:shielded"], "node scripts/package-protection-smoke.mjs --variant shielded");
    assert.equal(exportPackage.scripts["package:protection:smoke:shielded:descriptor-bind"], "node scripts/package-protection-smoke.mjs --variant shielded-descriptor-bind");
    assert.equal(exportPackage.scripts["package:protection:smoke:shielded:jsconfuser:string"], "node scripts/package-protection-smoke.mjs --variant shielded-jsconfuser-string");
    assert.equal(exportPackage.scripts["package:protection:webcrack"], "node scripts/package-protection-webcrack-audit.mjs");
    assert.equal(exportPackage.scripts["package:protection:webcrack:shielded"], "node scripts/package-protection-webcrack-audit.mjs --variant shielded");
    assert.equal(exportPackage.scripts["package:protection:webcrack:shielded:descriptor-bind"], "node scripts/package-protection-webcrack-audit.mjs --variant shielded-descriptor-bind");
    assert.equal(exportPackage.scripts["package:protection:webcrack:shielded:jsconfuser:string"], "node scripts/package-protection-webcrack-audit.mjs --variant shielded-jsconfuser-string");
    assert.equal(exportPackage.scripts["package:protection:webcrack:score"], "node scripts/package-protection-webcrack-score.mjs");
    assert.equal(exportPackage.scripts["package:protection:audit"], "node scripts/package-protection-anchor-audit.mjs");
    assert.equal(exportPackage.scripts["package:protection:audit:descriptor-bind"], "node scripts/package-protection-anchor-audit.mjs --include-descriptor-bind");
    assert.equal(exportPackage.scripts["package:protection:audit:jsconfuser:string"], "node scripts/package-protection-anchor-audit.mjs --include-jsconfuser-string");
    assert.equal(exportPackage.scripts["package:protection:compare"], "node scripts/package-protection-experiment-compare.mjs");
    assert.equal(exportPackage.scripts["package:protection:compare:descriptor-bind"], "node scripts/package-protection-experiment-compare.mjs --variant shielded-descriptor-bind");
    assert.equal(exportPackage.scripts["package:protection:compare:jsconfuser:string"], "node scripts/package-protection-experiment-compare.mjs --variant shielded-jsconfuser-string");
    assert.equal(exportPackage.scripts["package:protection:jsconfuser:bootstrap"], "node scripts/package-protection-jsconfuser-bootstrap.mjs");
    assert.equal(exportPackage.scripts["package:protection:jsconfuser:preflight"], "node scripts/package-protection-jsconfuser-preflight.mjs");
    assert.equal(exportPackage.scripts["package:protection:jsconfuser:string:preflight"], "node scripts/package-protection-jsconfuser-preflight.mjs --profile targeted-string-concealing");
    assert.equal(exportPackage.scripts["package:protection:lightweight:preflight"], "node scripts/package-protection-lightweight-preflight.mjs");
    assert.equal(exportPackage.scripts["package:protection:inner:audit"], "node scripts/package-protection-inner-audit.mjs");
    assert.equal(exportPackage.scripts["package:protection:inner:audit:shielded"], "node scripts/package-protection-inner-audit.mjs --variant shielded");
    assert.equal(exportPackage.scripts["package:protection:inner:audit:descriptor-bind"], "node scripts/package-protection-inner-audit.mjs --variant shielded-descriptor-bind");
    assert.equal(exportPackage.scripts["package:protection:inner:audit:jsconfuser:string"], "node scripts/package-protection-inner-audit.mjs --variant shielded-jsconfuser-string");
    assert.equal(exportPackage.scripts["package:protection:score"], "node scripts/package-protection-manual-score.mjs");
    assert.equal(exportPackage.scripts["package:protection:score:llm"], "node scripts/package-protection-llm-score.mjs");
    assert.equal(exportPackage.scripts["package:protection:verdict"], "node scripts/package-protection-verdict.mjs");
    assert.equal(exportPackage.devDependencies.esbuild, "^0.21.5");
    assert.equal(exportPackage.devDependencies["javascript-obfuscator"], "^5.4.1");
    assert.equal(exportPackage.devDependencies.react, "^18.3.1");
    assert.equal(exportPackage.devDependencies["react-dom"], "^18.3.1");
    assert.ok(!("agent:gate" in exportPackage.scripts));
    assert.ok(exportReadme.includes("纯项目"));
    assert.ok(exportReadme.includes("静态运行时基线"));
    assert.ok(exportReadme.includes("中国法商业交付骨架"));
    assert.ok(exportReadme.includes("UNLICENSED"));
    assert.ok(exportReadme.includes("build:react-ui"));
    assert.ok(exportReadme.includes("package:encrypted"));
    assert.ok(exportReadme.includes("package:shielded"));
    assert.ok(exportReadme.includes("package:shielded:jsconfuser:string"));
    assert.ok(exportReadme.includes("package:protection:smoke"));
    assert.ok(exportReadme.includes("package:protection:smoke:shielded:descriptor-bind"));
    assert.ok(exportReadme.includes("package:protection:smoke:shielded:jsconfuser:string"));
    assert.ok(exportReadme.includes("package:protection:webcrack:shielded"));
    assert.ok(exportReadme.includes("package:protection:webcrack:shielded:descriptor-bind"));
    assert.ok(exportReadme.includes("package:protection:webcrack:shielded:jsconfuser:string"));
    assert.ok(exportReadme.includes("package:protection:webcrack:score"));
    assert.ok(exportReadme.includes("package:protection:audit"));
    assert.ok(exportReadme.includes("package:protection:audit:descriptor-bind"));
    assert.ok(exportReadme.includes("package:protection:audit:jsconfuser:string"));
    assert.ok(exportReadme.includes("package:protection:compare:descriptor-bind"));
    assert.ok(exportReadme.includes("package:protection:compare:jsconfuser:string"));
    assert.ok(exportReadme.includes("package:protection:jsconfuser:preflight"));
    assert.ok(exportReadme.includes("package:protection:jsconfuser:string:preflight"));
    assert.ok(exportReadme.includes("package:protection:lightweight:preflight"));
    assert.ok(exportReadme.includes("package:protection:inner:audit:shielded"));
    assert.ok(exportReadme.includes("package:protection:inner:audit:descriptor-bind"));
    assert.ok(exportReadme.includes("package:protection:inner:audit:jsconfuser:string"));
    assert.ok(exportReadme.includes("package:protection:score"));
    assert.ok(exportReadme.includes("package:protection:score:llm"));
    assert.ok(exportReadme.includes("package:protection:verdict"));
    assert.ok(exportReadme.includes("react-dom"));
    assert.ok(exportReadme.includes("addon-static/content/style/main.css"));
    assert.ok(exportReadme.includes("addon-static/locale/zh-CN/main.ftl"));
    assert.ok(fs.existsSync(path.join(projectRoot, "dist", "cleanroomtemplate-0.1.0-pure-project.zip")));
  });
});
