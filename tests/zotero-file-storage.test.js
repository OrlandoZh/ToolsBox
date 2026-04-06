import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, it, beforeEach, afterEach, assert } from "./test-framework.js";
import { createZoteroTextFileStorage } from "../src/platform/zotero-file-storage.js";

function createIOUtils() {
  return {
    async exists(targetPath) {
      return fs.existsSync(targetPath);
    },
    async makeDirectory(targetPath) {
      fs.mkdirSync(targetPath, { recursive: true });
    },
    async readUTF8(targetPath) {
      return fs.readFileSync(targetPath, "utf-8");
    },
    async writeUTF8(targetPath, source) {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, source, "utf-8");
    },
    async remove(targetPath) {
      fs.rmSync(targetPath, { force: true });
    },
  };
}

describe("Zotero Text File Storage", () => {
  let tempRoot = "";

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cleanroom-zotero-file-storage-"));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("should resolve data-directory file paths and provide a text adapter", async () => {
    const storage = createZoteroTextFileStorage({
      globalScope: {
        Zotero: {
          DataDirectory: {
            dir: tempRoot,
          },
        },
        PathUtils: {
          join: (...parts) => path.join(...parts),
        },
        IOUtils: createIOUtils(),
      },
      directorySegments: ["cleanroomtemplate", "state"],
      fileName: "history.json",
    });

    assert.equal(
      storage.resolveDirectoryPath(),
      path.join(tempRoot, "cleanroomtemplate", "state"),
    );
    assert.equal(
      storage.resolveFilePath(),
      path.join(tempRoot, "cleanroomtemplate", "state", "history.json"),
    );
    assert.equal(await storage.exists(), false);

    const filePath = await storage.writeText('{"ok":true}');
    const adapter = storage.getAdapter();

    assert.equal(filePath, storage.resolveFilePath());
    assert.equal(await storage.exists(), true);
    assert.equal(await adapter.readText(), '{"ok":true}');
    assert.equal(await storage.removeText(), true);
    assert.equal(await storage.exists(), false);
  });

  it("should fall back to ChromeUtils imports when PathUtils and IOUtils are not global", async () => {
    const PathUtilsAPI = {
      join: (...parts) => path.join(...parts),
    };
    const IOUtilsAPI = createIOUtils();

    const storage = createZoteroTextFileStorage({
      globalScope: {
        Zotero: {
          DataDirectory: {
            dir: tempRoot,
          },
        },
        ChromeUtils: {
          importESModule(resource) {
            if (resource.endsWith("PathUtils.sys.mjs")) {
              return { PathUtils: PathUtilsAPI };
            }
            if (resource.endsWith("IOUtils.sys.mjs")) {
              return { IOUtils: IOUtilsAPI };
            }
            throw new Error(`Unexpected import: ${resource}`);
          },
        },
      },
      directorySegments: "cleanroomtemplate/cache",
      fileName: "session.txt",
    });

    await storage.writeText("session-data");

    assert.equal(await storage.readText(), "session-data");
    assert.equal(
      storage.resolveFilePath(),
      path.join(tempRoot, "cleanroomtemplate", "cache", "session.txt"),
    );
  });

  it("should reject unsafe path input and missing data directory", () => {
    assert.throws(() => {
      createZoteroTextFileStorage({
        globalScope: {
          Zotero: {
            DataDirectory: {
              dir: tempRoot,
            },
          },
          PathUtils: {
            join: (...parts) => path.join(...parts),
          },
          IOUtils: createIOUtils(),
        },
        directorySegments: ["cleanroomtemplate", "..", "state"],
        fileName: "history.json",
      });
    });

    assert.throws(() => {
      createZoteroTextFileStorage({
        globalScope: {
          Zotero: {
            DataDirectory: {
              dir: tempRoot,
            },
          },
          PathUtils: {
            join: (...parts) => path.join(...parts),
          },
          IOUtils: createIOUtils(),
        },
        directorySegments: ["cleanroomtemplate"],
        fileName: "../history.json",
      });
    });

    const storage = createZoteroTextFileStorage({
      globalScope: {
        Zotero: {
          DataDirectory: {
            dir: "",
          },
        },
        PathUtils: {
          join: (...parts) => path.join(...parts),
        },
        IOUtils: createIOUtils(),
      },
      directorySegments: ["cleanroomtemplate"],
      fileName: "history.json",
    });

    assert.throws(() => {
      storage.resolveFilePath();
    });
  });
});
