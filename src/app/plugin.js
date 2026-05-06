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
import { createZoteroEntitlementCacheStore } from "../platform/zotero-entitlement-cache-store.js";
import { createDialogBuilder } from "../utils/dialog.js";
import { createProgressNotifier } from "../utils/progress-window.js";
import {
  createEntitlementControlPlane,
  createEntitlementIdentityProvider,
  createEntitlementLegacyAdapter,
  createServiceRegistry,
} from "../services/index.js";
import { createPluginKernel } from "./kernel.js";
import { createPluginAPI } from "./plugin-api.js";
import { createCopyFallbacks } from "./copy-fallbacks.js";
import { createFeatureComposer } from "./feature-composer.js";
import { createOptionalBundleRuntime } from "./optional-bundles.js";
import { createRuntimeCapabilityState } from "./runtime-capabilities.js";
import { createSurfaceDescriptors } from "./surface-descriptors.js";
import { createWasmKernelProbe } from "../features/wasm-kernel-probe.js";
import {
  createAgentReviewWorkbench,
  createCapabilityManifest as createSourceCapabilityManifest,
  createHostActionRunner,
  createPluginAgent,
  createProtectedCapabilityManifest,
  getCapabilityManifestView as getSourceCapabilityManifestView,
  getProtectedCapabilityManifestView,
  createReviewWorkbenchRuntimeProvider,
  registerDevRuntimeFeatures,
} from "./dev-runtime.js";

const WASM_STAGE2_DERIVE_PACKAGE_VARIANT = "shielded-surface-scrub-wasm-stage2-derive";
const ROUTE4_LEGACY_PACKAGE_VARIANT = "shielded-surface-scrub-wasm-entitlement-legacy";
const WASM_STAGE2_DERIVE_BUNDLE_SEED = "cleanroom-stage2-shadow-seed-v1";
const WASM_STAGE2_DERIVE_OVERLAY_VERSION = "descriptor-overlay-v1";
const DEFAULT_ROUTE4_IDENTITY_KIND = "zotero-user-id";

