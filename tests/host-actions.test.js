import { describe, it, assert } from "./test-framework.js";
import { createHostActionRunner } from "../dev/agent-runtime/host-actions.js";
import {
  getHostActionDescriptor,
  listHostActionDescriptors,
} from "../dev/agent-runtime/host-action-catalog.js";
import {
  WASM_KERNEL_PROBE_PATH,
  WASM_KERNEL_PROBE_WORKER_PATH,
} from "../src/utils/optional-bundle-paths.js";

function createSurfaceTarget(surfaceId, captureKind) {
  return {
    surfaceId,
    captureKind,
    label: captureKind,
    scope: "surface-local",
    rect: {
      x: 10,
      y: 10,
      width: 320,
      height: 180,
    },
    windowBounds: null,
    details: {},
  };
}

function createSurfaceTargetWithDetails(surfaceId, captureKind, details = {}, rect = undefined) {
  return {
    ...createSurfaceTarget(surfaceId, captureKind),
    rect: rect === undefined ? createSurfaceTarget(surfaceId, captureKind).rect : rect,
    details,
  };
}

function createPreferenceGeometrySettleSnapshot(overrides = {}) {
  return {
    stable: true,
    timedOut: false,
    observedMs: 420,
    sampleCount: 8,
    strategy: "pane-root-id",
    geometry: {
      left: 0,
      top: 0,
      width: 640,
      height: 360,
    },
    ...overrides,
  };
}

function createPreferenceWindowResizeSnapshot(overrides = {}) {
  const requestedWidth = Number.isFinite(Number(overrides.requestedWidth))
    ? Number(overrides.requestedWidth)
    : null;
  const requestedHeight = Number.isFinite(Number(overrides.requestedHeight))
    ? Number(overrides.requestedHeight)
    : null;
  const targetWidth = Number.isFinite(Number(overrides.targetWidth))
    ? Number(overrides.targetWidth)
    : requestedWidth;
  const targetHeight = Number.isFinite(Number(overrides.targetHeight))
    ? Number(overrides.targetHeight)
    : requestedHeight;
  const afterWidth = Number.isFinite(Number(overrides.afterBounds?.width))
    ? Number(overrides.afterBounds.width)
    : targetWidth;
  const afterHeight = Number.isFinite(Number(overrides.afterBounds?.height))
    ? Number(overrides.afterBounds.height)
    : targetHeight;
  const afterBounds = afterWidth && afterHeight
    ? {
      x: 10,
      y: 10,
      width: afterWidth,
      height: afterHeight,
      title: "Preferences",
      source: "window",
      ...(overrides.afterBounds || {}),
    }
    : null;

  return {
    requestedWidth,
    requestedHeight,
    targetWidth,
    targetHeight,
    applied: requestedWidth !== null || requestedHeight !== null,
    strategy: requestedWidth !== null || requestedHeight !== null ? "resizeTo" : null,
    beforeBounds: null,
    afterBounds,
    widthMatched: requestedWidth === null || afterBounds?.width === requestedWidth,
    heightMatched: requestedHeight === null || afterBounds?.height === requestedHeight,
    widthSatisfied: requestedWidth === null || afterBounds?.width === requestedWidth,
    heightSatisfied: requestedHeight === null || (afterBounds?.height ?? 0) >= requestedHeight,
    boundarySatisfied: requestedWidth === null || requestedHeight === null
      ? (requestedWidth === null || afterBounds?.width === requestedWidth)
        && (requestedHeight === null || (afterBounds?.height ?? 0) >= requestedHeight)
      : afterBounds?.width === requestedWidth && (afterBounds?.height ?? 0) >= requestedHeight,
    settled: true,
    timedOut: false,
    observedMs: 120,
    sampleCount: 3,
    settleReason: "exact-match",
    ...overrides,
  };
}

function createPreferenceSurfaceSnapshot(overrides = {}) {
  return {
    rootTagName: "vbox",
    rootNamespaceURI: "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
    childElementCount: 3,
    groupboxCount: 2,
    headingCount: 2,
    descriptionCount: 1,
    coreControlCount: 2,
    preferenceBindingCount: 2,
    preferenceDefinitionCount: 3,
    localizationLinkCount: 0,
    scriptTagCount: 0,
    registeredScriptCount: 1,
    registeredStylesheetCount: 1,
    hasInlineLoadHook: false,
    hasLoadBridgeSignature: true,
    surfaceRootStrategy: "pane-root-id",
    surfaceRootTagName: "vbox",
    surfaceRootID: "cleanroomtemplate-preferences-root",
    layoutMode: "inline",
    widthBucket: "regular",
    rootClientWidth: 640,
    rootScrollWidth: 640,
    horizontalOverflowPx: 0,
    hasHorizontalOverflow: false,
    hasInteractiveRoot: false,
    interactiveRootStrategy: null,
    interactiveRootTagName: null,
    interactiveRootID: null,
    tabCount: 0,
    panelCount: 0,
    activeTabID: null,
    activePanelID: null,
    visiblePanelCount: 0,
    panelCoreControlCount: 0,
    ...overrides,
  };
}

