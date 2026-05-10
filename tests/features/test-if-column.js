import { describe, it, assert, beforeEach, afterEach, runTests } from "../test-framework.js";
import { createEasyScholarClient } from "../../src/services/easyscholar-client.js";
import { createIFColumn } from "../../src/features/if-column.js";

function createMockLogger() {
  const logs = [];
  return {
    debug: (msg, data) => logs.push({ level: 'debug', msg, data }),
    info: (msg, data) => logs.push({ level: 'info', msg, data }),
    warn: (msg, data) => logs.push({ level: 'warn', msg, data }),
    error: (msg, data) => logs.push({ level: 'error', msg, data }),
    logs,
    getLogs: () => logs
  };
}

function createMockPrefs(values = {}) {
  return {
    get: (key) => values[key] ?? null
  };
}

function createMockI18n() {
  return {
    t: (key, fallback) => fallback || key
  };
}

function createMockItem(extra = '', publicationTitle = '') {
  return {
    id: 1,
    getField: (field) => {
      if (field === 'extra') return extra;
      if (field === 'publicationTitle') return publicationTitle;
      return '';
    },
    setField: () => {},
    saveTx: async () => {}
  };
}

function createMockZotero() {
  return {
    ItemTreeManager: {
      registerColumn: () => {}
    },
    getMainWindow: () => ({
      document: {
        createElement: (tag) => {
          const el = {
            tagName: tag,
            className: '',
            style: {},
            textContent: '',
            appendChild: (child) => el.children?.push(child),
            children: []
          };
          Object.assign(el.style, {
            cssText: '',
            display: '',
            alignItems: '',
            flexWrap: '',
            width: '',
            height: '',
            padding: '',
            gap: '',
            position: '',
            overflow: '',
            marginRight: '',
            borderRadius: '',
            fontSize: '',
            fontWeight: '',
            backgroundColor: '',
            color: '',
            opacity: '',
            marginTop: '',
            bottom: '',
            left: '',
            whiteSpace: ''
          });
          return el;
        }
      }
    })
  };
}

function createMockEasyScholarClient(mockData = {}) {
  return {
    getJournalMetrics: async (journalName) => {
      if (mockData[journalName]) {
        return mockData[journalName];
      }
      return null;
    },
    clearCache: () => {},
    getCacheStats: () => ({ size: 0, rateLimitRemaining: 10 })
  };
}

describe("EasyScholar Client", () => {
  it("should return null for empty journal name", async () => {
    const client = createEasyScholarClient({ apiKey: 'test' });
    const result = await client.getJournalMetrics('');
    assert.equal(result, null);
  });

  it("should return null for invalid journal name type", async () => {
    const client = createEasyScholarClient({ apiKey: 'test' });
    const result = await client.getJournalMetrics(null);
    assert.equal(result, null);
    const result2 = await client.getJournalMetrics(123);
    assert.equal(result2, null);
  });

  it("should use in-memory cache for repeated requests", async () => {
    const logger = createMockLogger();
    const client = createEasyScholarClient({
      apiKey: 'test',
      cacheTTL: 300000,
      logger
    });

    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        success: true,
        data: { sciIF: 10.5, sciQ: 'Q1', ssci: true }
      })
    });

    const result1 = await client.getJournalMetrics('Nature');
    const result2 = await client.getJournalMetrics('Nature');

    assert.ok(result1);
    assert.ok(result2);
    assert.equal(logger.logs.filter(l => l.msg === 'easyscholar.cacheHit').length, 1);

    global.fetch = undefined;
  });

  it("should clear cache on request", () => {
    const client = createEasyScholarClient({ apiKey: 'test' });
    client.clearCache();
    const stats = client.getCacheStats();
    assert.equal(stats.size, 0);
  });

  it("should return cache statistics", () => {
    const client = createEasyScholarClient({ apiKey: 'test' });
    const stats = client.getCacheStats();
    assert.ok(stats);
    assert.typeOf(stats.size, 'number');
    assert.typeOf(stats.rateLimitRemaining, 'number');
  });
});

