/**
 * Tests for Annotation Colors feature
 * Provides predefined color scheme with names and groups for PDF annotations
 */

import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import { createAnnotationColors } from "../../src/features/annotation-colors.js";

function createMockLogger() {
  const logs = [];
  return {
    info(msg) { logs.push({ level: 'info', msg }); },
    warn(msg) { logs.push({ level: 'warn', msg }); },
    error(msg) { logs.push({ level: 'error', msg }); },
    debug(msg) { logs.push({ level: 'debug', msg }); },
    getLogs() { return logs; }
  };
}

function createMockZotero(annotationOverrides = {}) {
  return {
    Annotations: {
      get(id) {
        if (!id) return null;
        return {
          id,
          color: '#ff0000',
          setColor(color) { this.color = color; },
          saveTx() { return Promise.resolve(); },
          save() { return Promise.resolve(); },
          ...annotationOverrides
        };
      }
    }
  };
}

describe("AnnotationColors", () => {
  it("should create object with expected methods", () => {
    const feature = createAnnotationColors({
      logger: createMockLogger()
    });

    assert.typeOf(feature.register, 'function', "should have register function");
    assert.typeOf(feature.getColorName, 'function', "should have getColorName function");
    assert.typeOf(feature.getColorsByGroup, 'function', "should have getColorsByGroup function");
    assert.typeOf(feature.getAllColors, 'function', "should have getAllColors function");
    assert.typeOf(feature.applyColorToAnnotation, 'function', "should have applyColorToAnnotation function");
    assert.typeOf(feature.isValidHexColor, 'function', "should have isValidHexColor function");
    assert.typeOf(feature.getGroupNames, 'function', "should have getGroupNames function");
  });

  it("should register() return true", () => {
    const feature = createAnnotationColors({ logger: createMockLogger() });
    assert.equal(feature.register(), true, "register() should return true");
  });

  it("should getColorName for known colors", () => {
    const feature = createAnnotationColors({ logger: createMockLogger() });

    assert.equal(feature.getColorName('#ffd700'), 'Important', "should match Important color");
    assert.equal(feature.getColorName('#ff6b6b'), 'Key Point', "should match Key Point color");
    assert.equal(feature.getColorName('#4ecdc4'), 'Method', "should match Method color");
  });

  it("should return null for unknown or invalid colors", () => {
    const feature = createAnnotationColors({ logger: createMockLogger() });

    assert.equal(feature.getColorName('#000000'), null, "unknown color should return null");
    assert.equal(feature.getColorName('#gggggg'), null, "invalid hex should return null");
    assert.equal(feature.getColorName(''), null, "empty string should return null");
    assert.equal(feature.getColorName(null), null, "null should return null");
  });

  it("should getColorsByGroup for existing groups", () => {
    const feature = createAnnotationColors({ logger: createMockLogger() });

    const priorityColors = feature.getColorsByGroup('Priority');
    assert.equal(priorityColors.length, 2, "Priority group should have 2 colors");
    assert.ok(priorityColors.some(c => c.name === 'Important'), "Priority should include Important");
    assert.ok(priorityColors.some(c => c.name === 'Key Point'), "Priority should include Key Point");

    const contentColors = feature.getColorsByGroup('Content');
    assert.equal(contentColors.length, 3, "Content group should have 3 colors");
  });

  it("should getColorsByGroup return empty for unknown group", () => {
    const feature = createAnnotationColors({ logger: createMockLogger() });

    assert.deepEqual(feature.getColorsByGroup('Unknown'), [], "unknown group should return empty array");
    assert.deepEqual(feature.getColorsByGroup(''), [], "empty group should return empty array");
    assert.deepEqual(feature.getColorsByGroup(null), [], "null group should return empty array");
  });

  it("should getAllColors return all 8 colors", () => {
    const feature = createAnnotationColors({ logger: createMockLogger() });

    const all = feature.getAllColors();
    assert.equal(all.length, 8, "should have 8 colors");
    assert.ok(all.every(c => c.name && c.hex && c.group), "each color should have name, hex, and group");
  });

  it("should validate hex colors correctly", () => {
    const feature = createAnnotationColors({ logger: createMockLogger() });

    assert.ok(feature.isValidHexColor('#ff0000'), "#ff0000 should be valid");
    assert.ok(feature.isValidHexColor('#FF0000'), "#FF0000 should be valid");
    assert.ok(feature.isValidHexColor('#123abc'), "#123abc should be valid");
    assert.notOk(feature.isValidHexColor('#gggggg'), "#gggggg should be invalid");
    assert.notOk(feature.isValidHexColor('#fff'), "#fff should be invalid (too short)");
    assert.notOk(feature.isValidHexColor('ff0000'), "ff0000 should be invalid (missing #)");
    assert.notOk(feature.isValidHexColor(''), "empty string should be invalid");
    assert.notOk(feature.isValidHexColor(null), "null should be invalid");
  });

  it("should getGroupNames return unique groups", () => {
    const feature = createAnnotationColors({ logger: createMockLogger() });

    const groups = feature.getGroupNames();
    assert.equal(groups.length, 3, "should have 3 groups");
    assert.ok(groups.includes('Priority'), "should include Priority");
    assert.ok(groups.includes('Content'), "should include Content");
    assert.ok(groups.includes('Other'), "should include Other");
  });

  it("should applyColorToAnnotation successfully with mock Zotero", async () => {
    const mockZotero = createMockZotero();
    const feature = createAnnotationColors({
      logger: createMockLogger(),
      zotero: mockZotero
    });

    const result = await feature.applyColorToAnnotation('ann-1', '#ffd700');

    assert.equal(result.success, true, "should apply color successfully");
  });

  it("should applyColorToAnnotation fail with invalid annotation ID", async () => {
    const feature = createAnnotationColors({ logger: createMockLogger() });

    const result = await feature.applyColorToAnnotation('', '#ffd700');

    assert.equal(result.success, false, "should fail with invalid annotation ID");
    assert.equal(result.error, 'Invalid annotation ID', "should return correct error");
  });

  it("should applyColorToAnnotation fail with invalid color", async () => {
    const feature = createAnnotationColors({ logger: createMockLogger() });

    const result = await feature.applyColorToAnnotation('ann-1', 'invalid');

    assert.equal(result.success, false, "should fail with invalid color");
    assert.equal(result.error, 'Invalid color format', "should return correct error");
  });

  it("should use globalThis.Zotero when zotero option not provided", async () => {
    const saved = globalThis.Zotero;
    globalThis.Zotero = createMockZotero();

    const feature = createAnnotationColors({ logger: createMockLogger() });
    const result = await feature.applyColorToAnnotation('ann-1', '#ffd700');

    assert.equal(result.success, true, "should use globalThis.Zotero fallback");

    globalThis.Zotero = saved;
  });

  it("should applyColorToAnnotation fallback to property assignment when setColor missing", async () => {
    const mockZotero = createMockZotero({ setColor: undefined });
    const feature = createAnnotationColors({
      logger: createMockLogger(),
      zotero: mockZotero
    });

    const result = await feature.applyColorToAnnotation('ann-1', '#ffd700');

    assert.equal(result.success, true, "should fallback to property assignment");
  });
});

await runTestsIfMain(import.meta.url);
