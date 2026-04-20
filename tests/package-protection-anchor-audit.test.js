import { describe, it, assert } from "./test-framework.js";
import {
  PACKAGE_PROTECTION_UNPACKED_SURFACE_TARGETS,
  buildPackageProtectionAuditAnchors,
  buildPackageProtectionUnpackedSurfaceAnchors,
  parsePackageProtectionAnchorAuditArgs,
  resolvePackageProtectionAuditOutputSuffix,
  scanPackageProtectionSurfaceFiles,
  scanBundleAnchors,
  summarizePackageProtectionAnchorAudit,
  summarizePrefBridgeComparison,
  summarizeSurfaceScrubComparison,
  summarizeSurfaceScrubWasmDigestComparison,
  summarizeSurfaceScrubWasmStage2DeriveComparison,
  summarizeSurfaceScrubWasmEntitlementLegacyComparison,
  summarizePackageProtectionSourceProxy,
  summarizePackageProtectionUnpackedSurface,
} from "../scripts/package-protection-anchor-audit.mjs";
import {
  REACT_UI_DEMO_SHELL_PATH,
  WASM_KERNEL_PROBE_PATH,
  WASM_KERNEL_PROBE_WORKER_PATH,
} from "../src/utils/optional-bundle-paths.js";

function buildVariantReport(variant, source, anchors, unpackedSurface = null) {
  const scan = scanBundleAnchors(source, anchors);
  return {
    variant,
    bundlePath: `/tmp/${variant}.js`,
    bundleSizeBytes: source.length,
    xpiPath: `/tmp/${variant}.xpi`,
    xpiSizeBytes: 2048,
    ...scan,
    unpackedSurface,
  };
}

function buildSourceProxyReport(mode, source, anchors, unpackedSurface = null) {
  const scan = scanBundleAnchors(source, anchors);
  return {
    mode,
    bundlePath: `/tmp/${mode}-proxy.js`,
    bundleSizeBytes: source.length,
    ...scan,
    unpackedSurface,
  };
}

