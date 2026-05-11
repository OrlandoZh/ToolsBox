/**
 * Tests for Attachment Preview Panel feature
 * Task 2 of P0 features plan
 */

import { describe, it, assert, runTests } from "../test-framework.js";
import { createAttachmentPreview } from "../../src/features/attachment-preview.js";

// Mock dependencies
function createMockLogger() {
  const logs = [];
  return {
    debug(message, data) {
      logs.push({ level: 'debug', message, data });
    },
    error(message, data) {
      logs.push({ level: 'error', message, data });
    },
    info(message, data) {
      logs.push({ level: 'info', message, data });
    },
    getLogs() {
      return logs;
    }
  };
}

function createMockI18n() {
  return {
    t(key, fallback) {
      return fallback || key;
    }
  };
}

describe("AttachmentPreview", () => {
  it("should register section with ItemPaneManager", () => {
    const mockZotero = {
      ItemPaneManager: {
        registerSection: function(options) {
          this.lastRegistration = options;
        }
      }
    };

    const mockLogger = createMockLogger();
    const mockI18n = createMockI18n();

    const preview = createAttachmentPreview({
      logger: mockLogger,
      i18n: mockI18n,
      zotero: mockZotero
    });

    preview.register();

    assert.ok(mockZotero.ItemPaneManager.lastRegistration, "Section should be registered");
    assert.equal(mockZotero.ItemPaneManager.lastRegistration.paneID, 'toolsbox-attachment-preview', "paneID should be toolsbox-attachment-preview");
    assert.equal(preview.sectionID, 'toolsbox-attachment-preview', "sectionID should be toolsbox-attachment-preview");
  });

  it("should return false when ItemPaneManager is not available", () => {
    const mockZotero = {};
    const mockLogger = createMockLogger();
    const mockI18n = createMockI18n();

    const preview = createAttachmentPreview({
      logger: mockLogger,
      i18n: mockI18n,
      zotero: mockZotero
    });

    const result = preview.register();

    assert.equal(result, false, "register() should return false when ItemPaneManager unavailable");

    const logs = mockLogger.getLogs();
    const errorLog = logs.find(l => l.level === 'error');
    assert.ok(errorLog, "Should log error when registration fails");
  });

  it("should use globalThis.Zotero when zotero option not provided", () => {
    globalThis.Zotero = {
      ItemPaneManager: {
        registerSection: function(options) {
          this.lastRegistration = options;
        }
      }
    };

    const mockLogger = createMockLogger();
    const mockI18n = createMockI18n();

    const preview = createAttachmentPreview({
      logger: mockLogger,
      i18n: mockI18n
    });

    preview.register();

    assert.ok(globalThis.Zotero.ItemPaneManager.lastRegistration, "Should use global Zotero");

    // Cleanup
    delete globalThis.Zotero;
  });

  it("should render preview container in onItemChange", () => {
    const mockDoc = {
      createElement: function(tag) {
        return {
          className: '',
          style: {},
          appendChild: function() {}
        };
      }
    };

    let capturedOnItemChange = null;
    const mockZotero = {
      ItemPaneManager: {
        registerSection: function(options) {
          capturedOnItemChange = options.onItemChange;
        }
      }
    };

    const mockLogger = createMockLogger();
    const mockI18n = createMockI18n();

    const preview = createAttachmentPreview({
      logger: mockLogger,
      i18n: mockI18n,
      zotero: mockZotero
    });

    preview.register();

    assert.ok(capturedOnItemChange, "Should have onItemChange handler");

    const container = capturedOnItemChange({ item: null, doc: mockDoc });
    assert.ok(container, "Should return container element");
    assert.equal(container.className, 'attachment-preview-container', "Should have correct class name");
  });
});

// Run all tests
runTests();
