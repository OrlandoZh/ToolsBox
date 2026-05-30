/**
 * Tests for AI Generate Tags feature
 * Generate tags for Zotero items using OpenAI
 */

import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import { createAIGenerateTags } from "../../src/features/ai-generate-tags.js";

function createMockLogger() {
  const logs = [];
  return {
    info(msg, meta) { logs.push({ level: 'info', msg, meta }); },
    warn(msg) { logs.push({ level: 'warn', msg }); },
    error(msg, meta) { logs.push({ level: 'error', msg, meta }); },
    debug(msg, meta) { logs.push({ level: 'debug', msg, meta }); },
    getLogs() { return logs; }
  };
}

function createMockZotero(itemOverrides = {}) {
  return {
    Items: {
      get(id) {
        if (!id) return null;
        return {
          id,
          getField(field) {
            const fields = {
              abstractNote: 'This is a sufficiently long abstract that meets the minimum length requirement for tag generation.',
              extra: itemOverrides.extra || ''
            };
            return fields[field] || '';
          },
          setField(field, value) { },
          addTag(tag) { },
          saveTx() { return Promise.resolve(); },
          save() { return Promise.resolve(); },
          ...itemOverrides
        };
      }
    }
  };
}

function createMockClient(response = { success: true, content: '["Machine Learning", "Neural Networks", "Deep Learning"]' }) {
  return {
    async chatCompletion(prompt, content) {
      return response;
    }
  };
}

function createMockPrefs(overrides = {}) {
  const store = new Map(Object.entries(overrides));
  return {
    get(key) { return store.get(key); }
  };
}

