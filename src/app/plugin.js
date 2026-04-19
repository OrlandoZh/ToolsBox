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
import { createReaderSelectionActions } from "../features/reader-selection-actions.js";
import { createWindowManager } from "../features/window-manager.js";
import { createThemeManager } from "../features/theme-manager.js";
import { createZoteroHost } from "../platform/zotero-host.js";
import { createZoteroHostSignals } from "../platform/zotero-host-signals.js";
import { createZoteroPluginNonceStore } from "../platform/zotero-plugin-nonce-store.js";
import { createDialogBuilder } from "../utils/dialog.js";
import { createProgressNotifier } from "../utils/progress-window.js";
import { createServiceRegistry } from "../services/index.js";
import { createPluginKernel } from "./kernel.js";
import { createPluginAPI } from "./plugin-api.js";
import { createPluginAgent } from "./plugin-agent.js";
import { createCopyFallbacks } from "./copy-fallbacks.js";
import { createFeatureComposer } from "./feature-composer.js";
import { createOptionalBundleRuntime } from "./optional-bundles.js";
import { createRuntimeCapabilityState } from "./runtime-capabilities.js";
import { createHostActionRunner } from "./host-actions.js";
import { createSurfaceDescriptors } from "./surface-descriptors.js";
import {
  createCapabilityManifest as createSourceCapabilityManifest,
  getCapabilityManifestView as getSourceCapabilityManifestView,
} from "./capability-manifest.js";
import {
  createCapabilityManifest as createProtectedCapabilityManifest,
  getCapabilityManifestView as getProtectedCapabilityManifestView,
} from "./capability-manifest-protected.js";
import { createReactUIDemoLauncher } from "../features/react-ui-demo.js";
import { createWasmKernelProbe } from "../features/wasm-kernel-probe.js";

const WASM_STAGE2_DERIVE_PACKAGE_VARIANT = "shielded-surface-scrub-wasm-stage2-derive";
const WASM_STAGE2_DERIVE_BUNDLE_SEED = "cleanroom-stage2-shadow-seed-v1";
const WASM_STAGE2_DERIVE_OVERLAY_VERSION = "descriptor-overlay-v1";

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

function cloneLifecycleTelemetrySummary(summary = null) {
  if (!summary || typeof summary !== "object") {
    return {
      hostReadyDurationMs: 0,
      startupDurationMs: 0,
      shutdownDurationMs: 0,
      lifecycleSlowOperationCount: 0,
      lifecycleSlowThresholdMs: 2000,
      lifecycleLastSlowStage: null,
      lifecycleBoundaryEvents: [],
    };
  }

  return {
    hostReadyDurationMs: Number(summary.hostReadyDurationMs || 0),
    startupDurationMs: Number(summary.startupDurationMs || 0),
    shutdownDurationMs: Number(summary.shutdownDurationMs || 0),
    lifecycleSlowOperationCount: Number(summary.lifecycleSlowOperationCount || 0),
    lifecycleSlowThresholdMs: Number(summary.lifecycleSlowThresholdMs || 2000),
    lifecycleLastSlowStage: typeof summary.lifecycleLastSlowStage === "string"
      && summary.lifecycleLastSlowStage.trim()
      ? summary.lifecycleLastSlowStage
      : null,
    lifecycleBoundaryEvents: Array.isArray(summary.lifecycleBoundaryEvents)
      ? summary.lifecycleBoundaryEvents.map((entry) => ({
        event: String(entry?.event || "").trim() || "unknown",
        count: Number(entry?.count || 0),
      }))
      : [],
  };
}

