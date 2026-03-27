import { promises as fs, readFileSync } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  BASELINE_ITEM_PANE_FTL,
  buildBaselineLocaleMainFTLSource,
  buildExpectedFTLLine,
  resolveLocaleMainFTLPath,
} from "./agent-zotero-locale-lib.mjs";
import { normalizeDiagnosisFingerprint } from "./agent-zotero-diagnosis-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VISUAL_BASELINE_ALLOWED_TARGETS = Object.freeze([
  "tests/visual-baselines/agent-zotero-e2e/restart-library.png",
  "tests/visual-baselines/agent-zotero-e2e/restart-reader.png",
  "tests/visual-baselines/agent-zotero-e2e/hot-reload-library.png",
  "tests/visual-baselines/agent-zotero-e2e/hot-reload-reader.png",
]);

const VISUAL_BASELINE_TARGET_MAP = Object.freeze({
  "restart::library": "tests/visual-baselines/agent-zotero-e2e/restart-library.png",
  "restart::reader": "tests/visual-baselines/agent-zotero-e2e/restart-reader.png",
  "hot-reload::library": "tests/visual-baselines/agent-zotero-e2e/hot-reload-library.png",
  "hot-reload::reader": "tests/visual-baselines/agent-zotero-e2e/hot-reload-reader.png",
});

const LATEST_E2E_REPORT_FILE = "dist/agent-zotero-e2e.json";
const BASELINE_BOOTSTRAP_JS_SOURCE_FILE = "scripts/baselines/bootstrap.js.txt";
const BASELINE_BOOTSTRAP_JS_PATH = "addon-static/bootstrap.js";
const BASELINE_BOOTSTRAP_JS_SOURCE = readFileSync(path.join(__dirname, "baselines", "bootstrap.js.txt"), "utf-8");
const BASELINE_BOOTSTRAP_JS_SOURCE_SHA256 = crypto.createHash("sha256").update(BASELINE_BOOTSTRAP_JS_SOURCE).digest("hex");
const BASELINE_ICON_SOURCE_FILES = Object.freeze({
  "addon-static/content/icons/icon-48.png": "scripts/baselines/icons/icon-48.png",
  "addon-static/content/icons/icon-96.png": "scripts/baselines/icons/icon-96.png",
});
const BASELINE_ICON_SOURCE_SHA256 = Object.freeze(Object.fromEntries(
  Object.entries(BASELINE_ICON_SOURCE_FILES).map(([targetFile, sourceFile]) => {
    const absoluteSourceFile = path.join(__dirname, "..", sourceFile);
    return [targetFile, crypto.createHash("sha256").update(readFileSync(absoluteSourceFile)).digest("hex")];
  }),
));
const BASELINE_PREFERENCES_XHTML_SOURCE_FILE = "scripts/baselines/preferences.xhtml.txt";
const BASELINE_PREFERENCES_XHTML_PATH = "addon-static/content/preferences.xhtml";
const BASELINE_PREFERENCES_XHTML_SOURCE = readFileSync(path.join(__dirname, "baselines", "preferences.xhtml.txt"), "utf-8");
const BASELINE_PREFERENCES_XHTML_SOURCE_SHA256 = crypto.createHash("sha256").update(BASELINE_PREFERENCES_XHTML_SOURCE).digest("hex");
const BASELINE_MAIN_CSS_SOURCE_FILE = "scripts/baselines/main.css.txt";
const BASELINE_MAIN_CSS_PATH = "addon-static/content/style/main.css";
const BASELINE_MAIN_CSS_SOURCE = readFileSync(path.join(__dirname, "baselines", "main.css.txt"), "utf-8");
const BASELINE_MAIN_CSS_SOURCE_SHA256 = crypto.createHash("sha256").update(BASELINE_MAIN_CSS_SOURCE).digest("hex");
const BASELINE_READER_EVENT_KNOWN_TYPES_SOURCE = `export const READER_EVENT_KNOWN_TYPES = Object.freeze([
  READER_EVENT_TYPES.RENDER_TEXT_SELECTION_POPUP,
  READER_EVENT_TYPES.RENDER_SIDEBAR_ANNOTATION_HEADER,
  READER_EVENT_TYPES.RENDER_TOOLBAR,
  READER_EVENT_TYPES.CREATE_COLOR_CONTEXT_MENU,
  READER_EVENT_TYPES.CREATE_VIEW_CONTEXT_MENU,
  READER_EVENT_TYPES.CREATE_ANNOTATION_CONTEXT_MENU,
  READER_EVENT_TYPES.CREATE_THUMBNAIL_CONTEXT_MENU,
  READER_EVENT_TYPES.CREATE_SELECTOR_CONTEXT_MENU,
]);`;
const BASELINE_READER_EVENT_PROBE_COMPATIBLE_TYPES_SOURCE = `export const READER_EVENT_PROBE_COMPATIBLE_TYPES = Object.freeze([
  READER_EVENT_TYPES.RENDER_TEXT_SELECTION_POPUP,
  READER_EVENT_TYPES.RENDER_SIDEBAR_ANNOTATION_HEADER,
  READER_EVENT_TYPES.RENDER_TOOLBAR,
  READER_EVENT_TYPES.CREATE_COLOR_CONTEXT_MENU,
  READER_EVENT_TYPES.CREATE_VIEW_CONTEXT_MENU,
  READER_EVENT_TYPES.CREATE_ANNOTATION_CONTEXT_MENU,
  READER_EVENT_TYPES.CREATE_THUMBNAIL_CONTEXT_MENU,
  READER_EVENT_TYPES.CREATE_SELECTOR_CONTEXT_MENU,
]);`;
const BASELINE_READER_EVENT_SYNTHETIC_FALLBACK_TYPES_SOURCE = `export const READER_EVENT_SYNTHETIC_FALLBACK_TYPES = Object.freeze([
  READER_EVENT_TYPES.RENDER_TEXT_SELECTION_POPUP,
  READER_EVENT_TYPES.RENDER_SIDEBAR_ANNOTATION_HEADER,
  READER_EVENT_TYPES.RENDER_TOOLBAR,
  READER_EVENT_TYPES.CREATE_COLOR_CONTEXT_MENU,
  READER_EVENT_TYPES.CREATE_VIEW_CONTEXT_MENU,
  READER_EVENT_TYPES.CREATE_ANNOTATION_CONTEXT_MENU,
  READER_EVENT_TYPES.CREATE_THUMBNAIL_CONTEXT_MENU,
  READER_EVENT_TYPES.CREATE_SELECTOR_CONTEXT_MENU,
]);`;
const BASELINE_READER_REGISTER_EVENT_LISTENER_SOURCE = `  function registerEventListener(type, handler, options = {}) {
    const eventType = String(type || "").trim();
    const effectivePluginID = toPlainString(options.pluginID) || toPlainString(pluginID) || undefined;
    if (!eventType || typeof handler !== "function") {
      error("reader.registerEventListener.invalidArgs", { type: eventType });
      return null;
    }
    if (!READER_EVENT_KNOWN_TYPE_SET.has(eventType)) {
      error("reader.registerEventListener.unknownType", { type: eventType });
      return null;
    }
    if (!isEventAPIAvailable()) {
      error("reader.registerEventListener.notAvailable", { type: eventType });
      return null;
    }

    const wrappedHandler = (event) => handler(event);
    Zotero.Reader.registerEventListener(eventType, wrappedHandler, effectivePluginID);
    registeredEventListeners.push({
      type: eventType,
      handler,
      wrappedHandler,
      pluginID: effectivePluginID || null,
    });

    const cleanup = () => {
      unregisterEventListener(eventType, handler);
    };

    if (lifecycle && typeof lifecycle.trackCleanup === "function") {
      lifecycle.trackCleanup(cleanup);
    }

    return cleanup;
  }`;
const BASELINE_READER_SUPPORTS_SYNTHETIC_FALLBACK_SOURCE = `  function supportsSyntheticFallback(type) {
    return READER_EVENT_SYNTHETIC_FALLBACK_TYPE_SET.has(String(type || "").trim());
  }`;
const BASELINE_READER_DISPATCH_SYNTHETIC_EVENT_SOURCE = `  function dispatchSyntheticEvent(target, options = {}) {
    const eventType = String(options.type || "").trim();
    if (!eventType) {
      return {
        type: eventType,
        itemID: null,
        dispatched: 0,
        failed: 0,
        usedDoc: false,
      };
    }

    if (!supportsSyntheticFallback(eventType)) {
      return {
        type: eventType,
        itemID: null,
        dispatched: 0,
        failed: 0,
        usedDoc: false,
        supported: false,
      };
    }

    const resolvedReader = resolveReader(target);
    if (!resolvedReader) {
      return {
        type: eventType,
        itemID: null,
        dispatched: 0,
        failed: 0,
        usedDoc: false,
        supported: true,
      };
    }

    const append = typeof options.append === "function" ? options.append : () => {};
    const params = options.params && typeof options.params === "object"
      ? clonePlainValueSafe(options.params) || {}
      : {};
    const syntheticEvent = {
      ...params,
      type: eventType,
      reader: resolvedReader,
      append,
    };

    const frameWindow = options.includeDoc === false
      ? null
      : getReaderFrameWindow(resolvedReader, options);
    if (frameWindow?.document) {
      syntheticEvent.doc = frameWindow.document;
    }

    const matches = registeredEventListeners.filter((entry) => entry.type === eventType);
    let failed = 0;

    matches.forEach((entry) => {
      try {
        entry.handler(syntheticEvent);
      }
      catch (err) {
        failed += 1;
        error("reader.dispatchSyntheticEvent.failed", {
          type: eventType,
          itemID: Number.isFinite(resolvedReader?.itemID) ? resolvedReader.itemID : null,
          message: String(err?.message || err),
        });
      }
    });

    return {
      type: eventType,
      itemID: Number.isFinite(resolvedReader?.itemID) ? resolvedReader.itemID : null,
      dispatched: matches.length,
      failed,
      usedDoc: Boolean(syntheticEvent.doc),
      supported: true,
    };
  }`;

function buildVisualBaselineTargetKey({ bootMode, kind }) {
  return `${String(bootMode || "").trim()}::${String(kind || "").trim()}`;
}

function resolveVisualBaselineTargetFile({ bootMode, kind }) {
  return VISUAL_BASELINE_TARGET_MAP[buildVisualBaselineTargetKey({ bootMode, kind })] || null;
}

function parseExpectedActualKeysFromIssue(issue) {
  const match = String(issue || "").match(/期望\s+(.+?)，实际\s+(.+?)(?:。|$)/u);
  if (!match) {
    return null;
  }

  const expected = String(match[1] || "").trim();
  const actual = String(match[2] || "").trim();
  if (!expected || !actual) {
    return null;
  }

  return {
    expected,
    actual,
  };
}

function parseLocaleMissingKeyIssue(issue) {
  const match = String(issue || "").match(/Locale\s+([A-Za-z-]+)\s+缺少\s+FTL\s+key\s+([A-Za-z0-9._-]+)/u);
  if (!match) {
    return null;
  }

  const locale = String(match[1] || "").trim();
  const key = String(match[2] || "").trim();
  if (!locale || !key) {
    return null;
  }

  return {
    locale,
    key,
  };
}

function isLocaleMainFTLFileMissingIssue(issue) {
  return /文件\s+.+?main\.ftl\s+不存在/u.test(String(issue || ""));
}

function buildLocaleMainFTLCreateDraft({
  locale,
  summary,
}) {
  const source = buildBaselineLocaleMainFTLSource(locale);
  if (!source) {
    return [];
  }

  return [
    {
      file: resolveLocaleMainFTLPath(locale),
      anchor: `${locale} / main.ftl baseline`,
      summary,
      operation: "create",
      existsText: source,
      contextWindowChars: 0,
      snippet: source,
      patch: `@@ ${locale}/main.ftl (create)
+${source.trimEnd().replaceAll("\n", "\n+")}`,
    },
  ];
}

function buildPreferencePaneResourceCreateDraft(summary) {
  return [
    {
      file: BASELINE_PREFERENCES_XHTML_PATH,
      anchor: "preferences.xhtml baseline",
      summary,
      operation: "create",
      existsText: BASELINE_PREFERENCES_XHTML_SOURCE,
      contextWindowChars: 0,
      snippet: BASELINE_PREFERENCES_XHTML_SOURCE,
      patch: `@@ addon-static/content/preferences.xhtml (create)
+${BASELINE_PREFERENCES_XHTML_SOURCE.trimEnd().replaceAll("\n", "\n+")}`,
    },
  ];
}

function buildBootstrapFileCreateDraft(summary) {
  return [
    {
      file: BASELINE_BOOTSTRAP_JS_PATH,
      anchor: "bootstrap.js baseline",
      summary,
      operation: "create",
      existsText: BASELINE_BOOTSTRAP_JS_SOURCE,
      contextWindowChars: 0,
      snippet: BASELINE_BOOTSTRAP_JS_SOURCE,
      patch: `@@ addon-static/bootstrap.js (create)
+${BASELINE_BOOTSTRAP_JS_SOURCE.trimEnd().replaceAll("\n", "\n+")}`,
    },
  ];
}

function buildMainCSSCreateDraft(summary) {
  return [
    {
      file: BASELINE_MAIN_CSS_PATH,
      anchor: "main.css baseline",
      summary,
      operation: "create",
      existsText: BASELINE_MAIN_CSS_SOURCE,
      contextWindowChars: 0,
      snippet: BASELINE_MAIN_CSS_SOURCE,
      patch: `@@ addon-static/content/style/main.css (create)
+${BASELINE_MAIN_CSS_SOURCE.trimEnd().replaceAll("\n", "\n+")}`,
    },
  ];
}

function buildStaticRuntimeBaselineCopyDraft({
  file,
  sourceFile,
  expectedSourceSha256,
  anchor,
  summary,
}) {
  return [
    {
      file,
      sourceFile,
      expectedSourceSha256,
      anchor,
      summary,
      operation: "copy",
      snippet: null,
      patch: `@@ static runtime baseline\n~ copy ${sourceFile} -> ${file}`,
    },
  ];
}

function buildReaderEventBridgeRegistrationDraft(summary) {
  return [
    {
      file: "src/features/reader.js",
      anchor: "reader.js / registerEventListener() baseline",
      summary,
      operation: "replace-block",
      blockAnchorText: "function registerEventListener(type, handler, options = {}) {",
      startText: "  function registerEventListener(type, handler, options = {}) {",
      endText: "    return cleanup;\n  }",
      existsText: BASELINE_READER_REGISTER_EVENT_LISTENER_SOURCE,
      beforeContextText: "  /**\n   * 注册 Reader 官方事件监听器",
      afterContextText: "  /**\n   * 注销指定 Reader 事件监听器",
      contextWindowChars: 2400,
      replacementText: BASELINE_READER_REGISTER_EVENT_LISTENER_SOURCE,
      snippet: BASELINE_READER_REGISTER_EVENT_LISTENER_SOURCE,
      patch: `@@ src/features/reader.js registerEventListener()
~ replace block with clean-room baseline registerEventListener() bridge`,
    },
  ];
}

function buildReaderEventKnownTypeDeclarationDraft(summary) {
  return {
    file: "src/features/reader.js",
    anchor: "reader.js / READER_EVENT_KNOWN_TYPES baseline",
    summary,
    operation: "replace-block",
    blockAnchorText: "export const READER_EVENT_KNOWN_TYPES = Object.freeze([",
    startText: "export const READER_EVENT_KNOWN_TYPES = Object.freeze([",
    endText: "]);",
    existsText: BASELINE_READER_EVENT_KNOWN_TYPES_SOURCE,
    beforeContextText: "export const READER_EVENT_TYPES = {",
    afterContextText: "export const READER_EVENT_PROBE_COMPATIBLE_TYPES = Object.freeze([",
    contextWindowChars: 1600,
    replacementText: BASELINE_READER_EVENT_KNOWN_TYPES_SOURCE,
    snippet: BASELINE_READER_EVENT_KNOWN_TYPES_SOURCE,
    patch: `@@ src/features/reader.js READER_EVENT_KNOWN_TYPES
~ replace block with clean-room baseline known type declarations`,
  };
}

function buildReaderEventProbeCompatibleTypeDeclarationDraft(summary) {
  return {
    file: "src/features/reader.js",
    anchor: "reader.js / READER_EVENT_PROBE_COMPATIBLE_TYPES baseline",
    summary,
    operation: "replace-block",
    blockAnchorText: "export const READER_EVENT_PROBE_COMPATIBLE_TYPES = Object.freeze([",
    startText: "export const READER_EVENT_PROBE_COMPATIBLE_TYPES = Object.freeze([",
    endText: "]);",
    existsText: BASELINE_READER_EVENT_PROBE_COMPATIBLE_TYPES_SOURCE,
    beforeContextText: "export const READER_EVENT_KNOWN_TYPES = Object.freeze([",
    afterContextText: "export const READER_EVENT_SYNTHETIC_FALLBACK_TYPES = Object.freeze([",
    contextWindowChars: 1600,
    replacementText: BASELINE_READER_EVENT_PROBE_COMPATIBLE_TYPES_SOURCE,
    snippet: BASELINE_READER_EVENT_PROBE_COMPATIBLE_TYPES_SOURCE,
    patch: `@@ src/features/reader.js READER_EVENT_PROBE_COMPATIBLE_TYPES
~ replace block with clean-room baseline probe-compatible declarations`,
  };
}

function buildReaderEventDeclarationDrafts(summary) {
  return [
    buildReaderEventKnownTypeDeclarationDraft(summary),
    buildReaderEventProbeCompatibleTypeDeclarationDraft(summary),
  ];
}

function buildReaderEventSyntheticFallbackDraft(summary) {
  return [
    {
      file: "src/features/reader.js",
      anchor: "reader.js / READER_EVENT_SYNTHETIC_FALLBACK_TYPES baseline",
      summary,
      operation: "replace-block",
      blockAnchorText: "export const READER_EVENT_SYNTHETIC_FALLBACK_TYPES = Object.freeze([",
      startText: "export const READER_EVENT_SYNTHETIC_FALLBACK_TYPES = Object.freeze([",
      endText: "]);",
      existsText: BASELINE_READER_EVENT_SYNTHETIC_FALLBACK_TYPES_SOURCE,
      beforeContextText: "export const READER_EVENT_PROBE_COMPATIBLE_TYPES = Object.freeze([",
      afterContextText: "const READER_EVENT_KNOWN_TYPE_SET = new Set(READER_EVENT_KNOWN_TYPES);",
      contextWindowChars: 1600,
      replacementText: BASELINE_READER_EVENT_SYNTHETIC_FALLBACK_TYPES_SOURCE,
      snippet: BASELINE_READER_EVENT_SYNTHETIC_FALLBACK_TYPES_SOURCE,
      patch: `@@ src/features/reader.js READER_EVENT_SYNTHETIC_FALLBACK_TYPES
~ replace block with clean-room baseline synthetic-fallback declarations`,
    },
  ];
}

function buildReaderSupportsSyntheticFallbackDraft(summary) {
  return [
    {
      file: "src/features/reader.js",
      anchor: "reader.js / supportsSyntheticFallback() baseline",
      summary,
      operation: "replace-block",
      blockAnchorText: "function supportsSyntheticFallback(type) {",
      startText: "  function supportsSyntheticFallback(type) {",
      endText: "  }",
      existsText: BASELINE_READER_SUPPORTS_SYNTHETIC_FALLBACK_SOURCE,
      beforeContextText: "  function getProbeCompatibleEventTypes() {",
      afterContextText: "  function findRegisteredEventListeners(type, handler) {",
      contextWindowChars: 1200,
      replacementText: BASELINE_READER_SUPPORTS_SYNTHETIC_FALLBACK_SOURCE,
      snippet: BASELINE_READER_SUPPORTS_SYNTHETIC_FALLBACK_SOURCE,
      patch: `@@ src/features/reader.js supportsSyntheticFallback()
~ replace block with clean-room baseline synthetic-fallback support guard`,
    },
  ];
}

function buildReaderDispatchSyntheticEventDraft(summary) {
  return [
    {
      file: "src/features/reader.js",
      anchor: "reader.js / dispatchSyntheticEvent() baseline",
      summary,
      operation: "replace-block",
      blockAnchorText: "function dispatchSyntheticEvent(target, options = {}) {",
      startText: "  function dispatchSyntheticEvent(target, options = {}) {",
      endText: "  }",
      existsText: BASELINE_READER_DISPATCH_SYNTHETIC_EVENT_SOURCE,
      beforeContextText: "  function getReaderFrameWindow(target, options = {}) {",
      afterContextText: "  function getEventAPIReport() {",
      contextWindowChars: 3600,
      replacementText: BASELINE_READER_DISPATCH_SYNTHETIC_EVENT_SOURCE,
      snippet: BASELINE_READER_DISPATCH_SYNTHETIC_EVENT_SOURCE,
      patch: `@@ src/features/reader.js dispatchSyntheticEvent()
~ replace block with clean-room baseline synthetic dispatch bridge`,
    },
  ];
}

