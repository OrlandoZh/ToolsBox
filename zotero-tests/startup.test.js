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
  assert.ok(plugin.api.itemPane.getSectionCount() >= 0);
  assert.equal(plugin.api.itemPane.getInfoRowCount(), 0);
  assert.equal(plugin.api.itemTree.getColumnCount(), 0);
  assert.equal(plugin.api.notifier.getActiveCount(), 0);
});

registerZoteroTest("template starts without default demo surfaces", async ({ assert, Zotero, addonConfig }) => {
  const plugin = Zotero[addonConfig.instanceKey];
  const sectionIDs = (Zotero.ItemPaneManager.customSectionData?.options || [])
    .map((option) => option.paneID);
  const rowIDs = (Zotero.ItemPaneManager.customInfoRowData?.options || [])
    .map((option) => option.rowID);
  const columnKeys = (typeof Zotero.ItemTreeManager.getCustomColumns === "function"
    ? Zotero.ItemTreeManager.getCustomColumns()
    : [])
    .map((option) => option.dataKey);

  assert.equal(
    sectionIDs.some((value) => String(value).includes(`${addonConfig.addonRef}-details`)),
    false,
  );
  assert.equal(
    rowIDs.some((value) => String(value).includes(`${addonConfig.addonRef}-selection-summary`)),
    false,
  );
  assert.equal(
    columnKeys.some((value) => String(value).includes(`${addonConfig.addonRef}-status`)),
    false,
  );
  assert.equal(plugin.api.menuManager.getRegisteredMenuIds().includes(`${addonConfig.addonRef}-reader-summary`), false);
});
