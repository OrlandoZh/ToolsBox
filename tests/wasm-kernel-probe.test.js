import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, assert } from "./test-framework.js";
import { createWasmKernelProbe } from "../src/features/wasm-kernel-probe.js";
import {
  WASM_KERNEL_PROBE_PATH,
  WASM_KERNEL_PROBE_WORKER_PATH,
} from "../src/utils/optional-bundle-paths.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const wasmProbePath = path.join(projectRoot, "addon-static", ...WASM_KERNEL_PROBE_PATH.split("/"));
const wasmProbeBytes = fs.readFileSync(wasmProbePath);
const wasmProbeBytesLength = wasmProbeBytes.byteLength;
const chromeWasmProbeURL = `chrome://cleanroomtemplate/${WASM_KERNEL_PROBE_PATH}`;
const chromeWasmProbeWorkerURL = `chrome://cleanroomtemplate/${WASM_KERNEL_PROBE_WORKER_PATH}`;
const EXPECTED_WASM_EXPORTS = ["add", "finalize", "mix", "seed"];
const DEFAULT_UNLOCK_BUNDLE_SEED = "cleanroom-stage2-shadow-seed-v1";
const DEFAULT_UNLOCK_OVERLAY_VERSION = "descriptor-overlay-v1";
const DEFAULT_UNLOCK_DERIVATION_VERSION = "host-unlock-v1-shadow";

function toArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function toUint32(value) {
  return Number(value >>> 0);
}

function formatDigestHex(value) {
  return toUint32(value).toString(16).padStart(8, "0");
}

function computeExpectedDigest(text, seed = 0x811c9dc5) {
  const bytes = new TextEncoder().encode(String(text || ""));
  let state = toUint32(seed);
  for (const byte of bytes) {
    state = toUint32(Math.imul(state ^ byte, 16777619));
  }
  const digestUint32 = toUint32(Math.imul(state ^ bytes.byteLength, 16777619));
  return {
    textLength: String(text || "").length,
    byteLength: bytes.byteLength,
    seedUint32: toUint32(seed),
    digestUint32,
    digestHex: formatDigestHex(digestUint32),
  };
}