function buildReaderEntryCommandRegistrationDraft() {
  return {
    file: "src/app/feature-composer.js",
    anchor: "registerBaselineFeatures() / reader summary command",
    summary: "在 baseline 注册阶段补回 Reader 摘要命令注册。",
    existsText: '      id: `${config.addonRef}-reader-summary`,',
    anchorText: "    if (menuManager.isOfficialAPIAvailable()) {",
    beforeContextText: '      id: `${config.addonRef}-primary-action`,',
    afterContextText: "      menuManager.registerContextMenuItem({",
    contextWindowChars: 2400,
    insertMode: "before",
      snippet: `    commandPalette.registerCommand({
      id: \`\${config.addonRef}-reader-summary\`,
      label: i18n.t(
        "cleanroom-reader-menu-label",
        "Show Reader Demo Summary",
      ),
      category: config.addonName,
      description: i18n.t(
        "cleanroom-reader-command-description",
        "Show the active reader summary.",
      ),
      condition: () => Boolean(reader.getActiveSummary()),
      handler: () => {
        runReaderDemo();
      },
    });

`,
    patch: `@@ registerBaselineFeatures()
+    commandPalette.registerCommand({
+      id: \`\${config.addonRef}-reader-summary\`,
+      label: i18n.t(
+        "cleanroom-reader-menu-label",
+        "Show Reader Demo Summary",
+      ),
+      category: config.addonName,
+      description: i18n.t(
+        "cleanroom-reader-command-description",
+        "Show the active reader summary.",
+      ),
+      condition: () => Boolean(reader.getActiveSummary()),
+      handler: () => {
+        runReaderDemo();
+      },
+    });`,
  };
}

function buildReaderEntryMenuRegistrationDraft() {
  return {
    file: "src/app/feature-composer.js",
    anchor: "registerBaselineFeatures() / reader summary menu",
    summary: "在 baseline 注册阶段补回 Reader View 菜单项注册。",
    existsText: '          id: `${config.addonRef}-reader-summary`,',
    anchorText: `    }

    itemTree.registerColumn({`,
    beforeContextText: "      menuManager.registerContextMenuItem({",
    afterContextText: "      dataKey: demoColumnKey,",
    contextWindowChars: 3200,
    insertMode: "before",
    snippet: `      menuManager.registerReaderMenuItem(
        {
          target: menuManager.MENU_TARGETS.READER_MENU_VIEW,
        },
        {
          id: \`\${config.addonRef}-reader-summary\`,
          l10nID: "cleanroom-reader-menu-label",
          onShowing: (event, context) => {
            if (context && typeof context.setVisible === "function") {
              context.setVisible(Boolean(reader.getActiveSummary()));
            }
          },
          onCommand: () => {
            runReaderDemo();
          },
        },
      );

`,
    patch: `@@ registerBaselineFeatures()
+      menuManager.registerReaderMenuItem(
+        {
+          target: menuManager.MENU_TARGETS.READER_MENU_VIEW,
+        },
+        {
+          id: \`\${config.addonRef}-reader-summary\`,
+          l10nID: "cleanroom-reader-menu-label",
+          onShowing: (event, context) => {
+            if (context && typeof context.setVisible === "function") {
+              context.setVisible(Boolean(reader.getActiveSummary()));
+            }
+          },
+          onCommand: () => {
+            runReaderDemo();
+          },
+        },
+      );`,
  };
}

function buildBootstrapFileBaselineCopyDraft(summary) {
  return buildStaticRuntimeBaselineCopyDraft({
    file: BASELINE_BOOTSTRAP_JS_PATH,
    sourceFile: BASELINE_BOOTSTRAP_JS_SOURCE_FILE,
    expectedSourceSha256: BASELINE_BOOTSTRAP_JS_SOURCE_SHA256,
    anchor: "bootstrap.js clean-room baseline copy",
    summary,
  });
}

function buildPreferencePaneResourceBaselineCopyDraft(summary) {
  return buildStaticRuntimeBaselineCopyDraft({
    file: BASELINE_PREFERENCES_XHTML_PATH,
    sourceFile: BASELINE_PREFERENCES_XHTML_SOURCE_FILE,
    expectedSourceSha256: BASELINE_PREFERENCES_XHTML_SOURCE_SHA256,
    anchor: "preferences.xhtml clean-room baseline copy",
    summary,
  });
}

function buildMainCSSBaselineCopyDraft(summary) {
  return buildStaticRuntimeBaselineCopyDraft({
    file: BASELINE_MAIN_CSS_PATH,
    sourceFile: BASELINE_MAIN_CSS_SOURCE_FILE,
    expectedSourceSha256: BASELINE_MAIN_CSS_SOURCE_SHA256,
    anchor: "main.css clean-room baseline copy",
    summary,
  });
}

function stringIncludes(source, matcher) {
  return String(source || "").includes(String(matcher || ""));
}

function buildReaderEntryDeclarativeMappingContext(input = {}) {
  const rawFingerprint = String(input?.fingerprint || "").trim();
  const fingerprint = normalizeDiagnosisFingerprint(rawFingerprint);
  const issue = String(input?.issue || "").trim();
  const latestChecks = getLatestCycleChecks(input) || {};
  const isLegacyCommandMissing = rawFingerprint === "reader-entry:reader-summary-command-missing";
  const isLegacyMenuMissing = rawFingerprint === "reader-entry:reader-summary-menu-missing";
  let restoreCommandRegistration = (
    isLegacyCommandMissing
    || latestChecks.readerSummaryCommandRegistered === false
    || stringIncludes(issue, "Reader 摘要命令未注册")
  );
  let restoreMenuRegistration = (
    isLegacyMenuMissing
    || latestChecks.readerSummaryMenuRegistered === false
    || stringIncludes(issue, "Reader View 菜单项未注册")
  );

  if (latestChecks.officialMenuAPIAvailable === false) {
    restoreMenuRegistration = false;
  }

  if (!restoreCommandRegistration && !restoreMenuRegistration) {
    restoreCommandRegistration = true;
    restoreMenuRegistration = latestChecks.officialMenuAPIAvailable !== false;
  }

  return {
    restoreCommandRegistration,
    restoreMenuRegistration,
  };
}

function buildReaderFineGrainedHookDeclarationContext(input = {}) {
  const rawFingerprint = String(input?.fingerprint || "").trim();
  const fingerprint = normalizeDiagnosisFingerprint(rawFingerprint);
  const issue = String(input?.issue || "").trim();
  const latestChecks = getLatestCycleChecks(input) || {};
  const isCanonicalFineGrainedDrift = fingerprint === "reader-event:fine-grained-hook-declaration-drift";
  const isLegacyProbeType = rawFingerprint === "reader-event:probe-compatible-type-missing";
  const isLegacySyntheticFallback = rawFingerprint === "reader-event:synthetic-fallback-mapping-missing";
  let repairKnownTypeDeclarations = (
    isLegacyProbeType
    || isCanonicalFineGrainedDrift && !isLegacySyntheticFallback
    || Number(latestChecks.readerEventKnownTypeCount || 0) > 0
    && Number(latestChecks.readerEventKnownTypeCount || 0) < 8
    || stringIncludes(issue, "Reader 事件桥已知类型声明缺口")
  );
  let repairProbeCompatibleDeclarations = (
    isLegacyProbeType
    || isCanonicalFineGrainedDrift && !isLegacySyntheticFallback
    || Number(latestChecks.readerEventProbeTypeCount || 0) > 0
    && Number(latestChecks.readerEventProbeTypeCount || 0) < 8
    || stringIncludes(issue, "Reader 事件桥 probe 声明缺口")
  );
  let repairSyntheticFallbackDeclarations = (
    isLegacySyntheticFallback
    || latestChecks.readerEventSyntheticFallbackAvailable === false
    || stringIncludes(issue, "Reader 事件桥缺少 synthetic-fallback 映射")
  );

  if (
    !repairKnownTypeDeclarations
    && !repairProbeCompatibleDeclarations
    && !repairSyntheticFallbackDeclarations
  ) {
    repairKnownTypeDeclarations = true;
    repairProbeCompatibleDeclarations = true;
    repairSyntheticFallbackDeclarations = true;
  }

  return {
    repairKnownTypeDeclarations,
    repairProbeCompatibleDeclarations,
    repairSyntheticFallbackDeclarations,
  };
}

function buildReaderToolbarBridgeRegistrationContext(input = {}) {
  const rawFingerprint = String(input?.fingerprint || "").trim();
  const fingerprint = normalizeDiagnosisFingerprint(rawFingerprint);
  const issue = String(input?.issue || "").trim();
  const latestChecks = getLatestCycleChecks(input) || {};
  const isLegacyListenerMismatch = rawFingerprint === "reader-event:listener-registration-mismatch";
  let repairRegisterEventListener = (
    isLegacyListenerMismatch
    || latestChecks.readerEventHookScenarioPassed === false
    || stringIncludes(issue, "Reader 官方事件监听注册异常")
  );
  let repairSyntheticDispatchBridge = (
    latestChecks.readerEventFineGrainedScenarioPassed === false
    || latestChecks.readerEventToolbarHookObserved === false
    || stringIncludes(issue, "Reader Toolbar 宿主桥接未恢复")
    || stringIncludes(issue, "Reader Toolbar 宿主点未观测")
  );

  if (!repairRegisterEventListener && !repairSyntheticDispatchBridge) {
    repairRegisterEventListener = true;
  }

  return {
    repairRegisterEventListener,
    repairSyntheticDispatchBridge,
  };
}

function buildPatchRuleContext(rule, report, diagnosis) {
  const input = {
    ...((report && typeof report === "object") ? report : {}),
    ...((diagnosis && typeof diagnosis === "object") ? {
      fingerprint: diagnosis.rawFingerprint || diagnosis.fingerprint,
      canonicalFingerprint: diagnosis.fingerprint,
      issue: diagnosis.issue,
    } : {}),
  };

  switch (String(rule?.id || "").trim()) {
    case "reader-entry-declarative-mapping":
      return buildReaderEntryDeclarativeMappingContext(input);
    case "reader-event-fine-grained-hook-declarations":
      return buildReaderFineGrainedHookDeclarationContext(input);
    case "reader-event-toolbar-bridge-registration":
      return buildReaderToolbarBridgeRegistrationContext(input);
    default:
      return null;
  }
}

function buildReaderEntryDeclarativeMappingDrafts(ruleContext = {}) {
  const drafts = [];
  if (ruleContext.restoreCommandRegistration !== false) {
    drafts.push(buildReaderEntryCommandRegistrationDraft());
  }
  if (ruleContext.restoreMenuRegistration === true) {
    drafts.push(buildReaderEntryMenuRegistrationDraft());
  }
  return drafts;
}

function buildReaderFineGrainedHookDeclarationDrafts(ruleContext = {}, summary) {
  const drafts = [];
  if (ruleContext.repairKnownTypeDeclarations !== false) {
    drafts.push(buildReaderEventKnownTypeDeclarationDraft(summary));
  }
  if (ruleContext.repairProbeCompatibleDeclarations !== false) {
    drafts.push(buildReaderEventProbeCompatibleTypeDeclarationDraft(summary));
  }
  if (ruleContext.repairSyntheticFallbackDeclarations === true) {
    drafts.push(...buildReaderEventSyntheticFallbackDraft(summary));
  }
  return drafts;
}

function buildReaderToolbarBridgeRegistrationDrafts(ruleContext = {}, summary) {
  const drafts = [];
  if (ruleContext.repairRegisterEventListener !== false) {
    drafts.push(...buildReaderEventBridgeRegistrationDraft(summary));
  }
  if (ruleContext.repairSyntheticDispatchBridge === true) {
    drafts.push(...buildReaderSupportsSyntheticFallbackDraft(summary));
    drafts.push(...buildReaderDispatchSyntheticEventDraft(summary));
  }
  return drafts;
}

function parseStaticRuntimeMissingFileIssue(issue) {
  const match = String(issue || "").match(/静态运行时基线缺失：(.+?)(?:（.+?）)?。$/u);
  if (!match) {
    return null;
  }
  const file = String(match[1] || "").trim();
  return file || null;
}

function parseStaticRuntimeDriftFileIssue(issue) {
  const match = String(issue || "").match(/静态运行时基线漂移：(.+?)(?:（.+?）)?。$/u);
  if (!match) {
    return null;
  }
  const file = String(match[1] || "").trim();
  return file || null;
}

function buildIconResourceCopyDrafts(diagnosis, summary) {
  const issueTargetFile = parseStaticRuntimeMissingFileIssue(diagnosis?.issue);
  const driftTargetFile = parseStaticRuntimeDriftFileIssue(diagnosis?.issue);
  const whitelistedCandidateFiles = uniqueStrings(
    Array.isArray(diagnosis?.candidateFiles)
      ? diagnosis.candidateFiles
      : [],
  ).filter((file) => Object.hasOwn(BASELINE_ICON_SOURCE_FILES, file));
  const candidateFiles = issueTargetFile && Object.hasOwn(BASELINE_ICON_SOURCE_FILES, issueTargetFile)
    ? [issueTargetFile]
    : driftTargetFile && Object.hasOwn(BASELINE_ICON_SOURCE_FILES, driftTargetFile)
      ? [driftTargetFile]
    : whitelistedCandidateFiles.length === 1
      ? whitelistedCandidateFiles
      : [];

  return candidateFiles.map((targetFile) => ({
    file: targetFile,
    sourceFile: BASELINE_ICON_SOURCE_FILES[targetFile],
    expectedSourceSha256: BASELINE_ICON_SOURCE_SHA256[targetFile],
    anchor: `${path.posix.basename(targetFile)} baseline`,
    summary,
    operation: "copy",
    patch: `@@ icon baseline\n~ copy ${BASELINE_ICON_SOURCE_FILES[targetFile]} -> ${targetFile}`,
  }));
}

function createUnsupportedDiagnosisDescriptor(fingerprint) {
  const normalized = normalizeDiagnosisFingerprint(fingerprint);
  switch (normalized) {
    case "bootstrap:plugin-not-mounted":
      return {
        category: "generic-runtime-failure",
        label: "泛化运行时失败",
        reason: "当前故障仍停留在插件挂载失败层，尚未收敛到可安全回放的单点白名单补丁。",
      };
    case "menu-action:primary-action-failed":
    case "agent-action:agent-action-failed":
      return {
        category: "behavioral-regression",
        label: "行为回归",
        reason: "当前故障表现为动作执行结果异常，仍需要先继续下钻成声明式入口或更小范围的结构化诊断。",
      };
    case "runtime-logs:error-logs-present":
      return {
        category: "environment-or-host",
        label: "环境或宿主噪声",
        reason: "当前只观测到泛化运行时 error 日志，尚未确认是插件问题还是宿主/环境噪声，不适合直接自动补丁。",
      };
    case "tests:tests-failed":
    case "scenarios:scenarios-failed":
      return {
        category: "unsafe-cross-file",
        label: "跨文件高风险回归",
        reason: "当前故障来自测试或场景级失败，可能涉及多文件与行为链路，超出当前白名单补丁边界。",
      };
    default:
      return {
        category: "unsafe-cross-file",
        label: "跨文件高风险回归",
        reason: "当前主诊断尚未收敛到受控、单点、可重放的低风险补丁规则，需先人工确认或继续细化诊断。",
      };
  }
}

function parseLocaleValueDriftIssue(issue) {
  const match = String(issue || "").match(
    /Locale\s+([A-Za-z-]+)\s+FTL\s+key\s+([A-Za-z0-9._-]+)\s+值漂移：期望\s+(.+?)，实际\s+(.+?)(?:。|$)/u,
  );
  if (!match) {
    return null;
  }

  const locale = String(match[1] || "").trim();
  const key = String(match[2] || "").trim();
  const expectedValue = String(match[3] || "").trim();
  const actualValue = String(match[4] || "").trim();
  if (!locale || !key || !expectedValue || !actualValue) {
    return null;
  }

  return {
    locale,
    key,
    expectedValue,
    actualValue,
  };
}

function buildItemPaneL10nReplaceDraft({
  diagnosis,
  slot,
  expectedKey,
  summary,
  beforeContextText,
  afterContextText,
}) {
  const parsed = parseExpectedActualKeysFromIssue(diagnosis?.issue);
  if (!parsed || parsed.expected !== expectedKey || parsed.actual === expectedKey) {
    return [];
  }

  const matchText = `      ${slot}: {\n        l10nID: "${parsed.actual}",`;
  const replacementText = `      ${slot}: {\n        l10nID: "${expectedKey}",`;

  return [
    {
      file: "src/app/feature-composer.js",
      anchor: `registerBaselineFeatures() / itemPane ${slot} l10nID`,
      summary,
      operation: "replace",
      existsText: replacementText,
      matchText,
      beforeContextText,
      afterContextText,
      contextWindowChars: 1200,
      replacementText,
      snippet: replacementText,
      patch: `@@ registerBaselineFeatures()
-      ${slot}: {
-        l10nID: "${parsed.actual}",
+      ${slot}: {
+        l10nID: "${expectedKey}",`,
    },
  ];
}

function buildMissingLocaleFTLDraft({
  diagnosis,
  expectedKey,
  summary,
  missingFileSummary,
}) {
  const parsed = parseLocaleMissingKeyIssue(diagnosis?.issue);
  if (!parsed || parsed.key !== expectedKey) {
    return [];
  }

  if (isLocaleMainFTLFileMissingIssue(diagnosis?.issue)) {
    return buildLocaleMainFTLCreateDraft({
      locale: parsed.locale,
      summary: missingFileSummary || `恢复 ${parsed.locale} locale 的最小基线 main.ftl。`,
    });
  }

  const expectedLine = buildExpectedFTLLine(parsed.locale, expectedKey);
  if (!expectedLine || !BASELINE_ITEM_PANE_FTL?.[parsed.locale]?.[expectedKey]) {
    return [];
  }

  return [
    {
      file: resolveLocaleMainFTLPath(parsed.locale),
      anchor: `${parsed.locale} / ${expectedKey}`,
      summary,
      operation: "append",
      existsText: expectedLine,
      beforeContextText: "cleanroom-dialog-body",
      contextWindowChars: 2000,
      snippet: `${expectedLine}\n`,
      patch: `@@ ${parsed.locale}/main.ftl
+${expectedLine}`,
    },
  ];
}

function buildLocaleFTLValueReplaceDraft({
  diagnosis,
  expectedKey,
  summary,
}) {
  const parsed = parseLocaleValueDriftIssue(diagnosis?.issue);
  if (!parsed || parsed.key !== expectedKey || parsed.expectedValue === parsed.actualValue) {
    return [];
  }

  const baselineValue = BASELINE_ITEM_PANE_FTL?.[parsed.locale]?.[expectedKey];
  if (!baselineValue || baselineValue !== parsed.expectedValue) {
    return [];
  }

  const matchText = `${expectedKey} = ${parsed.actualValue}`;
  const replacementText = `${expectedKey} = ${parsed.expectedValue}`;

  return [
    {
      file: resolveLocaleMainFTLPath(parsed.locale),
      anchor: `${parsed.locale} / ${expectedKey} value`,
      summary,
      operation: "replace",
      existsText: replacementText,
      matchText,
      beforeContextText: "cleanroom-dialog-body",
      contextWindowChars: 2000,
      replacementText,
      snippet: replacementText,
      patch: `@@ ${parsed.locale}/main.ftl
-${matchText}
+${replacementText}`,
    },
  ];
}

function toProjectRelativePath(projectRoot, filePath) {
  const raw = String(filePath || "").trim();
  if (!raw) {
    return null;
  }

  const absolutePath = path.isAbsolute(raw)
    ? path.normalize(raw)
    : path.resolve(projectRoot, raw);
  const relativePath = path.relative(projectRoot, absolutePath);
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  return relativePath.split(path.sep).join("/");
}

function hashBuffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function hashText(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf-8").digest("hex");
}

function collectDriftedVisualBaselineEntries(projectRoot, report) {
  const cycles = Array.isArray(report?.cycles) ? report.cycles : [];
  const collected = [];

  cycles.forEach((cycle) => {
    const captures = Array.isArray(cycle?.visuals?.captures) ? cycle.visuals.captures : [];
    const baselines = Array.isArray(cycle?.visuals?.analysis?.baselines) ? cycle.visuals.analysis.baselines : [];

    baselines.forEach((baseline) => {
      if (baseline?.status !== "compared" || baseline?.ok !== false) {
        return;
      }

      const kind = String(baseline?.kind || "").trim();
      const bootMode = String(baseline?.bootMode || cycle?.bootMode || "").trim();
      const targetFile = resolveVisualBaselineTargetFile({ bootMode, kind });
      if (!kind || !bootMode || !targetFile) {
        return;
      }

      const capture = captures.find((item) => String(item?.kind || "").trim() === kind);
      const sourceFile = toProjectRelativePath(projectRoot, capture?.path);
      const expectedSourceSha256 = String(capture?.analysis?.sha256 || "").trim();
      const observedTargetFile = toProjectRelativePath(projectRoot, baseline?.path);
      if (!sourceFile || !expectedSourceSha256) {
        return;
      }

      collected.push({
        kind,
        bootMode,
        targetFile,
        observedTargetFile,
        sourceFile,
        expectedSourceSha256,
      });
    });
  });

  const unique = new Map();
  collected.forEach((entry) => {
    const key = `${entry.targetFile}::${entry.sourceFile}::${entry.expectedSourceSha256}`;
    if (!unique.has(key)) {
      unique.set(key, entry);
    }
  });
  return Array.from(unique.values());
}

