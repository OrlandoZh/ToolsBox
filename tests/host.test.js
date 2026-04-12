/**
 * Zotero Host 测试
 */
import { describe, it, beforeEach, afterEach, assert } from "./test-framework.js";
import { createZoteroHost } from "../src/platform/zotero-host.js";

describe("ZoteroHost", () => {
  beforeEach(() => {
    delete globalThis.Services;
    delete globalThis.Zotero;
  });

  afterEach(() => {
    delete globalThis.Services;
    delete globalThis.Zotero;
  });

  it("should resolve content urls and prefer Zotero main window", () => {
    const mainWindow = {
      closed: false,
      document: {
        documentElement: {
          getAttribute() {
            return "zotero:main";
          },
        },
        getElementById() {
          return null;
        },
      },
    };

    globalThis.Zotero = {
      getMainWindow() {
        return mainWindow;
      },
      getMainWindows() {
        return [mainWindow];
      },
    };

    globalThis.Services = {
      wm: {
        getEnumerator() {
          return {
            hasMoreElements() {
              return false;
            },
          };
        },
      },
    };

    const host = createZoteroHost({
      globalScope: globalThis,
      rootURI: "chrome://cleanroomtemplate/",
    });

    assert.equal(
      host.resolveContentUrl("/content/preferences.xhtml"),
      "chrome://cleanroomtemplate/content/preferences.xhtml",
    );
    assert.equal(host.getMainWindow(), mainWindow);
    assert.equal(host.listMainWindows().length, 1);
  });

  it("should fall back to window.alert when Services.prompt is unavailable", () => {
    let capturedBody = null;
    const fallbackWindow = {
      alert(body) {
        capturedBody = body;
      },
      document: {
        documentElement: {
          getAttribute() {
            return "";
          },
        },
        getElementById(id) {
          if (id === "menu_ToolsPopup") {
            return {};
          }
          return null;
        },
      },
    };

    globalThis.Zotero = {
      getMainWindows() {
        return [];
      },
    };
    globalThis.Services = {};

    const host = createZoteroHost({
      globalScope: globalThis,
      rootURI: "",
    });

    host.showAlert(fallbackWindow, "Title", "Fallback body");
    assert.equal(capturedBody, "Fallback body");
  });

  it("should insert FTL resources when MozXULElement is available", () => {
    const inserted = [];
    const mainWindow = {
      MozXULElement: {
        insertFTLIfNeeded(resourceId) {
          inserted.push(resourceId);
        },
      },
      document: {
        documentElement: {
          getAttribute() {
            return "zotero:main";
          },
        },
        getElementById() {
          return null;
        },
      },
    };

    const host = createZoteroHost({
      globalScope: {
        Zotero: null,
        Services: null,
      },
      rootURI: "",
    });

    assert.equal(host.insertFTLIfNeeded(mainWindow, "main.ftl"), true);
    assert.deepEqual(inserted, ["main.ftl"]);
  });

  it("should derive preference pane surface snapshots from mounted pane fragments", async () => {
    const queryMap = new Map([
      ["groupbox", [{}, {}]],
      ["caption, label[class*='header'], .header, html\\:h1, html\\:h2, html\\:h3, h1, h2, h3", [{}]],
      ["description, html\\:p, p", [{}]],
      ["button, checkbox, input, select, textarea, radio, menulist, toolbarbutton", [{}, {}]],
      ["[preference]", [{}, {}]],
      ["preferences > preference", [{}, {}, {}]],
      ["html\\:link[rel='localization'], link[rel='localization'], linkset html\\:link[rel='localization'], linkset link[rel='localization']", [{}]],
      ["script, html\\:script", []],
      ["[onload]", []],
    ]);
    const paneElement = {
      localName: "vbox",
      namespaceURI: "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
      childElementCount: 3,
      children: [{}, {}, {}],
      matches() {
        return false;
      },
      querySelectorAll(selector) {
        return queryMap.get(selector) || [];
      },
    };
    const pane = {
      container: paneElement,
      scripts: [
        "chrome://cleanroomtemplate/content/preference-pane-load-bridge.js",
      ],
      stylesheets: ["chrome://cleanroomtemplate/content/preferences.css"],
    };
    const preferences = {
      navigation: {
        value: "cleanroomtemplate-preferences",
      },
      panes: {
        get(id) {
          return id === "cleanroomtemplate-preferences" ? pane : null;
        },
      },
      async waitForFirstPaneLoad() {},
      async navigateToPane() {},
      async waitForPaneSelect() {},
    };
    const preferenceWindow = {
      Zotero_Preferences: preferences,
      document: {
        getElementById() {
          return paneElement;
        },
      },
    };

    globalThis.Zotero = {
      Utilities: {
        Internal: {
          openPreferences() {
            return preferenceWindow;
          },
        },
      },
      getMainWindows() {
        return [];
      },
    };

    globalThis.Services = {
      wm: {
        getEnumerator() {
          return {
            hasMoreElements() {
              return false;
            },
          };
        },
      },
    };

    const host = createZoteroHost({
      globalScope: globalThis,
      rootURI: "chrome://cleanroomtemplate/",
    });

    const prepared = await host.preparePreferencePane({
      paneID: "cleanroomtemplate-preferences",
    });

    assert.equal(prepared.preferenceSurface.rootTagName, "vbox");
    assert.equal(prepared.preferenceSurface.childElementCount, 3);
    assert.equal(prepared.preferenceSurface.groupboxCount, 2);
    assert.equal(prepared.preferenceSurface.preferenceDefinitionCount, 3);
    assert.equal(prepared.preferenceSurface.registeredScriptCount, 1);
    assert.equal(prepared.preferenceSurface.registeredStylesheetCount, 1);
    assert.equal(prepared.preferenceSurface.hasLoadBridgeSignature, true);
    assert.equal(prepared.preferenceSurface.surfaceRootStrategy, "pane-container");
    assert.equal(prepared.preferenceSurface.layoutMode, "inline");
    assert.equal(prepared.preferenceSurface.hasHorizontalOverflow, false);
  });

  it("should detect interactive preference roots, active tabs, and active panels", async () => {
    const controlSelector = "button, checkbox, input, select, textarea, radio, menulist, toolbarbutton";
    const generalTab = {
      getAttribute(name) {
        return {
          role: "tab",
          "data-pref-tab": "general",
        }[name] || null;
      },
      matches(selector) {
        return selector === "[role='tab']" || selector === "[data-pref-tab]";
      },
    };
    const advancedTab = {
      getAttribute(name) {
        return {
          role: "tab",
          "data-pref-tab": "advanced",
          "aria-selected": "true",
          "aria-controls": "panel-advanced",
        }[name] || null;
      },
      matches(selector) {
        return selector === "[role='tab']" || selector === "[data-pref-tab]" || selector === "[aria-selected='true']";
      },
    };
    const generalPanel = {
      getAttribute(name) {
        return {
          role: "tabpanel",
          id: "panel-general",
          "data-pref-panel": "general",
          hidden: "true",
        }[name] || null;
      },
      matches(selector) {
        return selector === "[role='tabpanel']" || selector === "[data-pref-panel]";
      },
      querySelectorAll(selector) {
        return selector === controlSelector ? [{}] : [];
      },
    };
    const advancedPanel = {
      getAttribute(name) {
        return {
          role: "tabpanel",
          id: "panel-advanced",
          "data-pref-panel": "advanced",
        }[name] || null;
      },
      matches(selector) {
        return selector === "[role='tabpanel']" || selector === "[data-pref-panel]";
      },
      querySelectorAll(selector) {
        return selector === controlSelector ? [{}, {}] : [];
      },
    };
    const rootQueryMap = new Map([
      ["groupbox", []],
      ["caption, label[class*='header'], .header, html\\:h1, html\\:h2, html\\:h3, h1, h2, h3", [{}]],
      ["description, html\\:p, p", []],
      [controlSelector, []],
      ["[preference]", []],
      ["preferences > preference", []],
      ["html\\:link[rel='localization'], link[rel='localization'], linkset html\\:link[rel='localization'], linkset link[rel='localization']", []],
      ["script, html\\:script", []],
      ["[onload]", []],
      ["[data-pref-tab]", [generalTab, advancedTab]],
      ["[role='tab']", [generalTab, advancedTab]],
      ["[data-pref-panel]", [generalPanel, advancedPanel]],
      ["[role='tabpanel']", [generalPanel, advancedPanel]],
    ]);
    const interactiveRoot = {
      localName: "vbox",
      namespaceURI: "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
      childElementCount: 4,
      children: [generalTab, advancedTab, generalPanel, advancedPanel],
      clientWidth: 560,
      scrollWidth: 560,
      getAttribute(name) {
        return {
          id: "cleanroomtemplate-preferences-root",
          "data-pref-root": "true",
          "data-active-tab": "advanced",
          "data-pref-layout": "stacked",
          "data-pref-width-bucket": "compact",
          "data-pref-horizontal-overflow": "false",
          "data-pref-horizontal-overflow-px": "0",
        }[name] || null;
      },
      getBoundingClientRect() {
        return {
          left: 0,
          top: 0,
          width: 560,
          height: 320,
        };
      },
      matches(selector) {
        return selector === "[data-pref-root]";
      },
      querySelector() {
        return null;
      },
      querySelectorAll(selector) {
        return rootQueryMap.get(selector) || [];
      },
    };
    const paneElement = {
      localName: "vbox",
      namespaceURI: "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
      childElementCount: 1,
      children: [interactiveRoot],
      matches() {
        return false;
      },
      querySelector(selector) {
        return selector === "[data-pref-root]" || selector === "#cleanroomtemplate-preferences-root"
          ? interactiveRoot
          : null;
      },
      querySelectorAll(selector) {
        return selector === "[data-pref-root]" ? [interactiveRoot] : [];
      },
    };
    const pane = {
      id: "cleanroomtemplate-preferences",
      container: paneElement,
      scripts: [],
      stylesheets: [],
    };
    const preferences = {
      navigation: {
        value: "cleanroomtemplate-preferences",
      },
      panes: {
        get(id) {
          return id === "cleanroomtemplate-preferences" ? pane : null;
        },
      },
      async waitForFirstPaneLoad() {},
      async navigateToPane() {},
      async waitForPaneSelect() {},
    };
    const preferenceWindow = {
      Zotero_Preferences: preferences,
      document: {
        getElementById() {
          return paneElement;
        },
      },
    };

    globalThis.Zotero = {
      Utilities: {
        Internal: {
          openPreferences() {
            return preferenceWindow;
          },
        },
      },
      getMainWindows() {
        return [];
      },
    };

    globalThis.Services = {
      wm: {
        getEnumerator() {
          return {
            hasMoreElements() {
              return false;
            },
          };
        },
      },
    };

    const host = createZoteroHost({
      globalScope: globalThis,
      rootURI: "chrome://cleanroomtemplate/",
    });

    const prepared = await host.preparePreferencePane({
      paneID: "cleanroomtemplate-preferences",
    });

    assert.equal(prepared.preferenceSurface.hasInteractiveRoot, true);
    assert.equal(prepared.preferenceSurface.surfaceRootStrategy, "pane-root-id");
    assert.equal(prepared.preferenceSurface.surfaceRootID, "cleanroomtemplate-preferences-root");
    assert.equal(prepared.preferenceSurface.layoutMode, "stacked");
    assert.equal(prepared.preferenceSurface.widthBucket, "compact");
    assert.equal(prepared.preferenceSurface.rootClientWidth, 560);
    assert.equal(prepared.preferenceSurface.hasHorizontalOverflow, false);
    assert.equal(prepared.preferenceSurface.interactiveRootStrategy, "pane-root-id");
    assert.equal(prepared.preferenceSurface.interactiveRootID, "cleanroomtemplate-preferences-root");
    assert.equal(prepared.preferenceSurface.tabCount, 2);
    assert.equal(prepared.preferenceSurface.panelCount, 2);
    assert.equal(prepared.preferenceSurface.activeTabID, "advanced");
    assert.equal(prepared.preferenceSurface.activePanelID, "advanced");
    assert.equal(prepared.preferenceSurface.visiblePanelCount, 1);
    assert.equal(prepared.preferenceSurface.panelCoreControlCount, 2);
  });

  it("should not wait for an extra pane-select event when openPreferences already selected the pane", async () => {
    const paneElement = {
      localName: "vbox",
      namespaceURI: "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
      childElementCount: 1,
      children: [{}],
      matches() {
        return false;
      },
      querySelectorAll(selector) {
        if (typeof selector === "string" && selector.includes("button")) {
          return [{}];
        }
        return [];
      },
    };
    const pane = {
      id: "cleanroomtemplate-preferences",
      container: paneElement,
      scripts: [],
      stylesheets: [],
    };
    const preferences = {
      navigation: {
        value: "cleanroomtemplate-preferences",
      },
      panes: {
        get(id) {
          return id === "cleanroomtemplate-preferences" ? pane : null;
        },
      },
      async waitForFirstPaneLoad() {},
      async navigateToPane() {},
      async waitForPaneSelect() {
        throw new Error("waitForPaneSelect should not be called when the pane is already selected");
      },
    };
    const preferenceWindow = {
      Zotero_Preferences: preferences,
      document: {
        getElementById() {
          return paneElement;
        },
      },
    };

    globalThis.Zotero = {
      Utilities: {
        Internal: {
          openPreferences() {
            return preferenceWindow;
          },
        },
      },
      getMainWindows() {
        return [];
      },
    };

    globalThis.Services = {
      wm: {
        getEnumerator() {
          return {
            hasMoreElements() {
              return false;
            },
          };
        },
      },
    };

    const host = createZoteroHost({
      globalScope: globalThis,
      rootURI: "chrome://cleanroomtemplate/",
    });

    const prepared = await host.preparePreferencePane({
      paneID: "cleanroomtemplate-preferences",
    });

    assert.equal(prepared.selectedPaneID, "cleanroomtemplate-preferences");
    assert.equal(prepared.paneID, "cleanroomtemplate-preferences");
  });

  it("should wait for mounted preference pane content before returning", async () => {
    let mounted = false;
    setTimeout(() => {
      mounted = true;
    }, 0);

    const paneElement = {
      localName: "vbox",
      namespaceURI: "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
      get childElementCount() {
        return mounted ? 2 : 0;
      },
      get children() {
        return mounted ? [{}, {}] : [];
      },
      matches() {
        return false;
      },
      querySelector() {
        return null;
      },
      querySelectorAll(selector) {
        if (!mounted) {
          return [];
        }
        if (selector === "groupbox") {
          return [{}, {}];
        }
        if (selector === "preferences > preference") {
          return [{}, {}];
        }
        return [];
      },
    };
    const pane = {
      id: "cleanroomtemplate-preferences",
      container: paneElement,
      scripts: [],
      stylesheets: [],
    };
    const preferences = {
      navigation: {
        value: "cleanroomtemplate-preferences",
      },
      panes: {
        get(id) {
          return id === "cleanroomtemplate-preferences" ? pane : null;
        },
      },
      async waitForFirstPaneLoad() {},
      async navigateToPane() {},
      async waitForPaneSelect() {},
    };
    const preferenceWindow = {
      Zotero_Preferences: preferences,
      document: {
        getElementById() {
          return paneElement;
        },
      },
    };

    globalThis.Zotero = {
      Utilities: {
        Internal: {
          openPreferences() {
            return preferenceWindow;
          },
        },
      },
      getMainWindows() {
        return [];
      },
    };

    globalThis.Services = {
      wm: {
        getEnumerator() {
          return {
            hasMoreElements() {
              return false;
            },
          };
        },
      },
    };

    const host = createZoteroHost({
      globalScope: globalThis,
      rootURI: "chrome://cleanroomtemplate/",
    });

    const prepared = await host.preparePreferencePane({
      paneID: "cleanroomtemplate-preferences",
      timeoutMs: 1000,
    });

    assert.equal(prepared.selectedPaneID, "cleanroomtemplate-preferences");
    assert.equal(prepared.preferenceSurface.childElementCount, 2);
    assert.equal(prepared.preferenceSurface.groupboxCount, 2);
    assert.equal(prepared.preferenceSurface.preferenceDefinitionCount, 2);
  });

  it("should wait for preference pane structure and behavior signatures before returning", async () => {
    let ready = false;
    setTimeout(() => {
      ready = true;
    }, 0);

    const controlSelector = "button, checkbox, input, select, textarea, radio, menulist, toolbarbutton";
    const paneElement = {
      localName: "div",
      namespaceURI: "http://www.w3.org/1999/xhtml",
      childElementCount: 1,
      children: [{}],
      matches() {
        return false;
      },
      querySelector() {
        return null;
      },
      querySelectorAll(selector) {
        if (!ready) {
          return [];
        }
        if (selector === "groupbox") {
          return [{}];
        }
        if (selector === controlSelector) {
          return [{}];
        }
        if (selector === "preferences > preference") {
          return [{}];
        }
        return [];
      },
    };
    const pane = {
      id: "cleanroomtemplate-preferences",
      container: paneElement,
      get scripts() {
        return ready
          ? ["chrome://cleanroomtemplate/content/preference-pane-load-bridge.js"]
          : [];
      },
      get stylesheets() {
        return ready
          ? ["chrome://cleanroomtemplate/content/preferences.css"]
          : [];
      },
    };
    const preferences = {
      navigation: {
        value: "cleanroomtemplate-preferences",
      },
      panes: {
        get(id) {
          return id === "cleanroomtemplate-preferences" ? pane : null;
        },
      },
      async waitForFirstPaneLoad() {},
      async navigateToPane() {},
      async waitForPaneSelect() {},
    };
    const preferenceWindow = {
      Zotero_Preferences: preferences,
      document: {
        getElementById() {
          return paneElement;
        },
      },
    };

    globalThis.Zotero = {
      Utilities: {
        Internal: {
          openPreferences() {
            return preferenceWindow;
          },
        },
      },
      getMainWindows() {
        return [];
      },
    };

    globalThis.Services = {
      wm: {
        getEnumerator() {
          return {
            hasMoreElements() {
              return false;
            },
          };
        },
      },
    };

    const host = createZoteroHost({
      globalScope: globalThis,
      rootURI: "chrome://cleanroomtemplate/",
    });

    const prepared = await host.preparePreferencePane({
      paneID: "cleanroomtemplate-preferences",
      timeoutMs: 1000,
    });

    assert.equal(prepared.preferenceSurface.childElementCount, 1);
    assert.equal(prepared.preferenceSurface.groupboxCount, 1);
    assert.equal(prepared.preferenceSurface.coreControlCount, 1);
    assert.equal(prepared.preferenceSurface.preferenceDefinitionCount, 1);
    assert.equal(prepared.preferenceSurface.registeredScriptCount, 1);
    assert.equal(prepared.preferenceSurface.registeredStylesheetCount, 1);
    assert.equal(prepared.preferenceSurface.hasLoadBridgeSignature, true);
  });

  it("should settle preference surface geometry on the descendant content root before returning", async () => {
    let expanded = false;
    setTimeout(() => {
      expanded = true;
    }, 80);

    const controlSelector = "button, checkbox, input, select, textarea, radio, menulist, toolbarbutton";
    const surfaceRoot = {
      localName: "div",
      namespaceURI: "http://www.w3.org/1999/xhtml",
      childElementCount: 1,
      children: [{}],
      getAttribute(name) {
        return name === "class" ? "cleanroom-pref-root" : null;
      },
      matches(selector) {
        return selector === ".cleanroom-pref-root";
      },
      querySelector() {
        return null;
      },
      querySelectorAll(selector) {
        if (selector === "groupbox") {
          return [{}, {}, {}, {}];
        }
        if (selector === controlSelector) {
          return [{}, {}, {}];
        }
        if (selector === "preferences > preference") {
          return [{}, {}, {}, {}];
        }
        return [];
      },
      getBoundingClientRect() {
        return {
          left: 0,
          top: 0,
          width: 563,
          height: expanded ? 355 : 205,
        };
      },
    };
    const paneElement = {
      localName: "div",
      namespaceURI: "http://www.w3.org/1999/xhtml",
      childElementCount: 2,
      children: [
        {
          localName: "link",
          tagName: "link",
        },
        surfaceRoot,
      ],
      matches() {
        return false;
      },
      querySelector(selector) {
        return selector === ".cleanroom-pref-root" ? surfaceRoot : null;
      },
      querySelectorAll(selector) {
        if (selector === ".cleanroom-pref-root") {
          return [surfaceRoot];
        }
        return surfaceRoot.querySelectorAll(selector);
      },
    };
    const pane = {
      id: "cleanroomtemplate-preferences",
      container: paneElement,
      scripts: ["chrome://cleanroomtemplate/content/preference-pane-load-bridge.js"],
      stylesheets: ["chrome://cleanroomtemplate/content/preferences.css"],
    };
    const preferences = {
      navigation: {
        value: "cleanroomtemplate-preferences",
      },
      panes: {
        get(id) {
          return id === "cleanroomtemplate-preferences" ? pane : null;
        },
      },
      async waitForFirstPaneLoad() {},
      async navigateToPane() {},
      async waitForPaneSelect() {},
    };
    const preferenceWindow = {
      Zotero_Preferences: preferences,
      document: {
        getElementById() {
          return paneElement;
        },
      },
    };

    globalThis.Zotero = {
      Utilities: {
        Internal: {
          openPreferences() {
            return preferenceWindow;
          },
        },
      },
      getMainWindows() {
        return [];
      },
    };

    globalThis.Services = {
      wm: {
        getEnumerator() {
          return {
            hasMoreElements() {
              return false;
            },
          };
        },
      },
    };

    const host = createZoteroHost({
      globalScope: globalThis,
      rootURI: "chrome://cleanroomtemplate/",
    });

    const prepared = await host.preparePreferencePane({
      paneID: "cleanroomtemplate-preferences",
      timeoutMs: 1500,
    });

    assert.equal(prepared.surfaceElement, surfaceRoot);
    assert.equal(prepared.surfaceElementStrategy, "descendant-root-class");
    assert.equal(prepared.surfaceGeometrySettle?.stable, true);
    assert.equal(prepared.surfaceGeometrySettle?.geometry?.height, 355);
    assert.equal(prepared.preferenceSurface.surfaceRootStrategy, "descendant-root-class");
    assert.equal(prepared.preferenceSurface.rootClientWidth, 563);
    assert.equal(prepared.preferenceSurface.hasHorizontalOverflow, false);
  });

  it("should treat stable preference pane size as settled even when the window focus path nudges the root position", async () => {
    let left = 0;
    setTimeout(() => {
      left = 3;
    }, 40);

    const paneElement = {
      localName: "vbox",
      namespaceURI: "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
      childElementCount: 1,
      children: [{}],
      clientWidth: 563,
      scrollWidth: 563,
      getAttribute(name) {
        return name === "id" ? "cleanroomtemplate-preferences-root" : null;
      },
      getBoundingClientRect() {
        return {
          left,
          top: 0,
          width: 563,
          height: 355,
        };
      },
      matches() {
        return false;
      },
      querySelector() {
        return null;
      },
      querySelectorAll(selector) {
        if (typeof selector === "string" && selector.includes("button")) {
          return [{}];
        }
        return [];
      },
    };
    const pane = {
      id: "cleanroomtemplate-preferences",
      container: paneElement,
      scripts: ["chrome://cleanroomtemplate/content/preference-pane-load-bridge.js"],
      stylesheets: ["chrome://cleanroomtemplate/content/preferences.css"],
    };
    const preferences = {
      navigation: {
        value: "cleanroomtemplate-preferences",
      },
      panes: {
        get(id) {
          return id === "cleanroomtemplate-preferences" ? pane : null;
        },
      },
      async waitForFirstPaneLoad() {},
      async navigateToPane() {},
      async waitForPaneSelect() {},
    };
    const preferenceWindow = {
      Zotero_Preferences: preferences,
      document: {
        getElementById() {
          return paneElement;
        },
      },
    };

    globalThis.Zotero = {
      Utilities: {
        Internal: {
          openPreferences() {
            return preferenceWindow;
          },
        },
      },
      getMainWindows() {
        return [];
      },
    };

    globalThis.Services = {
      wm: {
        getEnumerator() {
          return {
            hasMoreElements() {
              return false;
            },
          };
        },
      },
    };

    const host = createZoteroHost({
      globalScope: globalThis,
      rootURI: "chrome://cleanroomtemplate/",
    });

    const prepared = await host.preparePreferencePane({
      paneID: "cleanroomtemplate-preferences",
      timeoutMs: 1500,
    });

    assert.equal(prepared.surfaceGeometrySettle?.stable, true);
    assert.equal(prepared.surfaceGeometrySettle?.timedOut, false);
    assert.equal(prepared.surfaceGeometrySettle?.geometry?.width, 563);
    assert.equal(prepared.surfaceGeometrySettle?.geometry?.height, 355);
  });

  it("should treat stacked preference pane geometry as settled when width stays stable but height keeps growing", async () => {
    let height = 205;
    setTimeout(() => {
      height = 280;
    }, 80);
    setTimeout(() => {
      height = 330;
    }, 180);
    setTimeout(() => {
      height = 355;
    }, 280);

    const paneElement = {
      localName: "vbox",
      namespaceURI: "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
      childElementCount: 1,
      children: [{}],
      clientWidth: 563,
      scrollWidth: 563,
      dataset: {
        prefLayout: "stacked",
        prefWidthBucket: "compact",
      },
      getAttribute(name) {
        return name === "id" ? "cleanroomtemplate-preferences-root" : null;
      },
      getBoundingClientRect() {
        return {
          left: 0,
          top: 0,
          width: 563,
          height,
        };
      },
      matches() {
        return false;
      },
      querySelector() {
        return null;
      },
      querySelectorAll(selector) {
        if (typeof selector === "string" && selector.includes("button")) {
          return [{}];
        }
        return [];
      },
    };
    const pane = {
      id: "cleanroomtemplate-preferences",
      container: paneElement,
      scripts: ["chrome://cleanroomtemplate/content/preference-pane-load-bridge.js"],
      stylesheets: ["chrome://cleanroomtemplate/content/preferences.css"],
    };
    const preferences = {
      navigation: {
        value: "cleanroomtemplate-preferences",
      },
      panes: {
        get(id) {
          return id === "cleanroomtemplate-preferences" ? pane : null;
        },
      },
      async waitForFirstPaneLoad() {},
      async navigateToPane() {},
      async waitForPaneSelect() {},
    };
    const preferenceWindow = {
      Zotero_Preferences: preferences,
      document: {
        getElementById() {
          return paneElement;
        },
      },
    };

    globalThis.Zotero = {
      Utilities: {
        Internal: {
          openPreferences() {
            return preferenceWindow;
          },
        },
      },
      getMainWindows() {
        return [];
      },
    };

    globalThis.Services = {
      wm: {
        getEnumerator() {
          return {
            hasMoreElements() {
              return false;
            },
          };
        },
      },
    };

    const host = createZoteroHost({
      globalScope: globalThis,
      rootURI: "chrome://cleanroomtemplate/",
    });

    const prepared = await host.preparePreferencePane({
      paneID: "cleanroomtemplate-preferences",
      timeoutMs: 1500,
    });

    assert.equal(prepared.preferenceSurface.layoutMode, "stacked");
    assert.equal(prepared.surfaceGeometrySettle?.stable, true);
    assert.equal(prepared.surfaceGeometrySettle?.timedOut, false);
    assert.equal(prepared.surfaceGeometrySettle?.geometry?.width, 563);
    assert.equal(prepared.surfaceGeometrySettle?.geometry?.height, 355);
  });

  it("should resize the preference window before final pane settle when a host boundary is requested", async () => {
    const resizeCalls = [];
    const paneElement = {
      localName: "vbox",
      namespaceURI: "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
      childElementCount: 1,
      children: [{}],
      clientWidth: 560,
      scrollWidth: 560,
      getBoundingClientRect() {
        return {
          left: 0,
          top: 0,
          width: 560,
          height: 320,
        };
      },
      matches() {
        return false;
      },
      querySelector() {
        return null;
      },
      querySelectorAll(selector) {
        if (typeof selector === "string" && selector.includes("button")) {
          return [{}];
        }
        return [];
      },
    };
    const pane = {
      id: "cleanroomtemplate-preferences",
      container: paneElement,
      scripts: ["chrome://cleanroomtemplate/content/preference-pane-load-bridge.js"],
      stylesheets: ["chrome://cleanroomtemplate/content/preferences.css"],
    };
    const preferences = {
      navigation: {
        value: "cleanroomtemplate-preferences",
      },
      panes: {
        get(id) {
          return id === "cleanroomtemplate-preferences" ? pane : null;
        },
      },
      async waitForFirstPaneLoad() {},
      async navigateToPane() {},
      async waitForPaneSelect() {},
    };
    const preferenceWindow = {
      outerWidth: 1040,
      outerHeight: 720,
      screenX: 20,
      screenY: 30,
      resizeTo(width, height) {
        resizeCalls.push({ width, height });
        this.outerWidth = width;
        this.outerHeight = height;
      },
      Zotero_Preferences: preferences,
      document: {
        title: "Zotero Preferences",
        getElementById() {
          return paneElement;
        },
      },
    };

    globalThis.Zotero = {
      Utilities: {
        Internal: {
          openPreferences() {
            return preferenceWindow;
          },
        },
      },
      getMainWindows() {
        return [];
      },
    };

    globalThis.Services = {
      wm: {
        getEnumerator() {
          return {
            hasMoreElements() {
              return false;
            },
          };
        },
      },
    };

    const host = createZoteroHost({
      globalScope: globalThis,
      rootURI: "chrome://cleanroomtemplate/",
    });

    const prepared = await host.preparePreferencePane({
      paneID: "cleanroomtemplate-preferences",
      windowWidth: 800,
      windowHeight: 600,
      timeoutMs: 1000,
    });

    assert.deepEqual(resizeCalls, [{ width: 800, height: 600 }]);
    assert.equal(prepared.windowResize?.requestedWidth, 800);
    assert.equal(prepared.windowResize?.requestedHeight, 600);
    assert.equal(prepared.windowResize?.targetWidth, 800);
    assert.equal(prepared.windowResize?.targetHeight, 600);
    assert.equal(prepared.windowResize?.applied, true);
    assert.equal(prepared.windowResize?.strategy, "resizeTo");
    assert.equal(prepared.windowResize?.widthMatched, true);
    assert.equal(prepared.windowResize?.heightMatched, true);
    assert.equal(prepared.windowResize?.widthSatisfied, true);
    assert.equal(prepared.windowResize?.heightSatisfied, true);
    assert.equal(prepared.windowResize?.boundarySatisfied, true);
    assert.equal(prepared.windowResize?.settled, true);
    assert.equal(prepared.windowResize?.timedOut, false);
    assert.equal(prepared.windowResize?.settleReason, "exact-match");
    assert.equal(prepared.windowResize?.afterBounds?.width, 800);
    assert.equal(prepared.windowResize?.afterBounds?.height, 600);
  });

  it("should accept a stable minimum-height preference window without waiting for an impossible exact outerHeight match", async () => {
    const paneElement = {
      localName: "vbox",
      namespaceURI: "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
      childElementCount: 1,
      children: [{}],
      clientWidth: 563,
      scrollWidth: 563,
      getBoundingClientRect() {
        return {
          left: 0,
          top: 0,
          width: 563,
          height: 355,
        };
      },
      matches() {
        return false;
      },
      querySelector() {
        return null;
      },
      querySelectorAll(selector) {
        if (typeof selector === "string" && selector.includes("button")) {
          return [{}];
        }
        return [];
      },
    };
    const pane = {
      id: "cleanroomtemplate-preferences",
      container: paneElement,
      scripts: ["chrome://cleanroomtemplate/content/preference-pane-load-bridge.js"],
      stylesheets: ["chrome://cleanroomtemplate/content/preferences.css"],
    };
    const preferences = {
      navigation: {
        value: "cleanroomtemplate-preferences",
      },
      panes: {
        get(id) {
          return id === "cleanroomtemplate-preferences" ? pane : null;
        },
      },
      async waitForFirstPaneLoad() {},
      async navigateToPane() {},
      async waitForPaneSelect() {},
    };
    const preferenceWindow = {
      outerWidth: 1040,
      outerHeight: 720,
      screenX: 20,
      screenY: 30,
      resizeTo(width, height) {
        this.outerWidth = width;
        this.outerHeight = height + 28;
      },
      Zotero_Preferences: preferences,
      document: {
        title: "Zotero Preferences",
        getElementById() {
          return paneElement;
        },
      },
    };

    globalThis.Zotero = {
      Utilities: {
        Internal: {
          openPreferences() {
            return preferenceWindow;
          },
        },
      },
      getMainWindows() {
        return [];
      },
    };

    globalThis.Services = {
      wm: {
        getEnumerator() {
          return {
            hasMoreElements() {
              return false;
            },
          };
        },
      },
    };

    const host = createZoteroHost({
      globalScope: globalThis,
      rootURI: "chrome://cleanroomtemplate/",
    });

    const prepared = await host.preparePreferencePane({
      paneID: "cleanroomtemplate-preferences",
      windowWidth: 800,
      windowHeight: 600,
      timeoutMs: 1000,
    });

    assert.equal(prepared.windowResize?.afterBounds?.width, 800);
    assert.equal(prepared.windowResize?.afterBounds?.height, 628);
    assert.equal(prepared.windowResize?.widthMatched, true);
    assert.equal(prepared.windowResize?.heightMatched, false);
    assert.equal(prepared.windowResize?.widthSatisfied, true);
    assert.equal(prepared.windowResize?.heightSatisfied, true);
    assert.equal(prepared.windowResize?.boundarySatisfied, true);
    assert.equal(prepared.windowResize?.settled, true);
    assert.equal(prepared.windowResize?.timedOut, false);
    assert.equal(prepared.windowResize?.settleReason, "stable-min-height");
  });

  it("should fall back to direct element screen metrics when window origins are unavailable", () => {
    const host = createZoteroHost({
      globalScope: {
        Zotero: null,
        Services: null,
      },
      rootURI: "",
    });

    const element = {
      ownerDocument: {
        defaultView: {
          document: {
            title: "Reader Popup",
          },
        },
      },
      getBoundingClientRect() {
        return {
          left: 0,
          top: 0,
          width: 0,
          height: 0,
        };
      },
      screenX: 420,
      screenY: 260,
      outerWidth: 180,
      outerHeight: 320,
    };

    assert.deepEqual(host.getElementScreenRect(element), {
      x: 420,
      y: 260,
      width: 180,
      height: 320,
      title: "Reader Popup",
      source: "element-screen-metrics",
    });
  });

  it("should fall back to XUL boxObject screen bounds when element client rect is unavailable", () => {
    const host = createZoteroHost({
      globalScope: {
        Zotero: null,
        Services: null,
      },
      rootURI: "",
    });

    const element = {
      ownerDocument: {
        defaultView: {
          document: {
            title: "Zotero",
          },
        },
      },
      getBoundingClientRect() {
        return {
          left: 0,
          top: 0,
          width: 0,
          height: 0,
        };
      },
      boxObject: {
        screenX: 320,
        screenY: 240,
        width: 56,
        height: 56,
      },
    };

    assert.deepEqual(host.getElementScreenRect(element), {
      x: 320,
      y: 240,
      width: 56,
      height: 56,
      title: "Zotero",
      source: "box-object",
    });
  });

  it("should resolve reader frame element bounds through the embedding frame origin", () => {
    const host = createZoteroHost({
      globalScope: {
        Zotero: null,
        Services: null,
      },
      rootURI: "",
    });

    const mainWindow = {
      mozInnerScreenX: 120,
      mozInnerScreenY: 240,
      document: {
        title: "My Library - Zotero",
      },
    };
    const frameElement = {
      ownerDocument: {
        defaultView: mainWindow,
      },
      getBoundingClientRect() {
        return {
          left: 40,
          top: 24,
          width: 1000,
          height: 600,
        };
      },
    };
    const readerWindow = {
      browsingContext: {
        embedderElement: frameElement,
      },
      document: {
        title: "PDF.js viewer",
      },
    };
    const element = {
      ownerDocument: {
        defaultView: readerWindow,
      },
      getBoundingClientRect() {
        return {
          left: 16,
          top: 12,
          width: 180,
          height: 42,
        };
      },
    };

    assert.deepEqual(host.getElementScreenRect(element), {
      x: 176,
      y: 276,
      width: 180,
      height: 42,
      title: "PDF.js viewer",
      source: "element",
    });
  });

  it("should prefer document defaultView over ownerGlobal for reader iframe elements", () => {
    const mainWindow = {
      mozInnerScreenX: 120,
      mozInnerScreenY: 240,
      screenX: 120,
      screenY: 220,
      document: {
        title: "Main Zotero",
      },
    };
    const frameElement = {
      ownerDocument: {
        defaultView: mainWindow,
      },
      getBoundingClientRect() {
        return {
          left: 40,
          top: 24,
          width: 1000,
          height: 600,
        };
      },
    };
    const readerWindow = {
      browsingContext: {
        embedderElement: frameElement,
      },
      document: {
        title: "PDF.js viewer",
      },
    };
    const element = {
      ownerGlobal: mainWindow,
      ownerDocument: {
        defaultView: readerWindow,
      },
      getBoundingClientRect() {
        return {
          left: 16,
          top: 12,
          width: 180,
          height: 42,
        };
      },
    };

    globalThis.Zotero = {
      getMainWindow() {
        return mainWindow;
      },
      getMainWindows() {
        return [mainWindow];
      },
    };

    globalThis.Services = {
      wm: {
        getEnumerator() {
          return {
            hasMoreElements() {
              return false;
            },
          };
        },
      },
    };

    const host = createZoteroHost({
      globalScope: globalThis,
      rootURI: "chrome://cleanroomtemplate/",
    });

    assert.deepEqual(host.getElementScreenRect(element), {
      x: 176,
      y: 276,
      width: 180,
      height: 42,
      title: "PDF.js viewer",
      source: "element",
    });
  });

  it("should refresh reader custom menu popups through Zotero MenuManager before replaying popup events", async () => {
    const dispatchedEvents = [];
    const updateCalls = [];
    class FakeEvent {
      constructor(type) {
        this.type = type;
      }
    }
    const popup = {
      ownerGlobal: {
        Event: FakeEvent,
      },
      dispatchEvent(event) {
        dispatchedEvents.push(event.type);
      },
    };
    const readerWindow = {
      document: {
        querySelector(selector) {
          return selector === "#menu_viewPopup" ? popup : null;
        },
      },
    };
    const mainWindow = {
      document: {
        documentElement: {
          getAttribute() {
            return "zotero:main";
          },
        },
      },
    };

    globalThis.Zotero = {
      MenuManager: {
        updateMenuPopup(popupElem, target, args) {
          updateCalls.push({ popupElem, target, args });
        },
      },
      Items: {
        get(itemID) {
          return itemID === 1
            ? { id: 1, attachmentReaderType: "pdf" }
            : null;
        },
      },
      getMainWindow() {
        return mainWindow;
      },
      getMainWindows() {
        return [mainWindow];
      },
    };

    globalThis.Services = {
      wm: {
        getEnumerator() {
          return {
            hasMoreElements() {
              return false;
            },
          };
        },
      },
    };

    const host = createZoteroHost({
      globalScope: globalThis,
      rootURI: "chrome://cleanroomtemplate/",
    });

    const resolved = await host.resolveMenuPopup("reader/menubar/view", {
      reader: {
        _window: readerWindow,
        itemID: 1,
        tabID: "reader-tab-1",
      },
    });

    await resolved.open();

    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].popupElem, popup);
    assert.equal(updateCalls[0].target, "reader/menubar/view");
    assert.equal(updateCalls[0].args.tabType, "reader");
    assert.equal(updateCalls[0].args.tabSubType, "pdf");
    assert.deepEqual(updateCalls[0].args.getContext(), {
      items: [{ id: 1, attachmentReaderType: "pdf" }],
      tabType: "reader",
      tabSubType: "pdf",
      tabID: "reader-tab-1",
    });
    assert.deepEqual(dispatchedEvents, ["popupshowing", "popupshown"]);
  });

  it("should prefer native popup opening for reader menubar popups when available", async () => {
    const dispatchedEvents = [];
    const updateCalls = [];
    const openMenuCalls = [];
    const openPopupCalls = [];
    const menuElement = {
      state: "closed",
      openMenu(force) {
        openMenuCalls.push(force);
        this.state = "open";
      },
      ownerGlobal: {
        focus() {},
      },
      ownerDocument: {
        defaultView: {
          focus() {},
        },
      },
    };
    const popup = {
      parentElement: menuElement,
      state: "closed",
      screenX: 420,
      screenY: 280,
      outerWidth: 180,
      outerHeight: 240,
      ownerGlobal: {
        focus() {},
      },
      ownerDocument: {
        defaultView: {
          focus() {},
        },
      },
      openPopup(anchor, position, x, y, isContextMenu, attributesOverride, triggerEvent) {
        openPopupCalls.push({
          anchor,
          position,
          x,
          y,
          isContextMenu,
          attributesOverride,
          triggerEvent,
        });
        this.state = "open";
      },
      dispatchEvent(event) {
        dispatchedEvents.push(event.type);
      },
    };
    const readerWindow = {
      document: {
        querySelector(selector) {
          return selector === "#menu_viewPopup" ? popup : null;
        },
      },
    };
    const mainWindow = {
      document: {
        documentElement: {
          getAttribute() {
            return "zotero:main";
          },
        },
      },
    };

    globalThis.Zotero = {
      MenuManager: {
        updateMenuPopup(popupElem, target, args) {
          updateCalls.push({ popupElem, target, args });
        },
      },
      Items: {
        get() {
          return null;
        },
      },
      getMainWindow() {
        return mainWindow;
      },
      getMainWindows() {
        return [mainWindow];
      },
    };

    globalThis.Services = {
      wm: {
        getEnumerator() {
          return {
            hasMoreElements() {
              return false;
            },
          };
        },
      },
    };

    const host = createZoteroHost({
      globalScope: globalThis,
      rootURI: "chrome://cleanroomtemplate/",
    });

    const resolved = await host.resolveMenuPopup("reader/menubar/view", {
      reader: {
        _window: readerWindow,
      },
    });

    await resolved.open();

    assert.equal(updateCalls.length, 1);
    assert.deepEqual(openMenuCalls, [true]);
    assert.equal(openPopupCalls.length, 1);
    assert.equal(openPopupCalls[0].anchor, menuElement);
    assert.equal(openPopupCalls[0].position, "after_start");
    assert.deepEqual(dispatchedEvents, []);
  });

  it("should fall back to anchor click when native popup methods are unavailable but popup geometry appears", async () => {
    const dispatchedEvents = [];
    class FakeMouseEvent {
      constructor(type, options = {}) {
        this.type = type;
        this.bubbles = options.bubbles ?? false;
        this.cancelable = options.cancelable ?? false;
        this.button = options.button ?? 0;
      }
    }
    const anchorEvents = [];
    const menuElement = {
      ownerGlobal: {
        focus() {},
        MouseEvent: FakeMouseEvent,
      },
      ownerDocument: {
        defaultView: {
          focus() {},
          MouseEvent: FakeMouseEvent,
        },
      },
      dispatchEvent(event) {
        anchorEvents.push(event.type);
        if (event.type === "click") {
          popup.screenX = 480;
          popup.screenY = 320;
          popup.outerWidth = 200;
          popup.outerHeight = 160;
        }
        return true;
      },
    };
    const popup = {
      parentElement: menuElement,
      screenX: 0,
      screenY: 0,
      outerWidth: 0,
      outerHeight: 0,
      ownerGlobal: {
        focus() {},
      },
      ownerDocument: {
        defaultView: {
          focus() {},
        },
      },
      dispatchEvent(event) {
        dispatchedEvents.push(event.type);
      },
    };
    const readerWindow = {
      document: {
        querySelector(selector) {
          return selector === "#menu_viewPopup" ? popup : null;
        },
      },
    };
    const mainWindow = {
      document: {
        documentElement: {
          getAttribute() {
            return "zotero:main";
          },
        },
      },
    };

    globalThis.Zotero = {
      MenuManager: {
        updateMenuPopup() {},
      },
      Items: {
        get() {
          return null;
        },
      },
      getMainWindow() {
        return mainWindow;
      },
      getMainWindows() {
        return [mainWindow];
      },
    };

    globalThis.Services = {
      wm: {
        getEnumerator() {
          return {
            hasMoreElements() {
              return false;
            },
          };
        },
      },
    };

    const host = createZoteroHost({
      globalScope: globalThis,
      rootURI: "chrome://cleanroomtemplate/",
    });

    const resolved = await host.resolveMenuPopup("reader/menubar/view", {
      reader: {
        _window: readerWindow,
      },
    });

    await resolved.open();

    assert.deepEqual(anchorEvents, ["mousedown", "mouseup", "click"]);
    assert.deepEqual(dispatchedEvents, []);
  });

  it("should prefer native popup hiding when available", async () => {
    const dispatchedEvents = [];
    let hidePopupCalls = 0;
    const popup = {
      hidePopup() {
        hidePopupCalls += 1;
      },
      dispatchEvent(event) {
        dispatchedEvents.push(event.type);
      },
    };

    globalThis.Zotero = {
      getMainWindow() {
        return null;
      },
      getMainWindows() {
        return [];
      },
    };

    globalThis.Services = {
      wm: {
        getEnumerator() {
          return {
            hasMoreElements() {
              return false;
            },
          };
        },
      },
    };

    const host = createZoteroHost({
      globalScope: globalThis,
      rootURI: "chrome://cleanroomtemplate/",
    });

    await host.simulatePopupClose(popup);

    assert.equal(hidePopupCalls, 1);
    assert.deepEqual(dispatchedEvents, []);
  });

  it("should find item pane buttons by exact data-pane value for CSS-escaped registered ids", async () => {
    let clickCount = 0;
    const dispatchedEvents = [];
    let visible = false;
    class FakeMouseEvent {
      constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail ?? 0;
        this.button = options.button ?? 0;
      }
    }
    const registeredPaneID = "cleanroom-template\\@example\\.com-cleanroomtemplate-details";
    const paneElement = {
      getBoundingClientRect() {
        return visible
          ? { top: 10, bottom: 60 }
          : { top: 260, bottom: 320 };
      },
    };
    const paneButton = {
      localName: "div",
      getAttribute(name) {
        return {
          "data-pane": registeredPaneID,
          role: "tab",
        }[name] || null;
      },
      click() {
        clickCount += 1;
      },
      dispatchEvent(event) {
        dispatchedEvents.push({
          type: event.type,
          detail: event.detail,
          button: event.button,
        });
        setTimeout(() => {
          visible = true;
        }, 10);
        return true;
      },
      ownerGlobal: {
        MouseEvent: FakeMouseEvent,
      },
    };
    const itemDetails = {
      sidenav: {
        querySelectorAll(selector) {
          return selector === ".btn[data-pane], [data-pane]" ? [paneButton] : [];
        },
        querySelector() {
          return null;
        },
      },
      getPane(paneID) {
        return paneID === registeredPaneID ? paneElement : null;
      },
      isPaneVisible(paneID) {
        return paneID === registeredPaneID && visible;
      },
      _paneParent: {
        getBoundingClientRect() {
          return { top: 0, bottom: 120 };
        },
      },
    };
    const mainWindow = {
      ZoteroPane: {
        itemPane: {
          _itemDetails: itemDetails,
        },
      },
      document: {
        documentElement: {
          getAttribute() {
            return "zotero:main";
          },
        },
      },
    };

    globalThis.Zotero = {
      getMainWindow() {
        return mainWindow;
      },
      getMainWindows() {
        return [mainWindow];
      },
    };

    globalThis.Services = {
      wm: {
        getEnumerator() {
          return {
            hasMoreElements() {
              return false;
            },
          };
        },
      },
    };

    const host = createZoteroHost({
      globalScope: globalThis,
      rootURI: "chrome://cleanroomtemplate/",
    });

    const result = await host.selectItemPane(registeredPaneID, {
      activationPolicy: "ui-required",
    });

    assert.equal(result.visible, true);
    assert.equal(result.button, paneButton);
    assert.equal(result.activationStrategy, "dispatch-click");
    assert.equal(result.actionDispatched, true);
    assert.equal(clickCount, 0);
    assert.deepEqual(dispatchedEvents, [{
      type: "click",
      detail: 1,
      button: 0,
    }]);
  });

  it("should wait for mounted item pane content before returning", async () => {
    let ready = false;
    setTimeout(() => {
      ready = true;
    }, 0);

    const paneElement = {
      get childElementCount() {
        return ready ? 2 : 0;
      },
      get children() {
        return ready ? [{}, {}] : [];
      },
      get textContent() {
        return ready ? "Mounted pane content" : "";
      },
      getBoundingClientRect() {
        return {
          top: 10,
          bottom: 60,
        };
      },
      querySelector(selector) {
        if (!ready || selector !== "*") {
          return null;
        }
        return {};
      },
    };
    const itemDetails = {
      sidenav: {
        querySelectorAll() {
          return [];
        },
        querySelector() {
          return null;
        },
      },
      getPane(paneID) {
        return paneID === "cleanroomtemplate-details" ? paneElement : null;
      },
      isPaneVisible(paneID) {
        return paneID === "cleanroomtemplate-details";
      },
      async scrollToPane() {},
      _paneParent: {
        getBoundingClientRect() {
          return { top: 0, bottom: 120 };
        },
      },
    };
    const mainWindow = {
      ZoteroPane: {
        itemPane: {
          _itemDetails: itemDetails,
        },
      },
      document: {
        documentElement: {
          getAttribute() {
            return "zotero:main";
          },
        },
      },
    };

    globalThis.Zotero = {
      getMainWindow() {
        return mainWindow;
      },
      getMainWindows() {
        return [mainWindow];
      },
    };

    globalThis.Services = {
      wm: {
        getEnumerator() {
          return {
            hasMoreElements() {
              return false;
            },
          };
        },
      },
    };

    const host = createZoteroHost({
      globalScope: globalThis,
      rootURI: "chrome://cleanroomtemplate/",
    });

    const result = await host.selectItemPane("cleanroomtemplate-details", {
      activationPolicy: "host-first",
      timeoutMs: 1000,
    });

    assert.equal(result.visible, true);
    assert.equal(result.pane, paneElement);
    assert.equal(result.pane.childElementCount, 2);
  });
});
