import { createLogger } from "../core/logger.js";
import { createLifecycleManager } from "../core/lifecycle.js";
import { createI18n } from "../core/i18n.js";
import { createNotifier } from "../core/notifier.js";
import { createKeyboardManager } from "../core/keyboard.js";
import { createHTTP } from "../core/http.js";
import { createUIFactory } from "../core/ui-factory.js";
import { createSettingsSystem } from "../settings/index.js";
import { createMenuCommand } from "../features/menu-command.js";
import { createMenuManager } from "../features/menu-manager.js";
import { createItemPane } from "../features/item-pane.js";
import { createItemTree } from "../features/item-tree.js";
import { createCommandPalette } from "../features/prompt.js";
import { createPreferencePanes } from "../features/preference-panes.js";
import { createReader } from "../features/reader.js";
import { createWindowManager } from "../features/window-manager.js";
import { createZoteroHost } from "../platform/zotero-host.js";
import { createDialogBuilder } from "../utils/dialog.js";
import { createProgressNotifier } from "../utils/progress-window.js";
import { createServiceRegistry } from "../services/index.js";
import { createPluginKernel } from "./kernel.js";
import { createPluginAPI } from "./plugin-api.js";
import { createPluginAgent } from "./plugin-agent.js";
import { createFeatureComposer } from "./feature-composer.js";
import { createRuntimeCapabilityState } from "./runtime-capabilities.js";

function normalizeLogLevel(input, fallback = "info") {
  const candidate = String(input || "").trim().toLowerCase();
  if (candidate === "debug" || candidate === "info" || candidate === "warn" || candidate === "error") {
    return candidate;
  }
  return fallback;
}

function formatDemoTimestamp(date = new Date()) {
  return date.toISOString().slice(11, 19);
}

