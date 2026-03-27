function createErrorPayload(error) {
  return {
    message: error && error.message ? String(error.message) : String(error),
    stack: error && error.stack ? String(error.stack) : "",
  };
}

function createAssert() {
  return {
    equal(actual, expected, message) {
      if (actual !== expected) {
        throw new Error(message || `Expected ${expected}, got ${actual}`);
      }
    },
    ok(value, message) {
      if (!value) {
        throw new Error(message || "Expected truthy value");
      }
    },
    notOk(value, message) {
      if (value) {
        throw new Error(message || "Expected falsy value");
      }
    },
    includes(haystack, needle, message) {
      const contains = typeof haystack === "string"
        ? haystack.includes(needle)
        : Array.isArray(haystack)
          ? haystack.includes(needle)
          : haystack && needle in haystack;
      if (!contains) {
        throw new Error(message || `Expected ${JSON.stringify(haystack)} to include ${JSON.stringify(needle)}`);
      }
    },
    deepEqual(actual, expected, message) {
      const actualText = JSON.stringify(actual);
      const expectedText = JSON.stringify(expected);
      if (actualText !== expectedText) {
        throw new Error(message || `Expected ${expectedText}, got ${actualText}`);
      }
    },
  };
}

function getPathUtils(ChromeUtils) {
  if (typeof PathUtils !== "undefined") {
    return PathUtils;
  }
  try {
    return ChromeUtils.importESModule("resource://gre/modules/PathUtils.sys.mjs").PathUtils;
  }
  catch {
    return null;
  }
}

function getIOUtils(ChromeUtils) {
  if (typeof IOUtils !== "undefined") {
    return IOUtils;
  }
  try {
    return ChromeUtils.importESModule("resource://gre/modules/IOUtils.sys.mjs").IOUtils;
  }
  catch {
    return null;
  }
}

function buildMinimalPDF(text) {
  const safeText = String(text || "Cleanroom Agent Validation")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
  const stream = `BT\n/F1 18 Tf\n36 96 Td\n(${safeText}) Tj\nET`;
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 320 160] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n",
    `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const objectText of objects) {
    offsets.push(pdf.length);
    pdf += objectText;
  }

  const xrefOffset = pdf.length;
  pdf += `xref
0 ${objects.length + 1}
0000000000 65535 f
`;

  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n
`;
  }

  pdf += `trailer
<< /Size ${objects.length + 1} /Root 1 0 R >>
startxref
${xrefOffset}
%%EOF
`;

  return new TextEncoder().encode(pdf);
}