function buildVisualBaselineCopyDrafts(entries = []) {
  return (Array.isArray(entries) ? entries : []).map((entry) => ({
    file: entry.targetFile,
    sourceFile: entry.sourceFile,
    expectedSourceSha256: entry.expectedSourceSha256,
    anchor: `${entry.bootMode} / ${entry.kind} visual baseline`,
    summary: `使用最近一次 ${entry.bootMode} 的 ${entry.kind} 截图刷新模板视觉基线。`,
    operation: "copy",
    snippet: null,
    patch: `@@ visual baseline\n~ copy ${entry.sourceFile} -> ${entry.targetFile}`,
  }));
}

function normalizePatchRuleId(ruleId) {
  const key = String(ruleId || "").trim();
  switch (key) {
    case "reader-entry-command-registration":
    case "reader-entry-menu-registration":
      return "reader-entry-declarative-mapping";
    case "reader-event-bridge-registration":
      return "reader-event-toolbar-bridge-registration";
    case "reader-event-synthetic-fallback-mapping":
    case "reader-event-probe-compatible-declarations":
      return "reader-event-fine-grained-hook-declarations";
    default:
      return key;
  }
}

function buildObservationChecks({
  cycleFailures = false,
  errorLogs = false,
  staticRuntimeMissing = false,
  testFailures = false,
  scenarioFailures = false,
  serviceDegraded = false,
  serviceDegradedCycles = false,
} = {}) {
  const checks = [];

  if (cycleFailures) {
    checks.push({
      id: "cycle-failed-count",
      label: "失败轮次数",
      kind: "report-field",
      field: "cycleFailedCount",
      operator: "equals",
      expected: 0,
      required: false,
      detail: "观察项：最新 E2E 报告中的失败轮次数最好为 0。",
    });
  }
  if (errorLogs) {
    checks.push({
      id: "error-log-count",
      label: "错误日志总数",
      kind: "report-field",
      field: "errorLogCount",
      operator: "equals",
      expected: 0,
      required: false,
      detail: "观察项：最新 E2E 报告中的错误日志总数最好为 0。",
    });
  }
  if (staticRuntimeMissing) {
    checks.push({
      id: "static-runtime-missing-count",
      label: "静态运行时缺失总数",
      kind: "report-field",
      field: "staticRuntimeMissingCount",
      operator: "equals",
      expected: 0,
      required: false,
      detail: "观察项：最新 E2E 报告中的静态运行时缺失总数最好为 0。",
    });
  }
  if (testFailures) {
    checks.push({
      id: "test-failed-count",
      label: "集成测试失败总数",
      kind: "report-field",
      field: "testFailedCount",
      operator: "equals",
      expected: 0,
      required: false,
      detail: "观察项：最新 E2E 报告中的集成测试失败总数最好为 0。",
    });
  }
  if (scenarioFailures) {
    checks.push({
      id: "scenario-failed-count",
      label: "场景失败总数",
      kind: "report-field",
      field: "scenarioFailedCount",
      operator: "equals",
      expected: 0,
      required: false,
      detail: "观察项：最新 E2E 报告中的场景失败总数最好为 0。",
    });
  }
  if (serviceDegraded || serviceDegradedCycles) {
    checks.push({
      id: "service-degraded-cycle-count",
      label: "服务退化轮次数",
      kind: "report-field",
      field: "serviceDegradedCycleCount",
      operator: "equals",
      expected: 0,
      required: false,
      detail: "观察项：补丁后所有轮次最好都不再出现服务退化。",
    });
  }

  return checks;
}

