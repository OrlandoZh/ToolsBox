/**
 * View Groups Tests
 * Tests for column visibility preset management
 */
import { describe, it, beforeEach, afterEach, assert, runTestsIfMain } from "../test-framework.js";

// Will import after implementation
let createViewGroups = null;

function createMockLogger() {
  const logs = [];
  return {
    logs,
    debug(message, data) {
      logs.push({ level: 'debug', message, data });
    },
    info(message, data) {
      logs.push({ level: 'info', message, data });
    },
    error(message, data) {
      logs.push({ level: 'error', message, data });
    },
    warn(message, data) {
      logs.push({ level: 'warn', message, data });
    }
  };
}

function createMockPrefs(initialData = {}) {
  const data = { ...initialData };
  return {
    data,
    get(key) {
      return data[key];
    },
    set(key, value) {
      data[key] = value;
    }
  };
}

function createMockI18n() {
  return {
    t(key, fallback) {
      return fallback || key;
    }
  };
}

function createMockItemTree(columns = {}) {
  const currentColumns = columns;
  return {
    currentColumns,
    getColumns() {
      return Object.keys(currentColumns).map(key => ({
        dataKey: key,
        hidden: !currentColumns[key]
      }));
    },
    setColumnsVisible(columnKeys) {
      Object.keys(currentColumns).forEach(key => {
        currentColumns[key] = columnKeys.includes(key);
      });
    }
  };
}

function createMockMainWindow(itemTree = null) {
  return {
    document: {
      getElementById(id) {
        if (id === 'zotero-items-tree' && itemTree) {
          return itemTree;
        }
        return null;
      }
    }
  };
}

function createMockZotero(mainWindow = null, itemTreeManager = null) {
  return {
    getMainWindow() {
      return mainWindow;
    },
    ItemTreeManager: itemTreeManager,
    debug(message) {
      // Mock debug
    }
  };
}

function createMockItemTreeManager(columns = {}) {
  const currentColumns = { ...columns };
  return {
    currentColumns,
    getColumns() {
      return Object.keys(currentColumns).map(key => ({
        dataKey: key,
        hidden: !currentColumns[key]
      }));
    },
    setColumnsVisible(columnKeys) {
      Object.keys(currentColumns).forEach(key => {
        currentColumns[key] = columnKeys.includes(key);
      });
    }
  };
}

// Helper to dynamically import module
async function loadModule() {
  try {
    const module = await import("../../src/features/view-groups.js");
    createViewGroups = module.createViewGroups;
    return true;
  } catch (e) {
    return false;
  }
}