describe("IF Column - extractCachedIF", () => {
  it("should extract cached IF data from extra field", () => {
    const prefs = createMockPrefs();
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const zotero = createMockZotero();

    const ifColumn = createIFColumn({
      logger,
      i18n,
      zotero,
      prefs
    });

    const extra = 'Some notes\nIF-Data: {"sciIF":12.5,"sciQ":"Q1","timestamp":1234567890}';
    const result = ifColumn.extractCachedIF(extra);

    assert.ok(result);
    assert.equal(result.sciIF, 12.5);
    assert.equal(result.sciQ, 'Q1');
    assert.equal(result.timestamp, 1234567890);
  });

  it("should return null for extra field without IF-Data", () => {
    const prefs = createMockPrefs();
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const zotero = createMockZotero();

    const ifColumn = createIFColumn({
      logger,
      i18n,
      zotero,
      prefs
    });

    const result = ifColumn.extractCachedIF('Some notes without IF data');
    assert.equal(result, null);
  });

  it("should return null for empty extra field", () => {
    const prefs = createMockPrefs();
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const zotero = createMockZotero();

    const ifColumn = createIFColumn({
      logger,
      i18n,
      zotero,
      prefs
    });

    const result = ifColumn.extractCachedIF('');
    assert.equal(result, null);
  });

  it("should return null for malformed JSON in IF-Data", () => {
    const prefs = createMockPrefs();
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const zotero = createMockZotero();

    const ifColumn = createIFColumn({
      logger,
      i18n,
      zotero,
      prefs
    });

    const extra = 'IF-Data: {invalid json}';
    const result = ifColumn.extractCachedIF(extra);
    assert.equal(result, null);
  });
});

describe("IF Column - isExpired", () => {
  it("should return true for old timestamp", () => {
    const prefs = createMockPrefs({ 'ifColumn.cacheExpiry': '7' });
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const zotero = createMockZotero();

    const ifColumn = createIFColumn({
      logger,
      i18n,
      zotero,
      prefs
    });

    const oldTimestamp = Date.now() - (8 * 24 * 60 * 60 * 1000);
    assert.ok(ifColumn.isExpired(oldTimestamp));
  });

  it("should return false for recent timestamp", () => {
    const prefs = createMockPrefs({ 'ifColumn.cacheExpiry': '7' });
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const zotero = createMockZotero();

    const ifColumn = createIFColumn({
      logger,
      i18n,
      zotero,
      prefs
    });

    const recentTimestamp = Date.now() - (1 * 24 * 60 * 60 * 1000);
    assert.equal(ifColumn.isExpired(recentTimestamp), false);
  });

  it("should return true for null timestamp", () => {
    const prefs = createMockPrefs();
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const zotero = createMockZotero();

    const ifColumn = createIFColumn({
      logger,
      i18n,
      zotero,
      prefs
    });

    assert.ok(ifColumn.isExpired(null));
  });
});

