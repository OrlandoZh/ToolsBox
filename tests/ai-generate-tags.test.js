/**
 * AI Generate Tags Tests
 * Tests for OpenAI client and AI tag generation
 */
import { describe, it, beforeEach, afterEach, assert } from "./test-framework.js";
import { createOpenAIClient } from "../src/services/openai-client.js";
import { createAIGenerateTags } from "../src/features/ai-generate-tags.js";

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

// OpenAI Client Tests
describe("OpenAI Client", () => {
  let logger;
  let originalFetch;

  beforeEach(() => {
    logger = createMockLogger();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should return error when API key not configured", async () => {
    const client = createOpenAIClient({ logger });

    const result = await client.chatCompletion('test prompt', 'test content');

    assert.notOk(result.success);
    assert.equal(result.errorType, 'config');
    assert.ok(result.error);
  });

  it("should make successful API call", async () => {
    globalThis.fetch = async (url, options) => {
      assert.equal(options.method, 'POST');
      assert.ok(options.headers['Authorization'].startsWith('Bearer '));

      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '["tag1", "tag2", "tag3"]' } }],
          usage: { prompt_tokens: 10, completion_tokens: 20 }
        })
      };
    };

    const client = createOpenAIClient({ apiKey: 'test-key', logger });
    const result = await client.chatCompletion('test prompt', 'test content');

    assert.ok(result.success);
    assert.ok(result.content);
    assert.ok(result.usage);
  });

  it("should handle HTTP errors", async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => JSON.stringify({ error: { message: 'Invalid API key' } })
    });

    const client = createOpenAIClient({ apiKey: 'test-key', logger });
    const result = await client.chatCompletion('test prompt', 'test content');

    assert.notOk(result.success);
    assert.equal(result.errorType, 'auth');
  });

  it("should handle rate limit errors", async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: async () => JSON.stringify({ error: { message: 'Rate limit exceeded' } })
    });

    const client = createOpenAIClient({ apiKey: 'test-key', logger });
    const result = await client.chatCompletion('test prompt', 'test content');

    assert.notOk(result.success);
    assert.equal(result.errorType, 'rate_limit');
  });

  it("should handle timeout", async () => {
    globalThis.fetch = async (url, options) => {
      return new Promise((_, reject) => {
        const signal = options.signal;
        signal.addEventListener('abort', () => {
          const error = new Error('Aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    };

    const client = createOpenAIClient({ apiKey: 'test-key', timeout: 10, logger });
    const result = await client.chatCompletion('test prompt', 'test content');

    assert.notOk(result.success);
    assert.equal(result.errorType, 'timeout');
  });

  it("should handle network errors", async () => {
    globalThis.fetch = async () => { throw new Error('Network error'); };

    const client = createOpenAIClient({ apiKey: 'test-key', logger });
    const result = await client.chatCompletion('test prompt', 'test content');

    assert.notOk(result.success);
    assert.equal(result.errorType, 'network');
  });

  it("should handle empty response", async () => {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ choices: [] })
    });

    const client = createOpenAIClient({ apiKey: 'test-key', logger });
    const result = await client.chatCompletion('test prompt', 'test content');

    assert.notOk(result.success);
    assert.equal(result.errorType, 'response');
  });

  it("should use custom model", async () => {
    let capturedBody;
    globalThis.fetch = async (url, options) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'test' } }] })
      };
    };

    const client = createOpenAIClient({ apiKey: 'test-key', model: 'gpt-4', logger });
    await client.chatCompletion('test', 'test');

    assert.equal(capturedBody.model, 'gpt-4');
  });

  it("should override options in call", async () => {
    let capturedBody;
    globalThis.fetch = async (url, options) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'test' } }] })
      };
    };

    const client = createOpenAIClient({ apiKey: 'test-key', model: 'gpt-3.5-turbo', logger });
    await client.chatCompletion('test', 'test', { model: 'gpt-4-turbo' });

    assert.equal(capturedBody.model, 'gpt-4-turbo');
  });

  it("should return config", () => {
    const client = createOpenAIClient({
      apiKey: 'key',
      baseUrl: 'https://custom.api',
      model: 'gpt-4',
      timeout: 10000,
      logger
    });

    const config = client.getConfig();

    assert.equal(config.apiKey, 'key');
    assert.equal(config.baseUrl, 'https://custom.api');
    assert.equal(config.model, 'gpt-4');
    assert.equal(config.timeout, 10000);
  });
});

