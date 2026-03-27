registerZoteroTest("plugin instance is mounted on Zotero", async ({ assert, Zotero, addonConfig }) => {
  const plugin = Zotero[addonConfig.instanceKey];
  assert.ok(plugin, `Expected Zotero[${addonConfig.instanceKey}] to exist`);
});

registerZoteroTest("runtime api exposes baseline helpers", async ({ assert, Zotero, addonConfig }) => {
  const plugin = Zotero[addonConfig.instanceKey];
  assert.ok(plugin.api, "Expected plugin.api to exist");
  assert.equal(typeof plugin.api.agent, "object");
  assert.equal(typeof plugin.api.agent.inspectItem, "function");
  assert.equal(typeof plugin.api.agent.describeReader, "function");
  assert.equal(typeof plugin.api.runPrimaryAction, "function");
  assert.equal(typeof plugin.api.runAgentAction, "function");
  assert.equal(typeof plugin.api.runAgentSelfCheck, "function");
  assert.equal(typeof plugin.api.runAgentScenario, "function");
  assert.equal(typeof plugin.api.getMainWindow, "function");
  assert.equal(typeof plugin.api.host, "object");
  assert.equal(typeof plugin.api.reader.getActiveReader, "function");
  assert.equal(plugin.api.itemPane.getSectionCount(), 1);
  assert.equal(plugin.api.itemPane.getInfoRowCount(), 1);
  assert.equal(plugin.api.itemTree.getColumnCount(), 1);
  assert.equal(plugin.api.notifier.getActiveCount(), 1);
});

registerZoteroTest("default demos register with native Zotero managers", async ({ assert, Zotero, addonConfig }) => {
  const plugin = Zotero[addonConfig.instanceKey];
  const sectionIDs = (Zotero.ItemPaneManager.customSectionData?.options || [])
    .map((option) => option.paneID);
  const rowIDs = (Zotero.ItemPaneManager.customInfoRowData?.options || [])
    .map((option) => option.rowID);
  const columnKeys = (typeof Zotero.ItemTreeManager.getCustomColumns === "function"
    ? Zotero.ItemTreeManager.getCustomColumns()
    : [])
    .map((option) => option.dataKey);

  assert.ok(
    sectionIDs.some((value) => String(value).includes(`${addonConfig.addonRef}-details`)),
    "Expected ItemPane section to be registered with Zotero.ItemPaneManager",
  );
  assert.ok(
    rowIDs.some((value) => String(value).includes(`${addonConfig.addonRef}-selection-summary`)),
    "Expected ItemPane info row to be registered with Zotero.ItemPaneManager",
  );
  assert.ok(
    columnKeys.length > 0,
    "Expected at least one custom ItemTree column to be registered with Zotero.ItemTreeManager",
  );
  assert.includes(plugin.api.menuManager.getRegisteredMenuIds(), `${addonConfig.addonRef}-reader-summary`);
});
