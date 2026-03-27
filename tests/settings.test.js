import { describe, it, beforeEach, assert } from "./test-framework.js";
import { createSettingsSystem } from "../src/settings/index.js";

let prefValues = new Map();
let observers = new Map();

function notify(changedKey) {
  for (const [branch, branchObservers] of observers.entries()) {
    if (!String(changedKey).startsWith(branch)) {
      continue;
    }
    for (const observer of branchObservers) {
      observer.observe(null, "nsPref:changed", changedKey);
    }
  }
}

describe("Settings", () => {
  beforeEach(() => {
    prefValues = new Map();
    observers = new Map();

    globalThis.Services = {
      prefs: {
        prefHasUserValue(key) {
          return prefValues.has(key);
        },
        getBoolPref(key, fallback) {
          return prefValues.has(key) ? prefValues.get(key) : fallback;
        },
        getIntPref(key, fallback) {
          return prefValues.has(key) ? prefValues.get(key) : fallback;
        },
        getStringPref(key, fallback) {
          return prefValues.has(key) ? prefValues.get(key) : fallback;
        },
        setBoolPref(key, value) {
          prefValues.set(key, value);
          notify(key);
        },
        setIntPref(key, value) {
          prefValues.set(key, value);
          notify(key);
        },
        setStringPref(key, value) {
          prefValues.set(key, value);
          notify(key);
        },
        clearUserPref(key) {
          prefValues.delete(key);
        },
        addObserver(branch, observer) {
          const entries = observers.get(branch) || [];
          entries.push(observer);
          observers.set(branch, entries);
        },
        removeObserver(branch, observer) {
          const entries = observers.get(branch) || [];
          observers.set(branch, entries.filter((item) => item !== observer));
        },
      },
    };
  });

  it("should derive schema metadata from default prefs", () => {
    const settings = createSettingsSystem({
      prefBranch: "test",
      defaultPrefs: {
        enabled: true,
        menuLabel: "",
        logLevel: "info",
      },
    });

    const definitions = settings.listDefinitions();
    assert.equal(definitions.length, 3);
    assert.equal(settings.getDefinition("enabled").group, "core");
    assert.equal(settings.getDefinition("menuLabel").group, "ui");
    assert.equal(settings.getDefinition("logLevel").type, "string");
  });

  it("should validate enum setting values", () => {
    const settings = createSettingsSystem({
      prefBranch: "test",
      defaultPrefs: {
        logLevel: "info",
      },
      schemaDefinitions: [
        {
          key: "logLevel",
          type: "string",
          allowedValues: ["debug", "info", "warn", "error"],
        },
      ],
    });

    settings.set("logLevel", "warn");
    assert.equal(settings.get("logLevel"), "warn");
    assert.throws(() => {
      settings.set("logLevel", "trace");
    });
  });

  it("should reset invalid persisted values to defaults during ensureDefaults", () => {
    prefValues.set("test.logLevel", "trace");

    const settings = createSettingsSystem({
      prefBranch: "test",
      defaultPrefs: {
        logLevel: "info",
      },
      schemaDefinitions: [
        {
          key: "logLevel",
          type: "string",
          allowedValues: ["debug", "info", "warn", "error"],
        },
      ],
    });

    settings.ensureDefaults();
    assert.equal(prefValues.get("test.logLevel"), "info");
  });

  it("should support rich onChange callbacks with definitions", () => {
    const settings = createSettingsSystem({
      prefBranch: "test",
      defaultPrefs: {
        enabled: true,
      },
    });
    let changedKey = null;
    let changedGroup = null;

    settings.onChange((key, definition) => {
      changedKey = key;
      changedGroup = definition?.group || null;
    }, {
      withDefinition: true,
    });

    settings.set("enabled", false);
    assert.equal(changedKey, "enabled");
    assert.equal(changedGroup, "core");
  });

  it("should apply settings migrations between schema versions", () => {
    prefValues.set("test.__settingsSchemaVersion", 1);
    prefValues.set("test.menuLabel", "legacy");

    const settings = createSettingsSystem({
      prefBranch: "test",
      defaultPrefs: {
        menuLabel: "",
      },
      schemaVersion: 2,
      settingsSchemaVersion: 2,
      migrations: [
        {
          id: "menu-label-trim",
          from: 1,
          to: 2,
          run({ services, prefBranch }) {
            services.prefs.setStringPref(`${prefBranch}.menuLabel`, "migrated");
          },
        },
      ],
    });

    const summary = settings.getMigrationSummary();
    assert.equal(summary.status, "migrated");
    assert.equal(summary.toVersion, 2);
    assert.equal(prefValues.get("test.__settingsSchemaVersion"), 2);
    assert.equal(settings.get("menuLabel"), "migrated");
  });
});
