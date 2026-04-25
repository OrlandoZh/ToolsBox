registerZoteroScenario("agent review workbench window lifecycle", async ({ assert, addonConfig, helpers, plugin }) => {
  const commandID = "agent.reviewWorkbench.open";
  const windowHrefSuffix = "/content/lib/agent-review-workbench.xhtml";

  function listWorkbenchWindows() {
    const windows = typeof plugin?.api?.host?.listWindowsByType === "function"
      ? plugin.api.host.listWindowsByType(null)
      : [];
    return windows.filter((candidate) => {
      return String(candidate?.location?.href || "").includes(windowHrefSuffix);
    });
  }

  function getMountedWorkbenchWindow() {
    const candidate = listWorkbenchWindows().find(Boolean) || null;
    if (!candidate) {
      return null;
    }
    const root = candidate.document?.getElementById?.("review-workbench-root");
    const stepper = candidate.document?.getElementById?.("review-workbench-stepper");
    const annotations = candidate.document?.getElementById?.("review-workbench-annotations");
    if (!root || !stepper || !annotations) {
      return null;
    }
    return candidate;
  }

  const registeredCommands = typeof plugin?.api?.commandPalette?.getAllCommands === "function"
    ? plugin.api.commandPalette.getAllCommands()
    : [];
  const reviewWorkbenchCommand = registeredCommands.find((entry) => entry?.id === commandID) || null;
  assert.ok(reviewWorkbenchCommand, "expected review workbench command to be registered");

  const initialDiagnostics = plugin.api.agent.collectDiagnostics();
  assert.equal(initialDiagnostics.reviewWorkbenchEnabled, true);
  assert.equal(initialDiagnostics.reviewWorkbenchWindowOpen, false);

  const firstOpen = plugin.api.commandPalette.executeCommand(commandID);
  assert.equal(firstOpen, true);

  const firstMount = await helpers.waitFor(
    () => {
      const mounted = getMountedWorkbenchWindow();
      if (!mounted) {
        return null;
      }
      return {
        href: mounted.location?.href || null,
      };
    },
    {
      timeoutMs: 12000,
      intervalMs: 100,
      message: "Timed out waiting for the review workbench window to mount.",
    },
  );
  const firstWindow = getMountedWorkbenchWindow();
  assert.ok(firstWindow, "expected the mounted review workbench window to be retrievable after mount");

  const firstDiagnostics = plugin.api.agent.collectDiagnostics();
  assert.equal(firstDiagnostics.reviewWorkbenchWindowOpen, true);
  assert.equal(typeof firstMount.href, "string");
  assert.ok(firstMount.href.includes(`chrome://${addonConfig.addonRef}`));

  const created = await plugin.api.agent.reviewWorkbench.createAnnotation({
    stage: "scope",
    targetPath: "truthRef.activeBatchId",
    content: "scenario-lifecycle-smoke",
  });
  assert.ok(created.annotations.some((entry) => entry.content === "scenario-lifecycle-smoke"));
  const scenarioAnnotation = created.annotations.find((entry) => entry.content === "scenario-lifecycle-smoke");
  assert.ok(scenarioAnnotation, "expected scenario annotation to be persisted");

  const plan = await plugin.api.agent.reviewWorkbench.generatePlan({
    stage: "scope",
    annotationIds: [scenarioAnnotation.id],
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.plan?.kind, "deterministic-review-plan");
  assert.ok(Array.isArray(plan.plan?.actions));
  assert.ok(plan.plan.actions.some((entry) => entry.action === "draft-doc-update"));

  const secondOpen = plugin.api.commandPalette.executeCommand(commandID);
  assert.equal(secondOpen, true);

  const reuseState = await helpers.waitFor(
    () => {
      const mounted = getMountedWorkbenchWindow();
      if (!mounted) {
        return null;
      }
      const openWindows = listWorkbenchWindows();
      if (openWindows.length !== 1) {
        return null;
      }
      return {
        count: openWindows.length,
        href: mounted.location?.href || null,
      };
    },
    {
      timeoutMs: 8000,
      intervalMs: 100,
      message: "Timed out waiting for review workbench window reuse.",
    },
  );

  const reusedWindow = getMountedWorkbenchWindow();
  assert.ok(reusedWindow, "expected a mounted workbench window during reuse check");
  assert.equal(reuseState.count, 1);
  assert.equal(reusedWindow, firstWindow);

  firstWindow.close();

  await helpers.waitFor(
    () => {
      const diagnostics = plugin.api.agent.collectDiagnostics();
      return diagnostics.reviewWorkbenchWindowOpen ? null : diagnostics;
    },
    {
      timeoutMs: 8000,
      intervalMs: 100,
      message: "Timed out waiting for review workbench close cleanup.",
    },
  );

  assert.equal(listWorkbenchWindows().length, 0);

  const thirdOpen = plugin.api.commandPalette.executeCommand(commandID);
  assert.equal(thirdOpen, true);

  const reopenedMount = await helpers.waitFor(
    () => {
      const mounted = getMountedWorkbenchWindow();
      if (!mounted || mounted === firstWindow) {
        return null;
      }
      return {
        href: mounted.location?.href || null,
      };
    },
    {
      timeoutMs: 12000,
      intervalMs: 100,
      message: "Timed out waiting for the review workbench window to reopen.",
    },
  );
  const reopenedWindow = getMountedWorkbenchWindow();
  assert.ok(reopenedWindow, "expected a mounted workbench window after reopen");
  assert.ok(reopenedWindow !== firstWindow, "expected reopen to create a fresh workbench window instance");
  assert.equal(typeof reopenedMount.href, "string");

  const reopenedSnapshot = await plugin.api.agent.reviewWorkbench.getSnapshot();
  assert.ok(reopenedSnapshot.annotations.some((entry) => entry.content === "scenario-lifecycle-smoke"));

  reopenedWindow.close();
  await helpers.waitFor(
    () => plugin.api.agent.collectDiagnostics().reviewWorkbenchWindowOpen ? null : true,
    {
      timeoutMs: 8000,
      intervalMs: 100,
      message: "Timed out waiting for review workbench cleanup after the final close.",
    },
  );

  return {
    commandID,
    firstWindowHref: firstWindow.location?.href || null,
    reusedWindow: reusedWindow === firstWindow,
    annotationCount: reopenedSnapshot.annotations.length,
  };
});
