var chromeHandle;
var runtimeBridge;

function install() {}
function uninstall() {}

function _getChromeGlobal() {
  if (typeof globalThis !== "undefined") {
    return globalThis;
  }
  return this;
}

function _stringifyConsoleValue(value) {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  }
  catch (error) {
    return String(value);
  }
}

function _getZotero(chromeGlobal) {
  if (typeof Zotero !== "undefined" && Zotero) {
    return Zotero;
  }
  return chromeGlobal && chromeGlobal.Zotero
    ? chromeGlobal.Zotero
    : null;
}

function _logBootstrapEvent(level, event, details, chromeGlobal) {
  var zotero = _getZotero(chromeGlobal);
  var payload = {
    event: String(event || "unknown"),
  };

  if (details && typeof details === "object") {
    for (var key in details) {
      if (Object.prototype.hasOwnProperty.call(details, key)) {
        payload[key] = details[key];
      }
    }
  }

  var message = "[cleanroom.bootstrap] " + payload.event;
  if (typeof JSON !== "undefined" && JSON && typeof JSON.stringify === "function") {
    try {
      message += " " + JSON.stringify(payload);
    }
    catch (error) {
      message += " " + _stringifyConsoleValue(payload);
    }
  }

  if (level === "error") {
    if (zotero && typeof zotero.logError === "function") {
      zotero.logError(message);
      return;
    }
  }

  if (zotero && typeof zotero.debug === "function") {
    zotero.debug(message);
  }
}

function _createConsoleBridge() {
  if (typeof console !== "undefined") {
    return console;
  }

  function emit(level, argsLike) {
    const args = Array.prototype.slice.call(argsLike);
    const message = args.map(_stringifyConsoleValue).join(" ");
    _logBootstrapEvent(level, "console-bridge." + level, { message: message }, _getChromeGlobal());
  }

  return {
    log() {
      emit("log", arguments);
    },
    info() {
      emit("info", arguments);
    },
    debug() {
      emit("debug", arguments);
    },
    warn() {
      emit("warn", arguments);
    },
    error() {
      emit("error", arguments);
    },
  };
}

function _getOptionalCapabilityRules(chromeGlobal) {
  return [
    {
      key: "fetch",
      source: "global",
      resolve() {
        if (typeof fetch !== "undefined") {
          return fetch;
        }
        return chromeGlobal.fetch;
      },
    },
    {
      key: "Request",
      source: "global",
      resolve() {
        if (typeof Request !== "undefined") {
          return Request;
        }
        return chromeGlobal.Request;
      },
    },
    {
      key: "Response",
      source: "global",
      resolve() {
        if (typeof Response !== "undefined") {
          return Response;
        }
        return chromeGlobal.Response;
      },
    },
    {
      key: "Headers",
      source: "global",
      resolve() {
        if (typeof Headers !== "undefined") {
          return Headers;
        }
        return chromeGlobal.Headers;
      },
    },
    {
      key: "AbortController",
      source: "global",
      resolve() {
        if (typeof AbortController !== "undefined") {
          return AbortController;
        }
        return chromeGlobal.AbortController;
      },
    },
    {
      key: "ReadableStream",
      source: "global",
      resolve() {
        if (typeof ReadableStream !== "undefined") {
          return ReadableStream;
        }
        return chromeGlobal.ReadableStream;
      },
    },
    {
      key: "WritableStream",
      source: "global",
      resolve() {
        if (typeof WritableStream !== "undefined") {
          return WritableStream;
        }
        return chromeGlobal.WritableStream;
      },
    },
    {
      key: "TransformStream",
      source: "global",
      resolve() {
        if (typeof TransformStream !== "undefined") {
          return TransformStream;
        }
        return chromeGlobal.TransformStream;
      },
    },
    {
      key: "TextEncoder",
      source: "global",
      resolve() {
        if (typeof TextEncoder !== "undefined") {
          return TextEncoder;
        }
        return chromeGlobal.TextEncoder;
      },
    },
    {
      key: "TextDecoder",
      source: "global",
      resolve() {
        if (typeof TextDecoder !== "undefined") {
          return TextDecoder;
        }
        return chromeGlobal.TextDecoder;
      },
    },
    {
      key: "WebAssembly",
      source: "global",
      resolve() {
        if (typeof WebAssembly !== "undefined") {
          return WebAssembly;
        }
        return chromeGlobal.WebAssembly;
      },
    },
    {
      key: "Worker",
      source: "global",
      resolve() {
        if (typeof Worker !== "undefined") {
          return Worker;
        }
        return chromeGlobal.Worker;
      },
    },
    {
      key: "ChromeWorker",
      source: "global",
      resolve() {
        if (typeof ChromeWorker !== "undefined") {
          return ChromeWorker;
        }
        return chromeGlobal.ChromeWorker;
      },
    },
    {
      key: "URL",
      source: "global",
      resolve() {
        if (typeof URL !== "undefined") {
          return URL;
        }
        return chromeGlobal.URL;
      },
    },
    {
      key: "URLSearchParams",
      source: "global",
      resolve() {
        if (typeof URLSearchParams !== "undefined") {
          return URLSearchParams;
        }
        return chromeGlobal.URLSearchParams;
      },
    },
    {
      key: "setTimeout",
      source: "global",
      resolve() {
        if (typeof setTimeout !== "undefined") {
          return setTimeout;
        }
        return chromeGlobal.setTimeout;
      },
    },
    {
      key: "clearTimeout",
      source: "global",
      resolve() {
        if (typeof clearTimeout !== "undefined") {
          return clearTimeout;
        }
        return chromeGlobal.clearTimeout;
      },
    },
    {
      key: "structuredClone",
      source: "global",
      resolve() {
        if (typeof structuredClone !== "undefined") {
          return structuredClone;
        }
        return chromeGlobal.structuredClone;
      },
    },
    {
      key: "crypto",
      source: "global",
      resolve() {
        if (typeof crypto !== "undefined") {
          return crypto;
        }
        return chromeGlobal.crypto;
      },
    },
  ];
}