const PATCH_WHITELIST_RULES = [
  {
    id: "reader-entry-declarative-mapping",
    fingerprints: [
      "reader-entry:declarative-reader-mapping-drift",
    ],
    category: "reader-entry-omission",
    feature: "reader-entry",
    featureLabel: "Reader 命令与菜单入口",
    mode: "review-only",
    maxTouchedFiles: 1,
    description: "允许恢复 Reader 命令面板与 Reader View 菜单的声明式注册块，但仅限 `src/app/feature-composer.js` 中的 clean-room baseline 入口。",
    allowedTargets: [
      "src/app/feature-composer.js",
    ],
    guardrails: [
      "只允许恢复 Reader 摘要命令、Reader View 菜单这两类既有声明式注册块，不允许新增新 feature。",
      "不得改动 handler、菜单目标、启用条件与宿主 UI 行为语义。",
      "补丁草案必须与 canonical replay 完全一致，且不得改动 import/export 结构。",
    ],
    proposedEdits: [
      "核对 `registerBaselineFeatures()` 中 Reader 摘要命令的 command palette 注册块是否仍保留在 baseline 注册链中。",
      "若官方菜单 API 可用，核对 Reader View 菜单项注册块是否仍保留在官方菜单 API 分支内。",
    ],
    verificationContract: {
      summary: "补丁后必须确认 Reader 声明式命令/菜单入口恢复，命令面板与 Reader View 菜单重新可见。",
      checks: [
        {
          id: "reader-summary-command-registered",
          label: "Reader 摘要命令注册",
          kind: "all-cycle-check",
          field: "readerSummaryCommandRegistered",
          operator: "equals",
          expected: true,
          detail: "所有轮次的 E2E checks.readerSummaryCommandRegistered 都应为 true。",
        },
        {
          id: "official-menu-api-available",
          label: "官方菜单 API 可用",
          kind: "all-cycle-check",
          field: "officialMenuAPIAvailable",
          operator: "equals",
          expected: true,
          required: false,
          detail: "观察项：如果当前运行时启用了官方菜单 API，Reader View 菜单应继续通过该链路注册。",
        },
        {
          id: "reader-summary-menu-registered",
          label: "Reader View 菜单注册",
          kind: "all-cycle-check",
          field: "readerSummaryMenuRegistered",
          operator: "equals",
          expected: true,
          detail: "所有轮次的 E2E checks.readerSummaryMenuRegistered 都应为 true。",
        },
        ...buildObservationChecks({
          cycleFailures: true,
          errorLogs: true,
        }),
      ],
    },
    resolveDrafts(input) {
      return buildReaderEntryDeclarativeMappingDrafts(
        input?.ruleContext || buildReaderEntryDeclarativeMappingContext(input),
      );
    },
    drafts: [
      {
        file: "src/app/feature-composer.js",
        anchor: "registerBaselineFeatures() / reader summary command",
        summary: "在 baseline 注册阶段补回 Reader 摘要命令注册。",
        existsText: '      id: `${config.addonRef}-reader-summary`,',
        anchorText: "    if (menuManager.isOfficialAPIAvailable()) {",
        beforeContextText: '      id: `${config.addonRef}-primary-action`,',
        afterContextText: "      menuManager.registerContextMenuItem({",
        contextWindowChars: 2400,
        insertMode: "before",
        snippet: `    commandPalette.registerCommand({
      id: \`\${config.addonRef}-reader-summary\`,
      label: i18n.t(
        "cleanroom-reader-menu-label",
        "Show Reader Demo Summary",
      ),
      category: config.addonName,
      description: i18n.t(
        "cleanroom-reader-command-description",
        "Show the active reader summary.",
      ),
      condition: () => Boolean(reader.getActiveSummary()),
      handler: () => {
        runReaderDemo();
      },
    });

`,
        patch: `@@ registerBaselineFeatures()
+    commandPalette.registerCommand({
+      id: \`\${config.addonRef}-reader-summary\`,
+      label: i18n.t(
+        "cleanroom-reader-menu-label",
+        "Show Reader Demo Summary",
+      ),
+      category: config.addonName,
+      description: i18n.t(
+        "cleanroom-reader-command-description",
+        "Show the active reader summary.",
+      ),
+      condition: () => Boolean(reader.getActiveSummary()),
+      handler: () => {
+        runReaderDemo();
+      },
+    });`,
      },
    ],
  },
  {
    id: "reader-event-toolbar-bridge-registration",
    fingerprints: [
      "reader-event:toolbar-bridge-registration-drift",
    ],
    category: "reader-event-bridge",
    feature: "reader-event",
    featureLabel: "Reader 事件桥",
    mode: "review-only",
    maxTouchedFiles: 1,
    description: "允许恢复 Reader Toolbar / 官方 listener 桥接块，但仅限 `src/features/reader.js` 中的 listener 注册与 synthetic dispatch clean-room baseline 代码块。",
    allowedTargets: [
      "src/features/reader.js",
    ],
    guardrails: [
      "只允许恢复 `registerEventListener()`、`supportsSyntheticFallback()` 与 `dispatchSyntheticEvent()` 这些既有桥接块。",
      "不得改写 Reader UI、宿主事件语义或跨文件重构。",
      "默认阻断 import/export 结构漂移，且单次补丁只允许触达 `src/features/reader.js`。",
    ],
    proposedEdits: [
      "核对 `registerEventListener()` 是否仍把 listener 正确桥接到 `Zotero.Reader` 并写回本地注册表。",
      "若 Toolbar 宿主点未观测，再核对 `supportsSyntheticFallback()` 与 `dispatchSyntheticEvent()` 是否仍能回放 `renderToolbar` 等细粒度 probe。",
    ],
    verificationContract: {
      summary: "补丁后必须确认 Reader Toolbar / 官方 listener 桥接恢复，宿主 Toolbar 观测与 Hook 场景同时回到模板基线。",
      checks: [
        {
          id: "reader-event-api-available",
          label: "Reader 事件 API 可用",
          kind: "all-cycle-check",
          field: "readerEventAPIAvailable",
          operator: "equals",
          expected: true,
          detail: "所有轮次的 E2E checks.readerEventAPIAvailable 都应为 true。",
        },
        {
          id: "reader-event-hook-scenario-passed",
          label: "Reader Hook 场景通过",
          kind: "all-cycle-check",
          field: "readerEventHookScenarioPassed",
          operator: "equals",
          expected: true,
          detail: "所有轮次的 E2E checks.readerEventHookScenarioPassed 都应为 true。",
        },
        {
          id: "reader-event-fine-grained-scenario-passed",
          label: "Reader 细粒度 Hook 场景通过",
          kind: "all-cycle-check",
          field: "readerEventFineGrainedScenarioPassed",
          operator: "equals",
          expected: true,
          detail: "所有轮次的 E2E checks.readerEventFineGrainedScenarioPassed 都应为 true。",
        },
        {
          id: "reader-event-toolbar-hook-observed",
          label: "Reader Toolbar 宿主点已观测",
          kind: "all-cycle-check",
          field: "readerEventToolbarHookObserved",
          operator: "equals",
          expected: true,
          detail: "所有轮次的 E2E checks.readerEventToolbarHookObserved 都应为 true。",
        },
        ...buildObservationChecks({
          cycleFailures: true,
          scenarioFailures: true,
          errorLogs: true,
        }),
      ],
    },
    resolveDrafts(input) {
      return buildReaderToolbarBridgeRegistrationDrafts(
        input?.ruleContext || buildReaderToolbarBridgeRegistrationContext(input),
        "恢复 Reader Toolbar / 官方 listener 桥接的 clean-room 基线代码块。",
      );
    },
  },
  {
    id: "reader-event-fine-grained-hook-declarations",
    fingerprints: [
      "reader-event:fine-grained-hook-declaration-drift",
    ],
    category: "reader-event-bridge",
    feature: "reader-event",
    featureLabel: "Reader 事件桥",
    mode: "review-only",
    maxTouchedFiles: 1,
    description: "允许恢复 Reader 细粒度 Hook 的声明式类型清单，但仅限 `src/features/reader.js` 中 `READER_EVENT_*` 常量块。",
    allowedTargets: [
      "src/features/reader.js",
    ],
    guardrails: [
      "只允许恢复 `READER_EVENT_KNOWN_TYPES`、`READER_EVENT_PROBE_COMPATIBLE_TYPES`、`READER_EVENT_SYNTHETIC_FALLBACK_TYPES` 这三组基线声明。",
      "只允许使用 replace-block，不允许改写宿主 UI、事件处理逻辑或跨文件重构。",
      "默认阻断 import/export 结构漂移，且不得引入非基线事件类型。",
    ],
    proposedEdits: [
      "核对 `READER_EVENT_KNOWN_TYPES`、`READER_EVENT_PROBE_COMPATIBLE_TYPES`、`READER_EVENT_SYNTHETIC_FALLBACK_TYPES` 是否仍覆盖模板基线事件类型。",
      "若只是声明清单漂移，仅恢复对应常量块，不触碰宿主 UI 行为。",
    ],
    verificationContract: {
      summary: "补丁后必须确认 Reader 细粒度 Hook 声明恢复到模板基线，已知类型、probe 类型、Toolbar 宿主观测与 synthetic-fallback 一并恢复。",
      checks: [
        {
          id: "reader-event-api-available",
          label: "Reader 事件 API 可用",
          kind: "all-cycle-check",
          field: "readerEventAPIAvailable",
          operator: "equals",
          expected: true,
          detail: "所有轮次的 E2E checks.readerEventAPIAvailable 都应为 true。",
        },
        {
          id: "reader-event-known-type-count",
          label: "Reader 已知事件类型数",
          kind: "all-cycle-check",
          field: "readerEventKnownTypeCount",
          operator: "gte",
          expected: 8,
          detail: "所有轮次的 E2E checks.readerEventKnownTypeCount 都应至少为 8。",
        },
        {
          id: "reader-event-probe-type-count",
          label: "Reader probe-compatible 类型数",
          kind: "all-cycle-check",
          field: "readerEventProbeTypeCount",
          operator: "gte",
          expected: 8,
          detail: "所有轮次的 E2E checks.readerEventProbeTypeCount 都应至少为 8。",
        },
        {
          id: "reader-event-synthetic-fallback-available",
          label: "Reader synthetic-fallback 可用",
          kind: "all-cycle-check",
          field: "readerEventSyntheticFallbackAvailable",
          operator: "equals",
          expected: true,
          detail: "所有轮次的 E2E checks.readerEventSyntheticFallbackAvailable 都应为 true。",
        },
        {
          id: "reader-event-fine-grained-scenario-passed",
          label: "Reader 细粒度 Hook 场景通过",
          kind: "all-cycle-check",
          field: "readerEventFineGrainedScenarioPassed",
          operator: "equals",
          expected: true,
          detail: "所有轮次的 E2E checks.readerEventFineGrainedScenarioPassed 都应为 true。",
        },
        {
          id: "reader-event-toolbar-hook-observed",
          label: "Reader Toolbar 宿主点已观测",
          kind: "all-cycle-check",
          field: "readerEventToolbarHookObserved",
          operator: "equals",
          expected: true,
          detail: "所有轮次的 E2E checks.readerEventToolbarHookObserved 都应为 true。",
        },
        ...buildObservationChecks({
          cycleFailures: true,
          scenarioFailures: true,
          errorLogs: true,
        }),
      ],
    },
    resolveDrafts(input) {
      return buildReaderFineGrainedHookDeclarationDrafts(
        input?.ruleContext || buildReaderFineGrainedHookDeclarationContext(input),
        "恢复 Reader 细粒度 Hook 声明式类型清单的 clean-room 基线常量块。",
      );
    },
  },
  {
    id: "menu-primary-command-registration",
    fingerprints: ["menu-action:primary-command-missing"],
    category: "menu-entry-omission",
    feature: "menu-action",
    featureLabel: "主命令与菜单动作",
    mode: "review-only",
    description: "允许补回主命令的 command palette 注册，但仅限 baseline 注册链中的既有入口。",
    allowedTargets: [
      "src/app/feature-composer.js",
    ],
    guardrails: [
      "只允许恢复默认主命令注册，不允许修改 handler、分类、文案或启用条件的语义。",
      "不得在此补丁中改写 `runPrimaryAction()`、菜单执行逻辑或其他命令。",
    ],
    proposedEdits: [
      "核对 `registerBaselineFeatures()` 中 `*-primary-action` 的 command palette 注册是否仍保留。",
      "若只是组合遗漏，优先补回单个 `commandPalette.registerCommand(...)` 调用。",
    ],
    verificationContract: {
      summary: "补丁后必须确认主命令重新注册成功。",
      checks: [
        {
          id: "primary-action-command-registered",
          label: "主命令注册",
          kind: "all-cycle-check",
          field: "primaryActionCommandRegistered",
          operator: "equals",
          expected: true,
          detail: "所有轮次的 E2E checks.primaryActionCommandRegistered 都应为 true。",
        },
        ...buildObservationChecks({
          cycleFailures: true,
          errorLogs: true,
        }),
      ],
    },
    drafts: [
      {
        file: "src/app/feature-composer.js",
        anchor: "registerBaselineFeatures() / primary action command",
        summary: "在 baseline 注册阶段补回主命令的 command palette 注册。",
        existsText: '      id: `${config.addonRef}-primary-action`,',
        anchorText: "    if (menuManager.isOfficialAPIAvailable()) {",
        contextWindowChars: 2400,
        insertMode: "before",
        snippet: `    commandPalette.registerCommand({
      id: \`\${config.addonRef}-primary-action\`,
      label: i18n.t("cleanroom-command-label", "Open Cleanroom Action"),
      category: config.addonName,
      description: i18n.t(
        "cleanroom-command-description",
        "Run the default clean-room template action.",
      ),
      condition: () => Boolean(prefs.get("enabled")),
      handler: () => {
        runPrimaryAction();
      },
    });

`,
        patch: `@@ registerBaselineFeatures()
+    commandPalette.registerCommand({
+      id: \`\${config.addonRef}-primary-action\`,
+      label: i18n.t("cleanroom-command-label", "Open Cleanroom Action"),
+      category: config.addonName,
+      description: i18n.t(
+        "cleanroom-command-description",
+        "Run the default clean-room template action.",
+      ),
+      condition: () => Boolean(prefs.get("enabled")),
+      handler: () => {
+        runPrimaryAction();
+      },
+    });`,
      },
    ],
  },
  {
    id: "menu-context-item-registration",
    fingerprints: ["menu-action:context-menu-missing"],
    category: "menu-entry-omission",
    feature: "menu-action",
    featureLabel: "主命令与菜单动作",
    mode: "review-only",
    description: "允许补回主窗口上下文菜单项注册，但仅限官方菜单 API 分支中的既有入口。",
    allowedTargets: [
      "src/app/feature-composer.js",
    ],
    guardrails: [
      "只允许恢复默认上下文菜单项，不允许修改可见性判定或命令执行语义。",
      "不得在此补丁中改写 Reader 菜单、主命令实现或宿主菜单目标。",
    ],
    proposedEdits: [
      "核对 `menuManager.registerContextMenuItem(...)` 是否仍位于 `menuManager.isOfficialAPIAvailable()` 分支内。",
      "若只是上下文菜单入口遗漏，优先补回单个注册块。",
    ],
    verificationContract: {
      summary: "补丁后必须确认主窗口上下文菜单项重新注册成功。",
      checks: [
        {
          id: "official-menu-api-available",
          label: "官方菜单 API 可用",
          kind: "all-cycle-check",
          field: "officialMenuAPIAvailable",
          operator: "equals",
          expected: true,
          detail: "所有轮次的 E2E checks.officialMenuAPIAvailable 都应为 true。",
        },
        {
          id: "context-action-menu-registered",
          label: "主窗口上下文菜单项注册",
          kind: "all-cycle-check",
          field: "contextActionMenuRegistered",
          operator: "equals",
          expected: true,
          detail: "所有轮次的 E2E checks.contextActionMenuRegistered 都应为 true。",
        },
        ...buildObservationChecks({
          cycleFailures: true,
          errorLogs: true,
        }),
      ],
    },
    drafts: [
      {
        file: "src/app/feature-composer.js",
        anchor: "registerBaselineFeatures() / context action menu item",
        summary: "在官方菜单 API 分支中补回主窗口上下文菜单项。",
        existsText: '        id: `${config.addonRef}-context-action`,',
        anchorText: "    if (menuManager.isOfficialAPIAvailable()) {",
        contextWindowChars: 2400,
        insertMode: "after",
        snippet: `
      menuManager.registerContextMenuItem({
        id: \`\${config.addonRef}-context-action\`,
        l10nID: "cleanroom-menu-label",
        onCommand: (event, context) => {
          runPrimaryAction(context?.window || getPrimaryWindow());
        },
        onShowing: (event, context) => {
          const hasItems = Array.isArray(context?.items) && context.items.length > 0;
          context.setVisible(Boolean(prefs.get("enabled")) && hasItems);
        },
      });
`,
        patch: `@@ registerBaselineFeatures()
+      menuManager.registerContextMenuItem({
+        id: \`\${config.addonRef}-context-action\`,
+        l10nID: "cleanroom-menu-label",
+        onCommand: (event, context) => {
+          runPrimaryAction(context?.window || getPrimaryWindow());
+        },
+        onShowing: (event, context) => {
+          const hasItems = Array.isArray(context?.items) && context.items.length > 0;
+          context.setVisible(Boolean(prefs.get("enabled")) && hasItems);
+        },
+      });`,
      },
    ],
  },
  {
    id: "bootstrap-startup-script-file",
    fingerprints: [
      "bootstrap:bootstrap-file-missing",
      "bootstrap:bootstrap-file-drift",
    ],
    category: "bootstrap-resource-missing",
    feature: "bootstrap",
    featureLabel: "启动与挂载",
    mode: "review-only",
    description: "允许恢复模板 bootstrap 启动脚本，但仅限 `addon-static/bootstrap.js`。",
    allowedTargets: [
      BASELINE_BOOTSTRAP_JS_PATH,
    ],
    guardrails: [
      "只允许创建缺失的模板 bootstrap 基线文件，或把同一路径回写为 clean-room canonical baseline。",
      "补丁内容必须来自模板自身 clean-room baseline，不得引入 reference 工程代码或额外宿主逻辑。",
      "若问题只是运行时挂载异常但 `bootstrap.js` 文件仍存在，应继续优先排查 `plugin-not-mounted` 的宿主链路，而不是误用文件恢复。",
    ],
    proposedEdits: [
      "确认 Node 侧静态体检或结构化诊断确实指向 `addon-static/bootstrap.js` 缺失或基线漂移。",
      "若文件缺失，则创建模板 bootstrap 基线文件；若文件已存在但内容漂移，则仅用 clean-room canonical baseline 回写该文件。",
    ],
    postApplyVerification: {
      strategy: "restart",
      fresh: false,
      label: "恢复 bootstrap 文件后重启复验",
    },
    verificationContract: {
      summary: "补丁后必须确认插件重新进入 bootstrap 生命周期，并在所有轮次稳定挂载。",
      checks: [
        {
          id: "plugin-mounted",
          label: "插件实例挂载",
          kind: "all-cycle-check",
          field: "pluginMounted",
          operator: "equals",
          expected: true,
          detail: "所有轮次的 E2E checks.pluginMounted 都应为 true。",
        },
        {
          id: "api-mounted",
          label: "插件 API 挂载",
          kind: "all-cycle-check",
          field: "apiMounted",
          operator: "equals",
          expected: true,
          detail: "所有轮次的 E2E checks.apiMounted 都应为 true。",
        },
        {
          id: "static-runtime-missing-count",
          label: "静态运行时缺失总数",
          kind: "report-field",
          field: "staticRuntimeMissingCount",
          operator: "equals",
          expected: 0,
          detail: "最新 E2E 报告中的 staticRuntimeMissingCount 应为 0。",
        },
        {
          id: "static-runtime-drift-count",
          label: "静态运行时漂移总数",
          kind: "report-field",
          field: "staticRuntimeDriftCount",
          operator: "equals",
          expected: 0,
          detail: "最新 E2E 报告中的 staticRuntimeDriftCount 应为 0。",
        },
        {
          id: "cycle-failed-count",
          label: "失败轮次数",
          kind: "report-field",
          field: "cycleFailedCount",
          operator: "equals",
          expected: 0,
          detail: "最新 E2E 报告中的 cycleFailedCount 应为 0。",
        },
        ...buildObservationChecks({
          testFailures: true,
          scenarioFailures: true,
          serviceDegradedCycles: true,
          errorLogs: true,
        }),
      ],
    },
    resolveDrafts(diagnosis) {
      if (String(diagnosis?.fingerprint || "").trim() === "bootstrap:bootstrap-file-drift") {
        return buildBootstrapFileBaselineCopyDraft(
          "使用 clean-room canonical baseline 回写 `bootstrap.js` 启动脚本。",
        );
      }
      return buildBootstrapFileCreateDraft(
        "恢复模板 clean-room `bootstrap.js` 启动脚本。",
      );
    },
  },
  {
    id: "assets-icon-resource-file",
    fingerprints: [
      "assets:icon-resource-missing",
      "assets:icon-resource-drift",
    ],
    category: "asset-resource-missing",
    feature: "assets",
    featureLabel: "静态资源与图标",
    mode: "review-only",
    description: "允许恢复或回写配置声明的模板 icon 资源文件，但仅限 `addon-static/content/icons/` 下的基线图标。",
    allowedTargets: [
      "addon-static/content/icons/icon-48.png",
      "addon-static/content/icons/icon-96.png",
    ],
    guardrails: [
      "只允许把模板仓库内的 clean-room 基线 icon 复制回缺失或漂移的目标图标文件，不允许改写非白名单图标。",
      "补丁来源必须来自 `scripts/baselines/icons/`，不得引入 reference 工程图片或外部资源。",
      "若 `config.icons` 已改成其他自定义路径，应先人工确认配置意图，不要把模板基线 icon 强行覆盖到非白名单目标。",
    ],
    proposedEdits: [
      "确认静态体检确实指向 `addon-static/content/icons/` 下的基线 icon 文件缺失或漂移。",
      "若命中白名单目标，仅复制对应 clean-room baseline icon，并重新执行 E2E 复验。",
    ],
    verificationContract: {
      summary: "补丁后必须确认静态运行时 icon 基线缺失与漂移计数归零，且本轮 E2E 恢复通过。",
      checks: [
        {
          id: "cycle-failed-count",
          label: "失败轮次数",
          kind: "report-field",
          field: "cycleFailedCount",
          operator: "equals",
          expected: 0,
          detail: "最新 E2E 报告中的 cycleFailedCount 应为 0。",
        },
        {
          id: "static-runtime-missing-count",
          label: "静态运行时缺失总数",
          kind: "report-field",
          field: "staticRuntimeMissingCount",
          operator: "equals",
          expected: 0,
          detail: "最新 E2E 报告中的 staticRuntimeMissingCount 应为 0。",
        },
        {
          id: "static-runtime-drift-count",
          label: "静态运行时漂移总数",
          kind: "report-field",
          field: "staticRuntimeDriftCount",
          operator: "equals",
          expected: 0,
          detail: "最新 E2E 报告中的 staticRuntimeDriftCount 应为 0。",
        },
        ...buildObservationChecks({
          errorLogs: true,
          testFailures: true,
          scenarioFailures: true,
          serviceDegradedCycles: true,
        }),
      ],
    },
    resolveDrafts(diagnosis) {
      return buildIconResourceCopyDrafts(
        diagnosis,
        String(diagnosis?.fingerprint || "").trim() === "assets:icon-resource-drift"
          ? "使用 clean-room canonical baseline 回写漂移的 icon 资源文件。"
          : "恢复模板 clean-room icon 资源文件。",
      );
    },
  },
  {
    id: "preferences-pane-registration",
    fingerprints: ["preferences:preference-pane-missing"],
    category: "preferences-omission",
    feature: "preferences",
    featureLabel: "偏好设置面板",
    mode: "review-only",
    description: "允许补回偏好设置面板注册，但仅限 baseline 注册链中的既有 pane 定义。",
    allowedTargets: [
      "src/app/feature-composer.js",
    ],
    guardrails: [
      "只允许恢复既有 preference pane 注册，不允许改写设置 schema、偏好持久化逻辑或 pane 内容结构。",
      "不得在此补丁中引入新的 pane、修改 addon 图标来源或重写 `preferences.xhtml` 内容。",
    ],
    proposedEdits: [
      "核对 `registerBaselineFeatures()` 中 `preferencePanes.registerPane(...)` 是否仍在 baseline 注册阶段执行。",
      "若只是面板注册遗漏，优先补回单个 pane 注册块。",
    ],
    verificationContract: {
      summary: "补丁后必须确认偏好设置面板重新注册成功。",
      checks: [
        {
          id: "preference-pane-registered",
          label: "偏好设置面板注册",
          kind: "all-cycle-check",
          field: "preferencePaneRegistered",
          operator: "equals",
          expected: true,
          detail: "所有轮次的 E2E checks.preferencePaneRegistered 都应为 true。",
        },
        {
          id: "preference-pane-count",
          label: "偏好设置面板数量",
          kind: "all-cycle-check",
          field: "preferencePaneCount",
          operator: "gte",
          expected: 1,
          detail: "所有轮次的 E2E checks.preferencePaneCount 都应至少为 1。",
        },
        {
          id: "static-runtime-missing-count",
          label: "静态运行时缺失总数",
          kind: "report-field",
          field: "staticRuntimeMissingCount",
          operator: "equals",
          expected: 0,
          detail: "最新 E2E 报告中的 staticRuntimeMissingCount 应为 0。",
        },
        ...buildObservationChecks({
          cycleFailures: true,
          errorLogs: true,
          scenarioFailures: true,
        }),
      ],
    },
    drafts: [
      {
        file: "src/app/feature-composer.js",
        anchor: "registerBaselineFeatures() / preference pane registration",
        summary: "在 baseline 注册阶段补回偏好设置面板注册。",
        existsText: '      id: `${config.addonRef}-preferences`,',
        anchorText: "    baselineReady = true;",
        contextWindowChars: 1200,
        insertMode: "after",
        snippet: `

    await preferencePanes.registerPane({
      id: \`\${config.addonRef}-preferences\`,
      src: "content/preferences.xhtml",
      label: config.addonName,
      image: config.icons?.["48"] || config.icons?.["96"],
    });
`,
        patch: `@@ registerBaselineFeatures()
+    await preferencePanes.registerPane({
+      id: \`\${config.addonRef}-preferences\`,
+      src: "content/preferences.xhtml",
+      label: config.addonName,
+      image: config.icons?.["48"] || config.icons?.["96"],
+    });`,
      },
    ],
  },
  {
    id: "preferences-pane-resource-file",
    fingerprints: [
      "preferences:preference-pane-resource-missing",
      "preferences:preference-pane-resource-drift",
    ],
    category: "preferences-resource-missing",
    feature: "preferences",
    featureLabel: "偏好设置面板",
    mode: "review-only",
    description: "允许恢复模板最小偏好设置面板资源文件，但仅限 `addon-static/content/preferences.xhtml`。",
    allowedTargets: [
      BASELINE_PREFERENCES_XHTML_PATH,
    ],
    guardrails: [
      "只允许创建缺失的模板最小 `preferences.xhtml`，或使用 clean-room canonical baseline 回写同一路径文件。",
      "补丁内容必须来自模板自身基线，不得引入 reference 工程资源、额外脚本或样式。",
      "若问题只是注册遗漏，应优先命中 `preferences-pane-registration`，不要把资源恢复当作通用修复手段。",
    ],
    proposedEdits: [
      "确认 recent error 或结构化诊断中确实出现 `preferences.xhtml` 资源缺失、加载失败或基线漂移，而不是单纯漏掉 `registerPane(...)`。",
      "若资源文件缺失，则恢复模板最小 `addon-static/content/preferences.xhtml`；若文件已存在但内容漂移，则仅回写 clean-room canonical baseline。",
    ],
    verificationContract: {
      summary: "补丁后必须确认偏好设置面板资源恢复并重新注册成功。",
      checks: [
        {
          id: "preference-pane-registered",
          label: "偏好设置面板注册",
          kind: "all-cycle-check",
          field: "preferencePaneRegistered",
          operator: "equals",
          expected: true,
          detail: "所有轮次的 E2E checks.preferencePaneRegistered 都应为 true。",
        },
        {
          id: "preference-pane-count",
          label: "偏好设置面板数量",
          kind: "all-cycle-check",
          field: "preferencePaneCount",
          operator: "gte",
          expected: 1,
          detail: "所有轮次的 E2E checks.preferencePaneCount 都应至少为 1。",
        },
        {
          id: "static-runtime-missing-count",
          label: "静态运行时缺失总数",
          kind: "report-field",
          field: "staticRuntimeMissingCount",
          operator: "equals",
          expected: 0,
          detail: "最新 E2E 报告中的 staticRuntimeMissingCount 应为 0。",
        },
        {
          id: "static-runtime-drift-count",
          label: "静态运行时漂移总数",
          kind: "report-field",
          field: "staticRuntimeDriftCount",
          operator: "equals",
          expected: 0,
          detail: "最新 E2E 报告中的 staticRuntimeDriftCount 应为 0。",
        },
        ...buildObservationChecks({
          cycleFailures: true,
          errorLogs: true,
          scenarioFailures: true,
        }),
      ],
    },
    resolveDrafts(diagnosis) {
      if (String(diagnosis?.fingerprint || "").trim() === "preferences:preference-pane-resource-drift") {
        return buildPreferencePaneResourceBaselineCopyDraft(
          "使用 clean-room canonical baseline 回写 `preferences.xhtml` 偏好设置面板资源文件。",
        );
      }
      return buildPreferencePaneResourceCreateDraft(
        "恢复模板最小 `preferences.xhtml` 偏好设置面板资源文件。",
      );
    },
  },
  {
    id: "runtime-style-sheet-resource-file",
    fingerprints: [
      "runtime-logs:style-sheet-resource-missing",
      "runtime-logs:style-sheet-resource-drift",
    ],
    category: "runtime-resource-missing",
    feature: "runtime-logs",
    featureLabel: "运行时日志与资源加载",
    mode: "review-only",
    description: "允许恢复模板最小主窗口样式资源文件，但仅限 `addon-static/content/style/main.css`。",
    allowedTargets: [
      BASELINE_MAIN_CSS_PATH,
    ],
    guardrails: [
      "只允许创建缺失的模板最小 `main.css`，或使用 clean-room canonical baseline 回写同一路径文件。",
      "补丁内容必须来自模板自身基线，不得混入 reference 工程样式或额外选择器。",
      "若错误日志并未明确指向 `content/style/main.css`，不要误把一般运行时日志归因到样式资源缺失。",
    ],
    proposedEdits: [
      "确认 recent error 或结构化诊断中确实出现 `content/style/main.css` 资源缺失、加载失败或基线漂移。",
      "若样式文件缺失，则恢复模板最小 `addon-static/content/style/main.css`；若文件已存在但内容漂移，则仅回写 clean-room canonical baseline。",
    ],
    verificationContract: {
      summary: "补丁后必须确认样式资源缺失不再触发运行时 error 日志，且本轮 E2E 恢复通过。",
      checks: [
        {
          id: "error-log-count",
          label: "Error 日志总数",
          kind: "report-field",
          field: "errorLogCount",
          operator: "equals",
          expected: 0,
          detail: "最新 E2E 报告中的 errorLogCount 应为 0。",
        },
        {
          id: "cycle-failed-count",
          label: "失败轮次数",
          kind: "report-field",
          field: "cycleFailedCount",
          operator: "equals",
          expected: 0,
          detail: "最新 E2E 报告中的 cycleFailedCount 应为 0。",
        },
        {
          id: "static-runtime-missing-count",
          label: "静态运行时缺失总数",
          kind: "report-field",
          field: "staticRuntimeMissingCount",
          operator: "equals",
          expected: 0,
          detail: "最新 E2E 报告中的 staticRuntimeMissingCount 应为 0。",
        },
        {
          id: "static-runtime-drift-count",
          label: "静态运行时漂移总数",
          kind: "report-field",
          field: "staticRuntimeDriftCount",
          operator: "equals",
          expected: 0,
          detail: "最新 E2E 报告中的 staticRuntimeDriftCount 应为 0。",
        },
      ],
    },
    resolveDrafts(diagnosis) {
      if (String(diagnosis?.fingerprint || "").trim() === "runtime-logs:style-sheet-resource-drift") {
        return buildMainCSSBaselineCopyDraft(
          "使用 clean-room canonical baseline 回写 `main.css` 主窗口样式资源文件。",
        );
      }
      return buildMainCSSCreateDraft(
        "恢复模板最小 `main.css` 主窗口样式资源文件。",
      );
    },
  },
  {
    id: "reader-visual-baseline-refresh",
    fingerprints: ["reader-ui:reader-visual-drift"],
    category: "reader-visual-regression",
    feature: "reader-ui",
    featureLabel: "Reader 与视觉回归",
    mode: "review-only",
    description: "允许使用模板自身最近一次真机截图，刷新受控 library/reader 视觉基线，但仅限模板仓库内的基线图片。",
    allowedTargets: [...VISUAL_BASELINE_ALLOWED_TARGETS],
    guardrails: [
      "只允许把最新 E2E 采集到的库视图/Reader 截图复制回模板自身视觉基线文件。",
      "不得写入 reference、文档图片或其他非视觉基线资源。",
      "补丁来源必须能在最新 `dist/agent-zotero-e2e.json` 的漂移条目中找到对应证据。",
    ],
    proposedEdits: [
      "先确认当前视觉变化确实是预期 UI 变更，而不是功能回归。",
      "若确认为预期变化，只刷新发生漂移的 library/reader 基线图片，不批量改写其他资源。",
    ],
    postApplyVerification: {
      strategy: "restart",
      fresh: false,
      label: "刷新视觉基线后重新验证",
    },
    verificationContract: {
      summary: "补丁后必须确认视觉漂移、缺失和比对异常计数都归零。",
      checks: [
        {
          id: "visual-drift-count",
          label: "视觉漂移计数",
          kind: "report-field",
          field: "visualDriftCount",
          operator: "equals",
          expected: 0,
          detail: "最新 E2E 报告汇总出的 visualDriftCount 应为 0。",
        },
        {
          id: "visual-missing-count",
          label: "视觉基线缺失计数",
          kind: "report-field",
          field: "visualMissingCount",
          operator: "equals",
          expected: 0,
          detail: "最新 E2E 报告汇总出的 visualMissingCount 应为 0。",
        },
        {
          id: "visual-error-count",
          label: "视觉比对异常计数",
          kind: "report-field",
          field: "visualErrorCount",
          operator: "equals",
          expected: 0,
          detail: "最新 E2E 报告汇总出的 visualErrorCount 应为 0。",
        },
      ],
    },
  },
  {
    id: "config-default-enabled",
    fingerprints: ["config:default-enabled-disabled"],
    category: "config-correction",
    feature: "config",
    featureLabel: "默认配置修正",
    mode: "review-only",
    description: "允许将模板默认配置中的 `defaultPrefs.enabled` 从 false 恢复为 true，但仅限 `config/addon.config.json`。",
    allowedTargets: [
      "config/addon.config.json",
    ],
    guardrails: [
      "只允许修正 `defaultPrefs.enabled` 的默认值，不允许顺带修改 addonId、instanceKey、prefsPrefix 等其他配置。",
      "补丁后必须使用 fresh profile 复验，避免把已有用户偏好误判为代码修复结果。",
    ],
    proposedEdits: [
      "确认问题不是当前 profile 的临时偏好漂移，而是模板默认配置把 `enabled` 设成了 false。",
      "若只是默认值错误，优先在 `config/addon.config.json` 中单点恢复，不要改动运行时逻辑。",
    ],
    postApplyVerification: {
      strategy: "restart",
      fresh: true,
      label: "应用白名单补丁后 fresh 重启复验",
    },
    verificationContract: {
      summary: "补丁后必须确认 fresh profile 中插件重新处于 enabled 状态，并且主动作链恢复成功。",
      checks: [
        {
          id: "plugin-enabled",
          label: "插件启用状态",
          kind: "latest-cycle-check",
          field: "enabled",
          operator: "equals",
          expected: true,
          detail: "最近一轮 E2E checks.enabled 应为 true。",
        },
        {
          id: "primary-action-result",
          label: "主动作结果",
          kind: "latest-cycle-check",
          field: "primaryActionResult",
          operator: "equals",
          expected: true,
          detail: "最近一轮 E2E checks.primaryActionResult 应为 true。",
        },
        {
          id: "agent-action-result",
          label: "Agent 动作结果",
          kind: "latest-cycle-check",
          field: "agentActionResult",
          operator: "equals",
          expected: true,
          detail: "最近一轮 E2E checks.agentActionResult 应为 true。",
        },
        {
          id: "cycle-failed-count",
          label: "失败轮次数",
          kind: "report-field",
          field: "cycleFailedCount",
          operator: "equals",
          expected: 0,
          required: false,
          detail: "观察项：最新 E2E 报告中的失败轮次数最好为 0。",
        },
      ],
    },
    drafts: [
      {
        file: "config/addon.config.json",
        anchor: "addon.config.json / defaultPrefs.enabled",
        summary: "将模板默认配置中的 `enabled` 从 false 恢复为 true。",
        operation: "replace",
        existsText: '    "enabled": true,',
        matchText: '    "enabled": false,',
        beforeContextText: '  "defaultPrefs": {',
        afterContextText: '    "menuLabel": "",',
        contextWindowChars: 400,
        replacementText: '    "enabled": true,',
        snippet: '    "enabled": true,',
        patch: `@@ defaultPrefs
-    "enabled": false,
+    "enabled": true,`,
      },
    ],
  },
  {
    id: "lifecycle-baseline-registration",
    fingerprints: ["lifecycle:baseline-registration-missing"],
    category: "lifecycle-omission",
    feature: "lifecycle",
    featureLabel: "生命周期与基线注册",
    mode: "review-only",
    description: "允许恢复启动链中的基线注册调用，但仅限 `kernel.start()` 内的既有调用顺序。",
    allowedTargets: [
      "src/app/kernel.js",
    ],
    guardrails: [
      "只允许补回 `registerBaselineFeatures()` 调用，不允许调整宿主就绪、服务启动和窗口装载的整体阶段顺序。",
      "不得在此补丁中改写具体 feature 实现、偏好逻辑或窗口运行时逻辑。",
    ],
    proposedEdits: [
      "确认 `start()` 中仍在服务启动后、窗口装载前执行 `registerBaselineFeatures()`。",
      "若只是启动链缺口，优先恢复单行调用，不要把注册逻辑搬迁到其他生命周期阶段。",
    ],
    verificationContract: {
      summary: "补丁后必须确认基线注册链恢复，ItemPane / ItemTree / Notifier 相关计数不再同时为 0。",
      checks: [
        {
          id: "item-pane-section-count",
          label: "ItemPane Section 注册计数",
          kind: "all-cycle-check",
          field: "itemPaneSections",
          operator: "gte",
          expected: 1,
          detail: "所有轮次的 E2E checks.itemPaneSections 都应至少为 1。",
        },
        {
          id: "item-pane-info-row-count",
          label: "ItemPane InfoRow 注册计数",
          kind: "all-cycle-check",
          field: "itemPaneInfoRows",
          operator: "gte",
          expected: 1,
          detail: "所有轮次的 E2E checks.itemPaneInfoRows 都应至少为 1。",
        },
        {
          id: "item-tree-column-count",
          label: "ItemTree 自定义列计数",
          kind: "all-cycle-check",
          field: "itemTreeColumns",
          operator: "gte",
          expected: 1,
          detail: "所有轮次的 E2E checks.itemTreeColumns 都应至少为 1。",
        },
        {
          id: "notifier-active-count",
          label: "Notifier 激活计数",
          kind: "all-cycle-check",
          field: "notifierActiveCount",
          operator: "gte",
          expected: 1,
          detail: "所有轮次的 E2E checks.notifierActiveCount 都应至少为 1。",
        },
        {
          id: "test-failed-count",
          label: "集成测试失败总数",
          kind: "report-field",
          field: "testFailedCount",
          operator: "equals",
          expected: 0,
          required: false,
          detail: "观察项：最新 E2E 报告中的集成测试失败总数最好为 0。",
        },
        {
          id: "scenario-failed-count",
          label: "场景失败总数",
          kind: "report-field",
          field: "scenarioFailedCount",
          operator: "equals",
          expected: 0,
          required: false,
          detail: "观察项：最新 E2E 报告中的场景失败总数最好为 0。",
        },
        {
          id: "service-degraded-cycle-count",
          label: "服务退化轮次数",
          kind: "report-field",
          field: "serviceDegradedCycleCount",
          operator: "equals",
          expected: 0,
          required: false,
          detail: "观察项：补丁后所有轮次最好都不再出现服务退化。",
        },
      ],
    },
    drafts: [
      {
        file: "src/app/kernel.js",
        anchor: "start() / registerBaselineFeatures()",
        summary: "在启动链中补回基线注册调用，确保在窗口装载前完成各类 baseline feature 注册。",
        existsText: "    await registerBaselineFeatures();",
        anchorText: "    windows.loadAll(mainWindows);",
        beforeContextText: "    if (typeof startServices === \"function\") {",
        afterContextText: "    runtime.markRunning();",
        contextWindowChars: 1600,
        insertMode: "before",
        snippet: `    await registerBaselineFeatures();

`,
        patch: `@@ start()
+    await registerBaselineFeatures();`,
      },
    ],
  },
  {
    id: "localization-item-pane-info-row-l10n-id",
    fingerprints: ["localization:item-pane-info-row-l10n-id-drift"],
    category: "localization-reference-drift",
    feature: "localization",
    featureLabel: "本地化引用修正",
    mode: "review-only",
    description: "允许修复 ItemPane InfoRow 的 `l10nID` 引用漂移，但仅限 `feature-composer` 中的单点替换。",
    allowedTargets: [
      "src/app/feature-composer.js",
    ],
    guardrails: [
      "只允许把 InfoRow 的 `l10nID` 恢复到模板基线键，不允许重写整段 ItemPane 注册逻辑。",
      "不得在此补丁中顺带改动 locale 文案内容或其他 UI 结构。",
    ],
    proposedEdits: [
      "核对 `itemPane.registerInfoRow()` 的 `label.l10nID` 是否仍为 `cleanroom-item-pane-info-row-label`。",
      "若只是 key typo，优先做单点替换，不要扩散到其他模块。",
    ],
    verificationContract: {
      summary: "补丁后必须确认 ItemPane 本地化漂移计数归零，且 InfoRow 仍保持已注册状态。",
      checks: [
        {
          id: "item-pane-l10n-drift-count",
          label: "ItemPane 本地化漂移计数",
          kind: "all-cycle-check",
          field: "itemPaneL10nDriftCount",
          operator: "equals",
          expected: 0,
          detail: "所有轮次的 E2E checks.itemPaneL10nDriftCount 都应为 0。",
        },
        {
          id: "item-pane-info-row-count",
          label: "ItemPane InfoRow 注册计数",
          kind: "all-cycle-check",
          field: "itemPaneInfoRows",
          operator: "gte",
          expected: 1,
          detail: "所有轮次的 E2E checks.itemPaneInfoRows 都应至少为 1。",
        },
        ...buildObservationChecks({
          cycleFailures: true,
          errorLogs: true,
        }),
      ],
    },
    resolveDrafts(diagnosis) {
      return buildItemPaneL10nReplaceDraft({
        diagnosis,
        slot: "label",
        expectedKey: "cleanroom-item-pane-info-row-label",
        summary: "将 ItemPane InfoRow 的 `l10nID` 恢复为模板基线键。",
        beforeContextText: "    itemPane.registerInfoRow({",
        afterContextText: '      position: "afterCreators",',
      });
    },
  },
  {
    id: "localization-item-pane-section-header-l10n-id",
    fingerprints: ["localization:item-pane-section-header-l10n-id-drift"],
    category: "localization-reference-drift",
    feature: "localization",
    featureLabel: "本地化引用修正",
    mode: "review-only",
    description: "允许修复 ItemPane Section Header 的 `l10nID` 引用漂移，但仅限 `feature-composer` 中的单点替换。",
    allowedTargets: [
      "src/app/feature-composer.js",
    ],
    guardrails: [
      "只允许把 Section Header 的 `l10nID` 恢复到模板基线键，不允许重写整个 section。",
      "不得在此补丁中顺带修改图标、回调或 locale 文案内容。",
    ],
    proposedEdits: [
      "核对 `itemPane.registerSection()` 中 `header.l10nID` 是否仍为 `cleanroom-item-pane-section-header`。",
      "若只是 header key 漂移，优先做单点替换。",
    ],
    verificationContract: {
      summary: "补丁后必须确认 ItemPane 本地化漂移计数归零，且 Section 仍保持已注册状态。",
      checks: [
        {
          id: "item-pane-l10n-drift-count",
          label: "ItemPane 本地化漂移计数",
          kind: "all-cycle-check",
          field: "itemPaneL10nDriftCount",
          operator: "equals",
          expected: 0,
          detail: "所有轮次的 E2E checks.itemPaneL10nDriftCount 都应为 0。",
        },
        {
          id: "item-pane-section-count",
          label: "ItemPane Section 注册计数",
          kind: "all-cycle-check",
          field: "itemPaneSections",
          operator: "gte",
          expected: 1,
          detail: "所有轮次的 E2E checks.itemPaneSections 都应至少为 1。",
        },
        ...buildObservationChecks({
          cycleFailures: true,
          errorLogs: true,
        }),
      ],
    },
    resolveDrafts(diagnosis) {
      return buildItemPaneL10nReplaceDraft({
        diagnosis,
        slot: "header",
        expectedKey: "cleanroom-item-pane-section-header",
        summary: "将 ItemPane Section Header 的 `l10nID` 恢复为模板基线键。",
        beforeContextText: "    itemPane.registerSection({",
        afterContextText: "      sidenav: {",
      });
    },
  },
  {
    id: "localization-item-pane-section-sidenav-l10n-id",
    fingerprints: ["localization:item-pane-section-sidenav-l10n-id-drift"],
    category: "localization-reference-drift",
    feature: "localization",
    featureLabel: "本地化引用修正",
    mode: "review-only",
    description: "允许修复 ItemPane Section Sidenav 的 `l10nID` 引用漂移，但仅限 `feature-composer` 中的单点替换。",
    allowedTargets: [
      "src/app/feature-composer.js",
    ],
    guardrails: [
      "只允许把 Section Sidenav 的 `l10nID` 恢复到模板基线键，不允许改写 section 结构。",
      "不得在此补丁中顺带修改 icon、render 或 notifier 行为。",
    ],
    proposedEdits: [
      "核对 `itemPane.registerSection()` 中 `sidenav.l10nID` 是否仍为 `cleanroom-item-pane-section-sidenav`。",
      "若只是 sidenav key 漂移，优先做单点替换。",
    ],
    verificationContract: {
      summary: "补丁后必须确认 ItemPane 本地化漂移计数归零，且 Section 仍保持已注册状态。",
      checks: [
        {
          id: "item-pane-l10n-drift-count",
          label: "ItemPane 本地化漂移计数",
          kind: "all-cycle-check",
          field: "itemPaneL10nDriftCount",
          operator: "equals",
          expected: 0,
          detail: "所有轮次的 E2E checks.itemPaneL10nDriftCount 都应为 0。",
        },
        {
          id: "item-pane-section-count",
          label: "ItemPane Section 注册计数",
          kind: "all-cycle-check",
          field: "itemPaneSections",
          operator: "gte",
          expected: 1,
          detail: "所有轮次的 E2E checks.itemPaneSections 都应至少为 1。",
        },
        ...buildObservationChecks({
          cycleFailures: true,
          errorLogs: true,
        }),
      ],
    },
    resolveDrafts(diagnosis) {
      return buildItemPaneL10nReplaceDraft({
        diagnosis,
        slot: "sidenav",
        expectedKey: "cleanroom-item-pane-section-sidenav",
        summary: "将 ItemPane Section Sidenav 的 `l10nID` 恢复为模板基线键。",
        beforeContextText: "      header: {",
        afterContextText: "      onInit: ({ refresh }) => {",
      });
    },
  },
  {
    id: "localization-item-pane-info-row-ftl-key",
    fingerprints: ["localization:item-pane-info-row-ftl-key-missing"],
    category: "localization-resource-drift",
    feature: "localization",
    featureLabel: "本地化引用修正",
    mode: "review-only",
    description: "允许补回 ItemPane InfoRow 的缺失 FTL key；若目标 locale 的 `main.ftl` 整体缺失，则允许恢复模板最小基线文件。",
    allowedTargets: [
      "addon-static/locale/en-US/main.ftl",
      "addon-static/locale/zh-CN/main.ftl",
      "addon-static/locale/zh-TW/main.ftl",
    ],
    guardrails: [
      "存在目标文件时，只允许补回单条缺失 key，不允许重排整份 locale 文件或批量重写文案。",
      "若目标文件整体缺失，只允许恢复模板最小基线 `main.ftl`，不得借用 reference 工程资源。",
      "补丁内容必须使用模板基线值，不得混入 reference 工程文案。",
    ],
    proposedEdits: [
      "核对对应 locale 的 `main.ftl` 是否缺少 `cleanroom-item-pane-info-row-label`。",
      "若 `main.ftl` 文件不存在，则恢复模板最小基线文件；若文件存在，仅追加缺失 key。",
      "若只是缺少单条映射，优先追加该行，不要改动其他 key。",
    ],
    verificationContract: {
      summary: "补丁后必须确认 locale FTL 缺失计数归零。",
      checks: [
        {
          id: "locale-ftl-missing-count",
          label: "Locale FTL 缺失计数",
          kind: "all-cycle-check",
          field: "localeFTLMissingCount",
          operator: "equals",
          expected: 0,
          detail: "所有轮次的 E2E checks.localeFTLMissingCount 都应为 0。",
        },
        ...buildObservationChecks({
          cycleFailures: true,
          errorLogs: true,
        }),
      ],
    },
    resolveDrafts(diagnosis) {
      return buildMissingLocaleFTLDraft({
        diagnosis,
        expectedKey: "cleanroom-item-pane-info-row-label",
        summary: "补回 ItemPane InfoRow 的缺失 FTL key。",
        missingFileSummary: "恢复 locale main.ftl 基线文件，并补回 ItemPane InfoRow 所需 key。",
      });
    },
  },
  {
    id: "localization-item-pane-section-header-ftl-key",
    fingerprints: ["localization:item-pane-section-header-ftl-key-missing"],
    category: "localization-resource-drift",
    feature: "localization",
    featureLabel: "本地化引用修正",
    mode: "review-only",
    description: "允许补回 ItemPane Section Header 的缺失 FTL key；若目标 locale 的 `main.ftl` 整体缺失，则允许恢复模板最小基线文件。",
    allowedTargets: [
      "addon-static/locale/en-US/main.ftl",
      "addon-static/locale/zh-CN/main.ftl",
      "addon-static/locale/zh-TW/main.ftl",
    ],
    guardrails: [
      "存在目标文件时，只允许补回单条缺失 key，不允许重排整份 locale 文件或批量重写文案。",
      "若目标文件整体缺失，只允许恢复模板最小基线 `main.ftl`，不得借用 reference 工程资源。",
      "补丁内容必须使用模板基线值，不得混入 reference 工程文案。",
    ],
    proposedEdits: [
      "核对对应 locale 的 `main.ftl` 是否缺少 `cleanroom-item-pane-section-header`。",
      "若 `main.ftl` 文件不存在，则恢复模板最小基线文件；若文件存在，仅追加缺失 key。",
      "若只是缺少单条映射，优先追加该行，不要改动其他 key。",
    ],
    verificationContract: {
      summary: "补丁后必须确认 locale FTL 缺失计数归零。",
      checks: [
        {
          id: "locale-ftl-missing-count",
          label: "Locale FTL 缺失计数",
          kind: "all-cycle-check",
          field: "localeFTLMissingCount",
          operator: "equals",
          expected: 0,
          detail: "所有轮次的 E2E checks.localeFTLMissingCount 都应为 0。",
        },
        ...buildObservationChecks({
          cycleFailures: true,
          errorLogs: true,
        }),
      ],
    },
    resolveDrafts(diagnosis) {
      return buildMissingLocaleFTLDraft({
        diagnosis,
        expectedKey: "cleanroom-item-pane-section-header",
        summary: "补回 ItemPane Section Header 的缺失 FTL key。",
        missingFileSummary: "恢复 locale main.ftl 基线文件，并补回 ItemPane Section Header 所需 key。",
      });
    },
  },
  {
    id: "localization-item-pane-section-sidenav-ftl-key",
    fingerprints: ["localization:item-pane-section-sidenav-ftl-key-missing"],
    category: "localization-resource-drift",
    feature: "localization",
    featureLabel: "本地化引用修正",
    mode: "review-only",
    description: "允许补回 ItemPane Section Sidenav 的缺失 FTL key；若目标 locale 的 `main.ftl` 整体缺失，则允许恢复模板最小基线文件。",
    allowedTargets: [
      "addon-static/locale/en-US/main.ftl",
      "addon-static/locale/zh-CN/main.ftl",
      "addon-static/locale/zh-TW/main.ftl",
    ],
    guardrails: [
      "存在目标文件时，只允许补回单条缺失 key，不允许重排整份 locale 文件或批量重写文案。",
      "若目标文件整体缺失，只允许恢复模板最小基线 `main.ftl`，不得借用 reference 工程资源。",
      "补丁内容必须使用模板基线值，不得混入 reference 工程文案。",
    ],
    proposedEdits: [
      "核对对应 locale 的 `main.ftl` 是否缺少 `cleanroom-item-pane-section-sidenav`。",
      "若 `main.ftl` 文件不存在，则恢复模板最小基线文件；若文件存在，仅追加缺失 key。",
      "若只是缺少单条映射，优先追加该行，不要改动其他 key。",
    ],
    verificationContract: {
      summary: "补丁后必须确认 locale FTL 缺失计数归零。",
      checks: [
        {
          id: "locale-ftl-missing-count",
          label: "Locale FTL 缺失计数",
          kind: "all-cycle-check",
          field: "localeFTLMissingCount",
          operator: "equals",
          expected: 0,
          detail: "所有轮次的 E2E checks.localeFTLMissingCount 都应为 0。",
        },
        ...buildObservationChecks({
          cycleFailures: true,
          errorLogs: true,
        }),
      ],
    },
    resolveDrafts(diagnosis) {
      return buildMissingLocaleFTLDraft({
        diagnosis,
        expectedKey: "cleanroom-item-pane-section-sidenav",
        summary: "补回 ItemPane Section Sidenav 的缺失 FTL key。",
        missingFileSummary: "恢复 locale main.ftl 基线文件，并补回 ItemPane Section Sidenav 所需 key。",
      });
    },
  },
  {
    id: "localization-item-pane-info-row-ftl-value",
    fingerprints: ["localization:item-pane-info-row-ftl-value-drift"],
    category: "localization-resource-drift",
    feature: "localization",
    featureLabel: "本地化引用修正",
    mode: "review-only",
    description: "允许修正 ItemPane InfoRow 的 FTL value 漂移，但仅限目标 locale 的 `main.ftl` 单行替换。",
    allowedTargets: [
      "addon-static/locale/en-US/main.ftl",
      "addon-static/locale/zh-CN/main.ftl",
      "addon-static/locale/zh-TW/main.ftl",
    ],
    guardrails: [
      "只允许替换单条基线 key 的值，不允许整份 locale 文件重写。",
      "替换值必须回到模板基线值，不得混入 reference 工程文案。",
    ],
    proposedEdits: [
      "核对对应 locale 的 `main.ftl` 中 `cleanroom-item-pane-info-row-label` 的值是否偏离模板基线。",
      "若只是 value 漂移，优先做单行替换。",
    ],
    verificationContract: {
      summary: "补丁后必须确认 locale FTL 值漂移计数归零。",
      checks: [
        {
          id: "locale-ftl-value-drift-count",
          label: "Locale FTL 值漂移计数",
          kind: "all-cycle-check",
          field: "localeFTLValueDriftCount",
          operator: "equals",
          expected: 0,
          detail: "所有轮次的 E2E checks.localeFTLValueDriftCount 都应为 0。",
        },
        ...buildObservationChecks({
          cycleFailures: true,
          errorLogs: true,
        }),
      ],
    },
    resolveDrafts(diagnosis) {
      return buildLocaleFTLValueReplaceDraft({
        diagnosis,
        expectedKey: "cleanroom-item-pane-info-row-label",
        summary: "修正 ItemPane InfoRow 的 FTL value 漂移。",
      });
    },
  },
  {
    id: "localization-item-pane-section-header-ftl-value",
    fingerprints: ["localization:item-pane-section-header-ftl-value-drift"],
    category: "localization-resource-drift",
    feature: "localization",
    featureLabel: "本地化引用修正",
    mode: "review-only",
    description: "允许修正 ItemPane Section Header 的 FTL value 漂移，但仅限目标 locale 的 `main.ftl` 单行替换。",
    allowedTargets: [
      "addon-static/locale/en-US/main.ftl",
      "addon-static/locale/zh-CN/main.ftl",
      "addon-static/locale/zh-TW/main.ftl",
    ],
    guardrails: [
      "只允许替换单条基线 key 的值，不允许整份 locale 文件重写。",
      "替换值必须回到模板基线值，不得混入 reference 工程文案。",
    ],
    proposedEdits: [
      "核对对应 locale 的 `main.ftl` 中 `cleanroom-item-pane-section-header` 的值是否偏离模板基线。",
      "若只是 value 漂移，优先做单行替换。",
    ],
    verificationContract: {
      summary: "补丁后必须确认 locale FTL 值漂移计数归零。",
      checks: [
        {
          id: "locale-ftl-value-drift-count",
          label: "Locale FTL 值漂移计数",
          kind: "all-cycle-check",
          field: "localeFTLValueDriftCount",
          operator: "equals",
          expected: 0,
          detail: "所有轮次的 E2E checks.localeFTLValueDriftCount 都应为 0。",
        },
        ...buildObservationChecks({
          cycleFailures: true,
          errorLogs: true,
        }),
      ],
    },
    resolveDrafts(diagnosis) {
      return buildLocaleFTLValueReplaceDraft({
        diagnosis,
        expectedKey: "cleanroom-item-pane-section-header",
        summary: "修正 ItemPane Section Header 的 FTL value 漂移。",
      });
    },
  },
  {
    id: "localization-item-pane-section-sidenav-ftl-value",
    fingerprints: ["localization:item-pane-section-sidenav-ftl-value-drift"],
    category: "localization-resource-drift",
    feature: "localization",
    featureLabel: "本地化引用修正",
    mode: "review-only",
    description: "允许修正 ItemPane Section Sidenav 的 FTL value 漂移，但仅限目标 locale 的 `main.ftl` 单行替换。",
    allowedTargets: [
      "addon-static/locale/en-US/main.ftl",
      "addon-static/locale/zh-CN/main.ftl",
      "addon-static/locale/zh-TW/main.ftl",
    ],
    guardrails: [
      "只允许替换单条基线 key 的值，不允许整份 locale 文件重写。",
      "替换值必须回到模板基线值，不得混入 reference 工程文案。",
    ],
    proposedEdits: [
      "核对对应 locale 的 `main.ftl` 中 `cleanroom-item-pane-section-sidenav` 的值是否偏离模板基线。",
      "若只是 value 漂移，优先做单行替换。",
    ],
    verificationContract: {
      summary: "补丁后必须确认 locale FTL 值漂移计数归零。",
      checks: [
        {
          id: "locale-ftl-value-drift-count",
          label: "Locale FTL 值漂移计数",
          kind: "all-cycle-check",
          field: "localeFTLValueDriftCount",
          operator: "equals",
          expected: 0,
          detail: "所有轮次的 E2E checks.localeFTLValueDriftCount 都应为 0。",
        },
        ...buildObservationChecks({
          cycleFailures: true,
          errorLogs: true,
        }),
      ],
    },
    resolveDrafts(diagnosis) {
      return buildLocaleFTLValueReplaceDraft({
        diagnosis,
        expectedKey: "cleanroom-item-pane-section-sidenav",
        summary: "修正 ItemPane Section Sidenav 的 FTL value 漂移。",
      });
    },
  },
  {
    id: "registration-item-pane-section",
    fingerprints: ["item-pane:item-pane-section-missing"],
    category: "registration-omission",
    feature: "item-pane",
    featureLabel: "ItemPane 注册",
    mode: "review-only",
    description: "允许补齐 ItemPane Section 注册遗漏，但仅限既有 feature 模块和组合入口。",
    allowedTargets: [
      "src/features/item-pane.js",
      "src/app/feature-composer.js",
    ],
    guardrails: [
      "只允许补齐缺失的注册调用，不允许重写既有 ItemPane helper 行为。",
      "不得修改持久化数据结构、偏好 schema 或跨 feature 公共契约。",
    ],
    proposedEdits: [
      "检查 `registerBaselineFeatures()` 中的 ItemPane 注册分支是否仍会执行。",
      "若只是组合遗漏，优先补齐 `feature-composer` 内的基线注册调用。",
    ],
    verificationContract: {
      summary: "补丁后必须确认 ItemPane Section 注册计数恢复，且主诊断不再停留在同一缺失问题。",
      checks: [
        {
          id: "item-pane-section-count",
          label: "ItemPane Section 注册计数",
          kind: "all-cycle-check",
          field: "itemPaneSections",
          operator: "gte",
          expected: 1,
          detail: "所有轮次的 E2E checks.itemPaneSections 都应至少为 1。",
        },
        ...buildObservationChecks({
          cycleFailures: true,
          errorLogs: true,
          testFailures: true,
          scenarioFailures: true,
          serviceDegraded: true,
        }),
      ],
    },
    drafts: [
      {
        file: "src/app/feature-composer.js",
        anchor: "registerBaselineFeatures() / itemPane.registerSection",
        summary: "在 baseline 注册阶段补回缺失的 ItemPane Section 注册调用。",
        existsText: 'paneID: demoSectionID',
        anchorText: "    notifier.subscribe(",
        beforeContextText: "    itemPane.registerInfoRow({",
        afterContextText: '      ["item", "file", "tab"],',
        contextWindowChars: 2400,
        insertMode: "before",
        snippet: `    itemPane.registerSection({
      paneID: demoSectionID,
      header: {
        l10nID: "cleanroom-item-pane-section-header",
        icon: host.resolveContentUrl("content/icons/icon-48.png"),
      },
      sidenav: {
        l10nID: "cleanroom-item-pane-section-sidenav",
        icon: host.resolveContentUrl("content/icons/icon-48.png"),
      },
      onInit: ({ refresh }) => {
        if (typeof refresh === "function") {
          demoSectionRefreshers.add(refresh);
        }
      },
      onDestroy: ({ refresh }) => {
        if (typeof refresh === "function") {
          demoSectionRefreshers.delete(refresh);
        }
      },
      onItemChange: ({ item, setEnabled, setSectionSummary }) => {
        setEnabled(Boolean(item));
        if (item) {
          setSectionSummary(getItemSummary(item));
        }
      },
      onRender: ({ doc, body, item, setSectionSummary }) => {
        body.replaceChildren(
          createSectionLine(
            doc,
            i18n.t("cleanroom-demo-field-item", "Item"),
            getItemSummary(item),
          ),
          createSectionLine(
            doc,
            i18n.t("cleanroom-demo-field-shortcut", "Shortcut"),
            \`\${demoState.shortcutLabel} · \${demoState.shortcutTriggerCount}\`,
          ),
          createSectionLine(
            doc,
            i18n.t("cleanroom-demo-field-notifier", "Notifier"),
            demoState.lastNotifierEvent,
          ),
          createSectionLine(
            doc,
            i18n.t("cleanroom-demo-field-status", "Status"),
            i18n.t("cleanroom-demo-status-ready", "Baseline demos ready"),
          ),
        );

        if (item) {
          setSectionSummary(getItemSummary(item));
        }
      },
    });

`,
        patch: `@@ registerBaselineFeatures()
+    itemPane.registerSection({
+      paneID: demoSectionID,
+      header: {
+        l10nID: "cleanroom-item-pane-section-header",
+        icon: host.resolveContentUrl("content/icons/icon-48.png"),
+      },
+      sidenav: {
+        l10nID: "cleanroom-item-pane-section-sidenav",
+        icon: host.resolveContentUrl("content/icons/icon-48.png"),
+      },
+      onInit: ({ refresh }) => {
+        if (typeof refresh === "function") {
+          demoSectionRefreshers.add(refresh);
+        }
+      },
+      onDestroy: ({ refresh }) => {
+        if (typeof refresh === "function") {
+          demoSectionRefreshers.delete(refresh);
+        }
+      },
+      onItemChange: ({ item, setEnabled, setSectionSummary }) => {
+        setEnabled(Boolean(item));
+        if (item) {
+          setSectionSummary(getItemSummary(item));
+        }
+      },
+      onRender: ({ doc, body, item, setSectionSummary }) => {
+        // 保持现有 demo section 渲染逻辑
+      },
+    });`,
      },
    ],
  },
  {
    id: "registration-item-pane-info-row",
    fingerprints: ["item-pane:item-pane-info-row-missing"],
    category: "registration-omission",
    feature: "item-pane",
    featureLabel: "ItemPane 注册",
    mode: "review-only",
    description: "允许补齐 ItemPane InfoRow 注册遗漏，但仅限既有 feature 模块和组合入口。",
    allowedTargets: [
      "src/features/item-pane.js",
      "src/app/feature-composer.js",
    ],
    guardrails: [
      "只允许补齐注册与组合，不允许改写宿主契约字段含义。",
      "若涉及本地化 ID，需保持现有命名空间不变。",
    ],
    proposedEdits: [
      "确认 InfoRow helper 的创建与注册调用仍在启动链路中执行。",
      "若是条件分支误拦截，优先修正布尔守卫而不是新增并行实现。",
    ],
    verificationContract: {
      summary: "补丁后必须确认 ItemPane InfoRow 注册计数恢复，且主诊断不再停留在同一缺失问题。",
      checks: [
        {
          id: "item-pane-info-row-count",
          label: "ItemPane InfoRow 注册计数",
          kind: "all-cycle-check",
          field: "itemPaneInfoRows",
          operator: "gte",
          expected: 1,
          detail: "所有轮次的 E2E checks.itemPaneInfoRows 都应至少为 1。",
        },
        ...buildObservationChecks({
          cycleFailures: true,
          errorLogs: true,
          testFailures: true,
          scenarioFailures: true,
          serviceDegraded: true,
        }),
      ],
    },
    drafts: [
      {
        file: "src/app/feature-composer.js",
        anchor: "registerBaselineFeatures() / itemPane.registerInfoRow",
        summary: "在 baseline 注册阶段补回缺失的 ItemPane InfoRow 注册调用。",
        existsText: 'rowID: demoInfoRowID',
        anchorText: "    itemPane.registerSection({",
        beforeContextText: "    itemTree.registerColumn({",
        afterContextText: "      paneID: demoSectionID,",
        contextWindowChars: 2400,
        insertMode: "before",
        snippet: `    itemPane.registerInfoRow({
      rowID: demoInfoRowID,
      label: {
        l10nID: "cleanroom-item-pane-info-row-label",
      },
      position: "afterCreators",
      multiline: true,
      editable: false,
      onGetData: ({ item }) => {
        return getItemSummary(item);
      },
      onItemChange: ({ item, setEnabled }) => {
        setEnabled(Boolean(item));
      },
    });

`,
        patch: `@@ registerBaselineFeatures()
+    itemPane.registerInfoRow({
+      rowID: demoInfoRowID,
+      label: {
+        l10nID: "cleanroom-item-pane-info-row-label",
+      },
+      position: "afterCreators",
+      multiline: true,
+      editable: false,
+      onGetData: ({ item }) => getItemSummary(item),
+      onItemChange: ({ item, setEnabled }) => {
+        setEnabled(Boolean(item));
+      },
+    });`,
      },
    ],
  },
  {
    id: "registration-item-tree-column",
    fingerprints: ["item-tree:item-tree-column-missing"],
    category: "registration-omission",
    feature: "item-tree",
    featureLabel: "ItemTree 自定义列",
    mode: "review-only",
    description: "允许补齐 ItemTree 列注册遗漏，但仅限列定义与 feature 组合入口。",
    allowedTargets: [
      "src/features/item-tree.js",
      "src/app/feature-composer.js",
    ],
    guardrails: [
      "只允许修改列注册与 dataKey 绑定，不允许引入新的宿主数据约定。",
      "不得在补丁中顺带修改无关 UI 行为。",
    ],
    proposedEdits: [
      "确认列注册函数在窗口挂载后被执行。",
      "核对 namespaced `dataKey` 与 Zotero 宿主接收值是否一致。",
    ],
    verificationContract: {
      summary: "补丁后必须确认 ItemTree 自定义列重新注册成功，且主诊断不再停留在同一缺失问题。",
      checks: [
        {
          id: "item-tree-column-count",
          label: "ItemTree 自定义列计数",
          kind: "all-cycle-check",
          field: "itemTreeColumns",
          operator: "gte",
          expected: 1,
          detail: "所有轮次的 E2E checks.itemTreeColumns 都应至少为 1。",
        },
        ...buildObservationChecks({
          cycleFailures: true,
          errorLogs: true,
          testFailures: true,
          scenarioFailures: true,
          serviceDegraded: true,
        }),
      ],
    },
    drafts: [
      {
        file: "src/app/feature-composer.js",
        anchor: "registerBaselineFeatures() / itemTree.registerColumn",
        summary: "在 baseline 注册阶段补回缺失的 ItemTree 列注册调用。",
        existsText: 'dataKey: demoColumnKey',
        anchorText: "    itemPane.registerInfoRow({",
        beforeContextText: "    if (menuManager.isOfficialAPIAvailable()) {",
        afterContextText: "      rowID: demoInfoRowID,",
        contextWindowChars: 2400,
        insertMode: "before",
        snippet: `    itemTree.registerColumn({
      dataKey: demoColumnKey,
      label: i18n.t("cleanroom-item-tree-label", "Cleanroom"),
      width: "110",
      fixedWidth: false,
      sortable: false,
      enabledTreeIDs: ["main"],
      dataProvider: (item) => getColumnValue(item),
      renderCell: itemTree.createConditionalCellRenderer(
        (value) => String(value || "").includes("0"),
        { color: "#8b5cf6", fontWeight: "600" },
        { color: "#0f766e", fontWeight: "600" },
      ),
    });

`,
        patch: `@@ registerBaselineFeatures()
+    itemTree.registerColumn({
+      dataKey: demoColumnKey,
+      label: i18n.t("cleanroom-item-tree-label", "Cleanroom"),
+      width: "110",
+      fixedWidth: false,
+      sortable: false,
+      enabledTreeIDs: ["main"],
+      dataProvider: (item) => getColumnValue(item),
+      renderCell: itemTree.createConditionalCellRenderer(
+        (value) => String(value || "").includes("0"),
+        { color: "#8b5cf6", fontWeight: "600" },
+        { color: "#0f766e", fontWeight: "600" },
+      ),
+    });`,
      },
    ],
  },
  {
    id: "registration-notifier",
    fingerprints: ["notifier:notifier-inactive"],
    category: "registration-omission",
    feature: "notifier",
    featureLabel: "Notifier 事件订阅",
    mode: "review-only",
    description: "允许补齐 Notifier 订阅遗漏，但仅限 notifier 模块和组合入口。",
    allowedTargets: [
      "src/core/notifier.js",
      "src/app/feature-composer.js",
    ],
    guardrails: [
      "只允许修复订阅注册与释放逻辑，不允许更改事件载荷格式。",
      "不得为了通过验证而禁用现有 notifier 清理逻辑。",
    ],
    proposedEdits: [
      "确认 notifier subscribe 在 `registerBaselineFeatures()` 阶段执行，并且返回的 cleanup 被 lifecycle 正确跟踪。",
      "检查热重载后是否因 cleanup 时序导致订阅丢失。",
    ],
    verificationContract: {
      summary: "补丁后必须确认 Notifier 激活计数恢复，且主诊断不再停留在同一缺失问题。",
      checks: [
        {
          id: "notifier-active-count",
          label: "Notifier 激活计数",
          kind: "all-cycle-check",
          field: "notifierActiveCount",
          operator: "gte",
          expected: 1,
          detail: "所有轮次的 E2E checks.notifierActiveCount 都应至少为 1。",
        },
        ...buildObservationChecks({
          cycleFailures: true,
          errorLogs: true,
          testFailures: true,
          scenarioFailures: true,
          serviceDegraded: true,
        }),
      ],
    },
    drafts: [
      {
        file: "src/app/feature-composer.js",
        anchor: "registerBaselineFeatures() / notifier.subscribe",
        summary: "在 baseline 注册阶段补回缺失的 Notifier 订阅调用。",
        existsText: 'id: demoNotifierID',
        anchorText: '    logger.info("plugin.baseline.ready", {',
        beforeContextText: "    itemPane.registerSection({",
        afterContextText: "      notifiers: notifier.getActiveCount(),",
        contextWindowChars: 2400,
        insertMode: "before",
        snippet: `    notifier.subscribe(
      ["item", "file", "tab"],
      (event, type, ids) => {
        updateDemoNotifierState(event, type, ids);
      },
      {
        id: demoNotifierID,
      },
    );

`,
        patch: `@@ registerBaselineFeatures()
+    notifier.subscribe(
+      ["item", "file", "tab"],
+      (event, type, ids) => {
+        updateDemoNotifierState(event, type, ids);
+      },
+      {
+        id: demoNotifierID,
+      },
+    );`,
      },
    ],
  },
];

