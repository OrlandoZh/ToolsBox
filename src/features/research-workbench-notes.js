import {
  createWorkbenchShellManager,
  resolveThemeMode,
  collectAnnotations,
  collectNotes,
} from "./research-workbench-common.js";

const SHELL_FILE = "research-workbench-notes.xhtml";
const WINDOW_NAME = "toolsbox-notes-manager";

function buildSnapshot(context) {
  return {
    open: Boolean(context?.window && !context.window.closed),
    itemCount: context?.stats?.itemCount ?? 0,
    noteCount: context?.stats?.noteCount ?? 0,
    annotationCount: context?.stats?.annotationCount ?? 0,
  };
}

function cleanText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTags(item) {
  try {
    return (item?.getTags?.() || [])
      .map((entry) => entry?.tag || entry)
      .map((entry) => String(entry || "").trim())
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

function getParentTitle(parentItemID) {
  try {
    if (typeof Zotero === "undefined" || !parentItemID) return "";
    return Zotero.Items?.get?.(parentItemID)?.getField?.("title") || "";
  } catch (_) {
    return "";
  }
}

function buildNotesEntries(reader, logger) {
  const entries = [];
  try {
    if (typeof Zotero === "undefined" || !Zotero.Items) return entries;
    const allItems = Zotero.Items.getAll?.() || [];
    for (const item of allItems) {
      if (!item) continue;
      if (item.isNote?.()) {
        const parentItemID = item.parentItemID || item.parentID || "";
        entries.push({
          id: String(item.id),
          kind: "note",
          text: cleanText(item.getNote?.() || item.note || ""),
          parentItemID: String(parentItemID || ""),
          parentTitle: getParentTitle(parentItemID),
          dateAdded: String(item.dateAdded || ""),
          dateModified: String(item.dateModified || ""),
          tags: normalizeTags(item),
        });
      } else if (item.isAnnotation?.() || item.annotationText || item.annotationComment) {
        const parentItemID = item.parentItemID || item.parentID || "";
        entries.push({
          id: String(item.id),
          kind: "annotation",
          text: cleanText(item.annotationText || item.annotationComment || item.getNote?.() || ""),
          parentItemID: String(parentItemID || ""),
          parentTitle: getParentTitle(parentItemID),
          dateAdded: String(item.dateAdded || ""),
          dateModified: String(item.dateModified || ""),
          pageLabel: String(item.annotationPageLabel || item.pageLabel || ""),
          color: String(item.annotationColor || item.color || ""),
          tags: normalizeTags(item),
        });
      }

      const notes = collectNotes(item, Zotero);
      for (const note of notes) {
        entries.push({
          id: String(note.id),
          kind: "note",
          text: cleanText(note.text),
          parentItemID: String(item.id),
          parentTitle: item.getField?.("title") || "",
          dateAdded: String(note.dateAdded || ""),
          dateModified: String(note.dateModified || ""),
          tags: [],
        });
      }

      const attachmentIDs = item.getAttachments?.() || [];
      for (const attachmentID of attachmentIDs) {
        for (const annotation of collectAnnotations(attachmentID, reader)) {
          entries.push({
            id: String(annotation.id || `${attachmentID}:${entries.length}`),
            kind: "annotation",
            text: cleanText(annotation.text || annotation.comment || ""),
            parentItemID: String(item.id),
            parentTitle: item.getField?.("title") || "",
            dateAdded: String(annotation.dateAdded || ""),
            dateModified: String(annotation.dateModified || ""),
            pageLabel: String(annotation.pageLabel || ""),
            color: String(annotation.color || ""),
            tags: Array.isArray(annotation.tags) ? annotation.tags.map(String).filter(Boolean) : [],
          });
        }
      }
    }
  } catch (err) {
    logger?.debug?.("[notes-manager] build entries failed", { message: String(err?.message || err) });
  }
  const seen = new Set();
  return entries.filter((entry) => {
    const key = `${entry.kind}:${entry.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return entry.text || entry.parentTitle;
  });
}

export function registerNotesManagerFeatures(options) {
  const {
    config,
    logger,
    prefs,
    i18n,
    host,
    commandPalette,
    reader,
    surfaceDescriptors,
  } = options;

  const addonRef = config.addonRef || "toolsbox";
  const addonName = config.addonName || "ToolsBox";
  const rootURI = config.rootURI || `chrome://${addonRef}/`;

  let shellManager = null;

  function isEnabled() {
    try {
      return prefs?.get?.("researchWorkbench.notes.enabled") ?? true;
    } catch (_) {
      return true;
    }
  }

  function buildPayload(context = {}) {
    const entries = buildNotesEntries(reader, logger);
    return {
      theme: resolveThemeMode(prefs),
      entries,
      snapshot: buildSnapshot(context),
    };
  }

  function ensureShell() {
    if (!shellManager) {
      shellManager = createWorkbenchShellManager({
        logger,
        host,
        rootURI,
        addonRef,
        addonName,
        prefs,
        shellFileName: SHELL_FILE,
        windowName: WINDOW_NAME,
        windowWidth: 1100,
        windowHeight: 750,
        buildPayload,
      });
    }
    return shellManager;
  }

  function openNotesManager(_context) {
    if (!isEnabled()) return;
    const shell = ensureShell();
    shell.open({}).catch((err) => {
      logger?.warn?.("[notes-manager] open failed", { message: String(err?.message || err) });
    });
  }

  // Register command palette entry
  commandPalette.registerCommand({
    id: surfaceDescriptors?.notesManagerCommandID || `${addonRef}-notes-manager`,
    label: i18n?.t?.("cleanroom-nm-command-label", "Open Notes Manager") || "Open Notes Manager",
    category: addonName,
    description: "",
    condition: isEnabled,
    handler: openNotesManager,
  });

  return {
    openNotesManager,
    getSnapshot: () => shellManager?.getSnapshot?.() || { open: false },
  };
}
