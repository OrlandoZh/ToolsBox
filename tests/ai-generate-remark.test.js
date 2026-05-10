/**
 * AI Generate Remark Tests
 * Tests for AI remark generation
 */
import { describe, it, beforeEach, afterEach, assert } from "./test-framework.js";
import { createAIGenerateRemark } from "../src/features/ai-generate-remark.js";

function createMockLogger() {
  const logs = [];
  return {
    logs,
    debug(message, data) { logs.push({ level: 'debug', message, data }); },
    info(message, data) { logs.push({ level: 'info', message, data }); },
    warn(message, data) { logs.push({ level: 'warn', message, data }); },
    error(message, data) { logs.push({ level: 'error', message, data }); }
  };
}

describe("AI Generate Remark", () => {
  let logger;
  let mockZotero;
  let mockPrefs;
  let mockClient;
  let items;

  beforeEach(() => {
    logger = createMockLogger();
    
    items = new Map();
    items.set('item1', {
      id: 'item1',
      getField: (field) => {
        if (field === 'abstractNote') return 'This paper explores deep learning methods for image classification with convolutional neural networks.';
        if (field === 'extra') return '';
        return '';
      },
      setField: function(field, value) {
        if (field === 'extra') this._extra = value;
      },
      _extra: '',
      saveTx: async function() {},
      save: async function() {}
    });
    
    items.set('item2', {
      id: 'item2',
      getField: (field) => {
        if (field === 'abstractNote') return '';
        return '';
      },
      _extra: '',
      setField: function(field, value) { this._extra = value; },
      saveTx: async function() {}
    });

    items.set('item3', {
      id: 'item3',
      getField: (field) => {
        if (field === 'abstractNote') return 'Short abstract';
        return '';
      },
      _extra: '',
      setField: function(field, value) { this._extra = value; },
      saveTx: async function() {}
    });

    mockZotero = {
      Items: {
        get: (id) => items.get(id) || null
      }
    };

    mockPrefs = {
      get: (key) => {
        if (key === 'aiGenerateRemark.enabled') return true;
        if (key === 'openai.apiKey') return 'test-api-key';
        return null;
      }
    };

    mockClient = {
      chatCompletion: async (prompt, content) => ({
        success: true,
        content: 'This paper presents innovative deep learning methods for image classification using CNNs.'
      })
    };

    globalThis.Zotero = mockZotero;
  });

  afterEach(() => {
    delete globalThis.Zotero;
  });

  it("should generate remark from abstract", async () => {
    const feature = createAIGenerateRemark({
      logger,
      zotero: mockZotero,
      prefs: mockPrefs,
      client: mockClient
    });

    const result = await feature.generateRemark('item1');
    
    assert.ok(result.success);
    assert.ok(result.remark);
    assert.ok(result.remark.length > 0);
  });

  it("should save remark to item extra", async () => {
    const feature = createAIGenerateRemark({
      logger,
      zotero: mockZotero,
      prefs: mockPrefs,
      client: mockClient
    });

    await feature.generateRemark('item1');
    
    const item = items.get('item1');
    assert.ok(item._extra.includes('aiRemark:'));
  });

  it("should include timestamp in extra", async () => {
    const feature = createAIGenerateRemark({
      logger,
      zotero: mockZotero,
      prefs: mockPrefs,
      client: mockClient
    });

    await feature.generateRemark('item1');
    
    const item = items.get('item1');
    assert.ok(item._extra.includes('aiRemarkGenerated:'));
  });

  it("should return cached remark if available", async () => {
    let callCount = 0;
    mockClient.chatCompletion = async () => {
      callCount++;
      return { success: true, content: 'Cached remark' };
    };

    let extraValue = '';
    const cachedItem = {
      id: 'item-cached',
      getField: (field) => {
        if (field === 'abstractNote') return 'This is a test abstract for caching remarks and generating summaries.';
        if (field === 'extra') return extraValue;
        return '';
      },
      setField: function(field, value) {
        if (field === 'extra') extraValue = value;
      },
      saveTx: async function() {}
    };
    
    items.set('item-cached', cachedItem);

    const feature = createAIGenerateRemark({
      logger,
      zotero: mockZotero,
      prefs: mockPrefs,
      client: mockClient
    });

    await feature.generateRemark('item-cached');
    await feature.generateRemark('item-cached');
    
    assert.equal(callCount, 1, "Should only call API once due to caching");
  });

  it("should bypass cache when regenerate is true", async () => {
    let callCount = 0;
    mockClient.chatCompletion = async () => {
      callCount++;
      return { success: true, content: 'New remark' };
    };

    const feature = createAIGenerateRemark({
      logger,
      zotero: mockZotero,
      prefs: mockPrefs,
      client: mockClient
    });

    await feature.generateRemark('item1');
    await feature.generateRemark('item1', { regenerate: true });
    
    assert.equal(callCount, 2, "Should call API twice when regenerating");
  });

  it("should return error for item without abstract", async () => {
    const feature = createAIGenerateRemark({
      logger,
      zotero: mockZotero,
      prefs: mockPrefs,
      client: mockClient
    });

    const result = await feature.generateRemark('item2');
    
    assert.notOk(result.success);
    assert.ok(result.error);
  });

  it("should return error for too short abstract", async () => {
    const feature = createAIGenerateRemark({
      logger,
      zotero: mockZotero,
      prefs: mockPrefs,
      client: mockClient
    });

    const result = await feature.generateRemark('item3');
    
    assert.notOk(result.success);
    assert.ok(result.error);
  });

  it("should return error for non-existent item", async () => {
    const feature = createAIGenerateRemark({
      logger,
      zotero: mockZotero,
      prefs: mockPrefs,
      client: mockClient
    });

    const result = await feature.generateRemark('nonexistent');
    
    assert.notOk(result.success);
    assert.ok(result.error);
  });

  it("should handle API failure", async () => {
    mockClient.chatCompletion = async () => ({
      success: false,
      error: 'API error',
      errorType: 'network'
    });

    const feature = createAIGenerateRemark({
      logger,
      zotero: mockZotero,
      prefs: mockPrefs,
      client: mockClient
    });

    const result = await feature.generateRemark('item1');
    
    assert.notOk(result.success);
    assert.ok(result.error);
    assert.ok(result.errorType);
  });

  it("should handle empty response", async () => {
    mockClient.chatCompletion = async () => ({
      success: true,
      content: ''
    });

    const feature = createAIGenerateRemark({
      logger,
      zotero: mockZotero,
      prefs: mockPrefs,
      client: mockClient
    });

    const result = await feature.generateRemark('item1');
    
    assert.notOk(result.success);
    assert.ok(result.error);
  });

  it("should handle null item ID", async () => {
    const feature = createAIGenerateRemark({
      logger,
      zotero: mockZotero,
      prefs: mockPrefs,
      client: mockClient
    });

    const result = await feature.generateRemark(null);
    
    assert.notOk(result.success);
  });

  it("should use correct prompt", async () => {
    let capturedPrompt;
    mockClient.chatCompletion = async (prompt, content) => {
      capturedPrompt = prompt;
      return { success: true, content: 'Remark' };
    };

    const feature = createAIGenerateRemark({
      logger,
      zotero: mockZotero,
      prefs: mockPrefs,
      client: mockClient
    });

    await feature.generateRemark('item1');
    
    assert.ok(capturedPrompt.includes('remark') || capturedPrompt.includes('summary') || capturedPrompt.includes('summarizing'));
  });

  it("should register successfully", () => {
    const feature = createAIGenerateRemark({
      logger,
      zotero: mockZotero,
      prefs: mockPrefs,
      client: mockClient
    });

    const result = feature.register();
    
    assert.ok(result);
    assert.ok(logger.logs.some(l => l.message === 'aiGenerateRemark.registered'));
  });

  it("should extract abstract correctly", () => {
    const feature = createAIGenerateRemark({
      logger,
      zotero: mockZotero,
      prefs: mockPrefs,
      client: mockClient
    });

    const item = items.get('item1');
    const abstract = feature.extractAbstract(item);
    
    assert.ok(abstract);
    assert.ok(abstract.length > 20);
  });

  it("should return null for invalid abstract", () => {
    const feature = createAIGenerateRemark({
      logger,
      zotero: mockZotero,
      prefs: mockPrefs,
      client: mockClient
    });

    const item = items.get('item2');
    const abstract = feature.extractAbstract(item);
    
    assert.equal(abstract, null);
  });

  it("should get cached remark from item", () => {
    let extraValue = 'aiRemark: Cached remark text\naiRemarkGenerated: 2026-05-10\n';
    const testItem = {
      getField: (field) => {
        if (field === 'extra') return extraValue;
        return '';
      }
    };
    
    const feature = createAIGenerateRemark({
      logger,
      zotero: mockZotero,
      prefs: mockPrefs,
      client: mockClient
    });

    const cached = feature.getCachedRemark(testItem);
    
    assert.ok(cached);
    assert.ok(cached.remark);
    assert.equal(cached.remark, 'Cached remark text');
  });
});