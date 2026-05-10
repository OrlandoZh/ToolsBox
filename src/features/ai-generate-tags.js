/**
 * AI Generate Tags - Generate tags for Zotero items using OpenAI
 */

import { createOpenAIClient } from '../services/openai-client.js';

const DEFAULT_PROMPT = 'Returns 3 tags that fit this abstract as a JSON list. Return only the JSON array, no other text.';

export function createAIGenerateTags(options = {}) {
  const { logger, zotero, prefs, client } = options;
  const Zotero = zotero || globalThis.Zotero;

  const openaiClient = client || createOpenAIClient({
    apiKey: prefs?.get?.('openai.apiKey') || '',
    baseUrl: prefs?.get?.('openai.baseUrl'),
    model: prefs?.get?.('openai.model') || 'gpt-3.5-turbo',
    timeout: prefs?.get?.('openai.timeout') || 5000,
    logger
  });

  function extractAbstract(item) {
    if (!item) return null;
    
    const abstract = item.getField?.('abstractNote') || '';
    if (!abstract || abstract.trim().length < 20) {
      return null;
    }
    return abstract.trim();
  }

  function getCachedTags(item) {
    const extra = item.getField?.('extra') || '';
    const match = extra.match(/aiTags: \[([^\]]+)\]/);
    if (!match) return null;

    try {
      const tagsStr = `[${match[1]}]`;
      return JSON.parse(tagsStr);
    } catch {
      return null;
    }
  }

  function parseTagsFromResponse(content) {
    if (!content || typeof content !== 'string') return null;

    try {
      const trimmed = content.trim();
      const parsed = JSON.parse(trimmed);
      
      if (!Array.isArray(parsed)) return null;
      
      return parsed
        .filter(tag => typeof tag === 'string' && tag.trim().length > 0)
        .map(tag => tag.trim());
    } catch {
      return null;
    }
  }

  async function saveTagsToItem(item, tags) {
    for (const tag of tags) {
      if (typeof item.addTag === 'function') {
        item.addTag(tag);
      } else if (item.tags && Array.isArray(item.tags)) {
        item.tags.push(tag);
      }
    }

    const extra = item.getField?.('extra') || '';
    const cachedTagsJson = JSON.stringify(tags);
    const newExtra = extra
      .replace(/aiTags: \[[^\]]+\]\n?/g, '')
      .concat(`aiTags: ${cachedTagsJson}\n`);
    
    if (typeof item.setField === 'function') {
      item.setField('extra', newExtra);
    }

    if (typeof item.saveTx === 'function') {
      await item.saveTx();
    } else if (typeof item.save === 'function') {
      await item.save();
    }
  }

  async function generateTags(itemID, options = {}) {
    const { bypassCache = false } = options;

    if (!itemID) {
      return { success: false, error: 'Invalid item ID' };
    }

    const item = Zotero?.Items?.get?.(itemID);
    if (!item) {
      return { success: false, error: 'Item not found' };
    }

    if (!bypassCache) {
      const cachedTags = getCachedTags(item);
      if (cachedTags && cachedTags.length > 0) {
        logger?.debug?.('aiGenerateTags.cacheHit', { itemID, tags: cachedTags });
        return { success: true, tags: cachedTags, cached: true };
      }
    }

    const abstract = extractAbstract(item);
    if (!abstract) {
      return { success: false, error: 'Item has no valid abstract' };
    }

    const prompt = DEFAULT_PROMPT;
    const result = await openaiClient.chatCompletion(prompt, abstract);

    if (!result.success) {
      logger?.error?.('aiGenerateTags.apiError', {
        itemID,
        error: result.error,
        errorType: result.errorType
      });
      return { success: false, error: result.error, errorType: result.errorType };
    }

    const tags = parseTagsFromResponse(result.content);
    if (!tags || tags.length === 0) {
      logger?.error?.('aiGenerateTags.parseError', {
        itemID,
        content: result.content
      });
      return { success: false, error: 'Failed to parse tags from response' };
    }

    await saveTagsToItem(item, tags);

    logger?.info?.('aiGenerateTags.generated', {
      itemID,
      tags,
      cached: false
    });

    return { success: true, tags, cached: false };
  }

  function register() {
    logger?.debug?.('aiGenerateTags.registered');
    return true;
  }

  return {
    register,
    generateTags,
    extractAbstract,
    getCachedTags,
    parseTagsFromResponse
  };
}