function clonePackageProtectionSummary(summary = null) {
  const hostBinding = summary && typeof summary === "object"
    ? summary.hostBinding
    : null;
  const stage2OverlayGate = summary && typeof summary === "object"
    ? summary.stage2OverlayGate
    : null;

  if (!summary || typeof summary !== "object") {
    return {
      active: false,
      variant: null,
      decodeMethod: null,
      loadSubScriptDurationMs: 0,
      decodeDurationMs: 0,
      decryptDurationMs: 0,
      evalDurationMs: 0,
      prepareDurationMs: 0,
      bootstrapResolveDurationMs: 0,
      bootstrapCallCount: 0,
      hostBinding: cloneHostBindingSummary(hostBinding),
      stage2OverlayGate: cloneStage2OverlayGateSummary(stage2OverlayGate),
    };
  }

  return {
    active: Boolean(summary.active),
    variant: typeof summary.variant === "string" && summary.variant.trim()
      ? summary.variant.trim()
      : null,
    decodeMethod: typeof summary.decodeMethod === "string" && summary.decodeMethod.trim()
      ? summary.decodeMethod.trim()
      : null,
    loadSubScriptDurationMs: Number(summary.loadSubScriptDurationMs || 0),
    decodeDurationMs: Number(summary.decodeDurationMs || 0),
    decryptDurationMs: Number(summary.decryptDurationMs || 0),
    evalDurationMs: Number(summary.evalDurationMs || 0),
    prepareDurationMs: Number(summary.prepareDurationMs || 0),
    bootstrapResolveDurationMs: Number(summary.bootstrapResolveDurationMs || 0),
    bootstrapCallCount: Number(summary.bootstrapCallCount || 0),
    hostBinding: cloneHostBindingSummary(hostBinding),
    stage2OverlayGate: cloneStage2OverlayGateSummary(stage2OverlayGate),
  };
}

function cloneCapabilityManifestOverlay(overlay = null) {
  if (!Array.isArray(overlay)) {
    return null;
  }
  return JSON.parse(JSON.stringify(overlay));
}

function cloneStage2OverlayGateSummary(summary = null) {
  return {
    mode: typeof summary?.mode === "string" && summary.mode.trim()
      ? summary.mode.trim()
      : null,
    status: typeof summary?.status === "string" && summary.status.trim()
      ? summary.status.trim()
      : "idle",
    satisfied: Boolean(summary?.satisfied),
    activationSatisfied: Boolean(summary?.activationSatisfied),
    activationMissing: Array.isArray(summary?.activationMissing)
      ? summary.activationMissing.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    consistentAcrossTransports: typeof summary?.consistentAcrossTransports === "boolean"
      ? summary.consistentAcrossTransports
      : null,
    attempted: Boolean(summary?.attempted),
    failureReason: typeof summary?.failureReason === "string" && summary.failureReason.trim()
      ? summary.failureReason.trim()
      : null,
  };
}

function isCapabilityManifestOverlayReady(hostBinding = null) {
  return Boolean(
    typeof hostBinding?.profileHash === "string"
    && hostBinding.profileHash.trim()
    && hostBinding?.dbAvailable
    && hostBinding?.noncePresent,
  );
}

function cloneHostBindingSummary(summary = null) {
  const normalized = {
    signalVersion: 1,
    available: false,
    profileHash: null,
    schemaBucket: null,
    zoteroVersionBucket: null,
    profileBasenameBucket: null,
    dataDirHash: null,
    collectionError: null,
    dbAvailable: false,
    noncePresent: false,
    nonceSource: "unavailable",
    nonceHash: null,
    storeError: null,
  };

  if (!summary || typeof summary !== "object") {
    return normalized;
  }

  normalized.signalVersion = Number(summary.signalVersion || 1);
  normalized.profileHash = typeof summary.profileHash === "string" && summary.profileHash.trim()
    ? summary.profileHash.trim()
    : null;
  normalized.schemaBucket = typeof summary.schemaBucket === "string" && summary.schemaBucket.trim()
    ? summary.schemaBucket.trim()
    : null;
  normalized.zoteroVersionBucket = typeof summary.zoteroVersionBucket === "string"
    && summary.zoteroVersionBucket.trim()
    ? summary.zoteroVersionBucket.trim()
    : null;
  normalized.profileBasenameBucket = typeof summary.profileBasenameBucket === "string"
    && summary.profileBasenameBucket.trim()
    ? summary.profileBasenameBucket.trim()
    : null;
  normalized.dataDirHash = typeof summary.dataDirHash === "string" && summary.dataDirHash.trim()
    ? summary.dataDirHash.trim()
    : null;
  normalized.collectionError = typeof summary.collectionError === "string" && summary.collectionError.trim()
    ? summary.collectionError.trim()
    : null;
  normalized.dbAvailable = Boolean(summary.dbAvailable);
  normalized.noncePresent = Boolean(summary.noncePresent);
  normalized.nonceSource = typeof summary.nonceSource === "string" && summary.nonceSource.trim()
    ? summary.nonceSource.trim()
    : "unavailable";
  normalized.nonceHash = typeof summary.nonceHash === "string" && summary.nonceHash.trim()
    ? summary.nonceHash.trim()
    : null;
  normalized.storeError = typeof summary.storeError === "string" && summary.storeError.trim()
    ? summary.storeError.trim()
    : null;
  normalized.available = Boolean(
    normalized.profileHash
    || normalized.schemaBucket
    || normalized.zoteroVersionBucket
    || normalized.profileBasenameBucket
    || normalized.dataDirHash
    || normalized.dbAvailable
    || normalized.noncePresent,
  );
  return normalized;
}

