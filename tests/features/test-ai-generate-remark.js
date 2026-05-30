/**
 * Tests for AI Generate Remark feature
 * Generate brief remarks for Zotero items using OpenAI
 */

import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import { createAIGenerateRemark } from "../../src/features/ai-generate-remark.js";

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
              abstractNote: 'This is a sufficiently long abstract that meets the minimum length requirement of fifty characters.',
              extra: itemOverrides.extra || ''
            };
            return fields[field] || '';
          },
          setField(field, value) { },
          saveTx() { return Promise.resolve(); },
          save() { return Promise.resolve(); },
          ...itemOverrides
        };
      }
    }
  };
}

function createMockClient(response = { success: true, content: 'This is a generated remark.' }) {
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

describe("AIGenerateRemark", () => {
  it("should create object with expected methods", () => {
    const feature = createAIGenerateRemark({
      logger: createMockLogger(),
      client: createMockClient()
    });

    assert.typeOf(feature.register, 'function', "should have register function");
    assert.typeOf(feature.generateRemark, 'function', "should have generateRemark function");
    assert.typeOf(feature.extractAbstract, 'function', "should have extractAbstract function");
    assert.typeOf(feature.getCachedRemark, 'function', "should have getCachedRemark function");
  });

  it("should register() return true", () => {
    const feature = createAIGenerateRemark({
      logger: createMockLogger(),
      client: createMockClient()
    });
    assert.equal(feature.register(), true, "register() should return true");
  });

  it("should extractAbstract from item with valid abstract", () => {
    const feature = createAIGenerateRemark({
      logger: createMockLogger(),
      client: createMockClient()
    });

    const item = {
      getField(field) {
        return field === 'abstractNote' ? 'This is a sufficiently long abstract that meets the minimum length requirement.' : '';
      }
    };

    const abstract = feature.extractAbstract(item);
    assert.ok(abstract, "should extract abstract");
    assert.equal(abstract.length > 50, true, "abstract should be longer than 50 chars");
  });

  it("should return null for short abstract", () => {
    const feature = createAIGenerateRemark({
      logger: createMockLogger(),
      client: createMockClient()
    });

    const item = {
      getField(field) {
        return field === 'abstractNote' ? 'Too short.' : '';
      }
    };

    assert.equal(feature.extractAbstract(item), null, "short abstract should return null");
  });

  it("should return null for null item", () => {
    const feature = createAIGenerateRemark({
      logger: createMockLogger(),
      client: createMockClient()
    });

    assert.equal(feature.extractAbstract(null), null, "null item should return null");
  });

  it("should getCachedRemark from extra field", () => {
    const feature = createAIGenerateRemark({
      logger: createMockLogger(),
      client: createMockClient()
    });

    const item = {
      getField(field) {
        return field === 'extra' ? 'aiRemark: This is cached\naiRemarkGenerated: 2024-01-01T00:00:00Z\n' : '';
      }
    };

    const cached = feature.getCachedRemark(item);
    assert.ok(cached, "should find cached remark");
    assert.equal(cached.remark, 'This is cached', "should parse remark text");
    assert.equal(cached.timestamp, '2024-01-01T00:00:00Z', "should parse timestamp");
  });

  it("should return null when no cached remark", () => {
    const feature = createAIGenerateRemark({
      logger: createMockLogger(),
      client: createMockClient()
    });

    const item = {
      getField(field) {
        return field === 'extra' ? 'some other content' : '';
      }
    };

    assert.equal(feature.getCachedRemark(item), null, "should return null when no cache");
  });

  it("should generateRemark with mock client", async () => {
    const mockZotero = createMockZotero();
    const feature = createAIGenerateRemark({
      logger: createMockLogger(),
      zotero: mockZotero,
      client: createMockClient()
    });

    const result = await feature.generateRemark('item-1');

    assert.equal(result.success, true, "should generate remark successfully");
    assert.ok(result.remark, "should return remark");
    assert.equal(result.cached, false, "should not be cached");
  });

  it("should return cached remark without regenerating", async () => {
    const mockZotero = createMockZotero({
      extra: 'aiRemark: Cached remark text\naiRemarkGenerated: 2024-01-01T00:00:00Z\n'
    });
    const feature = createAIGenerateRemark({
      logger: createMockLogger(),
      zotero: mockZotero,
      client: createMockClient()
    });

    const result = await feature.generateRemark('item-1');

    assert.equal(result.success, true, "should return success");
    assert.equal(result.remark, 'Cached remark text', "should return cached remark");
    assert.equal(result.cached, true, "should indicate cached");
  });

  it("should regenerate when regenerate option is true", async () => {
    const mockZotero = createMockZotero({
      extra: 'aiRemark: Cached remark text\naiRemarkGenerated: 2024-01-01T00:00:00Z\n'
    });
    const feature = createAIGenerateRemark({
      logger: createMockLogger(),
      zotero: mockZotero,
      client: createMockClient()
    });

    const result = await feature.generateRemark('item-1', { regenerate: true });

    assert.equal(result.success, true, "should regenerate successfully");
    assert.equal(result.cached, false, "should not be cached after regenerate");
  });

  it("should fail with invalid itemID", async () => {
    const feature = createAIGenerateRemark({
      logger: createMockLogger(),
      client: createMockClient()
    });

    const result = await feature.generateRemark('');

    assert.equal(result.success, false, "should fail with empty itemID");
    assert.equal(result.error, 'Invalid item ID', "should return correct error");
  });

  it("should fail when item not found", async () => {
    const mockZotero = { Items: { get() { return null; } } };
    const feature = createAIGenerateRemark({
      logger: createMockLogger(),
      zotero: mockZotero,
      client: createMockClient()
    });

    const result = await feature.generateRemark('nonexistent');

    assert.equal(result.success, false, "should fail when item not found");
    assert.equal(result.error, 'Item not found', "should return correct error");
  });

  it("should use globalThis.Zotero when zotero option not provided", async () => {
    const saved = globalThis.Zotero;
    globalThis.Zotero = createMockZotero();

    const feature = createAIGenerateRemark({
      logger: createMockLogger(),
      client: createMockClient()
    });

    const result = await feature.generateRemark('item-1');
    assert.equal(result.success, true, "should use globalThis.Zotero fallback");

    globalThis.Zotero = saved;
  });

  it("should fail when API returns error", async () => {
    const mockZotero = createMockZotero();
    const feature = createAIGenerateRemark({
      logger: createMockLogger(),
      zotero: mockZotero,
      client: createMockClient({ success: false, error: 'API Error', errorType: 'network' })
    });

    const result = await feature.generateRemark('item-1', { regenerate: true });

    assert.equal(result.success, false, "should fail when API errors");
    assert.equal(result.error, 'API Error', "should return API error");
    assert.equal(result.errorType, 'network', "should return error type");
  });
});

await runTestsIfMain(import.meta.url);
