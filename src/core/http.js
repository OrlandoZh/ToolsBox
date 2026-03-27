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
      timeout = 30000,
      responseType = "text",
      successCodes = [200, 201, 202, 204],
    } = requestOptions;

    debug("http.request", { method, url });

    try {
      const options = {
        headers,
        timeout,
        responseType,
        successCodes,
      };

      if (body !== undefined) {
        options.body = typeof body === "object" ? JSON.stringify(body) : body;
      }

      const response = await Zotero.HTTP.request(method, url, options);

      debug("http.response", {
        status: response.status,
        url,
      });

      return {
        status: response.status,
        statusText: response.statusText,
        headers: response.responseHeaders,
        data: response.responseText,
        raw: response,
      };
    } catch (err) {
      error("http.request.failed", {
        method,
        url,
        message: String(err?.message || err),
      });
      throw err;
    }
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

    debug("http.download", { url, destPath });

    try {
      await Zotero.HTTP.download(url, destPath, options);
      debug("http.download.success", { url, destPath });
      return true;
    } catch (err) {
      error("http.download.failed", {
        url,
        destPath,
        message: String(err?.message || err),
      });
      return false;
    }
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

    // URL 工具
    buildQueryString,
    parseQueryString,
    buildURL,
  };
}
