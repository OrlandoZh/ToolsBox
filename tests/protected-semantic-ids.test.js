import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, assert } from "./test-framework.js";
import {
  AGENT_SCENARIO_IDS as PLAIN_AGENT_SCENARIO_IDS,
} from "../dev/agent-runtime/agent-scenario-ids.js";
import {
  AGENT_SCENARIO_IDS as PROTECTED_AGENT_SCENARIO_IDS,
} from "../dev/agent-runtime/agent-scenario-ids-protected.js";
import {
  CAPABILITY_IDS as PLAIN_CAPABILITY_IDS,
} from "../dev/agent-runtime/capability-ids.js";
import {
  CAPABILITY_IDS as PROTECTED_CAPABILITY_IDS,
} from "../dev/agent-runtime/capability-ids-protected.js";
import {
  HOST_ACTION_IDS as PLAIN_HOST_ACTION_IDS,
} from "../dev/agent-runtime/host-action-ids.js";
import {
  HOST_ACTION_IDS as PROTECTED_HOST_ACTION_IDS,
} from "../dev/agent-runtime/host-action-ids-protected.js";
import {
  listHostActionDescriptors as listPlainHostActionDescriptors,
} from "../dev/agent-runtime/host-action-catalog.js";
import {
  listHostActionDescriptors as listProtectedHostActionDescriptors,
} from "../dev/agent-runtime/host-action-catalog-protected.js";
import {
  HOST_ACTION_OWNER_MODULES as PLAIN_HOST_ACTION_OWNER_MODULES,
} from "../dev/agent-runtime/host-action-owner-modules.js";
import {
  HOST_ACTION_OWNER_MODULES as PROTECTED_HOST_ACTION_OWNER_MODULES,
} from "../dev/agent-runtime/host-action-owner-modules-protected.js";
import {
  HOST_ACTION_READINESS_IDS as PLAIN_HOST_ACTION_READINESS_IDS,
} from "../dev/agent-runtime/host-action-readiness-ids.js";
import {
  HOST_ACTION_READINESS_IDS as PROTECTED_HOST_ACTION_READINESS_IDS,
} from "../dev/agent-runtime/host-action-readiness-ids-protected.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

