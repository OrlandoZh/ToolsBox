import fs from "node:fs";
import path from "node:path";

import { describe, it, assert } from "./test-framework.js";
import {
  BOTTLENECK_PRESETS,
  DOCUMENT_ANALYSIS_HARNESS,
  HOST_SURFACES,
  READER_SOURCE_HARNESS,
  SCENARIO_MODULES,
  SCENARIOS,
  WEB_LIBRARY_UI_HARNESS,
  WIND_TUNNEL_ROUTES,
  buildWindTunnelModel,
  createSyntheticItems,
  estimateBottleneckLoad,
  listScenariosForModule,
  summarizeScenarioCoverage,
} from "../dev/zotero-surface-wind-tunnel/wind-tunnel-core.js";

const projectRoot = path.resolve(".");

describe("Zotero Surface Wind Tunnel", () => {
  it("should cover the template host-visible surface matrix", () => {
    const observed = new Set(SCENARIOS.flatMap((scenario) => scenario.hostSurfaces));

    ["PreferencePanes", "MenuManager", "ItemPaneManager", "Reader.renderToolbar"].forEach((surface) => {
      assert.ok(observed.has(surface), `Expected scenario matrix to include ${surface}`);
    });
    assert.ok(HOST_SURFACES.includes("context pane"));
    assert.ok(HOST_SURFACES.includes("Tag Selector"));
    assert.ok(HOST_SURFACES.includes("Tags Box"));
    assert.ok(SCENARIOS.length >= 55);
  });

  it("should expose modular scene switching metadata for every scenario", () => {
    const moduleIds = new Set(SCENARIO_MODULES.map((module) => module.id));
    assert.ok(moduleIds.has("reader-workflows"));
    assert.ok(moduleIds.has("document-translation"));
    assert.ok(moduleIds.has("release-update"));
    assert.ok(moduleIds.has("library-navigation"));
    assert.ok(moduleIds.has("item-metadata"));
    assert.ok(moduleIds.has("attachments-storage"));
    assert.ok(moduleIds.has("search-discovery"));
    assert.ok(moduleIds.has("notes-annotations"));
    assert.ok(moduleIds.has("citation-export"));
    assert.ok(moduleIds.has("sync-collaboration"));
    assert.ok(moduleIds.has("preferences-account"));
    assert.ok(DOCUMENT_ANALYSIS_HARNESS.requiredAssets.includes("build/pdf.mjs"));
    assert.equal(DOCUMENT_ANALYSIS_HARNESS.statusEndpoint, "/zotero-pdfjs/manifest.json");
    assert.equal(READER_SOURCE_HARNESS.statusEndpoint, "/zotero-reader/manifest.json");
    assert.ok(READER_SOURCE_HARNESS.requiredAnchors.some((anchor) => anchor.id === "reader-xhtml-chrome"));
    assert.ok(READER_SOURCE_HARNESS.requiredAnchors.some((anchor) => anchor.id === "reader-js-callbacks"));
    assert.equal(WEB_LIBRARY_UI_HARNESS.statusEndpoint, "/zotero-web-library/manifest.json");
    assert.ok(WEB_LIBRARY_UI_HARNESS.requiredAnchors.some((anchor) => anchor.id === "items-table"));

    SCENARIOS.forEach((scenario) => {
      assert.ok(moduleIds.has(scenario.moduleId), `${scenario.id} has unknown module ${scenario.moduleId}`);
      assert.ok(Array.isArray(scenario.coverageTags), `${scenario.id} missing coverageTags`);
      assert.ok(scenario.coverageTags.length > 0, `${scenario.id} has empty coverageTags`);
      assert.ok(Array.isArray(scenario.sourceReferences), `${scenario.id} missing sourceReferences`);
      assert.ok(scenario.sourceReferences.length > 0, `${scenario.id} has empty sourceReferences`);
    });
  });

  it("should include reference-derived generic coverage gaps from adjacent wind tunnels", () => {
    const scenarioIds = new Set(SCENARIOS.map((scenario) => scenario.id));
    [
      "reader-sidebar-tab-reuse",
      "reader-sidebar-reopen-remount",
      "docked-panel-target-follow",
      "library-context-convergence",
      "official-web-library-shell",
      "zotero-pdfjs-text-layer-analysis",
      "translation-overlay-layout",
      "quick-translate-replace",
      "pdf-export-plan",
      "merged-context-pane",
      "preference-propagation",
      "worker-wasm-matrix",
      "cold-start-recovery",
      "multi-window-simultaneous",
      "watch-reconnect",
      "release-update-path",
      "collection-tree-navigation",
      "saved-search-refresh",
      "tag-selector-filter",
      "duplicates-merge-items",
      "item-pane-metadata-edit",
      "attachment-file-lifecycle",
      "find-available-pdf",
      "retrieve-metadata-for-pdf",
      "file-sync-webdav-conflict",
      "quick-search-filter",
      "advanced-search-builder",
      "note-editor-child-note",
      "standalone-note-window",
      "annotation-to-note",
      "quick-copy-bibliography",
      "citation-dialog-word-processor",
      "import-translator-pipeline",
      "connector-save-snapshot",
      "export-translator-batch",
      "sync-queue-conflict",
      "group-library-permissions",
      "storage-quota-offline-recovery",
      "preferences-sync-account",
      "preferences-cite-export-search",
    ].forEach((scenarioId) => {
      assert.ok(scenarioIds.has(scenarioId), `Expected generic scenario ${scenarioId}`);
    });
    const tagScenario = SCENARIOS.find((scenario) => scenario.id === "tag-selector-filter");
    assert.ok(tagScenario.hostSurfaces.includes("Tag Selector"));
    assert.ok(tagScenario.hostSurfaces.includes("Tags Box"));
    assert.ok(tagScenario.coverageTags.includes("automatic tags"));

    const routes = new Set(SCENARIOS.map((scenario) => scenario.route));
    assert.ok(routes.has(WIND_TUNNEL_ROUTES.ATTACHMENTS));
    assert.ok(routes.has(WIND_TUNNEL_ROUTES.NOTES));
    assert.ok(routes.has(WIND_TUNNEL_ROUTES.SEARCH));
    assert.ok(routes.has(WIND_TUNNEL_ROUTES.CITE));
    assert.ok(routes.has(WIND_TUNNEL_ROUTES.SYNC));
    assert.ok(routes.has(WIND_TUNNEL_ROUTES.IMPORT_EXPORT));
    assert.ok(routes.has(WIND_TUNNEL_ROUTES.TRANSLATION));
    assert.ok(routes.has(WIND_TUNNEL_ROUTES.WINDOWS));
    assert.ok(routes.has(WIND_TUNNEL_ROUTES.RUNTIME));
    assert.ok(routes.has(WIND_TUNNEL_ROUTES.RELEASE));
  });

  it("should filter scenarios by module and summarize coverage", () => {
    const translationScenarios = listScenariosForModule("document-translation");
    assert.ok(translationScenarios.length >= 5);
    assert.ok(translationScenarios.every((scenario) => scenario.moduleId === "document-translation"));
    assert.ok(
      translationScenarios.some((scenario) => scenario.requiresPdfJsHarness),
      "Expected document analysis scenarios to prefer the Zotero PDF.js harness",
    );
    assert.equal(listScenariosForModule("all").length, SCENARIOS.length);

    const coverage = summarizeScenarioCoverage();
    assert.equal(coverage.moduleCount, SCENARIO_MODULES.length);
    assert.equal(coverage.scenarioCount, SCENARIOS.length);
    assert.ok(coverage.routeCount >= 16);
    assert.ok(coverage.modules.some((module) => module.id === "context-convergence" && module.scenarioCount >= 3));
    assert.ok(coverage.modules.some((module) => module.id === "sync-collaboration" && module.scenarioCount >= 3));
  });

  it("should model heavier bottleneck presets as higher pressure", () => {
    const baseline = buildWindTunnelModel({
      scenarioId: "mixed-host-action-replay",
      presetId: "baseline",
    });
    const longTask = buildWindTunnelModel({
      scenarioId: "mixed-host-action-replay",
      presetId: "main-thread-long-task",
    });
    const memoryGrowth = buildWindTunnelModel({
      scenarioId: "mixed-host-action-replay",
      presetId: "memory-growth",
    });

    assert.ok(BOTTLENECK_PRESETS.some((preset) => preset.id === "listener-leak"));
    assert.greaterThan(longTask.estimate.score, baseline.estimate.score);
    assert.greaterThan(memoryGrowth.estimate.expectedHeapMB, baseline.estimate.expectedHeapMB);
    assert.ok(longTask.hotZones.some((zone) => zone.id === "longTask"));
  });

  it("should cap synthetic row rendering while preserving selected-state signals", () => {
    const items = createSyntheticItems(50000, {
      renderLimit: 120,
      selectionSize: 40,
      route: "library",
    });

    assert.equal(items.length, 120);
    assert.equal(items.filter((item) => item.selected).length, 40);
    assert.match(items[0].key, /^WT\d+$/);
  });

  it("should keep the browser app local and dev-only", () => {
    const htmlPath = path.join(projectRoot, "dev", "zotero-surface-wind-tunnel", "static", "index.html");
    const appPath = path.join(projectRoot, "dev", "zotero-surface-wind-tunnel", "static", "wind-tunnel-app.js");
    const cssPath = path.join(projectRoot, "dev", "zotero-surface-wind-tunnel", "static", "wind-tunnel.css");
    const serverPath = path.join(projectRoot, "scripts", "zotero-surface-wind-tunnel-server.mjs");
    const htmlSource = fs.readFileSync(htmlPath, "utf-8");
    const appSource = fs.readFileSync(appPath, "utf-8");
    const cssSource = fs.readFileSync(cssPath, "utf-8");
    const serverSource = fs.readFileSync(serverPath, "utf-8");

    assert.ok(htmlSource.includes("Zotero Surface Wind Tunnel"));
    assert.ok(htmlSource.includes("/static/wind-tunnel-app.js"));
    assert.ok(htmlSource.includes("wind-module-list"));
    assert.ok(htmlSource.includes("wind-coverage-map"));
    assert.ok(htmlSource.includes("wind-toggle-metrics"));
    assert.ok(htmlSource.includes("wind-panel-collapse-rail"));
    assert.equal(/https?:\/\//u.test(htmlSource), false);
    assert.ok(appSource.includes("../wind-tunnel-core.js"));
    assert.ok(appSource.includes("loadPdfJsHarnessStatus"));
    assert.ok(appSource.includes("loadReaderSourceHarnessStatus"));
    assert.ok(appSource.includes("loadWebLibraryHarnessStatus"));
    assert.ok(appSource.includes("loadWebLibraryFixtureStatus"));
    assert.ok(appSource.includes("zotero-reader-browser-adapter"));
    assert.ok(appSource.includes("reader.xhtml renderToolbar"));
    assert.ok(appSource.includes("reader.js onOpenContextMenu / text selection"));
    assert.ok(appSource.includes("Reader Source Anchors"));
    assert.ok(appSource.includes("reader-js-callbacks"));
    assert.ok(appSource.includes("reader-css-chrome"));
    assert.ok(appSource.includes("samplePDFMode"));
    assert.ok(appSource.includes("reader-selection-dock"));
    assert.equal(appSource.includes("reader-selection-popover"), false);
    assert.ok(appSource.includes("metricsPanelCollapsed"));
    assert.ok(appSource.includes("modelLeftPaneCollapsed"));
    assert.ok(appSource.includes("modelRightPaneCollapsed"));
    assert.ok(appSource.includes("createModelPaneToggleButton"));
    assert.ok(appSource.includes("createPaneCollapseRail"));
    assert.ok(appSource.includes("pdf-check"));
    assert.ok(appSource.includes("surfaceRoute"));
    assert.ok(appSource.includes("wind.metricsPanel.toggle"));
    assert.ok(appSource.includes("zoteroPane.toggle"));
    assert.ok(appSource.includes("PDF pages are rendered by Zotero Reader's bundled PDF.js"));
    assert.ok(appSource.includes("Official UI Adapter"));
    assert.ok(appSource.includes("webLibraryFixture"));
    assert.ok(appSource.includes("recordHostInteraction"));
    assert.ok(appSource.includes("collection.click"));
    assert.ok(appSource.includes("collection.keyboard.navigate"));
    assert.ok(appSource.includes("items.header.click"));
    assert.ok(appSource.includes("item.shift.click"));
    assert.ok(appSource.includes("item.meta.click"));
    assert.ok(appSource.includes("item.keyboard.navigate"));
    assert.ok(appSource.includes("item.contextmenu"));
    assert.ok(appSource.includes("menu.popupshowing"));
    assert.ok(appSource.includes("menu.dynamic.rebuild"));
    assert.ok(appSource.includes("itemPane.section.click"));
    assert.ok(appSource.includes("renderAtlasSurface"));
    assert.ok(appSource.includes("atlasBlueprintForRoute"));
    assert.ok(appSource.includes("scenario.action.click"));
    assert.ok(appSource.includes("scenario.lane.click"));
    assert.ok(appSource.includes("wind-context-menu"));
    assert.ok(appSource.includes("items-table-wrap"));
    assert.ok(appSource.includes("aria-sort"));
    assert.ok(appSource.includes("ITEM_TREE_COLUMN_RESIZE_MODEL"));
    assert.ok(appSource.includes("libraryColumnWidths"));
    assert.ok(appSource.includes("column-resizer"));
    assert.ok(appSource.includes("aria-orientation"));
    assert.ok(appSource.includes("itemTree.column.resize"));
    assert.ok(appSource.includes("onResize(columnWidths, true)"));
    assert.ok(appSource.includes("max-content 1fr"));
    assert.ok(appSource.includes("TAG_COLOR_PRESETS"));
    assert.ok(appSource.includes("TEMPLATE_TAG_CATALOG"));
    assert.ok(appSource.includes("showAutomaticTags"));
    assert.ok(appSource.includes("tag-selector-item keyboard-clickable"));
    assert.ok(appSource.includes("aria-checked"));
    assert.ok(appSource.includes("aria-disabled"));
    assert.ok(appSource.includes("tagSelector.tag.click"));
    assert.ok(appSource.includes("tagSelector.search"));
    assert.ok(appSource.includes("collectionTreeRow.setTags"));
    assert.ok(appSource.includes("itemTree.tag.filter"));
    assert.ok(appSource.includes("tagSelector.drop.addTag"));
    assert.ok(appSource.includes("tagSelector.drop.removeTag"));
    assert.ok(appSource.includes("tagsBox.tag.add"));
    assert.ok(appSource.includes("tagsBox.tag.remove"));
    assert.ok(appSource.includes("item.addTag"));
    assert.ok(appSource.includes("item.removeTag"));
    assert.ok(appSource.includes("item.saveTx"));
    assert.ok(appSource.includes("tagName"));
    assert.ok(appSource.includes("tagType"));
    assert.ok(appSource.includes("Tags Box"));
    assert.ok(cssSource.includes("--item-tree-columns"));
    assert.ok(cssSource.includes("col-resize"));
    assert.ok(cssSource.includes("tag-selector-list"));
    assert.ok(cssSource.includes("tags-box-list"));
    assert.ok(cssSource.includes("--tag-color"));
    assert.ok(cssSource.includes("reader-source-anchor-panel"));
    assert.ok(cssSource.includes("reader-selection-dock"));
    assert.equal(cssSource.includes("reader-selection-popover"), false);
    assert.ok(cssSource.includes("data-metrics-collapsed"));
    assert.ok(cssSource.includes("data-left-pane-collapsed"));
    assert.ok(cssSource.includes("data-right-pane-collapsed"));
    assert.ok(cssSource.includes("pane-collapse-rail"));
    assert.ok(cssSource.includes("--zotero-reader-pdf-visual-height"));
    assert.ok(cssSource.includes('data-visual-mode="pdf-check"'));
    assert.ok(appSource.includes("ITEM_PANE_SECTIONS"));
    assert.ok(appSource.includes("SCENARIO_MODULES"));
    assert.ok(appSource.includes("listScenariosForModule"));
    assert.ok(serverSource.includes("/zotero-pdfjs/manifest.json"));
    assert.ok(serverSource.includes("/zotero-reader/manifest.json"));
    assert.ok(serverSource.includes("/zotero-web-library/manifest.json"));
    assert.ok(serverSource.includes("/zotero-web-library/fixture.json"));
    assert.ok(serverSource.includes("--zotero-web-library-root"));
    assert.ok(serverSource.includes("--zotero-reader-source-root"));
    assert.ok(serverSource.includes("--sample-pdf"));
    assert.ok(serverSource.includes("ZOTERO_WIND_TUNNEL_SAMPLE_PDF"));
    assert.ok(serverSource.includes("getConfiguredSamplePDF"));
    assert.ok(serverSource.includes("findZoteroPdfJsRoot"));
    assert.ok(serverSource.includes("findZoteroReaderSourceRoot"));
    assert.ok(serverSource.includes("inferReaderSourceRootsFromPdfJsRoots"));
    assert.ok(serverSource.includes("findWebLibraryRoot"));
    assert.ok(serverSource.includes("buildWebLibraryFixture"));
    assert.ok(serverSource.includes("createSamplePDFBuffer"));
    assert.ok(serverSource.includes("dev\", \"zotero-surface-wind-tunnel"));
  });

  it("should keep estimate output bounded for extreme slider values", () => {
    const estimate = estimateBottleneckLoad({
      itemCount: 1000000,
      selectionSize: 1000000,
      eventRate: 10000,
      domInflation: 100000,
      ioLatencyMS: 5000,
      longTaskMS: 5000,
      memoryMB: 5000,
      listenerLeakRate: 5000,
      renderMultiplier: 500,
    });

    assert.equal(estimate.score, 100);
    assert.ok(estimate.expectedFPS >= 8);
    assert.ok(estimate.expectedNodeCount > 0);
  });
});
