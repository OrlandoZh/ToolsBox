/**
 * Tests for Nested Tags feature
 * Task - Hierarchical tag display with separators
 */

import { describe, it, assert, runTests } from "../test-framework.js";
import { createNestedTags } from "../../src/features/nested-tags.js";

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

function createMockPrefs(overrides = {}) {
  const defaults = {
    separator: '#',
    secondarySeparator: '/',
    connector: '→',
    indentWidth: 10,
    showConnector: true,
    enabled: true
  };
  return {
    ...defaults,
    ...overrides,
    get(key) {
      return this[key];
    }
  };
}

describe("NestedTags Parsing", () => {
  it("should parse simple nested tag with # separator", () => {
    const nestedTags = createNestedTags({
      logger: createMockLogger(),
      prefs: createMockPrefs()
    });

    const result = nestedTags.parseNestedTag('AI#DeepLearning#CNN', '#');

    assert.ok(Array.isArray(result), "Result should be an array");
    assert.equal(result.length, 3, "Should have 3 levels");
    assert.equal(result[0].level, 0, "First level should be 0");
    assert.equal(result[0].text, 'AI', "First text should be 'AI'");
    assert.equal(result[1].level, 1, "Second level should be 1");
    assert.equal(result[1].text, 'DeepLearning', "Second text should be 'DeepLearning'");
    assert.equal(result[2].level, 2, "Third level should be 2");
    assert.equal(result[2].text, 'CNN', "Third text should be 'CNN'");
  });

  it("should parse nested tag with / separator", () => {
    const nestedTags = createNestedTags({
      logger: createMockLogger(),
      prefs: createMockPrefs({ separator: '/' })
    });

    const result = nestedTags.parseNestedTag('Research/Methods/Quantitative', '/');

    assert.equal(result.length, 3, "Should have 3 levels");
    assert.equal(result[0].text, 'Research', "First text should be 'Research'");
    assert.equal(result[1].text, 'Methods', "Second text should be 'Methods'");
    assert.equal(result[2].text, 'Quantitative', "Third text should be 'Quantitative'");
  });

  it("should handle single-level tag (no hierarchy)", () => {
    const nestedTags = createNestedTags({
      logger: createMockLogger(),
      prefs: createMockPrefs()
    });

    const result = nestedTags.parseNestedTag('AI', '#');

    assert.equal(result.length, 1, "Single-level tag should have 1 level");
    assert.equal(result[0].level, 0, "Should be level 0");
    assert.equal(result[0].text, 'AI', "Text should be 'AI'");
    assert.equal(result[0].isNested, false, "Should not be nested");
  });

  it("should handle empty or null tag", () => {
    const nestedTags = createNestedTags({
      logger: createMockLogger(),
      prefs: createMockPrefs()
    });

    const resultEmpty = nestedTags.parseNestedTag('', '#');
    const resultNull = nestedTags.parseNestedTag(null, '#');
    const resultUndefined = nestedTags.parseNestedTag(undefined, '#');

    assert.equal(resultEmpty.length, 0, "Empty tag should return empty array");
    assert.equal(resultNull.length, 0, "Null tag should return empty array");
    assert.equal(resultUndefined.length, 0, "Undefined tag should return empty array");
  });

  it("should trim whitespace from tag parts", () => {
    const nestedTags = createNestedTags({
      logger: createMockLogger(),
      prefs: createMockPrefs()
    });

    const result = nestedTags.parseNestedTag('AI # Deep Learning # CNN', '#');

    assert.equal(result[0].text, 'AI', "Should trim whitespace from first part");
    assert.equal(result[1].text, 'Deep Learning', "Should trim whitespace from second part");
    assert.equal(result[2].text, 'CNN', "Should trim whitespace from third part");
  });

  it("should mark nested tags correctly", () => {
    const nestedTags = createNestedTags({
      logger: createMockLogger(),
      prefs: createMockPrefs()
    });

    const result = nestedTags.parseNestedTag('AI#DeepLearning', '#');

    assert.equal(result[0].isNested, true, "First part should be marked as nested");
    assert.equal(result[1].isNested, true, "Second part should be marked as nested");
  });
});

