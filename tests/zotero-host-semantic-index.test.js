import fs from "node:fs";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";

const projectRoot = path.resolve(".");

describe("Zotero Host Semantic Index", () => {
  it("should keep governance goal and semantic domain references visible in the generated doc", () => {
    const docPath = path.join(projectRoot, "docs", "ZOTERO_HOST_SEMANTIC_INDEX.md");
    const source = fs.readFileSync(docPath, "utf-8");

    assert.ok(source.includes("Generated from `config/zotero-host-semantic-index.json`"));
    assert.ok(source.includes("在 clean-room 前提下冻结 Zotero 插件宿主的字段、枚举、事件与 host-visible surface 语义"));
    assert.ok(source.includes("menu-manager"));
    assert.ok(source.includes("preference-panes"));
    assert.ok(source.includes("reader-events"));
    assert.ok(source.includes("renderToolbar"));
    assert.ok(source.includes("annotation context menu"));
    assert.ok(source.includes("sidebarWidth"));
    assert.ok(source.includes("stacked 布局优先 inner pane bounds"));
  });
});
