/**
 * Semantic Scholar API client for fetching citation counts
 */

const API_BASE = 'https://api.semanticscholar.org/graph/v1';

export function createSemanticScholarClient(options = {}) {
  const { apiKey, timeout = 5000 } = options;

  async function fetchWithTimeout(url, requestOptions = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...requestOptions,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'x-api-key': apiKey } : {})
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  async function getCitedCount(doi) {
    if (!doi) {
      return 0;
    }

    const url = `${API_BASE}/paper/${encodeURIComponent(doi)}?fields=citationCount`;
    const data = await fetchWithTimeout(url);
    return data?.citationCount || 0;
  }

  return {
    getCitedCount
  };
}