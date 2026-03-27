import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createItemPane } from "../src/features/item-pane.js";
import { createPreferencePanes } from "../src/features/preference-panes.js";
import { createReader } from "../src/features/reader.js";
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

  assert(typeof itemPane.createSimpleSection === "function", "ItemPane runtime is missing createSimpleSection()");
  assert(typeof itemPane.createFieldInfoRow === "function", "ItemPane runtime is missing createFieldInfoRow()");
  assert(typeof itemPane.createConditionalInfoRow === "function", "ItemPane runtime is missing createConditionalInfoRow()");
  assert(typeof reader.getReaderSummary === "function", "Reader runtime is missing getReaderSummary()");
  assert(typeof reader.getActiveSummary === "function", "Reader runtime is missing getActiveSummary()");
  assert(typeof preferencePanes.registerPane === "function", "PreferencePanes runtime is missing registerPane()");
  assert(typeof preferencePanes.resolveURI === "function", "PreferencePanes runtime is missing resolveURI()");
  assert(typeof host.insertFTLIfNeeded === "function", "ZoteroHost runtime is missing insertFTLIfNeeded()");

  assert(featuresTypes.includes("headerL10nID: string;"), "types/features.d.ts is missing ItemPane headerL10nID declaration");
  assert(featuresTypes.includes("sidenavL10nID?: string;"), "types/features.d.ts is missing ItemPane sidenavL10nID declaration");
  assert(featuresTypes.includes("labelL10nID: string;"), "types/features.d.ts is missing ItemPane labelL10nID declaration");
  assert(featuresTypes.includes("export interface ReaderSummary"), "types/features.d.ts is missing ReaderSummary declaration");
  assert(featuresTypes.includes("getReaderSummary(target?: unknown): ReaderSummary | null;"), "types/features.d.ts is missing getReaderSummary()");
  assert(featuresTypes.includes("getActiveSummary(): ReaderSummary | null;"), "types/features.d.ts is missing getActiveSummary()");
  assert(featuresTypes.includes("registerPane(options: PreferencePaneOptions): Promise<string | null>;"), "types/features.d.ts is missing PreferencePanes registerPane()");
  assert(featuresTypes.includes("resolveURI(uri: string): string;"), "types/features.d.ts is missing PreferencePanes resolveURI()");
  assert(platformTypes.includes("insertFTLIfNeeded(window: Window, resourceId: string): boolean;"), "types/platform.d.ts is missing insertFTLIfNeeded()");

  console.log("Typecheck complete: declaration drift checks passed");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