function mergeHostBindingSummary(base = null, patch = null) {
  const merged = cloneHostBindingSummary(base);
  if (!patch || typeof patch !== "object") {
    return merged;
  }

  const own = Object.prototype.hasOwnProperty;
  const apply = (key, value) => {
    merged[key] = value;
  };

  if (own.call(patch, "signalVersion")) {
    apply("signalVersion", Number(patch.signalVersion || 1));
  }
  if (own.call(patch, "profileHash")) {
    apply(
      "profileHash",
      typeof patch.profileHash === "string" && patch.profileHash.trim()
        ? patch.profileHash.trim()
        : null,
    );
  }
  if (own.call(patch, "schemaBucket")) {
    apply(
      "schemaBucket",
      typeof patch.schemaBucket === "string" && patch.schemaBucket.trim()
        ? patch.schemaBucket.trim()
        : null,
    );
  }
  if (own.call(patch, "zoteroVersionBucket")) {
    apply(
      "zoteroVersionBucket",
      typeof patch.zoteroVersionBucket === "string" && patch.zoteroVersionBucket.trim()
        ? patch.zoteroVersionBucket.trim()
        : null,
    );
  }
  if (own.call(patch, "profileBasenameBucket")) {
    apply(
      "profileBasenameBucket",
      typeof patch.profileBasenameBucket === "string" && patch.profileBasenameBucket.trim()
        ? patch.profileBasenameBucket.trim()
        : null,
    );
  }
  if (own.call(patch, "dataDirHash")) {
    apply(
      "dataDirHash",
      typeof patch.dataDirHash === "string" && patch.dataDirHash.trim()
        ? patch.dataDirHash.trim()
        : null,
    );
  }
  if (own.call(patch, "collectionError")) {
    apply(
      "collectionError",
      typeof patch.collectionError === "string" && patch.collectionError.trim()
        ? patch.collectionError.trim()
        : null,
    );
  }
  if (own.call(patch, "dbAvailable")) {
    apply("dbAvailable", Boolean(patch.dbAvailable));
  }
  if (own.call(patch, "noncePresent")) {
    apply("noncePresent", Boolean(patch.noncePresent));
  }
  if (own.call(patch, "nonceSource")) {
    apply(
      "nonceSource",
      typeof patch.nonceSource === "string" && patch.nonceSource.trim()
        ? patch.nonceSource.trim()
        : "unavailable",
    );
  }
  if (own.call(patch, "nonceHash")) {
    apply(
      "nonceHash",
      typeof patch.nonceHash === "string" && patch.nonceHash.trim()
        ? patch.nonceHash.trim()
        : null,
    );
  }
  if (own.call(patch, "storeError")) {
    apply(
      "storeError",
      typeof patch.storeError === "string" && patch.storeError.trim()
        ? patch.storeError.trim()
        : null,
    );
  }

  merged.available = Boolean(
    merged.profileHash
    || merged.schemaBucket
    || merged.zoteroVersionBucket
    || merged.profileBasenameBucket
    || merged.dataDirHash
    || merged.dbAvailable
    || merged.noncePresent,
  );
  return merged;
}

