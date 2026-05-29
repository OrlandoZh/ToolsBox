/**
 * Tests for Attachment Preview Panel feature
 * Uses sidePanelArgs + render hijacking pattern (zoterostyle approach).
 */

import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import { createAttachmentPreview } from "../../src/features/attachment-preview.js";

function createMockLogger() {
  const logs = [];
  return {
    info(msg) { logs.push({ level: 'info', msg }); },
    warn(msg) { logs.push({ level: 'warn', msg }); },
    error(msg) { logs.push({ level: 'error', msg }); },
    getLogs() { return logs; }
  };
}

function createMockWindow(overrides = {}) {
  return {
    document: {
      querySelector: function () { return null; }
    },
    setTimeout: function () {},
    setInterval: function () { return 1; },
    clearInterval: function () {},
    MozXULElement: { parseXULToFragment: function () { return document.createDocumentFragment(); } },
    ...overrides
  };
}

describe("AttachmentPreview", () => {
  it("should register via sidePanelArgs and return true", () => {
    const mockZotero = {
      sidePanelArgs: null,
      getMainWindow: function () { return createMockWindow(); }
    };

    const mockLogger = createMockLogger();
    const preview = createAttachmentPreview({
      logger: mockLogger,
      zotero: mockZotero
    });

    const result = preview.register();

    assert.equal(result, true, "register() should return true");
    assert.ok(Array.isArray(mockZotero.sidePanelArgs), "sidePanelArgs should be initialized as array");
    assert.equal(mockZotero.sidePanelArgs.length, 1, "sidePanelArgs should have one entry");

    const panelArg = mockZotero.sidePanelArgs[0];
    assert.equal(panelArg.name, 'preview', "panel name should be preview");
    assert.equal(panelArg.type, 'library', "panel type should be library");
    assert.ok(panelArg.icon.includes('preview'), "panel icon should reference preview");
  });

  it("should use globalThis.Zotero when zotero option not provided", () => {
    const saved = globalThis.Zotero;
    globalThis.Zotero = {
      sidePanelArgs: null,
      getMainWindow: function () { return createMockWindow(); }
    };

    const preview = createAttachmentPreview({ logger: createMockLogger() });
    const result = preview.register();

    assert.equal(result, true, "Should use globalThis.Zotero fallback and register");

    globalThis.Zotero = saved;
  });

  it("should cleanup and return stopped resources", () => {
    const mockZotero = {
      sidePanelArgs: null,
      getMainWindow: function () { return createMockWindow(); }
    };

    const preview = createAttachmentPreview({
      logger: createMockLogger(),
      zotero: mockZotero
    });

    preview.register();
    const cleanupResult = preview.cleanup();

    assert.ok(cleanupResult.stopped, "cleanup should indicate stopped");
    assert.ok(Array.isArray(cleanupResult.resources), "cleanup should list freed resources");
  });

  it("should be idempotent on register", () => {
    const mockZotero = {
      sidePanelArgs: null,
      getMainWindow: function () { return createMockWindow(); }
    };

    const preview = createAttachmentPreview({
      logger: createMockLogger(),
      zotero: mockZotero
    });

    assert.equal(preview.register(), true, "First register should return true");
    assert.equal(preview.register(), true, "Second register should also return true (idempotent)");
    assert.equal(mockZotero.sidePanelArgs.length, 1, "sidePanelArgs should still have one entry");
  });

  it("should handle missing sidenav gracefully", () => {
    const mockZotero = {
      sidePanelArgs: null,
      getMainWindow: function () { return createMockWindow(); }
    };

    const mockLogger = createMockLogger();
    const preview = createAttachmentPreview({
      logger: mockLogger,
      zotero: mockZotero
    });

    const result = preview.register();
    assert.equal(result, true, "Should still return true even without sidenav");
  });
});

await runTestsIfMain(import.meta.url);
