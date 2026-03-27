import { describe, it, assert } from "./test-framework.js";
import {
  buildWatchRecoveryRegressionMarkdown,
  summarizeWatchRecoveryRegression,
} from "../scripts/zotero-watch-recovery-regression-lib.mjs";

describe("Zotero Watch Recovery Regression Lib", () => {
  it("should pass when full recovery sequence is observed", () => {
    const summary = summarizeWatchRecoveryRegression({
      sessionStartedAt: "2026-03-20T08:00:00.000Z",
      latestStatus: "healthy",
      startup: {
        passed: true,
      },
      latest: {
        trigger: "session-restart-recovery",
        passed: true,
        at: "2026-03-20T08:01:30.000Z",
      },
      reloads: [
        {
          trigger: "watch-change",
          passed: false,
          at: "2026-03-20T08:01:00.000Z",
          summaryNote: "构建失败",
        },
        {
          trigger: "runtime-recovery",
          passed: false,
          at: "2026-03-20T08:01:10.000Z",
          summaryNote: "runtime 恢复失败",
        },
        {
          trigger: "session-restart-recovery",
          passed: true,
          at: "2026-03-20T08:01:30.000Z",
          summaryNote: "会话重启恢复成功",
        },
      ],
    });

    assert.equal(summary.passed, true);
    assert.deepEqual(summary.observedTriggers, [
      "watch-change",
      "runtime-recovery",
      "session-restart-recovery",
    ]);
    assert.equal(summary.issues.length, 0);
  });

  it("should fail when session restart recovery is missing", () => {
    const summary = summarizeWatchRecoveryRegression({
      sessionStartedAt: "2026-03-20T08:00:00.000Z",
      latestStatus: "failed",
      startup: {
        passed: true,
      },
      latest: {
        trigger: "runtime-recovery",
        passed: false,
        at: "2026-03-20T08:01:10.000Z",
      },
      reloads: [
        {
          trigger: "watch-change",
          passed: false,
          at: "2026-03-20T08:01:00.000Z",
        },
        {
          trigger: "runtime-recovery",
          passed: false,
          at: "2026-03-20T08:01:10.000Z",
        },
      ],
    });

    assert.equal(summary.passed, false);
    assert.ok(summary.issues.some((issue) => issue.includes("session-restart-recovery")));
  });

  it("should render markdown summary", () => {
    const markdown = buildWatchRecoveryRegressionMarkdown({
      generatedAt: "2026-03-20T08:02:00.000Z",
      passed: true,
      sessionStartedAt: "2026-03-20T08:00:00.000Z",
      latestTrigger: "session-restart-recovery",
      latestPassed: true,
      latestStatus: "healthy",
      expectedTriggers: ["watch-change", "runtime-recovery", "session-restart-recovery"],
      observedTriggers: ["watch-change", "runtime-recovery", "session-restart-recovery"],
      entries: [
        {
          trigger: "watch-change",
          passed: false,
          at: "2026-03-20T08:01:00.000Z",
          summaryNote: "构建失败",
        },
      ],
      issues: [],
      summaryNote: "回归通过",
    });

    assert.ok(markdown.includes("# Zotero Watch 恢复回归报告"));
    assert.ok(markdown.includes("watch-change -> runtime-recovery -> session-restart-recovery"));
    assert.ok(markdown.includes("回归通过"));
  });
});
