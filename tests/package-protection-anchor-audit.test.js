import { describe, it, assert } from "./test-framework.js";
import {
  buildPackageProtectionAuditAnchors,
  parsePackageProtectionAnchorAuditArgs,
  scanBundleAnchors,
  summarizePackageProtectionAnchorAudit,
  summarizePackageProtectionSourceProxy,
} from "../scripts/package-protection-anchor-audit.mjs";

function buildVariantReport(variant, source, anchors) {
  const scan = scanBundleAnchors(source, anchors);
  return {
    variant,
    bundlePath: `/tmp/${variant}.js`,
    bundleSizeBytes: source.length,
    xpiPath: `/tmp/${variant}.xpi`,
    xpiSizeBytes: 2048,
    ...scan,
  };
}

function buildSourceProxyReport(mode, source, anchors) {
  const scan = scanBundleAnchors(source, anchors);
  return {
    mode,
    bundlePath: `/tmp/${mode}-proxy.js`,
    bundleSizeBytes: source.length,
    ...scan,
  };
}

describe("Package Protection Anchor Audit", () => {
  it("should parse --variant and default to all variants", () => {
    const allOptions = parsePackageProtectionAnchorAuditArgs([]);
    const shieldedOptions = parsePackageProtectionAnchorAuditArgs(["--variant", "shielded"]);

    assert.deepEqual(allOptions.variants, ["plain", "encrypted", "shielded"]);
    assert.deepEqual(shieldedOptions.variants, ["shielded"]);
  });

  it("should build dynamic anchors from addon config", () => {
    const anchors = buildPackageProtectionAuditAnchors({
      addonRef: "demo-addon",
      addonVersion: "1.2.3",
    });

    const ids = anchors.map((anchor) => anchor.id);
    assert.ok(ids.includes("addon-ref-literal"));
    assert.ok(ids.includes("addon-version-literal"));
    assert.ok(ids.includes("plugin-api-agent-surface"));
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
        "plugin.api.agent.inspectItem() runAgentAction() entrypoints ownedBy successSignals serviceRegistry optionalBundles agent-runtime ai-service",
        anchors,
      ),
      buildSourceProxyReport(
        "protected",
        "serviceRegistry optionalBundles",
        anchors,
      ),
    ]);

    assert.equal(sourceProxy.present, true);
    assert.equal(sourceProxy.reducedAnchorCount >= 5, true);
    assert.equal(sourceProxy.reducedMatchCount >= 5, true);
    assert.ok(sourceProxy.removedAnchorIds.includes("plugin-api-agent-surface"));
    assert.ok(sourceProxy.removedAnchorIds.includes("optional-agent-runtime"));
    assert.ok(sourceProxy.remainingAnchorIds.includes("service-registry"));
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
});
