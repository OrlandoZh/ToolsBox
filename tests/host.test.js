/**
 * Zotero Host 测试
 */
import { describe, it, beforeEach, afterEach, assert } from "./test-framework.js";
import { createZoteroHost } from "../src/platform/zotero-host.js";

describe("ZoteroHost", () => {
  beforeEach(() => {
    delete globalThis.Services;
    delete globalThis.Zotero;
  });

  afterEach(() => {
    delete globalThis.Services;
    delete globalThis.Zotero;
  });

  it("should resolve content urls and prefer Zotero main window", () => {
    const mainWindow = {
      closed: false,
      document: {
        documentElement: {
          getAttribute() {
            return "zotero:main";
          },
        },
        getElementById() {
          return null;
        },
      },
    };

    globalThis.Zotero = {
      getMainWindow() {
        return mainWindow;
      },
      getMainWindows() {
        return [mainWindow];
      },
    };

    globalThis.Services = {
      wm: {
        getEnumerator() {
          return {
            hasMoreElements() {
              return false;
            },
          };
        },
      },
    };

    const host = createZoteroHost({
      globalScope: globalThis,
      rootURI: "chrome://cleanroomtemplate/",
    });

    assert.equal(
      host.resolveContentUrl("/content/preferences.xhtml"),
      "chrome://cleanroomtemplate/content/preferences.xhtml",
    );
    assert.equal(host.getMainWindow(), mainWindow);
    assert.equal(host.listMainWindows().length, 1);
  });

  it("should fall back to window.alert when Services.prompt is unavailable", () => {
    let capturedBody = null;
    const fallbackWindow = {
      alert(body) {
        capturedBody = body;
      },
      document: {
        documentElement: {
          getAttribute() {
            return "";
          },
        },
        getElementById(id) {
          if (id === "menu_ToolsPopup") {
            return {};
          }
          return null;
        },
      },
    };

    globalThis.Zotero = {
      getMainWindows() {
        return [];
      },
    };
    globalThis.Services = {};

    const host = createZoteroHost({
      globalScope: globalThis,
      rootURI: "",
    });

    host.showAlert(fallbackWindow, "Title", "Fallback body");
    assert.equal(capturedBody, "Fallback body");
  });

  it("should insert FTL resources when MozXULElement is available", () => {
    const inserted = [];
    const mainWindow = {
      MozXULElement: {
        insertFTLIfNeeded(resourceId) {
          inserted.push(resourceId);
        },
      },
      document: {
        documentElement: {
          getAttribute() {
            return "zotero:main";
          },
        },
        getElementById() {
          return null;
        },
      },
    };

    const host = createZoteroHost({
      globalScope: {
        Zotero: null,
        Services: null,
      },
      rootURI: "",
    });

    assert.equal(host.insertFTLIfNeeded(mainWindow, "main.ftl"), true);
    assert.deepEqual(inserted, ["main.ftl"]);
  });
});
