import { describe, it, assert } from "./test-framework.js";
import { createCopyFallbacks as createDefaultCopyFallbacks } from "../src/app/copy-fallbacks.js";
import { createCopyFallbacks as createProtectedCopyFallbacks } from "../src/app/copy-fallbacks-protected.js";

describe("Copy Fallbacks", () => {
  it("should keep readable default fallback copy for mainline builds", () => {
    const copy = createDefaultCopyFallbacks();
    assert.equal(copy.command.label, "Open Cleanroom Action");
    assert.equal(copy.reader.menuLabel, "Show Reader Demo Summary");
    assert.equal(copy.demo.statusReady, "Baseline demos ready");
    assert.equal(copy.react.surfaceTitle, "Optional React Host Surface");
  });

  it("should expose generic fallback copy for protected builds", () => {
    const copy = createProtectedCopyFallbacks();
    assert.equal(copy.command.label, "Open Tool");
    assert.equal(copy.reader.menuLabel, "Open Current View");
    assert.equal(copy.demo.statusReady, "Ready");
    assert.equal(copy.react.surfaceTitle, "Optional Host Panel");
  });
});
