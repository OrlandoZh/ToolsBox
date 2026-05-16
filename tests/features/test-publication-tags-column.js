/**
 * Tests for Publication Tags Column feature
 * Displays journal ranking badges (SCI, SSCI, IF quartile, etc.)
 */

import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import { createPublicationTagsColumn } from "../../src/features/publication-tags-column.js";

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

function createMockDocument() {
  const elements = [];
  return {
    createElement(tag) {
      const element = {
        tagName: tag,
        className: '',
        style: {},
        textContent: '',
        appendChild(child) {
          element._children = element._children || [];
          element._children.push(child);
        }
      };
      elements.push(element);
      return element;
    },
    getElements() {
      return elements;
    }
  };
}

describe("PublicationTagsColumn", () => {
  it("should register column with ItemTreeManager", () => {
    const mockDoc = createMockDocument();
    const mockZotero = {
      ItemTreeManager: {
        registerColumn: function(options) {
          this.lastRegistration = options;
        }
      },
      getMainWindow() {
        return { document: mockDoc };
      }
    };

    const mockLogger = createMockLogger();
    const mockI18n = createMockI18n();

    const column = createPublicationTagsColumn({
      logger: mockLogger,
      i18n: mockI18n,
      zotero: mockZotero
    });

    column.register();

    assert.ok(mockZotero.ItemTreeManager.lastRegistration, "Column should be registered");
    assert.equal(mockZotero.ItemTreeManager.lastRegistration.dataKey, 'publicationTags', "dataKey should be publicationTags");
    assert.equal(column.dataKey, 'publicationTags', "column.dataKey should be publicationTags");
    assert.typeOf(mockZotero.ItemTreeManager.lastRegistration.renderCell, 'function', "renderCell should be a function");
  });

  it("should return false when ItemTreeManager is not available", () => {
    const mockZotero = {};
    const mockLogger = createMockLogger();
    const mockI18n = createMockI18n();

    const column = createPublicationTagsColumn({
      logger: mockLogger,
      i18n: mockI18n,
      zotero: mockZotero
    });

    const result = column.register();

    assert.equal(result, false, "register() should return false when ItemTreeManager unavailable");

    const logs = mockLogger.getLogs();
    const errorLog = logs.find(l => l.level === 'error');
    assert.ok(errorLog, "Should log error when registration fails");
  });

  it("should render empty cell when no tags", () => {
    const mockDoc = createMockDocument();
    const mockZotero = {
      getMainWindow() {
        return { document: mockDoc };
      }
    };

    const column = createPublicationTagsColumn({
      logger: createMockLogger(),
      zotero: mockZotero
    });

    const cell = column.renderCell(mockDoc, []);

    assert.ok(cell, "Cell should be created");
    assert.equal(cell.textContent, '-', "Empty tags should show '-'");
    assert.ok(cell.style.opacity, "Empty cell should have opacity style");
  });

  it("should return correct tags for Nature journal", () => {
    const column = createPublicationTagsColumn({
      logger: createMockLogger()
    });

    const tags = column.getJournalTags('Nature');
    assert.ok(tags, "Should return tags for Nature");
    assert.ok(tags.includes('SCI-Q1'), "Nature should have SCI-Q1 tag");
    assert.ok(tags.includes('IF>30'), "Nature should have IF>30 tag");
    assert.ok(tags.includes('Top'), "Nature should have Top tag");
  });

  it("should return correct tags for Science journal", () => {
    const column = createPublicationTagsColumn({
      logger: createMockLogger()
    });

    const tags = column.getJournalTags('Science');
    assert.ok(tags.includes('SCI-Q1'), "Science should have SCI-Q1 tag");
    assert.ok(tags.includes('IF>30'), "Science should have IF>30 tag");
  });

  it("should return SCI-Q2 for mid-tier journal", () => {
    const column = createPublicationTagsColumn({
      logger: createMockLogger()
    });

    const tags = column.getJournalTags('Journal of Biological Chemistry');
    assert.ok(tags, "Should return tags");
    assert.ok(tags.includes('SCI-Q2'), "JBC should have SCI-Q2 tag");
  });

  it("should return SSCI tags for social science journal", () => {
    const column = createPublicationTagsColumn({
      logger: createMockLogger()
    });

    const tags = column.getJournalTags('Journal of Personality and Social Psychology');
    assert.ok(tags.includes('SSCI'), "Should have SSCI tag for social science journal");
    assert.ok(tags.includes('SSCI-Q1'), "Should have SSCI-Q1 tag");
  });

  it("should render colored badges based on quartile", () => {
    const mockDoc = createMockDocument();
    const mockZotero = {
      getMainWindow() {
        return { document: mockDoc };
      }
    };

    const column = createPublicationTagsColumn({
      logger: createMockLogger(),
      zotero: mockZotero
    });

    const tags = ['SCI-Q1', 'IF>10'];
    const cell = column.renderCell(mockDoc, tags);

    assert.ok(cell, "Cell should be created");
    assert.ok(cell._children, "Cell should have badge children");

    const badges = cell._children.filter(c => c.className === 'pub-tag-badge');
    assert.ok(badges.length > 0, "Should have badge elements");

    const q1Badge = badges.find(b => b.textContent === 'SCI-Q1');
    assert.ok(q1Badge, "Should have SCI-Q1 badge");
    assert.ok(q1Badge.style.backgroundColor, "Badge should have background color");
  });

  it("should use correct colors for each quartile", () => {
    const column = createPublicationTagsColumn({
      logger: createMockLogger()
    });

    const q1Color = column.getTagColor('SCI-Q1');
    const q2Color = column.getTagColor('SCI-Q2');
    const q3Color = column.getTagColor('SCI-Q3');
    const q4Color = column.getTagColor('SCI-Q4');

    assert.ok(q1Color, "Q1 should have color");
    assert.ok(q2Color, "Q2 should have color");
    assert.ok(q3Color, "Q3 should have color");
    assert.ok(q4Color, "Q4 should have color");

    assert.ok(q1Color.includes('#') || q1Color.includes('rgb'), "Q1 color should be valid");
  });

  it("should return empty array for unknown journal", () => {
    const column = createPublicationTagsColumn({
      logger: createMockLogger()
    });

    const tags = column.getJournalTags('Unknown Journal Name');
    assert.ok(Array.isArray(tags), "Should return array");
    assert.equal(tags.length, 0, "Unknown journal should return empty array");
  });

  it("should extract publication title from item", () => {
    const mockItem = {
      id: 1,
      getField(field) {
        if (field === 'publicationTitle') return 'Nature';
        return '';
      }
    };

    const column = createPublicationTagsColumn({
      logger: createMockLogger()
    });

    const tags = column.dataProvider(mockItem, 'publicationTags');

    assert.ok(Array.isArray(tags), "Should return array");
    assert.ok(tags.length > 0, "Nature should have tags");
    assert.ok(tags.includes('SCI-Q1'), "Should have SCI-Q1 tag");
  });

  it("should return empty array for item without publication title", () => {
    const mockItem = {
      id: 1,
      getField(field) {
        return '';
      }
    };

    const column = createPublicationTagsColumn({
      logger: createMockLogger()
    });

    const tags = column.dataProvider(mockItem, 'publicationTags');

    assert.ok(Array.isArray(tags), "Should return array");
    assert.equal(tags.length, 0, "Should return empty array");
  });

  it("should use globalThis.Zotero when zotero option not provided", () => {
    const mockDoc = createMockDocument();
    globalThis.Zotero = {
      ItemTreeManager: {
        registerColumn: function(options) {
          this.lastRegistration = options;
        }
      },
      getMainWindow() {
        return { document: mockDoc };
      }
    };

    const mockLogger = createMockLogger();
    const mockI18n = createMockI18n();

    const column = createPublicationTagsColumn({
      logger: mockLogger,
      i18n: mockI18n
    });

    column.register();

    assert.ok(globalThis.Zotero.ItemTreeManager.lastRegistration, "Should use global Zotero");
    delete globalThis.Zotero;
  });

  it("should handle case-insensitive journal name matching", () => {
    const column = createPublicationTagsColumn({
      logger: createMockLogger()
    });

    const tags1 = column.getJournalTags('nature');
    const tags2 = column.getJournalTags('NATURE');
    const tags3 = column.getJournalTags('Nature');

    assert.ok(tags1.length > 0, "Lowercase 'nature' should match");
    assert.ok(tags2.length > 0, "Uppercase 'NATURE' should match");
    assert.ok(tags3.length > 0, "Title case 'Nature' should match");
    assert.deepEqual(tags1, tags2, "Case variations should produce same results");
    assert.deepEqual(tags2, tags3, "Case variations should produce same results");
  });

  it("should support sorting by tag priority", () => {
    const column = createPublicationTagsColumn({
      logger: createMockLogger()
    });

    const priority1 = column.getTagPriority('SCI-Q1');
    const priority2 = column.getTagPriority('SCI-Q2');
    const priorityTop = column.getTagPriority('Top');

    assert.ok(priority1 > priority2, "Q1 should have higher priority than Q2");
    assert.ok(priorityTop > priority1, "Top should have highest priority");
  });

  it("should return empty array for null/undefined items in dataProvider", () => {
    const column = createPublicationTagsColumn({
      logger: createMockLogger()
    });

    assert.equal(column.dataProvider(null, 'publicationTags').length, 0, "Null item should return empty array");
    assert.equal(column.dataProvider(undefined, 'publicationTags').length, 0, "Undefined item should return empty array");
    assert.equal(column.dataProvider({}, 'publicationTags').length, 0, "Item without id should return empty array");
  });
});

await runTestsIfMain(import.meta.url);
