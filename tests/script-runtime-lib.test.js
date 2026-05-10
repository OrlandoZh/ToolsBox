import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import { writeJSONArtifact } from "../scripts/script-runtime-lib.mjs";

describe("Script Runtime Lib", () => {
  it("should sanitize JSON artifacts when normal serialization fails", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "script-runtime-json-"));
    const artifactPath = path.join(tempRoot, "artifact.json");
    const payload = {
      message: "x".repeat(25000),
    };
    payload.self = payload;

    try {
      await writeJSONArtifact(artifactPath, payload);
      const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));

      assert.equal(artifact.__artifactSerialization.sanitized, true);
      assert.ok(artifact.message.includes("[truncated"));
      assert.equal(artifact.self, "[Circular]");
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