describe("AIGenerateTags", () => {
  it("should create object with expected methods", () => {
    const feature = createAIGenerateTags({
      logger: createMockLogger(),
      client: createMockClient()
    });

    assert.typeOf(feature.register, 'function', "should have register function");
    assert.typeOf(feature.generateTags, 'function', "should have generateTags function");
    assert.typeOf(feature.extractAbstract, 'function', "should have extractAbstract function");
    assert.typeOf(feature.getCachedTags, 'function', "should have getCachedTags function");
    assert.typeOf(feature.parseTagsFromResponse, 'function', "should have parseTagsFromResponse function");
  });

  it("should register() return true", () => {
    const feature = createAIGenerateTags({
      logger: createMockLogger(),
      client: createMockClient()
    });
    assert.equal(feature.register(), true, "register() should return true");
  });

  it("should extractAbstract from item with valid abstract", () => {
    const feature = createAIGenerateTags({
      logger: createMockLogger(),
      client: createMockClient()
    });

    const item = {
      getField(field) {
        return field === 'abstractNote' ? 'This is a sufficiently long abstract for tags.' : '';
      }
    };

    const abstract = feature.extractAbstract(item);
    assert.ok(abstract, "should extract abstract");
    assert.equal(abstract.length >= 20, true, "abstract should be at least 20 chars");
  });

  it("should return null for short abstract", () => {
    const feature = createAIGenerateTags({
      logger: createMockLogger(),
      client: createMockClient()
    });

    const item = {
      getField(field) {
        return field === 'abstractNote' ? 'Short.' : '';
      }
    };

    assert.equal(feature.extractAbstract(item), null, "short abstract should return null");
  });

  it("should return null for null item", () => {
    const feature = createAIGenerateTags({
      logger: createMockLogger(),
      client: createMockClient()
    });

    assert.equal(feature.extractAbstract(null), null, "null item should return null");
  });

  it("should getCachedTags from extra field", () => {
    const feature = createAIGenerateTags({
      logger: createMockLogger(),
      client: createMockClient()
    });

    const item = {
      getField(field) {
        return field === 'extra' ? 'aiTags: ["tag1", "tag2"]\n' : '';
      }
    };

    const cached = feature.getCachedTags(item);
    assert.ok(cached, "should find cached tags");
    assert.equal(cached.length, 2, "should parse 2 tags");
    assert.equal(cached[0], 'tag1', "first tag should be tag1");
    assert.equal(cached[1], 'tag2', "second tag should be tag2");
  });

  it("should return null when no cached tags", () => {
    const feature = createAIGenerateTags({
      logger: createMockLogger(),
      client: createMockClient()
    });

    const item = {
      getField(field) {
        return field === 'extra' ? 'some other content' : '';
      }
    };

    assert.equal(feature.getCachedTags(item), null, "should return null when no cache");
  });

  it("should parseTagsFromResponse with valid JSON array", () => {
    const feature = createAIGenerateTags({
      logger: createMockLogger(),
      client: createMockClient()
    });

    const tags = feature.parseTagsFromResponse('["ML", "AI", "NLP"]');
    assert.ok(tags, "should parse valid JSON array");
    assert.equal(tags.length, 3, "should have 3 tags");
    assert.equal(tags[0], 'ML', "first tag should be ML");
  });

  it("should return null for invalid JSON", () => {
    const feature = createAIGenerateTags({
      logger: createMockLogger(),
      client: createMockClient()
    });

    assert.equal(feature.parseTagsFromResponse('not json'), null, "invalid JSON should return null");
    assert.equal(feature.parseTagsFromResponse(''), null, "empty string should return null");
    assert.equal(feature.parseTagsFromResponse(null), null, "null should return null");
  });

  it("should return null for non-array JSON", () => {
    const feature = createAIGenerateTags({
      logger: createMockLogger(),
      client: createMockClient()
    });

    assert.equal(feature.parseTagsFromResponse('{"key": "value"}'), null, "object JSON should return null");
    assert.equal(feature.parseTagsFromResponse('123'), null, "number JSON should return null");
  });

  it("should generateTags with mock client", async () => {
    const mockZotero = createMockZotero();
    const feature = createAIGenerateTags({
      logger: createMockLogger(),
      zotero: mockZotero,
      client: createMockClient()
    });

    const result = await feature.generateTags('item-1');

    assert.equal(result.success, true, "should generate tags successfully");
    assert.ok(result.tags, "should return tags");
    assert.equal(result.cached, false, "should not be cached");
  });

  it("should return cached tags without regenerating", async () => {
    const mockZotero = createMockZotero({
      extra: 'aiTags: ["cached1", "cached2"]\n'
    });
    const feature = createAIGenerateTags({
      logger: createMockLogger(),
      zotero: mockZotero,
      client: createMockClient()
    });

    const result = await feature.generateTags('item-1');

    assert.equal(result.success, true, "should return success");
    assert.equal(result.tags.length, 2, "should return 2 cached tags");
    assert.equal(result.cached, true, "should indicate cached");
  });

  it("should bypass cache when bypassCache option is true", async () => {
    const mockZotero = createMockZotero({
      extra: 'aiTags: ["cached1", "cached2"]\n'
    });
    const feature = createAIGenerateTags({
      logger: createMockLogger(),
      zotero: mockZotero,
      client: createMockClient()
    });

    const result = await feature.generateTags('item-1', { bypassCache: true });

    assert.equal(result.success, true, "should regenerate successfully");
    assert.equal(result.cached, false, "should not be cached after bypass");
  });

  it("should fail with invalid itemID", async () => {
    const feature = createAIGenerateTags({
      logger: createMockLogger(),
      client: createMockClient()
    });

    const result = await feature.generateTags('');

    assert.equal(result.success, false, "should fail with empty itemID");
    assert.equal(result.error, 'Invalid item ID', "should return correct error");
  });

  it("should fail when item not found", async () => {
    const mockZotero = { Items: { get() { return null; } } };
    const feature = createAIGenerateTags({
      logger: createMockLogger(),
      zotero: mockZotero,
      client: createMockClient()
    });

    const result = await feature.generateTags('nonexistent');

    assert.equal(result.success, false, "should fail when item not found");
    assert.equal(result.error, 'Item not found', "should return correct error");
  });

  it("should use globalThis.Zotero when zotero option not provided", async () => {
    const saved = globalThis.Zotero;
    globalThis.Zotero = createMockZotero();

    const feature = createAIGenerateTags({
      logger: createMockLogger(),
      client: createMockClient()
    });

    const result = await feature.generateTags('item-1');
    assert.equal(result.success, true, "should use globalThis.Zotero fallback");

    globalThis.Zotero = saved;
  });

  it("should fail when API returns error", async () => {
    const mockZotero = createMockZotero();
    const feature = createAIGenerateTags({
      logger: createMockLogger(),
      zotero: mockZotero,
      client: createMockClient({ success: false, error: 'API Error', errorType: 'network' })
    });

    const result = await feature.generateTags('item-1', { bypassCache: true });

    assert.equal(result.success, false, "should fail when API errors");
    assert.equal(result.error, 'API Error', "should return API error");
    assert.equal(result.errorType, 'network', "should return error type");
  });
});

await runTestsIfMain(import.meta.url);