describe("Package Protection Anchor Audit", () => {
  it("should parse --variant and default to all variants", () => {
    const allOptions = parsePackageProtectionAnchorAuditArgs([]);
    const shieldedOptions = parsePackageProtectionAnchorAuditArgs(["--variant", "shielded"]);
    const descriptorBindOptions = parsePackageProtectionAnchorAuditArgs(["--include-descriptor-bind"]);
    const jsConfuserStringOptions = parsePackageProtectionAnchorAuditArgs(["--include-jsconfuser-string"]);
    const prefBridgeOptions = parsePackageProtectionAnchorAuditArgs(["--include-pref-bridge"]);
    const surfaceScrubOptions = parsePackageProtectionAnchorAuditArgs(["--include-surface-scrub"]);
    const wasmDigestOptions = parsePackageProtectionAnchorAuditArgs(["--include-surface-scrub-wasm-digest"]);
    const wasmStage2DeriveOptions = parsePackageProtectionAnchorAuditArgs(["--include-surface-scrub-wasm-stage2-derive"]);
    const wasmEntitlementLegacyOptions = parsePackageProtectionAnchorAuditArgs(["--include-surface-scrub-wasm-entitlement-legacy"]);
    const singleDescriptorBindOptions = parsePackageProtectionAnchorAuditArgs(["--variant", "descriptor-bind"]);
    const singleJSConfuserStringOptions = parsePackageProtectionAnchorAuditArgs(["--variant", "jsconfuser-string"]);
    const singlePrefBridgeOptions = parsePackageProtectionAnchorAuditArgs(["--variant", "pref-bridge"]);
    const singleSurfaceScrubOptions = parsePackageProtectionAnchorAuditArgs(["--variant", "surface-scrub"]);
    const singleWasmDigestOptions = parsePackageProtectionAnchorAuditArgs(["--variant", "wasm-digest"]);
    const singleWasmStage2DeriveOptions = parsePackageProtectionAnchorAuditArgs(["--variant", "wasm-stage2-derive"]);
    const singleWasmEntitlementLegacyOptions = parsePackageProtectionAnchorAuditArgs(["--variant", "wasm-entitlement-legacy"]);

    assert.deepEqual(allOptions.variants, ["plain", "encrypted", "shielded"]);
    assert.deepEqual(shieldedOptions.variants, ["shielded"]);
    assert.deepEqual(descriptorBindOptions.variants, ["plain", "encrypted", "shielded", "descriptor-bind"]);
    assert.deepEqual(jsConfuserStringOptions.variants, ["plain", "encrypted", "shielded", "jsconfuser-string"]);
    assert.deepEqual(prefBridgeOptions.variants, ["plain", "encrypted", "shielded", "pref-bridge"]);
    assert.deepEqual(surfaceScrubOptions.variants, ["plain", "encrypted", "shielded", "surface-scrub"]);
    assert.deepEqual(wasmDigestOptions.variants, ["plain", "encrypted", "shielded", "surface-scrub-wasm-digest"]);
    assert.deepEqual(wasmStage2DeriveOptions.variants, ["plain", "encrypted", "shielded", "surface-scrub-wasm-stage2-derive"]);
    assert.deepEqual(wasmEntitlementLegacyOptions.variants, ["plain", "encrypted", "shielded", "surface-scrub-wasm-entitlement-legacy"]);
    assert.deepEqual(singleDescriptorBindOptions.variants, ["descriptor-bind"]);
    assert.deepEqual(singleJSConfuserStringOptions.variants, ["jsconfuser-string"]);
    assert.deepEqual(singlePrefBridgeOptions.variants, ["pref-bridge"]);
    assert.deepEqual(singleSurfaceScrubOptions.variants, ["surface-scrub"]);
    assert.deepEqual(singleWasmDigestOptions.variants, ["surface-scrub-wasm-digest"]);
    assert.deepEqual(singleWasmStage2DeriveOptions.variants, ["surface-scrub-wasm-stage2-derive"]);
    assert.deepEqual(singleWasmEntitlementLegacyOptions.variants, ["surface-scrub-wasm-entitlement-legacy"]);
  });

  it("should build dynamic anchors from addon config", () => {
    const anchors = buildPackageProtectionAuditAnchors({
      addonName: "Demo Tool",
      addonRef: "demo-addon",
      addonVersion: "1.2.3",
      author: "Demo Author",
      homepage: "https://example.com/demo",
      updateURL: "https://example.com/update.json",
      instanceKey: "DemoInstance",
    });

    const ids = anchors.map((anchor) => anchor.id);
    assert.ok(ids.includes("addon-name-literal"));
    assert.ok(ids.includes("addon-ref-literal"));
    assert.ok(ids.includes("addon-version-literal"));
    assert.ok(ids.includes("author-literal"));
    assert.ok(ids.includes("homepage-url-literal"));
    assert.ok(ids.includes("update-url-literal"));
    assert.ok(ids.includes("instance-key-literal"));
    assert.ok(ids.includes("preference-pane-root-id"));
    assert.ok(ids.includes("plugin-api-agent-surface"));
    assert.ok(ids.includes("reader-selection-command-id"));
    assert.ok(ids.includes("runtime-core-service-id"));
    assert.ok(ids.includes("tools-menu-item-id"));
    assert.ok(ids.includes("command-copy-open-cleanroom-action"));
    assert.ok(ids.includes("service-label-runtime-core"));
    assert.ok(ids.includes("host-action-open-pane"));
    assert.ok(ids.includes("host-action-runtime-probe-wasm"));
    assert.ok(ids.includes("host-action-runtime-digest-wasm"));
    assert.ok(ids.includes("host-action-catalog-authoritative-source"));
    assert.ok(ids.includes("capability-baseline-registration"));
    assert.ok(ids.includes("capability-label-baseline-registration"));
    assert.ok(ids.includes("capability-label-reader-summary"));
    assert.ok(ids.includes("capability-host-actions"));
    assert.ok(ids.includes("capability-label-runtime-bridge-report"));
    assert.ok(ids.includes("scenario-reader-current"));
    assert.ok(ids.includes("scenario-settings-snapshot"));
    assert.ok(ids.includes("bootstrap-log-prefix"));
    assert.ok(ids.includes("bootstrap-console-bridge"));
    assert.ok(ids.includes("bootstrap-capability-report"));
    assert.ok(ids.includes("wasm-worker-instantiate"));
  });

  it("should keep capability labels out of unpacked support surface anchors", () => {
    const ids = buildPackageProtectionUnpackedSurfaceAnchors({
      addonRef: "demo-addon",
      addonVersion: "1.2.3",
    }).map((anchor) => anchor.id);

    assert.equal(ids.includes("capability-label-reader-summary"), false);
    assert.equal(ids.includes("capability-label-host-actions"), false);
  });

  it("should resolve output suffixes for base and experimental audit variants", () => {
    assert.equal(resolvePackageProtectionAuditOutputSuffix("plain"), "");
    assert.equal(resolvePackageProtectionAuditOutputSuffix("encrypted"), "encrypted");
    assert.equal(resolvePackageProtectionAuditOutputSuffix("shielded"), "shielded");
    assert.equal(resolvePackageProtectionAuditOutputSuffix("descriptor-bind"), "shielded-descriptor-bind");
    assert.equal(resolvePackageProtectionAuditOutputSuffix("jsconfuser-string"), "shielded-jsconfuser-string");
    assert.equal(resolvePackageProtectionAuditOutputSuffix("pref-bridge"), "shielded-pref-bridge");
    assert.equal(resolvePackageProtectionAuditOutputSuffix("surface-scrub"), "shielded-surface-scrub");
    assert.equal(resolvePackageProtectionAuditOutputSuffix("surface-scrub-wasm-digest"), "shielded-surface-scrub-wasm-digest");
    assert.equal(resolvePackageProtectionAuditOutputSuffix("surface-scrub-wasm-stage2-derive"), "shielded-surface-scrub-wasm-stage2-derive");
    assert.equal(resolvePackageProtectionAuditOutputSuffix("surface-scrub-wasm-entitlement-legacy"), "shielded-surface-scrub-wasm-entitlement-legacy");
  });

  it("should include the react-ui demo shell in unpacked surface targets", () => {
    assert.ok(PACKAGE_PROTECTION_UNPACKED_SURFACE_TARGETS.includes(REACT_UI_DEMO_SHELL_PATH));
    assert.ok(PACKAGE_PROTECTION_UNPACKED_SURFACE_TARGETS.includes("manifest.json"));
    assert.ok(PACKAGE_PROTECTION_UNPACKED_SURFACE_TARGETS.includes(WASM_KERNEL_PROBE_PATH));
    assert.ok(PACKAGE_PROTECTION_UNPACKED_SURFACE_TARGETS.includes(WASM_KERNEL_PROBE_WORKER_PATH));
  });

  it("should summarize a wasm digest comparison as bounded when new files stay under content/lib/w", () => {
    const anchors = buildPackageProtectionAuditAnchors({
      addonRef: "demo-addon",
      addonVersion: "1.2.3",
      updateURL: "https://example.com/update.json",
    });
    const surfaceAnchors = buildPackageProtectionUnpackedSurfaceAnchors({
      addonRef: "demo-addon",
      addonVersion: "1.2.3",
      updateURL: "https://example.com/update.json",
    });
    const surfaceScrubSurface = scanPackageProtectionSurfaceFiles([
      {
        relativePath: "manifest.json",
        absolutePath: "/tmp/surface-scrub/manifest.json",
        source: "1.2.3 https://example.com/update.json",
      },
      {
        relativePath: WASM_KERNEL_PROBE_WORKER_PATH,
        absolutePath: `/tmp/surface-scrub/${WASM_KERNEL_PROBE_WORKER_PATH}`,
        source: "worker cannot fetch wasm bytes WebAssembly.instantiate",
      },
    ], surfaceAnchors);
    const wasmDigestSurface = scanPackageProtectionSurfaceFiles([
      {
        relativePath: "manifest.json",
        absolutePath: "/tmp/wasm-digest/manifest.json",
        source: "1.2.3 https://example.com/update.json",
      },
      {
        relativePath: WASM_KERNEL_PROBE_PATH,
        absolutePath: `/tmp/wasm-digest/${WASM_KERNEL_PROBE_PATH}`,
        source: "",
      },
      {
        relativePath: WASM_KERNEL_PROBE_WORKER_PATH,
        absolutePath: `/tmp/wasm-digest/${WASM_KERNEL_PROBE_WORKER_PATH}`,
        source: "worker cannot fetch wasm bytes WebAssembly.instantiate",
      },
    ], surfaceAnchors);

    const comparison = summarizeSurfaceScrubWasmDigestComparison([
      buildVariantReport("surface-scrub", "/* protected raw loader */", anchors, surfaceScrubSurface),
      buildVariantReport("surface-scrub-wasm-digest", "/* protected raw loader */", anchors, wasmDigestSurface),
    ]);

    assert.equal(comparison.present, true);
    assert.equal(comparison.packageBoundaryWithinWasmAssets, true);
    assert.deepEqual(comparison.newExposedFiles, [WASM_KERNEL_PROBE_PATH]);
    assert.deepEqual(comparison.unexpectedExposedFiles, []);
  });

  it("should summarize a wasm stage2 derive comparison as bounded when new files stay under content/lib/w", () => {
    const anchors = buildPackageProtectionAuditAnchors({
      addonRef: "demo-addon",
      addonVersion: "1.2.3",
      updateURL: "https://example.com/update.json",
    });
    const surfaceAnchors = buildPackageProtectionUnpackedSurfaceAnchors({
      addonRef: "demo-addon",
      addonVersion: "1.2.3",
      updateURL: "https://example.com/update.json",
    });
    const surfaceScrubSurface = scanPackageProtectionSurfaceFiles([
      {
        relativePath: "manifest.json",
        absolutePath: "/tmp/surface-scrub/manifest.json",
        source: "1.2.3 https://example.com/update.json",
      },
      {
        relativePath: WASM_KERNEL_PROBE_WORKER_PATH,
        absolutePath: `/tmp/surface-scrub/${WASM_KERNEL_PROBE_WORKER_PATH}`,
        source: "worker cannot fetch wasm bytes WebAssembly.instantiate",
      },
    ], surfaceAnchors);
    const wasmStage2DeriveSurface = scanPackageProtectionSurfaceFiles([
      {
        relativePath: "manifest.json",
        absolutePath: "/tmp/wasm-stage2-derive/manifest.json",
        source: "1.2.3 https://example.com/update.json",
      },
      {
        relativePath: WASM_KERNEL_PROBE_PATH,
        absolutePath: `/tmp/wasm-stage2-derive/${WASM_KERNEL_PROBE_PATH}`,
        source: "",
      },
      {
        relativePath: WASM_KERNEL_PROBE_WORKER_PATH,
        absolutePath: `/tmp/wasm-stage2-derive/${WASM_KERNEL_PROBE_WORKER_PATH}`,
        source: "worker cannot fetch wasm bytes WebAssembly.instantiate",
      },
    ], surfaceAnchors);

    const comparison = summarizeSurfaceScrubWasmStage2DeriveComparison([
      buildVariantReport("surface-scrub", "/* protected raw loader */", anchors, surfaceScrubSurface),
      buildVariantReport("surface-scrub-wasm-stage2-derive", "/* protected raw loader */", anchors, wasmStage2DeriveSurface),
    ]);

    assert.equal(comparison.present, true);
    assert.equal(comparison.packageBoundaryWithinWasmAssets, true);
    assert.deepEqual(comparison.newExposedFiles, [WASM_KERNEL_PROBE_PATH]);
    assert.deepEqual(comparison.unexpectedExposedFiles, []);
  });

  it("should summarize a wasm entitlement legacy comparison as bounded when new files stay under content/lib/w", () => {
    const anchors = buildPackageProtectionAuditAnchors({
      addonRef: "demo-addon",
      addonVersion: "1.2.3",
      updateURL: "https://example.com/update.json",
    });
    const surfaceAnchors = buildPackageProtectionUnpackedSurfaceAnchors({
      addonRef: "demo-addon",
      addonVersion: "1.2.3",
      updateURL: "https://example.com/update.json",
    });
    const surfaceScrubSurface = scanPackageProtectionSurfaceFiles([
      {
        relativePath: "manifest.json",
        absolutePath: "/tmp/surface-scrub/manifest.json",
        source: "1.2.3 https://example.com/update.json",
      },
      {
        relativePath: WASM_KERNEL_PROBE_WORKER_PATH,
        absolutePath: `/tmp/surface-scrub/${WASM_KERNEL_PROBE_WORKER_PATH}`,
        source: "worker cannot fetch wasm bytes WebAssembly.instantiate",
      },
    ], surfaceAnchors);
    const wasmEntitlementLegacySurface = scanPackageProtectionSurfaceFiles([
      {
        relativePath: "manifest.json",
        absolutePath: "/tmp/wasm-entitlement-legacy/manifest.json",
        source: "1.2.3 https://example.com/update.json",
      },
      {
        relativePath: WASM_KERNEL_PROBE_PATH,
        absolutePath: `/tmp/wasm-entitlement-legacy/${WASM_KERNEL_PROBE_PATH}`,
        source: "",
      },
      {
        relativePath: WASM_KERNEL_PROBE_WORKER_PATH,
        absolutePath: `/tmp/wasm-entitlement-legacy/${WASM_KERNEL_PROBE_WORKER_PATH}`,
        source: "worker cannot fetch wasm bytes WebAssembly.instantiate",
      },
    ], surfaceAnchors);

    const comparison = summarizeSurfaceScrubWasmEntitlementLegacyComparison([
      buildVariantReport("surface-scrub", "/* protected raw loader */", anchors, surfaceScrubSurface),
      buildVariantReport("surface-scrub-wasm-entitlement-legacy", "/* protected raw loader */", anchors, wasmEntitlementLegacySurface),
    ]);

    assert.equal(comparison.present, true);
    assert.equal(comparison.packageBoundaryWithinWasmAssets, true);
    assert.deepEqual(comparison.newExposedFiles, [WASM_KERNEL_PROBE_PATH]);
    assert.deepEqual(comparison.unexpectedExposedFiles, []);
  });

  it("should count anchor exposure in bundle source", () => {
    const anchors = buildPackageProtectionAuditAnchors({
      addonRef: "demo-addon",
      addonVersion: "1.2.3",
    });
    const scan = scanBundleAnchors(`
      demo-addon
      plugin.api.agent.inspectItem()
      plugin.api.agent.inspectItem()
      runAgentAction()
      sourceSHA256
    `, anchors);

    assert.equal(scan.totalAnchorCount >= 4, true);
    assert.equal(scan.totalMatchCount >= 5, true);
    assert.equal(scan.categoryCounts["inner-bundle-semantics"] >= 3, true);
    assert.equal(scan.categoryCounts["loader-metadata"] >= 2, true);
  });

  it("should point next action to inner semantic scrub when raw protected exports are clean", () => {
    const anchors = buildPackageProtectionAuditAnchors({
      addonRef: "demo-addon",
      addonVersion: "1.2.3",
    });
    const plain = buildVariantReport(
      "plain",
      "plugin.api.agent.inspectItem() runAgentAction() entrypoints ownedBy successSignals serviceRegistry optionalBundles agent-runtime ai-service demo-addon",
      anchors,
    );
    const encrypted = buildVariantReport("encrypted", "/* protected raw loader */", anchors);
    const shielded = buildVariantReport("shielded", "/* protected raw loader */", anchors);

    const report = summarizePackageProtectionAnchorAudit([plain, encrypted, shielded], { anchors });

    assert.equal(report.status, "attention");
    assert.equal(report.nextAction, "open-inner-semantic-scrub");
    assert.equal(report.comparison.nextPriority, "inner-bundle-semantics");
  });

  it("should summarize source proxy reduction for protected semantic scrub", () => {
    const anchors = buildPackageProtectionAuditAnchors({
      addonRef: "demo-addon",
      addonVersion: "1.2.3",
    });
    const sourceProxy = summarizePackageProtectionSourceProxy([
      buildSourceProxyReport(
        "plain",
        "plugin.api.agent.inspectItem() runAgentAction() entrypoints ownedBy successSignals serviceRegistry optionalBundles agent-runtime ai-service 基线注册 Reader 摘要 宿主动作编排 运行时桥接报告",
        anchors,
      ),
      buildSourceProxyReport(
        "protected",
        "serviceRegistry optionalBundles",
        anchors,
      ),
    ]);

    assert.equal(sourceProxy.present, true);
    assert.equal(sourceProxy.reducedAnchorCount >= 9, true);
    assert.equal(sourceProxy.reducedMatchCount >= 9, true);
    assert.ok(sourceProxy.removedAnchorIds.includes("plugin-api-agent-surface"));
    assert.ok(sourceProxy.removedAnchorIds.includes("capability-label-baseline-registration"));
    assert.ok(sourceProxy.removedAnchorIds.includes("capability-label-reader-summary"));
    assert.ok(sourceProxy.removedAnchorIds.includes("capability-label-host-actions"));
    assert.ok(sourceProxy.removedAnchorIds.includes("optional-agent-runtime"));
    assert.ok(sourceProxy.remainingAnchorIds.includes("service-registry"));
  });

  it("should scan unpacked surface support files and summarize remaining exposed files", () => {
    const surfaceAnchors = buildPackageProtectionUnpackedSurfaceAnchors({
      addonName: "Demo Tool",
      addonRef: "demo-addon",
      addonVersion: "1.2.3",
      author: "Demo Author",
      homepage: "https://example.com/demo",
      updateURL: "https://example.com/update.json",
      instanceKey: "DemoInstance",
    });
    const plainSurface = scanPackageProtectionSurfaceFiles([
      {
        relativePath: "manifest.json",
        absolutePath: "/tmp/plain/manifest.json",
        source: "Demo Tool Demo Author https://example.com/demo https://example.com/update.json",
      },
      {
        relativePath: "bootstrap.js",
        absolutePath: "/tmp/plain/bootstrap.js",
        source: "cleanroom.bootstrap console-bridge capability-report DemoInstance",
      },
      {
        relativePath: "content/preferences.js",
        absolutePath: "/tmp/plain/content/preferences.js",
        source: "Open Cleanroom Action Runtime Core Host Signal Collector demo-addon",
      },
      {
        relativePath: "content/preferences.xhtml",
        absolutePath: "/tmp/plain/content/preferences.xhtml",
        source: '<vbox id="demo-addon-preferences-root" data-pref-root="true"></vbox>',
      },
      {
        relativePath: WASM_KERNEL_PROBE_WORKER_PATH,
        absolutePath: `/tmp/plain/${WASM_KERNEL_PROBE_WORKER_PATH}`,
        source: "worker cannot fetch wasm bytes WebAssembly.instantiate",
      },
      {
        relativePath: "locale/en-US/main.ftl",
        absolutePath: "/tmp/plain/locale/en-US/main.ftl",
        source: "Show Reader Demo Summary Optional React Host Surface",
      },
    ], surfaceAnchors);
    const protectedSurface = scanPackageProtectionSurfaceFiles([
      {
        relativePath: "manifest.json",
        absolutePath: "/tmp/protected/manifest.json",
        source: "",
      },
      {
        relativePath: "bootstrap.js",
        absolutePath: "/tmp/protected/bootstrap.js",
        source: "",
      },
      {
        relativePath: "content/preferences.js",
        absolutePath: "/tmp/protected/content/preferences.js",
        source: "demo-addon",
      },
      {
        relativePath: "content/preferences.xhtml",
        absolutePath: "/tmp/protected/content/preferences.xhtml",
        source: '<vbox id="crabc123-p0-root" data-pref-root="true"></vbox>',
      },
      {
        relativePath: WASM_KERNEL_PROBE_WORKER_PATH,
        absolutePath: `/tmp/protected/${WASM_KERNEL_PROBE_WORKER_PATH}`,
        source: "",
      },
      {
        relativePath: "locale/en-US/main.ftl",
        absolutePath: "/tmp/protected/locale/en-US/main.ftl",
        source: "",
      },
    ], surfaceAnchors);

    const summary = summarizePackageProtectionUnpackedSurface([
      buildSourceProxyReport("plain", "plain bundle", surfaceAnchors, {
        buildRootPath: "/tmp/plain",
        targetFiles: [],
        ...plainSurface,
      }),
      buildSourceProxyReport("protected", "protected bundle", surfaceAnchors, {
        buildRootPath: "/tmp/protected",
        targetFiles: [],
        ...protectedSurface,
      }),
    ]);

    assert.equal(summary.present, true);
    assert.equal(summary.totalAnchorCount, 1);
    assert.equal(summary.totalMatchCount, 1);
    assert.deepEqual(summary.exposedFiles, ["content/preferences.js"]);
    assert.deepEqual(summary.plain.exposedFiles, [
      "manifest.json",
      "bootstrap.js",
      "content/preferences.js",
      "content/preferences.xhtml",
      WASM_KERNEL_PROBE_WORKER_PATH,
      "locale/en-US/main.ftl",
    ]);
    assert.equal(summary.reducedAnchorCount >= 4, true);
    assert.equal(summary.nextAction, "keep-surface-scrub-advisory");
  });

  it("should point next action to loader trimming when shielded raw export still leaks anchors", () => {
    const anchors = buildPackageProtectionAuditAnchors({
      addonRef: "demo-addon",
      addonVersion: "1.2.3",
    });
    const plain = buildVariantReport("plain", "plugin.api.agent.inspectItem() runAgentAction()", anchors);
    const encrypted = buildVariantReport("encrypted", "/* protected raw loader */", anchors);
    const shielded = buildVariantReport("shielded", "sourceSHA256 generatedAt demo-addon", anchors);

    const report = summarizePackageProtectionAnchorAudit([plain, encrypted, shielded], { anchors });

    assert.equal(report.status, "attention");
    assert.equal(report.nextAction, "trim-loader-surface");
    assert.equal(report.comparison.nextPriority, "loader-surface");
  });

  it("should keep descriptor-bind as an extra advisory variant without changing the base comparison logic", () => {
    const anchors = buildPackageProtectionAuditAnchors({
      addonRef: "demo-addon",
      addonVersion: "1.2.3",
    });
    const plain = buildVariantReport("plain", "plugin.api.agent.inspectItem() runAgentAction()", anchors);
    const encrypted = buildVariantReport("encrypted", "/* protected raw loader */", anchors);
    const shielded = buildVariantReport("shielded", "/* protected raw loader */", anchors);
    const descriptorBind = buildVariantReport("descriptor-bind", "/* protected raw loader */", anchors);

    const report = summarizePackageProtectionAnchorAudit(
      [plain, encrypted, shielded, descriptorBind],
      {
        anchors,
        variantOrder: ["plain", "encrypted", "shielded", "descriptor-bind"],
      },
    );

    assert.equal(report.status, "attention");
    assert.equal(report.nextAction, "open-inner-semantic-scrub");
    assert.deepEqual(
      report.variants.map((item) => item.variant),
      ["plain", "encrypted", "shielded", "descriptor-bind"],
    );
    assert.equal(report.variants[3].present, true);
    assert.equal(report.variants[3].totalAnchorCount, 0);
    assert.equal(report.comparison.shieldedRawAnchorCount, 0);
    assert.equal(report.descriptorBindComparison.present, true);
    assert.equal(report.descriptorBindComparison.sameRawSurface, true);
    assert.equal(report.descriptorBindComparison.rawAnchorDeltaCount, 0);
    assert.equal(report.descriptorBindComparison.rawMatchDeltaCount, 0);
    assert.equal(report.descriptorBindComparison.xpiSizeDeltaBytes, 0);
    assert.equal(report.descriptorBindComparison.bundleSizeDeltaBytes, 0);
    assert.equal(report.descriptorBindComparison.recommendedReading, "runtime-semantic-recovery");
  });

  it("should keep jsconfuser-string as an extra advisory variant without changing the base comparison logic", () => {
    const anchors = buildPackageProtectionAuditAnchors({
      addonRef: "demo-addon",
      addonVersion: "1.2.3",
    });
    const plain = buildVariantReport("plain", "plugin.api.agent.inspectItem() runAgentAction()", anchors);
    const encrypted = buildVariantReport("encrypted", "/* protected raw loader */", anchors);
    const shielded = buildVariantReport("shielded", "/* protected raw loader */", anchors);
    const jsConfuserString = buildVariantReport("jsconfuser-string", "/* protected raw loader */", anchors);

    const report = summarizePackageProtectionAnchorAudit(
      [plain, encrypted, shielded, jsConfuserString],
      {
        anchors,
        variantOrder: ["plain", "encrypted", "shielded", "jsconfuser-string"],
      },
    );

    assert.equal(report.status, "attention");
    assert.equal(report.nextAction, "open-inner-semantic-scrub");
    assert.deepEqual(
      report.variants.map((item) => item.variant),
      ["plain", "encrypted", "shielded", "jsconfuser-string"],
    );
    assert.equal(report.variants[3].present, true);
    assert.equal(report.variants[3].totalAnchorCount, 0);
    assert.equal(report.comparison.shieldedRawAnchorCount, 0);
    assert.equal(report.jsConfuserStringComparison.present, true);
    assert.equal(report.jsConfuserStringComparison.sameRawSurface, true);
    assert.equal(report.jsConfuserStringComparison.rawAnchorDeltaCount, 0);
    assert.equal(report.jsConfuserStringComparison.rawMatchDeltaCount, 0);
    assert.equal(report.jsConfuserStringComparison.xpiSizeDeltaBytes, 0);
    assert.equal(report.jsConfuserStringComparison.bundleSizeDeltaBytes, 0);
    assert.equal(report.jsConfuserStringComparison.recommendedReading, "jsconfuser-targeted-string-smoke");
  });

  it("should summarize pref-bridge as unpacked-surface hardening when raw surface stays unchanged", () => {
    const anchors = buildPackageProtectionAuditAnchors({
      addonRef: "demo-addon",
      addonVersion: "1.2.3",
    });
    const surfaceAnchors = buildPackageProtectionUnpackedSurfaceAnchors({
      addonRef: "demo-addon",
      addonVersion: "1.2.3",
      updateURL: "https://example.com/update.json",
    });
    const shieldedSurface = scanPackageProtectionSurfaceFiles([
      {
        relativePath: "bootstrap.js",
        absolutePath: "/tmp/shielded.xpi#bootstrap.js",
        source: "demo-addon",
      },
      {
        relativePath: "prefs.js",
        absolutePath: "/tmp/shielded.xpi#prefs.js",
        source: 'pref("extensions.zotero.demo-addon.enabled", true);',
      },
      {
        relativePath: "content/preferences.xhtml",
        absolutePath: "/tmp/shielded.xpi#content/preferences.xhtml",
        source: '<vbox id="demo-addon-preferences-root"></vbox>',
      },
      {
        relativePath: REACT_UI_DEMO_SHELL_PATH,
        absolutePath: `/tmp/shielded.xpi#${REACT_UI_DEMO_SHELL_PATH}`,
        source: '<html data-addon-ref="demo-addon"></html>',
      },
    ], surfaceAnchors);
    const prefBridgeSurface = scanPackageProtectionSurfaceFiles([
      {
        relativePath: "bootstrap.js",
        absolutePath: "/tmp/pref-bridge.xpi#bootstrap.js",
        source: "demo-addon",
      },
      {
        relativePath: "prefs.js",
        absolutePath: "/tmp/pref-bridge.xpi#prefs.js",
        source: 'pref("extensions.zotero.crabc123-p0.p0", true);',
      },
      {
        relativePath: "content/preferences.xhtml",
        absolutePath: "/tmp/pref-bridge.xpi#content/preferences.xhtml",
        source: '<vbox id="crabc123-p0-root"></vbox>',
      },
      {
        relativePath: REACT_UI_DEMO_SHELL_PATH,
        absolutePath: `/tmp/pref-bridge.xpi#${REACT_UI_DEMO_SHELL_PATH}`,
        source: '<html data-addon-ref="demo-addon"></html>',
      },
    ], surfaceAnchors);

    const comparison = summarizePrefBridgeComparison([
      buildVariantReport("shielded", "/* protected raw loader */", anchors, shieldedSurface),
      buildVariantReport("pref-bridge", "/* protected raw loader */", anchors, prefBridgeSurface),
    ]);

    assert.equal(comparison.present, true);
    assert.equal(comparison.sameRawSurface, true);
    assert.equal(comparison.sameUnpackedSurface, false);
    assert.equal(comparison.unpackedAnchorDeltaCount, -3);
    assert.equal(comparison.recommendedReading, "static-support-surface-hardening");
  });

  it("should attach pref-bridge comparison to the top-level audit report", () => {
    const anchors = buildPackageProtectionAuditAnchors({
      addonRef: "demo-addon",
      addonVersion: "1.2.3",
    });
    const surfaceAnchors = buildPackageProtectionUnpackedSurfaceAnchors({
      addonRef: "demo-addon",
      addonVersion: "1.2.3",
      updateURL: "https://example.com/update.json",
    });
    const shieldedSurface = scanPackageProtectionSurfaceFiles([
      {
        relativePath: "bootstrap.js",
        absolutePath: "/tmp/shielded.xpi#bootstrap.js",
        source: "demo-addon",
      },
      {
        relativePath: "prefs.js",
        absolutePath: "/tmp/shielded.xpi#prefs.js",
        source: 'pref("extensions.zotero.demo-addon.enabled", true);',
      },
      {
        relativePath: "content/preferences.xhtml",
        absolutePath: "/tmp/shielded.xpi#content/preferences.xhtml",
        source: '<vbox id="demo-addon-preferences-root"></vbox>',
      },
      {
        relativePath: REACT_UI_DEMO_SHELL_PATH,
        absolutePath: `/tmp/shielded.xpi#${REACT_UI_DEMO_SHELL_PATH}`,
        source: '<html data-addon-ref="demo-addon"></html>',
      },
    ], surfaceAnchors);
    const prefBridgeSurface = scanPackageProtectionSurfaceFiles([
      {
        relativePath: "bootstrap.js",
        absolutePath: "/tmp/pref-bridge.xpi#bootstrap.js",
        source: "demo-addon",
      },
      {
        relativePath: "prefs.js",
        absolutePath: "/tmp/pref-bridge.xpi#prefs.js",
        source: 'pref("extensions.zotero.crabc123-p0.p0", true);',
      },
      {
        relativePath: "content/preferences.xhtml",
        absolutePath: "/tmp/pref-bridge.xpi#content/preferences.xhtml",
        source: '<vbox id="crabc123-p0-root"></vbox>',
      },
      {
        relativePath: REACT_UI_DEMO_SHELL_PATH,
        absolutePath: `/tmp/pref-bridge.xpi#${REACT_UI_DEMO_SHELL_PATH}`,
        source: '<html data-addon-ref="demo-addon"></html>',
      },
    ], surfaceAnchors);

    const report = summarizePackageProtectionAnchorAudit([
      buildVariantReport("plain", "plugin.api.agent.inspectItem() runAgentAction()", anchors),
      buildVariantReport("encrypted", "/* protected raw loader */", anchors),
      buildVariantReport("shielded", "/* protected raw loader */", anchors, shieldedSurface),
      buildVariantReport("pref-bridge", "/* protected raw loader */", anchors, prefBridgeSurface),
    ], {
      anchors,
      variantOrder: ["plain", "encrypted", "shielded", "pref-bridge"],
    });

    assert.equal(report.prefBridgeComparison.present, true);
    assert.equal(report.prefBridgeComparison.sameRawSurface, true);
    assert.equal(report.prefBridgeComparison.sameUnpackedSurface, false);
    assert.equal(report.prefBridgeComparison.unpackedAnchorDeltaCount, -3);
    assert.equal(report.variants[3].unpackedSurface.totalAnchorCount, 2);
  });

  it("should summarize surface-scrub as unpacked-surface hardening when raw surface stays unchanged", () => {
    const anchors = buildPackageProtectionAuditAnchors({
      addonRef: "demo-addon",
      addonVersion: "1.2.3",
    });
    const surfaceAnchors = buildPackageProtectionUnpackedSurfaceAnchors({
      addonRef: "demo-addon",
      addonVersion: "1.2.3",
      updateURL: "https://example.com/update.json",
    });
    const shieldedSurface = scanPackageProtectionSurfaceFiles([
      {
        relativePath: "bootstrap.js",
        absolutePath: "/tmp/shielded.xpi#bootstrap.js",
        source: "demo-addon",
      },
      {
        relativePath: "prefs.js",
        absolutePath: "/tmp/shielded.xpi#prefs.js",
        source: 'pref("extensions.zotero.demo-addon.enabled", true);',
      },
      {
        relativePath: "content/preferences.xhtml",
        absolutePath: "/tmp/shielded.xpi#content/preferences.xhtml",
        source: '<vbox id="crabc123-p0-root"></vbox>',
      },
      {
        relativePath: REACT_UI_DEMO_SHELL_PATH,
        absolutePath: `/tmp/shielded.xpi#${REACT_UI_DEMO_SHELL_PATH}`,
        source: '<html data-addon-ref="demo-addon"></html>',
      },
    ], surfaceAnchors);
    const surfaceScrubSurface = scanPackageProtectionSurfaceFiles([
      {
        relativePath: "manifest.json",
        absolutePath: "/tmp/surface-scrub.xpi#manifest.json",
        source: "1.2.3 https://example.com/update.json",
      },
      {
        relativePath: "bootstrap.js",
        absolutePath: "/tmp/surface-scrub.xpi#bootstrap.js",
        source: "String.fromCharCode(100,101,109,111)",
      },
      {
        relativePath: "prefs.js",
        absolutePath: "/tmp/surface-scrub.xpi#prefs.js",
        source: 'pref("extensions.zotero.crabc123-p0.p0", true);',
      },
      {
        relativePath: "content/preferences.xhtml",
        absolutePath: "/tmp/surface-scrub.xpi#content/preferences.xhtml",
        source: '<vbox id="crabc123-p0-root"></vbox>',
      },
      {
        relativePath: REACT_UI_DEMO_SHELL_PATH,
        absolutePath: `/tmp/surface-scrub.xpi#${REACT_UI_DEMO_SHELL_PATH}`,
        source: '<html data-addon-ref="tool"></html>',
      },
    ], surfaceAnchors);

    const comparison = summarizeSurfaceScrubComparison([
      buildVariantReport("shielded", "/* protected raw loader */", anchors, shieldedSurface),
      buildVariantReport("surface-scrub", "/* protected raw loader */", anchors, surfaceScrubSurface),
    ]);

    assert.equal(comparison.present, true);
    assert.equal(comparison.sameRawSurface, true);
    assert.equal(comparison.sameUnpackedSurface, false);
    assert.equal(comparison.unpackedAnchorDeltaCount, -1);
    assert.equal(comparison.residualFloorReached, true);
    assert.deepEqual(comparison.residualExposedFiles, ["manifest.json"]);
    assert.ok(comparison.residualAnchorIds.includes("addon-version-literal"));
    assert.ok(comparison.residualAnchorIds.includes("update-url-literal"));
    assert.equal(comparison.recommendedReading, "surface-scrub-floor-reached");
  });

  it("should attach surface-scrub comparison to the top-level audit report", () => {
    const anchors = buildPackageProtectionAuditAnchors({
      addonRef: "demo-addon",
      addonVersion: "1.2.3",
    });
    const surfaceAnchors = buildPackageProtectionUnpackedSurfaceAnchors({
      addonRef: "demo-addon",
      addonVersion: "1.2.3",
      updateURL: "https://example.com/update.json",
    });
    const shieldedSurface = scanPackageProtectionSurfaceFiles([
      {
        relativePath: "bootstrap.js",
        absolutePath: "/tmp/shielded.xpi#bootstrap.js",
        source: "demo-addon",
      },
      {
        relativePath: "prefs.js",
        absolutePath: "/tmp/shielded.xpi#prefs.js",
        source: 'pref("extensions.zotero.demo-addon.enabled", true);',
      },
      {
        relativePath: REACT_UI_DEMO_SHELL_PATH,
        absolutePath: `/tmp/shielded.xpi#${REACT_UI_DEMO_SHELL_PATH}`,
        source: '<html data-addon-ref="demo-addon"></html>',
      },
    ], surfaceAnchors);
    const surfaceScrubSurface = scanPackageProtectionSurfaceFiles([
      {
        relativePath: "manifest.json",
        absolutePath: "/tmp/surface-scrub.xpi#manifest.json",
        source: "1.2.3 https://example.com/update.json",
      },
      {
        relativePath: "bootstrap.js",
        absolutePath: "/tmp/surface-scrub.xpi#bootstrap.js",
        source: "String.fromCharCode(100,101,109,111)",
      },
      {
        relativePath: "prefs.js",
        absolutePath: "/tmp/surface-scrub.xpi#prefs.js",
        source: 'pref("extensions.zotero.crabc123-p0.p0", true);',
      },
      {
        relativePath: REACT_UI_DEMO_SHELL_PATH,
        absolutePath: `/tmp/surface-scrub.xpi#${REACT_UI_DEMO_SHELL_PATH}`,
        source: '<html data-addon-ref="tool"></html>',
      },
    ], surfaceAnchors);

    const report = summarizePackageProtectionAnchorAudit([
      buildVariantReport("plain", "plugin.api.agent.inspectItem() runAgentAction()", anchors),
      buildVariantReport("encrypted", "/* protected raw loader */", anchors),
      buildVariantReport("shielded", "/* protected raw loader */", anchors, shieldedSurface),
      buildVariantReport("surface-scrub", "/* protected raw loader */", anchors, surfaceScrubSurface),
    ], {
      anchors,
      variantOrder: ["plain", "encrypted", "shielded", "surface-scrub"],
    });

    assert.equal(report.surfaceScrubComparison.present, true);
    assert.equal(report.surfaceScrubComparison.sameRawSurface, true);
    assert.equal(report.surfaceScrubComparison.sameUnpackedSurface, false);
    assert.equal(report.surfaceScrubComparison.unpackedAnchorDeltaCount, -1);
    assert.equal(report.variants[3].unpackedSurface.totalAnchorCount, 2);
  });

  it("should attach unpacked surface summary to the top-level audit report", () => {
    const anchors = buildPackageProtectionAuditAnchors({
      addonRef: "demo-addon",
      addonVersion: "1.2.3",
    });
    const surfaceAnchors = buildPackageProtectionUnpackedSurfaceAnchors({
      addonRef: "demo-addon",
      addonVersion: "1.2.3",
    });
    const plainSurface = scanPackageProtectionSurfaceFiles([
      {
        relativePath: "content/preferences.js",
        absolutePath: "/tmp/plain/content/preferences.js",
        source: "Open Cleanroom Action Runtime Core demo-addon",
      },
    ], surfaceAnchors);
    const protectedSurface = scanPackageProtectionSurfaceFiles([
      {
        relativePath: "content/preferences.js",
        absolutePath: "/tmp/protected/content/preferences.js",
        source: "demo-addon",
      },
    ], surfaceAnchors);

    const report = summarizePackageProtectionAnchorAudit([
      buildVariantReport("plain", "plugin.api.agent.inspectItem()", anchors),
      buildVariantReport("encrypted", "/* protected raw loader */", anchors),
      buildVariantReport("shielded", "/* protected raw loader */", anchors),
    ], {
      anchors,
      sourceProxyReports: [
        buildSourceProxyReport("plain", "plugin.api.agent.inspectItem()", anchors, {
          buildRootPath: "/tmp/plain",
          targetFiles: [],
          ...plainSurface,
        }),
        buildSourceProxyReport("protected", "serviceRegistry", anchors, {
          buildRootPath: "/tmp/protected",
          targetFiles: [],
          ...protectedSurface,
        }),
      ],
    });

    assert.equal(report.unpackedSurface.present, true);
    assert.equal(report.unpackedSurface.totalAnchorCount, 1);
    assert.deepEqual(report.unpackedSurface.exposedFiles, ["content/preferences.js"]);
  });
});
