import { describe, it, assert } from "./test-framework.js";
import {
  buildShieldedObfuscationOptions,
  obfuscateBundleSource,
  SHIELDED_BUNDLE_OBFUSCATION_STAGE,
  SHIELDED_LOADER_OBFUSCATION_STAGE,
  SHIELDED_PACKAGE_VARIANT,
} from "../scripts/package-obfuscation-lib.mjs";

describe("Package Obfuscation Lib", () => {
  it("should keep shielded bundle obfuscation options compatible with current runtime expectations", () => {
    const options = buildShieldedObfuscationOptions({ seed: 1 });

    assert.equal(options.selfDefending, false);
    assert.equal(options.debugProtection, false);
    assert.equal(options.disableConsoleOutput, false);
    assert.equal(options.renameGlobals, false);
    assert.equal(options.renameProperties, false);
    assert.equal(options.seed, 1);
    assert.equal(options.unicodeEscapeSequence, undefined);
    assert.ok(Array.isArray(options.reservedNames));
    assert.ok(options.reservedNames.includes("^bootstrapPlugin$"));
    assert.ok(Array.isArray(options.reservedStrings));
    assert.ok(options.reservedStrings.includes("bootstrapPlugin"));
  });

  it("should harden protected loader obfuscation without enabling hostile runtime options", () => {
    const options = buildShieldedObfuscationOptions({
      seed: 7,
      stage: SHIELDED_LOADER_OBFUSCATION_STAGE,
    });

    assert.equal(options.selfDefending, false);
    assert.equal(options.debugProtection, false);
    assert.equal(options.renameGlobals, false);
    assert.equal(options.renameProperties, false);
    assert.equal(options.seed, 7);
    assert.equal(options.controlFlowFlattening, false);
    assert.equal(options.splitStrings, false);
    assert.equal(options.stringArray, true);
    assert.equal(options.stringArrayCallsTransform, false);
    assert.equal(options.stringArrayThreshold, 1);
    assert.equal(options.stringArrayWrappersCount, 1);
    assert.equal(options.transformObjectKeys, false);
    assert.equal(options.unicodeEscapeSequence, undefined);
  });

  it("should obfuscate bundle source without losing the bootstrap entry name", () => {
    const sourceCode = `
      (function (__global) {
        const helperMessage = "top-secret";
        async function bootstrapPlugin() {
          return helperMessage;
        }
        __global.bootstrapPlugin = bootstrapPlugin;
      })(this);
    `;

    const result = obfuscateBundleSource(sourceCode, { seed: 1 });

    assert.equal(result.metadata.variant, SHIELDED_PACKAGE_VARIANT);
    assert.equal(result.metadata.stage, SHIELDED_BUNDLE_OBFUSCATION_STAGE);
    assert.ok(result.obfuscatedSource !== sourceCode);
    assert.ok(result.obfuscatedSource.includes("bootstrapPlugin"));
    assert.equal(result.obfuscatedSource.includes("helperMessage"), false);
    assert.equal(result.obfuscatedSource.includes("top-secret"), false);
    assert.ok(result.metadata.sourceBytes > 0);
    assert.ok(result.metadata.obfuscatedBytes > 0);
    assert.ok(result.metadata.sourceSHA256 !== result.metadata.obfuscatedSHA256);
  });

  it("should obfuscate the protected loader layer without leaving plain payload strings behind", () => {
    const sourceCode = `
      (function (__global) {
        var payload = "QUJDREVGRw==";
        var marker = "__CLEANROOM_SHIELDED_BUNDLE__";
        async function bootstrapPlugin() {
          return payload + marker;
        }
        __global.bootstrapPlugin = bootstrapPlugin;
      })(this);
    `;

    const result = obfuscateBundleSource(sourceCode, {
      seed: 1,
      stage: SHIELDED_LOADER_OBFUSCATION_STAGE,
    });

    assert.equal(result.metadata.variant, SHIELDED_PACKAGE_VARIANT);
    assert.equal(result.metadata.stage, SHIELDED_LOADER_OBFUSCATION_STAGE);
    assert.ok(result.obfuscatedSource !== sourceCode);
    assert.ok(result.obfuscatedSource.includes("bootstrapPlugin"));
    assert.ok(result.obfuscatedSource.includes("__CLEANROOM_SHIELDED_BUNDLE__"));
    assert.equal(result.obfuscatedSource.includes("QUJDREVGRw=="), false);
    assert.equal(result.obfuscatedSource.includes("payload"), false);
  });
});
