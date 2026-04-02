import fs from "node:fs";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";

const projectRoot = path.resolve(".");

describe("Framework Backfill Bundles", () => {
  it("should keep governance goal and registry references visible in the generated doc", () => {
    const docPath = path.join(projectRoot, "docs", "FRAMEWORK_BACKFILL_BUNDLES.md");
    const source = fs.readFileSync(docPath, "utf-8");

    assert.ok(source.includes("Generated from `config/framework-backfill-bundles.json`"));
    assert.ok(source.includes("模板只治理可复用的 clean-room 宿主能力、验证链、门禁与升级护栏"));
    assert.ok(source.includes("AGENTS Rule Policy"));
    assert.ok(source.includes("下游项目可以对 AGENTS 规则做产品化表述"));
    assert.ok(source.includes("Bundle Admission Rules"));
    assert.ok(source.includes("workspace-init-guard-v1"));
    assert.ok(source.includes("validation-decision-v1"));
    assert.ok(source.includes("validation-decision-v2"));
    assert.ok(source.includes("expansion-wave-scaffold-v1"));
    assert.ok(source.includes("host-interface-contract-v1"));
    assert.ok(source.includes("host-semantic-index-v1"));
    assert.ok(source.includes("surface-verification-v1"));
    assert.ok(source.includes("Lifecycle: `active`"));
    assert.ok(source.includes("Lifecycle: `superseded`"));
    assert.ok(source.includes("Superseded By: `validation-decision-v2`"));
  });
});