export function createPlugin({ globalScope, config }) {
  const runtime = globalScope.__CLEANROOM_TEMPLATE_RUNTIME__ || {};
  const runtimeInfo = createRuntimeCapabilityState({ runtime });
  const host = createZoteroHost({ globalScope, rootURI: runtime.rootURI });
  const zotero = globalScope.Zotero;
  const logger = createLogger({
    hostLog: host.hostLog,
    level: config.defaultPrefs.logLevel,
  });

  const i18n = createI18n();
  const settings = createSettingsSystem({
    prefBranch: config.prefsPrefix,
    defaultPrefs: config.defaultPrefs,
    schemaDefinitions: config.settingsSchema,
    schemaVersion: Number(config.settingsSchemaVersion || 1),
    migrations: Array.isArray(config.settingsMigrations) ? config.settingsMigrations : [],
    logger,
  });
  const prefs = settings;

  const lifecycle = createLifecycleManager({ logger });
  const uiFactory = createUIFactory({ logger });
  const notifier = createNotifier({ logger, lifecycle, zotero });
  const keyboard = createKeyboardManager({
    logger,
    lifecycle,
    services: globalScope.Services,
  });
  const http = createHTTP({ logger, zotero });
  const dialog = createDialogBuilder({
    logger,
    uiFactory,
    i18n,
    services: globalScope.Services,
  });
  const progress = createProgressNotifier({ logger, i18n, zotero });
  const serviceRegistry = createServiceRegistry({ logger });

  serviceRegistry.register({
    id: `${config.addonRef}.runtime-core`,
    label: "Runtime Core",
    enabledWhen() {
      return true;
    },
    async start() {},
    async stop() {},
    healthCheck() {
      return {
        ok: true,
        status: "healthy",
      };
    },
  });

  serviceRegistry.register({
    id: `${config.addonRef}.runtime-bridge`,
    label: "Runtime Bridge",
    enabledWhen() {
      return true;
    },
    async start() {},
    async stop() {},
    healthCheck() {
      return {
        ok: runtimeInfo.capabilitySummary.ok,
        status: runtimeInfo.capabilitySummary.status,
        details: runtimeInfo.capabilitySummary.details,
      };
    },
  });

  const menuCommand = createMenuCommand({
    host,
    logger,
    prefs,
    i18n,
  });
  const menuManager = createMenuManager({
    logger,
    lifecycle,
    i18n,
    pluginID: config.addonId,
    zotero,
  });
  const itemPane = createItemPane({
    logger,
    lifecycle,
    uiFactory,
    i18n,
    pluginID: config.addonId,
    zotero,
  });
  const itemTree = createItemTree({
    logger,
    lifecycle,
    i18n,
    pluginID: config.addonId,
    zotero,
  });
  const commandPalette = createCommandPalette({
    logger,
    lifecycle,
    i18n,
    pluginID: config.addonId,
    zotero,
  });
  const preferencePanes = createPreferencePanes({
    logger,
    lifecycle,
    pluginID: config.addonId,
    rootURI: runtime.rootURI,
    zotero,
  });
  const reader = createReader({
    logger,
    zotero,
    lifecycle,
    pluginID: config.addonId,
  });

  const windows = createWindowManager({
    logger,
    mountWindowFeature(window) {
      if (!prefs.get("enabled")) {
        return () => {};
      }

      const cleanups = [];
      host.insertFTLIfNeeded(window, "main.ftl");
      const styleHref = host.resolveContentUrl("content/style/main.css");
      cleanups.push(
        host.injectStyleSheet(window, {
          id: "cleanroom-template-style",
          href: styleHref,
        }),
      );

      cleanups.push(menuCommand.mount(window));

      const shortcutId = keyboard.registerShortcut({
        id: `${config.addonRef}-shortcut-${Math.random().toString(16).slice(2)}`,
        shortcut: "Ctrl+Shift+Y",
        description: i18n.t(
          "cleanroom-shortcut-description",
          "Show the clean-room shortcut demo toast.",
        ),
        window,
        handler: () => {
          demoState.shortcutTriggerCount += 1;
          demoState.lastShortcutAt = formatDemoTimestamp();
          progress.showToast(
            i18n.t(
              "cleanroom-shortcut-toast-body",
              {
                shortcut: demoState.shortcutLabel,
                count: demoState.shortcutTriggerCount,
              },
              `Triggered ${demoState.shortcutLabel} ${demoState.shortcutTriggerCount} times.`,
            ),
            "info",
            2500,
            {
              title: i18n.t("cleanroom-shortcut-toast-title", "Cleanroom Shortcut"),
            },
          );
          refreshDemoViews();
        },
      });
      if (shortcutId) {
        cleanups.push(() => keyboard.unregister(shortcutId));
      }

      return () => cleanups.forEach((cleanup) => cleanup());
    },
  });

  const demoSectionRefreshers = new Set();
  const demoInfoRowID = `${config.addonRef}-selection-summary`;
  const demoSectionID = `${config.addonRef}-details`;
  const demoColumnKey = `${config.addonRef}-status`;
  const demoNotifierID = `${config.addonRef}-activity`;
  const demoState = {
    shortcutLabel: keyboard.formatShortcut(
      "Y",
      keyboard.normalizeModifiers(["ctrl", "shift"]),
    ),
    shortcutTriggerCount: 0,
    lastShortcutAt: null,
    lastNotifierEvent: i18n.t(
      "cleanroom-demo-notifier-idle",
      "No notifier event yet.",
    ),
  };

  function getItemTypeLabel(item) {
    if (!item) {
      return "";
    }

    if (typeof item.itemType === "string" && item.itemType) {
      return item.itemType;
    }

    if (
      typeof item.itemTypeID === "number"
      && zotero?.ItemTypes
      && typeof zotero.ItemTypes.getName === "function"
    ) {
      try {
        const typeName = zotero.ItemTypes.getName(item.itemTypeID);
        if (typeName) {
          return typeName;
        }
      }
      catch {}
    }

    return "item";
  }

  function getItemTitle(item) {
    if (!item || typeof item.getField !== "function") {
      return i18n.t("cleanroom-demo-no-selection", "No item selected.");
    }

    const title = item.getField("title");
    return title || i18n.t("cleanroom-demo-untitled", "Untitled item");
  }

  function getItemSummary(item) {
    if (!item) {
      return i18n.t("cleanroom-demo-no-selection", "No item selected.");
    }

    const parts = [
      getItemTypeLabel(item),
      `#${item.id ?? "?"}`,
      getItemTitle(item),
    ];
    return parts.join(" · ");
  }

  function getColumnValue(item) {
    if (!item) {
      return "Idle";
    }

    const title = typeof item.getField === "function" ? item.getField("title") || "" : "";
    const titleLength = title.trim().length;
    if (!titleLength) {
      return `${getItemTypeLabel(item)} · 0`;
    }
    return `${getItemTypeLabel(item)} · ${titleLength}`;
  }

  function refreshDemoViews() {
    itemPane.refreshInfoRow(demoInfoRowID);

    for (const refresh of demoSectionRefreshers) {
      try {
        refresh();
      }
      catch (error) {
        logger.warn("plugin.demo.refresh.failed", {
          message: String(error?.message || error),
        });
      }
    }
  }

  function createSectionLine(doc, label, value) {
    const line = doc.createElement("div");
    const strong = doc.createElement("strong");
    strong.textContent = `${label}: `;
    const span = doc.createElement("span");
    span.textContent = value;
    line.appendChild(strong);
    line.appendChild(span);
    return line;
  }

  function updateDemoNotifierState(event, type, ids = []) {
    const idToken = ids.length > 0 ? `#${ids[0]}` : "#-";
    demoState.lastNotifierEvent = `${type}:${event} ${idToken} @ ${formatDemoTimestamp()}`;
    refreshDemoViews();
  }

  function runReaderDemo() {
    const summary = reader.getActiveSummary();
    if (!summary) {
      progress.showToast(
        i18n.t("cleanroom-reader-no-active", "No active reader tab."),
        "warning",
        2500,
        {
          title: i18n.t("cleanroom-reader-toast-title", "Cleanroom Reader"),
        },
      );
      return false;
    }

    const readerType = summary.type || "unknown";
    const annotationCount = summary.annotationCount;

    progress.showToast(
      i18n.t(
        "cleanroom-reader-toast-body",
        {
          type: readerType,
          itemID: summary.itemID,
          annotations: annotationCount,
        },
        `${readerType} reader for item #${summary.itemID} with ${annotationCount} annotations.`,
      ),
      "info",
      3000,
      {
        title: i18n.t("cleanroom-reader-toast-title", "Cleanroom Reader"),
      },
    );
    return true;
  }

  function applyLogLevelFromPrefs() {
    const desired = normalizeLogLevel(prefs.get("logLevel"), config.defaultPrefs.logLevel);
    const changed = logger.setLevel(desired);
    if (changed) {
      logger.info("prefs.logLevel.applied", { level: logger.getLevel() });
    }
  }

  function handlePrefChange(key) {
    logger.debug("settings.changed", { key });

    if (key === "logLevel") {
      applyLogLevelFromPrefs();
      return;
    }

    if (key === "enabled" || key === "menuLabel") {
      windows.remountAll();
    }
  }

  function getPrimaryWindow() {
    return host.getMainWindow();
  }

  function runPrimaryAction(window = getPrimaryWindow()) {
    if (!prefs.get("enabled")) {
      const message = i18n.t(
        "cleanroom-command-disabled",
        "Plugin is disabled. Re-enable it in preferences first.",
      );

      logger.warn("command.execute.disabled");
      dialog.alert(window, config.addonName, message);
      return false;
    }

    menuCommand.execute(window, {
      location: "tools-menu",
      showAlert: true,
    });
    return true;
  }

  function runAgentAction() {
    const window = getPrimaryWindow();
    if (!prefs.get("enabled") || !window) {
      return false;
    }

    menuCommand.execute(window, {
      location: "agent-e2e",
      showAlert: false,
    });
    return true;
  }

  const agent = createPluginAgent({
    config,
    host,
    settings,
    prefs,
    itemPane,
    itemTree,
    notifier,
    reader,
    commandPalette,
    menuManager,
    preferencePanes,
    demoState,
    demoInfoRowID,
    demoSectionID,
    getItemTypeLabel,
    getItemSummary,
    getColumnValue,
    getItemTitle,
    runAgentAction,
    updateDemoNotifierState,
    zotero,
    serviceRegistry,
    runtimeInfo,
  });

  const featureComposer = createFeatureComposer({
    config,
    logger,
    host,
    prefs,
    i18n,
    preferencePanes,
    commandPalette,
    menuManager,
    reader,
    itemTree,
    itemPane,
    notifier,
    getPrimaryWindow,
    runPrimaryAction,
    runReaderDemo,
    getColumnValue,
    getItemSummary,
    createSectionLine,
    demoState,
    demoSectionRefreshers,
    demoInfoRowID,
    demoSectionID,
    demoColumnKey,
    demoNotifierID,
    updateDemoNotifierState,
  });

  const kernel = createPluginKernel({
    host,
    zotero,
    logger,
    lifecycle,
    windows,
    settings,
    registerBaselineFeatures: featureComposer.registerBaselineFeatures,
    applySettings: applyLogLevelFromPrefs,
    onSettingsChange: handlePrefChange,
    addonName: config.addonName,
    startServices: async () => {
      await serviceRegistry.startAll({
        host,
        prefs,
        settings,
      });
    },
    stopServices: async () => {
      await serviceRegistry.stopAll({
        host,
        prefs,
        settings,
      });
    },
  });

  const api = createPluginAPI({
    host,
    runtimeInfo,
    logger,
    settings,
    prefs,
    i18n,
    lifecycle,
    uiFactory,
    notifier,
    keyboard,
    http,
    dialog,
    progress,
    menuCommand,
    menuManager,
    itemPane,
    itemTree,
    commandPalette,
    preferencePanes,
    reader,
    serviceRegistry,
    getMainWindow: getPrimaryWindow,
    runPrimaryAction,
    runAgentAction,
    runAgentSelfCheck: agent.runAgentSelfCheck,
    runAgentScenario: agent.runAgentScenario,
    collectAgentDiagnostics: agent.collectAgentDiagnostics,
    listAgentScenarios: agent.listAgentScenarios,
    listAgentCapabilities: agent.listCapabilities,
    getAgentCapability: agent.getCapability,
    inspectItemPresentation: agent.inspectItemPresentation,
  });

  return {
    start: kernel.start,
    shutdown: kernel.shutdown,
    onWindowLoad: kernel.onWindowLoad,
    onWindowUnload: kernel.onWindowUnload,
    api,
  };
}
