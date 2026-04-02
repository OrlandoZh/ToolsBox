import fs from "node:fs";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";

const projectRoot = path.resolve(".");

describe("Validation Surfaces", () => {
  it("should keep the generated validation surface doc synchronized with the checked-in contract wording", () => {
    const source = fs.readFileSync(path.join(projectRoot, "docs", "VALIDATION_SURFACES.md"), "utf-8");

    assert.ok(source.includes("Generated from `config/validation-surfaces.json`"));
    assert.ok(source.includes("preference-pane"));
    assert.ok(source.includes("context-pane"));
    assert.ok(source.includes("annotation-context-menu"));
    assert.ok(source.includes("render-toolbar"));
    assert.ok(source.includes("menu-item"));
    assert.ok(source.includes("renderToolbar"));
    assert.ok(source.includes("menu item"));
    assert.ok(source.includes("createAnnotationContextMenu"));
    assert.ok(source.includes("Host Semantic Domains"));
    assert.ok(source.includes("preference-panes"));
    assert.ok(source.includes("reader-events"));
  });
});