function _installCapabilityWhitelist(pluginScope, chromeGlobal) {
  const requiredRules = [
    {
      key: "Zotero",
      required: true,
      source: "bootstrap-global",
      resolve() {
        return typeof Zotero !== "undefined" ? Zotero : chromeGlobal.Zotero;
      },
    },
    {
      key: "Services",
      required: true,
      source: "bootstrap-global",
      resolve() {
        return typeof Services !== "undefined" ? Services : chromeGlobal.Services;
      },
    },
    {
      key: "ChromeUtils",
      required: true,
      source: "bootstrap-global",
      resolve() {
        return typeof ChromeUtils !== "undefined" ? ChromeUtils : chromeGlobal.ChromeUtils;
      },
    },
    {
      key: "console",
      required: true,
      source: "console-bridge",
      resolve() {
        return _createConsoleBridge();
      },
    },
  ];
  const optionalRules = _getOptionalCapabilityRules(chromeGlobal);
  const rules = requiredRules.concat(optionalRules);
  const report = {
    generatedAt: new Date().toISOString(),
    whitelistVersion: 1,
    status: "healthy",
    injected: [],
    skipped: [],
    missingRequired: [],
  };

  rules.forEach((rule) => {
    const isRequired = rule.required === true;
    let value;

    try {
      value = rule.resolve();
    }
    catch (error) {
      report.skipped.push({
        key: rule.key,
        required: isRequired,
        source: rule.source,
        reason: String(error && error.message ? error.message : error),
      });
      if (isRequired) {
        report.missingRequired.push(rule.key);
      }
      return;
    }

    if (typeof value === "undefined" || value === null) {
      report.skipped.push({
        key: rule.key,
        required: isRequired,
        source: rule.source,
        reason: "source-unavailable",
      });
      if (isRequired) {
        report.missingRequired.push(rule.key);
      }
      return;
    }

    pluginScope[rule.key] = value;
    report.injected.push({
      key: rule.key,
      required: isRequired,
      source: rule.source,
    });
  });

  if (report.missingRequired.length > 0) {
    report.status = "degraded";
  }

  return report;
}

function _emitCapabilityReport(report) {
  _logBootstrapEvent("debug", "capability-report", {
    injected: report.injected.length,
    skipped: report.skipped.length,
    missingRequired: report.missingRequired.length,
  }, _getChromeGlobal());
}

function _registerChrome(rootURI, addonRef) {
  var aomStartup = Components.classes[
    "@mozilla.org/addons/addon-manager-startup;1"
  ].getService(Components.interfaces.amIAddonManagerStartup);
  var manifestURI = Services.io.newURI(rootURI + "manifest.json");

  return aomStartup.registerChrome(manifestURI, [
    ["content", addonRef, rootURI + "content/"],
  ]);
}

function _getMountedInstance(chromeGlobal, instanceKey) {
  var zotero = _getZotero(chromeGlobal);
  return zotero && instanceKey ? zotero[instanceKey] || null : null;
}

async function _shutdownMountedInstance(chromeGlobal, instanceKey) {
  var entry = _getMountedInstance(chromeGlobal, instanceKey);
  if (!entry || typeof entry.shutdown !== "function") {
    return entry || null;
  }
  await entry.shutdown();
  return entry;
}

function _cleanupRuntimeBridge(chromeGlobal, instanceKey, expectedEntry, expectedRuntimeBridge) {
  var zotero = _getZotero(chromeGlobal);
  if (
    zotero
    && instanceKey
    && zotero[instanceKey]
    && (typeof expectedEntry === "undefined" || zotero[instanceKey] === expectedEntry)
  ) {
    delete zotero[instanceKey];
  }
  if (
    typeof expectedRuntimeBridge === "undefined"
    || chromeGlobal.__CLEANROOM_TEMPLATE_RUNTIME__ === expectedRuntimeBridge
  ) {
    delete chromeGlobal.__CLEANROOM_TEMPLATE_RUNTIME__;
    delete chromeGlobal.__CLEANROOM_TEMPLATE_CONFIG__;
  }

  if (chromeHandle) {
    chromeHandle.destruct();
    chromeHandle = null;
  }

  if (typeof expectedRuntimeBridge === "undefined" || runtimeBridge === expectedRuntimeBridge) {
    runtimeBridge = null;
  }
}

