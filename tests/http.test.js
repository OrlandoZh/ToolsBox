/**
 * HTTP 模块测试
 */
import { describe, it, beforeEach, assert } from "./test-framework.js";
import { createHTTP, HTTP_METHODS, CONTENT_TYPES } from "../src/core/http.js";

let requestCalls = [];
let downloadCalls = [];
let debugEntries = [];
let errorEntries = [];
let requestImpl = null;
let downloadImpl = null;
let http = null;

function createLogger() {
  return {
    debug(message, details) {
      debugEntries.push({ message, details });
    },
    error(message, details) {
      errorEntries.push({ message, details });
    },
  };
}

describe("HTTP", () => {
  beforeEach(() => {
    requestCalls = [];
    downloadCalls = [];
    debugEntries = [];
    errorEntries = [];

    requestImpl = async (method, url, options) => {
      requestCalls.push({ method, url, options });
      return {
        status: 200,
        statusText: "OK",
        responseHeaders: { "content-type": "text/plain" },
        responseText: "plain-text",
      };
    };

    downloadImpl = async (url, destPath, options) => {
      downloadCalls.push({ url, destPath, options });
    };

    http = createHTTP({
      logger: createLogger(),
      zotero: {
        HTTP: {
          request(method, url, options) {
            return requestImpl(method, url, options);
          },
          download(url, destPath, options) {
            return downloadImpl(url, destPath, options);
          },
        },
      },
    });
  });

  it("should report availability from Zotero.HTTP", () => {
    assert.equal(http.isAvailable(), true);
    const unavailable = createHTTP({ zotero: {} });
    assert.equal(unavailable.isAvailable(), false);
  });

  it("should forward request options and wrap response", async () => {
    const response = await http.request(HTTP_METHODS.POST, "https://example.com/api", {
      headers: { Authorization: "Bearer token" },
      body: { ok: true },
      timeout: 5000,
      responseType: "json",
      successCodes: [200, 201],
    });

    assert.equal(requestCalls.length, 1);
    assert.equal(requestCalls[0].method, HTTP_METHODS.POST);
    assert.equal(requestCalls[0].url, "https://example.com/api");
    assert.deepEqual(requestCalls[0].options.headers, { Authorization: "Bearer token" });
    assert.equal(requestCalls[0].options.body, JSON.stringify({ ok: true }));
    assert.equal(requestCalls[0].options.timeout, 5000);
    assert.equal(requestCalls[0].options.responseType, "json");
    assert.deepEqual(requestCalls[0].options.successCodes, [200, 201]);
    assert.equal(response.status, 200);
    assert.equal(response.statusText, "OK");
    assert.deepEqual(response.headers, { "content-type": "text/plain" });
    assert.equal(response.data, "plain-text");
    assert.equal(debugEntries.length, 2);
    assert.equal(debugEntries[0].message, "http.request");
    assert.equal(debugEntries[1].message, "http.response");
  });

  it("should expose convenience methods with matching HTTP verbs", async () => {
    await http.get("https://example.com/get");
    await http.post("https://example.com/post", "body");
    await http.put("https://example.com/put", "body");
    await http.del("https://example.com/delete");
    await http.patch("https://example.com/patch", "body");
    await http.head("https://example.com/head");

    assert.deepEqual(
      requestCalls.map((entry) => entry.method),
      [
        HTTP_METHODS.GET,
        HTTP_METHODS.POST,
        HTTP_METHODS.PUT,
        HTTP_METHODS.DELETE,
        HTTP_METHODS.PATCH,
        HTTP_METHODS.HEAD,
      ],
    );
  });

  it("should add JSON headers and parse JSON responses", async () => {
    requestImpl = async (method, url, options) => {
      requestCalls.push({ method, url, options });
      return {
        status: 200,
        statusText: "OK",
        responseHeaders: { "content-type": CONTENT_TYPES.JSON },
        responseText: JSON.stringify({ ok: true, url }),
      };
    };

    const response = await http.json(HTTP_METHODS.POST, "https://example.com/json", { name: "test" }, {
      headers: { "X-Test": "1" },
    });

    assert.equal(requestCalls.length, 1);
    assert.equal(requestCalls[0].options.headers["Content-Type"], CONTENT_TYPES.JSON);
    assert.equal(requestCalls[0].options.headers.Accept, CONTENT_TYPES.JSON);
    assert.equal(requestCalls[0].options.headers["X-Test"], "1");
    assert.deepEqual(response.json, { ok: true, url: "https://example.com/json" });
  });

  it("should return parsed payloads from getJSON and postJSON", async () => {
    requestImpl = async (method, url, options) => {
      requestCalls.push({ method, url, options });
      return {
        status: 200,
        statusText: "OK",
        responseHeaders: {},
        responseText: JSON.stringify({ method, ok: true }),
      };
    };

    const getResult = await http.getJSON("https://example.com/get-json");
    const postResult = await http.postJSON("https://example.com/post-json", { id: 1 });

    assert.deepEqual(getResult, { method: HTTP_METHODS.GET, ok: true });
    assert.deepEqual(postResult, { method: HTTP_METHODS.POST, ok: true });
  });

  it("should ignore invalid JSON payloads without throwing", async () => {
    requestImpl = async () => ({
      status: 200,
      statusText: "OK",
      responseHeaders: {},
      responseText: "not-json",
    });

    const response = await http.json(HTTP_METHODS.GET, "https://example.com/not-json");
    assert.equal(response.json, undefined);
  });

  it("should throw when HTTP API is unavailable", async () => {
    const unavailable = createHTTP({ zotero: {} });

    let caught = null;
    try {
      await unavailable.get("https://example.com");
    } catch (error) {
      caught = error;
    }

    assert.ok(caught instanceof Error);
    assert.equal(caught.message, "HTTP API not available");
  });

  it("should log and rethrow request failures", async () => {
    requestImpl = async () => {
      throw new Error("boom");
    };

    let caught = null;
    try {
      await http.get("https://example.com/fail");
    } catch (error) {
      caught = error;
    }

    assert.ok(caught instanceof Error);
    assert.equal(caught.message, "boom");
    assert.equal(errorEntries.length, 1);
    assert.equal(errorEntries[0].message, "http.request.failed");
    assert.equal(errorEntries[0].details.method, HTTP_METHODS.GET);
  });

  it("should return true for successful downloads", async () => {
    const result = await http.download("https://example.com/file.pdf", "/tmp/file.pdf", {
      headers: { Accept: "application/pdf" },
    });

    assert.equal(result, true);
    assert.equal(downloadCalls.length, 1);
    assert.equal(downloadCalls[0].url, "https://example.com/file.pdf");
    assert.equal(downloadCalls[0].destPath, "/tmp/file.pdf");
    assert.deepEqual(downloadCalls[0].options, { headers: { Accept: "application/pdf" } });
  });

  it("should return false and log when download fails", async () => {
    downloadImpl = async () => {
      throw new Error("download failed");
    };

    const result = await http.download("https://example.com/file.pdf", "/tmp/file.pdf");

    assert.equal(result, false);
    assert.equal(errorEntries.length, 1);
    assert.equal(errorEntries[0].message, "http.download.failed");
  });

  it("should build query strings and URLs", () => {
    assert.equal(http.buildQueryString({ q: "hello world", page: 2, nil: null, skip: undefined }), "?q=hello%20world&page=2");
    assert.equal(http.buildQueryString(null), "");
    assert.equal(
      http.buildURL("https://example.com/", "/search", { q: "zotero", page: 1 }),
      "https://example.com/search?q=zotero&page=1",
    );
    assert.equal(http.buildURL("https://example.com", "status"), "https://example.com/status");
  });

  it("should parse query strings", () => {
    assert.deepEqual(http.parseQueryString("?q=hello%20world&page=2&empty="), {
      q: "hello world",
      page: "2",
      empty: "",
    });
    assert.deepEqual(http.parseQueryString("single=value"), { single: "value" });
    assert.deepEqual(http.parseQueryString(""), {});
  });
});