describe("NestedTags Rendering", () => {
  it("should render nested tag with default connector", () => {
    const nestedTags = createNestedTags({
      logger: createMockLogger(),
      prefs: createMockPrefs()
    });

    const parsed = nestedTags.parseNestedTag('AI#DeepLearning#CNN', '#');
    const rendered = nestedTags.renderNestedTag(parsed);

    assert.equal(rendered, 'AI → DeepLearning → CNN', "Should render with → connector");
  });

  it("should render nested tag with custom connector", () => {
    const nestedTags = createNestedTags({
      logger: createMockLogger(),
      prefs: createMockPrefs({ connector: '|' })
    });

    const parsed = nestedTags.parseNestedTag('Research/Methods', '/');
    const rendered = nestedTags.renderNestedTag(parsed);

    assert.equal(rendered, 'Research | Methods', "Should render with custom connector");
  });

  it("should render single-level tag without connector", () => {
    const nestedTags = createNestedTags({
      logger: createMockLogger(),
      prefs: createMockPrefs()
    });

    const parsed = nestedTags.parseNestedTag('AI', '#');
    const rendered = nestedTags.renderNestedTag(parsed);

    assert.equal(rendered, 'AI', "Single-level tag should not have connector");
  });

  it("should render empty parsed tag as empty string", () => {
    const nestedTags = createNestedTags({
      logger: createMockLogger(),
      prefs: createMockPrefs()
    });

    const renderedEmpty = nestedTags.renderNestedTag([]);
    const renderedNull = nestedTags.renderNestedTag(null);

    assert.equal(renderedEmpty, '', "Empty array should render as empty string");
    assert.equal(renderedNull, '', "Null should render as empty string");
  });

  it("should render with connector disabled", () => {
    const nestedTags = createNestedTags({
      logger: createMockLogger(),
      prefs: createMockPrefs({ showConnector: false })
    });

    const parsed = nestedTags.parseNestedTag('AI#DeepLearning#CNN', '#');
    const rendered = nestedTags.renderNestedTag(parsed);

    assert.equal(rendered, 'AI DeepLearning CNN', "Should render without connector");
  });

  it("should render HTML with indentation for display", () => {
    const nestedTags = createNestedTags({
      logger: createMockLogger(),
      prefs: createMockPrefs()
    });

    const parsed = nestedTags.parseNestedTag('AI#DeepLearning#CNN', '#');
    const html = nestedTags.renderNestedTagHTML(parsed);

    assert.typeOf(html, 'string', "HTML should be a string");
    assert.ok(html.includes('AI'), "HTML should contain 'AI'");
    assert.ok(html.includes('DeepLearning'), "HTML should contain 'DeepLearning'");
    assert.ok(html.includes('CNN'), "HTML should contain 'CNN'");
  });

  it("should apply correct indentation levels in HTML", () => {
    const nestedTags = createNestedTags({
      logger: createMockLogger(),
      prefs: createMockPrefs({ indentWidth: 15 })
    });

    const parsed = nestedTags.parseNestedTag('Level0#Level1#Level2#Level3', '#');
    const html = nestedTags.renderNestedTagHTML(parsed);

    assert.ok(html.includes('margin-left: 0'), "Level 0 should have 0 margin");
    assert.ok(html.includes('margin-left: 15'), "Level 1 should have 15px margin");
    assert.ok(html.includes('margin-left: 30'), "Level 2 should have 30px margin");
    assert.ok(html.includes('margin-left: 45'), "Level 3 should have 45px margin");
  });
});

describe("NestedTags Bulk Processing", () => {
  it("should parse all tags from item.getTags()", () => {
    const nestedTags = createNestedTags({
      logger: createMockLogger(),
      prefs: createMockPrefs()
    });

    const mockTags = [
      { tag: 'AI#DeepLearning' },
      { tag: 'Research#Methods' },
      { tag: 'SimpleTag' }
    ];

    const result = nestedTags.parseAllTags(mockTags, '#');

    assert.ok(Array.isArray(result), "Result should be an array");
    assert.equal(result.length, 3, "Should parse all 3 tags");
    assert.equal(result[0].original, 'AI#DeepLearning', "Should preserve original tag");
    assert.equal(result[0].parsed.length, 2, "First tag should have 2 levels");
    assert.equal(result[2].parsed.length, 1, "Simple tag should have 1 level");
    assert.equal(result[2].isNested, false, "Simple tag should not be nested");
  });

  it("should group nested tags by root level", () => {
    const nestedTags = createNestedTags({
      logger: createMockLogger(),
      prefs: createMockPrefs()
    });

    const mockTags = [
      { tag: 'AI#DeepLearning' },
      { tag: 'AI#MachineLearning' },
      { tag: 'Research#Methods' }
    ];

    const grouped = nestedTags.groupNestedTags(mockTags, '#');

    assert.ok(grouped['AI'], "Should have 'AI' group");
    assert.ok(grouped['Research'], "Should have 'Research' group");
    assert.equal(grouped['AI'].length, 2, "'AI' group should have 2 tags");
    assert.equal(grouped['Research'].length, 1, "'Research' group should have 1 tag");
  });

  it("should handle tags array with string entries", () => {
    const nestedTags = createNestedTags({
      logger: createMockLogger(),
      prefs: createMockPrefs()
    });

    const mockTags = ['AI#DeepLearning', 'SimpleTag'];

    const result = nestedTags.parseAllTags(mockTags, '#');

    assert.equal(result.length, 2, "Should handle string array");
    assert.equal(result[0].original, 'AI#DeepLearning', "Should parse string tag");
    assert.equal(result[1].original, 'SimpleTag', "Should parse simple string tag");
  });

  it("should handle empty tags array", () => {
    const nestedTags = createNestedTags({
      logger: createMockLogger(),
      prefs: createMockPrefs()
    });

    const resultEmpty = nestedTags.parseAllTags([], '#');
    const resultNull = nestedTags.parseAllTags(null, '#');

    assert.equal(resultEmpty.length, 0, "Empty array should return empty");
    assert.equal(resultNull.length, 0, "Null should return empty");
  });
});

