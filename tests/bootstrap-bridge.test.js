import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { describe, it, assert } from "./test-framework.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function loadBootstrapSource() {
  return fs.readFileSync(
    path.join(projectRoot, "addon-static", "bootstrap.js"),
    "utf-8",
  )
    .replaceAll("__ADDON_REF__", "cleanroomtemplate")
    .replaceAll("__INSTANCE_KEY__", "CleanroomTemplate");
}

function loadBootstrapBaselineTemplate() {
  return fs.readFileSync(
    path.join(projectRoot, "scripts", "baselines", "bootstrap.js.txt"),
    "utf-8",
  );
}

function createBootstrapHarness(options = {}) {
  let registerChromeCalls = 0;
  let destructCalls = 0;
  let bootstrapInvoked = 0;
  let pluginShutdowns = 0;
  const debugLogs = [];
  const errorLogs = [];

  const chromeGlobal = {
    Zotero: {},
  };

  const context = {
    globalThis: chromeGlobal,
    Zotero: chromeGlobal.Zotero,
    Services: {
      io: {
        newURI(spec) {
          return spec;
        },
      },
      scriptloader: {
        loadSubScript(scriptURI, scope) {
          scope.__CLEANROOM_TEMPLATE_CONFIG__ = {
            instanceKey: "CleanroomTemplate",
          };
          scope.bootstrapPlugin = async () => {
            bootstrapInvoked += 1;
            assert.equal(
              chromeGlobal.__CLEANROOM_TEMPLATE_RUNTIME__.rootURI,
              "resource://cleanroom/",
            );
            assert.equal(
              chromeGlobal.__CLEANROOM_TEMPLATE_CONFIG__.instanceKey,
              "CleanroomTemplate",
            );
            chromeGlobal.Zotero.CleanroomTemplate = {
              api: {},
              async shutdown() {
                pluginShutdowns += 1;
              },
            };
          };
        },
      },
    },
    ChromeUtils: {},
    Components: {
      classes: {
        "@mozilla.org/addons/addon-manager-startup;1": {
          getService() {
            return {
              registerChrome() {
                registerChromeCalls += 1;
                return {
                  destruct() {
                    destructCalls += 1;
                  },
                };
              },
            };
          },
        },
      },
      interfaces: {
        amIAddonManagerStartup: Symbol("amIAddonManagerStartup"),
      },
    },
  };

  chromeGlobal.Zotero.debug = (message) => {
    debugLogs.push(String(message));
  };
  chromeGlobal.Zotero.logError = (message) => {
    errorLogs.push(String(message));
  };

  if (!options.omitConsole) {
    context.console = console;
  }

  vm.createContext(context);
  vm.runInContext(loadBootstrapSource(), context);

  return {
    context,
    chromeGlobal,
    get registerChromeCalls() {
      return registerChromeCalls;
    },
    get destructCalls() {
      return destructCalls;
    },
    get bootstrapInvoked() {
      return bootstrapInvoked;
    },
    get pluginShutdowns() {
      return pluginShutdowns;
    },
    get debugLogs() {
      return debugLogs;
    },
    get errorLogs() {
      return errorLogs;
    },
  };
}

describe("Bootstrap Bridge", () => {
  it("should keep bootstrap baseline template in sync with addon-static bootstrap file", () => {
    const addonBootstrap = fs.readFileSync(
      path.join(projectRoot, "addon-static", "bootstrap.js"),
      "utf-8",
    );

    assert.equal(loadBootstrapBaselineTemplate(), addonBootstrap);
  });

  it("should bridge runtime data onto the chrome global before plugin bootstrap", async () => {
    const harness = createBootstrapHarness();

    await harness.context.startup({ rootURI: "resource://cleanroom/" }, 0);

    assert.equal(harness.registerChromeCalls, 1);
    assert.equal(harness.bootstrapInvoked, 1);
    assert.ok(harness.chromeGlobal.__CLEANROOM_TEMPLATE_RUNTIME__);
    assert.equal(
      harness.chromeGlobal.__CLEANROOM_TEMPLATE_RUNTIME__.rootURI,
      "resource://cleanroom/",
    );
    assert.equal(
      harness.chromeGlobal.__CLEANROOM_TEMPLATE_CONFIG__.instanceKey,
      "CleanroomTemplate",
    );
    assert.equal(
      harness.chromeGlobal.__CLEANROOM_TEMPLATE_RUNTIME__.capabilityReport.status,
      "healthy",
    );
    assert.deepEqual(
      harness.chromeGlobal.__CLEANROOM_TEMPLATE_RUNTIME__.capabilityReport.missingRequired,
      [],
    );
    assert.ok(harness.chromeGlobal.Zotero.CleanroomTemplate);
  });

  it("should clear bridged globals during shutdown", async () => {
    const harness = createBootstrapHarness();

    await harness.context.startup({ rootURI: "resource://cleanroom/" }, 0);
    await harness.context.shutdown({}, 0);

    assert.equal(harness.pluginShutdowns, 1);
    assert.equal(harness.destructCalls, 1);
    assert.equal(harness.chromeGlobal.__CLEANROOM_TEMPLATE_RUNTIME__, undefined);
    assert.equal(harness.chromeGlobal.__CLEANROOM_TEMPLATE_CONFIG__, undefined);
    assert.equal(harness.chromeGlobal.Zotero.CleanroomTemplate, undefined);
  });

  it("should start without a global console in the native plugin sandbox", async () => {
    const harness = createBootstrapHarness({ omitConsole: true });

    await harness.context.startup({ rootURI: "resource://cleanroom/" }, 0);

    assert.equal(harness.bootstrapInvoked, 1);
    assert.ok(harness.chromeGlobal.Zotero.CleanroomTemplate);
    assert.equal(
      harness.chromeGlobal.__CLEANROOM_TEMPLATE_RUNTIME__.capabilityReport.injected.some(
        (entry) => entry.key === "console" && entry.source === "console-bridge",
      ),
      true,
    );
    assert.equal(harness.debugLogs.length, 1);
    assert.deepEqual(harness.errorLogs, []);
  });
});
