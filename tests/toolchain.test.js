import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
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
  it("should pass lint/format/typecheck/verify checks", () => {
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
    assert.equal(releaseManifest.addonId, config.addonId);
    assert.equal(releaseManifest.addonVersion, config.addonVersion);
    assert.ok(releaseManifest.xpiName.endsWith(".xpi"));
  });

  it("should pass release preflight and generate integrity report", () => {
    execFileSync("node", ["scripts/package.mjs"], {
      cwd: projectRoot,
      stdio: "pipe",
    });
    execFileSync("node", ["scripts/release-preflight.mjs"], {
      cwd: projectRoot,
      stdio: "pipe",
    });

    const preflightReport = readJSON(path.join(projectRoot, "dist", "release-preflight.json"));
    assert.ok(typeof preflightReport.xpiSHA256 === "string");
    assert.equal(preflightReport.xpiSHA256.length, 64);
    assert.ok(Number(preflightReport.xpiSizeBytes) > 0);
  });

  it("should generate release upload plan and notes", () => {
    execFileSync("node", ["scripts/release-prepare.mjs"], {
      cwd: projectRoot,
      stdio: "pipe",
    });

    const releasePlan = readJSON(path.join(projectRoot, "dist", "release-plan.json"));
    const releaseNotes = fs.readFileSync(path.join(projectRoot, "dist", "release-notes.md"), "utf-8");

    assert.equal(releasePlan.addonId, "cleanroom-template@example.com");
    assert.ok(Array.isArray(releasePlan.artifactFiles));
    assert.ok(releasePlan.artifactFiles.includes("release-notes.md"));
    assert.ok(releaseNotes.includes("## Upload Steps"));
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
    assert.ok(releaseMatrixMD.includes("## 渠道矩阵"));
    assert.ok(releaseMatrixMD.includes("## 运行时错误画像"));
    assert.ok(releaseMatrixMD.includes("待补验证"));
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