function createFakeSurfaceElement(options = {}) {
  const {
    tagName = "div",
    localName = "div",
    namespaceURI = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
    childElementCount = 0,
    children = [],
    textContent = "",
    attributes = {},
    selectorMap = {},
  } = options;
  const state = { ...attributes };
  return {
    tagName,
    localName,
    namespaceURI,
    childElementCount,
    children,
    textContent,
    dataset: {
      pane: state["data-pane"] || null,
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(state, name)
        ? state[name]
        : null;
    },
    setAttribute(name, value) {
      state[name] = String(value);
    },
    removeAttribute(name) {
      delete state[name];
    },
    matches(selector) {
      const attributeMatch = selector.match(/^\[([A-Za-z0-9:_-]+)(?:='([^']*)')?\]$/u);
      if (attributeMatch) {
        const attributeName = attributeMatch[1];
        const expectedValue = attributeMatch[2];
        if (!Object.prototype.hasOwnProperty.call(state, attributeName)) {
          return false;
        }
        return expectedValue === undefined ? true : state[attributeName] === expectedValue;
      }
      if (selector.startsWith("#")) {
        return state.id === selector.slice(1);
      }
      if (selector.startsWith(".")) {
        const className = String(state.class || "");
        return className.split(/\s+/u).includes(selector.slice(1));
      }
      if (selector === "[role='tab']") {
        return state.role === "tab";
      }
      if (selector === "[role='tabpanel']") {
        return state.role === "tabpanel";
      }
      if (selector === "[role='menuitem']") {
        return state.role === "menuitem";
      }
      if (selector === "[aria-selected='true']") {
        return state["aria-selected"] === "true";
      }
      if (selector === "[disabled]" || selector === "[aria-disabled]") {
        return state.disabled === "" || state["aria-disabled"] === "true";
      }
      if (selector.includes("[data-pane]")) {
        return Boolean(state["data-pane"]);
      }
      if (selector.includes("button") || selector.includes("toolbarbutton") || selector.includes("menuitem")) {
        return ["button", "toolbarbutton", "menuitem"].includes(localName);
      }
      return false;
    },
    querySelector(selector) {
      const matches = selectorMap[selector] || [];
      return matches[0] || null;
    },
    querySelectorAll(selector) {
      return selectorMap[selector] || [];
    },
  };
}

function createPreferenceControlHarness(options = {}) {
  const addonRef = options.addonRef || "cleanroomtemplate";
  const prefBranch = `extensions.zotero.${addonRef}`;
  const prefValues = new Map([
    [`${prefBranch}.enabled`, false],
    [`${prefBranch}.menuLabel`, ""],
    [`${prefBranch}.logLevel`, "info"],
    [`${prefBranch}.themeMode`, "follow-host"],
  ]);

  const definitions = {
    "pref-enabled": {
      id: "pref-enabled",
      name: `${prefBranch}.enabled`,
      type: "bool",
      getAttribute(name) {
        if (name === "name") return this.name;
        if (name === "type") return this.type;
        return name === "id" ? this.id : null;
      },
    },
    "pref-menuLabel": {
      id: "pref-menuLabel",
      name: `${prefBranch}.menuLabel`,
      type: "string",
      getAttribute(name) {
        if (name === "name") return this.name;
        if (name === "type") return this.type;
        return name === "id" ? this.id : null;
      },
    },
    "pref-logLevel": {
      id: "pref-logLevel",
      name: `${prefBranch}.logLevel`,
      type: "string",
      getAttribute(name) {
        if (name === "name") return this.name;
        if (name === "type") return this.type;
        return name === "id" ? this.id : null;
      },
    },
    "pref-themeMode": {
      id: "pref-themeMode",
      name: `${prefBranch}.themeMode`,
      type: "string",
      getAttribute(name) {
        if (name === "name") return this.name;
        if (name === "type") return this.type;
        return name === "id" ? this.id : null;
      },
    },
  };
  let pendingThemeValue = null;
  let waitAttemptCount = 0;
  let lastPrepareOptions = null;

  function applyThemeState(value) {
    const nextValue = String(value);
    root.dataset.cleanroomThemeMode = nextValue;
    root.dataset.cleanroomTheme = nextValue;
    root.attributes["data-cleanroom-theme-mode"] = nextValue;
    root.attributes["data-cleanroom-theme"] = nextValue;
  }

  const root = {
    localName: "vbox",
    className: "cleanroom-pref-root",
    dataset: {
      cleanroomThemeMode: "follow-host",
      cleanroomTheme: "light",
      prefLayout: "inline",
      prefWidthBucket: "regular",
      prefHorizontalOverflow: "false",
    },
    attributes: {
      id: "cleanroomtemplate-preferences-root",
      class: "cleanroom-pref-root",
      "data-pref-root": "true",
      "data-pref-layout": "inline",
      "data-pref-width-bucket": "regular",
      "data-pref-horizontal-overflow": "false",
      "data-pref-horizontal-overflow-px": "0",
      "data-cleanroom-theme-mode": "follow-host",
      "data-cleanroom-theme": "light",
    },
    clientWidth: options.rootClientWidth || 640,
    scrollWidth: options.rootScrollWidth || options.rootClientWidth || 640,
    ownerDocument: null,
    getAttribute(name) {
      return this.attributes[name] || null;
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    matches(selector) {
      return selector === ".cleanroom-pref-root";
    },
    contains(element) {
      return Object.values(controls).includes(element);
    },
    getBoundingClientRect() {
      return {
        left: 0,
        top: 0,
        width: this.clientWidth,
        height: 320,
      };
    },
    parentNode: null,
  };

  const menuItems = {
    info: {
      value: "info",
      getAttribute(name) {
        return name === "value" ? "info" : null;
      },
    },
    warn: {
      value: "warn",
      getAttribute(name) {
        return name === "value" ? "warn" : null;
      },
    },
    dark: {
      value: "dark",
      getAttribute(name) {
        return name === "value" ? "dark" : null;
      },
    },
    light: {
      value: "light",
      getAttribute(name) {
        return name === "value" ? "light" : null;
      },
    },
  };

  const window = {
    focus() {},
    Services: {
      prefs: {
        getBoolPref(key, fallback) {
          return prefValues.has(key) ? prefValues.get(key) : fallback;
        },
        setBoolPref(key, value) {
          prefValues.set(key, Boolean(value));
        },
        getStringPref(key, fallback) {
          return prefValues.has(key) ? prefValues.get(key) : fallback;
        },
        setStringPref(key, value) {
          prefValues.set(key, String(value));
        },
      },
    },
    document: null,
  };

  function createControl({
    id,
    localName,
    preference,
    initialValue = "",
    initialChecked = false,
    items = [],
    onDispatch = null,
    hidden = false,
  }) {
    const attributes = {
      id,
      preference,
      ...(hidden ? { hidden: "true" } : {}),
    };
    const control = {
      id,
      localName,
      parentNode: null,
      ownerDocument: {
        defaultView: window,
      },
      ownerGlobal: window,
      value: String(initialValue),
      checked: Boolean(initialChecked),
      selectedItem: items[0] || null,
      focus() {},
      click() {
        this.checked = !this.checked;
        prefValues.set(preference, this.checked);
      },
      doCommand() {
        prefValues.set(preference, this.checked);
      },
      getAttribute(name) {
        if (name === "checked") {
          return this.checked ? "true" : null;
        }
        if (name === "value") {
          return this.value;
        }
        return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
      },
      setAttribute(name, value) {
        attributes[name] = String(value);
        if (name === "value") {
          this.value = String(value);
        }
        if (name === "checked") {
          this.checked = String(value) === "true";
        }
      },
      removeAttribute(name) {
        delete attributes[name];
        if (name === "checked") {
          this.checked = false;
        }
      },
      dispatchEvent(event) {
        if (typeof onDispatch === "function") {
          onDispatch(event, this);
        }
        return true;
      },
      querySelectorAll(selector) {
        if (selector === "menuitem, option") {
          return items;
        }
        return [];
      },
    };
    return control;
  }

  const controls = {
    checkbox: createControl({
      id: "cleanroom-enabled",
      localName: "checkbox",
      preference: definitions["pref-enabled"].name,
      initialChecked: false,
      onDispatch(event, control) {
        if (event?.type === "command" || event?.type === "change" || event?.type === "click") {
          prefValues.set(definitions["pref-enabled"].name, Boolean(control.checked));
        }
      },
    }),
    textbox: createControl({
      id: "cleanroom-menu-label",
      localName: "textbox",
      preference: definitions["pref-menuLabel"].name,
      initialValue: "",
      onDispatch(event, control) {
        if (event?.type === "input" || event?.type === "change") {
          prefValues.set(definitions["pref-menuLabel"].name, String(control.value));
        }
      },
    }),
    logLevel: createControl({
      id: "cleanroom-log-level",
      localName: "menulist",
      preference: definitions["pref-logLevel"].name,
      initialValue: "info",
      items: [menuItems.info, menuItems.warn],
      onDispatch(event, control) {
        if (event?.type === "command" || event?.type === "change") {
          prefValues.set(definitions["pref-logLevel"].name, String(control.value));
        }
      },
    }),
    themeMode: createControl({
      id: "cleanroom-theme-mode",
      localName: "menulist",
      preference: definitions["pref-themeMode"].name,
      initialValue: "follow-host",
      items: [menuItems.light, menuItems.dark],
      onDispatch(event, control) {
        if (event?.type === "command" || event?.type === "change") {
          const value = String(control.value);
          prefValues.set(definitions["pref-themeMode"].name, value);
          if (options.deferThemeStateUntilWaitAttempts) {
            pendingThemeValue = value;
            return;
          }
          applyThemeState(value);
        }
      },
    }),
  };

  const paneElement = {
    localName: "div",
    parentNode: null,
    ownerDocument: {
      defaultView: window,
    },
    contains(element) {
      return element === root || Object.values(controls).includes(element);
    },
    querySelector(selector) {
      if (selector === ".cleanroom-pref-root") {
        return root;
      }
      if (selector === `[preference="${definitions["pref-menuLabel"].name}"], [preference="pref-menuLabel"]`) {
        return controls.textbox;
      }
      if (selector === `[preference="${definitions["pref-logLevel"].name}"], [preference="pref-logLevel"]`) {
        return controls.logLevel;
      }
      if (selector === `[preference="${definitions["pref-themeMode"].name}"], [preference="pref-themeMode"]`) {
        return controls.themeMode;
      }
      return null;
    },
  };

  root.parentNode = paneElement;
  root.ownerDocument = {
    defaultView: window,
  };
  root.querySelector = paneElement.querySelector.bind(paneElement);
  Object.values(controls).forEach((control) => {
    control.parentNode = paneElement;
  });

  const preparedPaneElement = options.themeRootOnPaneSelf
    ? root
    : paneElement;
  if (options.themeRootOnPaneSelf) {
    root.parentNode = null;
    Object.values(controls).forEach((control) => {
      control.parentNode = root;
    });
    root.querySelector = (selector) => {
      if (selector === `[preference="${definitions["pref-menuLabel"].name}"], [preference="pref-menuLabel"]`) {
        return controls.textbox;
      }
      if (selector === `[preference="${definitions["pref-logLevel"].name}"], [preference="pref-logLevel"]`) {
        return controls.logLevel;
      }
      if (selector === `[preference="${definitions["pref-themeMode"].name}"], [preference="pref-themeMode"]`) {
        return controls.themeMode;
      }
      return null;
    };
  }

  const elementsByID = {
    ...definitions,
    [controls.checkbox.id]: controls.checkbox,
    [controls.textbox.id]: controls.textbox,
    [controls.logLevel.id]: controls.logLevel,
    [controls.themeMode.id]: controls.themeMode,
  };

  window.document = {
    defaultView: window,
    getElementById(id) {
      return elementsByID[id] || null;
    },
  };

  const host = {
    async preparePreferencePane(prepareOptions = {}) {
      lastPrepareOptions = prepareOptions;
      const requestedWidth = Number.isFinite(Number(prepareOptions.windowWidth))
        ? Number(prepareOptions.windowWidth)
        : null;
      const requestedHeight = Number.isFinite(Number(prepareOptions.windowHeight))
        ? Number(prepareOptions.windowHeight)
        : null;
      return {
        window,
        paneElement: preparedPaneElement,
        selectedPaneID: `${addonRef}-preferences`,
        paneID: `${addonRef}-preferences`,
        preferenceSurface: createPreferenceSurfaceSnapshot({
          surfaceRootStrategy: options.themeRootOnPaneSelf ? "pane-root-class" : "descendant-root-class",
          surfaceRootID: "cleanroomtemplate-preferences-root",
          rootClientWidth: root.clientWidth,
          rootScrollWidth: root.scrollWidth,
          layoutMode: root.clientWidth <= 620 ? "stacked" : "inline",
          widthBucket: root.clientWidth <= 620 ? "compact" : "regular",
          horizontalOverflowPx: Math.max(0, root.scrollWidth - root.clientWidth),
          hasHorizontalOverflow: root.scrollWidth - root.clientWidth > 1,
        }),
        surfaceGeometrySettle: createPreferenceGeometrySettleSnapshot({
          strategy: options.themeRootOnPaneSelf ? "pane-root-class" : "descendant-root-class",
          geometry: {
            left: 0,
            top: 0,
            width: root.clientWidth,
            height: 320,
          },
        }),
        windowResize: createPreferenceWindowResizeSnapshot({
          requestedWidth,
          requestedHeight,
          targetWidth: requestedWidth,
          targetHeight: requestedHeight,
          afterBounds: requestedWidth && requestedHeight
            ? {
              x: 10,
              y: 10,
              width: requestedWidth,
              height: requestedHeight,
              title: "Preferences",
              source: "window",
            }
            : null,
        }),
      };
    },
    async waitFor(getter) {
      for (let index = 0; index < 20; index += 1) {
        const result = getter();
        if (result) {
          return result;
        }
        waitAttemptCount += 1;
        if (
          pendingThemeValue !== null
          && waitAttemptCount >= Number(options.deferThemeStateUntilWaitAttempts || 0)
        ) {
          applyThemeState(pendingThemeValue);
          pendingThemeValue = null;
        }
      }
      return null;
    },
    getElementScreenRect(element) {
      if (options.nullRectForControlID && element?.id === options.nullRectForControlID) {
        return null;
      }
      return {
        x: 10,
        y: 10,
        width: 320,
        height: 48,
      };
    },
    buildSurfaceTarget({ surfaceId, captureKind, element, details }) {
      return createSurfaceTargetWithDetails(
        surfaceId,
        captureKind,
        details,
        this.getElementScreenRect(element),
      );
    },
  };

  return {
    host,
    prefValues,
    paneElement: preparedPaneElement,
    controls,
    definitions,
    get lastPrepareOptions() {
      return lastPrepareOptions;
    },
  };
}

function createPreferenceTabHarness() {
  const controlSelector = "button, checkbox, input, select, textarea, radio, menulist, toolbarbutton";
  const generalPanel = createFakeSurfaceElement({
    localName: "vbox",
    childElementCount: 1,
    children: [{}],
    textContent: "General controls",
    attributes: {
      id: "panel-general",
      role: "tabpanel",
      "data-pref-panel": "general",
    },
    selectorMap: {
      [controlSelector]: [{}],
    },
  });
  const advancedPanel = createFakeSurfaceElement({
    localName: "vbox",
    childElementCount: 1,
    children: [{}],
    textContent: "Advanced controls",
    attributes: {
      id: "panel-advanced",
      role: "tabpanel",
      "data-pref-panel": "advanced",
      hidden: "true",
    },
    selectorMap: {
      [controlSelector]: [{}],
    },
  });
  const generalTab = createFakeSurfaceElement({
    localName: "toolbarbutton",
    textContent: "General",
    attributes: {
      role: "tab",
      "data-pref-tab": "general",
      "aria-selected": "true",
      "aria-controls": "panel-general",
    },
  });
  const advancedTab = createFakeSurfaceElement({
    localName: "toolbarbutton",
    textContent: "Advanced",
    attributes: {
      role: "tab",
      "data-pref-tab": "advanced",
      "aria-controls": "panel-advanced",
    },
  });
  const rootSelectorMap = {};
  const root = createFakeSurfaceElement({
    localName: "vbox",
    childElementCount: 4,
    children: [generalTab, advancedTab, generalPanel, advancedPanel],
    textContent: "Preference tabs",
    attributes: {
      id: "cleanroomtemplate-preferences-root",
      "data-pref-root": "true",
      "data-active-tab": "general",
    },
    selectorMap: rootSelectorMap,
  });
  const paneSelectorMap = {};
  const paneElement = createFakeSurfaceElement({
    localName: "vbox",
    childElementCount: 1,
    children: [root],
    textContent: "Preference pane",
    selectorMap: paneSelectorMap,
  });
  const window = {
    focus() {},
  };

  generalTab.ownerDocument = { defaultView: window };
  advancedTab.ownerDocument = { defaultView: window };
  generalPanel.ownerDocument = { defaultView: window };
  advancedPanel.ownerDocument = { defaultView: window };
  root.ownerDocument = { defaultView: window };
  paneElement.ownerDocument = { defaultView: window };

  rootSelectorMap["[data-pref-tab]"] = [generalTab, advancedTab];
  rootSelectorMap["[role='tab']"] = [generalTab, advancedTab];
  rootSelectorMap["[data-pref-panel]"] = [generalPanel, advancedPanel];
  rootSelectorMap["[role='tabpanel']"] = [generalPanel, advancedPanel];
  rootSelectorMap["#cleanroomtemplate-preferences-root"] = [root];
  paneSelectorMap["[data-pref-root]"] = [root];
  paneSelectorMap["#cleanroomtemplate-preferences-root"] = [root];

  advancedTab.click = () => {
    root.setAttribute("data-active-tab", "advanced");
    generalTab.setAttribute("aria-selected", "false");
    advancedTab.setAttribute("aria-selected", "true");
    generalPanel.setAttribute("hidden", "true");
    advancedPanel.removeAttribute("hidden");
  };

  const host = {
    async preparePreferencePane() {
      return {
        window,
        paneElement,
        paneID: "cleanroomtemplate-preferences",
        selectedPaneID: "cleanroomtemplate-preferences",
        preferenceSurface: {
          hasInteractiveRoot: true,
          interactiveRootStrategy: "data-pref-root",
          tabCount: 2,
          panelCount: 2,
          activeTabID: "general",
          activePanelID: "general",
          visiblePanelCount: 1,
          panelCoreControlCount: 1,
        },
      };
    },
    async waitFor(getter) {
      return getter();
    },
    buildSurfaceTarget({ surfaceId, captureKind, details }) {
      return createSurfaceTargetWithDetails(surfaceId, captureKind, details);
    },
  };

  return {
    host,
    paneElement,
    root,
    generalTab,
    advancedTab,
    generalPanel,
    advancedPanel,
  };
}

describe("Host Actions", () => {
  it("should expose a stable source-driven host action catalog", () => {
    const actions = listHostActionDescriptors();
    assert.ok(actions.length >= 14);
    assert.equal(getHostActionDescriptor("preferences.openPane")?.status, "ready");
    assert.equal(getHostActionDescriptor("preferences.selectTab")?.status, "ready");
    assert.equal(getHostActionDescriptor("preferences.setTextbox")?.status, "ready");
    assert.equal(getHostActionDescriptor("menu.trigger")?.executable, true);
    assert.equal(getHostActionDescriptor("reader.toolbar.triggerButton")?.executable, true);
    assert.equal(getHostActionDescriptor("runtime.probeWasmKernel")?.status, "probe-only");
    assert.equal(getHostActionDescriptor("runtime.probeWasmKernel")?.executable, true);
    assert.equal(getHostActionDescriptor("runtime.deriveWasmKernelDigest")?.status, "probe-only");
    assert.equal(getHostActionDescriptor("runtime.deriveWasmKernelDigest")?.executable, true);
    assert.equal(getHostActionDescriptor("runtime.deriveWasmKernelUnlockToken")?.status, "probe-only");
    assert.equal(getHostActionDescriptor("runtime.deriveWasmKernelUnlockToken")?.executable, true);
    assert.equal(getHostActionDescriptor("runtime.resolveLegacyEntitlementGate")?.status, "probe-only");
    assert.equal(getHostActionDescriptor("runtime.resolveLegacyEntitlementGate")?.executable, true);
    assert.equal(getHostActionDescriptor("preferences.helpLink")?.status, "manual-only");
    assert.equal(getHostActionDescriptor("window.openReactDemo"), null);
  });

  it("should run the wasm kernel probe host action without host surface dependencies", async () => {
    let receivedPayload = null;
    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: {},
      reader: {},
      menuManager: {},
      wasmKernelProbe: {
        async runProbe(payload = {}) {
          receivedPayload = payload;
          return {
            ok: true,
            mode: "both",
            rootURI: "jar:file:///tmp/cleanroom.xpi!/",
            wasmRelativePath: WASM_KERNEL_PROBE_PATH,
            workerRelativePath: WASM_KERNEL_PROBE_WORKER_PATH,
            mainThread: {
              ok: true,
              matchesExpected: true,
              sum: 42,
              expectedSum: 42,
            },
            worker: {
              ok: true,
              matchesExpected: true,
              sum: 42,
              expectedSum: 42,
            },
            consistentAcrossTransports: true,
            errors: [],
          };
        },
      },
    });

    const result = await runner.runHostAction("runtime.probeWasmKernel", {
      mode: "both",
      left: 19,
      right: 23,
    });

    assert.deepEqual(receivedPayload, {
      mode: "both",
      left: 19,
      right: 23,
    });
    assert.equal(result.ok, true);
    assert.equal(result.failureKind, null);
    assert.equal(result.readiness.ok, true);
    assert.equal(result.observedState.mainThread.sum, 42);
    assert.equal(result.observedState.worker.sum, 42);
  });

  it("should resolve the wasm kernel probe lazily through a getter", async () => {
    let getterCalls = 0;
    let receivedPayload = null;
    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: {},
      reader: {},
      menuManager: {},
      async getWasmKernelProbe() {
        getterCalls += 1;
        return {
          async runProbe(payload = {}) {
            receivedPayload = payload;
            return {
              ok: true,
              mode: "main-thread",
              mainThread: {
                ok: true,
                matchesExpected: true,
                sum: 42,
                expectedSum: 42,
              },
              worker: null,
              consistentAcrossTransports: null,
              errors: [],
            };
          },
        };
      },
    });

    assert.equal(getterCalls, 0);

    const result = await runner.runHostAction("runtime.probeWasmKernel", {
      mode: "main-thread",
      left: 19,
      right: 23,
    });

    assert.equal(getterCalls, 1);
    assert.deepEqual(receivedPayload, {
      mode: "main-thread",
      left: 19,
      right: 23,
    });
    assert.equal(result.ok, true);
    assert.equal(result.readiness.ok, true);
    assert.equal(result.observedState.mainThread.sum, 42);
  });

  it("should run the wasm kernel digest host action without host surface dependencies", async () => {
    let receivedPayload = null;
    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: {},
      reader: {},
      menuManager: {},
      wasmKernelProbe: {
        async deriveDigest(payload = {}) {
          receivedPayload = payload;
          return {
            ok: true,
            mode: "both",
            rootURI: "jar:file:///tmp/cleanroom.xpi!/",
            wasmRelativePath: WASM_KERNEL_PROBE_PATH,
            workerRelativePath: WASM_KERNEL_PROBE_WORKER_PATH,
            textLength: 12,
            seed: null,
            mainThread: {
              ok: true,
              digestUint32: 305419896,
              digestHex: "12345678",
            },
            worker: {
              ok: true,
              digestUint32: 305419896,
              digestHex: "12345678",
            },
            consistentAcrossTransports: true,
            errors: [],
          };
        },
      },
    });

    const result = await runner.runHostAction("runtime.deriveWasmKernelDigest", {
      mode: "both",
      text: "cleanroom",
    });

    assert.deepEqual(receivedPayload, {
      mode: "both",
      text: "cleanroom",
    });
    assert.equal(result.ok, true);
    assert.equal(result.failureKind, null);
    assert.equal(result.readiness.ok, true);
    assert.equal(result.observedState.mainThread.digestHex, "12345678");
    assert.equal(result.observedState.worker.digestHex, "12345678");
  });

  it("should resolve the wasm kernel digest host action lazily through a getter", async () => {
    let getterCalls = 0;
    let receivedPayload = null;
    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: {},
      reader: {},
      menuManager: {},
      async getWasmKernelProbe() {
        getterCalls += 1;
        return {
          async deriveDigest(payload = {}) {
            receivedPayload = payload;
            return {
              ok: true,
              mode: "main-thread",
              mainThread: {
                ok: true,
                digestUint32: 3735928559,
                digestHex: "deadbeef",
              },
              worker: null,
              consistentAcrossTransports: null,
              errors: [],
            };
          },
        };
      },
    });

    assert.equal(getterCalls, 0);

    const result = await runner.runHostAction("runtime.deriveWasmKernelDigest", {
      mode: "main-thread",
      text: "digest",
    });

    assert.equal(getterCalls, 1);
    assert.deepEqual(receivedPayload, {
      mode: "main-thread",
      text: "digest",
    });
    assert.equal(result.ok, true);
    assert.equal(result.readiness.ok, true);
    assert.equal(result.observedState.mainThread.digestHex, "deadbeef");
  });

  it("should run the wasm kernel unlock host action with runtime host binding", async () => {
    let receivedPayload = null;
    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: {},
      reader: {},
      menuManager: {},
      getProtectionSummary() {
        return {
          hostBinding: {
            profileHash: "sha256:profile-runtime",
            schemaBucket: "120-129",
            zoteroVersionBucket: "9.x",
            dbAvailable: true,
            noncePresent: true,
            nonceSource: "existing",
            nonceHash: "sha256:nonce-runtime",
          },
        };
      },
      wasmKernelProbe: {
        async deriveUnlockToken(payload = {}) {
          receivedPayload = payload;
          return {
            ok: true,
            mode: "both",
            derivationVersion: "host-unlock-v1-shadow",
            activationRequirements: ["profileHash", "dbAvailable", "noncePresent"],
            activationMissing: [],
            activationSatisfied: true,
            shadowWouldApply: true,
            hostBinding: payload.hostBinding,
            mainThread: {
              ok: true,
              stage2DigestUint32: 305419896,
              stage2DigestHex: "12345678",
              unlockTokenUint32: 2271560481,
              unlockTokenHex: "87654321",
            },
            worker: {
              ok: true,
              stage2DigestUint32: 305419896,
              stage2DigestHex: "12345678",
              unlockTokenUint32: 2271560481,
              unlockTokenHex: "87654321",
            },
            consistentAcrossTransports: true,
            errors: [],
          };
        },
      },
    });

    const result = await runner.runHostAction("runtime.deriveWasmKernelUnlockToken", {
      mode: "both",
      bundleSeed: "cleanroom-stage2-shadow-seed-v1",
    });

    assert.deepEqual(receivedPayload, {
      mode: "both",
      bundleSeed: "cleanroom-stage2-shadow-seed-v1",
      hostBinding: {
        profileHash: "sha256:profile-runtime",
        schemaBucket: "120-129",
        zoteroVersionBucket: "9.x",
        dbAvailable: true,
        noncePresent: true,
        nonceSource: "existing",
        nonceHash: "sha256:nonce-runtime",
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.failureKind, null);
    assert.equal(result.readiness.ok, true);
    assert.equal(result.observedState.mainThread.stage2DigestHex, "12345678");
    assert.equal(result.observedState.worker.unlockTokenHex, "87654321");
  });

  it("should resolve the wasm kernel unlock host action lazily through a getter", async () => {
    let getterCalls = 0;
    let receivedPayload = null;
    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: {},
      reader: {},
      menuManager: {},
      getProtectionSummary() {
        return {
          hostBinding: {
            profileHash: "sha256:profile-shadow",
            dbAvailable: true,
            noncePresent: true,
            nonceSource: "existing",
            nonceHash: "sha256:nonce-shadow",
          },
        };
      },
      async getWasmKernelProbe() {
        getterCalls += 1;
        return {
          async deriveUnlockToken(payload = {}) {
            receivedPayload = payload;
            return {
              ok: true,
              mode: "main-thread",
              activationRequirements: ["profileHash", "dbAvailable", "noncePresent"],
              activationMissing: [],
              activationSatisfied: true,
              shadowWouldApply: true,
              mainThread: {
                ok: true,
                stage2DigestUint32: 3735928559,
                stage2DigestHex: "deadbeef",
                unlockTokenUint32: 3405691582,
                unlockTokenHex: "cafebabe",
              },
              worker: null,
              consistentAcrossTransports: null,
              errors: [],
            };
          },
        };
      },
    });

    assert.equal(getterCalls, 0);

    const result = await runner.runHostAction("runtime.deriveWasmKernelUnlockToken", {
      mode: "main-thread",
      overlayVersion: "descriptor-overlay-v2",
    });

    assert.equal(getterCalls, 1);
    assert.deepEqual(receivedPayload, {
      mode: "main-thread",
      overlayVersion: "descriptor-overlay-v2",
      hostBinding: {
        profileHash: "sha256:profile-shadow",
        dbAvailable: true,
        noncePresent: true,
        nonceSource: "existing",
        nonceHash: "sha256:nonce-shadow",
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.readiness.ok, true);
    assert.equal(result.observedState.mainThread.unlockTokenHex, "cafebabe");
  });

  it("should resolve the advisory legacy entitlement gate through the control-plane host action", async () => {
    let resolveCalls = 0;
    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: {},
      reader: {},
      menuManager: {},
      controlPlane: {
        async resolve(payload = {}) {
          resolveCalls += 1;
          assert.deepEqual(payload, {
            forceRefresh: true,
          });
          return {
            mode: "legacy-backend-v0",
            configured: true,
            status: "validated",
            identityKind: "zotero-user-id",
            cacheAvailable: true,
            cacheFresh: true,
            validationSource: "fresh-network",
            gateSatisfied: true,
            compactGateHex: "1234abcd",
            lastValidatedAt: "2026-04-20T00:00:00.000Z",
            expiresAt: "2026-04-21T00:00:00.000Z",
            failureKind: null,
          };
        },
      },
    });

    const result = await runner.runHostAction("runtime.resolveLegacyEntitlementGate", {
      forceRefresh: true,
    });

    assert.equal(resolveCalls, 1);
    assert.equal(result.ok, true);
    assert.equal(result.failureKind, null);
    assert.equal(result.readiness.ok, true);
    assert.equal(result.observedState.status, "validated");
    assert.equal(result.observedState.compactGateHex, "1234abcd");
  });

  it("should run preference pane host actions with readiness and surface evidence", async () => {
    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: {
        async preparePreferencePane() {
          return {
            window: {
              focus() {},
            },
            paneElement: {},
            selectedPaneID: "cleanroomtemplate-preferences",
            surfaceGeometrySettle: createPreferenceGeometrySettleSnapshot(),
            preferenceSurface: createPreferenceSurfaceSnapshot({
              registeredScriptCount: 0,
              registeredStylesheetCount: 0,
            }),
          };
        },
        listPreferenceWindows() {
          return [{}];
        },
        buildSurfaceTarget() {
          return createSurfaceTarget("preference-pane", "surface-preference-cleanroomtemplate-preferences");
        },
      },
      reader: {},
      menuManager: {},
    });

    const result = await runner.runHostAction("preferences.openPane", {
      paneID: "cleanroomtemplate-preferences",
    });

    assert.equal(result.ok, true);
    assert.equal(result.actionId, "preferences.openPane");
    assert.equal(result.readiness.ok, true);
    assert.equal(result.observedState.selectedPaneID, "cleanroomtemplate-preferences");
    assert.equal(result.observedState.preferenceSurface.preferenceDefinitionCount, 3);
    assert.equal(result.observedState.layoutMode, "inline");
    assert.equal(result.observedState.hasHorizontalOverflow, false);
    assert.equal(result.surfaceTarget.surfaceId, "preference-pane");
  });

  it("should forward host boundary hints to preference pane actions and expose resize diagnostics", async () => {
    let receivedOptions = null;
    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: {
        async preparePreferencePane(options = {}) {
          receivedOptions = options;
          return {
            window: {
              focus() {},
            },
            paneElement: {},
            selectedPaneID: "cleanroomtemplate-preferences",
            surfaceGeometrySettle: createPreferenceGeometrySettleSnapshot({
              geometry: {
                left: 0,
                top: 0,
                width: 620,
                height: 360,
              },
            }),
            windowResize: createPreferenceWindowResizeSnapshot({
              requestedWidth: options.windowWidth,
              requestedHeight: options.windowHeight,
              targetWidth: options.windowWidth,
              targetHeight: options.windowHeight,
            }),
            preferenceSurface: createPreferenceSurfaceSnapshot({
              layoutMode: "stacked",
              widthBucket: "compact",
              rootClientWidth: 620,
              rootScrollWidth: 620,
            }),
          };
        },
        listPreferenceWindows() {
          return [{}];
        },
        buildSurfaceTarget({ details }) {
          return createSurfaceTargetWithDetails(
            "preference-pane",
            "surface-preference-cleanroomtemplate-preferences",
            details,
          );
        },
      },
      reader: {},
      menuManager: {},
    });

    const result = await runner.runHostAction("preferences.openPane", {
      paneID: "cleanroomtemplate-preferences",
      windowWidth: 800,
      windowHeight: 600,
    });

    assert.equal(receivedOptions.windowWidth, 800);
    assert.equal(receivedOptions.windowHeight, 600);
    assert.equal(result.ok, true);
    assert.equal(result.observedState.windowResize.requestedWidth, 800);
    assert.equal(result.observedState.windowResize.requestedHeight, 600);
    assert.equal(result.observedState.layoutMode, "stacked");
    assert.equal(result.surfaceTarget.details.windowResize.requestedWidth, 800);
    assert.equal(result.surfaceTarget.details.windowResize.requestedHeight, 600);
  });

  it("should accept preference panes with observed geometry even when settle times out", async () => {
    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: {
        async preparePreferencePane() {
          return {
            window: {
              focus() {},
            },
            paneElement: {},
            selectedPaneID: "cleanroomtemplate-preferences",
            surfaceGeometrySettle: createPreferenceGeometrySettleSnapshot({
              stable: false,
              timedOut: true,
              observedMs: 1648,
              sampleCount: 14,
              geometry: {
                left: 207,
                top: 80,
                width: 563,
                height: 355,
              },
            }),
            preferenceSurface: createPreferenceSurfaceSnapshot({
              layoutMode: "stacked",
              widthBucket: "compact",
              rootClientWidth: 563,
              rootScrollWidth: 563,
              horizontalOverflowPx: 0,
              hasHorizontalOverflow: false,
            }),
          };
        },
        listPreferenceWindows() {
          return [{}];
        },
        buildSurfaceTarget({ details }) {
          return createSurfaceTargetWithDetails(
            "preference-pane",
            "surface-preference-cleanroomtemplate-preferences",
            details,
          );
        },
      },
      reader: {},
      menuManager: {},
    });

    const result = await runner.runHostAction("preferences.openPane", {
      paneID: "cleanroomtemplate-preferences",
    });

    assert.equal(result.ok, true);
    assert.equal(result.readiness.ok, true);
    assert.equal(result.observedState.surfaceGeometrySettle.stable, false);
    assert.equal(result.readiness.checks.find((entry) => entry.name === "pane-geometry-ready")?.ok, true);
    assert.equal(result.readiness.checks.find((entry) => entry.name === "pane-geometry-ready")?.details?.stable, false);
  });

  it("should fail preference pane readiness when the resolved root still overflows horizontally", async () => {
    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: {
        async preparePreferencePane() {
          return {
            window: {
              focus() {},
            },
            paneElement: {},
            selectedPaneID: "cleanroomtemplate-preferences",
            surfaceGeometrySettle: createPreferenceGeometrySettleSnapshot({
              geometry: {
                left: 0,
                top: 0,
                width: 600,
                height: 360,
              },
            }),
            preferenceSurface: createPreferenceSurfaceSnapshot({
              layoutMode: "stacked",
              widthBucket: "compact",
              rootClientWidth: 600,
              rootScrollWidth: 648,
              horizontalOverflowPx: 48,
              hasHorizontalOverflow: true,
            }),
          };
        },
        listPreferenceWindows() {
          return [{}];
        },
        buildSurfaceTarget({ details }) {
          return createSurfaceTargetWithDetails(
            "preference-pane",
            "surface-preference-cleanroomtemplate-preferences",
            details,
          );
        },
      },
      reader: {},
      menuManager: {},
    });

    const result = await runner.runHostAction("preferences.openPane", {
      paneID: "cleanroomtemplate-preferences",
    });

    assert.equal(result.ok, false);
    assert.equal(
      result.readiness.checks.find((entry) => entry.name === "pane-no-horizontal-overflow")?.ok,
      false,
    );
  });

  it("should keep a capped compact execution history for recent host actions", async () => {
    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: {},
      reader: {},
      menuManager: {},
      itemPane: {},
      wasmKernelProbe: {
        async runProbe(payload = {}) {
          return {
            ok: payload.ready !== false,
            mode: "main-thread",
            mainThread: {
              ok: payload.ready !== false,
              matchesExpected: payload.ready !== false,
            },
            worker: null,
            consistentAcrossTransports: true,
            errors: [],
          };
        },
      },
    });

    for (let index = 0; index < 25; index += 1) {
      await runner.runHostAction("runtime.probeWasmKernel", {
        ready: index % 2 === 0,
      });
    }

    const recent = runner.getRecentExecutionSummaries();
    assert.equal(recent.length, 20);
    assert.equal(recent[0].actionId, "runtime.probeWasmKernel");
    assert.equal(typeof recent[0].executedAt, "string");
    assert.equal(recent[0].surfaceTarget, null);
    assert.equal(typeof recent[0].observedStateSummary, "object");
    assert.equal(typeof recent[0].observedStateSummary.booleanMetrics.ok, "boolean");
    assert.equal(Object.prototype.hasOwnProperty.call(recent[0].observedStateSummary, "scalarFields"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(recent[0], "observedState"), false);
  });

  it("should prefer the settled preference surface element when building surface evidence", async () => {
    const paneElement = {};
    const surfaceElement = {};
    let capturedElement = null;
    let capturedDetails = null;

    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: {
        async preparePreferencePane() {
          return {
            window: {
              focus() {},
            },
            paneElement,
            surfaceElement,
            surfaceElementStrategy: "descendant-root-class",
            surfaceGeometrySettle: {
              stable: true,
              timedOut: false,
              observedMs: 620,
              sampleCount: 12,
              strategy: "descendant-root-class",
              geometry: {
                left: 0,
                top: 0,
                width: 563,
                height: 355,
              },
            },
            selectedPaneID: "cleanroomtemplate-preferences",
            preferenceSurface: createPreferenceSurfaceSnapshot({
              rootTagName: "div",
              rootNamespaceURI: "http://www.w3.org/1999/xhtml",
              childElementCount: 3,
              groupboxCount: 4,
              headingCount: 5,
              descriptionCount: 2,
              coreControlCount: 3,
              preferenceBindingCount: 4,
              preferenceDefinitionCount: 4,
              surfaceRootStrategy: "descendant-root-class",
              surfaceRootTagName: "div",
              rootClientWidth: 563,
              rootScrollWidth: 563,
            }),
          };
        },
        listPreferenceWindows() {
          return [{}];
        },
        buildSurfaceTarget({ element, details }) {
          capturedElement = element;
          capturedDetails = details;
          return createSurfaceTargetWithDetails(
            "preference-pane",
            "surface-preference-cleanroomtemplate-preferences",
            details,
          );
        },
      },
      reader: {},
      menuManager: {},
    });

    const result = await runner.runHostAction("preferences.openPane", {
      paneID: "cleanroomtemplate-preferences",
    });

    assert.equal(result.ok, true);
    assert.equal(capturedElement, surfaceElement);
    assert.equal(capturedDetails.surfaceRootStrategy, "descendant-root-class");
    assert.equal(capturedDetails.geometrySettled, true);
    assert.equal(capturedDetails.hasHorizontalOverflow, false);
    assert.equal(result.observedState.surfaceGeometrySettle.geometry.height, 355);
  });

  it("should accept script-backed preference shell panes without dense core controls", async () => {
    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: {
        async preparePreferencePane() {
          return {
            window: {
              focus() {},
            },
            paneElement: {},
            selectedPaneID: "cleanroomtemplate-preferences",
            surfaceGeometrySettle: createPreferenceGeometrySettleSnapshot(),
            preferenceSurface: createPreferenceSurfaceSnapshot({
              childElementCount: 1,
              groupboxCount: 0,
              headingCount: 1,
              descriptionCount: 0,
              coreControlCount: 0,
              preferenceBindingCount: 0,
              preferenceDefinitionCount: 0,
              registeredScriptCount: 1,
              registeredStylesheetCount: 0,
            }),
          };
        },
        listPreferenceWindows() {
          return [{}];
        },
        buildSurfaceTarget() {
          return createSurfaceTarget("preference-pane", "surface-preference-cleanroomtemplate-preferences");
        },
      },
      reader: {},
      menuManager: {},
    });

    const result = await runner.runHostAction("preferences.openPane", {
      paneID: "cleanroomtemplate-preferences",
    });

    assert.equal(result.ok, true);
    assert.equal(result.readiness.ok, true);
    assert.equal(
      result.readiness.checks.find((entry) => entry.name === "pane-behavior-signature-observed")?.ok,
      true,
    );
  });

  it("should require active tab and panel content for advanced preference panes", async () => {
    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: {
        async preparePreferencePane() {
          return {
            window: {
              focus() {},
            },
            paneElement: {},
            selectedPaneID: "cleanroomtemplate-preferences",
            surfaceGeometrySettle: createPreferenceGeometrySettleSnapshot(),
            preferenceSurface: createPreferenceSurfaceSnapshot({
              childElementCount: 2,
              groupboxCount: 0,
              headingCount: 1,
              descriptionCount: 0,
              coreControlCount: 0,
              preferenceBindingCount: 0,
              preferenceDefinitionCount: 0,
              registeredScriptCount: 1,
              registeredStylesheetCount: 1,
              hasInteractiveRoot: true,
              interactiveRootStrategy: "data-pref-root",
              interactiveRootTagName: "vbox",
              interactiveRootID: "cleanroomtemplate-preferences-root",
              tabCount: 2,
              panelCount: 2,
              activeTabID: "general",
              activePanelID: "general",
              visiblePanelCount: 1,
              panelCoreControlCount: 2,
            }),
          };
        },
        listPreferenceWindows() {
          return [{}];
        },
        buildSurfaceTarget() {
          return createSurfaceTarget("preference-pane", "surface-preference-cleanroomtemplate-preferences");
        },
      },
      reader: {},
      menuManager: {},
    });

    const result = await runner.runHostAction("preferences.openPane", {
      paneID: "cleanroomtemplate-preferences",
    });

    assert.equal(result.ok, true);
    assert.equal(result.readiness.checks.find((entry) => entry.name === "interactive-root-observed")?.ok, true);
    assert.equal(result.readiness.checks.find((entry) => entry.name === "active-tab-observed")?.ok, true);
    assert.equal(result.readiness.checks.find((entry) => entry.name === "active-panel-content-observed")?.ok, true);
  });

  it("should select advanced preference tabs and return panel evidence", async () => {
    const harness = createPreferenceTabHarness();
    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: harness.host,
      reader: {},
      menuManager: {},
    });

    const result = await runner.runHostAction("preferences.selectTab", {
      paneID: "cleanroomtemplate-preferences",
      tabID: "advanced",
    });

    assert.equal(result.ok, true);
    assert.equal(result.readiness.ok, true);
    assert.equal(result.observedState.activeTabID, "advanced");
    assert.equal(result.observedState.activePanelID, "advanced");
    assert.equal(result.surfaceTarget.surfaceId, "preference-pane");
    assert.equal(harness.root.getAttribute("data-active-tab"), "advanced");
    assert.equal(harness.advancedPanel.getAttribute("hidden"), null);
    assert.equal(harness.generalPanel.getAttribute("hidden"), "true");
  });

  it("should update textbox and menulist preference controls with writeback evidence", async () => {
    const harness = createPreferenceControlHarness();
    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: harness.host,
      reader: {},
      menuManager: {},
    });

    const textboxResult = await runner.runHostAction("preferences.setTextbox", {
      controlID: "cleanroom-menu-label",
      value: "Scenario Label",
      windowWidth: 800,
      windowHeight: 600,
    });
    const menulistResult = await runner.runHostAction("preferences.selectMenulist", {
      preferenceID: "pref-logLevel",
      value: "warn",
      windowWidth: 800,
      windowHeight: 600,
    });

    assert.equal(textboxResult.ok, true);
    assert.equal(textboxResult.readiness.ok, true);
    assert.equal(textboxResult.observedState.valueBefore, "");
    assert.equal(textboxResult.observedState.valueAfter, "Scenario Label");
    assert.equal(
      textboxResult.observedState.prefValueAfter,
      "Scenario Label",
    );
    assert.equal(textboxResult.observedState.layoutMode, "inline");
    assert.equal(textboxResult.observedState.hasHorizontalOverflow, false);
    assert.equal(textboxResult.observedState.windowResize.requestedWidth, 800);
    assert.equal(textboxResult.observedState.windowResize.requestedHeight, 600);
    assert.equal(textboxResult.surfaceTarget.surfaceId, "preference-control");
    assert.equal(textboxResult.surfaceTarget.details.layoutMode, "inline");
    assert.equal(textboxResult.surfaceTarget.details.hasHorizontalOverflow, false);

    assert.equal(menulistResult.ok, true);
    assert.equal(menulistResult.readiness.ok, true);
    assert.equal(menulistResult.observedState.valueBefore, "info");
    assert.equal(menulistResult.observedState.valueAfter, "warn");
    assert.equal(menulistResult.observedState.prefValueAfter, "warn");
    assert.equal(
      harness.prefValues.get("extensions.zotero.cleanroomtemplate.logLevel"),
      "warn",
    );
    assert.equal(harness.lastPrepareOptions.windowWidth, 800);
    assert.equal(harness.lastPrepareOptions.windowHeight, 600);
  });

  it("should update checkbox controls and fall back to pane evidence when control rect is unavailable", async () => {
    const harness = createPreferenceControlHarness({
      nullRectForControlID: "cleanroom-theme-mode",
    });
    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: harness.host,
      reader: {},
      menuManager: {},
    });

    const checkboxResult = await runner.runHostAction("preferences.setCheckbox", {
      controlID: "cleanroom-enabled",
      checked: true,
    });
    const themeResult = await runner.runHostAction("preferences.selectMenulist", {
      controlID: "cleanroom-theme-mode",
      value: "dark",
    });

    assert.equal(checkboxResult.ok, true);
    assert.equal(checkboxResult.observedState.valueBefore, false);
    assert.equal(checkboxResult.observedState.valueAfter, true);
    assert.equal(checkboxResult.observedState.prefValueAfter, true);

    assert.equal(themeResult.ok, true);
    assert.equal(themeResult.surfaceTarget.surfaceId, "preference-control");
    assert.equal(themeResult.surfaceTarget.details.controlSurfaceFallback, true);
    assert.equal(themeResult.observedState.paneThemeMode, "dark");
    assert.equal(themeResult.observedState.paneTheme, "dark");
  });

  it("should wait for theme sync when the themed root is the pane element itself", async () => {
    const harness = createPreferenceControlHarness({
      themeRootOnPaneSelf: true,
      deferThemeStateUntilWaitAttempts: 2,
    });
    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: harness.host,
      reader: {},
      menuManager: {},
    });

    const themeResult = await runner.runHostAction("preferences.selectMenulist", {
      controlID: "cleanroom-theme-mode",
      value: "dark",
    });

    assert.equal(themeResult.ok, true);
    assert.equal(themeResult.readiness.ok, true);
    assert.equal(themeResult.observedState.themeRootFound, true);
    assert.equal(themeResult.observedState.themeRootStrategy, "pane-root-class");
    assert.equal(themeResult.observedState.paneThemeMode, "dark");
    assert.equal(themeResult.observedState.paneTheme, "dark");
    assert.equal(
      themeResult.readiness.checks.find((entry) => entry.name === "pane-theme-mode-matched")?.ok,
      true,
    );
    assert.equal(
      themeResult.readiness.checks.find((entry) => entry.name === "pane-theme-applied")?.ok,
      true,
    );
  });

  it("should fail preference control actions when locators, control types, visibility, or writeback are invalid", async () => {
    const missingLocatorRunner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: createPreferenceControlHarness().host,
      reader: {},
      menuManager: {},
    });
    const missingLocatorResult = await missingLocatorRunner.runHostAction("preferences.setTextbox", {
      value: "Missing locator",
    });
    assert.equal(missingLocatorResult.failureKind, "precondition-failed");

    const typeMismatchHarness = createPreferenceControlHarness();
    const typeMismatchRunner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: typeMismatchHarness.host,
      reader: {},
      menuManager: {},
    });
    const typeMismatchResult = await typeMismatchRunner.runHostAction("preferences.setTextbox", {
      controlID: "cleanroom-log-level",
      value: "warn",
    });
    assert.equal(typeMismatchResult.failureKind, "control-type-mismatch");

    const hiddenHarness = createPreferenceControlHarness();
    hiddenHarness.controls.textbox.setAttribute("hidden", "true");
    const hiddenRunner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: hiddenHarness.host,
      reader: {},
      menuManager: {},
    });
    const hiddenResult = await hiddenRunner.runHostAction("preferences.setTextbox", {
      controlID: "cleanroom-menu-label",
      value: "Invisible",
    });
    assert.equal(hiddenResult.failureKind, "control-not-interactable");

    const mismatchHarness = createPreferenceControlHarness();
    mismatchHarness.controls.textbox.dispatchEvent = () => true;
    const mismatchRunner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: mismatchHarness.host,
      reader: {},
      menuManager: {},
    });
    const mismatchResult = await mismatchRunner.runHostAction("preferences.setTextbox", {
      controlID: "cleanroom-menu-label",
      value: "No writeback",
    });
    assert.equal(mismatchResult.failureKind, "writeback-mismatch");
  });

  it("should require pane structure and sidenav evidence for item pane actions", async () => {
    const paneElement = createFakeSurfaceElement({
      localName: "collapsible-section",
      childElementCount: 2,
      children: [{}, {}],
      textContent: "Info pane body",
      selectorMap: {
        "*": [{}, {}],
        "button, checkbox, input, select, textarea, radio, menulist, toolbarbutton, menuitem, [role='button'], [role='tab'], [role='menuitem'], [tabindex]": [{}],
      },
    });
    const paneButton = createFakeSurfaceElement({
      localName: "toolbarbutton",
      textContent: "Info",
      attributes: {
        "data-pane": "info",
        role: "tab",
        "aria-selected": "true",
      },
    });
    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: {
        async selectItemPane() {
          return {
            container: {
              sidenav: {
                querySelectorAll() {
                  return [paneButton];
                },
              },
            },
            pane: paneElement,
            button: paneButton,
            visible: true,
            activationStrategy: "host-api",
            actionElementObserved: true,
            actionDispatched: true,
          };
        },
        getMainWindow() {
          return {
            focus() {},
          };
        },
        buildSurfaceTarget() {
          return createSurfaceTarget("item-pane-sidenav", "surface-item-pane-info");
        },
      },
      reader: {},
      menuManager: {},
    });

    const result = await runner.runHostAction("itemPane.selectPane", {
      paneID: "info",
    });

    assert.equal(result.ok, true);
    assert.equal(result.readiness.ok, true);
    assert.equal(result.readiness.checks.find((entry) => entry.name === "sidenav-button-observed")?.ok, true);
    assert.equal(result.observedState.activationStrategy, "host-api");
    assert.equal(result.observedState.actionDispatched, true);
    assert.equal(result.observedState.edgeMode, "pane-attached");
    assert.equal(result.observedState.boundsSource, "surface-target-rect");
    assert.equal(result.observedState.degradedReason, null);
    assert.equal(result.observedState.paneSurface.childElementCount, 2);
  });

  it("should use a window-anchored item pane width fallback when captured bounds sit outside the window", async () => {
    const paneElement = createFakeSurfaceElement({
      localName: "item-pane-custom-section",
      childElementCount: 2,
      children: [{}, {}],
      textContent: "Workflow pane body",
      selectorMap: {
        "*": [{}, {}],
        "button, checkbox, input, select, textarea, radio, menulist, toolbarbutton, menuitem, [role='button'], [role='tab'], [role='menuitem'], [tabindex]": [{}],
      },
    });
    const paneButton = createFakeSurfaceElement({
      localName: "div",
      attributes: {
        "data-pane": "cleanroom-template@example.com:workflow",
      },
    });
    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: {
        async selectItemPane() {
          return {
            container: {
              sidenav: {
                querySelectorAll() {
                  return [paneButton];
                },
              },
            },
            pane: paneElement,
            button: paneButton,
            visible: true,
            activationStrategy: "dispatch-click",
            actionElementObserved: true,
            actionDispatched: true,
          };
        },
        getMainWindow() {
          return {
            focus() {},
          };
        },
        buildSurfaceTarget() {
          return {
            ...createSurfaceTargetWithDetails(
            "item-pane-sidenav",
            "surface-item-pane-workflow",
            {},
            {
              x: 895,
              y: 630,
              width: 289,
              height: 366,
              source: "element",
            },
            ),
            windowBounds: {
              x: 244,
              y: 30,
              width: 1000,
              height: 600,
              source: "window",
            },
          };
        },
      },
      reader: {},
      menuManager: {},
    });

    const result = await runner.runHostAction("itemPane.selectPane", {
      paneID: "workflow",
      activationPolicy: "ui-required",
    });

    assert.equal(result.ok, true);
    assert.equal(result.readiness.ok, true);
    assert.equal(result.observedState.boundsSource, "surface-target-width+window-bounds");
    assert.equal(result.observedState.degradedReason, null);
    assert.equal(result.observedState.bounds.width, 289);
  });

  it("should fail item pane ui-required activation when only the host api path is reported", async () => {
    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: {
        async selectItemPane() {
          return {
            container: {
              sidenav: {
                querySelectorAll() {
                  return [];
                },
              },
            },
            pane: createFakeSurfaceElement({
              childElementCount: 1,
              children: [{}],
              textContent: "Info pane",
              selectorMap: {
                "*": [{}],
                "description, .description, p, html\\:p": [{}],
              },
            }),
            visible: true,
            activationStrategy: "host-api",
            actionElementObserved: false,
            actionDispatched: true,
          };
        },
        getMainWindow() {
          return {
            focus() {},
          };
        },
        buildSurfaceTarget() {
          return createSurfaceTarget("item-pane-sidenav", "surface-item-pane-info");
        },
      },
      reader: {},
      menuManager: {},
    });

    const result = await runner.runHostAction("itemPane.selectPane", {
      paneID: "info",
      activationPolicy: "ui-required",
    });

    assert.equal(result.ok, false);
    assert.equal(result.failureKind, "ui-action-required");
    assert.equal(result.observedState.activationPolicy, "ui-required");
    assert.equal(result.observedState.activationStrategy, "host-api");
  });

  it("should resolve declarative item pane ids before delegating to the host", async () => {
    let selectedPaneID = null;
    const paneElement = createFakeSurfaceElement({
      childElementCount: 1,
      children: [{}],
      textContent: "Details pane body",
      selectorMap: {
        "*": [{}],
        "description, .description, p, html\\:p": [{}],
      },
    });
    const paneButton = createFakeSurfaceElement({
      localName: "toolbarbutton",
      textContent: "Details",
      attributes: {
        "data-pane": "cleanroom-template@example.com:demo-section",
        role: "tab",
        "aria-selected": "true",
      },
    });
    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: {
        async selectItemPane(paneID) {
          selectedPaneID = paneID;
          return {
            container: {
              sidenav: {
                querySelectorAll() {
                  return [paneButton];
                },
              },
            },
            pane: paneElement,
            button: paneButton,
            visible: true,
            activationStrategy: "click",
            actionElementObserved: true,
            actionDispatched: true,
          };
        },
        getMainWindow() {
          return {
            focus() {},
          };
        },
        buildSurfaceTarget() {
          return createSurfaceTarget("item-pane-sidenav", "surface-item-pane-demo-section");
        },
      },
      reader: {},
      menuManager: {},
      itemPane: {
        resolveSectionPaneID(paneID) {
          return paneID === "demo-section"
            ? "cleanroom-template@example.com:demo-section"
            : paneID;
        },
      },
    });

    const result = await runner.runHostAction("itemPane.selectPane", {
      paneID: "demo-section",
    });

    assert.equal(result.ok, true);
    assert.equal(selectedPaneID, "cleanroom-template@example.com:demo-section");
    assert.equal(result.observedState.paneID, "demo-section");
    assert.equal(
      result.observedState.resolvedPaneID,
      "cleanroom-template@example.com:demo-section",
    );
  });

  it("should verify reader sidebar structure beyond the selected view field", async () => {
    const panel = createFakeSurfaceElement({
      localName: "div",
      childElementCount: 1,
      children: [{}],
      textContent: "Annotation rows",
      selectorMap: {
        "*": [{}],
        "description, .description, p, html\\:p": [{}],
      },
    });
    const button = createFakeSurfaceElement({
      localName: "button",
      textContent: "Annotations",
      attributes: {
        role: "tab",
        "aria-selected": "true",
      },
    });
    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: {
        buildSurfaceTarget() {
          return createSurfaceTarget("reader-sidebar-view", "surface-reader-sidebar-annotations");
        },
      },
      reader: {
        async selectSidebarView() {
          return {
            button,
            panel,
            activationStrategy: "click",
            actionElementObserved: true,
            actionDispatched: true,
            uiState: {
              sidebarView: "annotations",
              sidebarOpen: true,
            },
          };
        },
      },
      menuManager: {},
    });

    const result = await runner.runHostAction("reader.sidebar.selectView", {
      target: "reader-tab-1",
      view: "annotations",
    });

    assert.equal(result.ok, true);
    assert.equal(result.readiness.ok, true);
    assert.equal(result.readiness.checks.find((entry) => entry.name === "sidebar-surface-content-observed")?.ok, true);
    assert.equal(result.observedState.activationStrategy, "click");
    assert.equal(result.observedState.actionDispatched, true);
  });

  it("should prefer the mounted context pane fragment as surface evidence when selecting a pane", async () => {
    const pane = createFakeSurfaceElement({
      localName: "info-box",
      childElementCount: 1,
      children: [{}],
      textContent: "Agent Visual Validation",
      selectorMap: {
        "*": [{}],
        "description, .description, p, html\\:p": [{}],
      },
    });
    const paneButton = createFakeSurfaceElement({
      localName: "toolbarbutton",
      textContent: "Info",
      attributes: {
        "data-pane": "info",
        role: "tab",
        "aria-selected": "true",
      },
    });
    let capturedTarget = null;
    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: {
        async selectContextPane() {
          return {
            tabID: "reader-tab-1",
            visible: true,
            pane,
            button: paneButton,
            container: {
              sidenav: {
                querySelectorAll() {
                  return [paneButton];
                },
              },
            },
            activationStrategy: "click",
            actionElementObserved: true,
            actionDispatched: true,
          };
        },
        getMainWindow() {
          return {
            focus() {},
          };
        },
        buildSurfaceTarget(input) {
          capturedTarget = input;
          return createSurfaceTargetWithDetails(
            input.surfaceId,
            input.captureKind,
            input.details,
          );
        },
      },
      reader: {},
      menuManager: {},
    });

    const result = await runner.runHostAction("contextPane.selectPane", {
      paneID: "info",
      activationPolicy: "ui-required",
    });

    assert.equal(result.ok, true);
    assert.equal(capturedTarget?.element, pane);
    assert.equal(result.surfaceTarget.details.surfaceEvidenceElement, "pane-fragment");
    assert.equal(result.observedState.edgeMode, "pane-attached");
    assert.equal(result.observedState.boundsSource, "surface-target-rect");
    assert.equal(result.observedState.minimumViableWidth, 240);
    assert.equal(result.observedState.degradedReason, null);
    assert.equal(result.surfaceTarget.captureKind, "surface-context-pane-info");
  });

  it("should keep context pane edge-mode explicit when the pane fragment is narrower than the minimum width", async () => {
    const pane = createFakeSurfaceElement({
      localName: "info-box",
      childElementCount: 1,
      children: [{}],
      textContent: "Narrow Context Pane",
      selectorMap: {
        "*": [{}],
        "description, .description, p, html\\:p": [{}],
      },
    });
    const paneButton = createFakeSurfaceElement({
      localName: "toolbarbutton",
      textContent: "Info",
      attributes: {
        "data-pane": "info",
        role: "tab",
        "aria-selected": "true",
      },
    });

    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: {
        async selectContextPane() {
          return {
            tabID: "reader-tab-1",
            visible: true,
            pane,
            button: paneButton,
            container: {
              sidenav: {
                querySelectorAll() {
                  return [paneButton];
                },
              },
            },
            activationStrategy: "click",
            actionElementObserved: true,
            actionDispatched: true,
          };
        },
        getMainWindow() {
          return {
            focus() {},
          };
        },
        buildSurfaceTarget(input) {
          return createSurfaceTargetWithDetails(
            input.surfaceId,
            input.captureKind,
            input.details,
            {
              x: 10,
              y: 10,
              width: 180,
              height: 160,
            },
          );
        },
      },
      reader: {},
      menuManager: {},
    });

    const result = await runner.runHostAction("contextPane.selectPane", {
      paneID: "info",
      activationPolicy: "ui-required",
    });

    assert.equal(result.ok, true);
    assert.equal(result.readiness.ok, true);
    assert.equal(result.observedState.edgeMode, "pane-attached");
    assert.equal(result.observedState.bounds.width, 180);
    assert.equal(result.observedState.degradedReason, "width-below-minimum");
    assert.equal(result.readiness.checks.find((entry) => entry.name === "context-pane-edge-geometry-ready")?.ok, true);
    assert.equal(result.surfaceTarget.details.degradedReason, "width-below-minimum");
  });

  it("should fall back to the live context sidenav when pane and pane button are unavailable", async () => {
    let capturedTarget = null;
    const sidenav = createFakeSurfaceElement({
      localName: "vbox",
      childElementCount: 1,
      children: [{}],
      textContent: "Info",
      selectorMap: {
        "*": [{}],
        "description, .description, p, html\\:p": [{}],
      },
    });
    sidenav.ownerGlobal = {
      focus() {},
    };

    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: {
        async selectContextPane() {
          return {
            tabID: "reader-tab-1",
            visible: true,
            pane: null,
            button: null,
            container: {
              sidenav,
            },
            activationStrategy: "click",
            actionElementObserved: true,
            actionDispatched: true,
          };
        },
        getMainWindow() {
          return null;
        },
        buildSurfaceTarget(input) {
          capturedTarget = input;
          return createSurfaceTargetWithDetails(
            input.surfaceId,
            input.captureKind,
            input.details,
          );
        },
      },
      reader: {},
      menuManager: {},
    });

    const result = await runner.runHostAction("contextPane.selectPane", {
      paneID: "info",
      activationPolicy: "ui-required",
    });

    assert.equal(result.ok, true);
    assert.equal(capturedTarget?.element, sidenav);
    assert.equal(capturedTarget?.window, sidenav.ownerGlobal);
    assert.equal(result.surfaceTarget.details.surfaceEvidenceElement, "pane-sidenav");
  });

  it("should clip overflowing context pane surface bounds to the visible window before capture", async () => {
    const pane = createFakeSurfaceElement({
      localName: "info-box",
      childElementCount: 1,
      children: [{}],
      textContent: "Context Pane Info",
      selectorMap: {
        "*": [{}],
        "description, .description, p, html\\:p": [{}],
      },
    });
    const paneButton = createFakeSurfaceElement({
      localName: "toolbarbutton",
      textContent: "Info",
      attributes: {
        "data-pane": "info",
        role: "tab",
        "aria-selected": "true",
      },
    });

    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: {
        async selectContextPane() {
          return {
            tabID: "reader-tab-1",
            visible: true,
            pane,
            button: paneButton,
            container: {
              sidenav: {
                querySelectorAll() {
                  return [paneButton];
                },
              },
            },
            activationStrategy: "click",
            actionElementObserved: true,
            actionDispatched: true,
          };
        },
        getMainWindow() {
          return {
            focus() {},
          };
        },
        buildSurfaceTarget(input) {
          const target = createSurfaceTargetWithDetails(
            input.surfaceId,
            input.captureKind,
            input.details,
            {
              x: 1149,
              y: 688,
              width: 896,
              height: 708,
            },
          );
          target.windowBounds = {
            x: 1141,
            y: 339,
            width: 927,
            height: 628,
            title: "Host Action Context Pane Smoke - Zotero",
            source: "window",
          };
          return target;
        },
      },
      reader: {},
      menuManager: {},
    });

    const result = await runner.runHostAction("contextPane.selectPane", {
      paneID: "info",
      activationPolicy: "ui-required",
    });

    assert.equal(result.ok, true);
    assert.equal(result.observedState.edgeMode, "pane-attached");
    assert.equal(result.observedState.boundsSource, "surface-target-rect+window-intersection");
    assert.equal(result.observedState.degradedReason, null);
    assert.deepEqual(result.observedState.bounds, {
      x: 1149,
      y: 688,
      width: 896,
      height: 279,
    });
    assert.deepEqual(result.surfaceTarget.rect, {
      x: 1149,
      y: 688,
      width: 896,
      height: 279,
      title: "Host Action Context Pane Smoke - Zotero",
      source: "surface-target-rect+window-intersection",
    });
    assert.equal(result.readiness.checks.find((entry) => entry.name === "context-pane-edge-geometry-ready")?.ok, true);
  });

  it("should accept reader sidebar DOM-open evidence when the host uiState flag is stale", async () => {
    const outerContainer = createFakeSurfaceElement({
      localName: "div",
      attributes: {
        id: "outerContainer",
        class: "sidebarOpen",
      },
    });
    const fakeDoc = {
      querySelector(selector) {
        if (selector === "#outerContainer") {
          return outerContainer;
        }
        return null;
      },
    };
    const button = createFakeSurfaceElement({
      localName: "button",
      textContent: "Thumbnails",
      attributes: {
        role: "radio",
        "aria-selected": "true",
        "data-l10n-id": "pdfjs-thumbs-button",
      },
    });
    button.ownerDocument = fakeDoc;

    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: {
        buildSurfaceTarget() {
          return createSurfaceTarget("reader-sidebar-view", "surface-reader-sidebar-thumbnails");
        },
      },
      reader: {
        async selectSidebarView() {
          return {
            button,
            panel: null,
            doc: fakeDoc,
            activationStrategy: "click",
            actionElementObserved: true,
            actionDispatched: true,
            uiState: {
              sidebarView: "thumbnails",
              sidebarOpen: false,
            },
          };
        },
      },
      menuManager: {},
    });

    const result = await runner.runHostAction("reader.sidebar.selectView", {
      target: "reader-tab-1",
      view: "thumbnails",
      activationPolicy: "ui-required",
    });

    assert.equal(result.ok, true);
    assert.equal(result.observedState.sidebarOpen, false);
    assert.equal(result.observedState.sidebarDomOpen, true);
    assert.equal(result.observedState.sidebarOpenObserved, true);
    assert.equal(result.observedState.edgeMode, "sidebar-attached");
    assert.equal(result.observedState.boundsSource, "surface-target-rect");
    assert.equal(result.observedState.bounds.width, 320);
    assert.equal(result.observedState.degradedReason, null);
    assert.equal(result.readiness.checks.find((entry) => entry.name === "sidebar-open-or-unknown")?.ok, true);
    assert.equal(result.readiness.checks.find((entry) => entry.name === "sidebar-edge-geometry-ready")?.ok, true);
  });

  it("should synthesize reader sidebar surface-local bounds from sidebar width and window bounds when rect capture is unavailable", async () => {
    const fakeDoc = {
      querySelector() {
        return null;
      },
    };
    const panel = createFakeSurfaceElement({
      localName: "div",
      childElementCount: 2,
      children: [{}, {}],
      textContent: "Sidebar panel",
      selectorMap: {
        "*": [{}, {}],
      },
    });
    panel.ownerDocument = fakeDoc;

    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: {
        buildSurfaceTarget(input) {
          return {
            surfaceId: input.surfaceId,
            captureKind: input.captureKind,
            label: input.captureKind,
            scope: "surface-local",
            rect: null,
            windowBounds: {
              x: 100,
              y: 50,
              width: 900,
              height: 600,
              title: "PDF.js viewer",
              source: "window",
            },
            details: { ...(input.details || {}) },
          };
        },
      },
      reader: {
        async selectSidebarView() {
          return {
            button: null,
            panel,
            doc: fakeDoc,
            activationStrategy: "click",
            actionElementObserved: true,
            actionDispatched: true,
            uiState: {
              sidebarView: "thumbnails",
              sidebarOpen: true,
              sidebarWidth: 280,
            },
          };
        },
      },
      menuManager: {},
    });

    const result = await runner.runHostAction("reader.sidebar.selectView", {
      target: "reader-tab-1",
      view: "thumbnails",
      activationPolicy: "ui-required",
    });

    assert.equal(result.ok, true);
    assert.equal(result.observedState.edgeMode, "sidebar-attached");
    assert.equal(result.observedState.boundsSource, "reader-ui-state-sidebarWidth+window-bounds");
    assert.equal(result.observedState.bounds.x, 100);
    assert.equal(result.observedState.bounds.y, 50);
    assert.equal(result.observedState.bounds.width, 280);
    assert.equal(result.observedState.bounds.height, 600);
    assert.equal(result.observedState.degradedReason, null);
    assert.equal(result.surfaceTarget.rect?.x, 100);
    assert.equal(result.surfaceTarget.rect?.y, 50);
    assert.equal(result.surfaceTarget.rect?.width, 280);
    assert.equal(result.surfaceTarget.rect?.height, 600);
    assert.equal(result.surfaceTarget.rect?.source, "reader-ui-state-sidebarWidth+window-bounds");
    assert.equal(result.surfaceTarget.details.surfaceEvidenceElement, "sidebar-panel");
    assert.equal(result.readiness.checks.find((entry) => entry.name === "sidebar-edge-geometry-ready")?.ok, true);
  });

  it("should prefer the reader sidebar panel as the surface-local evidence target when available", async () => {
    let capturedTarget = null;
    const button = createFakeSurfaceElement({
      localName: "button",
      textContent: "Thumbnails",
      attributes: {
        role: "radio",
        "aria-selected": "true",
      },
    });
    const panel = createFakeSurfaceElement({
      localName: "div",
      childElementCount: 2,
      children: [{}, {}],
      textContent: "Sidebar panel",
      selectorMap: {
        "*": [{}, {}],
      },
    });

    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: {
        buildSurfaceTarget(input) {
          capturedTarget = input;
          return createSurfaceTargetWithDetails(
            input.surfaceId,
            input.captureKind,
            input.details,
          );
        },
      },
      reader: {
        async selectSidebarView() {
          return {
            button,
            panel,
            activationStrategy: "click",
            actionElementObserved: true,
            actionDispatched: true,
            uiState: {
              sidebarView: "thumbnails",
              sidebarOpen: true,
            },
          };
        },
      },
      menuManager: {},
    });

    const result = await runner.runHostAction("reader.sidebar.selectView", {
      target: "reader-tab-1",
      view: "thumbnails",
      activationPolicy: "ui-required",
    });

    assert.equal(result.ok, true);
    assert.equal(capturedTarget?.element, panel);
    assert.equal(result.surfaceTarget.details.surfaceEvidenceElement, "sidebar-panel");
    assert.equal(result.observedState.edgeMode, "sidebar-attached");
    assert.equal(result.observedState.boundsSource, "surface-target-rect");
    assert.equal(result.observedState.degradedReason, null);
    assert.equal(result.surfaceTarget.captureKind, "surface-reader-sidebar-thumbnails");
  });

  it("should accept an already selected reader sidebar view under ui-required activation", async () => {
    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: {
        buildSurfaceTarget(input) {
          return createSurfaceTargetWithDetails(
            input.surfaceId,
            input.captureKind,
            input.details,
          );
        },
      },
      reader: {
        async selectSidebarView() {
          return {
            button: null,
            panel: null,
            alreadySatisfied: true,
            activationStrategy: null,
            actionElementObserved: false,
            actionDispatched: false,
            uiState: {
              sidebarView: "thumbnails",
              sidebarOpen: true,
              sidebarWidth: 240,
            },
          };
        },
      },
      menuManager: {},
    });

    const result = await runner.runHostAction("reader.sidebar.selectView", {
      target: "reader-tab-1",
      view: "thumbnails",
      activationPolicy: "ui-required",
    });

    assert.equal(result.ok, true);
    assert.equal(result.readiness.ok, true);
    assert.equal(result.observedState.activationStrategy, "already-selected");
    assert.equal(result.observedState.actionDispatched, true);
    assert.equal(result.surfaceTarget.details.surfaceEvidenceElement, "state-only");
  });

  it("should fail reader sidebar ui-required activation when only the host api path is reported", async () => {
    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: {
        buildSurfaceTarget() {
          return createSurfaceTarget("reader-sidebar-view", "surface-reader-sidebar-annotations");
        },
      },
      reader: {
        async selectSidebarView() {
          return {
            button: createFakeSurfaceElement({
              localName: "button",
              textContent: "Annotations",
              attributes: {
                role: "tab",
              },
            }),
            panel: createFakeSurfaceElement({
              localName: "div",
              childElementCount: 1,
              children: [{}],
              textContent: "Annotation rows",
              selectorMap: {
                "*": [{}],
              },
            }),
            activationStrategy: "host-api",
            actionElementObserved: true,
            actionDispatched: true,
            uiState: {
              sidebarView: "annotations",
              sidebarOpen: true,
            },
          };
        },
      },
      menuManager: {},
    });

    const result = await runner.runHostAction("reader.sidebar.selectView", {
      target: "reader-tab-1",
      view: "annotations",
      activationPolicy: "ui-required",
    });

    assert.equal(result.ok, false);
    assert.equal(result.failureKind, "ui-action-required");
    assert.equal(result.observedState.activationPolicy, "ui-required");
    assert.equal(result.observedState.activationStrategy, "host-api");
  });

  it("should trigger a reader toolbar button through click()", async () => {
    let clickCount = 0;
    const button = createFakeSurfaceElement({
      localName: "button",
      textContent: "Open Context Pane",
      attributes: {
        role: "button",
      },
    });
    button.click = () => {
      clickCount += 1;
    };
    button.ownerDocument = {
      defaultView: {
        focus() {},
      },
    };
    button.ownerGlobal = {
      focus() {},
    };

    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: {
        async waitFor(callback) {
          return await callback();
        },
        buildSurfaceTarget() {
          return createSurfaceTarget("render-toolbar", "surface-reader-toolbar-button");
        },
      },
      reader: {
        findToolbarElement() {
          return button;
        },
      },
      menuManager: {},
    });

    const result = await runner.runHostAction("reader.toolbar.triggerButton", {
      itemID: 1,
      selector: "[data-cleanroom-reader-toolbar-action='open-context-pane']",
    });

    assert.equal(result.ok, true);
    assert.equal(result.observedState.activationStrategy, "click");
    assert.equal(result.observedState.actionDispatched, true);
    assert.equal(clickCount, 1);
  });

  it("should trigger a reader toolbar button through dispatch-click fallback", async () => {
    let dispatchedTypes = [];
    class FakeMouseEvent {
      constructor(type) {
        this.type = type;
      }
    }
    const button = createFakeSurfaceElement({
      localName: "button",
      textContent: "Open Context Pane",
      attributes: {
        role: "button",
      },
    });
    button.dispatchEvent = (event) => {
      dispatchedTypes.push(event.type);
      return true;
    };
    button.ownerDocument = {
      defaultView: {
        focus() {},
        MouseEvent: FakeMouseEvent,
      },
    };
    button.ownerGlobal = {
      focus() {},
      MouseEvent: FakeMouseEvent,
    };

    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: {
        async waitFor(callback) {
          return await callback();
        },
        buildSurfaceTarget() {
          return createSurfaceTarget("render-toolbar", "surface-reader-toolbar-button");
        },
      },
      reader: {
        findToolbarElement() {
          return button;
        },
      },
      menuManager: {},
    });

    const result = await runner.runHostAction("reader.toolbar.triggerButton", {
      itemID: 1,
      selector: "[data-cleanroom-reader-toolbar-action='open-context-pane']",
    });

    assert.equal(result.ok, true);
    assert.equal(result.observedState.activationStrategy, "dispatch-click");
    assert.equal(result.observedState.actionDispatched, true);
    assert.deepEqual(dispatchedTypes, ["click"]);
  });

  it("should drive live menu actions and classify unknown actions", async () => {
    let clickCount = 0;
    let capturedTarget = null;
    class FakeMouseEvent {
      constructor(type) {
        this.type = type;
      }
    }
    class FakeEvent {
      constructor(type) {
        this.type = type;
      }
    }
    const menuElem = {
      localName: "menuitem",
      textContent: "Summary",
      dispatchEvent() {
        clickCount += 1;
      },
      getAttribute(name) {
        if (name === "label") {
          return "Summary";
        }
        return null;
      },
      matches(selector) {
        if (selector === "menuitem, [role='menuitem']") {
          return true;
        }
        return false;
      },
      querySelectorAll(selector) {
        if (selector === "*") {
          return [];
        }
        return [];
      },
      ownerGlobal: {
        focus() {},
        MouseEvent: FakeMouseEvent,
        Event: FakeEvent,
      },
      ownerDocument: {
        defaultView: {
          focus() {},
          MouseEvent: FakeMouseEvent,
          Event: FakeEvent,
        },
      },
    };
    const popupElem = {
      localName: "menupopup",
      childElementCount: 1,
      children: [{}],
      textContent: "Summary",
      getAttribute() {
        return null;
      },
      matches() {
        return false;
      },
      querySelectorAll(selector) {
        if (selector === "*") {
          return [{}];
        }
        if (selector === "menuitem, [role='menuitem']") {
          return [menuElem];
        }
        return [];
      },
    };
    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: {
        async resolveMenuPopup() {
          return {
            async open() {
              return {
                localName: "menupopup",
                childElementCount: 1,
                children: [{}],
                textContent: "Summary",
                getAttribute() {
                  return null;
                },
                matches() {
                  return false;
                },
                querySelectorAll(selector) {
                  if (selector === "*") {
                    return [{}];
                  }
                  if (selector === "menuitem, [role='menuitem']") {
                    return [menuElem];
                  }
                  return [];
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
            },
          };
        },
        async simulatePopupClose(popup) {
          return popup;
        },
        async waitFor(callback) {
          return await callback();
        },
        buildSurfaceTarget(input) {
          capturedTarget = input;
          return createSurfaceTargetWithDetails(
            input.surfaceId,
            "surface-menu-reader-view-cleanroomtemplate-reader-summary",
            input.details,
          );
        },
      },
      reader: {},
      menuManager: {
        getMenuRegistrationSnapshot() {
          return {
            target: "reader/menubar/view",
            menuPaths: ["0"],
          };
        },
        getLiveMenuState() {
          return {
            menuElem,
            popupElem,
            menuPath: "0",
            itemCount: 1,
            phase: "onShowing",
            tabID: "reader-tab-1",
            tabType: "reader",
          };
        },
      },
    });

    const triggerResult = await runner.runHostAction("menu.trigger", {
      menuID: "cleanroomtemplate-reader-summary",
      target: "reader/menubar/view",
    });
    const unknownResult = await runner.runHostAction("missing.action");

    assert.equal(triggerResult.ok, true);
    assert.equal(triggerResult.readiness.ok, true);
    assert.equal(triggerResult.readiness.checks.find((entry) => entry.name === "menu-item-actionable")?.ok, true);
    assert.equal(triggerResult.observedState.commandDispatched, true);
    assert.equal(triggerResult.observedState.activationStrategy, "command");
    assert.equal(triggerResult.observedState.popupHidden, true);
    assert.equal(triggerResult.observedState.targetScene, "reader-menubar-view");
    assert.equal(triggerResult.observedState.menuKind, "menuitem");
    assert.equal(triggerResult.observedState.menuPathDepth, 1);
    assert.equal(capturedTarget?.element, popupElem);
    assert.equal(capturedTarget?.surfaceId, "menu-item");
    assert.equal(triggerResult.surfaceTarget.details.surfaceEvidenceElement, "menu-popup");
    assert.ok(clickCount >= 2);
    assert.equal(unknownResult.ok, false);
    assert.equal(unknownResult.failureKind, "unknown-action");
  });

  it("should fall back to the live menu item when popup screen bounds are unavailable", async () => {
    let capturedTarget = null;
    const menuElem = {
      localName: "menuitem",
      textContent: "Summary",
      dispatchEvent() {},
      getAttribute(name) {
        return name === "label" ? "Summary" : null;
      },
      matches(selector) {
        return selector === "menuitem, [role='menuitem']";
      },
      querySelectorAll() {
        return [];
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
    const popupElem = {
      localName: "menupopup",
      childElementCount: 1,
      children: [{}],
      textContent: "Summary",
      getAttribute() {
        return null;
      },
      matches() {
        return false;
      },
      querySelectorAll(selector) {
        if (selector === "*") {
          return [{}];
        }
        if (selector === "menuitem, [role='menuitem']") {
          return [menuElem];
        }
        return [];
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

    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: {
        async resolveMenuPopup() {
          return {
            async open() {
              return popupElem;
            },
          };
        },
        async waitFor(callback) {
          return await callback();
        },
        getElementScreenRect(element) {
          if (element === menuElem) {
            return {
              x: 10,
              y: 20,
              width: 180,
              height: 32,
            };
          }
          return null;
        },
        buildSurfaceTarget(input) {
          capturedTarget = input;
          return createSurfaceTargetWithDetails(
            input.surfaceId,
            "surface-menu-reader-view-cleanroomtemplate-reader-summary",
            input.details,
          );
        },
      },
      reader: {},
      menuManager: {
        getMenuRegistrationSnapshot() {
          return {
            target: "reader/menubar/view",
            menuPaths: ["0"],
          };
        },
        getLiveMenuState() {
          return {
            menuElem,
            popupElem,
            menuPath: "0",
            itemCount: 1,
            phase: "onShowing",
            tabID: "reader-tab-1",
            tabType: "reader",
          };
        },
      },
    });

    const result = await runner.runHostAction("menu.show", {
      menuID: "cleanroomtemplate-reader-summary",
      target: "reader/menubar/view",
    });

    assert.equal(result.ok, true);
    assert.equal(capturedTarget?.element, menuElem);
    assert.equal(capturedTarget?.surfaceId, "menu-item");
    assert.equal(result.surfaceTarget.details.surfaceEvidenceElement, "menu-item");
  });

  it("should classify main/library/collection actions as collection-menu surfaces", async () => {
    let capturedTarget = null;
    const menuElem = {
      localName: "menuitem",
      textContent: "Collection Action",
      dispatchEvent() {},
      getAttribute(name) {
        return name === "label" ? "Collection Action" : null;
      },
      matches(selector) {
        return selector === "menuitem, [role='menuitem']";
      },
      querySelectorAll() {
        return [];
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
    const popupElem = {
      localName: "menupopup",
      childElementCount: 1,
      children: [menuElem],
      textContent: "Collection Action",
      getAttribute() {
        return null;
      },
      matches() {
        return false;
      },
      querySelectorAll(selector) {
        if (selector === "*") {
          return [menuElem];
        }
        if (selector === "menuitem, [role='menuitem']") {
          return [menuElem];
        }
        return [];
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

    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: {
        async resolveMenuPopup() {
          return {
            async open() {
              return popupElem;
            },
          };
        },
        async simulatePopupClose() {
          return true;
        },
        async waitFor(callback) {
          return await callback();
        },
        getElementScreenRect(element) {
          if (element === popupElem) {
            return {
              x: 10,
              y: 20,
              width: 240,
              height: 120,
            };
          }
          return null;
        },
        buildSurfaceTarget(input) {
          capturedTarget = input;
          return createSurfaceTargetWithDetails(
            input.surfaceId,
            "surface-menu-main-library-collection-cleanroomtemplate-collection-action",
            input.details,
          );
        },
      },
      reader: {},
      menuManager: {
        getMenuRegistrationSnapshot() {
          return {
            target: "main/library/collection",
            menuPaths: ["0"],
          };
        },
        getLiveMenuState() {
          return {
            menuElem,
            popupElem,
            menuPath: "0",
            itemCount: 0,
            phase: "onShowing",
            collectionTreeRowID: 42,
            collectionTreeRowType: "collection",
            resolvedMenu: {
              menuType: "menuitem",
              label: "Collection Action",
            },
          };
        },
      },
    });

    const result = await runner.runHostAction("menu.trigger", {
      menuID: "cleanroomtemplate-collection-action",
      target: "main/library/collection",
    });

    assert.equal(result.ok, true);
    assert.equal(result.surfaceTarget.surfaceId, "collection-menu");
    assert.equal(result.observedState.targetScene, "collection");
    assert.equal(result.observedState.collectionTreeRowID, 42);
    assert.equal(result.observedState.collectionTreeRowType, "collection");
    assert.equal(capturedTarget?.surfaceId, "collection-menu");
    assert.equal(result.surfaceTarget.details.surfaceEvidenceElement, "menu-popup");
  });

  it("should classify submenu path actions as menu-submenu surfaces and preserve menuPath metadata", async () => {
    let capturedTarget = null;
    const submenuPopup = {
      localName: "menupopup",
      childElementCount: 2,
      children: [{}, {}],
      textContent: "Rebuild Collection Index Inspect Collection",
      getAttribute() {
        return null;
      },
      matches() {
        return false;
      },
      querySelectorAll(selector) {
        if (selector === "*") {
          return [{}, {}];
        }
        if (selector === "menuitem, [role='menuitem']") {
          return [{}, {}];
        }
        return [];
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
    const menuElem = {
      localName: "menu",
      textContent: "Collection Actions",
      menupopup: submenuPopup,
      popup: submenuPopup,
      dispatchEvent() {},
      getAttribute(name) {
        return name === "label" ? "Collection Actions" : null;
      },
      matches() {
        return false;
      },
      querySelectorAll(selector) {
        if (selector === "*") {
          return [{}, {}];
        }
        return [];
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
    const childMenuElem = {
      localName: "menuitem",
      textContent: "Rebuild Collection Index",
      dispatchEvent() {},
      getAttribute(name) {
        return name === "label" ? "Rebuild Collection Index" : null;
      },
      matches(selector) {
        return selector === "menuitem, [role='menuitem']";
      },
      querySelectorAll() {
        return [];
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
    submenuPopup.children = [childMenuElem, {}];

    const rootPopup = {
      localName: "menupopup",
      childElementCount: 1,
      children: [menuElem],
      textContent: "Collection Actions",
      getAttribute() {
        return null;
      },
      matches() {
        return false;
      },
      querySelectorAll(selector) {
        if (selector === "*") {
          return [menuElem];
        }
        return [];
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

    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: {
        async resolveMenuPopup() {
          return {
            async open() {
              return rootPopup;
            },
          };
        },
        async simulatePopupClose() {
          return true;
        },
        async waitFor(callback) {
          return await callback();
        },
        getElementScreenRect(element) {
          if (element === submenuPopup) {
            return {
              x: 10,
              y: 20,
              width: 220,
              height: 90,
            };
          }
          return null;
        },
        buildSurfaceTarget(input) {
          capturedTarget = input;
          return createSurfaceTargetWithDetails(
            input.surfaceId,
            "surface-menu-main-library-collection-cleanroomtemplate-dynamic-submenu",
            input.details,
          );
        },
      },
      reader: {},
      menuManager: {
        getMenuRegistrationSnapshot() {
          return {
            target: "main/library/collection",
            menuPaths: ["0", "0.0", "0.1"],
          };
        },
        getLiveMenuState(_menuID, menuPath) {
          if (menuPath === "0.0") {
            return {
              menuElem: childMenuElem,
              popupElem: submenuPopup,
              menuPath: "0.0",
              itemCount: 0,
              phase: "dynamic-rebuild",
              collectionTreeRowID: 42,
              collectionTreeRowType: "collection",
              resolvedMenu: {
                menuType: "menuitem",
                label: "Rebuild Collection Index",
              },
            };
          }
          return {
            menuElem,
            popupElem: rootPopup,
            menuPath: "0",
            itemCount: 0,
            phase: "onShowing",
            collectionTreeRowID: 42,
            collectionTreeRowType: "collection",
            resolvedMenu: {
              menuType: "submenu",
              label: "Collection Actions",
            },
          };
        },
      },
    });

    const result = await runner.runHostAction("menu.trigger", {
      menuID: "cleanroomtemplate-dynamic-submenu",
      target: "main/library/collection",
      menuPath: "0.0",
    });

    assert.equal(result.ok, true);
    assert.equal(result.surfaceTarget.surfaceId, "menu-submenu");
    assert.equal(result.observedState.menuKind, "submenu");
    assert.equal(result.observedState.menuPath, "0.0");
    assert.equal(result.observedState.menuPathDepth, 2);
    assert.equal(result.observedState.targetScene, "collection");
    assert.equal(capturedTarget?.surfaceId, "menu-submenu");
    assert.equal(result.surfaceTarget.details.surfaceEvidenceElement, "menu-submenu-popup");
  });
});
