import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  buildBaselineLocaleMainFTLSource,
  buildFTLMessageBlock,
  buildExpectedFTLLine,
  buildExpectedMainFTLLine,
  inspectBaselineItemPaneLocaleFiles,
  inspectBaselineMainLocaleFiles,
  parseFTLMessages,
  resolveLocaleMainFTLPath,
} from "../scripts/agent-zotero-locale-lib.mjs";

describe("Agent Zotero Locale Lib", () => {
  it("should parse simple FTL message lines and attribute blocks", () => {
    const messages = parseFTLMessages(`
# comment
cleanroom-dialog-body = Plugin command executed successfully.
cleanroom-item-pane-info-row-label = Cleanroom Summary
cleanroom-item-pane-section-header =
    .label = Cleanroom Panel
cleanroom-item-pane-section-sidenav =
    .tooltiptext = Cleanroom Panel
`);

    assert.deepEqual(messages.get("cleanroom-dialog-body"), {
      value: "Plugin command executed successfully.",
      attributes: {},
    });
    assert.deepEqual(messages.get("cleanroom-item-pane-info-row-label"), {
      value: "Cleanroom Summary",
      attributes: {},
    });
    assert.deepEqual(messages.get("cleanroom-item-pane-section-header"), {
      value: null,
      attributes: {
        label: "Cleanroom Panel",
      },
    });
    assert.deepEqual(messages.get("cleanroom-item-pane-section-sidenav"), {
      value: null,
      attributes: {
        tooltiptext: "Cleanroom Panel",
      },
    });
  });

  it("should inspect baseline item pane locale files and report missing keys", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-locale-"));
    fs.mkdirSync(path.join(tempRoot, "addon-static", "locale", "en-US"), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, "addon-static", "locale", "zh-CN"), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, "addon-static", "locale", "zh-TW"), { recursive: true });

    fs.writeFileSync(path.join(tempRoot, resolveLocaleMainFTLPath("en-US")), `cleanroom-dialog-body = Plugin command executed successfully.
cleanroom-item-pane-info-row-label = Cleanroom Summary
cleanroom-item-pane-section-header =
    .label = Cleanroom Panel
cleanroom-item-pane-section-sidenav =
    .tooltiptext = Cleanroom Panel
`, "utf-8");
    fs.writeFileSync(path.join(tempRoot, resolveLocaleMainFTLPath("zh-CN")), `cleanroom-dialog-body = 插件命令执行成功。
cleanroom-item-pane-info-row-label = 模板摘要
cleanroom-item-pane-section-sidenav =
    .tooltiptext = 模板面板
`, "utf-8");
    fs.writeFileSync(path.join(tempRoot, resolveLocaleMainFTLPath("zh-TW")), `cleanroom-dialog-body = 外掛命令已成功執行。
cleanroom-item-pane-info-row-label = 範本摘要
cleanroom-item-pane-section-header =
    .label = 範本面板
cleanroom-item-pane-section-sidenav =
    .tooltiptext = 範本面板
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
cleanroom-item-pane-section-header =
    .label = Cleanroom Panel
cleanroom-item-pane-section-sidenav =
    .tooltiptext = Cleanroom Panel
`, "utf-8");
    fs.writeFileSync(path.join(tempRoot, resolveLocaleMainFTLPath("zh-CN")), `cleanroom-item-pane-info-row-label = 模板摘要
cleanroom-item-pane-section-header =
    .label = 模板面板-错误
cleanroom-item-pane-section-sidenav =
    .tooltiptext = 模板面板
`, "utf-8");
    fs.writeFileSync(path.join(tempRoot, resolveLocaleMainFTLPath("zh-TW")), `cleanroom-item-pane-info-row-label = 範本摘要
cleanroom-item-pane-section-header =
    .label = 範本面板
cleanroom-item-pane-section-sidenav =
    .tooltiptext = 範本面板
`, "utf-8");

    const result = await inspectBaselineItemPaneLocaleFiles(tempRoot);

    assert.equal(result.ok, false);
    assert.equal(result.missingCount, 0);
    assert.equal(result.valueDriftCount, 1);
    assert.equal(result.structureDriftCount, 0);
    assert.equal(result.valueDriftEntries[0].locale, "zh-CN");
    assert.equal(result.valueDriftEntries[0].key, "cleanroom-item-pane-section-header");
    assert.equal(result.valueDriftEntries[0].expectedValue, "模板面板");
    assert.equal(result.valueDriftEntries[0].actualValue, "模板面板-错误");
    assert.equal(
      result.valueDriftEntries[0].actualLine,
      "cleanroom-item-pane-section-header =\n    .label = 模板面板-错误",
    );

    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("should inspect baseline item pane locale files and report structure drift", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-locale-structure-"));
    fs.mkdirSync(path.join(tempRoot, "addon-static", "locale", "en-US"), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, "addon-static", "locale", "zh-CN"), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, "addon-static", "locale", "zh-TW"), { recursive: true });

    fs.writeFileSync(path.join(tempRoot, resolveLocaleMainFTLPath("en-US")), `cleanroom-item-pane-info-row-label = Cleanroom Summary
cleanroom-item-pane-section-header =
    .label = Cleanroom Panel
cleanroom-item-pane-section-sidenav =
    .tooltiptext = Cleanroom Panel
`, "utf-8");
    fs.writeFileSync(path.join(tempRoot, resolveLocaleMainFTLPath("zh-CN")), `cleanroom-item-pane-info-row-label = 模板摘要
cleanroom-item-pane-section-header = 模板面板
cleanroom-item-pane-section-sidenav =
    .tooltiptext = 模板面板
`, "utf-8");
    fs.writeFileSync(path.join(tempRoot, resolveLocaleMainFTLPath("zh-TW")), `cleanroom-item-pane-info-row-label = 範本摘要
cleanroom-item-pane-section-header =
    .label = 範本面板
cleanroom-item-pane-section-sidenav =
    .tooltiptext = 範本面板
`, "utf-8");

    const result = await inspectBaselineItemPaneLocaleFiles(tempRoot);

    assert.equal(result.ok, false);
    assert.equal(result.missingCount, 0);
    assert.equal(result.valueDriftCount, 0);
    assert.equal(result.structureDriftCount, 1);
    assert.equal(result.structureDriftEntries[0].locale, "zh-CN");
    assert.equal(result.structureDriftEntries[0].key, "cleanroom-item-pane-section-header");
    assert.equal(result.structureDriftEntries[0].reason, "direct-value-used");
    assert.equal(result.structureDriftEntries[0].expectedAttribute, "label");
    assert.deepEqual(result.structureDriftEntries[0].actualAttributes, []);
    assert.equal(result.structureDriftEntries[0].expectedLine, "cleanroom-item-pane-section-header =\n    .label = 模板面板");
    assert.equal(result.structureDriftEntries[0].actualLine, "cleanroom-item-pane-section-header = 模板面板");

    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("should build minimal baseline locale main ftl source", () => {
    const source = buildBaselineLocaleMainFTLSource("zh-CN");

    assert.equal(source.includes("cleanroom-menu-label = 打开 ToolsBox"), true);
    assert.equal(source.includes("cleanroom-reader-menu-label = 打开当前视图"), true);
    assert.equal(source.includes("cleanroom-dialog-title = ToolsBox"), true);
    assert.equal(source.includes("cleanroom-pref-theme-follow-host =\n    .label = 跟随 Zotero"), true);
    assert.equal(source.includes("cleanroom-item-pane-section-header =\n    .label = 模板面板"), true);
    assert.equal(source.includes("cleanroom-item-pane-section-sidenav =\n    .tooltiptext = 模板面板"), true);
    assert.equal(source.endsWith("\n"), true);
  });

  it("should build attribute-aware FTL blocks for item pane entries", () => {
    assert.equal(
      buildFTLMessageBlock("zh-CN", "cleanroom-item-pane-section-header"),
      "cleanroom-item-pane-section-header =\n    .label = 模板面板",
    );
    assert.equal(
      buildExpectedFTLLine("zh-TW", "cleanroom-item-pane-section-sidenav"),
      "cleanroom-item-pane-section-sidenav =\n    .tooltiptext = 範本面板",
    );
  });

  it("should inspect baseline main locale files and include preference pane plus reader menu keys", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-main-locale-"));
    fs.mkdirSync(path.join(tempRoot, "addon-static", "locale", "en-US"), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, "addon-static", "locale", "zh-CN"), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, "addon-static", "locale", "zh-TW"), { recursive: true });

    fs.writeFileSync(path.join(tempRoot, resolveLocaleMainFTLPath("en-US")), buildBaselineLocaleMainFTLSource("en-US"), "utf-8");
    fs.writeFileSync(path.join(tempRoot, resolveLocaleMainFTLPath("zh-CN")), `cleanroom-menu-label = 打开模板动作
cleanroom-reader-menu-label = 打开当前视图
cleanroom-dialog-title = 模板插件
cleanroom-dialog-body = 插件命令执行成功。
cleanroom-pref-enabled =
    .label = 启用插件
cleanroom-pref-menu-section =
    .label = 菜单
cleanroom-pref-menu-label =
    .value = 菜单标签
cleanroom-pref-menu-hint = 留空使用默认本地化文案。
cleanroom-pref-logging-section =
    .label = 日志
cleanroom-pref-log-level =
    .value = 日志等级
cleanroom-pref-theme-section =
    .label = 主题
cleanroom-pref-theme-mode =
    .value = 主题模式
cleanroom-pref-theme-follow-host =
    .label = 跟随 Zotero
cleanroom-pref-theme-light =
    .label = 浅色
cleanroom-pref-theme-dark =
    .label = 深色
cleanroom-pref-theme-hint = 仅作用于插件拥有的界面，包括当前偏好设置面板，不会改变 Zotero 的全局外观。
cleanroom-item-pane-info-row-label = 模板摘要
cleanroom-item-pane-section-header =
    .label = 模板面板
cleanroom-item-pane-section-sidenav =
    .tooltiptext = 模板面板
`, "utf-8");
    fs.writeFileSync(path.join(tempRoot, resolveLocaleMainFTLPath("zh-TW")), buildBaselineLocaleMainFTLSource("zh-TW"), "utf-8");

    const result = await inspectBaselineMainLocaleFiles(tempRoot);

    assert.equal(result.ok, false);
    assert.equal(result.missingEntries.some((entry) => entry.locale === "zh-CN" && entry.key === "cleanroom-pref-caption"), true);
    assert.equal(
      result.missingEntries.some((entry) => entry.expectedLine === buildExpectedMainFTLLine("zh-CN", "cleanroom-pref-caption")),
      true,
    );

    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("should report file-missing reason when locale main ftl is absent", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-locale-file-missing-"));
    fs.mkdirSync(path.join(tempRoot, "addon-static", "locale", "en-US"), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, "addon-static", "locale", "zh-CN"), { recursive: true });

    fs.writeFileSync(path.join(tempRoot, resolveLocaleMainFTLPath("en-US")), `cleanroom-item-pane-info-row-label = Cleanroom Summary
cleanroom-item-pane-section-header =
    .label = Cleanroom Panel
cleanroom-item-pane-section-sidenav =
    .tooltiptext = Cleanroom Panel
`, "utf-8");
    fs.writeFileSync(path.join(tempRoot, resolveLocaleMainFTLPath("zh-CN")), `cleanroom-item-pane-info-row-label = 模板摘要
cleanroom-item-pane-section-header =
    .label = 模板面板
cleanroom-item-pane-section-sidenav =
    .tooltiptext = 模板面板
`, "utf-8");

    const result = await inspectBaselineItemPaneLocaleFiles(tempRoot);

    assert.equal(result.ok, false);
    assert.equal(result.missingEntries.some((entry) => entry.locale === "zh-TW" && entry.reason === "file-missing"), true);

    fs.rmSync(tempRoot, { recursive: true, force: true });
  });
});
