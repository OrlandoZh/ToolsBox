var SCENARIO_RUNTIME_STATE_KEY = "__CLEANROOM_ZOTERO_SCENARIO_RUNTIME__";

function createScenarioError(message, options = {}) {
  const error = new Error(String(message || "Scenario failed"));
  error.cleanroomScenarioErrorKind = String(options.kind || "").trim() || "scenario-execution-failed";
  error.cleanroomScenarioPhase = String(options.phase || "").trim() || "scenario";
  error.cleanroomScenarioStep = String(options.step || "").trim() || "run";
  if (options.scenarioName) {
    error.cleanroomScenarioName = String(options.scenarioName);
  }
  return error;
}

function createErrorPayload(error, fallback = {}) {
  return {
    message: error && error.message ? String(error.message) : String(error),
    stack: error && error.stack ? String(error.stack) : "",
    kind: String(
      error?.cleanroomScenarioErrorKind
      || fallback.kind
      || "scenario-execution-failed",
    ).trim(),
    phase: String(
      error?.cleanroomScenarioPhase
      || fallback.phase
      || "scenario",
    ).trim(),
    step: String(
      error?.cleanroomScenarioStep
      || fallback.step
      || "run",
    ).trim(),
    scenarioName: String(
      error?.cleanroomScenarioName
      || fallback.scenarioName
      || "",
    ).trim() || null,
  };
}

function createAssert() {
  return {
    equal(actual, expected, message) {
      if (actual !== expected) {
        throw createScenarioError(message || `Expected ${expected}, got ${actual}`, {
          kind: "scenario-assertion-failed",
          phase: "assert",
          step: "assert.equal",
        });
      }
    },
    ok(value, message) {
      if (!value) {
        throw createScenarioError(message || "Expected truthy value", {
          kind: "scenario-assertion-failed",
          phase: "assert",
          step: "assert.ok",
        });
      }
    },
    notOk(value, message) {
      if (value) {
        throw createScenarioError(message || "Expected falsy value", {
          kind: "scenario-assertion-failed",
          phase: "assert",
          step: "assert.notOk",
        });
      }
    },
    includes(haystack, needle, message) {
      const contains = typeof haystack === "string"
        ? haystack.includes(needle)
        : Array.isArray(haystack)
          ? haystack.includes(needle)
          : haystack && needle in haystack;
      if (!contains) {
        throw createScenarioError(
          message || `Expected ${JSON.stringify(haystack)} to include ${JSON.stringify(needle)}`,
          {
            kind: "scenario-assertion-failed",
            phase: "assert",
            step: "assert.includes",
          },
        );
      }
    },
    deepEqual(actual, expected, message) {
      const actualText = JSON.stringify(actual);
      const expectedText = JSON.stringify(expected);
      if (actualText !== expectedText) {
        throw createScenarioError(message || `Expected ${expectedText}, got ${actualText}`, {
          kind: "scenario-assertion-failed",
          phase: "assert",
          step: "assert.deepEqual",
        });
      }
    },
  };
}

function createScenarioRuntimeState() {
  return {
    addonConfig: null,
    scenarios: [],
    scenarioMap: new Map(),
    registeredScenarios: [],
    execution: {
      registeredScenarioNames: [],
      selectedScenarioNames: [],
      currentScenario: null,
      lastStartedScenario: null,
      lastCompletedScenario: null,
      completedCount: 0,
      failedCount: 0,
      lastErrorKind: null,
    },
  };
}

function getScenarioRuntimeState({ create = false } = {}) {
  if (!globalThis[SCENARIO_RUNTIME_STATE_KEY] && create) {
    globalThis[SCENARIO_RUNTIME_STATE_KEY] = createScenarioRuntimeState();
  }
  return globalThis[SCENARIO_RUNTIME_STATE_KEY] || null;
}

function snapshotScenarioExecution(execution) {
  const state = execution && typeof execution === "object" ? execution : {};
  return {
    registeredScenarioNames: Array.isArray(state.registeredScenarioNames)
      ? state.registeredScenarioNames.slice()
      : [],
    selectedScenarioNames: Array.isArray(state.selectedScenarioNames)
      ? state.selectedScenarioNames.slice()
      : [],
    currentScenario: typeof state.currentScenario === "string" ? state.currentScenario : null,
    lastStartedScenario: typeof state.lastStartedScenario === "string" ? state.lastStartedScenario : null,
    lastCompletedScenario: typeof state.lastCompletedScenario === "string" ? state.lastCompletedScenario : null,
    completedCount: Number(state.completedCount || 0),
    failedCount: Number(state.failedCount || 0),
    lastErrorKind: typeof state.lastErrorKind === "string" ? state.lastErrorKind : null,
  };
}

function getPathUtils(ChromeUtils) {
  if (typeof PathUtils !== "undefined") {
    return PathUtils;
  }
  try {
    return ChromeUtils.importESModule("resource://gre/modules/PathUtils.sys.mjs").PathUtils;
  }
  catch {
    return null;
  }
}

function getIOUtils(ChromeUtils) {
  if (typeof IOUtils !== "undefined") {
    return IOUtils;
  }
  try {
    return ChromeUtils.importESModule("resource://gre/modules/IOUtils.sys.mjs").IOUtils;
  }
  catch {
    return null;
  }
}

function buildMinimalPDF(text) {
  const safeText = String(text || "Cleanroom Agent Validation")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
  const stream = `BT\n/F1 18 Tf\n36 96 Td\n(${safeText}) Tj\nET`;
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 320 160] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n",
    `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const objectText of objects) {
    offsets.push(pdf.length);
    pdf += objectText;
  }

  const xrefOffset = pdf.length;
  pdf += `xref
0 ${objects.length + 1}
0000000000 65535 f
`;

  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n
`;
  }

  pdf += `trailer
<< /Size ${objects.length + 1} /Root 1 0 R >>
startxref
${xrefOffset}
%%EOF
`;

  return new TextEncoder().encode(pdf);
}

function normalizeCuratedPDFMatchValue(value) {
  return String(value || "")
    .trim()
    .normalize("NFKC")
    .replaceAll("\\", "/")
    .toLowerCase();
}