function createScenarioHelpers(baseContext) {
  const { Zotero, Services, ChromeUtils, plugin } = baseContext;
  const cleanupTasks = [];
  const PathUtilsAPI = getPathUtils(ChromeUtils);
  const IOUtilsAPI = getIOUtils(ChromeUtils);

  function addCleanup(task) {
    if (typeof task === "function") {
      cleanupTasks.push(task);
    }
  }

  async function cleanup() {
    const errors = [];
    while (cleanupTasks.length > 0) {
      const task = cleanupTasks.pop();
      try {
        await task();
      }
      catch (error) {
        errors.push(error);
        try {
          if (typeof Zotero?.logError === "function") {
            Zotero.logError(error);
          }
        }
        catch {}
      }
    }

    if (errors.length > 0) {
      throw new Error(
        `Scenario cleanup failed: ${errors.map((error) => error?.message || String(error)).join("; ")}`,
      );
    }
  }

  function getMainWindow() {
    const window = typeof Zotero.getMainWindow === "function" ? Zotero.getMainWindow() : null;
    if (!window) {
      throw new Error("Unable to resolve Zotero main window");
    }
    return window;
  }

  function getZoteroPane() {
    const window = getMainWindow();
    if (!window.ZoteroPane) {
      throw new Error("Unable to resolve window.ZoteroPane");
    }
    return window.ZoteroPane;
  }

  function getSelectedItemIDs() {
    const pane = getZoteroPane();

    if (typeof pane.getSelectedItems === "function") {
      const ids = pane.getSelectedItems(true);
      if (Array.isArray(ids)) {
        return ids.filter((value) => typeof value === "number");
      }
      const items = pane.getSelectedItems();
      if (Array.isArray(items)) {
        return items
          .map((item) => item?.id)
          .filter((value) => typeof value === "number");
      }
    }

    const itemsView = pane.itemsView;
    if (itemsView && typeof itemsView.getSelectedItems === "function") {
      const ids = itemsView.getSelectedItems(true);
      if (Array.isArray(ids)) {
        return ids.filter((value) => typeof value === "number");
      }
    }

    return [];
  }

  async function wait(ms) {
    return await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitFor(condition, options = {}) {
    const timeoutMs = options.timeoutMs ?? 5000;
    const intervalMs = options.intervalMs ?? 50;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const result = await condition();
      if (result) {
        return result;
      }
      await wait(intervalMs);
    }

    throw new Error(options.message || "Timed out waiting for condition");
  }

  async function createItem(options = {}) {
    const item = new Zotero.Item(options.itemType || "book");
    const fields = {
      title: options.title || `Agent Scenario ${Date.now()}`,
      ...((options.fields && typeof options.fields === "object") ? options.fields : {}),
    };

    if (typeof options.libraryID === "number") {
      item.libraryID = options.libraryID;
    }

    if (typeof options.parentID === "number") {
      item.parentID = options.parentID;
    }

    for (const [field, value] of Object.entries(fields)) {
      if (value !== undefined && value !== null) {
        item.setField(field, String(value));
      }
    }

    if (Array.isArray(options.creators) && typeof item.setCreators === "function") {
      item.setCreators(options.creators);
    }

    if (Array.isArray(options.collections) && typeof item.setCollections === "function") {
      item.setCollections(options.collections);
    }

    if (Array.isArray(options.tags) && typeof item.addTag === "function") {
      for (const tag of options.tags) {
        item.addTag(String(tag));
      }
    }

    await item.saveTx();

    addCleanup(async () => {
      const currentItem = Zotero.Items.get(item.id);
      if (currentItem) {
        await currentItem.eraseTx();
      }
    });

    return item;
  }

  async function selectItem(itemID, options = {}) {
    const pane = getZoteroPane();
    const item = Zotero?.Items && typeof Zotero.Items.get === "function"
      ? Zotero.Items.get(itemID)
      : null;

    await waitFor(
      () => Boolean(pane.collectionsView && pane.itemsView),
      {
        timeoutMs: options.timeoutMs ?? 5000,
        intervalMs: options.intervalMs ?? 100,
        message: "Timed out waiting for ZoteroPane collections/items views to load",
      },
    );

    if (pane.collectionsView && typeof pane.collectionsView.selectLibrary === "function") {
      try {
        const libraryID = item?.libraryID ?? Zotero?.Libraries?.userLibraryID;
        await pane.collectionsView.selectLibrary(libraryID);
      }
      catch {}
    }

    if (pane.itemsView && typeof pane.itemsView.waitForLoad === "function") {
      await pane.itemsView.waitForLoad();
    }

    if (typeof pane.selectItem === "function") {
      await pane.selectItem(itemID);
    }
    else if (pane.itemsView && typeof pane.itemsView.selectItem === "function") {
      await pane.itemsView.selectItem(itemID);
    }
    else {
      throw new Error("Neither ZoteroPane.selectItem() nor itemsView.selectItem() is available");
    }

    await waitFor(
      () => getSelectedItemIDs().includes(itemID),
      {
        timeoutMs: options.timeoutMs ?? 5000,
        intervalMs: options.intervalMs ?? 100,
        message: `Timed out waiting for item #${itemID} to become selected`,
      },
    );

    return {
      itemID,
      selectedIDs: getSelectedItemIDs(),
    };
  }

  async function writeTempFile({ filename, blob, contents = "" }) {
    const tempDir = Services.dirsvc.get("TmpD", Components.interfaces.nsIFile).path;
    const filePath = PathUtilsAPI
      ? PathUtilsAPI.join(tempDir, filename)
      : `${tempDir}/${filename}`;

    if (blob !== undefined) {
      await Zotero.File.putContentsAsync(filePath, blob);
    }
    else {
      await Zotero.File.putContentsAsync(filePath, contents);
    }

    addCleanup(async () => {
      if (IOUtilsAPI) {
        await IOUtilsAPI.remove(filePath, { ignoreAbsent: true });
      }
    });

    return filePath;
  }

  async function createPDF(options = {}) {
    const filename = options.filename || `cleanroom-agent-${Date.now()}.pdf`;
    const text = options.text || "Cleanroom Agent Reader Validation";
    const pdfBytes = buildMinimalPDF(text);
    const filePath = await writeTempFile({
      filename,
      blob: new Blob([pdfBytes], { type: "application/pdf" }),
    });

    const attachment = await Zotero.Attachments.importFromFile({
      file: filePath,
      parentItemID: options.parentItemID,
      title: options.title || text,
      contentType: "application/pdf",
    });

    addCleanup(async () => {
      const currentItem = Zotero.Items.get(attachment.id);
      if (currentItem) {
        await currentItem.eraseTx();
      }
    });

    return attachment;
  }

  async function openReader(itemID, options = {}) {
    const reader = await plugin.api.reader.openReader({
      itemID,
      openInBackground: false,
      ...options,
    });

    if (!reader) {
      throw new Error(`Unable to open reader for item #${itemID}`);
    }

    if (reader._initPromise && typeof reader._initPromise.then === "function") {
      await reader._initPromise;
    }

    const primaryViewPromise = reader._internalReader?._primaryView?.initializedPromise;
    if (primaryViewPromise && typeof primaryViewPromise.then === "function") {
      await primaryViewPromise;
    }

    await waitFor(
      () => plugin.api.reader.getReaderSummary(itemID),
      {
        timeoutMs: options.timeoutMs ?? 8000,
        intervalMs: 100,
        message: `Timed out waiting for reader summary for item #${itemID}`,
      },
    );

    addCleanup(() => {
      plugin.api.reader.closeByItemID(itemID);
    });

    return reader;
  }

  function resolveReaderInstance(target) {
    if (target && typeof target === "object") {
      return target;
    }

    if (typeof target === "number" && plugin?.api?.reader?.getByItemID) {
      return plugin.api.reader.getByItemID(target);
    }

    if (typeof target === "string" && plugin?.api?.reader?.getByTabID) {
      return plugin.api.reader.getByTabID(target);
    }

    if (plugin?.api?.reader?.getActiveReader) {
      return plugin.api.reader.getActiveReader();
    }

    return null;
  }

  async function getReaderFrameWindow(target, options = {}) {
    const reader = resolveReaderInstance(target);
    if (!reader) {
      throw new Error("Unable to resolve reader instance for scenario probe");
    }

    const viewKey = options.view === "secondary" ? "_secondaryView" : "_primaryView";
    const frameWindow = await waitFor(
      () => reader._internalReader?.[viewKey]?._iframeWindow || reader._iframeWindow || null,
      {
        timeoutMs: options.timeoutMs ?? 5000,
        intervalMs: options.intervalMs ?? 50,
        message: `Timed out waiting for reader ${options.view === "secondary" ? "secondary" : "primary"} iframe window`,
      },
    );

    return {
      reader,
      frameWindow,
    };
  }

  function cloneIntoFrameWindow(frameWindow, value) {
    try {
      if (Components?.utils && typeof Components.utils.cloneInto === "function") {
        return Components.utils.cloneInto(value, frameWindow, {
          cloneFunctions: true,
          wrapReflectors: true,
        });
      }
    }
    catch {}

    return value;
  }

  function summarizeReaderAppendValue(value) {
    if (value && typeof value === "object" && value.nodeType === 1) {
      return {
        kind: "element",
        tagName: typeof value.tagName === "string" ? value.tagName.toLowerCase() : null,
        id: typeof value.getAttribute === "function" ? value.getAttribute("id") || null : null,
        className: typeof value.className === "string" && value.className.trim()
          ? value.className.trim()
          : null,
        textContent: typeof value.textContent === "string" && value.textContent.trim()
          ? value.textContent.trim().slice(0, 160)
          : null,
      };
    }

    if (value && typeof value === "object") {
      return {
        kind: Array.isArray(value.groups)
          ? "menu-submenu"
          : value.slider
            ? "menu-slider"
            : value.eraser
              ? "menu-toggle"
              : "menu-item",
        label: typeof value.label === "string" && value.label.trim() ? value.label.trim() : null,
        disabled: Boolean(value.disabled),
        persistent: Boolean(value.persistent),
        checked: Boolean(value.checked),
        color: typeof value.color === "string" && value.color.trim() ? value.color.trim() : null,
        hasCommand: typeof value.onCommand === "function",
        groupCount: Array.isArray(value.groups) ? value.groups.length : 0,
      };
    }

    return {
      kind: value === null ? "null" : typeof value,
      value: value === undefined || value === null ? null : String(value),
    };
  }

  async function dispatchReaderCustomEvent(target, options = {}) {
    const eventType = String(options.type || "").trim();
    if (!eventType) {
      throw new Error("dispatchReaderCustomEvent() requires a non-empty type");
    }

    const { reader, frameWindow } = await getReaderFrameWindow(target, options);
    const appendedGroups = [];
    const append = (...args) => {
      appendedGroups.push(args.map((value) => summarizeReaderAppendValue(value)));
    };
    const params = options.params && typeof options.params === "object"
      ? JSON.parse(JSON.stringify(options.params))
      : {};
    const detail = {
      type: eventType,
      params,
      append,
    };

    if (options.includeDoc !== false) {
      detail.doc = frameWindow.document;
    }

    const event = new frameWindow.CustomEvent("customEvent", {
      detail: cloneIntoFrameWindow(frameWindow, detail),
    });
    frameWindow.dispatchEvent(event);

    let dispatchMode = "customEvent";
    let syntheticFallback = null;
    if (
      appendedGroups.length === 0
      && plugin?.api?.reader
      && typeof plugin.api.reader.dispatchSyntheticEvent === "function"
    ) {
      syntheticFallback = plugin.api.reader.dispatchSyntheticEvent(reader, {
        type: eventType,
        params,
        append,
        includeDoc: options.includeDoc !== false,
        view: options.view,
      });
      if (Number(syntheticFallback?.dispatched || 0) > 0) {
        dispatchMode = "synthetic-fallback";
      }
    }

    return {
      type: eventType,
      itemID: Number.isFinite(reader?.itemID) ? reader.itemID : null,
      tabID: typeof reader?.tabID === "string" ? reader.tabID : null,
      dispatchMode,
      syntheticFallback,
      appendedGroups,
      appendedGroupCount: appendedGroups.length,
      appendedItemCount: appendedGroups.reduce((count, group) => count + group.length, 0),
    };
  }

  async function openMainWindow(options = {}) {
    const existingWindows = typeof plugin?.api?.host?.listMainWindows === "function"
      ? plugin.api.host.listMainWindows().filter(Boolean)
      : [];
    const existingSet = new Set(existingWindows);

    if (!Zotero || typeof Zotero.openMainWindow !== "function") {
      throw new Error("Zotero.openMainWindow() is not available");
    }

    const openedWindow = Zotero.openMainWindow();

    if (openedWindow && typeof openedWindow.addEventListener === "function") {
      await new Promise((resolve) => {
        let settled = false;
        const complete = () => {
          if (!settled) {
            settled = true;
            resolve();
          }
        };
        const onLoad = () => {
          try {
            openedWindow.removeEventListener("load", onLoad);
          }
          catch {}
          complete();
        };

        openedWindow.addEventListener("load", onLoad);
        if (openedWindow.document?.readyState === "complete") {
          try {
            openedWindow.removeEventListener("load", onLoad);
          }
          catch {}
          complete();
        }
      });
    }

    const trackedWindow = await waitFor(
      () => {
        const windows = typeof plugin?.api?.host?.listMainWindows === "function"
          ? plugin.api.host.listMainWindows().filter(Boolean)
          : [];
        return windows.find((candidate) => !existingSet.has(candidate)) || null;
      },
      {
        timeoutMs: options.timeoutMs ?? 8000,
        intervalMs: options.intervalMs ?? 100,
        message: "Timed out waiting for a secondary Zotero main window after openMainWindow()",
      },
    );

    addCleanup(() => {
      try {
        trackedWindow.close();
      }
      catch {}
    });

    return trackedWindow;
  }

  return {
    cleanup,
    helpers: {
      addCleanup,
      wait,
      waitFor,
      getMainWindow,
      getZoteroPane,
      getSelectedItemIDs,
      createItem,
      selectItem,
      writeTempFile,
      createPDF,
      openReader,
      getReaderFrameWindow,
      dispatchReaderCustomEvent,
      openMainWindow,
    },
  };
}

