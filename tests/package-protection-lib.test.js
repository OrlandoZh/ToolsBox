import { webcrypto } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, assert, describe, it } from "./test-framework.js";
import {
  createCapabilityManifestDescriptorOverlay,
  protectBuildBundle,
  protectBundleSource,
  SHIELDED_PACKAGE_VARIANT,
  SHIELDED_DESCRIPTOR_BIND_PACKAGE_VARIANT,
  SHIELDED_JSCONFUSER_STRING_PACKAGE_VARIANT,
} from "../scripts/package-protection-lib.mjs";

const originalFromBase64Descriptor = Object.getOwnPropertyDescriptor(globalThis.Uint8Array, "fromBase64");
const originalSetFromBase64Descriptor = Object.getOwnPropertyDescriptor(globalThis.Uint8Array.prototype, "setFromBase64");

function createLoaderScope() {
  return {
    crypto: webcrypto,
    TextDecoder,
    atob(value) {
      return Buffer.from(value, "base64").toString("binary");
    },
    console,
    setTimeout,
    clearTimeout,
  };
}

function restoreBase64DecodeMethods() {
  if (originalFromBase64Descriptor) {
    Object.defineProperty(globalThis.Uint8Array, "fromBase64", originalFromBase64Descriptor);
  } else {
    delete globalThis.Uint8Array.fromBase64;
  }

  if (originalSetFromBase64Descriptor) {
    Object.defineProperty(globalThis.Uint8Array.prototype, "setFromBase64", originalSetFromBase64Descriptor);
  } else {
    delete globalThis.Uint8Array.prototype.setFromBase64;
  }
}

function configureBase64DecodeMethods({ fromBase64, setFromBase64 }) {
  if (typeof fromBase64 === "function") {
    Object.defineProperty(globalThis.Uint8Array, "fromBase64", {
      value: fromBase64,
      configurable: true,
      writable: true,
    });
  } else {
    delete globalThis.Uint8Array.fromBase64;
  }

  if (typeof setFromBase64 === "function") {
    Object.defineProperty(globalThis.Uint8Array.prototype, "setFromBase64", {
      value: setFromBase64,
      configurable: true,
      writable: true,
    });
  } else {
    delete globalThis.Uint8Array.prototype.setFromBase64;
  }
}

function createProtectedBootstrapScope() {
  const sourceCode = `
    (function (__global) {
      "use strict";
      async function bootstrapPlugin() {
        return "ready";
      }
      __global.bootstrapPlugin = bootstrapPlugin;
    })(this);
  `;

  const { loaderSource } = protectBundleSource(sourceCode, {
    addonRef: "demo-addon",
    addonVersion: "0.0.1",
    variant: SHIELDED_PACKAGE_VARIANT,
  });

  const scope = createLoaderScope();
  const loadProtectedBundle = new Function(`${loaderSource}\nreturn this.bootstrapPlugin;`);
  return {
    scope,
    bootstrap: loadProtectedBundle.call(scope),
  };
}

