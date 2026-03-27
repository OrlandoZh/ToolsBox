import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  applyBuildInjection,
  readBuildInjectionMode,
} from "../scripts/build-injection-lib.mjs";

describe("Build Injection Lib", () => {
  it("should return none when no control file is configured", async () => {
    const result = await readBuildInjectionMode({});
    assert.equal(result.mode, "none");
    assert.equal(result.controlFile, null);
  });

  it("should read fail-once mode from control file", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-build-inject-"));
    const controlFile = path.join(tempDir, "inject.txt");
    try {
      fs.writeFileSync(controlFile, "fail-once\n", "utf-8");
      const result = await readBuildInjectionMode({
        ZOTERO_PLUGIN_BUILD_INJECT_FILE: controlFile,
      });
      assert.equal(result.mode, "fail-once");
      assert.equal(result.controlFile, controlFile);
    }
    finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should consume fail-once control file and throw", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-build-inject-"));
    const controlFile = path.join(tempDir, "inject.txt");
    try {
      fs.writeFileSync(controlFile, "fail-once\n", "utf-8");
      let error = null;
      try {
        await applyBuildInjection({
          ZOTERO_PLUGIN_BUILD_INJECT_FILE: controlFile,
        });
      }
      catch (thrown) {
        error = thrown;
      }
      assert.ok(error);
      assert.includes(error.message, "Injected build failure (fail-once)");
      assert.equal(fs.existsSync(controlFile), false);
    }
    finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should keep fail-always control file and throw", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-build-inject-"));
    const controlFile = path.join(tempDir, "inject.txt");
    try {
      fs.writeFileSync(controlFile, "fail-always\n", "utf-8");
      let error = null;
      try {
        await applyBuildInjection({
          ZOTERO_PLUGIN_BUILD_INJECT_FILE: controlFile,
        });
      }
      catch (thrown) {
        error = thrown;
      }
      assert.ok(error);
      assert.includes(error.message, "Injected build failure (fail-always)");
      assert.equal(fs.existsSync(controlFile), true);
    }
    finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
