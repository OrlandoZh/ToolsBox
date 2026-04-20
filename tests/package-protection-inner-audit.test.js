import { describe, it, assert } from "./test-framework.js";
import { protectBundleSource } from "../scripts/package-protection-lib.mjs";
import {
  PACKAGE_PROTECTION_PROXY_LLM_LEVELS,
  extractShieldedInnerBundleArtifacts,
  parsePackageProtectionInnerAuditArgs,
  renderPackageProtectionInnerAuditMarkdown,
  summarizePackageProtectionInnerAudit,
  summarizePackageProtectionInnerVariant,
} from "../scripts/package-protection-inner-audit.mjs";

const BASE_CONFIG = Object.freeze({
  addonRef: "cleanroomtemplate",
  addonVersion: "0.1.0",
});

function buildLoaderSource(sourceCode, options = {}) {
  return protectBundleSource(sourceCode, {
    addonRef: BASE_CONFIG.addonRef,
    addonVersion: BASE_CONFIG.addonVersion,
    variant: options.variant || "shielded",
    descriptorOverlay: options.descriptorOverlay || null,
  }).loaderSource;
}

describe("Package Protection Inner Audit", () => {
  it("should parse variant aliases and package-first flag", () => {
    const options = parsePackageProtectionInnerAuditArgs([
      "--variant",
      "jsconfuser-string",
      "--channel",
      "beta",
      "--no-package-first",
    ]);

    assert.equal(options.variant, "shielded-jsconfuser-string");
    assert.equal(options.channel, "beta");
    assert.equal(options.packageFirst, false);
  });

  it("should accept pref-bridge as an inner-audit experiment variant alias", () => {
    const options = parsePackageProtectionInnerAuditArgs([
      "--variant",
      "pref-bridge",
      "--channel",
      "stable",
    ]);

    assert.equal(options.variant, "shielded-pref-bridge");
    assert.equal(options.channel, "stable");
  });

  it("should accept surface-scrub as an inner-audit experiment variant alias", () => {
    const options = parsePackageProtectionInnerAuditArgs([
      "--variant",
      "surface-scrub",
      "--channel",
      "stable",
    ]);

    assert.equal(options.variant, "shielded-surface-scrub");
    assert.equal(options.channel, "stable");
  });

  it("should accept wasm-entitlement-legacy as an inner-audit experiment variant alias", () => {
    const options = parsePackageProtectionInnerAuditArgs([
      "--variant",
      "wasm-entitlement-legacy",
      "--channel",
      "stable",
    ]);

    assert.equal(options.variant, "shielded-surface-scrub-wasm-entitlement-legacy");
    assert.equal(options.channel, "stable");
  });

  it("should capture decrypted inner source and descriptor overlay without executing payload", async () => {
    const loaderSource = buildLoaderSource(`
globalThis.__INNER_EXECUTED__ = true;
globalThis.bootstrapPlugin = async function bootstrapPlugin() {
  return "ok";
};
`, {
      variant: "shielded-descriptor-bind",
      descriptorOverlay: [
        {
          id: "runtime-bridge-report",
          ownedBy: ["src/app/plugin.js"],
          entrypoints: ["bootstrapPlugin"],
          successSignals: ["reader-ready"],
        },
      ],
    });

    const extracted = await extractShieldedInnerBundleArtifacts(loaderSource, {
      filename: "descriptor-bind-loader.js",
    });

    assert.equal(extracted.decryptedSource.includes("__INNER_EXECUTED__"), true);
    assert.equal(extracted.runtimeVariant, "shielded-descriptor-bind");
    assert.equal(extracted.packageProtection.variant, "shielded-descriptor-bind");
    assert.equal(Array.isArray(extracted.overlayValue), true);
    assert.equal(extracted.overlayValue.length, 1);
    assert.equal(extracted.overlayValue[0].id, "runtime-bridge-report");
    assert.deepEqual(extracted.overlayValue[0].ownedBy, ["src/app/plugin.js"]);
    assert.deepEqual(extracted.overlayValue[0].entrypoints, ["bootstrapPlugin"]);
    assert.deepEqual(extracted.overlayValue[0].successSignals, ["reader-ready"]);
  });

  it("should rate inner bundle readability conservatively", async () => {
    const loaderOnly = await extractShieldedInnerBundleArtifacts(buildLoaderSource(`
globalThis.bootstrapPlugin = async function bootstrapPlugin() {
  return "ok";
};
`));
    const highLevel = await extractShieldedInnerBundleArtifacts(buildLoaderSource(`
globalThis.bootstrapPlugin = async function bootstrapPlugin() {
  return "ok";
};
const serviceRegistry = {};
function runHostAction() {
  return serviceRegistry;
}
const optionalBundles = ["agent-runtime"];
`));
    const readableModule = await extractShieldedInnerBundleArtifacts(buildLoaderSource(`
globalThis.bootstrapPlugin = async function bootstrapPlugin() {
  return "ok";
};
const descriptor = "src/app/plugin.js";
`));

    const loaderOnlySummary = summarizePackageProtectionInnerVariant({
      variant: "shielded",
      extractedArtifacts: loaderOnly,
      config: BASE_CONFIG,
    });
    const highLevelSummary = summarizePackageProtectionInnerVariant({
      variant: "shielded",
      extractedArtifacts: highLevel,
      config: BASE_CONFIG,
    });
    const readableModuleSummary = summarizePackageProtectionInnerVariant({
      variant: "shielded",
      extractedArtifacts: readableModule,
      config: BASE_CONFIG,
    });

    assert.equal(loaderOnlySummary.suggestedProxyLLMRating, PACKAGE_PROTECTION_PROXY_LLM_LEVELS[0]);
    assert.equal(highLevelSummary.suggestedProxyLLMRating, PACKAGE_PROTECTION_PROXY_LLM_LEVELS[1]);
    assert.equal(readableModuleSummary.suggestedProxyLLMRating, PACKAGE_PROTECTION_PROXY_LLM_LEVELS[2]);
  });

  it("should render a compact markdown summary", () => {
    const report = summarizePackageProtectionInnerAudit({
      channel: "stable",
      variants: [
        {
          variant: "shielded",
          status: "passed",
          statusLabel: "通过",
          summary: "base shielded",
          suggestedProxyLLMRating: "high-level-architecture",
          packageProtection: {
            decodeMethod: "fromBase64",
            prepareDurationMs: 70,
          },
          overlay: {
            present: false,
            entryCount: 0,
          },
          innerSemanticScan: {
            totalAnchorCount: 2,
            presentAnchors: [
              {
                id: "run-agent-action",
                label: "runAgentAction",
                category: "inner-bundle-semantics",
                count: 1,
              },
            ],
          },
          moduleRecoveryScan: {
            totalAnchorCount: 0,
            presentAnchors: [],
          },
        },
      ],
    });

    const markdown = renderPackageProtectionInnerAuditMarkdown(report);
    assert.equal(markdown.includes("Package Protection Inner Audit"), true);
    assert.equal(markdown.includes("high-level-architecture"), true);
    assert.equal(markdown.includes("runAgentAction"), true);
  });
});