function flattenCuratedPDFCorpusEntries(manifest) {
  const groups = Array.isArray(manifest?.groups) ? manifest.groups : [];
  const entries = [];

  groups.forEach((group, groupIndex) => {
    const groupID = typeof group?.id === "string" && group.id.trim()
      ? group.id.trim()
      : `group-${groupIndex + 1}`;
    const groupLabel = typeof group?.label === "string" && group.label.trim()
      ? group.label.trim()
      : groupID;
    const groupReason = typeof group?.reason === "string" && group.reason.trim()
      ? group.reason.trim()
      : null;
    const groupEntries = Array.isArray(group?.entries) ? group.entries : [];

    groupEntries.forEach((entry, entryIndex) => {
      if (!entry || typeof entry !== "object") {
        return;
      }
      entries.push({
        groupID,
        groupLabel,
        groupReason,
        groupIndex,
        entryIndex,
        entryID: typeof entry.id === "string" && entry.id.trim()
          ? entry.id.trim()
          : null,
        fileName: typeof entry.fileName === "string" && entry.fileName.trim()
          ? entry.fileName.trim()
          : null,
        relativePath: typeof entry.relativePath === "string" && entry.relativePath.trim()
          ? entry.relativePath.trim()
          : null,
        absolutePath: typeof entry.absolutePath === "string" && entry.absolutePath.trim()
          ? entry.absolutePath.trim()
          : null,
        familyKey: typeof entry.familyKey === "string" && entry.familyKey.trim()
          ? entry.familyKey.trim()
          : null,
        recommendedLane: typeof entry.recommendedLane === "string" && entry.recommendedLane.trim()
          ? entry.recommendedLane.trim()
          : null,
        variantKind: typeof entry.variantKind === "string" && entry.variantKind.trim()
          ? entry.variantKind.trim()
          : null,
        entry,
      });
    });
  });

  return entries;
}

function selectCuratedPDFCorpusEntry(manifest, options = {}) {
  const entries = flattenCuratedPDFCorpusEntries(manifest);
  const filters = {
    entryID: normalizeCuratedPDFMatchValue(options.entryID || options.id),
    groupID: normalizeCuratedPDFMatchValue(options.groupID || options.groupId),
    fileName: normalizeCuratedPDFMatchValue(options.fileName),
    relativePath: normalizeCuratedPDFMatchValue(options.relativePath),
    absolutePath: normalizeCuratedPDFMatchValue(options.absolutePath || options.filePath),
    familyKey: normalizeCuratedPDFMatchValue(options.familyKey),
    recommendedLane: normalizeCuratedPDFMatchValue(options.recommendedLane || options.lane),
    variantKind: normalizeCuratedPDFMatchValue(options.variantKind),
  };
  let selected = entries.slice();

  if (filters.entryID) {
    selected = selected.filter((record) => normalizeCuratedPDFMatchValue(record.entryID) === filters.entryID);
  }
  if (filters.groupID) {
    selected = selected.filter((record) => normalizeCuratedPDFMatchValue(record.groupID) === filters.groupID);
  }
  if (filters.fileName) {
    selected = selected.filter((record) => normalizeCuratedPDFMatchValue(record.fileName) === filters.fileName);
  }
  if (filters.relativePath) {
    selected = selected.filter((record) => normalizeCuratedPDFMatchValue(record.relativePath) === filters.relativePath);
  }
  if (filters.absolutePath) {
    selected = selected.filter((record) => normalizeCuratedPDFMatchValue(record.absolutePath) === filters.absolutePath);
  }
  if (filters.familyKey) {
    selected = selected.filter((record) => normalizeCuratedPDFMatchValue(record.familyKey) === filters.familyKey);
  }
  if (filters.recommendedLane) {
    selected = selected.filter((record) => normalizeCuratedPDFMatchValue(record.recommendedLane) === filters.recommendedLane);
  }
  if (filters.variantKind) {
    selected = selected.filter((record) => normalizeCuratedPDFMatchValue(record.variantKind) === filters.variantKind);
  }

  const rawSelectionIndex = Number(options.selectionIndex ?? 0);
  const selectionIndex = Number.isFinite(rawSelectionIndex) && rawSelectionIndex >= 0
    ? Math.floor(rawSelectionIndex)
    : 0;

  return {
    entries,
    selected,
    selectionIndex,
    entry: selected[selectionIndex] || null,
  };
}

function resetScenarioReaderEnvironment(plugin) {
  if (!plugin?.api?.reader) {
    return;
  }

  try {
    if (typeof plugin.api.reader.unregisterAllEventListeners === "function") {
      plugin.api.reader.unregisterAllEventListeners();
    }
  }
  catch {}

  const readers = typeof plugin.api.reader.getAllReaders === "function"
    ? plugin.api.reader.getAllReaders()
    : [];
  if (!Array.isArray(readers)) {
    return;
  }

  readers.forEach((reader) => {
    try {
      if (typeof reader?.close === "function") {
        reader.close();
      }
    }
    catch {}
  });
}