function normalizeUnlockHostBinding(summary = null) {
  const normalized = {
    signalVersion: 1,
    available: false,
    profileHash: null,
    schemaBucket: null,
    zoteroVersionBucket: null,
    profileBasenameBucket: null,
    dataDirHash: null,
    dbAvailable: false,
    noncePresent: false,
    nonceSource: "unavailable",
    nonceHash: null,
  };

  if (!summary || typeof summary !== "object") {
    return normalized;
  }

  normalized.signalVersion = Number(summary.signalVersion || 1);
  normalized.profileHash = summary.profileHash ? String(summary.profileHash).trim() : null;
  normalized.schemaBucket = summary.schemaBucket ? String(summary.schemaBucket).trim() : null;
  normalized.zoteroVersionBucket = summary.zoteroVersionBucket ? String(summary.zoteroVersionBucket).trim() : null;
  normalized.profileBasenameBucket = summary.profileBasenameBucket ? String(summary.profileBasenameBucket).trim() : null;
  normalized.dataDirHash = summary.dataDirHash ? String(summary.dataDirHash).trim() : null;
  normalized.dbAvailable = Boolean(summary.dbAvailable);
  normalized.noncePresent = Boolean(summary.noncePresent);
  normalized.nonceSource = summary.nonceSource ? String(summary.nonceSource).trim() : "unavailable";
  normalized.nonceHash = summary.nonceHash ? String(summary.nonceHash).trim() : null;
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

function buildUnlockNonceMaterial(hostBinding = null) {
  const normalizedHostBinding = normalizeUnlockHostBinding(hostBinding);
  if (normalizedHostBinding.nonceHash) {
    return normalizedHostBinding.nonceHash;
  }
  if (normalizedHostBinding.noncePresent) {
    return `nonce-present:${normalizedHostBinding.nonceSource}`;
  }
  return "nonce-missing";
}

function buildUnlockCanonicalInput({
  derivationVersion = DEFAULT_UNLOCK_DERIVATION_VERSION,
  bundleSeed = DEFAULT_UNLOCK_BUNDLE_SEED,
  overlayVersion = DEFAULT_UNLOCK_OVERLAY_VERSION,
  hostBinding = null,
} = {}) {
  const normalizedHostBinding = normalizeUnlockHostBinding(hostBinding);
  return [
    `derivationVersion=${derivationVersion}`,
    `bundleSeed=${bundleSeed}`,
    `overlayVersion=${overlayVersion}`,
    `signalVersion=${Number(normalizedHostBinding.signalVersion || 1)}`,
    `profileHash=${normalizedHostBinding.profileHash || "-"}`,
    `schemaBucket=${normalizedHostBinding.schemaBucket || "-"}`,
    `zoteroVersionBucket=${normalizedHostBinding.zoteroVersionBucket || "-"}`,
    `profileBasenameBucket=${normalizedHostBinding.profileBasenameBucket || "-"}`,
    `dataDirHash=${normalizedHostBinding.dataDirHash || "-"}`,
    `dbAvailable=${normalizedHostBinding.dbAvailable ? "1" : "0"}`,
    `noncePresent=${normalizedHostBinding.noncePresent ? "1" : "0"}`,
    `nonceMaterial=${buildUnlockNonceMaterial(normalizedHostBinding)}`,
  ].join("\n");
}

function computeExpectedUnlockDerivation({
  bundleSeed = DEFAULT_UNLOCK_BUNDLE_SEED,
  overlayVersion = DEFAULT_UNLOCK_OVERLAY_VERSION,
  hostBinding = null,
  seed = 0x811c9dc5,
} = {}) {
  const normalizedHostBinding = normalizeUnlockHostBinding(hostBinding);
  const canonicalInput = buildUnlockCanonicalInput({
    bundleSeed,
    overlayVersion,
    hostBinding: normalizedHostBinding,
  });
  const inputDigest = computeExpectedDigest(canonicalInput, seed);
  const stage2Digest = computeExpectedDigest(`stage2\n${canonicalInput}`, inputDigest.digestUint32);
  const unlockToken = computeExpectedDigest(`unlock\n${canonicalInput}\nstage2=${stage2Digest.digestHex}`, stage2Digest.digestUint32);
  return {
    derivationVersion: DEFAULT_UNLOCK_DERIVATION_VERSION,
    bundleSeed,
    overlayVersion,
    hostBinding: normalizedHostBinding,
    canonicalInputLength: canonicalInput.length,
    inputDigest,
    stage2Digest,
    unlockToken,
  };
}

function assertTimingSnapshot(timing, label) {
  assert.equal(typeof timing?.initDurationMs, "number", `${label}.initDurationMs should be numeric`);
  assert.equal(typeof timing?.invokeDurationMs, "number", `${label}.invokeDurationMs should be numeric`);
  assert.equal(typeof timing?.totalDurationMs, "number", `${label}.totalDurationMs should be numeric`);
  assert.ok(timing.initDurationMs >= 0, `${label}.initDurationMs should be non-negative`);
  assert.ok(timing.invokeDurationMs >= 0, `${label}.invokeDurationMs should be non-negative`);
  assert.ok(timing.totalDurationMs >= 0, `${label}.totalDurationMs should be non-negative`);
}

class FakeProbeWorker {
  constructor(url) {
    this.url = url;
    this.onmessage = null;
    this.onerror = null;
    this.terminated = false;
  }

  postMessage(message) {
    queueMicrotask(() => {
      if (this.terminated) {
        return;
      }

      if (message.type === "INIT") {
        this.onmessage?.({
          data: {
            type: "READY",
            wasmURL: String(message.wasmURL || `${String(message.rootURI || "").replace(/\/+$/u, "")}/${String(message.wasmRelativePath || "").replace(/^\/+/u, "")}`),
            bytesLength: wasmProbeBytesLength,
            exportNames: EXPECTED_WASM_EXPORTS,
          },
        });
        return;
      }

      if (message.type === "PROBE") {
        const left = Number(message.payload?.left || 0);
        const right = Number(message.payload?.right || 0);
        this.onmessage?.({
          data: {
            type: "PROBE_RESULT",
            requestID: message.requestID,
            ok: true,
            payload: {
              left,
              right,
              sum: left + right,
              wasmURL: chromeWasmProbeURL,
              workerURL: this.url,
              bytesLength: wasmProbeBytesLength,
              exportNames: EXPECTED_WASM_EXPORTS,
            },
          },
        });
        return;
      }

      if (message.type === "DIGEST") {
        const expected = computeExpectedDigest(String(message.payload?.text || ""));
        this.onmessage?.({
          data: {
            type: "DIGEST_RESULT",
            requestID: message.requestID,
            ok: true,
            payload: {
              ...expected,
              wasmURL: chromeWasmProbeURL,
              workerURL: this.url,
              bytesLength: wasmProbeBytesLength,
              exportNames: EXPECTED_WASM_EXPORTS,
            },
          },
        });
        return;
      }

      if (message.type === "UNLOCK") {
        const expected = computeExpectedUnlockDerivation({
          bundleSeed: message.payload?.bundleSeed,
          overlayVersion: message.payload?.overlayVersion,
          hostBinding: message.payload?.hostBinding,
          seed: message.payload?.seed === null || message.payload?.seed === undefined
            ? 0x811c9dc5
            : Number(message.payload.seed),
        });
        this.onmessage?.({
          data: {
            type: "UNLOCK_RESULT",
            requestID: message.requestID,
            ok: true,
            payload: {
              derivationVersion: expected.derivationVersion,
              bundleSeed: expected.bundleSeed,
              overlayVersion: expected.overlayVersion,
              hostBinding: expected.hostBinding,
              activationRequirements: ["profileHash", "dbAvailable", "noncePresent"],
              activationMissing: [],
              activationSatisfied: true,
              shadowWouldApply: true,
              canonicalInputLength: expected.canonicalInputLength,
              inputDigestUint32: expected.inputDigest.digestUint32,
              inputDigestHex: expected.inputDigest.digestHex,
              stage2DigestUint32: expected.stage2Digest.digestUint32,
              stage2DigestHex: expected.stage2Digest.digestHex,
              unlockTokenUint32: expected.unlockToken.digestUint32,
              unlockTokenHex: expected.unlockToken.digestHex,
              wasmURL: chromeWasmProbeURL,
              workerURL: this.url,
              bytesLength: wasmProbeBytesLength,
              exportNames: EXPECTED_WASM_EXPORTS,
            },
          },
        });
      }
    });
  }

  terminate() {
    this.terminated = true;
  }
}

describe("Wasm Kernel Probe", () => {
  it("should load the checked-in wasm probe asset on the main thread", async () => {
    const requestedURLs = [];
    const probe = createWasmKernelProbe({
      config: {
        addonRef: "cleanroomtemplate",
      },
      rootURI: "jar:file:///tmp/cleanroom.xpi!/",
      fetchImpl: async (url) => {
        requestedURLs.push(url);
        return {
          ok: true,
          async arrayBuffer() {
            return toArrayBuffer(wasmProbeBytes);
          },
        };
      },
      WorkerCtor: FakeProbeWorker,
    });

    const result = await probe.runProbe({
      mode: "main-thread",
      left: 7,
      right: 9,
    });

    assert.equal(requestedURLs[0], `jar:file:///tmp/cleanroom.xpi!/${WASM_KERNEL_PROBE_PATH}`);
    assert.equal(result.ok, true);
    assert.equal(result.mode, "main-thread");
    assert.equal(result.mainThread.ok, true);
    assert.equal(result.mainThread.sum, 16);
    assert.deepEqual(result.mainThread.exportNames, EXPECTED_WASM_EXPORTS);
    assert.equal(result.mainThread.cacheHit, false);
    assertTimingSnapshot(result.mainThread.timing, "mainThread.timing");
    assert.equal(
      result.mainThread.timing.totalDurationMs,
      result.mainThread.timing.initDurationMs + result.mainThread.timing.invokeDurationMs,
    );
    assert.equal(result.worker, null);
    assert.equal(result.timingSummary.transportCount, 1);
    assert.equal(result.timingSummary.slowestTransport, "main-thread");
    assertTimingSnapshot(result.timingSummary, "timingSummary");
  });

  it("should cross-check worker and main-thread probe results", async () => {
    const probe = createWasmKernelProbe({
      config: {
        addonRef: "cleanroomtemplate",
      },
      rootURI: "jar:file:///tmp/cleanroom.xpi!/",
      fetchImpl: async () => {
        return {
          ok: true,
          async arrayBuffer() {
            return toArrayBuffer(wasmProbeBytes);
          },
        };
      },
      WorkerCtor: FakeProbeWorker,
    });

    const result = await probe.runProbe({
      mode: "both",
      left: 11,
      right: 31,
    });

    assert.equal(result.ok, true);
    assert.equal(result.mainThread.sum, 42);
    assert.equal(result.worker.sum, 42);
    assert.equal(result.worker.workerURL, chromeWasmProbeWorkerURL);
    assert.equal(result.worker.wasmURL, chromeWasmProbeURL);
    assert.deepEqual(result.mainThread.exportNames, EXPECTED_WASM_EXPORTS);
    assert.deepEqual(result.worker.exportNames, EXPECTED_WASM_EXPORTS);
    assert.equal(result.consistentAcrossTransports, true);
    assert.deepEqual(result.errors, []);
    assertTimingSnapshot(result.mainThread.timing, "mainThread.timing");
    assertTimingSnapshot(result.worker.timing, "worker.timing");
    assert.equal(
      result.mainThread.timing.totalDurationMs,
      result.mainThread.timing.initDurationMs + result.mainThread.timing.invokeDurationMs,
    );
    assert.equal(
      result.worker.timing.totalDurationMs,
      result.worker.timing.initDurationMs + result.worker.timing.invokeDurationMs,
    );
    assert.equal(result.timingSummary.transportCount, 2);
    assert.ok(["main-thread", "worker"].includes(result.timingSummary.slowestTransport));
    assertTimingSnapshot(result.timingSummary, "timingSummary");
  });

  it("should derive a deterministic digest on the main thread", async () => {
    const probe = createWasmKernelProbe({
      config: {
        addonRef: "cleanroomtemplate",
      },
      rootURI: "jar:file:///tmp/cleanroom.xpi!/",
      fetchImpl: async () => {
        return {
          ok: true,
          async arrayBuffer() {
            return toArrayBuffer(wasmProbeBytes);
          },
        };
      },
      WorkerCtor: FakeProbeWorker,
    });

    const expected = computeExpectedDigest("cleanroom");
    const result = await probe.deriveDigest({
      mode: "main-thread",
      text: "cleanroom",
    });

    assert.equal(result.ok, true);
    assert.equal(result.mainThread.ok, true);
    assert.equal(result.mainThread.digestHex, expected.digestHex);
    assert.equal(result.mainThread.digestUint32, expected.digestUint32);
    assert.equal(result.mainThread.byteLength, expected.byteLength);
    assert.deepEqual(result.mainThread.exportNames, EXPECTED_WASM_EXPORTS);
    assert.equal(result.worker, null);
    assertTimingSnapshot(result.mainThread.timing, "mainThread.timing");
    assertTimingSnapshot(result.timingSummary, "timingSummary");
  });

  it("should cross-check worker and main-thread digest results", async () => {
    const probe = createWasmKernelProbe({
      config: {
        addonRef: "cleanroomtemplate",
      },
      rootURI: "jar:file:///tmp/cleanroom.xpi!/",
      fetchImpl: async () => {
        return {
          ok: true,
          async arrayBuffer() {
            return toArrayBuffer(wasmProbeBytes);
          },
        };
      },
      WorkerCtor: FakeProbeWorker,
    });

    const text = "Zotero 9 / 条目";
    const expected = computeExpectedDigest(text);
    const result = await probe.deriveDigest({
      mode: "both",
      text,
    });

    assert.equal(result.ok, true);
    assert.equal(result.mainThread.digestHex, expected.digestHex);
    assert.equal(result.worker.digestHex, expected.digestHex);
    assert.equal(result.mainThread.digestUint32, expected.digestUint32);
    assert.equal(result.worker.digestUint32, expected.digestUint32);
    assert.equal(result.mainThread.workerURL, undefined);
    assert.equal(result.worker.workerURL, chromeWasmProbeWorkerURL);
    assert.equal(result.worker.wasmURL, chromeWasmProbeURL);
    assert.equal(result.consistentAcrossTransports, true);
    assert.deepEqual(result.mainThread.exportNames, EXPECTED_WASM_EXPORTS);
    assert.deepEqual(result.worker.exportNames, EXPECTED_WASM_EXPORTS);
    assertTimingSnapshot(result.mainThread.timing, "mainThread.timing");
    assertTimingSnapshot(result.worker.timing, "worker.timing");
    assertTimingSnapshot(result.timingSummary, "timingSummary");
  });

  it("should derive a deterministic shadow unlock token on the main thread", async () => {
    const probe = createWasmKernelProbe({
      config: {
        addonRef: "cleanroomtemplate",
      },
      rootURI: "jar:file:///tmp/cleanroom.xpi!/",
      fetchImpl: async () => {
        return {
          ok: true,
          async arrayBuffer() {
            return toArrayBuffer(wasmProbeBytes);
          },
        };
      },
      WorkerCtor: FakeProbeWorker,
    });

    const hostBinding = {
      signalVersion: 1,
      profileHash: "sha256:profile-sample",
      schemaBucket: "120-129",
      zoteroVersionBucket: "9.x",
      profileBasenameBucket: "sha256:basename-sample",
      dataDirHash: "sha256:data-sample",
      dbAvailable: true,
      noncePresent: true,
      nonceSource: "existing",
      nonceHash: "sha256:nonce-sample",
    };
    const expected = computeExpectedUnlockDerivation({
      hostBinding,
    });
    const result = await probe.deriveUnlockToken({
      mode: "main-thread",
      bundleSeed: DEFAULT_UNLOCK_BUNDLE_SEED,
      overlayVersion: DEFAULT_UNLOCK_OVERLAY_VERSION,
      hostBinding,
    });

    assert.equal(result.ok, true);
    assert.equal(result.activationSatisfied, true);
    assert.deepEqual(result.activationMissing, []);
    assert.equal(result.mainThread.ok, true);
    assert.equal(result.mainThread.stage2DigestHex, expected.stage2Digest.digestHex);
    assert.equal(result.mainThread.unlockTokenHex, expected.unlockToken.digestHex);
    assert.equal(result.mainThread.inputDigestHex, expected.inputDigest.digestHex);
    assert.equal(result.mainThread.canonicalInputLength, expected.canonicalInputLength);
    assert.deepEqual(result.mainThread.hostBinding, expected.hostBinding);
    assert.equal(result.worker, null);
    assertTimingSnapshot(result.mainThread.timing, "mainThread.timing");
    assertTimingSnapshot(result.timingSummary, "timingSummary");
  });

  it("should cross-check worker and main-thread unlock derivations", async () => {
    const probe = createWasmKernelProbe({
      config: {
        addonRef: "cleanroomtemplate",
      },
      rootURI: "jar:file:///tmp/cleanroom.xpi!/",
      fetchImpl: async () => {
        return {
          ok: true,
          async arrayBuffer() {
            return toArrayBuffer(wasmProbeBytes);
          },
        };
      },
      WorkerCtor: FakeProbeWorker,
    });

    const hostBinding = {
      signalVersion: 1,
      profileHash: "sha256:profile-runtime",
      schemaBucket: "120-129",
      zoteroVersionBucket: "9.x",
      profileBasenameBucket: "sha256:basename-runtime",
      dataDirHash: "sha256:data-runtime",
      dbAvailable: true,
      noncePresent: true,
      nonceSource: "existing",
      nonceHash: "sha256:nonce-runtime",
    };
    const expected = computeExpectedUnlockDerivation({
      hostBinding,
    });
    const result = await probe.deriveUnlockToken({
      mode: "both",
      bundleSeed: DEFAULT_UNLOCK_BUNDLE_SEED,
      overlayVersion: DEFAULT_UNLOCK_OVERLAY_VERSION,
      hostBinding,
    });

    assert.equal(result.ok, true);
    assert.equal(result.consistentAcrossTransports, true);
    assert.equal(result.activationSatisfied, true);
    assert.equal(result.mainThread.stage2DigestHex, expected.stage2Digest.digestHex);
    assert.equal(result.worker.stage2DigestHex, expected.stage2Digest.digestHex);
    assert.equal(result.mainThread.unlockTokenHex, expected.unlockToken.digestHex);
    assert.equal(result.worker.unlockTokenHex, expected.unlockToken.digestHex);
    assert.equal(result.worker.workerURL, chromeWasmProbeWorkerURL);
    assert.equal(result.worker.wasmURL, chromeWasmProbeURL);
    assert.deepEqual(result.mainThread.exportNames, EXPECTED_WASM_EXPORTS);
    assert.deepEqual(result.worker.exportNames, EXPECTED_WASM_EXPORTS);
    assertTimingSnapshot(result.mainThread.timing, "mainThread.timing");
    assertTimingSnapshot(result.worker.timing, "worker.timing");
    assertTimingSnapshot(result.timingSummary, "timingSummary");
  });
});