describe("Protected Semantic ID Modules", () => {
  it("should keep protected capability and scenario ids runtime-compatible", () => {
    assert.deepEqual(PROTECTED_CAPABILITY_IDS, PLAIN_CAPABILITY_IDS);
    assert.deepEqual(PROTECTED_AGENT_SCENARIO_IDS, PLAIN_AGENT_SCENARIO_IDS);
    assert.deepEqual(PROTECTED_HOST_ACTION_IDS, PLAIN_HOST_ACTION_IDS);
    assert.equal(
      PROTECTED_HOST_ACTION_READINESS_IDS.readerSummary,
      PLAIN_HOST_ACTION_READINESS_IDS.readerSummary,
    );
    assert.deepEqual(PROTECTED_HOST_ACTION_OWNER_MODULES.hostBridge, [
      "module-host",
      "module-action",
    ]);
    assert.deepEqual(PLAIN_HOST_ACTION_OWNER_MODULES.hostBridge, [
      "src/platform/zotero-host.js",
      "dev/agent-runtime/host-actions.js",
    ]);
  });

  it("should keep the protected host action catalog runtime-compatible while stripping descriptive fields", () => {
    const plainCatalog = listPlainHostActionDescriptors({
      bundleRuntime: {
        isEnabled(bundleID) {
          return bundleID === "react-ui";
        },
      },
    });
    const protectedCatalog = listProtectedHostActionDescriptors({
      bundleRuntime: {
        isEnabled(bundleID) {
          return bundleID === "react-ui";
        },
      },
    });
    const plainById = new Map(plainCatalog.map((entry) => [entry.id, entry]));
    const protectedById = new Map(protectedCatalog.map((entry) => [entry.id, entry]));
    const protectedReactDemo = protectedById.get(PLAIN_HOST_ACTION_IDS.windowOpenReactDemo);

    assert.deepEqual(protectedCatalog.map((entry) => entry.id), plainCatalog.map((entry) => entry.id));
    assert.equal(protectedById.get(PLAIN_HOST_ACTION_IDS.preferencesOpenPane)?.status, plainById.get(PLAIN_HOST_ACTION_IDS.preferencesOpenPane)?.status);
    assert.equal(protectedById.get(PLAIN_HOST_ACTION_IDS.runtimeProbeWasmKernel)?.executable, plainById.get(PLAIN_HOST_ACTION_IDS.runtimeProbeWasmKernel)?.executable);
    assert.equal(protectedById.get(PLAIN_HOST_ACTION_IDS.runtimeDeriveWasmKernelDigest)?.executable, plainById.get(PLAIN_HOST_ACTION_IDS.runtimeDeriveWasmKernelDigest)?.executable);
    assert.equal(protectedById.get(PLAIN_HOST_ACTION_IDS.runtimeDeriveWasmKernelUnlockToken)?.executable, plainById.get(PLAIN_HOST_ACTION_IDS.runtimeDeriveWasmKernelUnlockToken)?.executable);
    assert.equal(protectedById.get(PLAIN_HOST_ACTION_IDS.runtimeResolveLegacyEntitlementGate)?.executable, plainById.get(PLAIN_HOST_ACTION_IDS.runtimeResolveLegacyEntitlementGate)?.executable);
    assert.equal(protectedReactDemo?.requiredBundle, "react-ui");
    assert.equal(Object.prototype.hasOwnProperty.call(protectedById.get(PLAIN_HOST_ACTION_IDS.preferencesOpenPane), "label"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(protectedById.get(PLAIN_HOST_ACTION_IDS.preferencesOpenPane), "summary"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(protectedById.get(PLAIN_HOST_ACTION_IDS.preferencesOpenPane), "authoritativeSource"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(protectedById.get(PLAIN_HOST_ACTION_IDS.preferencesOpenPane), "readinessAssertions"), false);
  });

  it("should avoid contiguous capability and scenario anchors in protected id sources", async () => {
    const protectedCapabilitySource = await fs.readFile(
      path.join(projectRoot, "dev", "agent-runtime", "capability-ids-protected.js"),
      "utf-8",
    );
    const protectedScenarioSource = await fs.readFile(
      path.join(projectRoot, "dev", "agent-runtime", "agent-scenario-ids-protected.js"),
      "utf-8",
    );
    const protectedHostActionOwnerModulesSource = await fs.readFile(
      path.join(projectRoot, "dev", "agent-runtime", "host-action-owner-modules-protected.js"),
      "utf-8",
    );
    const protectedHostActionReadinessSource = await fs.readFile(
      path.join(projectRoot, "dev", "agent-runtime", "host-action-readiness-ids-protected.js"),
      "utf-8",
    );
    const protectedHostActionIDsSource = await fs.readFile(
      path.join(projectRoot, "dev", "agent-runtime", "host-action-ids-protected.js"),
      "utf-8",
    );
    const protectedHostActionCatalogSource = await fs.readFile(
      path.join(projectRoot, "dev", "agent-runtime", "host-action-catalog-protected.js"),
      "utf-8",
    );
    const protectedCapabilityManifestSource = await fs.readFile(
      path.join(projectRoot, "dev", "agent-runtime", "capability-manifest-protected.js"),
      "utf-8",
    );

    [
      "baseline-registration",
      "reader-summary",
      "host-actions",
      "settings-governance",
      "runtime-bridge-report",
    ].forEach((anchor) => {
      assert.equal(protectedCapabilitySource.includes(anchor), false);
    });

    [
      "reader-current",
      "settings-snapshot",
      "window-snapshot",
      "command-no-ui",
      "capability-manifest",
    ].forEach((anchor) => {
      assert.equal(protectedScenarioSource.includes(anchor), false);
    });

    assert.equal(protectedHostActionOwnerModulesSource.includes("host-actions"), false);
    assert.equal(protectedHostActionReadinessSource.includes("reader-summary"), false);

    [
      "preferences.openPane",
      "reader.open",
      "runtime.probeWasmKernel",
      "runtime.deriveWasmKernelDigest",
      "runtime.deriveWasmKernelUnlockToken",
      "runtime.resolveLegacyEntitlementGate",
      "window.openReactDemo",
      "menu.trigger.destructive",
    ].forEach((anchor) => {
      assert.equal(protectedHostActionIDsSource.includes(anchor), false);
    });

    [
      "Open Preference Pane",
      "authoritativeSource",
      "readinessAssertions",
      "reference/zotero-main",
      "runtime.probeWasmKernel",
      "runtime.deriveWasmKernelDigest",
      "runtime.deriveWasmKernelUnlockToken",
      "runtime.resolveLegacyEntitlementGate",
      "window.openReactDemo",
    ].forEach((anchor) => {
      assert.equal(protectedHostActionCatalogSource.includes(anchor), false);
    });

    [
      "基线注册",
      "条目展示摘要",
      "通知器联动",
      "Reader 摘要",
      "Reader 批注回环",
      "Reader UI 状态",
      "Reader 事件桥",
      "无阻塞动作执行",
      "宿主动作编排",
      "设置治理",
      "多窗口挂载",
      "运行时桥接报告",
    ].forEach((anchor) => {
      assert.equal(protectedCapabilityManifestSource.includes(anchor), false);
    });
  });
});