function createScenarioHelpers(baseContext) {
  const { Zotero, Services, ChromeUtils, plugin, addonConfig } = baseContext;
  const cleanupTasks = [];
  const PathUtilsAPI = getPathUtils(ChromeUtils);
  const IOUtilsAPI = getIOUtils(ChromeUtils);

  function addCleanup(task) {
    if (typeof task === "function") {
      cleanupTasks.push(task);
    }
  }

  function cloneValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function createCuratedCorpusError(message, options = {}) {
    const error = createScenarioError(message, {
      kind: options.kind || "scenario-fixture-unavailable",
      phase: "fixture",
      step: options.step || "curated-pdf-corpus",
    });
    error.cleanroomScenarioFixtureReason = String(options.reason || "").trim() || null;
    return error;
  }

  function resolveCuratedPDFManifestPath(options = {}) {
    const explicitManifestPath = String(options.manifestPath || "").trim();
    if (explicitManifestPath) {
      return explicitManifestPath;
    }

    const configManifestPath = String(
      addonConfig?.cleanroomPdfTestCorpus?.defaultManifestPath
      || "",
    ).trim();
    if (configManifestPath) {
      return configManifestPath;
    }

    const projectRootPath = String(addonConfig?.cleanroomProjectRootPath || "").trim();
    if (projectRootPath) {
      if (PathUtilsAPI && typeof PathUtilsAPI.join === "function") {
        return PathUtilsAPI.join(projectRootPath, "dist", "pdf-test-corpus-curated.balanced.json");
      }
      return `${projectRootPath}/dist/pdf-test-corpus-curated.balanced.json`;
    }

    return null;
  }

  async function fileExists(filePath) {
    const normalizedPath = String(filePath || "").trim();
    if (!normalizedPath) {
      return false;
    }
    if (IOUtilsAPI && typeof IOUtilsAPI.exists === "function") {
      return await IOUtilsAPI.exists(normalizedPath);
    }
    try {
      if (Zotero?.File && typeof Zotero.File.getContentsAsync === "function") {
        await Zotero.File.getContentsAsync(normalizedPath);
        return true;
      }
    }
    catch {
      return false;
    }
    return false;
  }

  async function readUTF8File(filePath) {
    const normalizedPath = String(filePath || "").trim();
    if (!normalizedPath) {
      throw createCuratedCorpusError("Curated PDF corpus manifest path is empty", {
        reason: "manifest-path-unresolved",
        step: "resolve-curated-pdf-manifest",
      });
    }
    if (IOUtilsAPI && typeof IOUtilsAPI.readUTF8 === "function") {
      return await IOUtilsAPI.readUTF8(normalizedPath);
    }
    if (Zotero?.File && typeof Zotero.File.getContentsAsync === "function") {
      return await Zotero.File.getContentsAsync(normalizedPath);
    }
    throw createCuratedCorpusError("No UTF-8 file reader is available in the current Zotero runtime", {
      kind: "scenario-fixture-invalid",
      reason: "file-reader-unavailable",
      step: "read-curated-pdf-manifest",
    });
  }

  function buildCuratedPDFCorpusStatus(payload) {
    const groups = Array.isArray(payload?.manifest?.groups) ? payload.manifest.groups : [];
    const entries = Array.isArray(payload?.entries) ? payload.entries : [];
    const laneCounts = {};
    entries.forEach((record) => {
      const lane = typeof record?.recommendedLane === "string" && record.recommendedLane.trim()
        ? record.recommendedLane.trim()
        : "unknown";
      laneCounts[lane] = Number(laneCounts[lane] || 0) + 1;
    });
    return {
      available: true,
      manifestPath: payload.manifestPath,
      sourceRoot: typeof payload?.manifest?.sourceRoot === "string" && payload.manifest.sourceRoot.trim()
        ? payload.manifest.sourceRoot.trim()
        : null,
      groupCount: groups.length,
      entryCount: entries.length,
      groupIDs: groups
        .map((group, index) => {
          const groupID = typeof group?.id === "string" && group.id.trim()
            ? group.id.trim()
            : `group-${index + 1}`;
          return groupID;
        }),
      laneCounts,
    };
  }

  function resolveCuratedPDFEntryAbsolutePath(manifest, record) {
    const explicitPath = String(record?.absolutePath || "").trim();
    if (explicitPath) {
      return explicitPath;
    }
    const relativePath = String(record?.relativePath || "").trim();
    const sourceRoot = String(manifest?.sourceRoot || "").trim();
    if (!relativePath || !sourceRoot) {
      return null;
    }

    if (PathUtilsAPI && typeof PathUtilsAPI.join === "function") {
      const segments = relativePath.split("/").filter(Boolean);
      return PathUtilsAPI.join(sourceRoot, ...segments);
    }

    return `${sourceRoot}/${relativePath}`;
  }

  async function loadCuratedPDFCorpus(options = {}) {
    const manifestPath = resolveCuratedPDFManifestPath(options);
    if (!manifestPath) {
      throw createCuratedCorpusError("Unable to resolve curated PDF corpus manifest path", {
        reason: "manifest-path-unresolved",
        step: "resolve-curated-pdf-manifest",
      });
    }

    if (!(await fileExists(manifestPath))) {
      throw createCuratedCorpusError(`Curated PDF corpus manifest not found: ${manifestPath}`, {
        reason: "missing-manifest",
        step: "resolve-curated-pdf-manifest",
      });
    }

    let text = "";
    try {
      text = await readUTF8File(manifestPath);
    }
    catch (error) {
      throw createCuratedCorpusError(
        `Unable to read curated PDF corpus manifest: ${manifestPath}; ${error?.message || error}`,
        {
          reason: "manifest-read-failed",
          step: "read-curated-pdf-manifest",
        },
      );
    }

    let manifest = null;
    try {
      manifest = JSON.parse(text);
    }
    catch (error) {
      throw createCuratedCorpusError(
        `Curated PDF corpus manifest is not valid JSON: ${manifestPath}; ${error?.message || error}`,
        {
          kind: "scenario-fixture-invalid",
          reason: "manifest-parse-failed",
          step: "parse-curated-pdf-manifest",
        },
      );
    }

    if (!manifest || typeof manifest !== "object" || !Array.isArray(manifest.groups)) {
      throw createCuratedCorpusError(
        `Curated PDF corpus manifest is missing a valid groups[] array: ${manifestPath}`,
        {
          kind: "scenario-fixture-invalid",
          reason: "manifest-invalid",
          step: "validate-curated-pdf-manifest",
        },
      );
    }

    const entries = flattenCuratedPDFCorpusEntries(manifest);
    if (entries.length === 0) {
      throw createCuratedCorpusError(
        `Curated PDF corpus manifest does not contain any entries: ${manifestPath}`,
        {
          kind: "scenario-fixture-invalid",
          reason: "manifest-empty",
          step: "validate-curated-pdf-manifest",
        },
      );
    }

    return {
      manifestPath,
      manifest,
      entries,
    };
  }

  function buildCuratedPDFParentItemOptions(entry, options = {}) {
    const createParentOptions = options && typeof options === "object" ? options : {};
    const resolvedMetadata = entry?.resolvedMetadata && typeof entry.resolvedMetadata === "object"
      ? entry.resolvedMetadata
      : {};
    const title = String(
      createParentOptions.title
      || resolvedMetadata.title
      || entry?.fileName
      || "Curated PDF Corpus Entry",
    ).trim();
    const fields = {
      title,
      ...((createParentOptions.fields && typeof createParentOptions.fields === "object")
        ? cloneValue(createParentOptions.fields)
        : {}),
    };

    if (!fields.title) {
      fields.title = title;
    }

    if (!fields.publicationTitle && typeof resolvedMetadata.journal === "string" && resolvedMetadata.journal.trim()) {
      fields.publicationTitle = resolvedMetadata.journal.trim();
    }
    if (!fields.DOI && typeof resolvedMetadata.doi === "string" && resolvedMetadata.doi.trim()) {
      fields.DOI = resolvedMetadata.doi.trim();
    }

    const creators = Array.isArray(createParentOptions.creators)
      ? cloneValue(createParentOptions.creators)
      : [];
    if (creators.length === 0 && typeof resolvedMetadata.author === "string" && resolvedMetadata.author.trim()) {
      creators.push({
        creatorType: "author",
        name: resolvedMetadata.author.trim(),
      });
    }

    return {
      itemType: String(createParentOptions.itemType || "journalArticle").trim() || "journalArticle",
      fields,
      creators,
      tags: Array.isArray(createParentOptions.tags) ? cloneValue(createParentOptions.tags) : [],
      collections: Array.isArray(createParentOptions.collections) ? cloneValue(createParentOptions.collections) : [],
      libraryID: Number.isFinite(createParentOptions.libraryID) ? createParentOptions.libraryID : undefined,
    };
  }

  function normalizeSurfaceEvidenceTargets(value) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => cloneValue(entry));
  }

  function pickDomContractStatusLabel(status) {
    switch (String(status || "").trim()) {
      case "passed":
        return "通过";
      case "failed":
        return "异常";
      case "missing":
        return "缺失";
      default:
        return "未知";
    }
  }

  function createDomContractCheck(id, ok, options = {}) {
    const normalizedID = String(id || "").trim() || "check";
    return {
      id: normalizedID,
      label: String(options.label || normalizedID).trim() || normalizedID,
      ok: Boolean(ok),
      actual: cloneValue(options.actual),
      expected: cloneValue(options.expected),
      note: typeof options.note === "string" && options.note.trim()
        ? options.note.trim()
        : null,
    };
  }

  function normalizeDomContractChecks(value) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => createDomContractCheck(
        entry.id || entry.label || "check",
        entry.ok === true,
        {
          label: entry.label,
          actual: entry.actual,
          expected: entry.expected,
          note: entry.note,
        },
      ));
  }

  function toDomContractResult(result) {
    const normalized = result && typeof result === "object"
      ? cloneValue(result)
      : {};
    const routeId = typeof normalized.routeId === "string" && normalized.routeId.trim()
      ? normalized.routeId.trim()
      : null;
    const adapter = typeof normalized.adapter === "string" && normalized.adapter.trim()
      ? normalized.adapter.trim()
      : routeId;
    const checks = normalizeDomContractChecks(normalized.checks);
    const failedChecks = checks
      .filter((entry) => entry.ok !== true)
      .map((entry) => cloneValue(entry));
    const status = checks.length === 0
      ? "missing"
      : (failedChecks.length > 0 ? "failed" : "passed");

    let summary = typeof normalized.summary === "string" && normalized.summary.trim()
      ? normalized.summary.trim()
      : null;
    if (!summary) {
      if (status === "missing") {
        summary = "当前场景未返回 DOM contract 检查。";
      } else if (status === "failed") {
        summary = `存在 ${failedChecks.length}/${checks.length} 项 DOM contract 异常。`;
      } else {
        summary = `DOM contract ${checks.length}/${checks.length} 项通过。`;
      }
    }

    return {
      routeId,
      adapter,
      status,
      statusLabel: pickDomContractStatusLabel(status),
      checkCount: checks.length,
      failedCheckCount: failedChecks.length,
      failedChecks,
      summary,
      checks,
    };
  }

  function toSurfaceSmokeResult(result) {
    const normalized = result && typeof result === "object"
      ? cloneValue(result)
      : {};
    return {
      ok: Boolean(normalized?.ok),
      actionId: typeof normalized?.actionId === "string" ? normalized.actionId : null,
      readiness: normalized?.readiness && typeof normalized.readiness === "object"
        ? normalized.readiness
        : {
          ok: false,
          total: 0,
          passed: 0,
          failed: 0,
          checks: [],
        },
      observedState: normalized?.observedState && typeof normalized.observedState === "object"
        ? normalized.observedState
        : {},
      surfaceEvidenceTargets: normalizeSurfaceEvidenceTargets(
        normalized?.surfaceTarget ? [normalized.surfaceTarget] : [],
      ),
      failureKind: typeof normalized?.failureKind === "string"
        ? normalized.failureKind
        : null,
    };
  }

  async function cleanup() {
    const errors = [];
    while (cleanupTasks.length > 0) {
      const task = cleanupTasks.pop();
      try {
        await task();
      }
      catch (error) {
        errors.push(error);
        try {
          if (typeof Zotero?.logError === "function") {
            Zotero.logError(error);
          }
        }
        catch {}
      }
    }

    if (errors.length > 0) {
      throw createScenarioError(
        `Scenario cleanup failed: ${errors.map((error) => error?.message || String(error)).join("; ")}`,
        {
          kind: "scenario-cleanup-failed",
          phase: "cleanup",
          step: "cleanup",
        },
      );
    }
  }

  function getMainWindow() {
    const window = typeof Zotero.getMainWindow === "function" ? Zotero.getMainWindow() : null;
    if (!window) {
      throw new Error("Unable to resolve Zotero main window");
    }
    return window;
  }

  function getZoteroPane() {
    const window = getMainWindow();
    if (!window.ZoteroPane) {
      throw new Error("Unable to resolve window.ZoteroPane");
    }
    return window.ZoteroPane;
  }

  function getSelectedItemIDs() {
    const pane = getZoteroPane();

    if (typeof pane.getSelectedItems === "function") {
      const ids = pane.getSelectedItems(true);
      if (Array.isArray(ids)) {
        return ids.filter((value) => typeof value === "number");
      }
      const items = pane.getSelectedItems();
      if (Array.isArray(items)) {
        return items
          .map((item) => item?.id)
          .filter((value) => typeof value === "number");
      }
    }

    const itemsView = pane.itemsView;
    if (itemsView && typeof itemsView.getSelectedItems === "function") {
      const ids = itemsView.getSelectedItems(true);
      if (Array.isArray(ids)) {
        return ids.filter((value) => typeof value === "number");
      }
    }

    return [];
  }

  async function wait(ms) {
    return await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitFor(condition, options = {}) {
    const timeoutMs = options.timeoutMs ?? 5000;
    const intervalMs = options.intervalMs ?? 50;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const result = await condition();
      if (result) {
        return result;
      }
      await wait(intervalMs);
    }

    throw createScenarioError(options.message || "Timed out waiting for condition", {
      kind: "scenario-helper-timeout",
      phase: options.phase || "helper",
      step: options.step || "waitFor",
    });
  }

  async function createItem(options = {}) {
    const item = new Zotero.Item(options.itemType || "book");
    const fields = {
      title: options.title || `Agent Scenario ${Date.now()}`,
      ...((options.fields && typeof options.fields === "object") ? options.fields : {}),
    };

    if (typeof options.libraryID === "number") {
      item.libraryID = options.libraryID;
    }

    if (typeof options.parentID === "number") {
      item.parentID = options.parentID;
    }

    for (const [field, value] of Object.entries(fields)) {
      if (value !== undefined && value !== null) {
        item.setField(field, String(value));
      }
    }

    if (Array.isArray(options.creators) && typeof item.setCreators === "function") {
      item.setCreators(options.creators);
    }

    if (Array.isArray(options.collections) && typeof item.setCollections === "function") {
      item.setCollections(options.collections);
    }

    if (Array.isArray(options.tags) && typeof item.addTag === "function") {
      for (const tag of options.tags) {
        item.addTag(String(tag));
      }
    }

    await item.saveTx();

    addCleanup(async () => {
      const currentItem = Zotero.Items.get(item.id);
      if (currentItem) {
        await currentItem.eraseTx();
      }
    });

    return item;
  }

  async function createCollection(options = {}) {
    const collection = new Zotero.Collection();
    collection.name = String(options.name || `Agent Scenario Collection ${Date.now()}`);
    collection.libraryID = typeof options.libraryID === "number"
      ? options.libraryID
      : typeof Zotero?.Libraries?.userLibraryID === "number"
        ? Zotero.Libraries.userLibraryID
        : null;
    if (typeof options.parentID === "number") {
      collection.parentID = options.parentID;
    }

    await collection.saveTx();

    addCleanup(async () => {
      const currentCollection = Zotero.Collections.get(collection.id);
      if (currentCollection) {
        await currentCollection.eraseTx();
      }
    });

    return collection;
  }

  async function selectItem(itemID, options = {}) {
    const pane = getZoteroPane();
    const item = Zotero?.Items && typeof Zotero.Items.get === "function"
      ? Zotero.Items.get(itemID)
      : null;
    const libraryID = typeof item?.libraryID === "number"
      ? item.libraryID
      : typeof Zotero?.Libraries?.userLibraryID === "number"
        ? Zotero.Libraries.userLibraryID
        : null;
    let libraryRootSelected = false;
    let itemsViewLoaded = false;

    await waitFor(
      () => Boolean(pane.collectionsView && pane.itemsView),
      {
        timeoutMs: options.timeoutMs ?? 5000,
        intervalMs: options.intervalMs ?? 100,
        message: "Timed out waiting for ZoteroPane collections/items views to load",
      },
    );

    if (pane.collectionsView && typeof pane.collectionsView.selectLibrary === "function") {
      try {
        await pane.collectionsView.selectLibrary(libraryID);
        libraryRootSelected = true;
      }
      catch {}
    }

    if (pane.itemsView && typeof pane.itemsView.waitForLoad === "function") {
      await pane.itemsView.waitForLoad();
      itemsViewLoaded = true;
    }

    if (typeof pane.selectItem === "function") {
      await pane.selectItem(itemID);
    }
    else if (pane.itemsView && typeof pane.itemsView.selectItem === "function") {
      await pane.itemsView.selectItem(itemID);
    }
    else {
      throw new Error("Neither ZoteroPane.selectItem() nor itemsView.selectItem() is available");
    }

    await waitFor(
      () => {
        const selectedIDs = getSelectedItemIDs();
        return selectedIDs.length === 1 && selectedIDs[0] === itemID;
      },
      {
        timeoutMs: options.timeoutMs ?? 5000,
        intervalMs: options.intervalMs ?? 100,
        message: `Timed out waiting for item #${itemID} to become selected`,
      },
    );

    const selectedIDs = getSelectedItemIDs();

    return {
      itemID,
      libraryID,
      libraryRootSelected,
      itemsViewLoaded,
      selectionSingleItem: selectedIDs.length === 1 && selectedIDs[0] === itemID,
      selectedIDs,
      selectedCount: selectedIDs.length,
    };
  }

  async function selectCollection(collectionID, options = {}) {
    const pane = getZoteroPane();
    const collection = Zotero?.Collections && typeof Zotero.Collections.get === "function"
      ? Zotero.Collections.get(collectionID)
      : null;
    const libraryID = typeof collection?.libraryID === "number"
      ? collection.libraryID
      : typeof Zotero?.Libraries?.userLibraryID === "number"
        ? Zotero.Libraries.userLibraryID
        : null;

    await waitFor(
      () => Boolean(pane.collectionsView && pane.itemsView),
      {
        timeoutMs: options.timeoutMs ?? 5000,
        intervalMs: options.intervalMs ?? 100,
        message: "Timed out waiting for ZoteroPane collections/items views to load",
      },
    );

    if (pane.collectionsView && typeof pane.collectionsView.selectCollection === "function") {
      await pane.collectionsView.selectCollection(collectionID);
    }
    else if (pane.collectionsView && typeof pane.collectionsView.selectByID === "function") {
      await pane.collectionsView.selectByID(`C${collectionID}`);
    }
    else {
      throw new Error("Neither collectionsView.selectCollection() nor collectionsView.selectByID() is available");
    }

    if (pane.itemsView && typeof pane.itemsView.waitForLoad === "function") {
      await pane.itemsView.waitForLoad();
    }

    await waitFor(
      () => {
        if (typeof pane.collectionsView?.getSelectedCollection === "function") {
          const selectedCollection = pane.collectionsView.getSelectedCollection();
          return selectedCollection?.id === collectionID ? selectedCollection : null;
        }
        return true;
      },
      {
        timeoutMs: options.timeoutMs ?? 5000,
        intervalMs: options.intervalMs ?? 100,
        message: `Timed out waiting for collection #${collectionID} to become selected`,
      },
    );

    const collectionTreeRow = typeof pane.getCollectionTreeRow === "function"
      ? pane.getCollectionTreeRow()
      : pane.collectionsView
        && typeof pane.collectionsView.getRow === "function"
        && typeof pane.collectionsView.selection?.focused === "number"
        ? pane.collectionsView.getRow(pane.collectionsView.selection.focused)
        : null;
    const collectionTreeRowID = collectionTreeRow && typeof collectionTreeRow === "object"
      ? collectionTreeRow.id ?? collectionTreeRow.ref ?? collectionID
      : collectionID;
    const collectionTreeRowType = typeof collectionTreeRow?.type === "string"
      ? collectionTreeRow.type
      : typeof collectionTreeRow?.isCollection === "function" && collectionTreeRow.isCollection()
        ? "collection"
        : typeof collectionTreeRow?.isSearch === "function" && collectionTreeRow.isSearch()
          ? "search"
          : "collection";

    return {
      collectionID,
      libraryID,
      collectionTreeRowID,
      collectionTreeRowType,
    };
  }

  async function writeTempFile({ filename, blob, contents = "" }) {
    const tempDir = Services.dirsvc.get("TmpD", Components.interfaces.nsIFile).path;
    const filePath = PathUtilsAPI
      ? PathUtilsAPI.join(tempDir, filename)
      : `${tempDir}/${filename}`;

    if (blob !== undefined) {
      await Zotero.File.putContentsAsync(filePath, blob);
    }
    else {
      await Zotero.File.putContentsAsync(filePath, contents);
    }

    addCleanup(async () => {
      if (IOUtilsAPI) {
        await IOUtilsAPI.remove(filePath, { ignoreAbsent: true });
      }
    });

    return filePath;
  }

  async function createPDF(options = {}) {
    const filename = options.filename || `cleanroom-agent-${Date.now()}.pdf`;
    const text = options.text || "Cleanroom Agent Reader Validation";
    const pdfBytes = buildMinimalPDF(text);
    const filePath = await writeTempFile({
      filename,
      blob: new Blob([pdfBytes], { type: "application/pdf" }),
    });

    const attachment = await Zotero.Attachments.importFromFile({
      file: filePath,
      parentItemID: options.parentItemID,
      title: options.title || text,
      contentType: "application/pdf",
    });

    addCleanup(async () => {
      const currentItem = Zotero.Items.get(attachment.id);
      if (currentItem) {
        await currentItem.eraseTx();
      }
    });

    return attachment;
  }

  async function getCuratedPDFCorpusStatus(options = {}) {
    try {
      const payload = await loadCuratedPDFCorpus(options);
      return buildCuratedPDFCorpusStatus(payload);
    }
    catch (error) {
      return {
        available: false,
        manifestPath: resolveCuratedPDFManifestPath(options),
        errorKind: String(error?.cleanroomScenarioFixtureReason || error?.cleanroomScenarioErrorKind || "unknown"),
        errorMessage: String(error?.message || error),
      };
    }
  }

  async function importCuratedPDF(options = {}) {
    const corpus = await loadCuratedPDFCorpus(options);
    const hasExplicitSelection = Boolean(
      options.entryID
      || options.id
      || options.groupID
      || options.groupId
      || options.fileName
      || options.relativePath
      || options.absolutePath
      || options.filePath
      || options.familyKey
      || options.recommendedLane
      || options.lane
      || options.variantKind,
    );
    const selection = selectCuratedPDFCorpusEntry(corpus.manifest, {
      ...options,
      groupID: hasExplicitSelection ? (options.groupID || options.groupId) : "core-text-smoke",
    });
    const record = selection.entry;
    if (!record) {
      throw createCuratedCorpusError("No curated PDF corpus entry matched the current selection", {
        kind: "scenario-fixture-invalid",
        reason: "entry-not-found",
        step: "select-curated-pdf-entry",
      });
    }

    const sourceFilePath = resolveCuratedPDFEntryAbsolutePath(corpus.manifest, record);
    if (!sourceFilePath) {
      throw createCuratedCorpusError(
        `Curated PDF corpus entry is missing a resolvable file path: ${record.entryID || record.fileName || "unknown-entry"}`,
        {
          kind: "scenario-fixture-invalid",
          reason: "entry-path-missing",
          step: "resolve-curated-pdf-entry-path",
        },
      );
    }

    if (!(await fileExists(sourceFilePath))) {
      throw createCuratedCorpusError(`Curated PDF source file is missing: ${sourceFilePath}`, {
        reason: "source-file-missing",
        step: "resolve-curated-pdf-entry-path",
      });
    }

    let parentItem = null;
    if (typeof options.parentItemID !== "number" && options.createParentItem) {
      parentItem = await createItem(buildCuratedPDFParentItemOptions(record.entry, (
        options.createParentItem && typeof options.createParentItem === "object"
          ? options.createParentItem
          : {}
      )));
    }

    const attachmentTitle = String(
      options.title
      || record.entry?.resolvedMetadata?.title
      || record.fileName
      || "Curated PDF Corpus Attachment",
    ).trim() || "Curated PDF Corpus Attachment";
    const attachment = await Zotero.Attachments.importFromFile({
      file: sourceFilePath,
      parentItemID: typeof options.parentItemID === "number"
        ? options.parentItemID
        : parentItem?.id,
      title: attachmentTitle,
      contentType: "application/pdf",
    });

    addCleanup(async () => {
      const currentItem = Zotero.Items.get(attachment.id);
      if (currentItem) {
        await currentItem.eraseTx();
      }
    });

    return {
      manifestPath: corpus.manifestPath,
      manifestStatus: buildCuratedPDFCorpusStatus(corpus),
      group: {
        id: record.groupID,
        label: record.groupLabel,
        reason: record.groupReason,
      },
      entry: cloneValue(record.entry),
      selectionIndex: selection.selectionIndex,
      sourceFilePath,
      attachment,
      parentItem,
    };
  }

  async function openReader(itemID, options = {}) {
    const reader = await plugin.api.reader.openReader({
      itemID,
      openInBackground: false,
      ...options,
    });

    if (!reader) {
      throw new Error(`Unable to open reader for item #${itemID}`);
    }

    if (typeof plugin.api.reader.waitForReaderReady === "function") {
      await plugin.api.reader.waitForReaderReady(reader, {
        timeoutMs: options.timeoutMs ?? 8000,
        intervalMs: 50,
      });
    }

    const { frameWindow } = await getReaderFrameWindow(reader, {
      timeoutMs: options.timeoutMs ?? 8000,
      intervalMs: 50,
    });

    await waitFor(
      () => frameWindow?.document?.readyState === "complete"
        ? true
        : null,
      {
        timeoutMs: options.timeoutMs ?? 8000,
        intervalMs: 50,
        message: `Timed out waiting for reader document readiness for item #${itemID}`,
      },
    );

    await new Promise((resolve) => {
      const raf = typeof frameWindow?.requestAnimationFrame === "function"
        ? frameWindow.requestAnimationFrame.bind(frameWindow)
        : (callback) => setTimeout(callback, 0);
      raf(() => raf(resolve));
    });

    await waitFor(
      () => plugin.api.reader.getReaderSummary(itemID),
      {
        timeoutMs: options.timeoutMs ?? 8000,
        intervalMs: 100,
        message: `Timed out waiting for reader summary for item #${itemID}`,
      },
    );

    addCleanup(() => {
      plugin.api.reader.closeByItemID(itemID);
    });

    return reader;
  }

  function resolveReaderInstance(target) {
    if (target && typeof target === "object") {
      return target;
    }

    if (typeof target === "number" && plugin?.api?.reader?.getByItemID) {
      return plugin.api.reader.getByItemID(target);
    }

    if (typeof target === "string" && plugin?.api?.reader?.getByTabID) {
      return plugin.api.reader.getByTabID(target);
    }

    if (plugin?.api?.reader?.getActiveReader) {
      return plugin.api.reader.getActiveReader();
    }

    return null;
  }

  async function getReaderFrameWindow(target, options = {}) {
    const reader = resolveReaderInstance(target);
    if (!reader) {
      throw new Error("Unable to resolve reader instance for scenario probe");
    }

    const viewKey = options.view === "secondary" ? "_secondaryView" : "_primaryView";
    const frameWindow = await waitFor(
      () => reader._internalReader?.[viewKey]?._iframeWindow || reader._iframeWindow || null,
      {
        timeoutMs: options.timeoutMs ?? 5000,
        intervalMs: options.intervalMs ?? 50,
        message: `Timed out waiting for reader ${options.view === "secondary" ? "secondary" : "primary"} iframe window`,
      },
    );

    return {
      reader,
      frameWindow,
    };
  }

  function cloneIntoFrameWindow(frameWindow, value) {
    try {
      if (Components?.utils && typeof Components.utils.cloneInto === "function") {
        return Components.utils.cloneInto(value, frameWindow, {
          cloneFunctions: true,
          wrapReflectors: true,
        });
      }
    }
    catch {}

    return value;
  }

  function summarizeReaderAppendValue(value) {
    if (value && typeof value === "object" && value.nodeType === 1) {
      return {
        kind: "element",
        tagName: typeof value.tagName === "string" ? value.tagName.toLowerCase() : null,
        id: typeof value.getAttribute === "function" ? value.getAttribute("id") || null : null,
        className: typeof value.className === "string" && value.className.trim()
          ? value.className.trim()
          : null,
        textContent: typeof value.textContent === "string" && value.textContent.trim()
          ? value.textContent.trim().slice(0, 160)
          : null,
      };
    }

    if (value && typeof value === "object") {
      return {
        kind: Array.isArray(value.groups)
          ? "menu-submenu"
          : value.slider
            ? "menu-slider"
            : value.eraser
              ? "menu-toggle"
              : "menu-item",
        label: typeof value.label === "string" && value.label.trim() ? value.label.trim() : null,
        disabled: Boolean(value.disabled),
        persistent: Boolean(value.persistent),
        checked: Boolean(value.checked),
        color: typeof value.color === "string" && value.color.trim() ? value.color.trim() : null,
        hasCommand: typeof value.onCommand === "function",
        groupCount: Array.isArray(value.groups) ? value.groups.length : 0,
      };
    }

    return {
      kind: value === null ? "null" : typeof value,
      value: value === undefined || value === null ? null : String(value),
    };
  }

  async function dispatchReaderCustomEvent(target, options = {}) {
    const eventType = String(options.type || "").trim();
    if (!eventType) {
      throw new Error("dispatchReaderCustomEvent() requires a non-empty type");
    }

    const { reader, frameWindow } = await getReaderFrameWindow(target, options);
    const appendedGroups = [];
    const append = (...args) => {
      appendedGroups.push(args.map((value) => summarizeReaderAppendValue(value)));
    };
    const params = options.params && typeof options.params === "object"
      ? JSON.parse(JSON.stringify(options.params))
      : {};
    const useCustomEventDispatch = options.includeDoc !== false;

    if (useCustomEventDispatch) {
      const detail = {
        type: eventType,
        params,
        append,
        doc: frameWindow.document,
      };

      const event = new frameWindow.CustomEvent("customEvent", {
        detail: cloneIntoFrameWindow(frameWindow, detail),
      });
      frameWindow.dispatchEvent(event);
    }

    let dispatchMode = useCustomEventDispatch ? "customEvent" : null;
    let syntheticFallback = null;
    if (
      (!useCustomEventDispatch || appendedGroups.length === 0)
      && plugin?.api?.reader
      && typeof plugin.api.reader.dispatchSyntheticEvent === "function"
    ) {
      syntheticFallback = plugin.api.reader.dispatchSyntheticEvent(reader, {
        type: eventType,
        params,
        append,
        includeDoc: options.includeDoc !== false,
        view: options.view,
      });
      if (Number(syntheticFallback?.dispatched || 0) > 0) {
        dispatchMode = "synthetic-fallback";
      }
    }

    return {
      type: eventType,
      itemID: Number.isFinite(reader?.itemID) ? reader.itemID : null,
      tabID: typeof reader?.tabID === "string" ? reader.tabID : null,
      dispatchMode,
      syntheticFallback,
      appendedGroups,
      appendedGroupCount: appendedGroups.length,
      appendedItemCount: appendedGroups.reduce((count, group) => count + group.length, 0),
    };
  }

  async function openMainWindow(options = {}) {
    const existingWindows = typeof plugin?.api?.host?.listMainWindows === "function"
      ? plugin.api.host.listMainWindows().filter(Boolean)
      : [];
    const existingSet = new Set(existingWindows);

    if (!Zotero || typeof Zotero.openMainWindow !== "function") {
      throw new Error("Zotero.openMainWindow() is not available");
    }

    const openedWindow = Zotero.openMainWindow();

    if (openedWindow && typeof openedWindow.addEventListener === "function") {
      await new Promise((resolve) => {
        let settled = false;
        const complete = () => {
          if (!settled) {
            settled = true;
            resolve();
          }
        };
        const onLoad = () => {
          try {
            openedWindow.removeEventListener("load", onLoad);
          }
          catch {}
          complete();
        };

        openedWindow.addEventListener("load", onLoad);
        if (openedWindow.document?.readyState === "complete") {
          try {
            openedWindow.removeEventListener("load", onLoad);
          }
          catch {}
          complete();
        }
      });
    }

    const trackedWindow = await waitFor(
      () => {
        const windows = typeof plugin?.api?.host?.listMainWindows === "function"
          ? plugin.api.host.listMainWindows().filter(Boolean)
          : [];
        return windows.find((candidate) => !existingSet.has(candidate)) || null;
      },
      {
        timeoutMs: options.timeoutMs ?? 8000,
        intervalMs: options.intervalMs ?? 100,
        message: "Timed out waiting for a secondary Zotero main window after openMainWindow()",
      },
    );

    addCleanup(() => {
      try {
        trackedWindow.close();
      }
      catch {}
    });

    return trackedWindow;
  }

  return {
    cleanup,
    helpers: {
      addCleanup,
      wait,
      waitFor,
      getMainWindow,
      getZoteroPane,
      getSelectedItemIDs,
      createItem,
      createCollection,
      selectItem,
      selectCollection,
      writeTempFile,
      createPDF,
      getCuratedPDFCorpusStatus,
      importCuratedPDF,
      openReader,
      listHostActions() {
        return typeof plugin?.api?.agent?.listHostActions === "function"
          ? cloneValue(plugin.api.agent.listHostActions())
          : [];
      },
      createDomContractCheck,
      async runHostAction(actionId, payload = {}) {
        if (typeof plugin?.api?.agent?.runHostAction !== "function") {
          throw new Error("plugin.api.agent.runHostAction() is unavailable");
        }
        return await plugin.api.agent.runHostAction(actionId, payload);
      },
      toDomContractResult,
      toSurfaceSmokeResult,
      normalizeSurfaceEvidenceTargets,
      getReaderFrameWindow,
      dispatchReaderCustomEvent,
      openMainWindow,
    },
  };
}

