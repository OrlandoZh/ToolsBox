registerZoteroScenario("style editor local css workflow", async ({
  assert,
  addonConfig,
  helpers,
  plugin,
  Zotero,
  Services,
}) => {
  const commandID = `${addonConfig.addonRef}-style-editor`;
  const enabledPrefName = `${addonConfig.prefsPrefix}.styleEditor.enabled`;
  const cssPrefName = `${addonConfig.prefsPrefix}.styleEditor.css`;
  const styleEditorEnabled = Services.prefs.getBoolPref(enabledPrefName, false);
  const windowHrefSuffix = "/content/lib/style-editor.xhtml";
  const bridgeKey = `__${String(addonConfig.addonRef || "toolsbox").replace(/-/g, "_")}_WorkbenchBridge__`;

  function compactText(element, limit = 400) {
    return String(element?.textContent || "").replace(/\s+/g, " ").trim().slice(0, limit);
  }

  function listStyleEditorWindows() {
    const windows = typeof plugin?.api?.host?.listWindowsByType === "function"
      ? plugin.api.host.listWindowsByType(null)
      : [];
    return windows.filter((candidate) => {
      try {
        return String(candidate?.location?.href || "").includes(windowHrefSuffix);
      } catch {}
      return false;
    });
  }

  function listWindowHrefs() {
    const windows = typeof plugin?.api?.host?.listWindowsByType === "function"
      ? plugin.api.host.listWindowsByType(null)
      : [];
    return windows.map((candidate) => {
      try {
        return String(candidate?.location?.href || "");
      } catch {}
      return "unreadable";
    });
  }

  function getMountedStyleEditorWindow() {
    return listStyleEditorWindows().find((candidate) => {
      const bridge = candidate?.[bridgeKey];
      return candidate
        && !candidate.closed
        && typeof bridge?.getSnapshot === "function"
        && candidate.document?.getElementById?.("se-css");
    }) || null;
  }

  function dispatchValue(element, value, eventType = "input") {
    assert.ok(element, "Expected Style Editor control to exist");
    element.value = value;
    const EventCtor = element.ownerDocument?.defaultView?.Event || Event;
    element.dispatchEvent(new EventCtor(eventType, {
      bubbles: true,
      cancelable: true,
    }));
  }

  function getAttachmentIDs(item) {
    try {
      return (item?.getAttachments?.() || []).slice().sort((left, right) => left - right);
    } catch {}
    return [];
  }

  function getItemSnapshot(itemID) {
    const item = Zotero.Items.get(itemID);
    assert.ok(item, `Expected item #${itemID} to exist`);
    return {
      id: item.id,
      key: String(item.key || ""),
      title: String(item.getField?.("title") || ""),
      extra: String(item.getField?.("extra") || ""),
      attachmentIDs: getAttachmentIDs(item),
      noteIDs: typeof item.getNotes === "function" ? item.getNotes().slice().sort((left, right) => left - right) : [],
    };
  }

  async function openStyleEditorWindow(expectedCSS = null) {
    const commandSnapshot = typeof plugin.api.commandPalette.getCommandSnapshot === "function"
      ? plugin.api.commandPalette.getCommandSnapshot(commandID)
      : null;
    assert.equal(
      commandSnapshot?.enabled,
      true,
      `Expected Style Editor command to be enabled; snapshot=${JSON.stringify(commandSnapshot)}`,
    );
    const opened = plugin.api.commandPalette.executeCommand(commandID, {
      source: "scenario",
    });
    assert.equal(opened, true, `Expected ${commandID} command execution to succeed`);

    const win = await helpers.waitFor(
      () => {
        const candidate = getMountedStyleEditorWindow();
        const bridge = candidate?.[bridgeKey];
        const snapshot = bridge?.getSnapshot?.();
        if (!candidate || !snapshot) {
          return null;
        }
        if (expectedCSS !== null && snapshot.textareaValue !== expectedCSS) {
          return null;
        }
        return candidate;
      },
      {
        timeoutMs: 8000,
        intervalMs: 100,
        message: `Timed out waiting for command-opened Style Editor window; openWindows=${listStyleEditorWindows().length}; windowHrefs=${JSON.stringify(listWindowHrefs())}; commandSnapshot=${JSON.stringify(commandSnapshot)}`,
      },
    );
    helpers.addCleanup(() => {
      if (win && !win.closed && typeof win.close === "function") {
        win.close();
      }
    });
    return win;
  }

  const registeredCommands = typeof plugin?.api?.commandPalette?.getAllCommands === "function"
    ? plugin.api.commandPalette.getAllCommands()
    : [];
  const styleEditorCommand = registeredCommands.find((entry) => entry?.id === commandID) || null;

  if (!styleEditorEnabled) {
    assert.equal(styleEditorCommand, null, "Style Editor command should stay unregistered by default");
    return {
      mode: "default-off",
      enabledPrefName,
      commandID,
      styleEditorEnabled,
      commandRegistered: false,
    };
  }

  assert.ok(styleEditorCommand, "Expected Style Editor command to register when explicitly enabled");

  const probeItem = await helpers.createItem({
    itemType: "journalArticle",
    fields: {
      title: "Style Editor Local CSS Probe",
      extra: "Style Editor must not mutate item data",
    },
  });
  const beforeSnapshot = getItemSnapshot(probeItem.id);

  const win = await openStyleEditorWindow("");
  const doc = win.document;
  const bridge = win[bridgeKey];
  const textarea = doc.getElementById("se-css");
  const previewRoot = doc.getElementById("se-preview-root");
  assert.ok(textarea, "Expected Style Editor textarea");
  assert.ok(previewRoot, "Expected Style Editor preview root");

  const css = ".se-preview-title { color: rgb(12, 34, 56); }\nbody { background: rgb(1, 2, 3); }";
  dispatchValue(textarea, css);
  doc.getElementById("se-preview").click();
  await helpers.waitFor(
    () => {
      const snapshot = bridge.getSnapshot();
      return snapshot.previewApplied === true && snapshot.previewStyleText.includes("data-toolsbox-style-editor-scope")
        ? snapshot
        : null;
    },
    {
      timeoutMs: 5000,
      intervalMs: 100,
      message: `Timed out waiting for Style Editor preview; snapshot=${JSON.stringify(bridge.getSnapshot())}`,
    },
  );

  const previewStyles = Array.from(previewRoot.querySelectorAll('[data-toolsbox-style-editor-style="true"]'));
  assert.equal(previewStyles.length, 1, "Expected one owner-tagged preview style element");
  assert.ok(
    previewStyles[0].textContent.includes('[data-toolsbox-style-editor-scope="'),
    `Expected preview CSS to be scoped; style=${previewStyles[0].textContent}`,
  );
  assert.equal(
    Array.from(Zotero.getMainWindow().document.querySelectorAll('[data-toolsbox-style-editor-style="true"]')).length,
    0,
    "Style Editor CSS must not inject owner style into Zotero host document",
  );

  doc.getElementById("se-save").click();
  const savedCSS = Services.prefs.getStringPref(cssPrefName, "");
  assert.equal(
    savedCSS,
    css,
    `Expected Save to write styleEditor.css pref; snapshot=${JSON.stringify(bridge.getSnapshot())}`,
  );

  const winAgain = await openStyleEditorWindow(css);
  assert.equal(winAgain, win, "Expected repeat open to reuse the Style Editor window");

  doc.getElementById("se-reset").click();
  assert.equal(Services.prefs.getStringPref(cssPrefName, ""), "", "Expected Reset to clear styleEditor.css pref");
  assert.equal(bridge.getSnapshot().textareaValue, "", "Expected Reset to clear textarea state");

  const reopenedAfterReset = await openStyleEditorWindow("");
  assert.equal(reopenedAfterReset, win, "Expected repeat open after reset to reuse the same window");
  assert.equal(bridge.getSnapshot().textareaValue, "", "Expected repeat open after reset to avoid stale CSS state");
  assert.deepEqual(
    getItemSnapshot(probeItem.id),
    beforeSnapshot,
    "Expected Style Editor local CSS workflow to leave Zotero item/note/attachment data unchanged",
  );

  win.close();
  return {
    mode: "enabled-local-css-editor",
    enabledPrefName,
    cssPrefName,
    commandID,
    styleEditorEnabled,
    savedCSSLength: savedCSS.length,
    previewStyleText: compactText(previewStyles[0], 240),
  };
});
