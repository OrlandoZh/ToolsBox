import { createFileStateStore } from "../services/file-state-store.js";
import { createZoteroTextFileStorage } from "./zotero-file-storage.js";

export function createZoteroJSONStateStore(options = {}) {
  const {
    globalScope,
    directorySegments = [],
    fileName,
    rootDir = null,
    id,
    label,
    initialState = {},
    logger,
    debounceMs = 250,
    schemaVersion = 1,
    maxSerializedBytes = null,
    serialize,
    deserialize,
    migrate,
    prune,
  } = options;

  const storage = createZoteroTextFileStorage({
    globalScope,
    directorySegments,
    fileName,
    rootDir,
  });

  const store = createFileStateStore({
    id,
    label,
    readText: storage.readText,
    writeText: storage.writeText,
    initialState,
    logger,
    debounceMs,
    schemaVersion,
    maxSerializedBytes,
    serialize,
    deserialize,
    migrate,
    prune,
  });

  return {
    storage,
    init: store.init,
    setState: store.setState,
    update: store.update,
    reset: store.reset,
    flush: store.flush,
    dispose: store.dispose,
    getStatus: store.getStatus,
    getState: store.getState,
    isReady: store.isReady,
    resolveDirectoryPath: storage.resolveDirectoryPath,
    resolveFilePath: storage.resolveFilePath,
    ensureDirectory: storage.ensureDirectory,
    exists: storage.exists,
  };
}
