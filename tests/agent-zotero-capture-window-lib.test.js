import { describe, it, assert } from "./test-framework.js";
import {
  normalizeCaptureWindowBounds,
  resolveCaptureWindowBounds,
} from "../scripts/agent-zotero-capture-window-lib.mjs";

describe("Agent Zotero Capture Window Lib", () => {
  it("should normalize valid capture window bounds", () => {
    const bounds = normalizeCaptureWindowBounds({
      x: "244",
      y: 30,
      width: "1000",
      height: 600,
      title: "My Library",
      source: "chrome-target",
    });

    assert.deepEqual(bounds, {
      x: 244,
      y: 30,
      width: 1000,
      height: 600,
      title: "My Library",
      source: "chrome-target",
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
});
