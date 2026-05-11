/**
 * Tests for Annotation Column feature
 * Task 2 of P1 ItemTree columns plan
 */

import { describe, it, assert, runTests } from "../test-framework.js";
import { createAnnotationColumn } from "../../src/features/annotation-column.js";

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
        },
        getContext(contextType) {
          // Mock canvas 2d context
          return {
            fillRect: function() {},
            fillStyle: '',
            clearRect: function() {}
          };
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

function createMockAnnotation() {
  return {
    page: 1,
    type: 'highlight',
    text: 'Sample annotation'
  };
}

describe("AnnotationColumn", () => {
  it("should register column with ItemTreeManager", () => {
    const mockDoc = createMockDocument();
    const mockZotero = {
      ItemTreeManager: {
        registerColumn: function(options) {
          this.lastRegistration = options;
        }
      },
      Annotations: {
        getByItemID: function() {
          return [];
        }
      },
      getMainWindow() {
        return { document: mockDoc };
      }
    };

    const mockLogger = createMockLogger();
    const mockI18n = createMockI18n();

    const column = createAnnotationColumn({
      logger: mockLogger,
      i18n: mockI18n,
      zotero: mockZotero
    });

    column.register();

    assert.ok(mockZotero.ItemTreeManager.lastRegistration, "Column should be registered");
    assert.equal(mockZotero.ItemTreeManager.lastRegistration.dataKey, 'annotationDist', "dataKey should be annotationDist");
    assert.equal(column.dataKey, 'annotationDist', "column.dataKey should be annotationDist");
    assert.typeOf(mockZotero.ItemTreeManager.lastRegistration.renderCell, 'function', "renderCell should be a function");
  });

  it("should return false when ItemTreeManager is not available", () => {
    const mockZotero = {};
    const mockLogger = createMockLogger();
    const mockI18n = createMockI18n();

    const column = createAnnotationColumn({
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

  it("should render empty cell when no annotations", () => {
    const mockDoc = createMockDocument();
    const mockZotero = {
      Annotations: {
        getByItemID: function() {
          return [];
        }
      },
      getMainWindow() {
        return { document: mockDoc };
      }
    };

    const column = createAnnotationColumn({
      logger: createMockLogger(),
      zotero: mockZotero
    });

    const cell = column.renderCell(mockDoc, [], { totalPages: 10 });

    assert.ok(cell, "Cell should be created");
    assert.equal(cell.textContent, '-', "Empty annotations should show '-'");
    assert.ok(cell.style.opacity, "Empty cell should have opacity style");
  });

  it("should render bar style visualization", () => {
    const mockDoc = createMockDocument();
    const mockZotero = {
      Annotations: {
        getByItemID: function() {
          return [];
        }
      },
      getMainWindow() {
        return { document: mockDoc };
      }
    };

    const annotations = [
      { page: 1, type: 'highlight' },
      { page: 3, type: 'note' },
      { page: 5, type: 'highlight' }
    ];

    const column = createAnnotationColumn({
      logger: createMockLogger(),
      zotero: mockZotero,
      style: 'bar'
    });

    const cell = column.renderCell(mockDoc, annotations, { totalPages: 10 });

    assert.ok(cell, "Cell should be created");
    assert.equal(cell.className, 'annotation-column-cell', "Cell should have correct className");

    // Should have canvas element for bar style
    const canvas = cell._children?.find(c => c.tagName === 'canvas');
    assert.ok(canvas, "Bar style should use canvas element");
  });

  it("should render circle style visualization", () => {
    const mockDoc = createMockDocument();
    const mockZotero = {
      Annotations: {
        getByItemID: function() {
          return [];
        }
      },
      getMainWindow() {
        return { document: mockDoc };
      }
    };

    const annotations = [
      { page: 1, type: 'highlight' },
      { page: 2, type: 'note' },
      { page: 3, type: 'highlight' }
    ];

    const column = createAnnotationColumn({
      logger: createMockLogger(),
      zotero: mockZotero,
      style: 'circle'
    });

    const cell = column.renderCell(mockDoc, annotations, { totalPages: 10 });

    assert.ok(cell, "Cell should be created");

    // Circle style should have dot elements
    const dots = cell._children?.filter(c => c.className === 'annotation-dot');
    assert.ok(dots, "Circle style should have dot elements");
    assert.equal(dots.length, 3, "Should have 3 dots for 3 annotations");
  });

  it("should convert hex color to rgba correctly", () => {
    const column = createAnnotationColumn({
      logger: createMockLogger()
    });

    const rgba1 = column.hexToRgba('#86C8BC', 0.7);
    assert.ok(rgba1.includes('rgba'), "Should return rgba format");
    assert.ok(rgba1.includes('134'), "Should have correct red value");
    assert.ok(rgba1.includes('200'), "Should have correct green value");
    assert.ok(rgba1.includes('188'), "Should have correct blue value");
    assert.ok(rgba1.includes('0.7'), "Should have correct opacity");

    const rgba2 = column.hexToRgba('#FF5733', 0.5);
    assert.ok(rgba2.includes('rgba'), "Should return rgba format");
    assert.ok(rgba2.includes('255'), "Should have correct red value for FF");
    assert.ok(rgba2.includes('87'), "Should have correct green value for 57");
    assert.ok(rgba2.includes('51'), "Should have correct blue value for 33");
    assert.ok(rgba2.includes('0.5'), "Should have correct opacity");
  });

  it("should get annotations from item", () => {
    const mockZotero = {
      Annotations: {
        getByItemID: function(itemID) {
          if (itemID === 1) {
            return [
              { page: 1, type: 'highlight', text: 'Annotation 1' },
              { page: 2, type: 'note', text: 'Annotation 2' }
            ];
          }
          return [];
        }
      }
    };

    const column = createAnnotationColumn({
      logger: createMockLogger(),
      zotero: mockZotero
    });

    const mockItem = {
      id: 1,
      isAttachment: function() {
        return true;
      }
    };

    const annotations = column.getAnnotations(mockItem);

    assert.ok(annotations, "Should return annotations");
    assert.equal(annotations.length, 2, "Should have 2 annotations");
  });

  it("should return empty array for non-attachment items", () => {
    const mockZotero = {
      Annotations: {
        getByItemID: function() {
          return [{ page: 1, type: 'highlight' }];
        }
      }
    };

    const column = createAnnotationColumn({
      logger: createMockLogger(),
      zotero: mockZotero
    });

    const mockItem = {
      id: 1,
      isAttachment: function() {
        return false;
      }
    };

    const annotations = column.getAnnotations(mockItem);

    assert.ok(annotations, "Should return array");
    assert.equal(annotations.length, 0, "Should return empty for non-attachment");
  });

  it("should return empty array for null/undefined items", () => {
    const mockZotero = {
      Annotations: {
        getByItemID: function() {
          return [];
        }
      }
    };

    const column = createAnnotationColumn({
      logger: createMockLogger(),
      zotero: mockZotero
    });

    assert.equal(column.getAnnotations(null).length, 0, "Null item should return empty array");
    assert.equal(column.getAnnotations(undefined).length, 0, "Undefined item should return empty array");
    assert.equal(column.getAnnotations({}).length, 0, "Item without id should return empty array");
  });

  it("should use custom color and opacity from preferences", () => {
    const mockDoc = createMockDocument();
    const mockZotero = {
      Annotations: {
        getByItemID: function() {
          return [];
        }
      },
      getMainWindow() {
        return { document: mockDoc };
      }
    };

    const annotations = [
      { page: 1, type: 'highlight' }
    ];

    const column = createAnnotationColumn({
      logger: createMockLogger(),
      zotero: mockZotero,
      style: 'circle',
      color: '#FF5733',
      opacity: 0.5
    });

    const cell = column.renderCell(mockDoc, annotations, { totalPages: 10 });

    const dot = cell._children?.find(c => c.className === 'annotation-dot');
    assert.ok(dot, "Should have dot element");

    assert.ok(dot.style.backgroundColor.includes('#FF5733'), "Should use custom color");
    assert.ok(dot.style.opacity.includes('0.5'), "Should use custom opacity");
  });

  it("should use default preferences when not provided", () => {
    const column = createAnnotationColumn({
      logger: createMockLogger()
    });

    // Should have default values
    assert.equal(column.dataKey, 'annotationDist', "Default dataKey should be annotationDist");
    assert.equal(column.style, 'bar', "Default style should be bar");
    assert.equal(column.color, '#86C8BC', "Default color should be #86C8BC");
    assert.equal(column.opacity, 0.7, "Default opacity should be 0.7");
  });

  it("should use globalThis.Zotero when zotero option not provided", () => {
    const mockDoc = createMockDocument();
    globalThis.Zotero = {
      ItemTreeManager: {
        registerColumn: function(options) {
          this.lastRegistration = options;
        }
      },
      Annotations: {
        getByItemID: function() {
          return [];
        }
      },
      getMainWindow() {
        return { document: mockDoc };
      }
    };

    const mockLogger = createMockLogger();
    const mockI18n = createMockI18n();

    const column = createAnnotationColumn({
      logger: mockLogger,
      i18n: mockI18n
    });

    column.register();

    assert.ok(globalThis.Zotero.ItemTreeManager.lastRegistration, "Should use global Zotero");
    delete globalThis.Zotero;
  });

  it("should handle annotations with missing page property", () => {
    const mockDoc = createMockDocument();
    const mockZotero = {
      Annotations: {
        getByItemID: function() {
          return [];
        }
      },
      getMainWindow() {
        return { document: mockDoc };
      }
    };

    const annotations = [
      { type: 'highlight' }, // missing page
      { page: 2, type: 'note' }
    ];

    const column = createAnnotationColumn({
      logger: createMockLogger(),
      zotero: mockZotero,
      style: 'bar'
    });

    const cell = column.renderCell(mockDoc, annotations, { totalPages: 10 });

    assert.ok(cell, "Should handle annotations with missing page");
    // Should still render, treating missing page as 0 or ignoring it
  });

  it("should limit dots in circle style to prevent overflow", () => {
    const mockDoc = createMockDocument();
    const mockZotero = {
      Annotations: {
        getByItemID: function() {
          return [];
        }
      },
      getMainWindow() {
        return { document: mockDoc };
      }
    };

    // Create many annotations to test limit
    const annotations = [];
    for (let i = 0; i < 100; i++) {
      annotations.push({ page: i + 1, type: 'highlight' });
    }

    const column = createAnnotationColumn({
      logger: createMockLogger(),
      zotero: mockZotero,
      style: 'circle',
      maxDots: 20
    });

    const cell = column.renderCell(mockDoc, annotations, { totalPages: 100 });

    const dots = cell._children?.filter(c => c.className === 'annotation-dot');
    assert.ok(dots, "Should have dot elements");
    assert.ok(dots.length <= 20, "Should limit dots to maxDots");
  });
});

runTests();
