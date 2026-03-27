registerZoteroScenario("settings schema and preference pane diagnostics", async ({ assert, plugin }) => {
  const snapshot = plugin.api.agent.runScenario("settings-snapshot");
  const definitions = plugin.api.settings.listDefinitions();
  const enabledDefinition = plugin.api.settings.getDefinition("enabled");
  const menuLabelDefinition = plugin.api.settings.getDefinition("menuLabel");
  const logLevelValidation = plugin.api.settings.validate("logLevel", "warn");

  assert.ok(definitions.length >= 3);
  assert.equal(snapshot.definitionCount, definitions.length);
  assert.equal(snapshot.preferencePaneCount, 1);
  assert.includes(snapshot.paneIDs, "cleanroomtemplate-preferences");
  assert.equal(enabledDefinition.group, "core");
  assert.equal(menuLabelDefinition.group, "ui");
  assert.equal(logLevelValidation.ok, true);

  return {
    definitionCount: definitions.length,
    paneIDs: snapshot.paneIDs,
    enabledDefinition,
    menuLabelDefinition,
    migrationSummary: snapshot.migrationSummary,
  };
});
