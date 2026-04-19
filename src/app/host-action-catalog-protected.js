import { isOptionalBundleEnabled } from "./optional-bundles.js";
import { HOST_ACTION_IDS } from "./host-action-ids.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export const HOST_ACTION_STATUSES = Object.freeze({
  READY: "ready",
  PROBE_ONLY: "probe-only",
  MANUAL_ONLY: "manual-only",
  UNSAFE: "unsafe",
});

const HOST_ACTION_CATALOG = Object.freeze([
  { id: HOST_ACTION_IDS.preferencesOpenPane, status: HOST_ACTION_STATUSES.READY, executable: true },
  { id: HOST_ACTION_IDS.preferencesSelectTab, status: HOST_ACTION_STATUSES.READY, executable: true },
  { id: HOST_ACTION_IDS.preferencesSetCheckbox, status: HOST_ACTION_STATUSES.READY, executable: true },
  { id: HOST_ACTION_IDS.preferencesSetTextbox, status: HOST_ACTION_STATUSES.READY, executable: true },
  { id: HOST_ACTION_IDS.preferencesSelectMenulist, status: HOST_ACTION_STATUSES.READY, executable: true },
  { id: HOST_ACTION_IDS.contextPaneSetOpen, status: HOST_ACTION_STATUSES.READY, executable: true },
  { id: HOST_ACTION_IDS.itemPaneSelectPane, status: HOST_ACTION_STATUSES.READY, executable: true },
  { id: HOST_ACTION_IDS.contextPaneSelectPane, status: HOST_ACTION_STATUSES.READY, executable: true },
  { id: HOST_ACTION_IDS.readerOpen, status: HOST_ACTION_STATUSES.READY, executable: true },
  { id: HOST_ACTION_IDS.readerContextPaneSetOpen, status: HOST_ACTION_STATUSES.READY, executable: true },
  { id: HOST_ACTION_IDS.readerToolbarTriggerButton, status: HOST_ACTION_STATUSES.READY, executable: true },
  { id: HOST_ACTION_IDS.readerSidebarSelectView, status: HOST_ACTION_STATUSES.READY, executable: true },
  { id: HOST_ACTION_IDS.menuShow, status: HOST_ACTION_STATUSES.READY, executable: true },
  { id: HOST_ACTION_IDS.menuTrigger, status: HOST_ACTION_STATUSES.READY, executable: true },
  { id: HOST_ACTION_IDS.windowListMain, status: HOST_ACTION_STATUSES.PROBE_ONLY, executable: false },
  { id: HOST_ACTION_IDS.windowWaitForPreferencesWindow, status: HOST_ACTION_STATUSES.PROBE_ONLY, executable: false },
  { id: HOST_ACTION_IDS.runtimeProbeWasmKernel, status: HOST_ACTION_STATUSES.PROBE_ONLY, executable: true },
  { id: HOST_ACTION_IDS.runtimeDeriveWasmKernelDigest, status: HOST_ACTION_STATUSES.PROBE_ONLY, executable: true },
  { id: HOST_ACTION_IDS.runtimeDeriveWasmKernelUnlockToken, status: HOST_ACTION_STATUSES.PROBE_ONLY, executable: true },
  {
    id: HOST_ACTION_IDS.windowOpenReactDemo,
    status: HOST_ACTION_STATUSES.READY,
    executable: true,
    requiredBundle: "react-ui",
  },
  { id: HOST_ACTION_IDS.dialogModalConfirmation, status: HOST_ACTION_STATUSES.MANUAL_ONLY, executable: false },
  { id: HOST_ACTION_IDS.preferencesHelpLink, status: HOST_ACTION_STATUSES.MANUAL_ONLY, executable: false },
  { id: HOST_ACTION_IDS.menuTriggerDestructive, status: HOST_ACTION_STATUSES.UNSAFE, executable: false },
  { id: HOST_ACTION_IDS.windowCloseWithUnsavedState, status: HOST_ACTION_STATUSES.UNSAFE, executable: false },
]);

function shouldExposeHostAction(entry, options = {}) {
  const requiredBundle = String(entry?.requiredBundle || "").trim();
  if (!requiredBundle) {
    return true;
  }
  return isOptionalBundleEnabled(options.bundleRuntime, requiredBundle);
}

export function listHostActionDescriptors(options = {}) {
  return HOST_ACTION_CATALOG
    .filter((entry) => shouldExposeHostAction(entry, options))
    .map((entry) => clone(entry));
}

export function getHostActionDescriptor(actionId, options = {}) {
  const id = String(actionId || "").trim();
  if (!id) {
    return null;
  }
  const matched = HOST_ACTION_CATALOG.find((entry) => entry.id === id && shouldExposeHostAction(entry, options));
  return matched ? clone(matched) : null;
}

export function isExecutableHostAction(actionId, options = {}) {
  return Boolean(getHostActionDescriptor(actionId, options)?.executable);
}
