/**
 * Attachment Preview Panel Tests
 * Tests for right sidebar PDF/image preview panel
 */
import { describe, it, beforeEach, afterEach, assert } from "./test-framework.js";
import { createAttachmentPreview } from "../src/features/attachment-preview.js";

function createMockLogger() {
  const logs = [];
  return {
    logs,
    debug(message, data) {
      logs.push({ level: 'debug', message, data });
    },
    error(message, data) {
      logs.push({ level: 'error', message, data });
    },
    info(message, data) {
      logs.push({ level: 'info', message, data });
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

function createMockDocument() {
  const elements = [];
  return {
    createElement(tagName) {
      const element = {
        tagName: tagName.toUpperCase(),
        className: '',
        style: {},
        children: [],
        appendChild(child) {
          this.children.push(child);
        }
      };
      elements.push(element);
      return element;
    },
    elements
  };
}

function createMockItem(isAttachment, filePath) {
  return {
    isAttachment: () => isAttachment,
    getFilePath: () => filePath
  };
}

describe("Attachment Preview", () => {
  let mockZotero;
  let registeredSections;

  beforeEach(() => {
    registeredSections = [];
    
    mockZotero = {
      ItemPaneManager: {
        registerSection(options) {
          registeredSections.push(options);
        }
      }
    };
    
    globalThis.Zotero = mockZotero;
  });

  afterEach(() => {
    delete globalThis.Zotero;
  });

  it("should register with proper API and return true", () => {
    const logger = createMockLogger();
    const i18n = createMockI18n();
    
    const preview = createAttachmentPreview({ logger, i18n, zotero: mockZotero });
    const result = preview.register();
    
    assert.ok(result, "register should return true");
    assert.equal(registeredSections.length, 1, "should register one section");
    assert.equal(registeredSections[0].paneID, 'toolsbox-attachment-preview');
    assert.equal(registeredSections[0].pluginID, 'toolsbox@orlandozh.github');
    assert.typeOf(registeredSections[0].onItemChange, 'function');
    assert.equal(preview.sectionID, 'toolsbox-attachment-preview');
  });

  it("should fail registration when ItemPaneManager not available", () => {
    const logger = createMockLogger();
    const i18n = createMockI18n();
    
    const preview = createAttachmentPreview({ 
      logger, 
      i18n, 
      zotero: { ItemPaneManager: null } 
    });
    const result = preview.register();
    
    assert.notOk(result, "register should return false");
    assert.equal(registeredSections.length, 0, "should not register any section");
    assert.equal(logger.logs.filter(l => l.level === 'error').length, 1, "should log error");
  });

  it("should create preview container for attachment items with file path", () => {
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const doc = createMockDocument();
    const mockItem = createMockItem(true, '/path/to/file.pdf');
    
    const preview = createAttachmentPreview({ logger, i18n, zotero: mockZotero });
    preview.register();
    
    const section = registeredSections[0];
    const container = section.onItemChange({ item: mockItem, doc });
    
    assert.ok(container, "should return container element");
    assert.equal(container.className, 'attachment-preview-container');
    assert.equal(container.children.length, 1, "should have iframe child");
    assert.equal(container.children[0].tagName, 'IFRAME');
    assert.match(container.children[0].src, /file:\/\/\/path\/to\/file.pdf/);
  });

  it("should handle non-attachment items gracefully", () => {
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const doc = createMockDocument();
    const mockItem = createMockItem(false, null);
    
    const preview = createAttachmentPreview({ logger, i18n, zotero: mockZotero });
    preview.register();
    
    const section = registeredSections[0];
    const container = section.onItemChange({ item: mockItem, doc });
    
    assert.ok(container, "should return container element");
    assert.equal(container.className, 'attachment-preview-container');
    assert.equal(container.children.length, 0, "should have no children for non-attachment");
  });

  it("should handle attachment items without file path", () => {
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const doc = createMockDocument();
    const mockItem = createMockItem(true, null);
    
    const preview = createAttachmentPreview({ logger, i18n, zotero: mockZotero });
    preview.register();
    
    const section = registeredSections[0];
    const container = section.onItemChange({ item: mockItem, doc });
    
    assert.ok(container, "should return container element");
    assert.equal(container.className, 'attachment-preview-container');
    assert.equal(container.children.length, 0, "should have no children when no file path");
  });
});
