import { describe, it, assert } from "./test-framework.js";
import { createFeatureComposer } from "../src/app/feature-composer.js";

function createDeps() {
  const calls = {
    panes: 0,
    commands: 0,
    columns: 0,
    rows: 0,
    sections: 0,
    notifier: 0,
    primary: 0,
    readerDemo: 0,
    updateNotifier: 0,
    reactUIDemo: 0,
  };
  const notifierHandlers = [];
  const paneRegistrations = [];
  const commandRegistrations = [];
  const selectionActions = [];
  const sectionRegistrations = [];
  const demoState = {
    shortcutLabel: "Ctrl+Shift+Y",
    shortcutTriggerCount: 0,
    lastNotifierEvent: "idle",
  };
  const demoSectionRefreshers = new Set();

  return {
    calls,
    notifierHandlers,
    deps: {
      config: {
        addonRef: "cleanroomtemplate",
        addonName: "Cleanroom",
        instanceKey: "CleanroomTemplate",
        icons: {
          "48": "content/icons/icon-48.png",
        },
      },
      logger: {
        info() {},
      },
      host: {
        resolveContentUrl(path) {
          return `chrome://cleanroomtemplate/${path}`;
        },
      },
      prefs: {
        get(key) {
          if (key === "enabled") {
            return true;
          }
          return null;
        },
      },
      i18n: {
        locale: "en-US",
        t(_key, _paramsOrFallback, fallbackMaybe) {
          if (typeof _paramsOrFallback === "string") {
            return _paramsOrFallback;
          }
          return fallbackMaybe || _key;
        },
        getBundle() {
          return {
            "cleanroom-pref-caption": "Cleanroom Template Preferences",
          };
        },
      },
      preferencePanes: {
        async registerPane(options) {
          calls.panes += 1;
          paneRegistrations.push(options);
        },
        getPaneCount() {
          return calls.panes;
        },
      },
      commandPalette: {
        registerCommand(options) {
          calls.commands += 1;
          commandRegistrations.push(options);
        },
        getCommandCount() {
          return calls.commands;
        },
      },
      readerSelectionActions: {
        registerAction(options) {
          selectionActions.push(options);
          return options.id || `reader-selection-action-${selectionActions.length}`;
        },
        getActionSnapshot(actionId) {
          const action = selectionActions.find((entry) => entry.id === actionId);
          return action
            ? {
              id: action.id,
              enabled: true,
            }
            : null;
        },
      },
      menuManager: {
        MENU_TARGETS: {
          READER_MENU_VIEW: "reader-view",
        },
        isOfficialAPIAvailable() {
          return false;
        },
        registerItemMenuItem() {},
        registerReaderMenubarViewMenuItem() {},
        getMenuCount() {
          return 0;
        },
      },
      reader: {
        getActiveSummary() {
          return null;
        },
      },
      itemTree: {
        createConditionalCellRenderer() {
          return () => {};
        },
        registerColumn() {
          calls.columns += 1;
        },
        getColumnCount() {
          return calls.columns;
        },
      },
      itemPane: {
        registerInfoRow() {
          calls.rows += 1;
        },
        registerSection(options) {
          calls.sections += 1;
          sectionRegistrations.push(options);
        },
        getInfoRowCount() {
          return calls.rows;
        },
        getSectionCount() {
          return calls.sections;
        },
      },
      notifier: {
        subscribe(types, handler) {
          calls.notifier += 1;
          notifierHandlers.push({ types, handler });
        },
        getActiveCount() {
          return calls.notifier;
        },
      },
      getPrimaryWindow() {
        return null;
      },
      runPrimaryAction() {
        calls.primary += 1;
      },
      runReaderDemo() {
        calls.readerDemo += 1;
      },
      runReaderSelectionActionDemo() {
        calls.readerSelectionDemo = (calls.readerSelectionDemo || 0) + 1;
      },
      optionalBundles: {
        isEnabled() {
          return false;
        },
      },
      openReactDemoWindow() {
        calls.reactUIDemo += 1;
        return {
          ready: true,
        };
      },
      presentReactSurface() {
        calls.reactSurfacePresent = (calls.reactSurfacePresent || 0) + 1;
      },
      renderReactItemPaneSurface() {
        calls.reactSurfaceRender = (calls.reactSurfaceRender || 0) + 1;
      },
      unmountReactItemPaneSurface() {
        calls.reactSurfaceUnmount = (calls.reactSurfaceUnmount || 0) + 1;
      },
      getColumnValue() {
        return "item · 0";
      },
      getItemSummary() {
        return "summary";
      },
      createSectionLine(_doc, _label, value) {
        return { value };
      },
      demoState,
      demoSectionRefreshers,
      demoInfoRowID: "demo-row",
      demoSectionID: "demo-section",
      demoColumnKey: "demo-column",
      demoNotifierID: "demo-notifier",
      updateDemoNotifierState() {
        calls.updateNotifier += 1;
      },
    },
    paneRegistrations,
    commandRegistrations,
    selectionActions,
    sectionRegistrations,
  };
}

