/**
 * EasyScholar API client for fetching journal impact factor metrics
 * 
 * API Documentation:
 * - Base URL: https://api.easyscholar.cc
 * - Endpoint: GET /journal/metrics?name={journalName}
 * - Authentication: X-API-Key header
 * - Rate limit: 100 requests per hour (free tier)
 */

const API_BASE = 'https://api.easyscholar.cc';

/**
 * Create EasyScholar API client
 * @param {Object} options - Client options
 * @param {string} options.apiKey - API key for authentication
 * @param {number} options.timeout - Request timeout in milliseconds (default: 5000)
 * @param {number} options.cacheTTL - Cache time-to-live in milliseconds (default: 300000 = 5 minutes)
 * @param {Object} options.logger - Logger instance for debugging
 * @returns {Object} API client with getJournalMetrics method
 */
export function createEasyScholarClient(options = {}) {
  const {
    apiKey,
    timeout = 5000,
    cacheTTL = 300000,
    logger
  } = options;

  const cache = new Map();
  const requestTimestamps = [];
  const RATE_LIMIT_PER_MINUTE = 10;
  const RATE_LIMIT_WINDOW_MS = 60000;

  /**
   * Check and enforce rate limiting
   * @returns {boolean} True if request is allowed, false if rate limited
   */
  function checkRateLimit() {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW_MS;
    while (requestTimestamps.length > 0 && requestTimestamps[0] < windowStart) {
      requestTimestamps.shift();
    }
    
    if (requestTimestamps.length >= RATE_LIMIT_PER_MINUTE) {
      logger?.debug?.('easyscholar.rateLimited', {
        requests: requestTimestamps.length,
        limit: RATE_LIMIT_PER_MINUTE
      });
      return false;
    }
    
    requestTimestamps.push(now);
    return true;
  }

  /**
   * Fetch with timeout and error handling
   * @param {string} url - URL to fetch
   * @param {Object} requestOptions - Fetch options
   * @returns {Promise<Object>} Response JSON
   */
  async function fetchWithTimeout(url, requestOptions = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...requestOptions,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'X-API-Key': apiKey } : {})
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  /**
   * Get journal metrics from EasyScholar API
   * @param {string} journalName - Journal name to query
   * @returns {Promise<Object|null>} Journal metrics or null if not found
   * 
   * Response fields:
   * - sciIF: Science Citation Index Impact Factor (number)
   * - sciQ: SCI Quartile (Q1, Q2, Q3, Q4)
   * - ssci: Social Sciences Citation Index (boolean)
   * - utd24: UTD24 ranking (boolean or string)
   * - ajg: AJG ranking (string)
   * - ccs: CCS ranking (string)
   */
  async function getJournalMetrics(journalName) {
    if (!journalName || typeof journalName !== 'string') {
      return null;
    }

    const normalizedName = journalName.trim().toLowerCase();

    const cached = cache.get(normalizedName);
    if (cached && Date.now() - cached.timestamp < cacheTTL) {
      logger?.debug?.('easyscholar.cacheHit', { journal: journalName });
      return cached.data;
    }

    if (!checkRateLimit()) {
      logger?.warn?.('easyscholar.rateLimitExceeded', { journal: journalName });
      if (cached) {
        logger?.debug?.('easyscholar.usingExpiredCache', { journal: journalName });
        return cached.data;
      }
      return null;
    }

    try {
      const url = `${API_BASE}/journal/metrics?name=${encodeURIComponent(journalName)}`;
      logger?.debug?.('easyscholar.fetching', { url, journal: journalName });

      const response = await fetchWithTimeout(url);

      if (!response.success || !response.data) {
        logger?.debug?.('easyscholar.noData', { journal: journalName });
        return null;
      }

      const metrics = {
        sciIF: response.data.sciIF ?? null,
        sciQ: response.data.sciQ ?? null,
        ssci: response.data.ssci ?? false,
        utd24: response.data.utd24 ?? false,
        ajg: response.data.ajg ?? null,
        ccs: response.data.ccs ?? null,
        timestamp: Date.now()
      };

      cache.set(normalizedName, {
        data: metrics,
        timestamp: Date.now()
      });

      logger?.debug?.('easyscholar.fetched', {
        journal: journalName,
        metrics
      });

      return metrics;
    } catch (error) {
      logger?.error?.('easyscholar.fetchError', {
        journal: journalName,
        error: error.message
      });

      if (cached) {
        logger?.debug?.('easyscholar.usingCacheOnError', { journal: journalName });
        return cached.data;
      }

      return null;
    }
  }

  /**
   * Clear the in-memory cache
   */
  function clearCache() {
    cache.clear();
    logger?.debug?.('easyscholar.cacheCleared');
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  function getCacheStats() {
    return {
      size: cache.size,
      rateLimitRemaining: RATE_LIMIT_PER_MINUTE - requestTimestamps.length
    };
  }

  return {
    getJournalMetrics,
    clearCache,
    getCacheStats
  };
}
