import { describe, it, assert } from "./test-framework.js";
import {
  inspectCaptureBoundsAlignment,
  normalizeCaptureWindowBounds,
  rebaseCaptureWindowBounds,
  resolveStageRelativeSurfaceBounds,
  resolveCaptureWindowBounds,
  shouldCaptureSurfaceFromReferenceStage,
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

  it("should rebase a surface capture rect to the current window origin", () => {
    const rebased = rebaseCaptureWindowBounds(
      {
        x: 320,
        y: 180,
        width: 280,
        height: 160,
        source: "element",
      },
      {
        x: 100,
        y: 100,
        width: 1000,
        height: 600,
        title: "Original Window",
        source: "window",
      },
      {
        x: 460,
        y: 240,
        width: 1000,
        height: 600,
        title: "Current Window",
        source: "cg-window",
      },
    );

    assert.deepEqual(rebased, {
      x: 680,
      y: 320,
      width: 280,
      height: 160,
      title: "Current Window",
      source: "element",
    });
  });

  it("should reject capture rects that mostly fall outside the current window", () => {
    const aligned = inspectCaptureBoundsAlignment(
      {
        x: 540,
        y: 280,
        width: 320,
        height: 180,
      },
      {
        x: 500,
        y: 240,
        width: 1000,
        height: 600,
      },
    );
    const misaligned = inspectCaptureBoundsAlignment(
      {
        x: 1180,
        y: 760,
        width: 400,
        height: 240,
      },
      {
        x: 500,
        y: 240,
        width: 1000,
        height: 600,
      },
    );

    assert.equal(aligned.ok, true);
    assert.ok(aligned.captureOverlapRatio > 0.9);
    assert.equal(misaligned.ok, false);
    assert.ok(misaligned.captureOverlapRatio < 0.3);
  });

  it("should resolve a stage-relative element rect against the stable stage window", () => {
    const resolved = resolveStageRelativeSurfaceBounds(
      {
        rect: {
          x: 1349,
          y: 651,
          width: 696,
          height: 103,
          title: "My Library - Zotero",
          source: "element",
        },
        windowBounds: {
          x: 1141,
          y: 339,
          width: 927,
          height: 628,
          title: "My Library - Zotero",
          source: "window",
        },
      },
      {
        x: 1141,
        y: 339,
        width: 1000,
        height: 600,
        title: "My Library - Zotero",
        source: "rdp-draw-window",
      },
    );

    assert.deepEqual(resolved, {
      x: 1349,
      y: 651,
      width: 696,
      height: 103,
      title: "My Library - Zotero",
      source: "element",
    });
  });

  it("should rebuild edge-attached sidebar bounds against the stable stage window", () => {
    const resolved = resolveStageRelativeSurfaceBounds(
      {
        rect: {
          x: 1141,
          y: 339,
          width: 240,
          height: 628,
          title: "PDF.js viewer",
          source: "reader-ui-state-sidebarWidth+window-bounds",
        },
        windowBounds: {
          x: 1141,
          y: 339,
          width: 927,
          height: 628,
          title: "PDF.js viewer",
          source: "window",
        },
        details: {
          edgeMode: "sidebar-attached",
          minimumViableWidth: 240,
        },
      },
      {
        x: 1141,
        y: 339,
        width: 1000,
        height: 600,
        title: "Agent Visual Validation - Zotero",
        source: "rdp-draw-window",
      },
    );

    assert.deepEqual(resolved, {
      x: 1141,
      y: 339,
      width: 240,
      height: 600,
      title: "Agent Visual Validation - Zotero",
      source: "sidebar-edge+window-bounds",
    });
  });

  it("should keep stable library surfaces on the reference stage", () => {
    assert.equal(shouldCaptureSurfaceFromReferenceStage({
      captureKind: "surface-item-pane-cleanroomtemplate-details",
      details: {
        surfaceEvidenceElement: "pane-root",
      },
    }), true);
  });

  it("should prefer live capture for reader sidebar and menu popup surfaces", () => {
    assert.equal(shouldCaptureSurfaceFromReferenceStage({
      captureKind: "surface-reader-sidebar-thumbnails",
      details: {
        surfaceEvidenceElement: "sidebar-panel",
      },
    }), false);

    assert.equal(shouldCaptureSurfaceFromReferenceStage({
      captureKind: "surface-menu-reader-menubar-view-cleanroomtemplate-reader-summary",
      details: {
        surfaceEvidenceElement: "menu-popup",
      },
    }), false);
  });

  it("should synthesize pane-attached bounds from the stable stage window when only edge metadata is available", () => {
    const resolved = resolveStageRelativeSurfaceBounds(
      {
        details: {
          edgeMode: "pane-attached",
          minimumViableWidth: 240,
        },
      },
      {
        x: 1141,
        y: 339,
        width: 1000,
        height: 600,
        title: "My Library - Zotero",
        source: "rdp-draw-window",
      },
    );

    assert.deepEqual(resolved, {
      x: 1901,
      y: 339,
      width: 240,
      height: 600,
      title: "My Library - Zotero",
      source: "pane-edge+window-bounds",
    });
  });

  it("should fall back to the stable stage window when no rect metadata is available", () => {
    const resolved = resolveStageRelativeSurfaceBounds(
      {
        details: {},
      },
      {
        x: 1141,
        y: 339,
        width: 1000,
        height: 600,
        title: "PDF.js viewer",
        source: "rdp-draw-window",
      },
    );

    assert.deepEqual(resolved, {
      x: 1141,
      y: 339,
      width: 1000,
      height: 600,
      title: "PDF.js viewer",
      source: "rdp-draw-window",
    });
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
