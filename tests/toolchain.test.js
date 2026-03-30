import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it, assert } from "./test-framework.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function removeIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true });
  }
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

  it("should pass release preflight and generate integrity report", () => {
    const referenceRoot = makeTempReferenceRoot();

    execFileSync("node", ["scripts/package.mjs"], {
      cwd: projectRoot,
      stdio: "pipe",
    });
    try {
      execFileSync("node", ["scripts/release-preflight.mjs"], {
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

    const preflightReport = readJSON(path.join(projectRoot, "dist", "release-preflight.json"));
    assert.equal(preflightReport.status, "passed");
    assert.ok(typeof preflightReport.xpiSHA256 === "string");
    assert.equal(preflightReport.xpiSHA256.length, 64);
    assert.ok(Number(preflightReport.xpiSizeBytes) > 0);
    assert.equal(preflightReport.cleanroomAuditStatus, "passed");
    assert.equal(preflightReport.cleanroomAuditMode, "release");
    assert.equal(preflightReport.cleanroomSimilarityStatus, "available");
  });

  it("should generate release upload plan and notes", () => {
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
    assert.equal(releasePlan.remoteVerification?.status, "unconfigured");
    assert.ok(releaseNotes.includes("## Upload Steps"));
    assert.ok(releaseNotes.includes("## Remote Verification"));
    assert.ok(releaseNotes.includes("SHA256"));
  });

  it("should generate local release matrix artifacts", () => {
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
    assert.equal(releaseMatrix.remoteVerification?.status, "unconfigured");
    assert.ok(releaseMatrixMD.includes("## 渠道矩阵"));
    assert.ok(releaseMatrixMD.includes("## 远端发布验证"));
    assert.ok(releaseMatrixMD.includes("## 运行时错误画像"));
    assert.ok(releaseMatrixMD.includes("待补验证"));
  });

  it("should verify remote release URLs and carry the result into plan and matrix", async () => {
    execFileSync("node", ["scripts/package.mjs"], {
      cwd: projectRoot,
      stdio: "pipe",
    });

    let referenceRoot = null;

    try {
      const config = readJSON(path.join(projectRoot, "config", "addon.config.json"));
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
      referenceRoot = makeTempReferenceRoot();

      await execNodeAsync([
        "scripts/release-preflight.mjs",
        "--verify-remote",
        "--remote-update-url",
        remoteUpdateURL,
        "--remote-expected-update-link",
        remoteUpdateLink,
      ], {
        env: {
          ...process.env,
          CLEANROOM_REFERENCE_ROOT: referenceRoot,
        },
      });
      await execNodeAsync(["scripts/release-prepare.mjs"]);
      await execNodeAsync(["scripts/release-matrix.mjs"]);

      const preflight = readJSON(path.join(projectRoot, "dist", "release-preflight.json"));
      const releasePlan = readJSON(path.join(projectRoot, "dist", "release-plan.json"));
      const releaseMatrix = readJSON(path.join(projectRoot, "dist", "release-matrix.json"));
      const releaseNotes = fs.readFileSync(path.join(projectRoot, "dist", "release-notes.md"), "utf-8");

      assert.equal(preflight.status, "passed");
      assert.equal(preflight.remoteVerification?.status, "passed");
      assert.equal(releasePlan.remoteVerification?.status, "passed");
      assert.equal(releaseMatrix.remoteVerification?.status, "passed");
      assert.equal(releaseMatrix.remoteVerification?.observedUpdateLink, remoteUpdateLink);
      assert.ok(releaseNotes.includes("Status: `通过`"));
    } finally {
      if (referenceRoot) {
        fs.rmSync(referenceRoot, { recursive: true, force: true });
      }
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
    EXPORTED_STATIC_RUNTIME_BASELINE.forEach((relativePath) => {
      assert.ok(fs.existsSync(path.join(exportRoot, relativePath)), `missing exported baseline file: ${relativePath}`);
      assert.ok(exportManifest.staticRuntimeBaselineFiles.includes(relativePath), `missing baseline manifest entry: ${relativePath}`);
    });
    assert.equal(exportPackage.scripts.build, "node scripts/build.mjs");
    assert.ok(!("agent:gate" in exportPackage.scripts));
    assert.ok(exportReadme.includes("纯项目"));
    assert.ok(exportReadme.includes("静态运行时基线"));
    assert.ok(exportReadme.includes("addon-static/content/style/main.css"));
    assert.ok(exportReadme.includes("addon-static/locale/zh-CN/main.ftl"));
    assert.ok(fs.existsSync(path.join(projectRoot, "dist", "cleanroomtemplate-0.1.0-pure-project.zip")));
  });
});