function normalizeLogLevel(input, fallback = "info") {
  const candidate = String(input || "").trim().toLowerCase();
  if (candidate === "debug" || candidate === "info" || candidate === "warn" || candidate === "error") {
    return candidate;
  }
  return fallback;
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
  const controlPlane = summary && typeof summary === "object"
    ? summary.controlPlane
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
      controlPlane: cloneControlPlaneSummary(controlPlane),
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
    controlPlane: cloneControlPlaneSummary(controlPlane),
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

function cloneControlPlaneSummary(summary = null) {
  return {
    mode: typeof summary?.mode === "string" && summary.mode.trim()
      ? summary.mode.trim()
      : "legacy-backend-v0",
    configured: Boolean(summary?.configured),
    status: typeof summary?.status === "string" && summary.status.trim()
      ? summary.status.trim()
      : "disabled",
    identityKind: typeof summary?.identityKind === "string" && summary.identityKind.trim()
      ? summary.identityKind.trim()
      : DEFAULT_ROUTE4_IDENTITY_KIND,
    cacheAvailable: Boolean(summary?.cacheAvailable),
    cacheFresh: Boolean(summary?.cacheFresh),
    validationSource: typeof summary?.validationSource === "string" && summary.validationSource.trim()
      ? summary.validationSource.trim()
      : "none",
    gateSatisfied: Boolean(summary?.gateSatisfied),
    compactGateHex: typeof summary?.compactGateHex === "string" && summary.compactGateHex.trim()
      ? summary.compactGateHex.trim()
      : null,
    lastValidatedAt: typeof summary?.lastValidatedAt === "string" && summary.lastValidatedAt.trim()
      ? summary.lastValidatedAt.trim()
      : null,
    expiresAt: typeof summary?.expiresAt === "string" && summary.expiresAt.trim()
      ? summary.expiresAt.trim()
      : null,
    failureKind: typeof summary?.failureKind === "string" && summary.failureKind.trim()
      ? summary.failureKind.trim()
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

function resolveRoute4LegacyConfig(config = {}, runtime = {}) {
  const packageProtection = runtime?.packageProtection && typeof runtime.packageProtection === "object"
    ? runtime.packageProtection
    : {};
  const route4Config = config?.packageProtectionControlPlane?.route4Legacy
    && typeof config.packageProtectionControlPlane.route4Legacy === "object"
    ? config.packageProtectionControlPlane.route4Legacy
    : {};
  const packageVariant = typeof packageProtection?.variant === "string" && packageProtection.variant.trim()
    ? packageProtection.variant.trim()
    : null;
  const enabled = route4Config.enabled === true && packageVariant === ROUTE4_LEGACY_PACKAGE_VARIANT;
  return {
    enabled,
    endpoint: typeof route4Config.endpoint === "string" && route4Config.endpoint.trim()
      ? route4Config.endpoint.trim()
      : null,
    secret: typeof route4Config.secret === "string" && route4Config.secret.trim()
      ? route4Config.secret.trim()
      : null,
    identityKind: typeof route4Config.identityKind === "string" && route4Config.identityKind.trim()
      ? route4Config.identityKind.trim()
      : DEFAULT_ROUTE4_IDENTITY_KIND,
    cacheTTLMS: Number(route4Config.cacheTTLMS || 86400000),
    timeoutMs: Number(route4Config.timeoutMs || 8000),
  };
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
  const entitlementCacheStore = createZoteroEntitlementCacheStore({
    zotero,
    addonRef: config.addonRef,
    logger,
  });
  const route4LegacyConfig = resolveRoute4LegacyConfig(config, runtime);
  const entitlementIdentityProvider = createEntitlementIdentityProvider({
    kind: route4LegacyConfig.identityKind,
    zotero,
  });
  const entitlementLegacyAdapter = createEntitlementLegacyAdapter({
    endpoint: route4LegacyConfig.endpoint,
    secret: route4LegacyConfig.secret,
    timeoutMs: route4LegacyConfig.timeoutMs,
  });
  let entitlementControlPlane = null;
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
      controlPlane: entitlementControlPlane?.getSummary?.(),
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

  entitlementControlPlane = createEntitlementControlPlane({
    config: route4LegacyConfig,
    http,
    identityProvider: entitlementIdentityProvider,
    adapter: entitlementLegacyAdapter,
    cacheStore: entitlementCacheStore,
    getHostBinding: () => cloneHostBindingSummary(runtime?.hostBinding),
    getWasmKernelProbe,
    logger,
  });

  servicesHub.register({
    id: surfaceDescriptors.serviceIDs.controlPlane,
    label: surfaceDescriptors.serviceLabels.controlPlane,
    enabledWhen() {
      return entitlementControlPlane.isConfigured();
    },
    async start() {
      void entitlementControlPlane.scheduleResolve();
    },
    async stop() {},
    healthCheck() {
      const summary = entitlementControlPlane.getSummary();
      return {
        ok: true,
        status: summary.status,
        details: summary,
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

      return () => cleanups.forEach((cleanup) => cleanup());
    },
  });

  let lifecycleTelemetrySummary = cloneLifecycleTelemetrySummary();

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
    getWasmKernelProbe,
    controlPlane: entitlementControlPlane,
    getProtectionSummary,
    surfaceDescriptors,
  });
  const reviewWorkbenchRuntimeProvider = createReviewWorkbenchRuntimeProvider({
    config,
    globalScope,
    runtime,
    runtimeInfo,
    getPrefsEnabled: () => Boolean(prefs.get("enabled")),
    listHostActions: hostActions.listHostActions,
    getHostActionExecutions: hostActions.getRecentExecutionSummaries,
  });
  let reviewWorkbench = null;

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
    listHostActions: hostActions.listHostActions,
    runHostAction: hostActions.runHostAction,
    executeAgentAction,
    zotero,
    servicesHub,
    runtimeInfo,
    getLifecycleSummary: () => cloneLifecycleTelemetrySummary(lifecycleTelemetrySummary),
    getProtectionSummary,
    getReviewWorkbenchSummary: () => reviewWorkbench?.getDiagnostics?.() || {
      enabled: false,
      sessionReady: false,
      annotationCount: 0,
      planCount: 0,
      lastError: null,
      staleStageCount: 0,
      activeStage: null,
      windowOpen: false,
      acceptanceStatus: "unavailable",
      externalBlockers: [],
      lastLifecycleScenario: null,
    },
    getCapabilityManifestOverlay,
    createCapabilityManifest,
    getCapabilityManifestView,
    surfaceDescriptors,
  });

  reviewWorkbench = createAgentReviewWorkbench({
    config,
    logger,
    host,
    themeManager,
    globalScope,
    isAvailable() {
      return Boolean(prefs.get("enabled")) && reviewWorkbenchRuntimeProvider.isAvailable();
    },
    getAvailability() {
      const providerAvailability = reviewWorkbenchRuntimeProvider.getAvailability();
      if (!providerAvailability.available) {
        return providerAvailability;
      }
      if (!prefs.get("enabled")) {
        return {
          available: false,
          reason: "plugin-disabled",
          summary: "Dev-only review runtime is disabled because the plugin is not enabled.",
        };
      }
      return {
        available: true,
        reason: null,
        summary: "Dev-only review runtime is available in the current dev runtime.",
      };
    },
    listHostActions: hostActions.listHostActions,
    getScopeSnapshot: reviewWorkbenchRuntimeProvider.getScopeSnapshot,
    getRouteSnapshot: reviewWorkbenchRuntimeProvider.getRouteSnapshot,
    getHostActionStageSummary: reviewWorkbenchRuntimeProvider.getHostActionStageSummary,
    getEvidenceSummary: reviewWorkbenchRuntimeProvider.getEvidenceSummary,
    getPatchPlanSummary: reviewWorkbenchRuntimeProvider.getPatchPlanSummary,
    getGateSummary: reviewWorkbenchRuntimeProvider.getGateSummary,
    collectAgentDiagnostics: agent.collectAgentDiagnostics,
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
    surfaceDescriptors,
  });

  const kernel = createPluginKernel({
    host,
    zotero,
    logger,
    lifecycle,
    windows,
    settings,
    registerBaselineFeatures: async () => {
      await featureComposer.registerBaselineFeatures();
      registerDevRuntimeFeatures({
        config,
        logger,
        prefs,
        i18n,
        commandPalette,
        openAgentReviewWorkbench: reviewWorkbench.open,
        isAgentReviewWorkbenchAvailable: reviewWorkbench.isAvailable,
      });
    },
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
      await reviewWorkbench.shutdown();
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
    reviewWorkbench,
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