async function runScenarioCase(scenario, baseContext, runtimeState) {
  const startedAt = Date.now();
  const runtime = createScenarioHelpers(baseContext);
  const scenarioContext = {
    ...baseContext,
    helpers: runtime.helpers,
  };
  const execution = runtimeState?.execution;
  if (execution) {
    execution.currentScenario = scenario.name;
    execution.lastStartedScenario = scenario.name;
  }

  try {
    resetScenarioReaderEnvironment(baseContext.plugin);
    const rawDetails = await scenario.run(scenarioContext);
    const details = rawDetails && typeof rawDetails === "object"
      ? JSON.parse(JSON.stringify(rawDetails))
      : rawDetails;
    if (details && typeof details === "object" && details.domContract && typeof details.domContract === "object") {
      details.domContract = runtime.helpers.toDomContractResult(details.domContract);
    }
    await runtime.cleanup();
    if (execution) {
      execution.currentScenario = null;
      execution.lastCompletedScenario = scenario.name;
      execution.completedCount += 1;
      execution.lastErrorKind = null;
    }
    return {
      name: scenario.name,
      status: "passed",
      durationMs: Date.now() - startedAt,
      details: details ?? null,
    };
  }
  catch (error) {
    try {
      await runtime.cleanup();
    }
    catch (cleanupError) {
      const cleanupFailure = createScenarioError(
        `${error?.message || error}; cleanup failed: ${cleanupError?.message || cleanupError}`,
        {
          kind: "scenario-cleanup-failed",
          phase: "cleanup",
          step: "cleanup",
          scenarioName: scenario.name,
        },
      );
      if (execution) {
        execution.currentScenario = null;
        execution.lastCompletedScenario = scenario.name;
        execution.completedCount += 1;
        execution.failedCount += 1;
        execution.lastErrorKind = cleanupFailure.cleanroomScenarioErrorKind;
      }
      return {
        name: scenario.name,
        status: "failed",
        durationMs: Date.now() - startedAt,
        error: createErrorPayload(cleanupFailure, {
          scenarioName: scenario.name,
        }),
      };
    }

    if (execution) {
      execution.currentScenario = null;
      execution.lastCompletedScenario = scenario.name;
      execution.completedCount += 1;
      execution.failedCount += 1;
      execution.lastErrorKind = String(error?.cleanroomScenarioErrorKind || "scenario-execution-failed");
    }
    return {
      name: scenario.name,
      status: "failed",
      durationMs: Date.now() - startedAt,
      error: createErrorPayload(error, {
        scenarioName: scenario.name,
      }),
    };
  }
}

