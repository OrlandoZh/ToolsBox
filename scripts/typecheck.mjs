import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createItemPane } from "../src/features/item-pane.js";
import { createPreferencePanes } from "../src/features/preference-panes.js";
import { createReader } from "../src/features/reader.js";
import { createZoteroTextFileStorage } from "../src/platform/zotero-file-storage.js";
import { createZoteroJSONStateStore } from "../src/platform/zotero-json-state-store.js";
import { createZoteroHost } from "../src/platform/zotero-host.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readTypeFile(relativePath) {
  return fs.readFile(path.join(projectRoot, relativePath), "utf-8");
}

async function main() {
  const featuresTypes = await readTypeFile("types/features.d.ts");
  const platformTypes = await readTypeFile("types/platform.d.ts");
  const agentTypes = await readTypeFile("types/agent.d.ts");

  const itemPane = createItemPane({
    pluginID: "cleanroom-template@example.com",
    zotero: {
      ItemPaneManager: {
        registerSection(options) {
          return options.paneID;
        },
        unregisterSection() {},
        registerInfoRow(options) {
          return options.rowID;
        },
        unregisterInfoRow() {},
        refreshInfoRow() {},
      },
    },
  });

  const reader = createReader({
    zotero: {
      getMainWindow() {
        return {
          Zotero_Tabs: {
            selectedID: "reader-tab-1",
          },
        };
      },
      Reader: {
        _readers: [
          {
            tabID: "reader-tab-1",
            itemID: 1,
            annotationItemIDs: [101],
          },
        ],
        getByTabID(tabID) {
          return tabID === "reader-tab-1"
            ? {
                tabID: "reader-tab-1",
                itemID: 1,
                annotationItemIDs: [101],
              }
            : null;
        },
      },
      Items: {
        get(itemID) {
          return itemID === 1 ? { attachmentReaderType: "pdf" } : null;
        },
      },
    },
  });

  const preferencePanes = createPreferencePanes({
    pluginID: "cleanroom-template@example.com",
    rootURI: "chrome://cleanroomtemplate/",
    zotero: {
      PreferencePanes: {
        async register(options) {
          return options.id || "pane-id";
        },
        unregister() {},
      },
    },
  });

  const host = createZoteroHost({
    globalScope: {
      Zotero: null,
      Services: null,
      console,
    },
    rootURI: "chrome://cleanroomtemplate/",
  });

  const textFileStorage = createZoteroTextFileStorage({
    globalScope: {
      Zotero: {
        DataDirectory: {
          dir: "/tmp/cleanroomtemplate",
        },
      },
      PathUtils: {
        join: (...parts) => parts.join("/"),
      },
      IOUtils: {
        async exists() {
          return false;
        },
        async makeDirectory() {},
        async readUTF8() {
          return "";
        },
        async writeUTF8() {},
        async remove() {},
      },
    },
    directorySegments: ["cleanroomtemplate", "state"],
    fileName: "history.json",
  });

  const jsonStateStore = createZoteroJSONStateStore({
    globalScope: {
      Zotero: {
        DataDirectory: {
          dir: "/tmp/cleanroomtemplate",
        },
      },
      PathUtils: {
        join: (...parts) => parts.join("/"),
      },
      IOUtils: {
        async exists() {
          return false;
        },
        async makeDirectory() {},
        async readUTF8() {
          return "";
        },
        async writeUTF8() {},
      },
    },
    id: "history.demo",
    directorySegments: ["cleanroomtemplate", "state"],
    fileName: "history.json",
    initialState: () => ({ entries: [] }),
  });

  assert(typeof itemPane.createSimpleSection === "function", "ItemPane runtime is missing createSimpleSection()");
  assert(typeof itemPane.createFieldInfoRow === "function", "ItemPane runtime is missing createFieldInfoRow()");
  assert(typeof itemPane.createConditionalInfoRow === "function", "ItemPane runtime is missing createConditionalInfoRow()");
  assert(typeof reader.getReaderSummary === "function", "Reader runtime is missing getReaderSummary()");
  assert(typeof reader.getActiveSummary === "function", "Reader runtime is missing getActiveSummary()");
  assert(typeof preferencePanes.registerPane === "function", "PreferencePanes runtime is missing registerPane()");
  assert(typeof preferencePanes.resolveURI === "function", "PreferencePanes runtime is missing resolveURI()");
  assert(typeof textFileStorage.readText === "function", "ZoteroTextFileStorage runtime is missing readText()");
  assert(typeof textFileStorage.writeText === "function", "ZoteroTextFileStorage runtime is missing writeText()");
  assert(typeof jsonStateStore.init === "function", "ZoteroJSONStateStore runtime is missing init()");
  assert(typeof jsonStateStore.resolveFilePath === "function", "ZoteroJSONStateStore runtime is missing resolveFilePath()");
  assert(typeof host.insertFTLIfNeeded === "function", "ZoteroHost runtime is missing insertFTLIfNeeded()");
  assert(typeof host.buildSurfaceTarget === "function", "ZoteroHost runtime is missing buildSurfaceTarget()");

  assert(featuresTypes.includes("headerL10nID: string;"), "types/features.d.ts is missing ItemPane headerL10nID declaration");
  assert(featuresTypes.includes("sidenavL10nID?: string;"), "types/features.d.ts is missing ItemPane sidenavL10nID declaration");
  assert(featuresTypes.includes("labelL10nID: string;"), "types/features.d.ts is missing ItemPane labelL10nID declaration");
  assert(featuresTypes.includes("getMenuRegistrationSnapshot(menuId?: string | null): MenuRegistrationSnapshot[] | MenuRegistrationSnapshot | null;"), "types/features.d.ts is missing getMenuRegistrationSnapshot()");
  assert(featuresTypes.includes("getLiveMenuState(menuId: string, menuPath?: string | null): LiveMenuState | null;"), "types/features.d.ts is missing getLiveMenuState()");
  assert(featuresTypes.includes("export interface ReaderSummary"), "types/features.d.ts is missing ReaderSummary declaration");
  assert(featuresTypes.includes("export const READER_EVENT_TYPES: {"), "types/features.d.ts is missing READER_EVENT_TYPES declaration");
  assert(featuresTypes.includes("getReaderSummary(target?: unknown): ReaderSummary | null;"), "types/features.d.ts is missing getReaderSummary()");
  assert(featuresTypes.includes("getActiveSummary(): ReaderSummary | null;"), "types/features.d.ts is missing getActiveSummary()");
  assert(featuresTypes.includes("waitForReaderReady(target: unknown, options?: { timeoutMs?: number; intervalMs?: number }): Promise<unknown | null>;"), "types/features.d.ts is missing waitForReaderReady()");
  assert(featuresTypes.includes("setContextPaneOpen(target: unknown, open: boolean, options?: { timeoutMs?: number; intervalMs?: number }): Promise<Record<string, unknown> | null>;"), "types/features.d.ts is missing setContextPaneOpen()");
  assert(
    featuresTypes.includes("selectSidebarView(target: unknown, view: string, options?: { timeoutMs?: number; intervalMs?: number }): Promise<{")
      || featuresTypes.includes("selectSidebarView(target: unknown, view: string, options?: {"),
    "types/features.d.ts is missing selectSidebarView()",
  );
  assert(featuresTypes.includes("findToolbarElement(target: unknown, options?: { selector?: string; view?: \"primary\" | \"secondary\" }): Element | null;"), "types/features.d.ts is missing findToolbarElement()");
  assert(featuresTypes.includes("findSidebarViewElements(target: unknown, view: string, options?: { view?: \"primary\" | \"secondary\" }): {"), "types/features.d.ts is missing findSidebarViewElements()");
  assert(featuresTypes.includes("readonly READER_EVENT_TYPES: typeof READER_EVENT_TYPES;"), "types/features.d.ts is missing Reader READER_EVENT_TYPES declaration");
  assert(featuresTypes.includes("isEventAPIAvailable(): boolean;"), "types/features.d.ts is missing isEventAPIAvailable()");
  assert(featuresTypes.includes("registerEventListener(type: string, handler: (event: ReaderEvent) => void, options?: { pluginID?: string }): (() => void) | null;"), "types/features.d.ts is missing registerEventListener()");
  assert(featuresTypes.includes("getKnownEventTypes(): string[];"), "types/features.d.ts is missing getKnownEventTypes()");
  assert(featuresTypes.includes("getProbeCompatibleEventTypes(): string[];"), "types/features.d.ts is missing getProbeCompatibleEventTypes()");
  assert(featuresTypes.includes("getEventAPIReport(): ReaderEventAPIReport;"), "types/features.d.ts is missing getEventAPIReport()");
  assert(featuresTypes.includes("dispatchSyntheticEvent(target: unknown, options?: {"), "types/features.d.ts is missing dispatchSyntheticEvent()");
  assert(featuresTypes.includes("getReaderFrameWindow(target: unknown, options?: { view?: \"primary\" | \"secondary\" }): Window | null;"), "types/features.d.ts is missing getReaderFrameWindow()");
  assert(featuresTypes.includes("registerPane(options: PreferencePaneOptions): Promise<string | null>;"), "types/features.d.ts is missing PreferencePanes registerPane()");
  assert(featuresTypes.includes("resolveURI(uri: string): string;"), "types/features.d.ts is missing PreferencePanes resolveURI()");
  assert(featuresTypes.includes("label?: string;"), "types/features.d.ts is missing optional PreferencePane label declaration");
  assert(platformTypes.includes("export interface ZoteroTextFileStorage"), "types/platform.d.ts is missing ZoteroTextFileStorage declaration");
  assert(platformTypes.includes("export function createZoteroTextFileStorage(options: ZoteroTextFileStorageOptions): ZoteroTextFileStorage;"), "types/platform.d.ts is missing createZoteroTextFileStorage()");
  assert(platformTypes.includes("export interface ZoteroJSONStateStore"), "types/platform.d.ts is missing ZoteroJSONStateStore declaration");
  assert(platformTypes.includes("export function createZoteroJSONStateStore<TState = unknown, TContext = unknown>("), "types/platform.d.ts is missing createZoteroJSONStateStore()");
  assert(platformTypes.includes("insertFTLIfNeeded(window: Window, resourceId: string): boolean;"), "types/platform.d.ts is missing insertFTLIfNeeded()");
  assert(platformTypes.includes("buildSurfaceTarget(options: {"), "types/platform.d.ts is missing buildSurfaceTarget()");
  assert(platformTypes.includes("preparePreferencePane(options?: {"), "types/platform.d.ts is missing preparePreferencePane()");
  assert(platformTypes.includes("setContextPaneOpen(open: boolean, options?: { window?: Window | null; timeoutMs?: number }): Promise<Record<string, unknown>>;"), "types/platform.d.ts is missing host setContextPaneOpen()");
  assert(platformTypes.includes("export interface SurfaceEvidenceTarget"), "types/platform.d.ts is missing SurfaceEvidenceTarget declaration");
  assert(agentTypes.includes("export interface HostActionDescriptor"), "types/agent.d.ts is missing HostActionDescriptor declaration");
  assert(agentTypes.includes("\"preferences.openPane\":"), "types/agent.d.ts is missing HostActionPayloadMap preference action");
  assert(agentTypes.includes("export interface HostActionResult"), "types/agent.d.ts is missing HostActionResult declaration");
  assert(agentTypes.includes("export interface SurfaceSmokeResult"), "types/agent.d.ts is missing SurfaceSmokeResult declaration");

  console.log("Typecheck complete: declaration drift checks passed");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