function uniqueStrings(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean),
  ));
}

function cloneVerificationContract(template) {
  if (!template || typeof template !== "object") {
    return null;
  }

  return {
    summary: template.summary || null,
    checks: Array.isArray(template.checks)
      ? template.checks.map((check) => ({
        id: check.id || null,
        label: check.label || check.id || null,
        kind: check.kind || null,
        required: check.required !== false,
        field: check.field || null,
        operator: check.operator || null,
        expected: Object.prototype.hasOwnProperty.call(check, "expected")
          ? check.expected
          : null,
        detail: check.detail || null,
      }))
      : [],
  };
}

function customizeVerificationContract(ruleId, template, ruleContext) {
  const contract = cloneVerificationContract(template);
  if (!contract || !ruleContext || typeof ruleContext !== "object") {
    return contract;
  }

  const normalizedRuleId = normalizePatchRuleId(ruleId);
  const updateRequired = (checkId, required) => {
    contract.checks = contract.checks.map((check) => {
      if (check.id !== checkId) {
        return check;
      }
      return {
        ...check,
        required,
      };
    });
  };

  if (normalizedRuleId === "reader-entry-declarative-mapping") {
    if (ruleContext.restoreCommandRegistration === false) {
      updateRequired("reader-summary-command-registered", false);
    }
    if (ruleContext.restoreMenuRegistration !== true) {
      updateRequired("official-menu-api-available", false);
      updateRequired("reader-summary-menu-registered", false);
    }
    return contract;
  }

  if (normalizedRuleId === "reader-event-fine-grained-hook-declarations") {
    if (ruleContext.repairKnownTypeDeclarations === false) {
      updateRequired("reader-event-known-type-count", false);
    }
    if (ruleContext.repairProbeCompatibleDeclarations === false) {
      updateRequired("reader-event-probe-type-count", false);
    }
    if (ruleContext.repairSyntheticFallbackDeclarations !== true) {
      updateRequired("reader-event-synthetic-fallback-available", false);
    }
    return contract;
  }

  if (normalizedRuleId === "reader-event-toolbar-bridge-registration") {
    if (ruleContext.repairSyntheticDispatchBridge !== true) {
      updateRequired("reader-event-toolbar-hook-observed", false);
    }
    return contract;
  }

  return contract;
}

