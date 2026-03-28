/**
 * HTTP 工具模块
 * 封装 Zotero.HTTP API，提供便捷的网络请求功能
 */

/**
 * HTTP 方法常量
 */
export const HTTP_METHODS = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  DELETE: "DELETE",
  PATCH: "PATCH",
  HEAD: "HEAD",
};

/**
 * 内容类型常量
 */
export const CONTENT_TYPES = {
  JSON: "application/json",
  FORM: "application/x-www-form-urlencoded",
  MULTIPART: "multipart/form-data",
  TEXT: "text/plain",
  HTML: "text/html",
  XML: "application/xml",
};

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_RETRY_DELAY_MS = 250;
const DEFAULT_SLOW_THRESHOLD_MS = 1200;
const HTTP_TIMEOUT_ERROR_CODE = "HTTP_TIMEOUT";
const HTTP_ABORT_ERROR_CODE = "HTTP_ABORTED";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 创建 HTTP 工具实例
 * @param {Object} options - 配置选项
 * @param {Object} [options.logger] - 日志记录器
 * @param {Object} [options.zotero] - Zotero 全局对象
 * @returns {Object} HTTP 工具实例
 */
export function createHTTP(options = {}) {
  const { logger, zotero } = options;

  // 获取 Zotero 全局对象
  const Zotero = zotero || (typeof globalThis !== "undefined" && globalThis.Zotero);
  const diagnostics = {
    requestCount: 0,
    successCount: 0,
    failureCount: 0,
    timeoutCount: 0,
    retryCount: 0,
    slowOperationCount: 0,
    totalDurationMs: 0,
    slowThresholdMs: DEFAULT_SLOW_THRESHOLD_MS,
    lastRequest: null,
    lastError: null,
  };

  /**
   * 记录调试信息
   */
  function debug(message, details) {
    if (logger && typeof logger.debug === "function") {
      logger.debug(message, details);
    }
  }

  /**
   * 记录错误
   */
  function error(message, details) {
    if (logger && typeof logger.error === "function") {
      logger.error(message, details);
    }
  }

  /**
   * 检查 HTTP API 是否可用
   * @returns {boolean}
   */
  function isAvailable() {
    return Boolean(Zotero && Zotero.HTTP);
  }

  function normalizeFiniteNumber(value, fallback, { min = 0 } = {}) {
    const candidate = Number(value);
    if (!Number.isFinite(candidate)) {
      return fallback;
    }
    return Math.max(min, candidate);
  }

  function normalizeRetryCount(value) {
    return Math.max(0, Math.min(5, Math.floor(normalizeFiniteNumber(value, 0))));
  }

  function normalizeSignal(signal) {
    return signal && typeof signal === "object" ? signal : null;
  }

  function isAborted(signal) {
    return Boolean(signal && signal.aborted === true);
  }

  function createAbortError(method, url) {
    const error = new Error(`HTTP request aborted before dispatch: ${method} ${url}`);
    error.name = "AbortError";
    error.code = HTTP_ABORT_ERROR_CODE;
    error.httpErrorKind = "aborted";
    return error;
  }

  function createTimeoutError(error, context) {
    const timeoutMs = normalizeFiniteNumber(context?.timeout, DEFAULT_TIMEOUT_MS);
    const wrapped = new Error(`HTTP request timed out after ${timeoutMs}ms: ${context?.method || "GET"} ${context?.url || ""}`.trim());
    wrapped.name = "TimeoutError";
    wrapped.code = HTTP_TIMEOUT_ERROR_CODE;
    wrapped.httpErrorKind = "timeout";
    wrapped.cause = error;
    return wrapped;
  }

  function normalizeRequestError(error, context = {}) {
    if (isAborted(context.signal) || error?.name === "AbortError" || error?.code === HTTP_ABORT_ERROR_CODE) {
      return createAbortError(context.method, context.url);
    }

    const message = String(error?.message || error || "").toLowerCase();
    if (
      error?.code === HTTP_TIMEOUT_ERROR_CODE
      || error?.name === "TimeoutError"
      || message.includes("timed out")
      || message.includes("timeout")
    ) {
      return createTimeoutError(error, context);
    }

    return error instanceof Error
      ? error
      : new Error(String(error || "HTTP request failed"));
  }

  function recordExecution(entry) {
    diagnostics.requestCount += 1;
    diagnostics.totalDurationMs += normalizeFiniteNumber(entry?.durationMs, 0);
    diagnostics.retryCount += normalizeRetryCount(entry?.retryCount);
    diagnostics.slowThresholdMs = normalizeFiniteNumber(entry?.slowThresholdMs, DEFAULT_SLOW_THRESHOLD_MS);

    if (entry?.ok) {
      diagnostics.successCount += 1;
    } else {
      diagnostics.failureCount += 1;
    }

    if (entry?.timeout) {
      diagnostics.timeoutCount += 1;
    }

    if (entry?.slow) {
      diagnostics.slowOperationCount += 1;
    }

    diagnostics.lastRequest = {
      method: entry?.method || "GET",
      url: entry?.url || null,
      durationMs: normalizeFiniteNumber(entry?.durationMs, 0),
      attemptCount: Math.max(1, Math.floor(normalizeFiniteNumber(entry?.attemptCount, 1))),
      retryCount: normalizeRetryCount(entry?.retryCount),
      ok: entry?.ok === true,
      slow: entry?.slow === true,
      slowThresholdMs: normalizeFiniteNumber(entry?.slowThresholdMs, DEFAULT_SLOW_THRESHOLD_MS),
      timeout: entry?.timeout === true,
      status: Number.isFinite(Number(entry?.status)) ? Number(entry.status) : null,
    };

    diagnostics.lastError = entry?.ok
      ? null
      : {
        kind: entry?.errorKind || "request-failed",
        message: entry?.errorMessage || null,
      };
  }

  function buildRequestDiagnostics(entry) {
    return {
      durationMs: normalizeFiniteNumber(entry?.durationMs, 0),
      attemptCount: Math.max(1, Math.floor(normalizeFiniteNumber(entry?.attemptCount, 1))),
      retryCount: normalizeRetryCount(entry?.retryCount),
      retried: normalizeRetryCount(entry?.retryCount) > 0,
      slow: entry?.slow === true,
      slowThresholdMs: normalizeFiniteNumber(entry?.slowThresholdMs, DEFAULT_SLOW_THRESHOLD_MS),
      timeout: entry?.timeout === true,
      errorKind: entry?.errorKind || null,
    };
  }

  function cloneDiagnostics() {
    return {
      requestCount: diagnostics.requestCount,
      successCount: diagnostics.successCount,
      failureCount: diagnostics.failureCount,
      timeoutCount: diagnostics.timeoutCount,
      retryCount: diagnostics.retryCount,
      slowOperationCount: diagnostics.slowOperationCount,
      totalDurationMs: diagnostics.totalDurationMs,
      averageDurationMs: diagnostics.requestCount === 0
        ? 0
        : Math.round(diagnostics.totalDurationMs / diagnostics.requestCount),
      slowThresholdMs: diagnostics.slowThresholdMs,
      lastRequest: diagnostics.lastRequest ? { ...diagnostics.lastRequest } : null,
      lastError: diagnostics.lastError ? { ...diagnostics.lastError } : null,
    };
  }

  function resetDiagnostics() {
    diagnostics.requestCount = 0;
    diagnostics.successCount = 0;
    diagnostics.failureCount = 0;
    diagnostics.timeoutCount = 0;
    diagnostics.retryCount = 0;
    diagnostics.slowOperationCount = 0;
    diagnostics.totalDurationMs = 0;
    diagnostics.slowThresholdMs = DEFAULT_SLOW_THRESHOLD_MS;
    diagnostics.lastRequest = null;
    diagnostics.lastError = null;
  }

  /**
   * 发送 HTTP 请求
   * @param {string} method - HTTP 方法
   * @param {string} url - 请求 URL
   * @param {Object} [requestOptions] - 请求选项
   * @param {Object} [requestOptions.headers] - 请求头
   * @param {string|Object} [requestOptions.body] - 请求体
   * @param {number} [requestOptions.timeout] - 超时时间（毫秒）
   * @param {string} [requestOptions.responseType] - 响应类型
   * @param {number[]} [requestOptions.successCodes] - 成功状态码
   * @returns {Promise<Object>} 响应对象
   */
  async function request(method, url, requestOptions = {}) {
    if (!isAvailable()) {
      throw new Error("HTTP API not available");
    }

    const {
      headers = {},
      body,
      timeout = DEFAULT_TIMEOUT_MS,
      responseType = "text",
      successCodes = [200, 201, 202, 204],
      retryCount = 0,
      retryDelayMs = DEFAULT_RETRY_DELAY_MS,
      signal = null,
      slowThresholdMs = DEFAULT_SLOW_THRESHOLD_MS,
    } = requestOptions;

    const safeTimeout = normalizeFiniteNumber(timeout, DEFAULT_TIMEOUT_MS);
    const safeRetryCount = normalizeRetryCount(retryCount);
    const safeRetryDelayMs = normalizeFiniteNumber(retryDelayMs, DEFAULT_RETRY_DELAY_MS);
    const safeSlowThresholdMs = normalizeFiniteNumber(slowThresholdMs, DEFAULT_SLOW_THRESHOLD_MS);
    const normalizedSignal = normalizeSignal(signal);
    const startedAt = Date.now();
    let attemptCount = 0;

    while (attemptCount <= safeRetryCount) {
      attemptCount += 1;
      if (isAborted(normalizedSignal)) {
        const abortedError = createAbortError(method, url);
        const durationMs = Math.max(0, Date.now() - startedAt);
        recordExecution({
          method,
          url,
          ok: false,
          durationMs,
          attemptCount,
          retryCount: attemptCount - 1,
          slowThresholdMs: safeSlowThresholdMs,
          slow: durationMs >= safeSlowThresholdMs,
          timeout: false,
          errorKind: abortedError.httpErrorKind,
          errorMessage: abortedError.message,
        });
        throw abortedError;
      }

      debug("http.request", {
        method,
        url,
        attempt: attemptCount,
        timeout: safeTimeout,
      });

      try {
        const requestPayload = {
          headers,
          timeout: safeTimeout,
          responseType,
          successCodes,
        };

        if (body !== undefined) {
          requestPayload.body = (typeof body === "object" && body !== null)
            ? JSON.stringify(body)
            : body;
        }

        const response = await Zotero.HTTP.request(method, url, requestPayload);
        const durationMs = Math.max(0, Date.now() - startedAt);
        const diagnosticsEntry = {
          method,
          url,
          ok: true,
          status: response.status,
          durationMs,
          attemptCount,
          retryCount: attemptCount - 1,
          slowThresholdMs: safeSlowThresholdMs,
          slow: durationMs >= safeSlowThresholdMs,
          timeout: false,
          errorKind: null,
          errorMessage: null,
        };

        recordExecution(diagnosticsEntry);
        debug("http.response", {
          status: response.status,
          url,
          attempt: attemptCount,
          durationMs,
          retryCount: attemptCount - 1,
          slow: diagnosticsEntry.slow,
        });

        return {
          status: response.status,
          statusText: response.statusText,
          headers: response.responseHeaders,
          data: response.responseText,
          raw: response,
          diagnostics: buildRequestDiagnostics(diagnosticsEntry),
        };
      } catch (err) {
        const normalizedError = normalizeRequestError(err, {
          method,
          url,
          timeout: safeTimeout,
          signal: normalizedSignal,
        });
        const shouldRetry = (
          normalizedError?.httpErrorKind !== "aborted"
          && attemptCount <= safeRetryCount
        );

        if (shouldRetry) {
          debug("http.request.retry", {
            method,
            url,
            attempt: attemptCount,
            retryDelayMs: safeRetryDelayMs,
            message: String(normalizedError?.message || normalizedError),
          });
          await sleep(safeRetryDelayMs);
          continue;
        }

        const durationMs = Math.max(0, Date.now() - startedAt);
        const diagnosticsEntry = {
          method,
          url,
          ok: false,
          durationMs,
          attemptCount,
          retryCount: attemptCount - 1,
          slowThresholdMs: safeSlowThresholdMs,
          slow: durationMs >= safeSlowThresholdMs,
          timeout: normalizedError?.httpErrorKind === "timeout",
          errorKind: normalizedError?.httpErrorKind || "request-failed",
          errorMessage: String(normalizedError?.message || normalizedError),
        };

        recordExecution(diagnosticsEntry);
        error("http.request.failed", {
          method,
          url,
          attemptCount,
          retryCount: attemptCount - 1,
          durationMs,
          errorKind: diagnosticsEntry.errorKind,
          message: diagnosticsEntry.errorMessage,
        });
        throw normalizedError;
      }
    }

    throw new Error(`HTTP request failed unexpectedly: ${method} ${url}`);
  }

  /**
   * GET 请求
   * @param {string} url - 请求 URL
   * @param {Object} [options] - 请求选项
   * @returns {Promise<Object>} 响应对象
   */
  async function get(url, options = {}) {
    return request(HTTP_METHODS.GET, url, options);
  }

  /**
   * POST 请求
   * @param {string} url - 请求 URL
   * @param {string|Object} [body] - 请求体
   * @param {Object} [options] - 请求选项
   * @returns {Promise<Object>} 响应对象
   */
  async function post(url, body, options = {}) {
    return request(HTTP_METHODS.POST, url, { ...options, body });
  }

  /**
   * PUT 请求
   * @param {string} url - 请求 URL
   * @param {string|Object} [body] - 请求体
   * @param {Object} [options] - 请求选项
   * @returns {Promise<Object>} 响应对象
   */
  async function put(url, body, options = {}) {
    return request(HTTP_METHODS.PUT, url, { ...options, body });
  }

  /**
   * DELETE 请求
   * @param {string} url - 请求 URL
   * @param {Object} [options] - 请求选项
   * @returns {Promise<Object>} 响应对象
   */
  async function del(url, options = {}) {
    return request(HTTP_METHODS.DELETE, url, options);
  }

  /**
   * PATCH 请求
   * @param {string} url - 请求 URL
   * @param {string|Object} [body] - 请求体
   * @param {Object} [options] - 请求选项
   * @returns {Promise<Object>} 响应对象
   */
  async function patch(url, body, options = {}) {
    return request(HTTP_METHODS.PATCH, url, { ...options, body });
  }

  /**
   * HEAD 请求
   * @param {string} url - 请求 URL
   * @param {Object} [options] - 请求选项
   * @returns {Promise<Object>} 响应对象
   */
  async function head(url, options = {}) {
    return request(HTTP_METHODS.HEAD, url, options);
  }

  /**
   * 发送 JSON 请求
   * @param {string} method - HTTP 方法
   * @param {string} url - 请求 URL
   * @param {Object} [data] - JSON 数据
   * @param {Object} [options] - 请求选项
   * @returns {Promise<Object>} 响应对象
   */
  async function json(method, url, data, options = {}) {
    const headers = {
      "Content-Type": CONTENT_TYPES.JSON,
      Accept: CONTENT_TYPES.JSON,
      ...(options.headers || {}),
    };

    const response = await request(method, url, {
      ...options,
      headers,
      body: data,
    });

    // 尝试解析 JSON 响应
    if (response.data) {
      try {
        response.json = JSON.parse(response.data);
      } catch {
        // 响应不是 JSON 格式
      }
    }

    return response;
  }

  /**
   * GET JSON
   * @param {string} url - 请求 URL
   * @param {Object} [options] - 请求选项
   * @returns {Promise<Object>} JSON 响应
   */
  async function getJSON(url, options = {}) {
    const response = await json(HTTP_METHODS.GET, url, undefined, options);
    return response.json;
  }

  /**
   * POST JSON
   * @param {string} url - 请求 URL
   * @param {Object} data - JSON 数据
   * @param {Object} [options] - 请求选项
   * @returns {Promise<Object>} JSON 响应
   */
  async function postJSON(url, data, options = {}) {
    const response = await json(HTTP_METHODS.POST, url, data, options);
    return response.json;
  }

  /**
   * 下载文件
   * @param {string} url - 下载 URL
   * @param {string} destPath - 目标路径
   * @param {Object} [options] - 下载选项
   * @returns {Promise<boolean>} 是否成功
   */
  async function download(url, destPath, options = {}) {
    if (!isAvailable()) {
      throw new Error("HTTP API not available");
    }

    const {
      retryCount,
      retryDelayMs,
      signal,
      slowThresholdMs,
      ...downloadOptions
    } = options;
    const safeRetryCount = normalizeRetryCount(options.retryCount);
    const safeRetryDelayMs = normalizeFiniteNumber(options.retryDelayMs, DEFAULT_RETRY_DELAY_MS);
    const safeSlowThresholdMs = normalizeFiniteNumber(options.slowThresholdMs, DEFAULT_SLOW_THRESHOLD_MS);
    const normalizedSignal = normalizeSignal(options.signal);
    const startedAt = Date.now();
    let attemptCount = 0;

    while (attemptCount <= safeRetryCount) {
      attemptCount += 1;
      if (isAborted(normalizedSignal)) {
        error("http.download.failed", {
          url,
          destPath,
          attemptCount,
          errorKind: "aborted",
          message: `HTTP request aborted before dispatch: DOWNLOAD ${url}`,
        });
        recordExecution({
          method: "DOWNLOAD",
          url,
          ok: false,
          durationMs: Math.max(0, Date.now() - startedAt),
          attemptCount,
          retryCount: attemptCount - 1,
          slowThresholdMs: safeSlowThresholdMs,
          slow: Math.max(0, Date.now() - startedAt) >= safeSlowThresholdMs,
          timeout: false,
          errorKind: "aborted",
          errorMessage: `HTTP request aborted before dispatch: DOWNLOAD ${url}`,
        });
        return false;
      }

      debug("http.download", { url, destPath, attempt: attemptCount });

      try {
        await Zotero.HTTP.download(url, destPath, downloadOptions);
        const durationMs = Math.max(0, Date.now() - startedAt);
        recordExecution({
          method: "DOWNLOAD",
          url,
          ok: true,
          durationMs,
          attemptCount,
          retryCount: attemptCount - 1,
          slowThresholdMs: safeSlowThresholdMs,
          slow: durationMs >= safeSlowThresholdMs,
          timeout: false,
          errorKind: null,
          errorMessage: null,
        });
        debug("http.download.success", {
          url,
          destPath,
          durationMs,
          retryCount: attemptCount - 1,
        });
        return true;
      } catch (err) {
        const normalizedError = normalizeRequestError(err, {
          method: "DOWNLOAD",
          url,
          timeout: options.timeout,
          signal: normalizedSignal,
        });
        const shouldRetry = (
          normalizedError?.httpErrorKind !== "aborted"
          && attemptCount <= safeRetryCount
        );

        if (shouldRetry) {
          debug("http.download.retry", {
            url,
            destPath,
            attempt: attemptCount,
            retryDelayMs: safeRetryDelayMs,
            message: String(normalizedError?.message || normalizedError),
          });
          await sleep(safeRetryDelayMs);
          continue;
        }

        const durationMs = Math.max(0, Date.now() - startedAt);
        recordExecution({
          method: "DOWNLOAD",
          url,
          ok: false,
          durationMs,
          attemptCount,
          retryCount: attemptCount - 1,
          slowThresholdMs: safeSlowThresholdMs,
          slow: durationMs >= safeSlowThresholdMs,
          timeout: normalizedError?.httpErrorKind === "timeout",
          errorKind: normalizedError?.httpErrorKind || "request-failed",
          errorMessage: String(normalizedError?.message || normalizedError),
        });
        error("http.download.failed", {
          url,
          destPath,
          attemptCount,
          retryCount: attemptCount - 1,
          durationMs,
          errorKind: normalizedError?.httpErrorKind || "request-failed",
          message: String(normalizedError?.message || normalizedError),
        });
        return false;
      }
    }

    return false;
  }

  /**
   * 构建查询字符串
   * @param {Object} params - 参数对象
   * @returns {string} 查询字符串
   */
  function buildQueryString(params) {
    if (!params || typeof params !== "object") {
      return "";
    }

    const parts = [];
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
      }
    }

    return parts.length > 0 ? `?${parts.join("&")}` : "";
  }

  /**
   * 解析查询字符串
   * @param {string} queryString - 查询字符串
   * @returns {Object} 参数对象
   */
  function parseQueryString(queryString) {
    const params = {};

    if (!queryString || typeof queryString !== "string") {
      return params;
    }

    // 移除开头的 ?
    const str = queryString.startsWith("?") ? queryString.slice(1) : queryString;

    for (const pair of str.split("&")) {
      const [key, value] = pair.split("=");
      if (key) {
        params[decodeURIComponent(key)] = value ? decodeURIComponent(value) : "";
      }
    }

    return params;
  }

  /**
   * 构建完整 URL
   * @param {string} baseUrl - 基础 URL
   * @param {string} [path] - 路径
   * @param {Object} [params] - 查询参数
   * @returns {string} 完整 URL
   */
  function buildURL(baseUrl, path = "", params = {}) {
    let url = baseUrl;

    // 添加路径
    if (path) {
      url = url.endsWith("/") ? url.slice(0, -1) : url;
      url += path.startsWith("/") ? path : `/${path}`;
    }

    // 添加查询参数
    const queryString = buildQueryString(params);
    url += queryString;

    return url;
  }

  // 返回公共 API
  return {
    // 常量
    HTTP_METHODS,
    CONTENT_TYPES,

    // 状态检查
    isAvailable,

    // 基础请求方法
    request,

    // 便捷方法
    get,
    post,
    put,
    del,
    patch,
    head,

    // JSON 方法
    json,
    getJSON,
    postJSON,

    // 下载
    download,

    // 诊断
    getDiagnostics: cloneDiagnostics,
    resetDiagnostics,

    // URL 工具
    buildQueryString,
    parseQueryString,
    buildURL,
  };
}
