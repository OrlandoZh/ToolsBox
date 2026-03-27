import { describe, it, assert } from "./test-framework.js";
import {
  buildWatchHealthSummaryNote,
  hasWatchBaselineRegistrationIssues,
  isWatchBaselineSettled,
  waitForWatchBaselineSettled,
} from "../scripts/zotero-watch-health-lib.mjs";

describe("Zotero Watch Health Lib", () => {
  it("should recognize settled baseline registration counts", () => {
    assert.equal(isWatchBaselineSettled({
      preferencePaneRegistered: true,
      itemPaneSections: 1,
      itemPaneInfoRows: 1,
      itemTreeColumns: 1,
    }), true);

    assert.equal(isWatchBaselineSettled({
      preferencePaneRegistered: true,
      itemPaneSections: 1,
      itemPaneInfoRows: 0,
      itemTreeColumns: 1,
    }), false);
  });

  it("should settle within the bounded poll window when registrations recover", async () => {
    const snapshots = [
      {
        preferencePaneRegistered: false,
        itemPaneSections: 0,
        itemPaneInfoRows: 0,
        itemTreeColumns: 0,
      },
      {
        preferencePaneRegistered: true,
        itemPaneSections: 1,
        itemPaneInfoRows: 1,
        itemTreeColumns: 1,
      },
    ];
    let now = 0;
    const result = await waitForWatchBaselineSettled({
      readSnapshot: async () => snapshots.shift() || snapshots[snapshots.length - 1],
      timeoutMs: 500,
      pollIntervalMs: 100,
      now: () => now,
      sleepFn: async (ms) => {
        now += ms;
      },
    });

    assert.equal(result.settled, true);
    assert.equal(result.timedOut, false);
    assert.equal(result.attemptCount, 2);
    assert.equal(result.snapshot.preferencePaneRegistered, true);
  });

  it("should return timed-out when registrations never converge", async () => {
    let now = 0;
    const result = await waitForWatchBaselineSettled({
      readSnapshot: async () => ({
        preferencePaneRegistered: false,
        itemPaneSections: 0,
        itemPaneInfoRows: 0,
        itemTreeColumns: 0,
      }),
      timeoutMs: 250,
      pollIntervalMs: 100,
      now: () => now,
      sleepFn: async (ms) => {
        now += ms;
      },
    });

    assert.equal(result.settled, false);
    assert.equal(result.timedOut, true);
    assert.equal(result.snapshot.itemTreeColumns, 0);
  });

  it("should build truth-aligned failure notes for baseline registration misses", () => {
    assert.equal(
      buildWatchHealthSummaryNote({
        trigger: "startup",
        passed: false,
        baselineSettled: false,
        baselineRegistrationBlocking: true,
        successSummaryNote: "启动完成并通过健康检查",
      }),
      "启动完成，但基线注册未在健康窗口内收敛",
    );
    assert.equal(
      buildWatchHealthSummaryNote({
        trigger: "watch-change",
        passed: false,
        baselineSettled: true,
        baselineRegistrationBlocking: false,
        successSummaryNote: "热重载完成并通过健康检查",
      }),
      "热重载完成，但健康检查未通过",
    );
    assert.equal(
      buildWatchHealthSummaryNote({
        trigger: "startup",
        passed: true,
        baselineSettled: true,
        baselineRegistrationBlocking: false,
        successSummaryNote: "启动完成并通过健康检查",
      }),
      "启动完成并通过健康检查",
    );
  });

  it("should detect baseline registration issues from evaluation output", () => {
    assert.equal(hasWatchBaselineRegistrationIssues([
      "偏好设置面板未注册。",
      "其他问题。",
    ]), true);
    assert.equal(hasWatchBaselineRegistrationIssues([
      "Reader 摘要命令未注册。",
    ]), false);
  });
});
