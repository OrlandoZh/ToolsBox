import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  inspectStaticRuntimeBaselineFiles,
  resolveStaticRuntimeBaselineEntries,
} from "../scripts/static-runtime-baseline-lib.mjs";

describe("Agent Zotero Static Runtime Lib", () => {
  it("should keep icon baseline copies in sync with addon-static icons", () => {
    const icon48 = fs.readFileSync(path.resolve("addon-static", "content", "icons", "icon-48.png"));
    const icon48Baseline = fs.readFileSync(path.resolve("scripts", "baselines", "icons", "icon-48.png"));
    const icon96 = fs.readFileSync(path.resolve("addon-static", "content", "icons", "icon-96.png"));
    const icon96Baseline = fs.readFileSync(path.resolve("scripts", "baselines", "icons", "icon-96.png"));

    assert.deepEqual(icon48Baseline, icon48);
    assert.deepEqual(icon96Baseline, icon96);
  });

  it("should keep text baseline copies in sync with addon-static runtime resources", () => {
    const bootstrap = fs.readFileSync(path.resolve("addon-static", "bootstrap.js"), "utf-8");
    const bootstrapBaseline = fs.readFileSync(path.resolve("scripts", "baselines", "bootstrap.js.txt"), "utf-8");
    const preferences = fs.readFileSync(path.resolve("addon-static", "content", "preferences.xhtml"), "utf-8");
    const preferencesBaseline = fs.readFileSync(path.resolve("scripts", "baselines", "preferences.xhtml.txt"), "utf-8");
    const mainCSS = fs.readFileSync(path.resolve("addon-static", "content", "style", "main.css"), "utf-8");
    const mainCSSBaseline = fs.readFileSync(path.resolve("scripts", "baselines", "main.css.txt"), "utf-8");

    assert.equal(bootstrapBaseline, bootstrap);
    assert.equal(preferencesBaseline, preferences);
    assert.equal(mainCSSBaseline, mainCSS);
  });

  it("should resolve baseline static runtime entries with configured icons", () => {
    const entries = resolveStaticRuntimeBaselineEntries({
      icons: {
        48: "content/icons/icon-48.png",
        96: "content/icons/icon-96.png",
      },
    });

    const files = entries.map((entry) => entry.file);
    assert.ok(files.includes("addon-static/bootstrap.js"));
    assert.ok(files.includes("addon-static/content/preferences.xhtml"));
    assert.ok(files.includes("addon-static/content/style/main.css"));
    assert.ok(files.includes("addon-static/content/icons/icon-48.png"));
    assert.ok(files.includes("addon-static/content/icons/icon-96.png"));
  });

  it("should report missing static runtime baseline files with labels", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-static-runtime-"));

    try {
      fs.mkdirSync(path.join(tempRoot, "addon-static", "content", "style"), { recursive: true });
      fs.mkdirSync(path.join(tempRoot, "addon-static", "content", "icons"), { recursive: true });
      fs.writeFileSync(
        path.join(tempRoot, "addon-static", "content", "preferences.xhtml"),
        fs.readFileSync(path.resolve("addon-static", "content", "preferences.xhtml"), "utf-8"),
      );
      fs.writeFileSync(
        path.join(tempRoot, "addon-static", "content", "style", "main.css"),
        fs.readFileSync(path.resolve("addon-static", "content", "style", "main.css"), "utf-8"),
      );
      fs.writeFileSync(
        path.join(tempRoot, "addon-static", "content", "icons", "icon-48.png"),
        fs.readFileSync(path.resolve("addon-static", "content", "icons", "icon-48.png")),
      );

      const report = await inspectStaticRuntimeBaselineFiles(tempRoot, {
        icons: {
          48: "content/icons/icon-48.png",
        },
      });

      assert.equal(report.ok, false);
      assert.equal(report.missingCount, 1);
      assert.equal(report.missingEntries[0].file, "addon-static/bootstrap.js");
      assert.equal(report.missingEntries[0].label, "bootstrap 启动脚本");
      assert.equal(report.checkedFiles.includes("addon-static/content/icons/icon-48.png"), true);
      assert.equal(report.driftCount, 0);
      assert.equal(report.baselineOK, false);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("should report drifted static runtime baseline files without treating them as missing", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-static-runtime-drift-"));

    try {
      fs.mkdirSync(path.join(tempRoot, "addon-static", "content", "style"), { recursive: true });
      fs.mkdirSync(path.join(tempRoot, "addon-static", "content", "icons"), { recursive: true });
      fs.writeFileSync(path.join(tempRoot, "addon-static", "bootstrap.js"), "var bootstrapDrift = true;\n");
      fs.writeFileSync(path.join(tempRoot, "addon-static", "content", "preferences.xhtml"), fs.readFileSync(path.resolve("addon-static", "content", "preferences.xhtml"), "utf-8"));
      fs.writeFileSync(path.join(tempRoot, "addon-static", "content", "style", "main.css"), fs.readFileSync(path.resolve("addon-static", "content", "style", "main.css"), "utf-8"));
      fs.writeFileSync(
        path.join(tempRoot, "addon-static", "content", "icons", "icon-48.png"),
        fs.readFileSync(path.resolve("addon-static", "content", "icons", "icon-48.png")),
      );

      const report = await inspectStaticRuntimeBaselineFiles(tempRoot, {
        icons: {
          48: "content/icons/icon-48.png",
        },
      });

      assert.equal(report.ok, true);
      assert.equal(report.baselineOK, false);
      assert.equal(report.missingCount, 0);
      assert.equal(report.driftCount, 1);
      assert.equal(report.driftEntries[0].file, "addon-static/bootstrap.js");
      assert.equal(report.driftEntries[0].reason, "content-drift");
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