this.loadCleanroomZoteroScenarios = async function loadCleanroomZoteroScenarios(options) {
  const runtimeState = createScenarioRuntimeState();
  runtimeState.addonConfig = options.addonConfig;
  const registerZoteroScenario = function registerZoteroScenario(name, run) {
    const normalizedName = typeof name === "string" ? name.trim() : "";
    if (!normalizedName) {
      throw new Error("registerZoteroScenario(name, run) requires a non-empty name");
    }
    if (typeof run !== "function") {
      throw new Error(`Scenario '${normalizedName}' must provide a function`);
    }
    if (runtimeState.scenarioMap.has(normalizedName)) {
      throw new Error(`Duplicate Zotero scenario registered: ${normalizedName}`);
    }

    const sourceFileHref = typeof scope.__CLEANROOM_CURRENT_SCENARIO_FILE__ === "string"
      ? scope.__CLEANROOM_CURRENT_SCENARIO_FILE__
      : null;
    const scenario = {
      name: normalizedName,
      run,
      sourceFileHref,
    };
    runtimeState.scenarios.push(scenario);
    runtimeState.scenarioMap.set(normalizedName, scenario);
    runtimeState.registeredScenarios.push({
      name: normalizedName,
      sourceFileHref,
    });
  };

  const scope = {
    Zotero,
    Services,
    ChromeUtils,
    console,
    addonConfig: options.addonConfig,
    registerZoteroScenario,
    __CLEANROOM_CURRENT_SCENARIO_FILE__: null,
  };

  for (const fileHref of options.fileHrefs) {
    scope.__CLEANROOM_CURRENT_SCENARIO_FILE__ = fileHref;
    Services.scriptloader.loadSubScript(fileHref, scope);
  }

  runtimeState.execution.registeredScenarioNames = runtimeState.registeredScenarios.map((entry) => entry.name);
  globalThis[SCENARIO_RUNTIME_STATE_KEY] = runtimeState;

  return JSON.stringify({
    registeredScenarios: runtimeState.registeredScenarios,
    execution: snapshotScenarioExecution(runtimeState.execution),
  });
};