describe("Package Protection Lib", () => {
  afterEach(() => {
    delete globalThis.bootstrapPlugin;
    delete globalThis.__CLEANROOM_TEMPLATE_CONFIG__;
    delete globalThis.__CLEANROOM_TEMPLATE_OPTIONAL_BUNDLES__;
    delete globalThis.__CLEANROOM_PACKAGE_VARIANT__;
    delete globalThis.__CLEANROOM_SHIELDED_BUNDLE__;
    delete globalThis.__CLEANROOM_ENCRYPTED_BUNDLE__;
    restoreBase64DecodeMethods();
  });

  it("should keep protected bundle execution bound to the explicit loader scope", async () => {
    const sourceCode = `
      (function (__global) {
        "use strict";
        __global.__CLEANROOM_TEMPLATE_CONFIG__ = { addonRef: "demo-addon" };
        __global.__CLEANROOM_TEMPLATE_OPTIONAL_BUNDLES__ = { "react-ui": false };
        __global.__SCOPE_MARKERS__ = {
          globalThisIsScope: globalThis === __global,
          windowIsScope: window === __global,
          selfIsScope: self === __global
        };
        async function bootstrapPlugin() {
          __global.__BOOTSTRAP_MARKER__ = "started";
          return "ready";
        }
        __global.bootstrapPlugin = bootstrapPlugin;
      })(this);
    `;

    const { loaderSource, metadata } = protectBundleSource(sourceCode, {
      addonRef: "demo-addon",
      addonVersion: "0.0.1",
      variant: SHIELDED_PACKAGE_VARIANT,
    });

    const scope = createLoaderScope();
    const loadProtectedBundle = new Function(`${loaderSource}\nreturn this.bootstrapPlugin;`);
    const bootstrap = loadProtectedBundle.call(scope);

    assert.equal(typeof bootstrap, "function");
    assert.equal(typeof globalThis.bootstrapPlugin, "undefined");

    const result = await bootstrap.call(scope);

    assert.equal(result, "ready");
    assert.equal(scope.__BOOTSTRAP_MARKER__, "started");
    assert.deepEqual(scope.__CLEANROOM_TEMPLATE_CONFIG__, { addonRef: "demo-addon" });
    assert.deepEqual(scope.__CLEANROOM_TEMPLATE_OPTIONAL_BUNDLES__, { "react-ui": false });
    assert.deepEqual(scope.__SCOPE_MARKERS__, {
      globalThisIsScope: true,
      windowIsScope: true,
      selfIsScope: true,
    });
    assert.equal(scope.__CLEANROOM_PACKAGE_VARIANT__, SHIELDED_PACKAGE_VARIANT);
    assert.equal(scope.__CLEANROOM_SHIELDED_BUNDLE__, 1);
    assert.equal(scope.__CLEANROOM_TEMPLATE_RUNTIME__?.packageProtection?.active, true);
    assert.equal(scope.__CLEANROOM_TEMPLATE_RUNTIME__?.packageProtection?.variant, SHIELDED_PACKAGE_VARIANT);
    assert.equal(
      Number(scope.__CLEANROOM_TEMPLATE_RUNTIME__?.packageProtection?.bootstrapCallCount || 0) >= 1,
      true,
    );
    assert.equal(typeof globalThis.bootstrapPlugin, "undefined");
    assert.equal(typeof globalThis.__CLEANROOM_TEMPLATE_CONFIG__, "undefined");
    assert.equal(metadata.variant, SHIELDED_PACKAGE_VARIANT);
  });

  it("should expose a descriptor overlay resolver only for the descriptor-bind experiment variant", async () => {
    const sourceCode = `
      (function (__global) {
        "use strict";
        async function bootstrapPlugin() {
          return "ready";
        }
        __global.bootstrapPlugin = bootstrapPlugin;
      })(this);
    `;

    const descriptorOverlay = [{
      id: "host-actions",
      description: "overlay description",
      entrypoints: ["plugin.api.agent.runHostAction(actionId, payload)"],
      ownedBy: ["src/app/host-actions.js"],
      successSignals: ["Host actions return readiness details"],
    }];
    const { loaderSource, metadata } = protectBundleSource(sourceCode, {
      addonRef: "demo-addon",
      addonVersion: "0.0.1",
      variant: SHIELDED_DESCRIPTOR_BIND_PACKAGE_VARIANT,
      descriptorOverlay,
    });

    const scope = createLoaderScope();
    const loadProtectedBundle = new Function(`${loaderSource}\nreturn this.bootstrapPlugin;`);
    const bootstrap = loadProtectedBundle.call(scope);
    const result = await bootstrap.call(scope);
    const runtime = scope.__CLEANROOM_TEMPLATE_RUNTIME__;

    assert.equal(result, "ready");
    assert.equal(metadata.variant, SHIELDED_DESCRIPTOR_BIND_PACKAGE_VARIANT);
    assert.equal(metadata.descriptorOverlayPresent, true);
    assert.equal(metadata.descriptorOverlayEntryCount, 1);
    assert.equal(runtime?.packageProtection?.variant, SHIELDED_DESCRIPTOR_BIND_PACKAGE_VARIANT);
    assert.equal(typeof runtime?.packageProtection?.overlayResolver, "function");
    assert.deepEqual(runtime.packageProtection.overlayResolver(), descriptorOverlay);
    assert.equal(loaderSource.includes("overlay description"), false);
    assert.equal(loaderSource.includes("runHostAction"), false);
    assert.equal(loaderSource.includes("src/app/host-actions.js"), false);
  });

  it("should keep the js-confuser string experiment variant on the runtime marker without enabling overlay recovery", async () => {
    const sourceCode = `
      (function (__global) {
        "use strict";
        async function bootstrapPlugin() {
          return "ready";
        }
        __global.bootstrapPlugin = bootstrapPlugin;
      })(this);
    `;

    const { loaderSource, metadata } = protectBundleSource(sourceCode, {
      addonRef: "demo-addon",
      addonVersion: "0.0.1",
      variant: SHIELDED_JSCONFUSER_STRING_PACKAGE_VARIANT,
    });

    const scope = createLoaderScope();
    const loadProtectedBundle = new Function(`${loaderSource}\nreturn this.bootstrapPlugin;`);
    const bootstrap = loadProtectedBundle.call(scope);
    const result = await bootstrap.call(scope);

    assert.equal(result, "ready");
    assert.equal(metadata.variant, SHIELDED_JSCONFUSER_STRING_PACKAGE_VARIANT);
    assert.equal(scope.__CLEANROOM_PACKAGE_VARIANT__, SHIELDED_JSCONFUSER_STRING_PACKAGE_VARIANT);
    assert.equal(scope.__CLEANROOM_SHIELDED_BUNDLE__, 1);
    assert.equal(
      scope.__CLEANROOM_TEMPLATE_RUNTIME__?.packageProtection?.variant,
      SHIELDED_JSCONFUSER_STRING_PACKAGE_VARIANT,
    );
    assert.equal(typeof scope.__CLEANROOM_TEMPLATE_RUNTIME__?.packageProtection?.overlayResolver, "undefined");
  });

  it("should derive a minimal descriptor overlay from the source capability manifest", () => {
    const overlay = createCapabilityManifestDescriptorOverlay({
      config: {
        addonRef: "cleanroomtemplate",
      },
    });
    const hostActions = overlay.find((item) => item.id === "host-actions");

    assert.ok(Array.isArray(overlay));
    assert.ok(overlay.length >= 12);
    assert.equal(typeof hostActions?.description, "string");
    assert.ok(Array.isArray(hostActions?.entrypoints));
    assert.ok(Array.isArray(hostActions?.ownedBy));
    assert.ok(Array.isArray(hostActions?.successSignals));
    assert.equal(Object.prototype.hasOwnProperty.call(hostActions || {}, "label"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(hostActions || {}, "agentScenario"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(hostActions || {}, "zoteroScenarios"), false);
  });

  it("should preserve descriptor overlay data when protecting a build bundle on disk", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cleanroom-protect-build-"));
    const bundlePath = path.join(tempRoot, "bundle.js");
    const sourceCode = `
      (function (__global) {
        "use strict";
        async function bootstrapPlugin() {
          return "ready";
        }
        __global.bootstrapPlugin = bootstrapPlugin;
      })(this);
    `;
    const descriptorOverlay = [{
      id: "host-actions",
      description: "overlay description",
      entrypoints: ["plugin.api.agent.runHostAction(actionId, payload)"],
      ownedBy: ["src/app/host-actions.js"],
      successSignals: ["Host actions return readiness details"],
    }];

    try {
      await fs.writeFile(bundlePath, sourceCode, "utf-8");

      const metadata = await protectBuildBundle({
        bundlePath,
        addonRef: "demo-addon",
        addonVersion: "0.0.1",
        variant: SHIELDED_DESCRIPTOR_BIND_PACKAGE_VARIANT,
        descriptorOverlay,
      });
      const loaderSource = await fs.readFile(bundlePath, "utf-8");
      const scope = createLoaderScope();
      const loadProtectedBundle = new Function(`${loaderSource}\nreturn this.bootstrapPlugin;`);
      const bootstrap = loadProtectedBundle.call(scope);
      const result = await bootstrap.call(scope);

      assert.equal(result, "ready");
      assert.equal(metadata.variant, SHIELDED_DESCRIPTOR_BIND_PACKAGE_VARIANT);
      assert.equal(metadata.descriptorOverlayPresent, true);
      assert.equal(metadata.descriptorOverlayEntryCount, 1);
      assert.equal(typeof scope.__CLEANROOM_TEMPLATE_RUNTIME__?.packageProtection?.overlayResolver, "function");
      assert.deepEqual(scope.__CLEANROOM_TEMPLATE_RUNTIME__.packageProtection.overlayResolver(), descriptorOverlay);
      assert.equal(loaderSource.includes("overlay description"), false);
      assert.equal(loaderSource.includes("runHostAction"), false);
      assert.equal(loaderSource.includes("src/app/host-actions.js"), false);
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("should record atob as the decode method when typed-array fast paths are unavailable", async () => {
    configureBase64DecodeMethods({
      fromBase64: null,
      setFromBase64: null,
    });

    const { scope, bootstrap } = createProtectedBootstrapScope();
    const result = await bootstrap.call(scope);

    assert.equal(result, "ready");
    assert.equal(scope.__CLEANROOM_TEMPLATE_RUNTIME__?.packageProtection?.decodeMethod, "atob");
  });

  it("should prefer Uint8Array.fromBase64 when it is available", async () => {
    configureBase64DecodeMethods({
      fromBase64(base64) {
        return Uint8Array.from(Buffer.from(base64, "base64"));
      },
      setFromBase64: null,
    });

    const { scope, bootstrap } = createProtectedBootstrapScope();
    const result = await bootstrap.call(scope);

    assert.equal(result, "ready");
    assert.equal(scope.__CLEANROOM_TEMPLATE_RUNTIME__?.packageProtection?.decodeMethod, "fromBase64");
  });

  it("should fall back to Uint8Array.prototype.setFromBase64 when the static helper is unavailable", async () => {
    configureBase64DecodeMethods({
      fromBase64: null,
      setFromBase64(base64) {
        const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
        this.set(bytes);
        return {
          read: base64.length,
          written: bytes.length,
        };
      },
    });

    const { scope, bootstrap } = createProtectedBootstrapScope();
    const result = await bootstrap.call(scope);

    assert.equal(result, "ready");
    assert.equal(scope.__CLEANROOM_TEMPLATE_RUNTIME__?.packageProtection?.decodeMethod, "setFromBase64");
  });

  it("should segment protected payload constants instead of embedding contiguous base64 blobs", () => {
    const sourceCode = `
      (function (__global) {
        async function bootstrapPlugin() {
          return "ready";
        }
        __global.bootstrapPlugin = bootstrapPlugin;
      })(this);
    `;

    const { loaderSource } = protectBundleSource(sourceCode, {
      addonRef: "demo-addon",
      addonVersion: "0.0.1",
      variant: SHIELDED_PACKAGE_VARIANT,
    });

    assert.ok(loaderSource.includes("var __payloadSegments = ["));
    assert.ok(loaderSource.includes("var __keySegments = ["));
    assert.ok(loaderSource.includes("var __ivSegments = ["));
    assert.ok(loaderSource.includes("function __joinSegments(segments)"));
    assert.equal(loaderSource.includes("var __payloadBase64 = '"), false);
    assert.equal(loaderSource.includes("var __keyBase64 = '"), false);
    assert.equal(loaderSource.includes("var __ivBase64 = '"), false);
  });

  it("should avoid embedding descriptive bundle metadata in the protected loader source", () => {
    const sourceCode = `
      (function (__global) {
        async function bootstrapPlugin() {
          return "ready";
        }
        __global.bootstrapPlugin = bootstrapPlugin;
      })(this);
    `;

    const { loaderSource } = protectBundleSource(sourceCode, {
      addonRef: "demo-addon",
      addonVersion: "9.9.9",
      generatedAt: "2026-04-16T00:00:00.000Z",
      variant: SHIELDED_PACKAGE_VARIANT,
    });

    assert.equal(loaderSource.includes("demo-addon"), false);
    assert.equal(loaderSource.includes("9.9.9"), false);
    assert.equal(loaderSource.includes("2026-04-16T00:00:00.000Z"), false);
    assert.equal(loaderSource.includes("sourceSHA256"), false);
  });
});
