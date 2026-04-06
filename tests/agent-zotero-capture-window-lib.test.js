import { describe, it, assert } from "./test-framework.js";
import {
  normalizeCaptureWindowBounds,
  resolveCaptureWindowBounds,
} from "../scripts/agent-zotero-capture-window-lib.mjs";
import {
  isVisualStageSettleSnapshotReady,
  summarizeVisualStageSettleSnapshot,
  waitForVisualStageSettled,
} from "../scripts/agent-zotero-visual-settle-lib.mjs";

describe("Agent Zotero Capture Window Lib", () => {
  it("should normalize valid capture window bounds", () => {
    const bounds = normalizeCaptureWindowBounds({
      x: "244",
      y: 30,
      width: "1000",
      height: 600,
      title: "My Library",
      source: "chrome-target",
      windowNumber: "431",
    });

    assert.deepEqual(bounds, {
      x: 244,
      y: 30,
      width: 1000,
      height: 600,
      title: "My Library",
      source: "chrome-target",
      windowNumber: 431,
    });
  });

  it("should reject invalid capture window bounds", () => {
    assert.equal(normalizeCaptureWindowBounds(null), null);
    assert.equal(normalizeCaptureWindowBounds({}), null);
    assert.equal(normalizeCaptureWindowBounds({ x: 1, y: 2, width: 0, height: 3 }), null);
    assert.equal(normalizeCaptureWindowBounds({ x: 1, y: 2, width: 3, height: "bad" }), null);
  });

  it("should prefer the preferred capture window bounds when valid", async () => {
    const bounds = await resolveCaptureWindowBounds({
      preferred: async () => ({
        x: 244,
        y: 30,
        width: 1000,
        height: 600,
        source: "chrome-target",
      }),
      fallback: async () => ({
        x: 10,
        y: 10,
        width: 900,
        height: 500,
        source: "apple-window",
      }),
    });

    assert.equal(bounds.source, "chrome-target");
    assert.equal(bounds.width, 1000);
  });

  it("should fall back when the preferred capture window bounds are invalid", async () => {
    const bounds = await resolveCaptureWindowBounds({
      preferred: async () => ({
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        source: "chrome-target",
      }),
      fallback: async () => ({
        x: 244,
        y: 30,
        width: 1000,
        height: 600,
        source: "apple-window",
      }),
    });

    assert.equal(bounds.source, "apple-window");
    assert.equal(bounds.height, 600);
  });

  it("should fall back when the preferred capture bounds throw", async () => {
    const bounds = await resolveCaptureWindowBounds({
      preferred: async () => {
        throw new Error("chrome target missing");
      },
      fallback: async () => ({
        x: 244,
        y: 30,
        width: 1000,
        height: 600,
        source: "apple-window",
      }),
    });

    assert.equal(bounds.source, "apple-window");
  });

  it("should wait for stable library settle snapshots and reset on change", async () => {
    const snapshots = [
      {
        settleSnapshot: {
          stage: "library",
          itemID: 101,
          title: "Draft A",
          summary: "Draft A",
          selectedCount: 1,
          selectedIDs: [101],
        },
      },
      {
        settleSnapshot: {
          stage: "library",
          itemID: 101,
          title: "Draft B",
          summary: "Draft B",
          selectedCount: 1,
          selectedIDs: [101],
        },
      },
      {
        settleSnapshot: {
          stage: "library",
          itemID: 101,
          title: "Draft B",
          summary: "Draft B",
          selectedCount: 1,
          selectedIDs: [101],
        },
      },
      {
        settleSnapshot: {
          stage: "library",
          itemID: 101,
          title: "Draft B",
          summary: "Draft B",
          selectedCount: 1,
          selectedIDs: [101],
        },
      },
    ];
    let index = 0;

    const result = await waitForVisualStageSettled({
      stage: "library",
      stableSampleTarget: 2,
      maxPolls: 6,
      intervalMs: 0,
      sleep: async () => {},
      sample: async () => snapshots[index++] || snapshots[snapshots.length - 1],
      verify: async () => snapshots[index++] || snapshots[snapshots.length - 1],
    });

    assert.equal(result.settled, true);
    assert.equal(result.timedOut, false);
    assert.equal(result.resetCount, 1);
    assert.equal(result.pollCount, 4);
    assert.equal(result.consecutiveStableSamples, 2);
    assert.equal(result.verificationMatched, true);
    assert.ok(String(result.summary || "").includes("最终复核一致"));
  });

  it("should reset library settle when visible banner state changes", async () => {
    let index = 0;
    const snapshots = [
      {
        settleSnapshot: {
          stage: "library",
          itemID: 151,
          title: "Agent Visual Validation",
          summary: "book · #151 · Agent Visual Validation",
          selectedCount: 1,
          selectedIDs: [151],
          visibleBannerIDs: ["mac-word-plugin-install-container", "sync-reminder-container"],
        },
      },
      {
        settleSnapshot: {
          stage: "library",
          itemID: 151,
          title: "Agent Visual Validation",
          summary: "book · #151 · Agent Visual Validation",
          selectedCount: 1,
          selectedIDs: [151],
          visibleBannerIDs: ["mac-word-plugin-install-container"],
        },
      },
      {
        settleSnapshot: {
          stage: "library",
          itemID: 151,
          title: "Agent Visual Validation",
          summary: "book · #151 · Agent Visual Validation",
          selectedCount: 1,
          selectedIDs: [151],
          visibleBannerIDs: ["mac-word-plugin-install-container"],
        },
      },
      {
        settleSnapshot: {
          stage: "library",
          itemID: 151,
          title: "Agent Visual Validation",
          summary: "book · #151 · Agent Visual Validation",
          selectedCount: 1,
          selectedIDs: [151],
          visibleBannerIDs: ["mac-word-plugin-install-container"],
        },
      },
    ];

    const result = await waitForVisualStageSettled({
      stage: "library",
      stableSampleTarget: 2,
      maxPolls: 6,
      intervalMs: 0,
      sleep: async () => {},
      sample: async () => snapshots[index++] || snapshots[snapshots.length - 1],
      verify: async () => snapshots[index++] || snapshots[snapshots.length - 1],
    });

    assert.equal(result.settled, true);
    assert.equal(result.resetCount, 1);
    assert.deepEqual(result.snapshot?.visibleBannerIDs, [
      "mac-word-plugin-install-container",
    ]);
    assert.ok(String(result.snapshotSummary || "").includes("banners mac-word-plugin-install-container"));
  });

  it("should time out when reader settle snapshots keep changing", async () => {
    let index = 0;
    const snapshots = [
      { settleSnapshot: { stage: "reader", itemID: 201, tabID: "tab-1", annotationCount: 0, active: true, hasMatchingWindowState: true, sidebarView: "annotations" } },
      { settleSnapshot: { stage: "reader", itemID: 201, tabID: "tab-1", annotationCount: 1, active: true, hasMatchingWindowState: true, sidebarView: "annotations" } },
      { settleSnapshot: { stage: "reader", itemID: 201, tabID: "tab-2", annotationCount: 1, active: true, hasMatchingWindowState: true, sidebarView: "annotations" } },
      { settleSnapshot: { stage: "reader", itemID: 201, tabID: "tab-2", annotationCount: 2, active: true, hasMatchingWindowState: false, sidebarView: "outline" } },
    ];

    const result = await waitForVisualStageSettled({
      stage: "reader",
      stableSampleTarget: 3,
      maxPolls: 4,
      intervalMs: 0,
      sleep: async () => {},
      sample: async () => snapshots[index++] || snapshots[snapshots.length - 1],
    });

    assert.equal(result.settled, false);
    assert.equal(result.timedOut, true);
    assert.equal(result.pollCount, 4);
    assert.equal(result.resetCount, 3);
    assert.ok(String(result.snapshotSummary || "").includes("sidebar outline"));
    assert.ok(String(result.summary || "").includes("reader 超时"));
  });

  it("should treat reader snapshots without matching window state or selected-tab evidence as not ready", async () => {
    const result = await waitForVisualStageSettled({
      stage: "reader",
      stableSampleTarget: 2,
      maxPolls: 3,
      intervalMs: 0,
      sleep: async () => {},
      sample: async () => ({
        settleSnapshot: {
          stage: "reader",
          itemID: 401,
          tabID: "reader-tab",
          annotationCount: 0,
          active: true,
          selectedTabMatched: false,
          hasMatchingWindowState: false,
          sidebarView: "annotations",
        },
      }),
    });

    assert.equal(result.settled, false);
    assert.equal(result.timedOut, true);
    assert.equal(result.consecutiveStableSamples, 0);
    assert.ok(String(result.snapshotSummary || "").includes("selected false"));
    assert.ok(String(result.snapshotSummary || "").includes("window false"));
  });

  it("should settle reader snapshots when selected-tab evidence confirms the active reader", async () => {
    const result = await waitForVisualStageSettled({
      stage: "reader",
      stableSampleTarget: 2,
      maxPolls: 3,
      intervalMs: 0,
      sleep: async () => {},
      sample: async () => ({
        settleSnapshot: {
          stage: "reader",
          itemID: 402,
          tabID: "reader-tab",
          selectedTabID: "reader-tab",
          selectedTabMatched: true,
          annotationCount: 0,
          active: true,
          hasMatchingWindowState: false,
          sidebarView: "annotations",
        },
      }),
    });

    assert.equal(result.settled, true);
    assert.equal(result.timedOut, false);
    assert.equal(result.snapshot?.selectedTabMatched, true);
    assert.ok(String(result.snapshotSummary || "").includes("selected true"));
  });

  it("should mark ready reader settle snapshots when either matching window or selected-tab evidence is active", () => {
    assert.equal(isVisualStageSettleSnapshotReady({
      stage: "reader",
      itemID: 301,
      tabID: "reader-tab",
      active: true,
      hasMatchingWindowState: true,
    }), true);
    assert.equal(isVisualStageSettleSnapshotReady({
      stage: "reader",
      itemID: 301,
      tabID: "reader-tab",
      active: true,
      selectedTabMatched: true,
      hasMatchingWindowState: false,
    }), true);
    assert.equal(isVisualStageSettleSnapshotReady({
      stage: "reader",
      itemID: 301,
      tabID: "reader-tab",
      active: true,
      selectedTabMatched: false,
      hasMatchingWindowState: false,
    }), false);
  });

  it("should summarize reader settle snapshots tersely", () => {
    const summary = summarizeVisualStageSettleSnapshot({
      stage: "reader",
      itemID: 301,
      tabID: "reader-tab",
      annotationCount: 2,
      active: true,
      selectedTabMatched: true,
      hasMatchingWindowState: true,
      sidebarView: "annotations",
    });

    assert.ok(String(summary).includes("item#301"));
    assert.ok(String(summary).includes("tab reader-tab"));
    assert.ok(String(summary).includes("selected true"));
    assert.ok(String(summary).includes("sidebar annotations"));
  });
});
