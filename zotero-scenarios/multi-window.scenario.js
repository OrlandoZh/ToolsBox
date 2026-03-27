registerZoteroScenario("multi-window mount diagnostics", async ({ assert, helpers, plugin }) => {
  const before = plugin.api.agent.runScenario("window-snapshot");
  const extraWindow = await helpers.openMainWindow();

  const after = await helpers.waitFor(
    () => {
      const snapshot = plugin.api.agent.runScenario("window-snapshot");
      const matchingWindow = snapshot.windows.find((item) => {
        if (!item || item.closed) {
          return false;
        }
        if (item.href && extraWindow?.location?.href) {
          return item.href === extraWindow.location.href;
        }
        return item.hasMenuItem && item.hasStyle;
      });

      if (!matchingWindow) {
        return null;
      }

      return {
        snapshot,
        matchingWindow,
      };
    },
    {
      timeoutMs: 8000,
      intervalMs: 100,
      message: "Timed out waiting for plugin mount on secondary Zotero main window",
    },
  );

  assert.ok(after.snapshot.mainWindowCount >= before.mainWindowCount + 1);
  assert.equal(after.matchingWindow.hasMenuItem, true);
  assert.equal(after.matchingWindow.hasStyle, true);

  return {
    beforeCount: before.mainWindowCount,
    afterCount: after.snapshot.mainWindowCount,
    matchingWindow: after.matchingWindow,
  };
});