describe("IF Column - getColorForValue", () => {
  it("should return correct color for Q1", () => {
    const prefs = createMockPrefs();
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const zotero = createMockZotero();

    const ifColumn = createIFColumn({
      logger,
      i18n,
      zotero,
      prefs
    });

    assert.equal(ifColumn.getColorForValue('Q1'), '#4caf50');
  });

  it("should return correct color for Q2", () => {
    const prefs = createMockPrefs();
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const zotero = createMockZotero();

    const ifColumn = createIFColumn({
      logger,
      i18n,
      zotero,
      prefs
    });

    assert.equal(ifColumn.getColorForValue('Q2'), '#2196f3');
  });

  it("should return correct color for Q3", () => {
    const prefs = createMockPrefs();
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const zotero = createMockZotero();

    const ifColumn = createIFColumn({
      logger,
      i18n,
      zotero,
      prefs
    });

    assert.equal(ifColumn.getColorForValue('Q3'), '#ff9800');
  });

  it("should return correct color for Q4", () => {
    const prefs = createMockPrefs();
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const zotero = createMockZotero();

    const ifColumn = createIFColumn({
      logger,
      i18n,
      zotero,
      prefs
    });

    assert.equal(ifColumn.getColorForValue('Q4'), '#f44336');
  });

  it("should return gray for unknown value", () => {
    const prefs = createMockPrefs();
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const zotero = createMockZotero();

    const ifColumn = createIFColumn({
      logger,
      i18n,
      zotero,
      prefs
    });

    assert.equal(ifColumn.getColorForValue('Unknown'), '#9e9e9e');
  });

  it("should return gray for null value", () => {
    const prefs = createMockPrefs();
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const zotero = createMockZotero();

    const ifColumn = createIFColumn({
      logger,
      i18n,
      zotero,
      prefs
    });

    assert.equal(ifColumn.getColorForValue(null), '#9e9e9e');
  });
});

describe("IF Column - renderCell", () => {
  it("should render empty cell for null data", () => {
    const prefs = createMockPrefs();
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const zotero = createMockZotero();

    const ifColumn = createIFColumn({
      logger,
      i18n,
      zotero,
      prefs
    });

    const doc = zotero.getMainWindow().document;
    const cell = ifColumn.renderCell(doc, null, {});

    assert.ok(cell);
    assert.includes(cell.className, 'if-column-cell');
  });

  it("should render IF value with progress bar", () => {
    const prefs = createMockPrefs({ 'ifColumn.fields': 'SCIIF', 'ifColumn.showProgress': 'true' });
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const zotero = createMockZotero();

    const ifColumn = createIFColumn({
      logger,
      i18n,
      zotero,
      prefs
    });

    const doc = zotero.getMainWindow().document;
    const ifData = { sciIF: 12.5, sciQ: 'Q1', timestamp: Date.now() };
    const cell = ifColumn.renderCell(doc, ifData, {});

    assert.ok(cell);
    assert.includes(cell.className, 'if-column-cell');
  });

  it("should render Q quartile with color", () => {
    const prefs = createMockPrefs({ 'ifColumn.fields': 'SCI-Q' });
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const zotero = createMockZotero();

    const ifColumn = createIFColumn({
      logger,
      i18n,
      zotero,
      prefs
    });

    const doc = zotero.getMainWindow().document;
    const ifData = { sciQ: 'Q2', timestamp: Date.now() };
    const cell = ifColumn.renderCell(doc, ifData, {});

    assert.ok(cell);
  });

  it("should render multiple fields", () => {
    const prefs = createMockPrefs({ 'ifColumn.fields': 'SCIIF,SCI-Q,SSCI' });
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const zotero = createMockZotero();

    const ifColumn = createIFColumn({
      logger,
      i18n,
      zotero,
      prefs
    });

    const doc = zotero.getMainWindow().document;
    const ifData = { sciIF: 12.5, sciQ: 'Q1', ssci: true, timestamp: Date.now() };
    const cell = ifColumn.renderCell(doc, ifData, {});

    assert.ok(cell);
  });

  it("should render boolean SSCI value correctly", () => {
    const prefs = createMockPrefs({ 'ifColumn.fields': 'SSCI' });
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const zotero = createMockZotero();

    const ifColumn = createIFColumn({
      logger,
      i18n,
      zotero,
      prefs
    });

    const doc = zotero.getMainWindow().document;
    const ifDataTrue = { ssci: true, timestamp: Date.now() };
    const ifDataFalse = { ssci: false, timestamp: Date.now() };

    const cellTrue = ifColumn.renderCell(doc, ifDataTrue, {});
    const cellFalse = ifColumn.renderCell(doc, ifDataFalse, {});

    assert.ok(cellTrue);
    assert.ok(cellFalse);
  });

  it("should use custom color mapping from prefs", () => {
    const prefs = createMockPrefs({
      'ifColumn.colorMapping': 'Q1:#ff0000,Q2:#00ff00'
    });
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const zotero = createMockZotero();

    const ifColumn = createIFColumn({
      logger,
      i18n,
      zotero,
      prefs
    });

    assert.equal(ifColumn.getColorForValue('Q1'), '#ff0000');
    assert.equal(ifColumn.getColorForValue('Q2'), '#00ff00');
  });
});

