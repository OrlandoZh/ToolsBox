/**
 * AI Generate Remark - Generate brief remarks for Zotero items using OpenAI
 */

import { createOpenAIClient } from '../services/openai-client.js';

const DEFAULT_PROMPT = 'Generate a brief remark (2-3 sentences) summarizing this paper. Return only the remark text, no other formatting.';

const MIN_ABSTRACT_LENGTH = 50;

export function createAIGenerateRemark(options = {}) {
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
    if (!abstract || abstract.trim().length < MIN_ABSTRACT_LENGTH) {
      return null;
    }
    return abstract.trim();
  }

  function getCachedRemark(item) {
    const extra = item?.getField?.('extra') || '';
    
    const remarkMatch = extra.match(/aiRemark: (.+?)(?:\n|$)/);
    const timestampMatch = extra.match(/aiRemarkGenerated: (.+?)(?:\n|$)/);
    
    if (!remarkMatch) return null;
    
    return {
      remark: remarkMatch[1].trim(),
      timestamp: timestampMatch ? timestampMatch[1].trim() : null
    };
  }

  async function saveRemarkToItem(item, remark) {
    const extra = item.getField?.('extra') || '';
    const timestamp = new Date().toISOString();
    
    const cleanedExtra = extra
      .replace(/aiRemark: .+?\n?/g, '')
      .replace(/aiRemarkGenerated: .+?\n?/g, '');
    
    const newExtra = `${cleanedExtra}aiRemark: ${remark}\naiRemarkGenerated: ${timestamp}\n`;
    
    if (typeof item.setField === 'function') {
      item.setField('extra', newExtra);
    }

    if (typeof item.saveTx === 'function') {
      await item.saveTx();
    } else if (typeof item.save === 'function') {
      await item.save();
    }
  }

  async function generateRemark(itemID, options = {}) {
    const { regenerate = false } = options;

    if (!itemID) {
      return { success: false, error: 'Invalid item ID' };
    }

    const item = Zotero?.Items?.get?.(itemID);
    if (!item) {
      return { success: false, error: 'Item not found' };
    }

    if (!regenerate) {
      const cached = getCachedRemark(item);
      if (cached && cached.remark) {
        logger?.debug?.('aiGenerateRemark.cacheHit', { itemID, remark: cached.remark });
        return { success: true, remark: cached.remark, cached: true };
      }
    }

    const abstract = extractAbstract(item);
    if (!abstract) {
      return { success: false, error: `Item has no valid abstract (min ${MIN_ABSTRACT_LENGTH} characters)` };
    }

    const prompt = DEFAULT_PROMPT;
    const result = await openaiClient.chatCompletion(prompt, abstract);

    if (!result.success) {
      logger?.error?.('aiGenerateRemark.apiError', {
        itemID,
        error: result.error,
        errorType: result.errorType
      });
      return { success: false, error: result.error, errorType: result.errorType };
    }

    const remark = result.content?.trim();
    if (!remark || remark.length < 10) {
      logger?.error?.('aiGenerateRemark.emptyResponse', { itemID, content: result.content });
      return { success: false, error: 'Empty or invalid response from API' };
    }

    await saveRemarkToItem(item, remark);

    logger?.info?.('aiGenerateRemark.generated', {
      itemID,
      remark: remark.substring(0, 50) + '...',
      cached: false
    });

    return { success: true, remark, cached: false };
  }

  function register() {
    logger?.debug?.('aiGenerateRemark.registered');
    return true;
  }

  return {
    register,
    generateRemark,
    extractAbstract,
    getCachedRemark
  };
}