import { describe, it, assert } from "./test-framework.js";
import { createItemTree } from "../src/features/item-tree.js";

describe("ItemTree", () => {
  it("should resolve l10n column labels before calling Zotero", () => {
    const registered = [];
    const itemTree = createItemTree({
      pluginID: "toolsbox@example.com",
      logger: {
        debug() {},
        error() {},
      },
      i18n: {
        t(key, fallback) {
          return key === "cleanroom-column-status" ? "Status" : fallback;
        },
      },
      zotero: {
        ItemTreeManager: {
          registerColumn(options) {
            registered.push(options);
            return `${options.pluginID}-${options.dataKey}`;
          },
          unregisterColumn() {},
          refreshColumns() {},
        },
      },
    });

    const dataKey = itemTree.registerColumn({
      dataKey: "cleanroom-research-status",
      l10nID: "cleanroom-column-status",
      dataProvider: () => "reading",
    });

    assert.equal(dataKey, "toolsbox@example.com-cleanroom-research-status");
    assert.equal(registered.length, 1);
    assert.equal(registered[0].label, "Status");
    assert.equal("l10nID" in registered[0], false);
  });
});