function clonePostApplyVerification(template) {
  if (!template || typeof template !== "object") {
    return null;
  }

  const strategy = String(template.strategy || "").trim();
  return {
    strategy: strategy || "restart",
    fresh: template.fresh === true,
    label: template.label || null,
  };
}

function projectPatchDraft(draft) {
  const expectedContentSha256 = resolveDraftExpectedContentSha256(draft);
  return {
    file: String(draft?.file || ""),
    sourceFile: draft?.sourceFile || null,
    expectedSourceSha256: draft?.expectedSourceSha256 || null,
    expectedContentSha256,
    anchor: draft?.anchor || null,
    summary: draft?.summary || null,
    patch: draft?.patch || null,
    operation: getDraftOperation(draft),
    existsText: draft?.existsText || null,
    blockAnchorText: draft?.blockAnchorText || null,
    startText: draft?.startText || null,
    endText: draft?.endText || null,
    anchorText: draft?.anchorText || null,
    matchText: draft?.matchText || null,
    beforeContextText: draft?.beforeContextText || null,
    afterContextText: draft?.afterContextText || null,
    contextWindowChars: draft?.contextWindowChars ?? null,
    insertMode: draft?.insertMode || null,
    replacementText: draft?.replacementText || null,
    snippet: draft?.snippet || null,
  };
}

function findRuleByFingerprint(fingerprint) {
  const key = normalizeDiagnosisFingerprint(fingerprint);
  return PATCH_WHITELIST_RULES.find((rule) => Array.isArray(rule.fingerprints) && rule.fingerprints.includes(key)) || null;
}

function findRuleById(ruleId) {
  const key = normalizePatchRuleId(ruleId);
  if (!key) {
    return null;
  }
  return PATCH_WHITELIST_RULES.find((rule) => String(rule?.id || "").trim() === key) || null;
}

function resolveRuleDrafts(rule, diagnosis) {
  if (rule && typeof rule.resolveDrafts === "function") {
    const drafts = rule.resolveDrafts(diagnosis);
    return Array.isArray(drafts) ? drafts : [];
  }
  return Array.isArray(rule?.drafts) ? rule.drafts : [];
}

function countOccurrences(haystack, needle) {
  if (!needle) {
    return 0;
  }
  return String(haystack).split(String(needle)).length - 1;
}

function buildDiagnosisFromPatchPlan(patchPlan) {
  return {
    fingerprint: normalizeDiagnosisFingerprint(patchPlan?.fingerprint) || null,
    feature: patchPlan?.feature || null,
    featureLabel: patchPlan?.featureLabel || patchPlan?.feature || null,
    issue: patchPlan?.issue || null,
    candidateFiles: Array.isArray(patchPlan?.candidateFiles) ? patchPlan.candidateFiles.slice(0, 8) : [],
    ruleContext: patchPlan?.ruleContext && typeof patchPlan.ruleContext === "object"
      ? { ...patchPlan.ruleContext }
      : null,
  };
}

function compareProjectedDraft(expected, actual) {
  const expectedDraft = projectPatchDraft(expected);
  const actualDraft = projectPatchDraft(actual);

  return [
    "file",
    "sourceFile",
    "expectedSourceSha256",
    "expectedContentSha256",
    "anchor",
    "summary",
    "patch",
    "operation",
    "existsText",
    "blockAnchorText",
    "startText",
    "endText",
    "anchorText",
    "matchText",
    "beforeContextText",
    "afterContextText",
    "contextWindowChars",
    "insertMode",
    "replacementText",
    "snippet",
  ].every((field) => expectedDraft[field] === actualDraft[field]);
}

function resolveDraftExpectedContentSha256(draft) {
  const operation = getDraftOperation(draft);
  if (operation === "copy") {
    return String(draft?.expectedContentSha256 || draft?.expectedSourceSha256 || "").trim() || null;
  }
  const content = operation === "replace" || operation === "replace-block"
    ? String(draft?.replacementText || "")
    : String(draft?.snippet || "");
  if (!content) {
    return null;
  }
  return hashText(content);
}

function collectDraftContentHashIssues(actualDrafts) {
  return actualDrafts.flatMap((draft) => {
    const operation = getDraftOperation(draft);
    if (operation !== "replace" && operation !== "replace-block" && operation !== "copy") {
      return [];
    }
    const expectedHash = String(
      draft?.expectedContentSha256
      || (operation === "copy" ? "" : resolveDraftExpectedContentSha256(draft))
      || "",
    ).trim();
    if (!expectedHash) {
      return [];
    }
    const actualHash = resolveDraftExpectedContentSha256(draft);
    if (!actualHash || actualHash === expectedHash) {
      return [];
    }
    return [{
      file: String(draft?.file || "").trim() || null,
      reason: "draft-content-hash-mismatch",
    }];
  });
}

