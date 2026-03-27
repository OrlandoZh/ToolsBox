import { describe, it, assert } from "./test-framework.js";
import { buildWatchStatusMarkdown } from "../scripts/zotero-watch-report-lib.mjs";

describe("Zotero Watch Report Lib", () => {
  it("should render watch status markdown with latest issues and logs", () => {
    const markdown = buildWatchStatusMarkdown({
      generatedAt: "2026-03-19T12:00:00.000Z",
      sessionStartedAt: "2026-03-19T11:55:00.000Z",
      instanceKey: "CleanroomTemplate",
      startup: {
        index: 1,
        trigger: "startup",
        passed: true,
        changedFiles: [],
        logs: {
          errorCount: 0,
          warnCount: 0,
          recentErrors: [],
          recentWarnings: [],
        },
        issues: [],
        hints: [],
        summaryNote: "启动完成并通过健康检查",
      },
      reloads: [{
        index: 2,
        trigger: "watch-change",
        passed: false,
        changedFiles: ["src/main.js", "config/addon.config.json"],
        logs: {
          errorCount: 1,
          warnCount: 2,
          recentErrors: [
            {
              at: "2026-03-19T12:00:01.000Z",
              source: "console",
              message: "boom",
            },
          ],
          recentWarnings: [
            {
              at: "2026-03-19T12:00:02.000Z",
              source: "zotero.debug",
              message: "warn",
            },
          ],
        },
        issues: ["热重载失败：boom"],
        hints: ["查看状态报告"],
        summaryNote: "热重载流程失败",
        error: {
          message: "boom",
        },
      }],
    });

    assert.ok(markdown.includes("# Zotero Watch 状态"));
    assert.ok(markdown.includes("当前状态: `失败`"));
    assert.ok(markdown.includes("| 序号 | 触发方式 | 状态 |"));
    assert.ok(markdown.includes("热重载失败：boom"));
    assert.ok(markdown.includes("src/main.js, config/addon.config.json"));
    assert.ok(markdown.includes("## 最近错误日志"));
    assert.ok(markdown.includes("## 最近警告日志"));
  });

  it("should render failed startup notes without implying a passed health check", () => {
    const markdown = buildWatchStatusMarkdown({
      generatedAt: "2026-03-27T08:00:00.000Z",
      sessionStartedAt: "2026-03-27T07:59:30.000Z",
      instanceKey: "CleanroomTemplate",
      startup: {
        index: 1,
        trigger: "startup",
        passed: false,
        changedFiles: [],
        logs: {
          errorCount: 0,
          warnCount: 0,
          recentErrors: [],
          recentWarnings: [],
        },
        issues: ["偏好设置面板未注册。"],
        hints: ["等待下一轮健康窗口或检查 baseline 注册链。"],
        summaryNote: "启动完成，但基线注册未在健康窗口内收敛",
      },
      reloads: [],
    });

    assert.ok(markdown.includes("当前状态: `失败`"));
    assert.ok(markdown.includes("启动完成，但基线注册未在健康窗口内收敛"));
    assert.equal(markdown.includes("启动完成并通过健康检查"), false);
  });
});