describe("View Groups", () => {
  let mockLogger;
  let mockPrefs;
  let mockI18n;
  let mockZotero;
  let mockMainWindow;
  let mockItemTreeManager;
  let viewGroups;

  beforeEach(async () => {
    mockLogger = createMockLogger();
    mockPrefs = createMockPrefs();
    mockI18n = createMockI18n();
    mockItemTreeManager = createMockItemTreeManager({
      title: true,
      firstCreator: true,
      date: false,
      dateAdded: true,
      dateModified: false,
      tags: true,
      notes: false
    });
    mockMainWindow = createMockMainWindow();
    mockZotero = createMockZotero(mockMainWindow, mockItemTreeManager);

    // Try to load module
    if (!createViewGroups) {
      await loadModule();
    }

    if (createViewGroups) {
      viewGroups = createViewGroups({
        logger: mockLogger,
        i18n: mockI18n,
        zotero: mockZotero,
        prefs: mockPrefs
      });
    }
  });

  afterEach(() => {
    mockPrefs.data = {};
  });

  // Test 1: Module exports createViewGroups function
  it("should export createViewGroups function", async () => {
    const loaded = await loadModule();
    assert.ok(loaded, "Module should load successfully");
    assert.typeOf(createViewGroups, "function", "createViewGroups should be a function");
  });

  // Test 2: createViewGroups returns expected API
  it("should return expected API methods", () => {
    if (!createViewGroups) {
      assert.ok(false, "Module not loaded");
      return;
    }
    assert.typeOf(viewGroups.saveView, "function", "saveView should be a function");
    assert.typeOf(viewGroups.loadView, "function", "loadView should be a function");
    assert.typeOf(viewGroups.getSavedViews, "function", "getSavedViews should be a function");
    assert.typeOf(viewGroups.deleteView, "function", "deleteView should be a function");
    assert.typeOf(viewGroups.renameView, "function", "renameView should be a function");
    assert.typeOf(viewGroups.getCurrentColumns, "function", "getCurrentColumns should be a function");
  });

  // Test 3: saveView saves a view preset
  it("should save a view preset successfully", () => {
    if (!viewGroups) {
      assert.ok(false, "Module not loaded");
      return;
    }

    const result = viewGroups.saveView("Reading View", {
      title: true,
      date: false,
      tags: true
    });

    assert.ok(result.success, "saveView should return success");
    assert.equal(result.name, "Reading View", "View name should match");

    const savedViews = viewGroups.getSavedViews();
    assert.equal(savedViews.length, 1, "Should have 1 saved view");
    assert.equal(savedViews[0].name, "Reading View", "View name should be saved");
  });

  // Test 4: saveView rejects duplicate names
  it("should reject duplicate view names", () => {
    if (!viewGroups) {
      assert.ok(false, "Module not loaded");
      return;
    }

    viewGroups.saveView("View 1", { title: true });
    const result = viewGroups.saveView("View 1", { title: false });

    assert.notOk(result.success, "saveView should fail for duplicate names");
    assert.includes(result.error.toLowerCase(), "duplicate", "Error should mention duplicate");
  });

  // Test 5: saveView with case-insensitive duplicate check
  it("should reject duplicate names case-insensitively", () => {
    if (!viewGroups) {
      assert.ok(false, "Module not loaded");
      return;
    }

    viewGroups.saveView("Reading View", { title: true });
    const result = viewGroups.saveView("READING VIEW", { title: false });

    assert.notOk(result.success, "saveView should fail for case-insensitive duplicate");
  });

  // Test 6: getSavedViews returns empty array when no views saved
  it("should return empty array when no views saved", () => {
    if (!viewGroups) {
      assert.ok(false, "Module not loaded");
      return;
    }

    const views = viewGroups.getSavedViews();
    assert.ok(Array.isArray(views), "getSavedViews should return an array");
    assert.equal(views.length, 0, "Should be empty array");
  });

  // Test 7: loadView applies column visibility
  it("should load and apply view preset", () => {
    if (!viewGroups) {
      assert.ok(false, "Module not loaded");
      return;
    }

    viewGroups.saveView("Test View", {
      title: true,
      date: false,
      tags: true,
      creator: false
    });

    const result = viewGroups.loadView("Test View");
    assert.ok(result.success, "loadView should return success");

    const columns = viewGroups.getCurrentColumns();
    assert.equal(columns.title, true, "title should be visible");
    assert.equal(columns.date, false, "date should be hidden");
  });

  // Test 8: loadView fails for non-existent view
  it("should fail to load non-existent view", () => {
    if (!viewGroups) {
      assert.ok(false, "Module not loaded");
      return;
    }

    const result = viewGroups.loadView("Non-existent View");
    assert.notOk(result.success, "loadView should fail for non-existent view");
    assert.includes(result.error.toLowerCase(), "not found", "Error should mention not found");
  });

  // Test 9: deleteView removes saved view
  it("should delete a saved view", () => {
    if (!viewGroups) {
      assert.ok(false, "Module not loaded");
      return;
    }

    viewGroups.saveView("View to Delete", { title: true });
    assert.equal(viewGroups.getSavedViews().length, 1, "Should have 1 view");

    const result = viewGroups.deleteView("View to Delete");
    assert.ok(result.success, "deleteView should return success");
    assert.equal(viewGroups.getSavedViews().length, 0, "Should have 0 views after delete");
  });

  // Test 10: deleteView fails for non-existent view
  it("should fail to delete non-existent view", () => {
    if (!viewGroups) {
      assert.ok(false, "Module not loaded");
      return;
    }

    const result = viewGroups.deleteView("Non-existent");
    assert.notOk(result.success, "deleteView should fail for non-existent view");
  });

  // Test 11: renameView renames a view
  it("should rename a saved view", () => {
    if (!viewGroups) {
      assert.ok(false, "Module not loaded");
      return;
    }

    viewGroups.saveView("Old Name", { title: true });
    const result = viewGroups.renameView("Old Name", "New Name");

    assert.ok(result.success, "renameView should return success");

    const views = viewGroups.getSavedViews();
    assert.equal(views.length, 1, "Should still have 1 view");
    assert.equal(views[0].name, "New Name", "View should be renamed");
  });

  // Test 12: renameView fails for non-existent view
  it("should fail to rename non-existent view", () => {
    if (!viewGroups) {
      assert.ok(false, "Module not loaded");
      return;
    }

    const result = viewGroups.renameView("Non-existent", "New Name");
    assert.notOk(result.success, "renameView should fail for non-existent view");
  });

  // Test 13: renameView fails for duplicate new name
  it("should fail to rename to existing name", () => {
    if (!viewGroups) {
      assert.ok(false, "Module not loaded");
      return;
    }

    viewGroups.saveView("View 1", { title: true });
    viewGroups.saveView("View 2", { title: false });

    const result = viewGroups.renameView("View 1", "View 2");
    assert.notOk(result.success, "renameView should fail for duplicate new name");
  });

  // Test 14: getCurrentColumns returns column visibility
  it("should get current column visibility", () => {
    if (!viewGroups) {
      assert.ok(false, "Module not loaded");
      return;
    }

    const columns = viewGroups.getCurrentColumns();
    assert.ok(typeof columns === "object", "getCurrentColumns should return an object");
    assert.ok("title" in columns, "Should include title column");
  });

  // Test 15: saveView includes timestamp
  it("should include timestamp in saved view", () => {
    if (!viewGroups) {
      assert.ok(false, "Module not loaded");
      return;
    }

    viewGroups.saveView("Timestamped View", { title: true });

    const views = viewGroups.getSavedViews();
    assert.ok(typeof views[0].timestamp === "number", "Should have timestamp");
    assert.ok(views[0].timestamp > 0, "Timestamp should be positive");
  });

  // Test 16: maxViews limit
  it("should enforce maxViews limit", () => {
    if (!viewGroups) {
      assert.ok(false, "Module not loaded");
      return;
    }

    // Create more than default maxViews (10)
    for (let i = 0; i < 12; i++) {
      viewGroups.saveView(`View ${i}`, { title: true });
    }

    // Should not exceed maxViews (default 10)
    const views = viewGroups.getSavedViews();
    assert.ok(views.length <= 10, "Should not exceed maxViews limit");
  });

  // Test 17: View names trimmed
  it("should trim view names", () => {
    if (!viewGroups) {
      assert.ok(false, "Module not loaded");
      return;
    }

    const result = viewGroups.saveView("  Spaced Name  ", { title: true });
    assert.ok(result.success, "saveView should succeed");

    const views = viewGroups.getSavedViews();
    assert.equal(views[0].name, "Spaced Name", "Name should be trimmed");
  });

  // Test 18: Empty view name rejected
  it("should reject empty view names", () => {
    if (!viewGroups) {
      assert.ok(false, "Module not loaded");
      return;
    }

    const result = viewGroups.saveView("", { title: true });
    assert.notOk(result.success, "saveView should fail for empty name");
  });

  // Test 19: loadView is case-insensitive
  it("should load view case-insensitively", () => {
    if (!viewGroups) {
      assert.ok(false, "Module not loaded");
      return;
    }

    viewGroups.saveView("Reading View", { title: true, date: false });
    const result = viewGroups.loadView("READING VIEW");

    assert.ok(result.success, "loadView should succeed case-insensitively");
  });

  // Test 20: deleteView is case-insensitive
  it("should delete view case-insensitively", () => {
    if (!viewGroups) {
      assert.ok(false, "Module not loaded");
      return;
    }

    viewGroups.saveView("Test View", { title: true });
    const result = viewGroups.deleteView("TEST VIEW");

    assert.ok(result.success, "deleteView should succeed case-insensitively");
    assert.equal(viewGroups.getSavedViews().length, 0, "View should be deleted");
  });
});

await runTestsIfMain(import.meta.url);
