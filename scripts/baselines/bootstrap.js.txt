var chromeHandle;

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

function _createConsoleBridge() {
  if (typeof console !== "undefined") {
    return console;
  }

  function emit(level, argsLike) {
    const args = Array.prototype.slice.call(argsLike);
    const message = args.map(_stringifyConsoleValue).join(" ");

    if (level === "error" && Zotero && typeof Zotero.logError === "function") {
      Zotero.logError(message);
      return;
    }

    if (Zotero && typeof Zotero.debug === "function") {
      Zotero.debug(message);
    }
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
  if (!Zotero || typeof Zotero.debug !== "function") {
    return;
  }

  Zotero.debug(
    `[cleanroom.bootstrap] injected=${report.injected.length} skipped=${report.skipped.length} missingRequired=${report.missingRequired.length}`,
  );
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

async function startup({ rootURI }, reason) {
  const meta = {
    addonRef: "__ADDON_REF__",
  };
  const chromeGlobal = _getChromeGlobal();

  chromeHandle = _registerChrome(rootURI, meta.addonRef);

  const pluginScope = {
    rootURI,
  };
  const capabilityReport = _installCapabilityWhitelist(pluginScope, chromeGlobal);

  pluginScope.__CLEANROOM_TEMPLATE_RUNTIME__ = {
    rootURI,
    capabilityReport,
  };
  chromeGlobal.__CLEANROOM_TEMPLATE_RUNTIME__ = pluginScope.__CLEANROOM_TEMPLATE_RUNTIME__;
  _emitCapabilityReport(capabilityReport);

  Services.scriptloader.loadSubScript(
    `${rootURI}content/scripts/${meta.addonRef}.js`,
    pluginScope,
  );

  if (pluginScope.__CLEANROOM_TEMPLATE_CONFIG__) {
    chromeGlobal.__CLEANROOM_TEMPLATE_CONFIG__ = pluginScope.__CLEANROOM_TEMPLATE_CONFIG__;
  }

  if (typeof pluginScope.bootstrapPlugin === "function") {
    await pluginScope.bootstrapPlugin();
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

  if (Zotero[instanceKey] && typeof Zotero[instanceKey].shutdown === "function") {
    await Zotero[instanceKey].shutdown();
    delete Zotero[instanceKey];
  }

  delete chromeGlobal.__CLEANROOM_TEMPLATE_RUNTIME__;
  delete chromeGlobal.__CLEANROOM_TEMPLATE_CONFIG__;

  if (chromeHandle) {
    chromeHandle.destruct();
    chromeHandle = null;
  }
}