async function startup({ rootURI }, reason) {
  const meta = {
    addonRef: "__ADDON_REF__",
  };
  const chromeGlobal = _getChromeGlobal();
  const instanceKey = "__INSTANCE_KEY__";

  try {
    chromeHandle = _registerChrome(rootURI, meta.addonRef);

    const pluginScope = {
      rootURI,
    };
    const capabilityReport = _installCapabilityWhitelist(pluginScope, chromeGlobal);

    pluginScope.__CLEANROOM_TEMPLATE_RUNTIME__ = {
      rootURI,
      capabilityReport,
    };
    runtimeBridge = pluginScope.__CLEANROOM_TEMPLATE_RUNTIME__;
    chromeGlobal.__CLEANROOM_TEMPLATE_RUNTIME__ = runtimeBridge;
    _emitCapabilityReport(capabilityReport);

    const packageLoadStartedAt = Date.now();
    Services.scriptloader.loadSubScript(
      `${rootURI}content/scripts/${meta.addonRef}.js`,
      pluginScope,
    );
    const packageLoadDurationMs = Math.max(0, Date.now() - packageLoadStartedAt);
    const packageVariant = typeof pluginScope.__CLEANROOM_PACKAGE_VARIANT__ === "string"
      && pluginScope.__CLEANROOM_PACKAGE_VARIANT__
      ? pluginScope.__CLEANROOM_PACKAGE_VARIANT__
      : null;
    const runtimePackageProtection = pluginScope.__CLEANROOM_TEMPLATE_RUNTIME__?.packageProtection;

    if (packageVariant || (runtimePackageProtection && typeof runtimePackageProtection === "object")) {
      const packageProtection = runtimePackageProtection && typeof runtimePackageProtection === "object"
        ? runtimePackageProtection
        : {};
      packageProtection.active = true;
      packageProtection.variant = packageVariant || packageProtection.variant || null;
      packageProtection.loadSubScriptDurationMs = packageLoadDurationMs;
      pluginScope.__CLEANROOM_TEMPLATE_RUNTIME__.packageProtection = packageProtection;
    }

    if (pluginScope.__CLEANROOM_TEMPLATE_CONFIG__) {
      chromeGlobal.__CLEANROOM_TEMPLATE_CONFIG__ = pluginScope.__CLEANROOM_TEMPLATE_CONFIG__;
    }

    if (typeof pluginScope.bootstrapPlugin === "function") {
      await pluginScope.bootstrapPlugin();
    }
  }
  catch (error) {
    _logBootstrapEvent("error", "startup.failed", {
      reason: reason,
      rootURI: rootURI,
      instanceKey: instanceKey,
      message: String(error && error.message ? error.message : error),
    }, chromeGlobal);
    var failedEntry = _getMountedInstance(chromeGlobal, instanceKey);
    try {
      await _shutdownMountedInstance(chromeGlobal, instanceKey);
    }
    catch (shutdownError) {
      _logBootstrapEvent("error", "startup.cleanup.failed", {
        instanceKey: instanceKey,
        message: String(shutdownError && shutdownError.message ? shutdownError.message : shutdownError),
      }, chromeGlobal);
    }
    _cleanupRuntimeBridge(chromeGlobal, instanceKey, failedEntry, runtimeBridge);
    throw error;
  }
}

async function onMainWindowLoad({ window }, reason) {
  const instanceKey = "__INSTANCE_KEY__";
  if (Zotero[instanceKey] && typeof Zotero[instanceKey].onWindowLoad === "function") {
    await Zotero[instanceKey].onWindowLoad(window);
  }
}

async function onMainWindowUnload({ window }, reason) {
  const instanceKey = "__INSTANCE_KEY__";
  if (Zotero[instanceKey] && typeof Zotero[instanceKey].onWindowUnload === "function") {
    await Zotero[instanceKey].onWindowUnload(window);
  }
}

async function shutdown(data, reason) {
  if (typeof APP_SHUTDOWN !== "undefined" && reason === APP_SHUTDOWN) {
    return;
  }

  const instanceKey = "__INSTANCE_KEY__";
  const chromeGlobal = _getChromeGlobal();
  let shutdownError = null;
  var mountedEntry = _getMountedInstance(chromeGlobal, instanceKey);

  try {
    await _shutdownMountedInstance(chromeGlobal, instanceKey);
  }
  catch (error) {
    shutdownError = error;
    _logBootstrapEvent("error", "shutdown.failed", {
      reason: reason,
      instanceKey: instanceKey,
      message: String(error && error.message ? error.message : error),
    }, chromeGlobal);
  }
  finally {
    _cleanupRuntimeBridge(chromeGlobal, instanceKey, mountedEntry, runtimeBridge);
  }

  if (shutdownError) {
    throw shutdownError;
  }
}
