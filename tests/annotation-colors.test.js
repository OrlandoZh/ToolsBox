/**
 * Annotation Colors Tests
 * Tests for annotation color management feature
 */
import { describe, it, beforeEach, afterEach, assert } from "./test-framework.js";
import { createAnnotationColors } from "../src/features/annotation-colors.js";

function createMockLogger() {
  const logs = [];
  return {
    logs,
    debug(message, data) {
      logs.push({ level: 'debug', message, data });
    },
    info(message, data) {
      logs.push({ level: 'info', message, data });
    },
    warn(message, data) {
      logs.push({ level: 'warn', message, data });
    },
    error(message, data) {
      logs.push({ level: 'error', message, data });
    }
  };
}

function createMockAnnotation(id, color = '#ffd700') {
  return {
    id,
    color,
    setColor: function(newColor) {
      this.color = newColor;
    }
  };
}

function createMockZotero(annotations = new Map()) {
  return {
    Annotations: {
      get: (id) => annotations.get(id) || null
    },
    debug: (message) => {}
  };
}

describe("Annotation Colors", () => {
  let mockZotero;
  let annotations;
  let logger;

  beforeEach(() => {
    logger = createMockLogger();
    annotations = new Map();
    annotations.set('annot1', createMockAnnotation('annot1', '#ffd700'));
    annotations.set('annot2', createMockAnnotation('annot2', '#ff6b6b'));
    annotations.set('annot3', createMockAnnotation('annot3', '#4ecdc4'));

    mockZotero = createMockZotero(annotations);
    globalThis.Zotero = mockZotero;
  });

  afterEach(() => {
    delete globalThis.Zotero;
  });

  // Color lookup tests
  it("should return correct color name for valid hex color", () => {
    const colorManager = createAnnotationColors({ logger, zotero: mockZotero });

    assert.equal(colorManager.getColorName('#ffd700'), 'Important');
    assert.equal(colorManager.getColorName('#ff6b6b'), 'Key Point');
    assert.equal(colorManager.getColorName('#4ecdc4'), 'Method');
  });

  it("should return null for invalid hex color", () => {
    const colorManager = createAnnotationColors({ logger, zotero: mockZotero });

    assert.equal(colorManager.getColorName('#invalid'), null);
    assert.equal(colorManager.getColorName('notacolor'), null);
    assert.equal(colorManager.getColorName('#12345'), null);
  });

  it("should return null for null/undefined color", () => {
    const colorManager = createAnnotationColors({ logger, zotero: mockZotero });

    assert.equal(colorManager.getColorName(null), null);
    assert.equal(colorManager.getColorName(undefined), null);
    assert.equal(colorManager.getColorName(''), null);
  });

  it("should handle case-insensitive color matching", () => {
    const colorManager = createAnnotationColors({ logger, zotero: mockZotero });

    assert.equal(colorManager.getColorName('#FFD700'), 'Important');
    assert.equal(colorManager.getColorName('#FfD700'), 'Important');
  });

  // Group filtering tests
  it("should return colors for Priority group", () => {
    const colorManager = createAnnotationColors({ logger, zotero: mockZotero });

    const priorityColors = colorManager.getColorsByGroup('Priority');

    assert.ok(priorityColors.length === 2, "Priority group should have 2 colors");
    assert.ok(priorityColors.some(c => c.name === 'Important'));
    assert.ok(priorityColors.some(c => c.name === 'Key Point'));
  });

  it("should return colors for Content group", () => {
    const colorManager = createAnnotationColors({ logger, zotero: mockZotero });

    const contentColors = colorManager.getColorsByGroup('Content');

    assert.ok(contentColors.length === 3, "Content group should have 3 colors");
    assert.ok(contentColors.some(c => c.name === 'Method'));
    assert.ok(contentColors.some(c => c.name === 'Result'));
    assert.ok(contentColors.some(c => c.name === 'Background'));
  });

  it("should return colors for Other group", () => {
    const colorManager = createAnnotationColors({ logger, zotero: mockZotero });

    const otherColors = colorManager.getColorsByGroup('Other');

    assert.ok(otherColors.length === 3, "Other group should have 3 colors");
    assert.ok(otherColors.some(c => c.name === 'Question'));
    assert.ok(otherColors.some(c => c.name === 'Idea'));
    assert.ok(otherColors.some(c => c.name === 'Todo'));
  });

  it("should return empty array for invalid group", () => {
    const colorManager = createAnnotationColors({ logger, zotero: mockZotero });

    const invalidGroup = colorManager.getColorsByGroup('InvalidGroup');

    assert.ok(Array.isArray(invalidGroup), "Should return array");
    assert.equal(invalidGroup.length, 0);
  });

  it("should return empty array for null/undefined group", () => {
    const colorManager = createAnnotationColors({ logger, zotero: mockZotero });

    assert.equal(colorManager.getColorsByGroup(null).length, 0);
    assert.equal(colorManager.getColorsByGroup(undefined).length, 0);
    assert.equal(colorManager.getColorsByGroup('').length, 0);
  });

  // Get all colors tests
  it("should return all colors with names and hex values", () => {
    const colorManager = createAnnotationColors({ logger, zotero: mockZotero });

    const allColors = colorManager.getAllColors();

    assert.ok(Array.isArray(allColors), "Should return array");
    assert.ok(allColors.length === 8, "Should have 8 colors");

    allColors.forEach(color => {
      assert.ok(color.name, "Each color should have a name");
      assert.ok(color.hex, "Each color should have a hex value");
      assert.ok(color.group, "Each color should belong to a group");
    });
  });

  // Annotation color application tests
  it("should apply color to existing annotation", async () => {
    const colorManager = createAnnotationColors({ logger, zotero: mockZotero });

    const result = await colorManager.applyColorToAnnotation('annot1', '#ff6b6b');

    assert.ok(result.success, "Should return success");
    assert.equal(annotations.get('annot1').color, '#ff6b6b');
  });

  it("should return error for non-existent annotation", async () => {
    const colorManager = createAnnotationColors({ logger, zotero: mockZotero });

    const result = await colorManager.applyColorToAnnotation('nonexistent', '#ff6b6b');

    assert.notOk(result.success, "Should return failure");
    assert.ok(result.error, "Should have error message");
  });

  it("should return error for invalid color", async () => {
    const colorManager = createAnnotationColors({ logger, zotero: mockZotero });

    const result = await colorManager.applyColorToAnnotation('annot1', 'invalid');

    assert.notOk(result.success, "Should return failure");
    assert.ok(result.error, "Should have error message");
  });

  it("should handle null annotation ID", async () => {
    const colorManager = createAnnotationColors({ logger, zotero: mockZotero });

    const result = await colorManager.applyColorToAnnotation(null, '#ff6b6b');

    assert.notOk(result.success, "Should return failure");
  });

  // Register tests
  it("should register successfully and return true", () => {
    const colorManager = createAnnotationColors({ logger, zotero: mockZotero });

    const result = colorManager.register();

    assert.ok(result, "register should return true");
    assert.ok(logger.logs.some(l => l.message === 'annotationColors.registered'));
  });

  // Color validation tests
  it("should validate hex color format", () => {
    const colorManager = createAnnotationColors({ logger, zotero: mockZotero });

    assert.ok(colorManager.isValidHexColor('#ffd700'));
    assert.ok(colorManager.isValidHexColor('#ABCDEF'));
    assert.ok(colorManager.isValidHexColor('#123456'));

    assert.notOk(colorManager.isValidHexColor('ffd700'));
    assert.notOk(colorManager.isValidHexColor('#ff'));
    assert.notOk(colorManager.isValidHexColor('#fffffff'));
    assert.notOk(colorManager.isValidHexColor(null));
  });

  // Get group names test
  it("should return all group names", () => {
    const colorManager = createAnnotationColors({ logger, zotero: mockZotero });

    const groups = colorManager.getGroupNames();

    assert.ok(Array.isArray(groups), "Should return array");
    assert.ok(groups.includes('Priority'));
    assert.ok(groups.includes('Content'));
    assert.ok(groups.includes('Other'));
    assert.equal(groups.length, 3);
  });
});
