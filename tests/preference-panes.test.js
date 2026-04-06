import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { describe, it, beforeEach, afterEach, assert } from "./test-framework.js";
import { createPreferencePanes } from "../src/features/preference-panes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

describe("Preference Panes", () => {
  let registrations;
  let unregistrations;
  let warnings;

  beforeEach(() => {
    registrations = [];
    unregistrations = [];
    warnings = [];
    delete globalThis.Zotero;

    globalThis.Zotero = {
      PreferencePanes: {
        async register(options) {
          registrations.push(options);
          return options.id || `pane-${registrations.length}`;
        },
        unregister(id) {
          unregistrations.push(id);
        },
      },
    };
  });

  afterEach(() => {
    delete globalThis.Zotero;
  });

  it("should register onPreferenceLoad panes through the internal bridge and expose load context", async () => {
    const preferencePanes = createPreferencePanes({
      logger: {
        warn(message, details) {
          warnings.push({ message, details });
        },
      },
      pluginID: "cleanroom-template@example.com",
      rootURI: "chrome://cleanroomtemplate/",
    });

    let loadContext = null;
    const paneId = await preferencePanes.registerPane({
      id: "cleanroomtemplate-preferences",
      src: "content/preferences.xhtml",
      onPreferenceLoad(context) {
        loadContext = context;
      },
    });

    assert.equal(paneId, "cleanroomtemplate-preferences");
    assert.deepEqual(registrations[0].scripts, [
      "chrome://cleanroomtemplate/content/preference-pane-load-bridge.js",
    ]);
    assert.equal(typeof globalThis.Zotero.__CLEANROOM_PREFERENCE_PANE_LOAD_API__.invoke, "function");

    await globalThis.Zotero.__CLEANROOM_PREFERENCE_PANE_LOAD_API__.invoke({
      window: {
        document: {},
      },
      paneID: paneId,
      pluginID: "cleanroom-template@example.com",
    });

    assert.ok(loadContext);
    assert.equal(loadContext.paneID, paneId);
    assert.equal(loadContext.pluginID, "cleanroom-template@example.com");
    assert.equal(
      loadContext.resolveURI("content/preferences.js"),
      "chrome://cleanroomtemplate/content/preferences.js",
    );
    assert.deepEqual(warnings, []);
  });

  it("should preserve legacy scripts when onPreferenceLoad is not provided", async () => {
    const preferencePanes = createPreferencePanes({
      pluginID: "cleanroom-template@example.com",
      rootURI: "chrome://cleanroomtemplate/",
    });

    await preferencePanes.registerPane({
      id: "legacy-pane",
      src: "content/preferences.xhtml",
      scripts: ["content/theme.js", "content/preferences.js"],
    });

    assert.deepEqual(registrations[0].scripts, [
      "chrome://cleanroomtemplate/content/theme.js",
      "chrome://cleanroomtemplate/content/preferences.js",
    ]);
  });

  it("should warn and ignore legacy scripts when onPreferenceLoad is provided", async () => {
    const preferencePanes = createPreferencePanes({
      logger: {
        warn(message, details) {
          warnings.push({ message, details });
        },
      },
      pluginID: "cleanroom-template@example.com",
      rootURI: "chrome://cleanroomtemplate/",
    });

    await preferencePanes.registerPane({
      id: "hybrid-pane",
      src: "content/preferences.xhtml",
      scripts: ["content/theme.js", "content/preferences.js"],
      onPreferenceLoad() {},
    });

    assert.deepEqual(registrations[0].scripts, [
      "chrome://cleanroomtemplate/content/preference-pane-load-bridge.js",
    ]);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].message, "preferencePanes.registerPane.scriptsIgnoredForOnPreferenceLoad");
  });

  it("should invoke the load bridge after the pane load event fires", async () => {
    const source = fs.readFileSync(
      path.join(projectRoot, "addon-static", "content", "preference-pane-load-bridge.js"),
      "utf-8",
    );
    const paneTarget = {
      parentNode: null,
    };
    const listeners = new Map();
    let waitedPromise = null;
    let invokedContext = null;
    const loadApi = {
      invoke(context) {
        invokedContext = context;
        return Promise.resolve("loaded");
      },
    };

    const preferenceWindow = {
      document: {
        addEventListener(type, handler) {
          listeners.set(type, handler);
        },
        removeEventListener(type) {
          listeners.delete(type);
        },
      },
      Services: {
        __CLEANROOM_PREFERENCE_PANE_LOAD_API__: loadApi,
      },
      Zotero: {
        __CLEANROOM_PREFERENCE_PANE_LOAD_API__: loadApi,
      },
      Zotero_Preferences: {
        panes: new Map(),
      },
    };
    const sandbox = {
      window: preferenceWindow,
      globalThis: null,
      Services: preferenceWindow.Services,
      Zotero: preferenceWindow.Zotero,
    };
    const pane = {
      id: "cleanroomtemplate-preferences",
      pluginID: "cleanroom-template@example.com",
      scope: null,
      container: {
        contains(target) {
          return target === paneTarget;
        },
      },
    };
    preferenceWindow.Zotero_Preferences.panes.set(pane.id, pane);

    const context = vm.createContext(sandbox);
    const contextGlobal = vm.runInContext("globalThis", context);
    sandbox.globalThis = contextGlobal;
    pane.scope = contextGlobal;

    vm.runInContext(source, context, {
      filename: "preference-pane-load-bridge.js",
    });

    listeners.get("load")({
      target: paneTarget,
      waitUntil(promise) {
        waitedPromise = promise;
      },
    });

    assert.deepEqual(invokedContext, {
      window: preferenceWindow,
      paneID: "cleanroomtemplate-preferences",
      pluginID: "cleanroom-template@example.com",
    });
    assert.ok(waitedPromise instanceof Promise);
    await waitedPromise;
  });

  it("should invoke the load bridge immediately when the pane is already mounted", async () => {
    const source = fs.readFileSync(
      path.join(projectRoot, "addon-static", "content", "preference-pane-load-bridge.js"),
      "utf-8",
    );
    let invokedContext = null;
    const loadApi = {
      invoke(context) {
        invokedContext = context;
        return Promise.resolve("loaded");
      },
    };

    const preferenceWindow = {
      document: {
        addEventListener() {},
        removeEventListener() {},
      },
      Services: {
        __CLEANROOM_PREFERENCE_PANE_LOAD_API__: loadApi,
      },
      Zotero: {
        __CLEANROOM_PREFERENCE_PANE_LOAD_API__: loadApi,
      },
      Zotero_Preferences: {
        panes: new Map(),
      },
    };
    const sandbox = {
      window: preferenceWindow,
      Services: preferenceWindow.Services,
      Zotero: preferenceWindow.Zotero,
      Promise,
    };
    const pane = {
      id: "cleanroomtemplate-preferences",
      pluginID: "cleanroom-template@example.com",
      scope: null,
      container: {
        childElementCount: 1,
      },
    };
    preferenceWindow.Zotero_Preferences.panes.set(pane.id, pane);

    const context = vm.createContext(sandbox);
    const contextGlobal = vm.runInContext("globalThis", context);
    pane.scope = contextGlobal;

    vm.runInContext(source, context, {
      filename: "preference-pane-load-bridge.js",
    });
    await Promise.resolve();

    assert.deepEqual(invokedContext, {
      window: preferenceWindow,
      paneID: "cleanroomtemplate-preferences",
      pluginID: "cleanroom-template@example.com",
    });
  });

  it("should resolve the current pane from navigation when the bridge runs outside pane scope", async () => {
    const source = fs.readFileSync(
      path.join(projectRoot, "addon-static", "content", "preference-pane-load-bridge.js"),
      "utf-8",
    );
    let invokedContext = null;
    const loadApi = {
      invoke(context) {
        invokedContext = context;
        return Promise.resolve("loaded");
      },
    };

    const preferenceWindow = {
      document: {
        addEventListener() {},
        removeEventListener() {},
      },
      Services: {
        __CLEANROOM_PREFERENCE_PANE_LOAD_API__: loadApi,
      },
      Zotero: {
        __CLEANROOM_PREFERENCE_PANE_LOAD_API__: loadApi,
      },
      Zotero_Preferences: {
        navigation: {
          value: "cleanroomtemplate-preferences",
          },
        panes: new Map(),
      },
    };
    const sandbox = {
      window: preferenceWindow,
      Services: preferenceWindow.Services,
      Zotero: preferenceWindow.Zotero,
      Promise,
    };
    const pane = {
      id: "cleanroomtemplate-preferences",
      pluginID: "cleanroom-template@example.com",
      scope: { unrelated: true },
      container: {
        childElementCount: 1,
      },
    };
    preferenceWindow.Zotero_Preferences.panes.set(pane.id, pane);

    const context = vm.createContext(sandbox);
    vm.runInContext(source, context, {
      filename: "preference-pane-load-bridge.js",
    });
    await Promise.resolve();

    assert.deepEqual(invokedContext, {
      window: preferenceWindow,
      paneID: "cleanroomtemplate-preferences",
      pluginID: "cleanroom-template@example.com",
    });
  });
});