async function runScenarioCase(scenario, baseContext) {
  const startedAt = Date.now();
  const runtime = createScenarioHelpers(baseContext);
  const scenarioContext = {
    ...baseContext,
    helpers: runtime.helpers,
  };

  try {
    const details = await scenario.run(scenarioContext);
    await runtime.cleanup();
    return {
      name: scenario.name,
      status: "passed",
      durationMs: Date.now() - startedAt,
      details: details ?? null,
    };
  }
  catch (error) {
    try {
      await runtime.cleanup();
    }
    catch (cleanupError) {
      return {
        name: scenario.name,
        status: "failed",
        durationMs: Date.now() - startedAt,
        error: createErrorPayload(
          new Error(
            `${error?.message || error}; cleanup failed: ${cleanupError?.message || cleanupError}`,
          ),
        ),
      };
    }

    return {
      name: scenario.name,
      status: "failed",
      durationMs: Date.now() - startedAt,
      error: createErrorPayload(error),
    };
  }
}

this.runCleanroomZoteroScenarios = async function runCleanroomZoteroScenarios(options) {
  const scenarios = [];
  const registerZoteroScenario = function registerZoteroScenario(name, run) {
    if (typeof name !== "string" || !name) {
      throw new Error("registerZoteroScenario(name, run) requires a non-empty name");
    }
    if (typeof run !== "function") {
      throw new Error(`Scenario '${name}' must provide a function`);
    }
    scenarios.push({ name, run });
  };

  const scope = {
    Zotero,
    Services,
    ChromeUtils,
    console,
    addonConfig: options.addonConfig,
    registerZoteroScenario,
  };

  for (const fileHref of options.fileHrefs) {
    Services.scriptloader.loadSubScript(fileHref, scope);
  }

  const context = {
    assert: createAssert(),
    Zotero,
    Services,
    ChromeUtils,
    addonConfig: options.addonConfig,
    plugin: Zotero[options.addonConfig.instanceKey],
  };

  const results = [];
  for (const scenario of scenarios) {
    results.push(await runScenarioCase(scenario, context));
  }

  const summary = {
    total: results.length,
    passed: results.filter((result) => result.status === "passed").length,
    failed: results.filter((result) => result.status === "failed").length,
  };

  return JSON.stringify({
    summary,
    results,
  });
};
