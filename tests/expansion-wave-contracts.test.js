import fs from "node:fs";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";

const projectRoot = path.resolve(".");

describe("Expansion Wave Contracts", () => {
  it("should keep governance goal and archetype references visible in the generated doc", () => {
    const docPath = path.join(projectRoot, "docs", "EXPANSION_WAVE_CONTRACTS.md");
    const source = fs.readFileSync(docPath, "utf-8");

    assert.ok(source.includes("Generated from `config/expansion-wave-contracts.json`"));
    assert.ok(source.includes("next module expansion batch"));
    assert.ok(source.includes("runtime-capability"));
    assert.ok(source.includes("host-integration"));
    assert.ok(source.includes("visible-surface"));
    assert.ok(source.includes("workspace-integration"));
  });
});