describe("NestedTags Integration", () => {
  it("should format tags for display with hierarchy", () => {
    const nestedTags = createNestedTags({
      logger: createMockLogger(),
      prefs: createMockPrefs()
    });

    const mockTags = [
      { tag: 'AI#DeepLearning#CNN' },
      { tag: 'AI#MachineLearning' },
      { tag: 'RegularTag' }
    ];

    const formatted = nestedTags.formatTagsForDisplay(mockTags);

    assert.typeOf(formatted, 'string', "Formatted tags should be string");
    assert.ok(formatted.includes('AI → DeepLearning → CNN'), "Should include hierarchical display");
    assert.ok(formatted.includes('RegularTag'), "Should include regular tag");
  });

  it("should use preference settings for rendering", () => {
    const nestedTags = createNestedTags({
      logger: createMockLogger(),
      prefs: createMockPrefs({
        separator: '/',
        connector: '>'
      })
    });

    const mockTags = [{ tag: 'Research/Methods/Quantitative' }];
    const formatted = nestedTags.formatTagsForDisplay(mockTags);

    assert.ok(formatted.includes('Research > Methods > Quantitative'), "Should use custom connector");
  });

  it("should filter nested tags correctly", () => {
    const nestedTags = createNestedTags({
      logger: createMockLogger(),
      prefs: createMockPrefs()
    });

    const mockTags = [
      { tag: 'AI#DeepLearning' },
      { tag: 'SimpleTag' },
      { tag: 'Another#Nested#Tag' }
    ];

    const nestedOnly = nestedTags.filterNestedTags(mockTags, '#');
    const flatOnly = nestedTags.filterFlatTags(mockTags, '#');

    assert.equal(nestedOnly.length, 2, "Should have 2 nested tags");
    assert.equal(flatOnly.length, 1, "Should have 1 flat tag");
    assert.equal(flatOnly[0].original, 'SimpleTag', "Flat tag should be 'SimpleTag'");
  });

  it("should handle mixed separator scenarios", () => {
    const nestedTags = createNestedTags({
      logger: createMockLogger(),
      prefs: createMockPrefs({
        separator: '#',
        secondarySeparator: '/'
      })
    });

    const mockTags = [
      { tag: 'AI#DeepLearning/CNN' }  // Mixed separators
    ];

    const result = nestedTags.parseAllTags(mockTags, '#');

    // Should use primary separator only for splitting
    assert.equal(result[0].parsed.length, 2, "Should split by primary separator");
    assert.equal(result[0].parsed[0].text, 'AI', "First level should be 'AI'");
    assert.equal(result[0].parsed[1].text, 'DeepLearning/CNN', "Should not split secondary");
  });
});

describe("NestedTags Edge Cases", () => {
  it("should handle deeply nested tags (5+ levels)", () => {
    const nestedTags = createNestedTags({
      logger: createMockLogger(),
      prefs: createMockPrefs()
    });

    const result = nestedTags.parseNestedTag('L0#L1#L2#L3#L4#L5', '#');

    assert.equal(result.length, 6, "Should handle 6 levels");
    assert.equal(result[5].level, 5, "Last level should be 5");
    assert.equal(result[5].text, 'L5', "Last text should be 'L5'");
  });

  it("should handle consecutive separators gracefully", () => {
    const nestedTags = createNestedTags({
      logger: createMockLogger(),
      prefs: createMockPrefs()
    });

    const result = nestedTags.parseNestedTag('AI##DeepLearning', '#');

    // Should filter out empty parts
    assert.ok(result.length <= 3, "Should filter empty parts");
    assert.ok(result.every(r => r.text.length > 0), "All parts should have text");
  });

  it("should handle special characters in tag text", () => {
    const nestedTags = createNestedTags({
      logger: createMockLogger(),
      prefs: createMockPrefs()
    });

    const result = nestedTags.parseNestedTag('Topic#Sub-Topic#Special@Char', '#');

    assert.equal(result[0].text, 'Topic', "Should handle first part");
    assert.equal(result[1].text, 'Sub-Topic', "Should handle hyphen");
    assert.equal(result[2].text, 'Special@Char', "Should handle special char");
  });

  it("should handle Unicode characters in tags", () => {
    const nestedTags = createNestedTags({
      logger: createMockLogger(),
      prefs: createMockPrefs()
    });

    const result = nestedTags.parseNestedTag('研究#方法论#定量研究', '#');

    assert.equal(result.length, 3, "Should handle Chinese characters");
    assert.equal(result[0].text, '研究', "Should preserve Chinese text");
    assert.equal(result[1].text, '方法论', "Should preserve Chinese text");
    assert.equal(result[2].text, '定量研究', "Should preserve Chinese text");
  });

  it("should handle very long tag strings", () => {
    const nestedTags = createNestedTags({
      logger: createMockLogger(),
      prefs: createMockPrefs()
    });

    const longTag = 'Level0#'.repeat(20) + 'Final';
    const result = nestedTags.parseNestedTag(longTag, '#');

    assert.ok(result.length > 20, "Should handle long tag");
    assert.equal(result[result.length - 1].text, 'Final', "Last should be 'Final'");
  });
});

runTests();
