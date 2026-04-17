import { describe, it, assert } from "./test-framework.js";
import { createI18n } from "../src/core/i18n-protected.js";

describe("Protected I18n", () => {
  it("should expose generic English copy for protected builds", () => {
    const i18n = createI18n({
      locale: "en-US",
    });

    assert.equal(i18n.t("cleanroom-command-label"), "Open Tool");
    assert.equal(i18n.t("cleanroom-reader-menu-label"), "Open Current View");
    assert.equal(i18n.t("cleanroom-react-ui-demo-command-label"), "Open Optional Panel");
    assert.equal(i18n.t("cleanroom-demo-status-ready"), "Ready");
    assert.equal(i18n.t("cleanroom-pref-caption"), "Tool Preferences");
  });

  it("should expose generic Simplified Chinese copy for protected builds", () => {
    const i18n = createI18n({
      locale: "zh-CN",
    });

    assert.equal(i18n.t("cleanroom-command-label"), "打开工具");
    assert.equal(i18n.t("cleanroom-reader-menu-label"), "打开当前视图");
    assert.equal(i18n.t("cleanroom-react-ui-surface-title"), "可选宿主面板");
    assert.equal(i18n.t("cleanroom-demo-notifier-idle"), "暂无最近事件。");
  });
});