this.runCleanroomZoteroScenarioByName = async function runCleanroomZoteroScenarioByName(options) {
  const runtimeState = getScenarioRuntimeState();
  if (!runtimeState) {
    throw new Error("Zotero scenario runtime has not been initialized");
  }

  const scenarioName = typeof options?.name === "string" ? options.name.trim() : "";
  if (!scenarioName) {
    throw new Error("runCleanroomZoteroScenarioByName(name) requires a non-empty scenario name");
  }

  const scenario = runtimeState.scenarioMap.get(scenarioName);
  if (!scenario) {
    throw new Error(`Unknown Zotero scenario: ${scenarioName}`);
  }

  runtimeState.execution.selectedScenarioNames = Array.isArray(options?.selectedScenarioNames)
    ? options.selectedScenarioNames
      .map((value) => String(value || "").trim())
      .filter(Boolean)
    : [scenarioName];

  const context = {
    assert: createAssert(),
    Zotero,
    Services,
    ChromeUtils,
    addonConfig: runtimeState.addonConfig,
    plugin: Zotero[runtimeState.addonConfig.instanceKey],
  };

  const result = await runScenarioCase(scenario, context, runtimeState);
  return JSON.stringify({
    result,
    execution: snapshotScenarioExecution(runtimeState.execution),
  });
};

this.listCleanroomZoteroScenarios = function listCleanroomZoteroScenarios() {
  const runtimeState = getScenarioRuntimeState();
  return JSON.stringify({
    registeredScenarios: Array.isArray(runtimeState?.registeredScenarios)
      ? runtimeState.registeredScenarios
      : [],
    execution: snapshotScenarioExecution(runtimeState?.execution),
  });
};

this.runCleanroomZoteroScenarios = async function runCleanroomZoteroScenarios(options) {
  await this.loadCleanroomZoteroScenarios(options);
  const runtimeState = getScenarioRuntimeState();
  const results = [];

  for (const scenario of runtimeState.scenarios) {
    const payload = JSON.parse(await this.runCleanroomZoteroScenarioByName({
      name: scenario.name,
      selectedScenarioNames: runtimeState.scenarios.map((entry) => entry.name),
    }));
    results.push(payload.result);
  }

  return JSON.stringify({
    summary: {
      total: runtimeState.scenarios.length,
      passed: results.filter((result) => result.status === "passed").length,
      failed: results.filter((result) => result.status === "failed").length,
    },
    results,
    execution: snapshotScenarioExecution(runtimeState.execution),
  });
};