// AI Generate Tags Tests
describe("AI Generate Tags", () => {
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
        if (field === 'abstractNote') return 'This is a test abstract about machine learning.';
        if (field === 'extra') return '';
        return '';
      },
      setField: function(field, value) {
        if (field === 'extra') this._extra = value;
      },
      tags: [],
      addTag: function(tag) { this.tags.push(tag); },
      saveTx: async function() {},
      save: async function() {}
    });

    items.set('item2', {
      id: 'item2',
      getField: (field) => {
        if (field === 'abstractNote') return '';
        return '';
      },
      tags: [],
      addTag: function(tag) { this.tags.push(tag); },
      saveTx: async function() {}
    });

    mockZotero = {
      Items: {
        get: (id) => items.get(id) || null
      }
    };

    mockPrefs = {
      get: (key) => {
        if (key === 'aiGenerateTags.enabled') return true;
        if (key === 'openai.apiKey') return 'test-api-key';
        return null;
      }
    };

    mockClient = {
      chatCompletion: async (prompt, content) => ({
        success: true,
        content: '["machine learning", "AI", "neural networks"]'
      })
    };

    globalThis.Zotero = mockZotero;
  });

  afterEach(() => {
    delete globalThis.Zotero;
  });

  it("should generate tags from abstract", async () => {
    const feature = createAIGenerateTags({
      logger,
      zotero: mockZotero,
      prefs: mockPrefs,
      client: mockClient
    });

    const result = await feature.generateTags('item1');

    assert.ok(result.success);
    assert.ok(result.tags.length === 3);
    assert.ok(result.tags.includes('machine learning'));
    assert.ok(result.tags.includes('AI'));
    assert.ok(result.tags.includes('neural networks'));
  });

  it("should save tags to item", async () => {
    const feature = createAIGenerateTags({
      logger,
      zotero: mockZotero,
      prefs: mockPrefs,
      client: mockClient
    });

    await feature.generateTags('item1');

    const item = items.get('item1');
    assert.ok(item.tags.length === 3);
  });

  it("should cache result in item extra", async () => {
    const feature = createAIGenerateTags({
      logger,
      zotero: mockZotero,
      prefs: mockPrefs,
      client: mockClient
    });

    await feature.generateTags('item1');

    const item = items.get('item1');
    assert.ok(item._extra.includes('aiTags:'));
  });

  it("should return cached tags if available", async () => {
    let callCount = 0;
    mockClient.chatCompletion = async () => {
      callCount++;
      return { success: true, content: '["tag"]' };
    };

    let extraValue = '';
    const cachedItem = {
      id: 'item-cached',
      getField: (field) => {
        if (field === 'abstractNote') return 'This is a test abstract for caching.';
        if (field === 'extra') return extraValue;
        return '';
      },
      setField: function(field, value) {
        if (field === 'extra') extraValue = value;
      },
      tags: [],
      addTag: function(tag) { this.tags.push(tag); },
      saveTx: async function() {}
    };

    items.set('item-cached', cachedItem);

    const feature = createAIGenerateTags({
      logger,
      zotero: mockZotero,
      prefs: mockPrefs,
      client: mockClient
    });

    await feature.generateTags('item-cached');
    await feature.generateTags('item-cached');

    assert.equal(callCount, 1, "Should only call API once due to caching");
  });

  it("should return error for item without abstract", async () => {
    const feature = createAIGenerateTags({
      logger,
      zotero: mockZotero,
      prefs: mockPrefs,
      client: mockClient
    });

    const result = await feature.generateTags('item2');

    assert.notOk(result.success);
    assert.ok(result.error);
  });

  it("should return error for non-existent item", async () => {
    const feature = createAIGenerateTags({
      logger,
      zotero: mockZotero,
      prefs: mockPrefs,
      client: mockClient
    });

    const result = await feature.generateTags('nonexistent');

    assert.notOk(result.success);
    assert.ok(result.error);
  });

  it("should handle API failure", async () => {
    mockClient.chatCompletion = async () => ({
      success: false,
      error: 'API error',
      errorType: 'network'
    });

    const feature = createAIGenerateTags({
      logger,
      zotero: mockZotero,
      prefs: mockPrefs,
      client: mockClient
    });

    const result = await feature.generateTags('item1');

    assert.notOk(result.success);
    assert.ok(result.error);
  });

  it("should handle invalid JSON response", async () => {
    mockClient.chatCompletion = async () => ({
      success: true,
      content: 'not valid JSON'
    });

    const feature = createAIGenerateTags({
      logger,
      zotero: mockZotero,
      prefs: mockPrefs,
      client: mockClient
    });

    const result = await feature.generateTags('item1');

    assert.notOk(result.success);
    assert.ok(result.error);
  });

  it("should handle non-array JSON response", async () => {
    mockClient.chatCompletion = async () => ({
      success: true,
      content: '{"tags": ["tag1"]}'
    });

    const feature = createAIGenerateTags({
      logger,
      zotero: mockZotero,
      prefs: mockPrefs,
      client: mockClient
    });

    const result = await feature.generateTags('item1');

    assert.notOk(result.success);
    assert.ok(result.error);
  });

  it("should use correct prompt", async () => {
    let capturedPrompt;
    mockClient.chatCompletion = async (prompt, content) => {
      capturedPrompt = prompt;
      return { success: true, content: '["tag"]' };
    };

    const feature = createAIGenerateTags({
      logger,
      zotero: mockZotero,
      prefs: mockPrefs,
      client: mockClient
    });

    await feature.generateTags('item1');

    assert.ok(capturedPrompt.includes('tags'));
    assert.ok(capturedPrompt.includes('JSON'));
  });

  it("should register successfully", () => {
    const feature = createAIGenerateTags({
      logger,
      zotero: mockZotero,
      prefs: mockPrefs,
      client: mockClient
    });

    const result = feature.register();

    assert.ok(result);
    assert.ok(logger.logs.some(l => l.message === 'aiGenerateTags.registered'));
  });

  it("should force regenerate when bypassCache is true", async () => {
    let callCount = 0;
    mockClient.chatCompletion = async () => {
      callCount++;
      return { success: true, content: '["tag"]' };
    };

    const feature = createAIGenerateTags({
      logger,
      zotero: mockZotero,
      prefs: mockPrefs,
      client: mockClient
    });

    await feature.generateTags('item1');
    await feature.generateTags('item1', { bypassCache: true });

    assert.equal(callCount, 2, "Should call API twice when bypassing cache");
  });
});