function createFakeSectionRenderContext() {
  const doc = {
    createElement(tagName) {
      return {
        tagName: String(tagName || "").toUpperCase(),
        textContent: "",
        children: [],
        appendChild(child) {
          this.children.push(child);
          child.parentNode = this;
          return child;
        },
      };
    },
  };

  const body = {
    ownerDocument: doc,
    children: [],
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
      return child;
    },
    replaceChildren(...children) {
      this.children = children;
      children.forEach((child) => {
        if (child && typeof child === "object") {
          child.parentNode = this;
        }
      });
    },
  };

  return { doc, body };
}

describe("Feature Composer", () => {
  it("should register baseline features only once", async () => {
    const { deps, calls, paneRegistrations, commandRegistrations, selectionActions } = createDeps();
    const composer = createFeatureComposer(deps);

    await composer.registerBaselineFeatures();
    await composer.registerBaselineFeatures();

    assert.equal(calls.panes, 1);
    assert.equal(calls.commands, 3);
    assert.equal(calls.columns, 1);
    assert.equal(calls.rows, 1);
    assert.equal(calls.sections, 1);
    assert.equal(calls.notifier, 1);
    assert.equal(typeof paneRegistrations[0]?.onPreferenceLoad, "function");
    assert.equal(paneRegistrations[0]?.scripts, undefined);
    assert.deepEqual(paneRegistrations[0]?.stylesheets, ["content/preferences.css"]);
    assert.equal(selectionActions.length, 1);
    assert.equal(selectionActions[0].id, "cleanroomtemplate-reader-selection-snapshot");
    assert.equal(commandRegistrations[2].id, "cleanroomtemplate-reader-selection-snapshot");
    commandRegistrations[2].handler();
    assert.equal(calls.readerSelectionDemo, 1);
  });

  it("should initialize preference panes through onPreferenceLoad", async () => {
    const { deps, paneRegistrations } = createDeps();
    const composer = createFeatureComposer(deps);

    await composer.registerBaselineFeatures();

    const loadedScripts = [];
    const initCalls = [];
    const insertedFTL = [];
    const window = {
      MozXULElement: {
        insertFTLIfNeeded(resourceID) {
          insertedFTL.push(resourceID);
        },
      },
      Services: {
        scriptloader: {
          loadSubScript(uri, scope) {
            loadedScripts.push({ uri, scope });
            if (uri.endsWith("content/preferences.js")) {
              scope.initCleanroomPreferences = (options) => {
                initCalls.push(options);
                return {
                  ok: true,
                };
              };
            }
          },
        },
      },
    };

    await paneRegistrations[0].onPreferenceLoad({
      window,
      paneID: "cleanroomtemplate-preferences",
      pluginID: "cleanroom-template@example.com",
      resolveURI(uri) {
        return `chrome://cleanroomtemplate/${uri}`;
      },
    });

    assert.deepEqual(loadedScripts.map((entry) => entry.uri), [
      "chrome://cleanroomtemplate/content/theme.js",
      "chrome://cleanroomtemplate/content/preferences.js",
    ]);
    assert.deepEqual(insertedFTL, ["main.ftl"]);
    assert.equal(window.__CLEANROOM_PREFERENCE_BRIDGE__.addonRef, "cleanroomtemplate");
    assert.equal(window.__CLEANROOM_PREFERENCE_BRIDGE__.locale, "en-US");
    assert.equal(window.__CLEANROOM_PREFERENCE_BRIDGE__.instanceKey, "CleanroomTemplate");
    assert.deepEqual(window.__CLEANROOM_PREFERENCE_BRIDGE__.strings, {
      "cleanroom-pref-caption": "Cleanroom Template Preferences",
    });
    assert.deepEqual(initCalls, [
      {
        bridge: {
          addonRef: "cleanroomtemplate",
          locale: "en-US",
          pluginID: "cleanroom-template@example.com",
          instanceKey: "CleanroomTemplate",
          strings: {
            "cleanroom-pref-caption": "Cleanroom Template Preferences",
          },
        },
      },
    ]);
  });

  it("should pass notifier events to updater callback", async () => {
    const { deps, calls, notifierHandlers } = createDeps();
    const composer = createFeatureComposer(deps);
    await composer.registerBaselineFeatures();

    assert.equal(notifierHandlers.length, 1);
    notifierHandlers[0].handler("modify", "item", [101]);
    assert.equal(calls.updateNotifier, 1);
  });

  it("should use l10n ids for official menu registrations", async () => {
    const { deps } = createDeps();
    const contextMenus = [];
    const readerMenus = [];

    deps.menuManager = {
      MENU_TARGETS: {
        READER_MENU_VIEW: "reader-view",
      },
      isOfficialAPIAvailable() {
        return true;
      },
      registerItemMenuItem(menuItem) {
        contextMenus.push(menuItem);
      },
      registerReaderMenubarViewMenuItem(menuItem) {
        readerMenus.push(menuItem);
      },
      getMenuCount() {
        return contextMenus.length + readerMenus.length;
      },
    };

    const composer = createFeatureComposer(deps);
    await composer.registerBaselineFeatures();

    assert.equal(contextMenus.length, 1);
    assert.equal(readerMenus.length, 1);
    assert.equal(contextMenus[0].l10nID, "cleanroom-menu-label");
    assert.equal(contextMenus[0].label, undefined);
    assert.equal(readerMenus[0].l10nID, "cleanroom-reader-menu-label");
    assert.equal(readerMenus[0].label, undefined);
  });

  it("should register the optional react-ui command only when the bundle is enabled", async () => {
    const { deps, calls, commandRegistrations, sectionRegistrations } = createDeps();
    deps.optionalBundles = {
      isEnabled(bundleID) {
        return bundleID === "react-ui";
      },
    };

    const composer = createFeatureComposer(deps);
    await composer.registerBaselineFeatures();

    assert.equal(calls.commands, 4);
    assert.equal(commandRegistrations[3].id, "cleanroomtemplate-open-react-ui-demo");

    await commandRegistrations[3].handler();
    assert.equal(calls.reactUIDemo, 1);

    const { doc, body } = createFakeSectionRenderContext();
    sectionRegistrations[0].onRender({
      doc,
      body,
      item: {
        id: 77,
      },
      setSectionSummary() {},
    });
    assert.equal(body.children.length, 1);
    assert.equal(body.children[0].id, "demo-section-root");
    assert.equal(body.children[0].dataset.cleanroomItemPaneRoot, "true");
    assert.equal(body.children[0].dataset.cleanroomPaneID, "demo-section");
    assert.equal(calls.reactSurfacePresent, 1);
    assert.equal(calls.reactSurfaceRender || 0, 0);

    sectionRegistrations[0].onDestroy({ body });
    assert.equal(calls.reactSurfaceUnmount, 1);
  });
});
