/**
 * OpenAI Client - Reusable API client for OpenAI chat completions
 */

const DEFAULT_TIMEOUT = 5000;
const DEFAULT_MODEL = 'gpt-3.5-turbo';

export function createOpenAIClient(options = {}) {
  const {
    apiKey,
    baseUrl = 'https://api.openai.com/v1',
    model = DEFAULT_MODEL,
    timeout = DEFAULT_TIMEOUT,
    logger
  } = options;

  function getConfig() {
    return {
      apiKey,
      baseUrl,
      model,
      timeout
    };
  }

  async function chatCompletion(prompt, content, callOptions = {}) {
    const effectiveApiKey = callOptions.apiKey || apiKey;
    const effectiveModel = callOptions.model || model;
    const effectiveTimeout = callOptions.timeout || timeout;
    const effectiveBaseUrl = callOptions.baseUrl || baseUrl;

    if (!effectiveApiKey) {
      const error = new Error('API key not configured');
      logger?.error?.('openaiClient.noApiKey');
      return { success: false, error: error.message, errorType: 'config' };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

    try {
      const response = await fetch(`${effectiveBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${effectiveApiKey}`
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: effectiveModel,
          messages: [
            { role: 'user', content: `${prompt}\n\n${content}` }
          ],
          temperature: 0.7,
          max_tokens: 500
        })
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error?.message || errorMessage;
        } catch {}

        logger?.error?.('openaiClient.httpError', {
          status: response.status,
          error: errorMessage
        });

        return {
          success: false,
          error: errorMessage,
          errorType: response.status === 401 ? 'auth' : 
                     response.status === 429 ? 'rate_limit' : 'http'
        };
      }

      const data = await response.json();
      const messageContent = data.choices?.[0]?.message?.content;

      if (!messageContent) {
        logger?.warn?.('openaiClient.emptyResponse');
        return { success: false, error: 'Empty response from API', errorType: 'response' };
      }

      logger?.debug?.('openaiClient.success', {
        model: effectiveModel,
        tokens: data.usage
      });

      return {
        success: true,
        content: messageContent,
        usage: data.usage
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        logger?.error?.('openaiClient.timeout', { timeout: effectiveTimeout });
        return { success: false, error: 'Request timeout', errorType: 'timeout' };
      }

      logger?.error?.('openaiClient.fetchError', { error: error.message });
      return { success: false, error: error.message, errorType: 'network' };
    }
  }

  async function testConnection() {
    const result = await chatCompletion('Say "OK"', 'test');
    return result.success;
  }

  return {
    chatCompletion,
    testConnection,
    getConfig
  };
}