function validatePatchPlanSandbox(patchPlan) {
  const ruleFromId = findRuleById(patchPlan?.whitelistRuleId);
  const ruleFromFingerprint = findRuleByFingerprint(patchPlan?.fingerprint);
  const rule = ruleFromId || ruleFromFingerprint;
  if (!rule) {
    return [{
      file: null,
      reason: "whitelist-rule-missing",
    }];
  }

  if (
    ruleFromId
    && ruleFromFingerprint
    && normalizePatchRuleId(ruleFromId.id) !== normalizePatchRuleId(ruleFromFingerprint.id)
  ) {
    return [{
      file: null,
      reason: "whitelist-rule-mismatch",
    }];
  }

  if (patchPlan?.whitelistRuleId && normalizePatchRuleId(rule.id) !== normalizePatchRuleId(patchPlan.whitelistRuleId)) {
    return [{
      file: null,
      reason: "whitelist-rule-mismatch",
    }];
  }

  const allowedTargets = new Set(uniqueStrings(rule.allowedTargets));
  const actualDrafts = Array.isArray(patchPlan?.patchDrafts) ? patchPlan.patchDrafts : [];
  const contentHashIssues = collectDraftContentHashIssues(actualDrafts);
  if (contentHashIssues.length > 0) {
    return contentHashIssues;
  }
  const touchedFiles = uniqueStrings(actualDrafts.map((draft) => draft?.file));
  const maxTouchedFiles = Math.max(
    1,
    Number(rule?.maxTouchedFiles || uniqueStrings(rule.allowedTargets).length || 1),
  );
  if (touchedFiles.length > maxTouchedFiles) {
    return [{
      file: null,
      reason: "touched-files-limit-exceeded",
    }];
  }
  const unexpectedTargets = actualDrafts
    .map((draft) => String(draft?.file || "").trim())
    .filter(Boolean)
    .filter((file) => !allowedTargets.has(file));
  if (unexpectedTargets.length > 0) {
    return uniqueStrings(unexpectedTargets).map((file) => ({
      file,
      reason: "target-outside-whitelist",
    }));
  }

  if (rule.id === "reader-visual-baseline-refresh") {
    return actualDrafts
      .filter((draft) => String(draft?.operation || "").trim().toLowerCase() !== "copy"
        || !String(draft?.file || "").trim()
        || !String(draft?.sourceFile || "").trim()
        || !String(draft?.expectedSourceSha256 || "").trim())
      .map((draft) => ({
        file: String(draft?.file || "").trim() || null,
        reason: "draft-mismatch",
      }));
  }

  const canonicalDrafts = resolveRuleDrafts(rule, buildDiagnosisFromPatchPlan(patchPlan));
  if (canonicalDrafts.length === 0) {
    return [{
      file: null,
      reason: "rule-draft-unresolved",
    }];
  }

  if (actualDrafts.length !== canonicalDrafts.length) {
    return [{
      file: null,
      reason: "draft-count-mismatch",
    }];
  }

  const mismatches = [];
  actualDrafts.forEach((draft, index) => {
    const canonical = canonicalDrafts[index];
    if (!compareProjectedDraft(canonical, draft)) {
      mismatches.push({
        file: draft?.file || canonical?.file || null,
        reason: "draft-mismatch",
      });
    }
  });
  return mismatches;
}

function normalizeForStructuralCompare(value) {
  return String(value || "").replace(/\s+/gu, "");
}

function includesNormalized(haystack, needle) {
  const normalizedNeedle = normalizeForStructuralCompare(needle);
  if (!normalizedNeedle) {
    return false;
  }
  return normalizeForStructuralCompare(haystack).includes(normalizedNeedle);
}

function resolveContextWindowChars(draft) {
  const value = Number(draft?.contextWindowChars || 0);
  return Number.isFinite(value) && value > 0 ? value : 2000;
}

function getDraftOperation(draft) {
  return String(draft?.operation || "insert").trim().toLowerCase();
}

function getDraftMatchText(draft) {
  const operation = getDraftOperation(draft);
  if (operation === "replace-block") {
    return String(draft?.startText || "");
  }
  if (operation === "replace") {
    return String(draft?.matchText || "");
  }
  if (operation === "append" || operation === "create") {
    return "";
  }
  return String(draft?.anchorText || "");
}

function getDraftSnippetText(draft) {
  const operation = getDraftOperation(draft);
  return operation === "replace" || operation === "replace-block"
    ? String(draft?.replacementText || "")
    : String(draft?.snippet || "");
}

function countModuleBoundaryLines(source) {
  return String(source || "")
    .split(/\r?\n/gu)
    .filter((line) => /^\s*(import|export)\s/gu.test(line))
    .length;
}

function allowsImportExportDrift(draft) {
  return draft?.allowImportExportDrift === true;
}

function resolveReplaceBlockBounds(source, draft) {
  const startText = String(draft?.startText || "");
  const endText = String(draft?.endText || "");
  const startCount = startText ? countOccurrences(source, startText) : 0;
  const startIndex = startCount === 1 ? source.indexOf(startText) : -1;
  const endIndex = startIndex >= 0 && endText
    ? source.indexOf(endText, startIndex + startText.length)
    : -1;
  const matchedBlock = startIndex >= 0 && endIndex >= 0
    ? source.slice(startIndex, endIndex + endText.length)
    : "";

  return {
    startText,
    endText,
    startCount,
    startIndex,
    endIndex,
    matchedBlock,
  };
}

async function buildCopyPrecheck(projectRoot, draft) {
  const sourceFile = String(draft?.sourceFile || "").trim();
  const expectedSourceSha256 = String(draft?.expectedSourceSha256 || "").trim();
  const normalizedSourceFile = toProjectRelativePath(projectRoot, sourceFile);
  if (!normalizedSourceFile) {
    return {
      file: draft.file,
      anchor: draft.anchor || null,
      anchorFound: false,
      anchorCount: 0,
      uniqueAnchor: false,
      snippetPresent: false,
      snippetMatchMode: "none",
      targetAlreadyPatched: false,
      contextWindowChars: 0,
      beforeContextMatched: true,
      afterContextMatched: true,
      beforeContextText: null,
      afterContextText: null,
      ok: false,
      reason: "source-file-outside-project",
    };
  }

  const sourcePath = path.join(projectRoot, normalizedSourceFile);
  let sourceBuffer;
  try {
    sourceBuffer = await fs.readFile(sourcePath);
  }
  catch (error) {
    if (error && error.code === "ENOENT") {
      return {
        file: draft.file,
        anchor: draft.anchor || null,
        anchorFound: false,
        anchorCount: 0,
        uniqueAnchor: false,
        snippetPresent: false,
        snippetMatchMode: "none",
        targetAlreadyPatched: false,
        contextWindowChars: 0,
        beforeContextMatched: true,
        afterContextMatched: true,
        beforeContextText: null,
        afterContextText: null,
        ok: false,
        reason: "source-file-missing",
      };
    }
    throw error;
  }

  const actualSourceSha256 = hashBuffer(sourceBuffer);
  if (expectedSourceSha256 && actualSourceSha256 !== expectedSourceSha256) {
    return {
      file: draft.file,
      anchor: draft.anchor || null,
      anchorFound: false,
      anchorCount: 0,
      uniqueAnchor: false,
      snippetPresent: false,
      snippetMatchMode: "none",
      targetAlreadyPatched: false,
      contextWindowChars: 0,
      beforeContextMatched: true,
      afterContextMatched: true,
      beforeContextText: null,
      afterContextText: null,
      ok: false,
      reason: "source-hash-mismatch",
    };
  }

  let targetAlreadyPatched = false;
  const targetPath = path.join(projectRoot, draft.file);
  try {
    const targetBuffer = await fs.readFile(targetPath);
    targetAlreadyPatched = hashBuffer(targetBuffer) === actualSourceSha256;
  }
  catch (error) {
    if (!error || error.code !== "ENOENT") {
      throw error;
    }
  }

  return {
    file: draft.file,
    anchor: draft.anchor || null,
    anchorFound: true,
    anchorCount: 1,
    uniqueAnchor: true,
    snippetPresent: targetAlreadyPatched,
    snippetMatchMode: targetAlreadyPatched ? "exact" : "none",
    targetAlreadyPatched,
    contextWindowChars: 0,
    beforeContextMatched: true,
    afterContextMatched: true,
    beforeContextText: null,
    afterContextText: null,
    ok: !targetAlreadyPatched,
    reason: targetAlreadyPatched ? "target-already-current" : "ready",
  };
}

function checkContextWindow(source, draft, anchorIndex) {
  const windowChars = resolveContextWindowChars(draft);
  const matchText = getDraftMatchText(draft);
  const start = Math.max(0, anchorIndex - windowChars);
  const end = Math.min(source.length, anchorIndex + matchText.length + windowChars);
  const beforeSlice = source.slice(start, anchorIndex);
  const afterSlice = source.slice(anchorIndex + matchText.length, end);
  const beforeContextText = String(draft.beforeContextText || "");
  const afterContextText = String(draft.afterContextText || "");

  const beforeContextMatched = beforeContextText
    ? beforeSlice.includes(beforeContextText)
    : true;
  const afterContextMatched = afterContextText
    ? afterSlice.includes(afterContextText)
    : true;

  return {
    contextWindowChars: windowChars,
    beforeContextMatched,
    afterContextMatched,
    beforeContextText: beforeContextText || null,
    afterContextText: afterContextText || null,
  };
}

function checkAppendContext(source, draft) {
  const beforeContextText = String(draft.beforeContextText || "");
  const afterContextText = String(draft.afterContextText || "");

  return {
    contextWindowChars: resolveContextWindowChars(draft),
    beforeContextMatched: beforeContextText
      ? source.includes(beforeContextText)
      : true,
    afterContextMatched: afterContextText
      ? source.includes(afterContextText)
      : true,
    beforeContextText: beforeContextText || null,
    afterContextText: afterContextText || null,
  };
}

function buildCreatePrecheckFromMissingFile(draft) {
  return {
    file: draft.file,
    anchor: draft.anchor || null,
    anchorFound: true,
    anchorCount: 1,
    uniqueAnchor: true,
    snippetPresent: false,
    snippetMatchMode: "none",
    targetAlreadyPatched: false,
    contextWindowChars: 0,
    beforeContextMatched: true,
    afterContextMatched: true,
    beforeContextText: null,
    afterContextText: null,
    ok: true,
    reason: "ready",
  };
}

function buildCreatePrecheckFromExistingFile(source, draft) {
  const snippetText = getDraftSnippetText(draft);
  const exactSnippetPresent = snippetText ? source === snippetText : false;
  const normalizedSnippetPresent = !exactSnippetPresent && snippetText
    ? normalizeForStructuralCompare(source) === normalizeForStructuralCompare(snippetText)
    : false;
  const snippetPresent = exactSnippetPresent || normalizedSnippetPresent;
  const targetAlreadyPatched = snippetPresent;

  return {
    file: draft.file,
    anchor: draft.anchor || null,
    anchorFound: false,
    anchorCount: 0,
    uniqueAnchor: false,
    snippetPresent,
    snippetMatchMode: exactSnippetPresent ? "exact" : (normalizedSnippetPresent ? "normalized" : "none"),
    targetAlreadyPatched,
    contextWindowChars: 0,
    beforeContextMatched: true,
    afterContextMatched: true,
    beforeContextText: null,
    afterContextText: null,
    ok: false,
    reason: targetAlreadyPatched ? "target-already-contains-snippet" : "target-file-exists",
  };
}

function buildDraftPrecheck(source, draft) {
  const operation = getDraftOperation(draft);
  if (operation === "replace-block") {
    const bounds = resolveReplaceBlockBounds(source, draft);
    const snippetText = getDraftSnippetText(draft);
    const exactSnippetPresent = snippetText ? source.includes(String(snippetText).trim()) : false;
    const normalizedSnippetPresent = !exactSnippetPresent && snippetText
      ? includesNormalized(source, snippetText)
      : false;
    const snippetPresent = exactSnippetPresent || normalizedSnippetPresent;
    const context = bounds.startIndex >= 0
      ? checkContextWindow(source, {
        ...draft,
        anchorText: bounds.startText,
      }, bounds.startIndex)
      : {
        contextWindowChars: resolveContextWindowChars(draft),
        beforeContextMatched: true,
        afterContextMatched: true,
        beforeContextText: draft.beforeContextText || null,
        afterContextText: draft.afterContextText || null,
      };
    const blockAnchorText = String(draft?.blockAnchorText || "");
    const blockAnchorMatched = blockAnchorText ? source.includes(blockAnchorText) : true;
    const moduleStructureMatched = allowsImportExportDrift(draft)
      || countModuleBoundaryLines(bounds.matchedBlock) === countModuleBoundaryLines(snippetText);
    const targetAlreadyPatched = Boolean(draft?.existsText && source.includes(draft.existsText))
      || snippetPresent;
    const ok = !targetAlreadyPatched
      && blockAnchorMatched
      && bounds.startCount > 0
      && bounds.startCount === 1
      && bounds.endIndex >= 0
      && context.beforeContextMatched
      && context.afterContextMatched
      && moduleStructureMatched;

    let reason = "ready";
    if (targetAlreadyPatched) {
      reason = "target-already-contains-snippet";
    } else if (!blockAnchorMatched) {
      reason = "block-anchor-mismatch";
    } else if (bounds.startCount === 0 || bounds.endIndex < 0) {
      reason = "anchor-not-found";
    } else if (bounds.startCount !== 1) {
      reason = "anchor-not-unique";
    } else if (!context.beforeContextMatched) {
      reason = "before-context-mismatch";
    } else if (!context.afterContextMatched) {
      reason = "after-context-mismatch";
    } else if (!moduleStructureMatched) {
      reason = "module-structure-drift";
    }

    return {
      file: draft.file,
      anchor: draft.anchor || null,
      anchorFound: bounds.startCount > 0 && bounds.endIndex >= 0,
      anchorCount: bounds.startCount,
      uniqueAnchor: bounds.startCount === 1,
      snippetPresent,
      snippetMatchMode: exactSnippetPresent ? "exact" : (normalizedSnippetPresent ? "normalized" : "none"),
      targetAlreadyPatched,
      contextWindowChars: context.contextWindowChars,
      beforeContextMatched: context.beforeContextMatched,
      afterContextMatched: context.afterContextMatched,
      beforeContextText: context.beforeContextText,
      afterContextText: context.afterContextText,
      blockAnchorMatched,
      moduleStructureMatched,
      ok,
      reason,
    };
  }
  const exists = draft.existsText ? source.includes(draft.existsText) : false;
  const matchText = getDraftMatchText(draft);
  const snippetText = getDraftSnippetText(draft);
  const anchorCount = operation === "append"
    ? 1
    : (matchText ? countOccurrences(source, matchText) : 0);
  const exactSnippetPresent = snippetText ? source.includes(String(snippetText).trim()) : false;
  const normalizedSnippetPresent = !exactSnippetPresent && snippetText
    ? includesNormalized(source, snippetText)
    : false;
  const snippetPresent = exactSnippetPresent || normalizedSnippetPresent;
  const anchorFound = operation === "append" ? true : anchorCount > 0;
  const uniqueAnchor = operation === "append" ? true : anchorCount === 1;
  const anchorIndex = uniqueAnchor && matchText ? source.indexOf(matchText) : -1;
  const context = operation === "append"
    ? checkAppendContext(source, draft)
    : anchorIndex >= 0
      ? checkContextWindow(source, draft, anchorIndex)
      : {
        contextWindowChars: resolveContextWindowChars(draft),
        beforeContextMatched: true,
        afterContextMatched: true,
        beforeContextText: draft.beforeContextText || null,
        afterContextText: draft.afterContextText || null,
      };
  const contextMatched = context.beforeContextMatched && context.afterContextMatched;
  const targetAlreadyPatched = operation === "replace"
    ? (!anchorFound && (exists || snippetPresent))
    : (exists || snippetPresent);
  const ok = !targetAlreadyPatched && anchorFound && uniqueAnchor && contextMatched;

  let reason = "ready";
  if (targetAlreadyPatched) {
    reason = "target-already-contains-snippet";
  } else if (!anchorFound) {
    reason = "anchor-not-found";
  } else if (!uniqueAnchor) {
    reason = "anchor-not-unique";
  } else if (!context.beforeContextMatched) {
    reason = "before-context-mismatch";
  } else if (!context.afterContextMatched) {
    reason = "after-context-mismatch";
  }

  return {
    file: draft.file,
    anchor: draft.anchor || null,
    anchorFound,
    anchorCount,
    uniqueAnchor,
    snippetPresent,
    snippetMatchMode: exactSnippetPresent ? "exact" : (normalizedSnippetPresent ? "normalized" : "none"),
    targetAlreadyPatched,
    contextWindowChars: context.contextWindowChars,
    beforeContextMatched: context.beforeContextMatched,
    afterContextMatched: context.afterContextMatched,
    beforeContextText: context.beforeContextText,
    afterContextText: context.afterContextText,
    ok,
    reason,
  };
}

function buildMissingFilePrecheck(draft) {
  return {
    file: draft.file,
    anchor: draft.anchor || null,
    anchorFound: false,
    anchorCount: 0,
    uniqueAnchor: false,
    snippetPresent: false,
    snippetMatchMode: "none",
    targetAlreadyPatched: false,
    contextWindowChars: resolveContextWindowChars(draft),
    beforeContextMatched: false,
    afterContextMatched: false,
    beforeContextText: draft.beforeContextText || null,
    afterContextText: draft.afterContextText || null,
    ok: false,
    reason: "target-file-missing",
  };
}

async function precheckDraft(projectRoot, draft) {
  if (getDraftOperation(draft) === "copy") {
    return buildCopyPrecheck(projectRoot, draft);
  }
  const targetPath = path.join(projectRoot, draft.file);
  if (getDraftOperation(draft) === "create") {
    try {
      const source = await fs.readFile(targetPath, "utf-8");
      return buildCreatePrecheckFromExistingFile(source, draft);
    }
    catch (error) {
      if (error && error.code === "ENOENT") {
        return buildCreatePrecheckFromMissingFile(draft);
      }
      throw error;
    }
  }
  try {
    const source = await fs.readFile(targetPath, "utf-8");
    return buildDraftPrecheck(source, draft);
  }
  catch (error) {
    if (error && error.code === "ENOENT") {
      return buildMissingFilePrecheck(draft);
    }
    throw error;
  }
}

async function applyDraftToFile(projectRoot, draft) {
  const operation = getDraftOperation(draft);
  if (operation === "copy") {
    const precheck = await buildCopyPrecheck(projectRoot, draft);
    if (!precheck.ok) {
      return {
        ...precheck,
        skipped: true,
        applied: false,
      };
    }

    const normalizedSourceFile = toProjectRelativePath(projectRoot, draft?.sourceFile);
    const sourcePath = path.join(projectRoot, normalizedSourceFile || "");
    const targetPath = path.join(projectRoot, draft.file);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.copyFile(sourcePath, targetPath);
    return {
      file: draft.file,
      anchor: draft.anchor || null,
      anchorFound: true,
      anchorCount: 1,
      uniqueAnchor: true,
      snippetPresent: false,
      targetAlreadyPatched: false,
      ok: true,
      skipped: false,
      applied: true,
      reason: "applied",
    };
  }
  const matchText = getDraftMatchText(draft);
  const snippetText = getDraftSnippetText(draft);
  if (operation === "create") {
    const targetPath = path.join(projectRoot, draft.file);
    try {
      const source = await fs.readFile(targetPath, "utf-8");
      return {
        ...buildCreatePrecheckFromExistingFile(source, draft),
        skipped: true,
        applied: false,
      };
    }
    catch (error) {
      if (!error || error.code !== "ENOENT") {
        throw error;
      }
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, snippetText, "utf-8");
    return {
      file: draft.file,
      anchor: draft.anchor || null,
      anchorFound: true,
      anchorCount: 1,
      uniqueAnchor: true,
      snippetPresent: false,
      targetAlreadyPatched: false,
      ok: true,
      skipped: false,
      applied: true,
      reason: "applied",
    };
  }
  if (operation === "replace-block") {
    const targetPath = path.join(projectRoot, draft.file);
    let source = "";
    try {
      source = await fs.readFile(targetPath, "utf-8");
    }
    catch (error) {
      if (error && error.code === "ENOENT") {
        return {
          ...buildMissingFilePrecheck(draft),
          skipped: true,
          applied: false,
        };
      }
      throw error;
    }
    const precheck = buildDraftPrecheck(source, draft);
    if (!precheck.ok) {
      return {
        ...precheck,
        skipped: true,
        applied: false,
      };
    }
    const bounds = resolveReplaceBlockBounds(source, draft);
    const next = `${source.slice(0, bounds.startIndex)}${snippetText}${source.slice(bounds.endIndex + String(draft?.endText || "").length)}`;
    await fs.writeFile(targetPath, next, "utf-8");
    return {
      file: draft.file,
      anchor: draft.anchor || null,
      anchorFound: true,
      anchorCount: 1,
      uniqueAnchor: true,
      snippetPresent: false,
      targetAlreadyPatched: false,
      ok: true,
      skipped: false,
      applied: true,
      reason: "applied",
    };
  }
  const replacement = operation === "replace"
    ? snippetText
    : operation === "append"
      ? null
    : (draft.insertMode === "after"
      ? `${matchText}${snippetText}`
      : `${snippetText}${matchText}`);
  const targetPath = path.join(projectRoot, draft.file);
  let source = "";
  try {
    source = await fs.readFile(targetPath, "utf-8");
  }
  catch (error) {
    if (error && error.code === "ENOENT") {
      return {
        ...buildMissingFilePrecheck(draft),
        skipped: true,
        applied: false,
      };
    }
    throw error;
  }
  const precheck = buildDraftPrecheck(source, draft);
  if (!precheck.ok) {
    return {
      ...precheck,
      skipped: true,
      applied: false,
    };
  }
  const next = operation === "append"
    ? `${source}${source.endsWith("\n") ? "" : "\n"}${snippetText}`
    : source.replace(matchText, replacement);
  await fs.writeFile(targetPath, next, "utf-8");
  return {
    file: draft.file,
    anchor: draft.anchor || null,
    anchorFound: true,
    anchorCount: 1,
    uniqueAnchor: true,
    snippetPresent: false,
    targetAlreadyPatched: false,
    ok: true,
    skipped: false,
    applied: true,
    reason: "applied",
  };
}

