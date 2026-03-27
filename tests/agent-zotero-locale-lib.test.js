import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  buildBaselineLocaleMainFTLSource,
  buildExpectedFTLLine,
  inspectBaselineItemPaneLocaleFiles,
  parseFTLMessages,
  resolveLocaleMainFTLPath,
} from "../scripts/agent-zotero-locale-lib.mjs";

describe("Agent Zotero Locale Lib", () => {
  it("should parse simple FTL message lines", () => {
    const messages = parseFTLMessages(`
# comment
cleanroom-dialog-body = Plugin command executed successfully.
cleanroom-item-pane-info-row-label = Cleanroom Summary
`);

    assert.equal(messages.get("cleanroom-dialog-body"), "Plugin command executed successfully.");
    assert.equal(messages.get("cleanroom-item-pane-info-row-label"), "Cleanroom Summary");
  });

  it("should inspect baseline item pane locale files and report missing keys", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-locale-"));
    fs.mkdirSync(path.join(tempRoot, "addon-static", "locale", "en-US"), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, "addon-static", "locale", "zh-CN"), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, "addon-static", "locale", "zh-TW"), { recursive: true });

    fs.writeFileSync(path.join(tempRoot, resolveLocaleMainFTLPath("en-US")), `cleanroom-dialog-body = Plugin command executed successfully.
cleanroom-item-pane-info-row-label = Cleanroom Summary
cleanroom-item-pane-section-header = Cleanroom Demo
cleanroom-item-pane-section-sidenav = Cleanroom Demo
`, "utf-8");
    fs.writeFileSync(path.join(tempRoot, resolveLocaleMainFTLPath("zh-CN")), `cleanroom-dialog-body = 插件命令执行成功。
cleanroom-item-pane-info-row-label = 模板摘要
cleanroom-item-pane-section-sidenav = 模板示例
`, "utf-8");
    fs.writeFileSync(path.join(tempRoot, resolveLocaleMainFTLPath("zh-TW")), `cleanroom-dialog-body = 外掛命令已成功執行。
cleanroom-item-pane-info-row-label = 範本摘要
cleanroom-item-pane-section-header = 範本示例
cleanroom-item-pane-section-sidenav = 範本示例
`, "utf-8");

    const result = await inspectBaselineItemPaneLocaleFiles(tempRoot);

    assert.equal(result.ok, false);
    assert.equal(result.missingCount, 1);
    assert.equal(result.missingEntries[0].locale, "zh-CN");
    assert.equal(result.missingEntries[0].key, "cleanroom-item-pane-section-header");
    assert.equal(
      result.missingEntries[0].expectedLine,
      buildExpectedFTLLine("zh-CN", "cleanroom-item-pane-section-header"),
    );

    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("should inspect baseline item pane locale files and report value drift", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-locale-drift-"));
    fs.mkdirSync(path.join(tempRoot, "addon-static", "locale", "en-US"), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, "addon-static", "locale", "zh-CN"), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, "addon-static", "locale", "zh-TW"), { recursive: true });

    fs.writeFileSync(path.join(tempRoot, resolveLocaleMainFTLPath("en-US")), `cleanroom-item-pane-info-row-label = Cleanroom Summary
cleanroom-item-pane-section-header = Cleanroom Demo
cleanroom-item-pane-section-sidenav = Cleanroom Demo
`, "utf-8");
    fs.writeFileSync(path.join(tempRoot, resolveLocaleMainFTLPath("zh-CN")), `cleanroom-item-pane-info-row-label = 模板摘要
cleanroom-item-pane-section-header = 模板示例-错误
cleanroom-item-pane-section-sidenav = 模板示例
`, "utf-8");
    fs.writeFileSync(path.join(tempRoot, resolveLocaleMainFTLPath("zh-TW")), `cleanroom-item-pane-info-row-label = 範本摘要
cleanroom-item-pane-section-header = 範本示例
cleanroom-item-pane-section-sidenav = 範本示例
`, "utf-8");

    const result = await inspectBaselineItemPaneLocaleFiles(tempRoot);

    assert.equal(result.ok, false);
    assert.equal(result.missingCount, 0);
    assert.equal(result.driftCount, 1);
    assert.equal(result.driftEntries[0].locale, "zh-CN");
    assert.equal(result.driftEntries[0].key, "cleanroom-item-pane-section-header");
    assert.equal(result.driftEntries[0].expectedValue, "模板示例");
    assert.equal(result.driftEntries[0].actualValue, "模板示例-错误");

    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("should build minimal baseline locale main ftl source", () => {
    const source = buildBaselineLocaleMainFTLSource("zh-CN");

    assert.equal(source.includes("cleanroom-menu-label = 打开模板动作"), true);
    assert.equal(source.includes("cleanroom-dialog-title = 模板插件"), true);
    assert.equal(source.includes("cleanroom-item-pane-section-header = 模板示例"), true);
    assert.equal(source.endsWith("\n"), true);
  });

  it("should report file-missing reason when locale main ftl is absent", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-locale-file-missing-"));
    fs.mkdirSync(path.join(tempRoot, "addon-static", "locale", "en-US"), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, "addon-static", "locale", "zh-CN"), { recursive: true });

    fs.writeFileSync(path.join(tempRoot, resolveLocaleMainFTLPath("en-US")), `cleanroom-item-pane-info-row-label = Cleanroom Summary
cleanroom-item-pane-section-header = Cleanroom Demo
cleanroom-item-pane-section-sidenav = Cleanroom Demo
`, "utf-8");
    fs.writeFileSync(path.join(tempRoot, resolveLocaleMainFTLPath("zh-CN")), `cleanroom-item-pane-info-row-label = 模板摘要
cleanroom-item-pane-section-header = 模板示例
cleanroom-item-pane-section-sidenav = 模板示例
`, "utf-8");

    const result = await inspectBaselineItemPaneLocaleFiles(tempRoot);

    assert.equal(result.ok, false);
    assert.equal(result.missingEntries.some((entry) => entry.locale === "zh-TW" && entry.reason === "file-missing"), true);

    fs.rmSync(tempRoot, { recursive: true, force: true });
  });
});