describe("IF Column - register", () => {
  it("should register successfully with ItemTreeManager", () => {
    const prefs = createMockPrefs();
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const zotero = createMockZotero();

    const ifColumn = createIFColumn({
      logger,
      i18n,
      zotero,
      prefs
    });

    const result = ifColumn.register();
    assert.equal(result, true);
  });

  it("should fail registration without ItemTreeManager", () => {
    const prefs = createMockPrefs();
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const zoteroWithoutManager = { getMainWindow: createMockZotero().getMainWindow };

    const ifColumn = createIFColumn({
      logger,
      i18n,
      zotero: zoteroWithoutManager,
      prefs
    });

    const result = ifColumn.register();
    assert.equal(result, false);
  });
});

describe("IF Column - getIFData", () => {
  it("should return null for item without publication title", async () => {
    const prefs = createMockPrefs();
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const zotero = createMockZotero();
    const client = createMockEasyScholarClient();

    const ifColumn = createIFColumn({
      logger,
      i18n,
      zotero,
      prefs,
      easyscholarClient: client
    });

    const item = createMockItem('', '');
    const result = await ifColumn.getIFData(item);

    assert.equal(result, null);
  });

  it("should return cached data without API call", async () => {
    const prefs = createMockPrefs({ 'ifColumn.cacheExpiry': '7' });
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const zotero = createMockZotero();
    const client = createMockEasyScholarClient();

    const ifColumn = createIFColumn({
      logger,
      i18n,
      zotero,
      prefs,
      easyscholarClient: client
    });

    const cachedData = { sciIF: 10, sciQ: 'Q1', timestamp: Date.now() };
    const extra = `IF-Data: ${JSON.stringify(cachedData)}`;
    const item = createMockItem(extra, 'Nature');

    const result = await ifColumn.getIFData(item);

    assert.ok(result);
    assert.equal(result.sciIF, 10);
    assert.equal(result.sciQ, 'Q1');
  });

  it("should fetch from API when cache is expired", async () => {
    const prefs = createMockPrefs({ 'ifColumn.cacheExpiry': '1' });
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const zotero = createMockZotero();

    const mockData = {
      'Science': { sciIF: 50, sciQ: 'Q1', ssci: true }
    };
    const client = createMockEasyScholarClient(mockData);

    const ifColumn = createIFColumn({
      logger,
      i18n,
      zotero,
      prefs,
      easyscholarClient: client
    });

    const expiredTimestamp = Date.now() - (2 * 24 * 60 * 60 * 1000);
    const cachedData = { sciIF: 5, sciQ: 'Q3', timestamp: expiredTimestamp };
    const extra = `IF-Data: ${JSON.stringify(cachedData)}`;
    const item = createMockItem(extra, 'Science');

    const result = await ifColumn.getIFData(item);

    assert.ok(result);
    assert.equal(result.sciIF, 50);
    assert.equal(result.sciQ, 'Q1');
  });

  it("should return null for item without id", async () => {
    const prefs = createMockPrefs();
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const zotero = createMockZotero();
    const client = createMockEasyScholarClient();

    const ifColumn = createIFColumn({
      logger,
      i18n,
      zotero,
      prefs,
      easyscholarClient: client
    });

    const item = { getField: () => 'Nature' };
    const result = await ifColumn.getIFData(item);

    assert.equal(result, null);
  });
});