async function validateVisualBaselineSources(projectRoot, patchPlan) {
  if (String(patchPlan?.whitelistRuleId || "").trim() !== "reader-visual-baseline-refresh") {
    return [];
  }

  const reportPath = path.join(projectRoot, LATEST_E2E_REPORT_FILE);
  let latestReport;
  try {
    latestReport = JSON.parse(await fs.readFile(reportPath, "utf-8"));
  }
  catch (error) {
    if (error && error.code === "ENOENT") {
      return [{
        file: null,
        reason: "source-report-missing",
      }];
    }
    throw error;
  }

  const expectedEntries = collectDriftedVisualBaselineEntries(projectRoot, latestReport);
  const expectedKeys = new Set(expectedEntries.map((entry) => (
    `${entry.targetFile}::${entry.sourceFile}::${entry.expectedSourceSha256}`
  )));
  const expectedBySourceEvidence = new Map();
  expectedEntries.forEach((entry) => {
    const evidenceKey = `${entry.sourceFile}::${entry.expectedSourceSha256}`;
    if (!expectedBySourceEvidence.has(evidenceKey)) {
      expectedBySourceEvidence.set(evidenceKey, []);
    }
    expectedBySourceEvidence.get(evidenceKey).push(entry);
  });
  const drafts = Array.isArray(patchPlan?.patchDrafts) ? patchPlan.patchDrafts : [];
  const issues = [];
  const actualKeys = [];

  for (const draft of drafts) {
    const normalizedSourceFile = toProjectRelativePath(projectRoot, draft?.sourceFile);
    if (!normalizedSourceFile) {
      issues.push({
        file: draft?.file || null,
        reason: "source-file-outside-project",
      });
      continue;
    }

    const normalizedTargetFile = toProjectRelativePath(projectRoot, draft?.file) || String(draft?.file || "").trim();
    const sourceEvidenceKey = `${normalizedSourceFile}::${String(draft?.expectedSourceSha256 || "").trim()}`;
    const expectedKey = `${normalizedTargetFile}::${normalizedSourceFile}::${String(draft?.expectedSourceSha256 || "").trim()}`;
    actualKeys.push(expectedKey);
    if (!expectedKeys.has(expectedKey)) {
      if ((expectedBySourceEvidence.get(sourceEvidenceKey) || []).length > 0) {
        issues.push({
          file: draft?.file || null,
          reason: "visual-target-mismatch",
        });
        continue;
      }
      issues.push({
        file: draft?.file || null,
        reason: "source-not-in-latest-e2e",
      });
      continue;
    }

    try {
      const sourceBuffer = await fs.readFile(path.join(projectRoot, normalizedSourceFile));
      if (hashBuffer(sourceBuffer) !== String(draft?.expectedSourceSha256 || "").trim()) {
        issues.push({
          file: draft?.file || null,
          reason: "source-hash-mismatch",
        });
      }
    }
    catch (error) {
      if (error && error.code === "ENOENT") {
        issues.push({
          file: draft?.file || null,
          reason: "source-file-missing",
        });
        continue;
      }
      throw error;
    }
  }

  if (issues.length === 0) {
    const actualUniqueKeys = new Set(actualKeys);
    const expectedKeyList = Array.from(expectedKeys);
    const exactSetMatched = (
      actualKeys.length === expectedKeyList.length
      && actualUniqueKeys.size === expectedKeyList.length
      && expectedKeyList.every((key) => actualUniqueKeys.has(key))
    );
    if (!exactSetMatched) {
      issues.push({
        file: null,
        reason: "visual-draft-set-mismatch",
      });
    }
  }

  return issues;
}

export function derivePatchPlan(report) {
  if (!report || typeof report !== "object") {
    return {
      status: "missing-report",
      statusLabel: "缺少报告",
      mode: "none",
      reviewRequired: true,
      rationale: "缺少 E2E 报告，无法生成补丁计划。",
      whitelisted: false,
      candidateFiles: [],
      allowedTargets: [],
      proposedEdits: [],
      guardrails: [],
      nextAction: "先重新执行 `npm run agent:zotero:e2e`，获得最新真机失败报告。",
    };
  }

  if (report.passed === true) {
    return {
      status: "not-needed",
      statusLabel: "无需补丁",
      mode: "none",
      reviewRequired: false,
      rationale: "当前真机闭环已通过，无需生成补丁计划。",
      whitelisted: false,
      candidateFiles: [],
      allowedTargets: [],
      proposedEdits: [],
      guardrails: [],
      nextAction: "保持当前状态即可，如需继续演进请进入下一轮功能开发。",
    };
  }

  const diagnosis = report.primaryDiagnosis && typeof report.primaryDiagnosis === "object"
    ? report.primaryDiagnosis
    : null;
  if (!diagnosis?.fingerprint) {
    return {
      status: "no-diagnosis",
      statusLabel: "缺少主诊断",
      mode: "none",
      reviewRequired: true,
      rationale: "当前失败尚未形成结构化主诊断，暂不适合进入自动补丁阶段。",
      whitelisted: false,
      candidateFiles: [],
      allowedTargets: [],
      proposedEdits: [],
      guardrails: [],
      nextAction: "优先补充更精确的结构化诊断，再决定是否进入补丁流程。",
    };
  }

  const normalizedDiagnosis = {
    ...diagnosis,
    rawFingerprint: diagnosis.fingerprint,
    fingerprint: normalizeDiagnosisFingerprint(diagnosis.fingerprint),
  };

  const rule = findRuleByFingerprint(normalizedDiagnosis.fingerprint);
  if (!rule) {
    const unsupported = createUnsupportedDiagnosisDescriptor(normalizedDiagnosis.fingerprint);
    return {
      status: "no-whitelist-match",
      statusLabel: "未命中白名单",
      mode: "none",
      reviewRequired: true,
      rationale: `主诊断 ${normalizedDiagnosis.fingerprint} 还不在当前受限补丁白名单内。`,
      whitelisted: false,
      fingerprint: normalizedDiagnosis.fingerprint,
      feature: normalizedDiagnosis.feature || null,
      featureLabel: normalizedDiagnosis.featureLabel || normalizedDiagnosis.feature || null,
      unsupportedDiagnosisCategory: unsupported.category,
      unsupportedDiagnosisCategoryLabel: unsupported.label,
      unsupportedDiagnosisReason: unsupported.reason,
      candidateFiles: Array.isArray(normalizedDiagnosis.candidateFiles) ? normalizedDiagnosis.candidateFiles.slice(0, 6) : [],
      allowedTargets: [],
      proposedEdits: [],
      guardrails: [
        "当前只允许对白名单内的低风险注册遗漏问题生成补丁计划。",
      ],
      nextAction: "先由人工确认修复方向，或扩展白名单规则后再进入补丁流程。",
    };
  }

  const projectRoot = path.resolve(String(report?.projectRoot || process.cwd()));
  const ruleContext = buildPatchRuleContext(rule, report, normalizedDiagnosis);
  const resolvedDrafts = rule.id === "reader-visual-baseline-refresh"
    ? buildVisualBaselineCopyDrafts(collectDriftedVisualBaselineEntries(projectRoot, report))
    : resolveRuleDrafts(rule, {
      ...normalizedDiagnosis,
      ruleContext,
    });
  if (resolvedDrafts.length === 0) {
    return {
      status: "rule-match-no-drafts",
      statusLabel: "规则已命中但未生成草案",
      mode: "none",
      reviewRequired: true,
      whitelisted: true,
      whitelistRuleId: rule.id,
      category: rule.category,
      fingerprint: normalizedDiagnosis.fingerprint,
      issue: normalizedDiagnosis.issue || null,
      feature: rule.feature,
      featureLabel: rule.featureLabel,
      rationale: `${rule.description} 但当前诊断未能生成安全的单点补丁草案。`,
      ruleContext,
      candidateFiles: uniqueStrings([
        ...(Array.isArray(normalizedDiagnosis.candidateFiles) ? normalizedDiagnosis.candidateFiles : []),
        ...(Array.isArray(rule.allowedTargets) ? rule.allowedTargets : []),
      ]).slice(0, 8),
      allowedTargets: uniqueStrings(rule.allowedTargets),
      proposedEdits: uniqueStrings(rule.proposedEdits),
      guardrails: uniqueStrings(rule.guardrails),
      verificationContract: customizeVerificationContract(rule.id, rule.verificationContract, ruleContext),
      postApplyVerification: clonePostApplyVerification(rule.postApplyVerification),
      patchDrafts: [],
      nextAction: "当前需先人工确认具体漂移位置，再重新生成受限补丁草案。",
    };
  }

  return {
    status: "review-ready",
    statusLabel: "可进入受限补丁审阅",
    mode: rule.mode,
    reviewRequired: true,
    whitelisted: true,
    whitelistRuleId: rule.id,
    category: rule.category,
    fingerprint: normalizedDiagnosis.fingerprint,
    issue: normalizedDiagnosis.issue || null,
    feature: rule.feature,
    featureLabel: rule.featureLabel,
    rationale: rule.description,
    ruleContext,
    candidateFiles: uniqueStrings([
      ...(Array.isArray(normalizedDiagnosis.candidateFiles) ? normalizedDiagnosis.candidateFiles : []),
      ...(Array.isArray(rule.allowedTargets) ? rule.allowedTargets : []),
    ]).slice(0, 8),
    allowedTargets: uniqueStrings(rule.allowedTargets),
    proposedEdits: uniqueStrings(rule.proposedEdits),
    guardrails: uniqueStrings(rule.guardrails),
    verificationContract: customizeVerificationContract(rule.id, rule.verificationContract, ruleContext),
    postApplyVerification: clonePostApplyVerification(rule.postApplyVerification),
    patchDrafts: resolvedDrafts.map((draft) => projectPatchDraft(draft)),
    nextAction: `在 ${rule.allowedTargets.join("、")} 范围内生成人工可审阅 patch，随后重新执行 \`npm run agent:zotero:e2e\` 复验。`,
  };
}

function getLatestCycleChecks(report) {
  const cycles = Array.isArray(report?.cycles) ? report.cycles : [];
  const latestCycle = cycles[cycles.length - 1] || null;
  return latestCycle?.checks && typeof latestCycle.checks === "object"
    ? latestCycle.checks
    : null;
}

function getAllCycleChecks(report) {
  const cycles = Array.isArray(report?.cycles) ? report.cycles : [];
  return cycles.map((cycle, index) => ({
    cycleIndex: Number(cycle?.index || index + 1),
    checks: cycle?.checks && typeof cycle.checks === "object"
      ? cycle.checks
      : {},
  }));
}

function getReportVerificationFields(report) {
  const cycles = Array.isArray(report?.cycles) ? report.cycles : [];
  return {
    cyclePassedCount: cycles.filter((cycle) => cycle?.passed === true).length,
    cycleFailedCount: cycles.filter((cycle) => cycle?.passed === false).length,
    staticRuntimeMissingCount: cycles.reduce((sum, cycle) => (
      sum + Number(cycle?.checks?.staticRuntimeMissingCount || 0)
    ), 0),
    staticRuntimeDriftCount: cycles.reduce((sum, cycle) => (
      sum + Number(cycle?.checks?.staticRuntimeDriftCount || 0)
    ), 0),
    visualDriftCount: cycles.reduce((sum, cycle) => (
      sum + Number(cycle?.visuals?.analysis?.summary?.baseline?.driftCount || 0)
    ), 0),
    visualMissingCount: cycles.reduce((sum, cycle) => (
      sum + Number(cycle?.visuals?.analysis?.summary?.baseline?.missingCount || 0)
    ), 0),
    visualErrorCount: cycles.reduce((sum, cycle) => (
      sum + Number(cycle?.visuals?.analysis?.summary?.baseline?.errorCount || 0)
    ), 0),
    testFailedCount: cycles.reduce((sum, cycle) => sum + Number(cycle?.tests?.failed || 0), 0),
    scenarioFailedCount: cycles.reduce((sum, cycle) => sum + Number(cycle?.scenarios?.failed || 0), 0),
    serviceDegradedCycleCount: cycles.reduce((sum, cycle) => (
      sum + ((cycle?.checks?.serviceHealthOK === false || Number(cycle?.checks?.serviceUnhealthyCount || 0) > 0) ? 1 : 0)
    ), 0),
    errorLogCount: cycles.reduce((sum, cycle) => sum + Number(cycle?.logs?.errorCount || 0), 0),
    warnLogCount: cycles.reduce((sum, cycle) => sum + Number(cycle?.logs?.warnCount || 0), 0),
  };
}

function compareVerificationValue(operator, actual, expected) {
  switch (operator) {
    case "gte":
      return Number(actual || 0) >= Number(expected || 0);
    case "equals":
      return actual === expected;
    case "truthy":
      return Boolean(actual);
    default:
      return false;
  }
}

function evaluateVerificationTemplateChecks(template, latestReport) {
  const checks = Array.isArray(template?.checks) ? template.checks : [];
  const latestCycleChecks = getLatestCycleChecks(latestReport) || {};
  const allCycleChecks = getAllCycleChecks(latestReport);
  const reportFields = getReportVerificationFields(latestReport);

  return checks.map((check) => {
    const field = String(check?.field || "").trim();
    const kind = String(check?.kind || "latest-cycle-check").trim();
    let actual;
    let detail = check?.detail || null;
    let satisfied = false;

    if (field) {
      if (kind === "report-field") {
        actual = reportFields[field];
        satisfied = compareVerificationValue(check?.operator, actual, check?.expected);
      } else if (kind === "all-cycle-check") {
        const cycleResults = allCycleChecks.map((cycle) => {
          const cycleActual = cycle.checks[field];
          return {
            cycleIndex: cycle.cycleIndex,
            actual: cycleActual === undefined ? null : cycleActual,
            satisfied: compareVerificationValue(check?.operator, cycleActual, check?.expected),
          };
        });
        actual = cycleResults;
        satisfied = cycleResults.length > 0 && cycleResults.every((item) => item.satisfied === true);
        if (!detail) {
          const failedCycles = cycleResults
            .filter((item) => item.satisfied !== true)
            .map((item) => `Cycle ${item.cycleIndex}`);
          detail = failedCycles.length > 0
            ? `检查 ${field}，存在未满足轮次：${failedCycles.join("、")}。`
            : `检查 ${field}，所有轮次均满足 ${check?.operator || "unknown"} ${Object.prototype.hasOwnProperty.call(check || {}, "expected") ? String(check.expected) : "-"}.`;
        }
      } else {
        actual = latestCycleChecks[field];
        satisfied = compareVerificationValue(check?.operator, actual, check?.expected);
      }
    }

    const expectedText = Object.prototype.hasOwnProperty.call(check || {}, "expected")
      ? String(check.expected)
      : "-";
    const actualText = Array.isArray(actual)
      ? JSON.stringify(actual)
      : (actual === undefined ? "undefined" : String(actual));

    return {
      id: check?.id || null,
      label: check?.label || check?.id || "unknown",
      required: check?.required !== false,
      satisfied,
      detail: detail
        || `检查 ${field || "unknown"}，期望 ${check?.operator || "unknown"} ${expectedText}，实际 ${actualText}。`,
      expected: Object.prototype.hasOwnProperty.call(check || {}, "expected") ? check.expected : null,
      actual: actual === undefined ? null : actual,
      field: field || null,
      operator: check?.operator || null,
      kind: kind || null,
    };
  });
}

export function evaluatePatchVerificationContract({ patchPlan, patchApplication, latestReport, recovered }) {
  const appliedFiles = Array.isArray(patchApplication?.appliedFiles) ? patchApplication.appliedFiles : [];
  const latestFingerprint = String(latestReport?.primaryDiagnosis?.fingerprint || "").trim();

  if (patchApplication?.attempted && appliedFiles.length > 0) {
    const diagnosisSatisfied = Boolean(recovered)
      || !patchPlan?.fingerprint
      || !latestFingerprint
      || latestFingerprint !== patchPlan.fingerprint;
    const ruleChecks = evaluateVerificationTemplateChecks(patchPlan?.verificationContract, latestReport);
    const checks = [
      {
        id: "restart-e2e",
        label: "重启策略 E2E 复验",
        required: true,
        satisfied: true,
        detail: "补丁应用后已自动执行 restart 策略复验。",
      },
      {
        id: "primary-diagnosis",
        label: "主诊断复核",
        required: true,
        satisfied: diagnosisSatisfied,
        detail: diagnosisSatisfied
          ? "复验结果未继续保持原主诊断。"
          : `复验后主诊断仍为 ${latestFingerprint || patchPlan?.fingerprint || "原问题"}`,
      },
      ...ruleChecks,
    ];
    const failedRequiredCount = checks.filter((check) => check.required !== false && check.satisfied !== true).length;
    const failedOptionalCount = checks.filter((check) => check.required === false && check.satisfied !== true).length;
    const allRequiredSatisfied = failedRequiredCount === 0;

    return {
      status: allRequiredSatisfied ? "verification-passed" : "verification-failed",
      statusLabel: allRequiredSatisfied ? "补丁复验通过" : "补丁复验未通过",
      summary: patchPlan?.verificationContract?.summary || null,
      checks,
      failedRequiredCount,
      failedOptionalCount,
    };
  }

  if (patchApplication?.attempted) {
    return {
      status: patchApplication?.status || "patch-not-applied",
      statusLabel: patchApplication?.status === "precheck-failed" ? "补丁预检失败" : "补丁未应用",
      summary: patchPlan?.verificationContract?.summary || null,
      checks: [
        {
          id: "precheck",
          label: "补丁预检",
          required: true,
          satisfied: false,
          detail: "补丁未能进入有效写入阶段，请先处理锚点或上下文阻塞。",
        },
      ],
      failedRequiredCount: 1,
      failedOptionalCount: 0,
    };
  }

  if (patchPlan?.status === "review-ready") {
    return {
      status: "review-pending",
      statusLabel: "待人工审阅",
      summary: patchPlan?.verificationContract?.summary || null,
      checks: [
        {
          id: "manual-review",
          label: "人工审阅补丁草案",
          required: true,
          satisfied: false,
          detail: "当前仍处于 review-only 阶段，尚未执行自动写入。",
        },
      ],
      failedRequiredCount: 1,
      failedOptionalCount: 0,
    };
  }

  return {
    status: "not-applicable",
    statusLabel: "无补丁归档动作",
    summary: patchPlan?.verificationContract?.summary || null,
    checks: [],
    failedRequiredCount: 0,
    failedOptionalCount: 0,
  };
}

export async function applyPatchPlan(projectRoot, patchPlan) {
  if (!patchPlan || typeof patchPlan !== "object") {
    return {
      attempted: false,
      ok: false,
      status: "missing-plan",
      appliedFiles: [],
      results: [],
    };
  }
  if (patchPlan.status !== "review-ready" || !patchPlan.whitelisted) {
    return {
      attempted: false,
      ok: false,
      status: "not-applicable",
      appliedFiles: [],
      results: [],
    };
  }

  const drafts = Array.isArray(patchPlan.patchDrafts) ? patchPlan.patchDrafts : [];
  if (drafts.length === 0) {
    return {
      attempted: false,
      ok: false,
      status: "no-drafts",
      appliedFiles: [],
      results: [],
    };
  }

  const sandboxIssues = validatePatchPlanSandbox(patchPlan);
  if (sandboxIssues.length > 0) {
    return {
      attempted: true,
      ok: false,
      status: "precheck-failed",
      appliedFiles: [],
      results: sandboxIssues.map((item) => ({
        file: item.file,
        anchor: null,
        skipped: true,
        applied: false,
        reason: item.reason,
      })),
      precheck: sandboxIssues.map((item) => ({
        file: item.file,
        anchor: null,
        anchorFound: false,
        anchorCount: 0,
        uniqueAnchor: false,
        snippetPresent: false,
        snippetMatchMode: "none",
        targetAlreadyPatched: false,
        contextWindowChars: 0,
        beforeContextMatched: false,
        afterContextMatched: false,
        beforeContextText: null,
        afterContextText: null,
        ok: false,
        reason: item.reason,
      })),
    };
  }

  const sourceIssues = await validateVisualBaselineSources(projectRoot, patchPlan);
  if (sourceIssues.length > 0) {
    return {
      attempted: true,
      ok: false,
      status: "precheck-failed",
      appliedFiles: [],
      results: sourceIssues.map((item) => ({
        file: item.file,
        anchor: null,
        skipped: true,
        applied: false,
        reason: item.reason,
      })),
      precheck: sourceIssues.map((item) => ({
        file: item.file,
        anchor: null,
        anchorFound: false,
        anchorCount: 0,
        uniqueAnchor: false,
        snippetPresent: false,
        snippetMatchMode: "none",
        targetAlreadyPatched: false,
        contextWindowChars: 0,
        beforeContextMatched: false,
        afterContextMatched: false,
        beforeContextText: null,
        afterContextText: null,
        ok: false,
        reason: item.reason,
      })),
    };
  }

  const precheck = [];
  for (const draft of drafts) {
    precheck.push(await precheckDraft(projectRoot, draft));
  }
  const blockedByPrecheck = precheck.some((item) => !item.ok);
  if (blockedByPrecheck) {
    return {
      attempted: true,
      ok: false,
      status: "precheck-failed",
      appliedFiles: [],
      results: precheck.map((item) => ({
        ...item,
        skipped: true,
        applied: false,
      })),
      precheck,
    };
  }

  const results = [];
  for (const draft of drafts) {
    results.push(await applyDraftToFile(projectRoot, draft));
  }
  const appliedFiles = results.filter((item) => item.applied).map((item) => item.file);
  const blocked = results.some((item) => item.reason === "anchor-not-found");
  return {
    attempted: true,
    ok: !blocked,
    status: blocked ? "partial" : "applied",
    appliedFiles,
    results,
    precheck,
  };
}
