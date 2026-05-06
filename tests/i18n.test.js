import { describe, it, assert } from "./test-framework.js";
import { createI18n } from "../src/core/i18n.js";

describe("I18n", () => {
  it("should map Traditional Chinese locales to the zh-TW bundle", () => {
    const i18n = createI18n({
      locale: "zh-Hant-TW",
    });

    assert.equal(i18n.locale, "zh-TW");
    assert.equal(i18n.t("cleanroom-pref-enabled"), "啟用外掛");
    assert.equal(i18n.t("cleanroom-pref-theme-follow-host"), "跟隨 Zotero");
  });

  it("should keep Simplified Chinese strings for zh-CN locales", () => {
    const i18n = createI18n({
      locale: "zh-CN",
    });

    assert.equal(i18n.locale, "zh-CN");
    assert.equal(i18n.t("cleanroom-reader-selection-command-label"), "显示 Reader 选区快照");
    assert.equal(i18n.t("cleanroom-react-ui-demo-command-label"), "打开可选面板");
    assert.equal(i18n.t("cleanroom-react-ui-surface-status"), "已通过条目窗格 section 挂载");
  });

  it("should expose localized preference pane copy in English", () => {
    const i18n = createI18n({
      locale: "en-US",
    });

    assert.equal(i18n.t("cleanroom-pref-caption"), "ToolsBox Preferences");
    assert.equal(i18n.t("cleanroom-pref-theme-hint"), "Apply only to plugin-owned UI surfaces, including this preference pane, without changing Zotero's global Appearance.");
    assert.equal(i18n.t("cleanroom-react-ui-surface-title"), "Optional React Host Surface");
  });
});