describe("IF Column - configuration", () => {
  it("should use default fields when prefs not set", () => {
    const prefs = createMockPrefs();
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const zotero = createMockZotero();

    const ifColumn = createIFColumn({
      logger,
      i18n,
      zotero,
      prefs
    });

    assert.deepEqual(ifColumn.configFields, ['SCIIF', 'SCI-Q']);
  });

  it("should use custom fields from prefs", () => {
    const prefs = createMockPrefs({ 'ifColumn.fields': 'SSCI,UTD24,AJG' });
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const zotero = createMockZotero();

    const ifColumn = createIFColumn({
      logger,
      i18n,
      zotero,
      prefs
    });

    assert.deepEqual(ifColumn.configFields, ['SSCI', 'UTD24', 'AJG']);
  });

  it("should show progress by default", () => {
    const prefs = createMockPrefs();
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const zotero = createMockZotero();

    const ifColumn = createIFColumn({
      logger,
      i18n,
      zotero,
      prefs
    });

    assert.equal(ifColumn.configShowProgress, true);
  });

  it("should disable progress when prefs set to false", () => {
    const prefs = createMockPrefs({ 'ifColumn.showProgress': 'false' });
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const zotero = createMockZotero();

    const ifColumn = createIFColumn({
      logger,
      i18n,
      zotero,
      prefs
    });

    assert.equal(ifColumn.configShowProgress, false);
  });
});

describe("IF Column - full integration", () => {
  it("should handle complete workflow from fetch to render", async () => {
    const prefs = createMockPrefs({ 'ifColumn.fields': 'SCIIF,SCI-Q' });
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const zotero = createMockZotero();

    const mockData = {
      'Cell': { sciIF: 45, sciQ: 'Q1', ssci: true, timestamp: Date.now() }
    };
    const client = createMockEasyScholarClient(mockData);

    const ifColumn = createIFColumn({
      logger,
      i18n,
      zotero,
      prefs,
      easyscholarClient: client
    });

    const item = createMockItem('', 'Cell');
    const data = await ifColumn.getIFData(item);

    assert.ok(data);
    assert.equal(data.sciIF, 45);
    assert.equal(data.sciQ, 'Q1');

    const doc = zotero.getMainWindow().document;
    const cell = ifColumn.renderCell(doc, data, {});
    assert.ok(cell);
  });
});

describe("EasyScholar Client - rate limiting", () => {
  it("should track rate limit correctly", async () => {
    const logger = createMockLogger();
    const client = createEasyScholarClient({
      apiKey: 'test',
      logger
    });

    const stats = client.getCacheStats();
    assert.equal(stats.rateLimitRemaining, 10);
  });
});

describe("IF Column - edge cases", () => {
  it("should handle empty journal name gracefully", async () => {
    const prefs = createMockPrefs();
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const zotero = createMockZotero();
    const client = createMockEasyScholarClient();

    const ifColumn = createIFColumn({
      logger,
      i18n,
      zotero,
      prefs,
      easyscholarClient: client
    });

    const item = createMockItem('', '   ');
    const result = await ifColumn.getIFData(item);

    assert.equal(result, null);
  });

  it("should parse IF-Data with whitespace", () => {
    const prefs = createMockPrefs();
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const zotero = createMockZotero();

    const ifColumn = createIFColumn({
      logger,
      i18n,
      zotero,
      prefs
    });

    const extra = 'IF-Data: { "sciIF": 10, "sciQ": "Q1" }';
    const result = ifColumn.extractCachedIF(extra);

    assert.ok(result);
    assert.equal(result.sciIF, 10);
    assert.equal(result.sciQ, 'Q1');
  });

  it("should handle missing timestamp in cached data", () => {
    const prefs = createMockPrefs();
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const zotero = createMockZotero();

    const ifColumn = createIFColumn({
      logger,
      i18n,
      zotero,
      prefs
    });

    const cachedData = { sciIF: 10, sciQ: 'Q1' };
    const result = ifColumn.isExpired(cachedData.timestamp);

    assert.ok(result);
  });
});

await runTests();