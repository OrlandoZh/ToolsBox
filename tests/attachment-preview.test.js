/**
 * Attachment Preview Panel Tests
 * Tests for sidePanelArgs + render hijack right-sidebar PDF preview.
 */
import { describe, it, beforeEach, afterEach, assert } from "./test-framework.js";
import { createAttachmentPreview } from "../src/features/attachment-preview.js";

function createMockMainWindow() {
  const elements = [];
  const intervals = new Set();
  let renderCallCount = 0;

  const librarySidenav = {
    tagName: 'div',
    render: function () { renderCallCount++; },
    _render: null,
    getAttribute() { return null; },
    setAttribute() {},
    addEventListener() {},
    querySelector() { return null; },
    children: [],
  };

  const readerSidenav = {
    tagName: 'div',
    render: function () {},
    _render: null,
    getAttribute() { return null; },
    setAttribute() {},
    addEventListener() {},
    querySelector() { return null; },
    children: [],
  };

  const itemPaneContent = {
    tagName: 'deck',
    querySelector() { return null; },
    appendChild(el) { elements.push(el); },
  };

  return {
    elements,
    intervals,
    librarySidenav,
    readerSidenav,
    renderCallCount: () => renderCallCount,
    document: {
      querySelector(selector) {
        if (selector === '#zotero-view-item-sidenav') return librarySidenav;
        if (selector === '#zotero-item-pane-content') return itemPaneContent;
        if (selector === '#zotero-context-pane-sidenav') return readerSidenav;
        return null;
      },
      createElementNS(ns, tagName) {
        const el = {
          tagName: tagName,
          id: '',
          classList: { add() {} },
          style: {},
          children: [],
          setAttribute() {},
          appendChild(child) { this.children.push(child); },
          remove() { this.removed = true; },
        };
        elements.push(el);
        return el;
      },
      createElement(tagName) {
        const el = {
          tagName: tagName,
          id: '',
          className: '',
          children: [],
          setAttribute() {},
          appendChild(child) { this.children.push(child); },
          remove() { this.removed = true; },
        };
        elements.push(el);
        return el;
      },
    },
    setInterval(fn, ms) {
      const id = intervals.size + 1;
      intervals.add(id);
      return id;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
    setTimeout(fn) { fn(); },
    MozXULElement: {
      parseXULToFragment(xul) {
        const frag = document.createDocumentFragment();
        return frag;
      },
    },
  };
}

describe("Attachment Preview", () => {
  let mockZotero;
  let mockWindow;

  beforeEach(() => {
    mockWindow = createMockMainWindow();
    mockZotero = {
      sidePanelArgs: null,
      debug() {},
      getMainWindow() {
        return mockWindow;
      },
      Promise: {
        delay(ms) {
          return new Promise((resolve) => setTimeout(resolve, 1));
        },
      },
    };
  });

  afterEach(() => {
    delete globalThis.Zotero;
  });

  it("should register with proper API and return true", () => {
    const preview = createAttachmentPreview({ zotero: mockZotero });
    const result = preview.register();

    assert.ok(result, "register should return true");
    assert.ok(mockZotero.sidePanelArgs, "sidePanelArgs should be created");
    assert.equal(mockZotero.sidePanelArgs.length, 1, "should register one panel");
    assert.equal(mockZotero.sidePanelArgs[0].name, 'preview');
    assert.equal(mockZotero.sidePanelArgs[0].type, 'library');
    assert.equal(mockZotero.sidePanelArgs[0].icon, 'chrome://toolsbox/content/icons/preview.svg');
    assert.typeOf(mockZotero.sidePanelArgs[0].buildContent, 'function');
  });

  it("should be idempotent on register", () => {
    const preview = createAttachmentPreview({ zotero: mockZotero });

    assert.ok(preview.register(), "first register should return true");
    assert.ok(preview.register(), "second register should return true");
    assert.equal(mockZotero.sidePanelArgs.length, 1, "second register should skip push (idempotent)");
  });

  it("should skip registration when Zotero unavailable", () => {
    const preview = createAttachmentPreview({ zotero: null });
    assert.equal(preview.register(), false);
  });

  it("should cleanup intervals and clear state", () => {
    const preview = createAttachmentPreview({ zotero: mockZotero });
    preview.register();

    const result = preview.cleanup();

    assert.ok(result.stopped, "cleanup should indicate stopped");
    assert.ok(result.resources.includes('sidePanelArgs'), "should report sidePanelArgs resource");
    assert.ok(result.resources.includes('sidenav-hijack'), "should report sidenav-hijack resource");
    assert.ok(result.resources.includes('preview-elements'), "should report preview-elements resource");
  });

  it("should make cleanup idempotent", () => {
    const preview = createAttachmentPreview({ zotero: mockZotero });
    preview.register();

    const first = preview.cleanup();
    const second = preview.cleanup();

    assert.deepEqual(second, { stopped: true, resources: ['sidePanelArgs', 'sidenav-hijack', 'preview-elements'] });
    assert.equal(first.stopped, second.stopped);
  });

  it("should expose destroy as alias for cleanup", () => {
    const preview = createAttachmentPreview({ zotero: mockZotero });
    preview.register();

    const result = preview.destroy();

    assert.ok(result.stopped);
    assert.ok(Array.isArray(result.resources));
  });

  it("should hijack library sidenav render", () => {
    const preview = createAttachmentPreview({ zotero: mockZotero });
    preview.register();

    assert.ok(mockWindow.librarySidenav._render, "sidenav._render should be saved");
    assert.typeOf(mockWindow.librarySidenav.render, 'function', "sidenav.render should be replaced");
    assert.equal(mockWindow.renderCallCount(), 1, "initial render should have been triggered");
  });

  it("should hijack reader sidenav render", () => {
    const preview = createAttachmentPreview({ zotero: mockZotero });
    preview.register();

    assert.ok(mockWindow.readerSidenav._render, "reader sidenav._render should be saved");
    assert.typeOf(mockWindow.readerSidenav.render, 'function', "reader sidenav.render should be replaced");
  });
});