export function createPlugin({
  globalScope,
  config,
  createWasmKernelProbeImpl = createWasmKernelProbe,
} = {}) {
  const runtime = globalScope.__CLEANROOM_TEMPLATE_RUNTIME__ || {};
  const optionalBundleRegistry = globalScope.__CLEANROOM_TEMPLATE_OPTIONAL_BUNDLES__ || null;
  const copy = createCopyFallbacks();
  const surfaceDescriptors = createSurfaceDescriptors(config);
  const bundleRuntime = createOptionalBundleRuntime({
    registry: optionalBundleRegistry,
  });
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
  const servicesHub = createServiceRegistry({ logger });
  const hostSignals = createZoteroHostSignals({
    globalScope,
    zotero,
    logger,
  });
  const nonceStore = createZoteroPluginNonceStore({
    globalScope,
    zotero,
    addonRef: config.addonRef,
    logger,
  });
  runtime.hostBinding = cloneHostBindingSummary(runtime.hostBinding);

  function syncRuntimeHostBinding(summary) {
    runtime.hostBinding = mergeHostBindingSummary(runtime.hostBinding, summary);
    return runtime.hostBinding;
  }

  let wasmStage2OverlayGatePromise = null;

  function getRuntimePackageProtection() {
    if (!runtime.packageProtection || typeof runtime.packageProtection !== "object") {
      runtime.packageProtection = {};
    }
    return runtime.packageProtection;
  }

  function getStage2OverlayGateState() {
    const packageProtection = getRuntimePackageProtection();
    packageProtection.stage2OverlayGate = cloneStage2OverlayGateSummary(packageProtection.stage2OverlayGate);
    return packageProtection.stage2OverlayGate;
  }

  function shouldUseWasmStage2OverlayGate() {
    const packageProtection = runtime?.packageProtection && typeof runtime.packageProtection === "object"
      ? runtime.packageProtection
      : null;
    return String(packageProtection?.variant || "").trim() === WASM_STAGE2_DERIVE_PACKAGE_VARIANT
      && typeof packageProtection?.overlayResolver === "function";
  }

  function scheduleWasmStage2OverlayGate() {
    if (!shouldUseWasmStage2OverlayGate()) {
      return null;
    }

    const gate = getStage2OverlayGateState();
    const activationMissing = isCapabilityManifestOverlayReady(runtime?.hostBinding)
      ? []
      : ["profileHash", "dbAvailable", "noncePresent"].filter((key) => {
          if (key === "profileHash") {
            return !(typeof runtime?.hostBinding?.profileHash === "string" && runtime.hostBinding.profileHash.trim());
          }
          if (key === "dbAvailable") {
            return !runtime?.hostBinding?.dbAvailable;
          }
          return !runtime?.hostBinding?.noncePresent;
        });

    if (gate.satisfied) {
      return wasmStage2OverlayGatePromise;
    }

    if (activationMissing.length > 0) {
      runtime.packageProtection.stage2OverlayGate = {
        ...gate,
        mode: "wasm-stage2-derive",
        status: "waiting-host-binding",
        satisfied: false,
        activationSatisfied: false,
        activationMissing,
        failureReason: null,
      };
      return null;
    }

    if (wasmStage2OverlayGatePromise) {
      return wasmStage2OverlayGatePromise;
    }

    runtime.packageProtection.stage2OverlayGate = {
      ...gate,
      mode: "wasm-stage2-derive",
      status: "pending",
      satisfied: false,
      activationSatisfied: false,
      activationMissing: ["wasmStage2OverlayGate"],
      attempted: true,
      failureReason: null,
    };

    const hostBinding = cloneHostBindingSummary(runtime?.hostBinding);
    wasmStage2OverlayGatePromise = Promise.resolve().then(async () => {
      try {
        const result = await getWasmKernelProbe().deriveUnlockToken({
          mode: "main-thread",
          bundleSeed: WASM_STAGE2_DERIVE_BUNDLE_SEED,
          overlayVersion: WASM_STAGE2_DERIVE_OVERLAY_VERSION,
          hostBinding,
        });
        const nextGate = getStage2OverlayGateState();
        const activationSatisfied = result?.activationSatisfied === true;
        const satisfied = result?.ok === true
          && activationSatisfied
          && result?.mainThread?.ok === true;
        runtime.packageProtection.stage2OverlayGate = {
          ...nextGate,
          mode: "wasm-stage2-derive",
          status: satisfied
            ? "satisfied"
            : (activationSatisfied ? "limited" : "activation-missing"),
          satisfied,
          activationSatisfied,
          activationMissing: Array.isArray(result?.activationMissing)
            ? result.activationMissing.map((item) => String(item || "").trim()).filter(Boolean)
            : ["wasmStage2OverlayGate"],
          consistentAcrossTransports: typeof result?.consistentAcrossTransports === "boolean"
            ? result.consistentAcrossTransports
            : null,
          attempted: true,
          failureReason: satisfied
            ? null
            : (Array.isArray(result?.errors) && result.errors.length > 0
                ? String(result.errors[0]?.message || "").trim() || null
                : null),
        };
        return satisfied;
      } catch (error) {
        const nextGate = getStage2OverlayGateState();
        runtime.packageProtection.stage2OverlayGate = {
          ...nextGate,
          mode: "wasm-stage2-derive",
          status: "error",
          satisfied: false,
          activationSatisfied: false,
          activationMissing: ["wasmStage2OverlayGate"],
          attempted: true,
          failureReason: String(error?.message || error),
        };
        logger.warn("packageProtection.stage2OverlayGate", {
          message: String(error?.message || error),
        });
        return false;
      } finally {
        wasmStage2OverlayGatePromise = null;
      }
    });

    return wasmStage2OverlayGatePromise;
  }

  function getProtectionSummary() {
    const packageProtection = runtime?.packageProtection && typeof runtime.packageProtection === "object"
      ? runtime.packageProtection
      : {};
    return clonePackageProtectionSummary({
      ...packageProtection,
      hostBinding: runtime?.hostBinding || hostSignals.getSummary(),
    });
  }

  function getCapabilityManifestOverlay() {
    const packageProtection = runtime?.packageProtection && typeof runtime.packageProtection === "object"
      ? runtime.packageProtection
      : null;
    if (!packageProtection) {
      return null;
    }

    if (shouldUseWasmStage2OverlayGate()) {
      void scheduleWasmStage2OverlayGate();
      if (getStage2OverlayGateState().satisfied !== true) {
        return null;
      }
    }

    const currentOverlay = cloneCapabilityManifestOverlay(packageProtection?.capabilityManifestOverlay);
    if (currentOverlay) {
      return currentOverlay;
    }

    if (!isCapabilityManifestOverlayReady(runtime?.hostBinding)) {
      return null;
    }

    const resolver = typeof packageProtection.overlayResolver === "function"
      ? packageProtection.overlayResolver
      : null;
    if (!resolver) {
      return null;
    }

    try {
      const resolvedOverlay = cloneCapabilityManifestOverlay(resolver());
      if (!resolvedOverlay) {
        return null;
      }
      packageProtection.capabilityManifestOverlay = resolvedOverlay;
      packageProtection.overlayResolver = null;
      return cloneCapabilityManifestOverlay(resolvedOverlay);
    } catch (error) {
      logger.warn("packageProtection.overlayResolver", {
        message: error?.message || String(error),
      });
      return null;
    }
  }

  function shouldUseProtectedCapabilityManifest(protectionSummary = null) {
    return Boolean(protectionSummary?.active);
  }

  function createCapabilityManifest(options = {}) {
    const protectionSummary = options?.protectionSummary || getProtectionSummary();
    if (shouldUseProtectedCapabilityManifest(protectionSummary)) {
      return createProtectedCapabilityManifest(options);
    }
    return createSourceCapabilityManifest(options);
  }

  function getCapabilityManifestView(options = {}) {
    const protectionSummary = options?.protectionSummary || getProtectionSummary();
    if (shouldUseProtectedCapabilityManifest(protectionSummary)) {
      return getProtectedCapabilityManifestView(options);
    }
    return getSourceCapabilityManifestView(options);
  }

  servicesHub.register({
    id: surfaceDescriptors.serviceIDs.runtimeCore,
    label: surfaceDescriptors.serviceLabels.runtimeCore,
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

  servicesHub.register({
    id: surfaceDescriptors.serviceIDs.hostSignals,
    label: surfaceDescriptors.serviceLabels.hostSignals,
    enabledWhen() {
      return true;
    },
    async start() {
      syncRuntimeHostBinding(await hostSignals.init());
      void scheduleWasmStage2OverlayGate();
    },
    async stop() {
      syncRuntimeHostBinding(hostSignals.getSummary());
      void scheduleWasmStage2OverlayGate();
    },
    healthCheck() {
      const summary = syncRuntimeHostBinding(hostSignals.getSummary());
      void scheduleWasmStage2OverlayGate();
      return {
        ok: true,
        status: summary.available
          ? "ready"
          : summary.collectionError
            ? "attention"
            : "idle",
        details: summary,
      };
    },
  });

  servicesHub.register({
    id: surfaceDescriptors.serviceIDs.hostNonce,
    label: surfaceDescriptors.serviceLabels.hostNonce,
    enabledWhen() {
      return true;
    },
    async start() {
      syncRuntimeHostBinding(await nonceStore.init());
      void scheduleWasmStage2OverlayGate();
    },
    async stop() {
      syncRuntimeHostBinding(nonceStore.getSummary());
      void scheduleWasmStage2OverlayGate();
    },
    healthCheck() {
      const summary = syncRuntimeHostBinding(nonceStore.getSummary());
      void scheduleWasmStage2OverlayGate();
      return {
        ok: true,
        status: summary.dbAvailable && summary.noncePresent
          ? "ready"
          : summary.storeError
            ? "attention"
            : "idle",
        details: summary,
      };
    },
  });

  servicesHub.register({
    id: surfaceDescriptors.serviceIDs.runtimeBridge,
    label: surfaceDescriptors.serviceLabels.runtimeBridge,
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
    surfaceDescriptors,
  });
  const themeManager = createThemeManager({
    logger,
    prefs,
  });
  const reactUIDemo = createReactUIDemoLauncher({
    config,
    logger,
    host,
    themeManager,
    bundleRuntime,
    services: globalScope.Services,
    rootURI: runtime.rootURI,
  });
  let wasmKernelProbe = null;

  function getWasmKernelProbe() {
    if (!wasmKernelProbe) {
      wasmKernelProbe = createWasmKernelProbeImpl({
        config,
        logger,
        rootURI: runtime.rootURI,
        fetchImpl: globalScope.fetch || globalThis.fetch,
        WebAssemblyImpl: globalScope.WebAssembly || globalThis.WebAssembly,
        WorkerCtor: globalScope.ChromeWorker || globalScope.Worker || globalThis.ChromeWorker || globalThis.Worker,
      });
    }
    return wasmKernelProbe;
  }

  servicesHub.register({
    id: surfaceDescriptors.serviceIDs.reactUIDemo,
    label: surfaceDescriptors.serviceLabels.reactUIDemo,
    enabledWhen() {
      return bundleRuntime.isEnabled("react-ui");
    },
    async start() {},
    async stop() {
      reactUIDemo.close();
    },
    healthCheck() {
      return {
        ok: true,
        status: bundleRuntime.isEnabled("react-ui") ? "ready" : "disabled",
        details: {
          enabled: bundleRuntime.isEnabled("react-ui"),
          open: reactUIDemo.isOpen(),
          hostSurfaceCount: reactUIDemo.getHostSurfaceCount(),
        },
      };
    },
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
  const readerSelectionActions = createReaderSelectionActions({
    logger,
    lifecycle,
    reader,
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
          id: surfaceDescriptors.menuCommand.injectedStyleID,
          href: styleHref,
        }),
      );
      cleanups.push(themeManager.mountWindow(window));

      cleanups.push(menuCommand.mount(window));

      const shortcutId = keyboard.registerShortcut({
        id: `${surfaceDescriptors.shortcutIDPrefix}-${Math.random().toString(16).slice(2)}`,
        shortcut: "Ctrl+Shift+Y",
        description: i18n.t(
          "cleanroom-shortcut-description",
          copy.shortcut.description,
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
              title: i18n.t("cleanroom-shortcut-toast-title", copy.shortcut.toastTitle),
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
  const demoInfoRowID = surfaceDescriptors.demoInfoRowID;
  const demoSectionID = surfaceDescriptors.demoSectionID;
  const demoColumnKey = surfaceDescriptors.demoColumnKey;
  const demoNotifierID = surfaceDescriptors.demoNotifierID;
  const demoState = {
    shortcutLabel: keyboard.formatShortcut(
      "Y",
      keyboard.normalizeModifiers(["ctrl", "shift"]),
    ),
    shortcutTriggerCount: 0,
    lastShortcutAt: null,
    lastNotifierEvent: i18n.t(
      "cleanroom-demo-notifier-idle",
      copy.demo.notifierIdle,
    ),
  };
  let lifecycleTelemetrySummary = cloneLifecycleTelemetrySummary();

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
      return i18n.t("cleanroom-demo-no-selection", copy.demo.noSelection);
    }

    const title = item.getField("title");
    return title || i18n.t("cleanroom-demo-untitled", copy.demo.untitled);
  }

  function getItemSummary(item) {
    if (!item) {
      return i18n.t("cleanroom-demo-no-selection", copy.demo.noSelection);
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
        i18n.t("cleanroom-reader-no-active", copy.reader.noActive),
        "warning",
        2500,
        {
          title: i18n.t("cleanroom-reader-toast-title", copy.reader.toastTitle),
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
        title: i18n.t("cleanroom-reader-toast-title", copy.reader.toastTitle),
      },
    );
    return true;
  }

  async function runReaderSelectionActionDemo(actionId = surfaceDescriptors.readerSelectionCommandID) {
    const execution = await readerSelectionActions.executeAction(actionId);
    const result = execution?.result && typeof execution.result === "object"
      ? execution.result
      : {};
    const itemID = result.itemID ?? execution?.selection?.itemID ?? null;
    const readerType = result.readerType || execution?.selection?.readerType || "unknown";
    const textLength = Number(result.textLength || execution?.selection?.textLength || 0);
    const textPreview = typeof result.textPreview === "string" && result.textPreview.trim()
      ? result.textPreview.trim()
      : "";

    if (!execution?.ok) {
      progress.showToast(
        i18n.t(
          "cleanroom-reader-selection-toast-empty",
          copy.reader.selectionToastEmpty,
        ),
        "warning",
        2500,
        {
          title: i18n.t(
            "cleanroom-reader-selection-toast-title",
            copy.reader.selectionToastTitle,
          ),
        },
      );
      return false;
    }

    progress.showToast(
      i18n.t(
        "cleanroom-reader-selection-toast-body",
        {
          type: readerType,
          itemID,
          length: textLength,
          preview: textPreview,
        },
        `${readerType} reader #${itemID} selection (${textLength} chars): ${textPreview}`,
      ),
      "info",
      3000,
      {
        title: i18n.t(
          "cleanroom-reader-selection-toast-title",
          copy.reader.selectionToastTitle,
        ),
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

  function applyThemeModeFromPrefs() {
    const appliedMode = themeManager.syncFromPrefs();
    logger.debug("prefs.themeMode.applied", {
      mode: appliedMode,
      mountedWindowCount: themeManager.getMountedWindowCount(),
      mountedElementCount: themeManager.getMountedElementCount(),
    });
  }

  function applySettingsFromPrefs() {
    applyLogLevelFromPrefs();
    applyThemeModeFromPrefs();
  }

  function handlePrefChange(key) {
    logger.debug("settings.changed", { key });

    if (key === "logLevel") {
      applyLogLevelFromPrefs();
      return;
    }

    if (key === "themeMode") {
      applyThemeModeFromPrefs();
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
        copy.command.disabled,
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

  function executeAgentAction() {
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

  const hostActions = createHostActionRunner({
    config,
    host,
    reader,
    menuManager,
    itemPane,
    bundleRuntime,
    openReactDemoWindow: reactUIDemo.openDemoWindow,
    getWasmKernelProbe,
    getProtectionSummary,
    surfaceDescriptors,
  });

  const agent = createPluginAgent({
    config,
    host,
    settings,
    prefs,
    http,
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
    listHostActions: hostActions.listHostActions,
    runHostAction: hostActions.runHostAction,
    executeAgentAction,
    updateDemoNotifierState,
    zotero,
    servicesHub,
    runtimeInfo,
    getLifecycleSummary: () => cloneLifecycleTelemetrySummary(lifecycleTelemetrySummary),
    getProtectionSummary,
    getCapabilityManifestOverlay,
    createCapabilityManifest,
    getCapabilityManifestView,
    surfaceDescriptors,
  });

  const featureComposer = createFeatureComposer({
    config,
    logger,
    host,
    prefs,
    i18n,
    preferencePanes,
    commandPalette,
    readerSelectionActions,
    menuManager,
    reader,
    itemTree,
    itemPane,
    notifier,
    getPrimaryWindow,
    runPrimaryAction,
    runReaderDemo,
    runReaderSelectionActionDemo,
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
    bundleRuntime,
    openReactDemoWindow: reactUIDemo.openDemoWindow,
    surfaceDescriptors,
    presentReactSurface: reactUIDemo.presentSurface,
    renderReactItemPaneSurface: reactUIDemo.renderItemPaneSurface,
    unmountReactItemPaneSurface: reactUIDemo.unmountItemPaneSurface,
  });

  const kernel = createPluginKernel({
    host,
    zotero,
    logger,
    lifecycle,
    windows,
    settings,
    registerBaselineFeatures: featureComposer.registerBaselineFeatures,
    applySettings: applySettingsFromPrefs,
    onSettingsChange: handlePrefChange,
    addonName: config.addonName,
    startServices: async () => {
      await servicesHub.startAll({
        host,
        prefs,
        settings,
      });
    },
    stopServices: async () => {
      if (typeof wasmKernelProbe?.close === "function") {
        await wasmKernelProbe.close();
      }
      await servicesHub.stopAll({
        host,
        prefs,
        settings,
      });
    },
    onLifecycleTelemetryChange: (summary) => {
      lifecycleTelemetrySummary = cloneLifecycleTelemetrySummary(summary);
    },
  });
  lifecycleTelemetrySummary = cloneLifecycleTelemetrySummary(kernel.getLifecycleTelemetry());

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
    readerSelectionActions,
    servicesHub,
    getMainWindow: getPrimaryWindow,
    runPrimaryAction,
    executeAgentAction,
    runAgentSelfCheck: agent.runAgentSelfCheck,
    runAgentScenario: agent.runAgentScenario,
    collectAgentDiagnostics: agent.collectAgentDiagnostics,
    listAgentScenarios: agent.listAgentScenarios,
    listCapabilitiesImpl: agent.listCapabilities,
    getCapabilityImpl: agent.getCapability,
    inspectItemPresentation: agent.inspectItemPresentation,
    listHostActions: hostActions.listHostActions,
    runHostAction: hostActions.runHostAction,
    getProtectionSummary,
  });

  return {
    start: kernel.start,
    shutdown: kernel.shutdown,
    onWindowLoad: kernel.onWindowLoad,
    onWindowUnload: kernel.onWindowUnload,
    api,
  };
}
