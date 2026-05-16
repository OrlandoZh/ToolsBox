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
    warn(message, data) {
      logs.push({ level: 'warn', message, data });
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
        textContent: '',
        src: '',
        appendChild(child) {
          this.children.push(child);
        },
        remove() {
          this.removed = true;
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
    assert.equal(logger.logs.filter(l => l.level === 'warn').length, 1, "should log warning");
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
    assert.equal(container.children[0].src, 'moz-file://%2Fpath%2Fto%2Ffile.pdf');
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
    assert.equal(container.children.length, 1, "should render an empty-state child for non-attachment");
    assert.equal(container.children[0].className, 'attachment-preview-empty');
    assert.equal(container.children[0].textContent, 'No attachment selected');
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
    assert.equal(container.children.length, 1, "should render an empty-state child when no file path");
    assert.equal(container.children[0].className, 'attachment-preview-empty');
    assert.equal(container.children[0].textContent, 'File not found');
  });

  it("should cleanup old iframe before rendering a new preview", () => {
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const doc = createMockDocument();
    const firstItem = createMockItem(true, '/path/to/first.pdf');
    const secondItem = createMockItem(true, '/path/to/second.pdf');

    const preview = createAttachmentPreview({ logger, i18n, zotero: mockZotero });
    preview.register();

    const section = registeredSections[0];
    const firstContainer = section.onItemChange({ item: firstItem, doc });
    const firstIframe = firstContainer.children[0];
    const secondContainer = section.onItemChange({ item: secondItem, doc });

    assert.equal(firstIframe.src, 'about:blank');
    assert.equal(firstIframe.removed, true);
    assert.equal(secondContainer.children[0].src, 'moz-file://%2Fpath%2Fto%2Fsecond.pdf');
  });

  it("should make cleanup idempotent", () => {
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const doc = createMockDocument();
    const mockItem = createMockItem(true, '/path/to/file.pdf');

    const preview = createAttachmentPreview({ logger, i18n, zotero: mockZotero });
    preview.register();

    registeredSections[0].onItemChange({ item: mockItem, doc });
    const first = preview.cleanup();
    const second = preview.cleanup();

    assert.deepEqual(first, { stopped: true, resources: ['iframe'] });
    assert.deepEqual(second, { stopped: true, resources: ['iframe'] });
  });
});
