/**
 * 构建产物测试
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it, assert } from "./test-framework.js";
import {
  BUILD_MODULE_ID_MODE_ANONYMIZED,
  BUILD_MODULE_ID_MODE_PATH,
  createBundleModuleId,
  resolveBuildModuleIdMode,
} from "../scripts/build.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

describe("Build Artifacts", () => {
  it("should resolve build module id mode from environment safely", () => {
    assert.equal(resolveBuildModuleIdMode({}), BUILD_MODULE_ID_MODE_PATH);
    assert.equal(
      resolveBuildModuleIdMode({ CLEANROOM_BUILD_MODULE_ID_MODE: "anonymized" }),
      BUILD_MODULE_ID_MODE_ANONYMIZED,
    );
    assert.equal(
      resolveBuildModuleIdMode({ CLEANROOM_BUILD_MODULE_ID_MODE: "unexpected" }),
      BUILD_MODULE_ID_MODE_PATH,
    );
  });

  it("should anonymize bundle module ids only in protected build mode", () => {
    const srcRootPath = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate-build-mode-"));
    const mainFile = path.join(srcRootPath, "app", "main.js");
    const loggerFile = path.join(srcRootPath, "core", "logger.js");

    fs.mkdirSync(path.dirname(mainFile), { recursive: true });
    fs.mkdirSync(path.dirname(loggerFile), { recursive: true });
    fs.writeFileSync(mainFile, "export function main() {}", "utf-8");
    fs.writeFileSync(loggerFile, "export function logger() {}", "utf-8");

    try {
      const defaultMainId = createBundleModuleId(mainFile, srcRootPath, BUILD_MODULE_ID_MODE_PATH);
      const defaultLoggerId = createBundleModuleId(loggerFile, srcRootPath, BUILD_MODULE_ID_MODE_PATH);
      const anonymizedMainId = createBundleModuleId(mainFile, srcRootPath, BUILD_MODULE_ID_MODE_ANONYMIZED);
      const anonymizedLoggerId = createBundleModuleId(loggerFile, srcRootPath, BUILD_MODULE_ID_MODE_ANONYMIZED);

      assert.equal(defaultMainId, "app/main.js");
      assert.equal(defaultLoggerId, "core/logger.js");
      assert.equal(anonymizedMainId.startsWith("m_"), true);
      assert.equal(anonymizedLoggerId.startsWith("m_"), true);
      assert.equal(anonymizedMainId.includes("main.js"), false);
      assert.equal(anonymizedLoggerId.includes("logger.js"), false);
      assert.equal(anonymizedMainId === anonymizedLoggerId, false);
    } finally {
      fs.rmSync(srcRootPath, { recursive: true, force: true });
    }
  });

  it("should generate manifest with non-empty zotero update_url", () => {
    execFileSync("node", ["scripts/build.mjs"], {
      cwd: projectRoot,
      stdio: "pipe",
    });

    const config = readJSON(path.join(projectRoot, "config", "addon.config.json"));
    const manifest = readJSON(
      path.join(projectRoot, "build", config.addonRef, "manifest.json"),
    );

    assert.equal(
      manifest.applications.zotero.update_url,
      config.updateURL,
    );
    assert.ok(typeof manifest.applications.zotero.update_url === "string");
    assert.ok(manifest.applications.zotero.update_url.length > 0);

    const report = readJSON(
      path.join(projectRoot, "build", config.addonRef, "build-report.json"),
    );
    const reactUIBundle = Array.isArray(report.optionalBundles)
      ? report.optionalBundles.find((entry) => entry.bundleId === "react-ui")
      : null;

    assert.equal(reactUIBundle?.status, "skipped");
    assert.equal(reactUIBundle?.reason, "disabled");
    assert.equal(report.moduleIdMode, "path");
  });
});
