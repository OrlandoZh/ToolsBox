/**
 * 构建产物测试
 */
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

describe("Build Artifacts", () => {
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
  });
});
