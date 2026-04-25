/**
 * main.js 启动路径测试
 */
import { describe, it, beforeEach, afterEach, assert } from "./test-framework.js";

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createConfig() {
  return {
    addonName: "Cleanroom Template",
    addonId: "cleanroom-template@example.com",
    addonRef: "cleanroomtemplate",
    addonVersion: "0.1.0",
    description: "test",
    author: "test",
    homepage: "https://example.com",
    updateURL: "https://example.com/downloads/cleanroomtemplate/update.json",
    strictMinVersion: "6.999",
    strictMaxVersion: "8.*",
    prefsPrefix: "extensions.zotero.cleanroomtemplate",
    instanceKey: "CleanroomTemplate",
    icons: {
      "48": "content/icons/icon-48.png",
      "96": "content/icons/icon-96.png",
    },
    defaultPrefs: {
      enabled: true,
      menuLabel: "",
      logLevel: "info",
      themeMode: "follow-host",
    },
  };
}

async function loadMainModule(tag) {
  return import(new URL(`../src/main.js?${tag}`, import.meta.url));
}

describe("Main Bootstrap", () => {
  let startupReady;
  let preferenceRegistrations;
  let promptRegistrations;
  let menuRegistrations;

  beforeEach(() => {
    startupReady = {
      initialization: createDeferred(),
      unlock: createDeferred(),
      uiReady: createDeferred(),
    };

    preferenceRegistrations = [];
    promptRegistrations = [];
    menuRegistrations = [];

    globalThis.__CLEANROOM_TEMPLATE_CONFIG__ = createConfig();
    globalThis.__CLEANROOM_TEMPLATE_RUNTIME__ = {
      rootURI: "chrome://cleanroomtemplate/",
    };

    globalThis.Services = {
      locale: {
        appLocaleAsBCP47: "en-US",
      },
      appinfo: {
        OS: "Linux",
      },
      prompt: {
        alert() {},
      },
      prefs: {
        prefHasUserValue() {
          return false;
        },
        getBoolPref(key, fallback) {
          return fallback;
        },
        getIntPref(key, fallback) {
          return fallback;
        },
        getStringPref(key, fallback) {
          return fallback;
        },
        setBoolPref() {},
        setIntPref() {},
        setStringPref() {},
        clearUserPref() {},
        addObserver() {},
        removeObserver() {},
      },
    };

    globalThis.Zotero = {
      initializationPromise: startupReady.initialization.promise,
      unlockPromise: startupReady.unlock.promise,
      uiReadyPromise: startupReady.uiReady.promise,
      debug() {},
      getMainWindows() {
        return [];
      },
      getMainWindow() {
        return null;
      },
      PreferencePanes: {
        async register(options) {
          preferenceRegistrations.push(options);
          return options.id;
        },
        unregister() {},
      },
      Prompt: {
        register(items) {
          promptRegistrations.push(items);
        },
      },
      MenuManager: {
        registerMenu(options) {
          menuRegistrations.push(options);
          return true;
        },
        unregisterMenu() {},
      },
    };
  });

  afterEach(() => {
    delete globalThis.__CLEANROOM_TEMPLATE_CONFIG__;
    delete globalThis.__CLEANROOM_TEMPLATE_RUNTIME__;
    delete globalThis.Services;
    delete globalThis.Zotero;
  });

  it("should bootstrap once and mount addon instance on Zotero", async () => {
    const { bootstrapPlugin } = await loadMainModule(`bootstrap-once-${Date.now()}`);

    startupReady.initialization.resolve();
    startupReady.unlock.resolve();
    startupReady.uiReady.resolve();

    await bootstrapPlugin();

    assert.ok(globalThis.Zotero.CleanroomTemplate);
    assert.typeOf(globalThis.Zotero.CleanroomTemplate.onWindowLoad, "function");
    assert.typeOf(globalThis.Zotero.CleanroomTemplate.onWindowUnload, "function");
    assert.typeOf(globalThis.Zotero.CleanroomTemplate.shutdown, "function");
    assert.ok(globalThis.Zotero.CleanroomTemplate.api);
    assert.equal(preferenceRegistrations.length, 1);
    assert.equal(promptRegistrations.length, 4);
    assert.equal(menuRegistrations.length, 2);
  });

  it("should ignore repeated bootstrap calls in the same module instance", async () => {
    const { bootstrapPlugin } = await loadMainModule(`bootstrap-repeat-${Date.now()}`);

    startupReady.initialization.resolve();
    startupReady.unlock.resolve();
    startupReady.uiReady.resolve();

    await bootstrapPlugin();
    const firstInstance = globalThis.Zotero.CleanroomTemplate;
    await bootstrapPlugin();

    assert.equal(globalThis.Zotero.CleanroomTemplate, firstInstance);
    assert.equal(preferenceRegistrations.length, 1);
    assert.equal(promptRegistrations.length, 4);
    assert.equal(menuRegistrations.length, 2);
  });

  it("should clear failed bootstrap state and allow retry", async () => {
    const { bootstrapPlugin } = await loadMainModule(`bootstrap-retry-${Date.now()}`);

    startupReady.initialization.resolve();
    startupReady.unlock.resolve();
    startupReady.uiReady.reject(new Error("ui not ready"));
    startupReady.uiReady.promise.catch(() => {});

    let caught = null;
    try {
      await bootstrapPlugin();
    } catch (error) {
      caught = error;
    }

    assert.ok(caught instanceof Error);
    assert.equal(caught.message, "ui not ready");
    assert.equal(globalThis.Zotero.CleanroomTemplate, undefined);

    globalThis.Zotero.uiReadyPromise = Promise.resolve();
    await bootstrapPlugin();

    assert.ok(globalThis.Zotero.CleanroomTemplate);
    assert.equal(preferenceRegistrations.length, 1);
    assert.equal(promptRegistrations.length, 4);
    assert.equal(menuRegistrations.length, 2);
  });

  it("should clear cached plugin state on shutdown so bootstrap can mount again", async () => {
    const { bootstrapPlugin } = await loadMainModule(`bootstrap-shutdown-${Date.now()}`);

    startupReady.initialization.resolve();
    startupReady.unlock.resolve();
    startupReady.uiReady.resolve();

    await bootstrapPlugin();
    const firstInstance = globalThis.Zotero.CleanroomTemplate;
    await firstInstance.shutdown();

    assert.equal(globalThis.Zotero.CleanroomTemplate, undefined);

    await bootstrapPlugin();

    assert.ok(globalThis.Zotero.CleanroomTemplate);
    assert.ok(globalThis.Zotero.CleanroomTemplate !== firstInstance);
    assert.equal(preferenceRegistrations.length, 2);
  });
});
