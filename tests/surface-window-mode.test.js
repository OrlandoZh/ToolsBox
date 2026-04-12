import { describe, it, assert } from "./test-framework.js";
import {
  SURFACE_WINDOW_MODE_DEFAULT,
  SURFACE_WINDOW_MODE_DOCKED,
  SURFACE_WINDOW_MODE_FLOATING,
  SURFACE_WINDOW_MODE_STANDALONE,
  normalizeDockableSurfaceWindowMode,
  normalizeEffectiveSurfaceWindowMode,
  normalizeSurfaceWindowMode,
  resolveSurfaceWindowModeDecision,
} from "../src/utils/surface-window-mode.js";

describe("Surface Window Mode", () => {
  it("should normalize preferred and effective window modes", () => {
    assert.equal(normalizeSurfaceWindowMode(" docked "), SURFACE_WINDOW_MODE_DOCKED);
    assert.equal(normalizeSurfaceWindowMode("unknown"), SURFACE_WINDOW_MODE_DEFAULT);
    assert.equal(normalizeEffectiveSurfaceWindowMode("floating"), SURFACE_WINDOW_MODE_FLOATING);
    assert.equal(normalizeEffectiveSurfaceWindowMode("standalone"), SURFACE_WINDOW_MODE_STANDALONE);
    assert.equal(normalizeEffectiveSurfaceWindowMode("default"), SURFACE_WINDOW_MODE_DOCKED);
    assert.equal(normalizeDockableSurfaceWindowMode("standalone"), SURFACE_WINDOW_MODE_DOCKED);
    assert.equal(normalizeDockableSurfaceWindowMode("floating"), SURFACE_WINDOW_MODE_FLOATING);
  });

  it("should prefer docked when default mode has a usable dock target", () => {
    const result = resolveSurfaceWindowModeDecision({
      preferredWindowMode: "default",
      dockedAvailable: true,
    });

    assert.deepEqual(result, {
      preferredWindowMode: SURFACE_WINDOW_MODE_DEFAULT,
      requestedWindowMode: SURFACE_WINDOW_MODE_DOCKED,
      effectiveWindowMode: SURFACE_WINDOW_MODE_DOCKED,
      surfaceKind: "docked-panel",
      windowModeSource: "default-docked",
      fallback: false,
      fallbackReason: null,
    });
  });

  it("should fall back from docked to floating with a stable reason", () => {
    const result = resolveSurfaceWindowModeDecision({
      preferredWindowMode: "docked",
      dockedAvailable: false,
      dockedFallbackReason: "host-sidebar-closed",
    });

    assert.deepEqual(result, {
      preferredWindowMode: SURFACE_WINDOW_MODE_DOCKED,
      requestedWindowMode: SURFACE_WINDOW_MODE_DOCKED,
      effectiveWindowMode: SURFACE_WINDOW_MODE_FLOATING,
      surfaceKind: "floating-panel",
      windowModeSource: "docked-fallback",
      fallback: true,
      fallbackReason: "host-sidebar-closed",
    });
  });

  it("should keep floating and standalone as explicit user choices", () => {
    const floating = resolveSurfaceWindowModeDecision({
      preferredWindowMode: "floating",
    });
    const standalone = resolveSurfaceWindowModeDecision({
      preferredWindowMode: "standalone",
    });

    assert.equal(floating.surfaceKind, "floating-panel");
    assert.equal(floating.windowModeSource, "preference");
    assert.equal(standalone.surfaceKind, "standalone-window");
    assert.equal(standalone.effectiveWindowMode, SURFACE_WINDOW_MODE_STANDALONE);
    assert.equal(standalone.fallback, false);
  });
});
