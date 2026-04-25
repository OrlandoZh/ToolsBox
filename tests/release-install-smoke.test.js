import { describe, it, assert } from "./test-framework.js";
import { parseArgs } from "../scripts/release-install-smoke.mjs";

describe("Release Install Smoke", () => {
  it("should parse the default stable channel without keep-open", () => {
    const options = parseArgs([]);

    assert.equal(options.channel, "stable");
    assert.equal(options.keepOpen, false);
  });

  it("should accept --keep-open for Computer Use takeover", () => {
    const options = parseArgs(["--channel", "beta", "--keep-open"]);

    assert.equal(options.channel, "beta");
    assert.equal(options.keepOpen, true);
  });
});
