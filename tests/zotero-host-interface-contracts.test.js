import fs from "node:fs";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";

const projectRoot = path.resolve(".");

describe("Zotero Host Interface Contracts", () => {
  it("should keep governance goal and contract references visible in the generated doc", () => {
    const docPath = path.join(projectRoot, "docs", "ZOTERO_HOST_INTERFACE_CONTRACTS.md");
    const source = fs.readFileSync(docPath, "utf-8");

    assert.ok(source.includes("Generated from `config/zotero-host-interface-contracts.json`"));
    assert.ok(source.includes("插件接口包装层的修改必须先对齐 Zotero 宿主源码"));
    assert.ok(source.includes("menu-manager"));
    assert.ok(source.includes("preference-panes"));
    assert.ok(source.includes("reader-events"));
  });
});
