/**
 * View Groups - Column visibility preset management
 */

const DEFAULT_COLUMNS = [
  'title',
  'firstCreator',
  'date',
  'dateAdded',
  'dateModified',
  'tags',
  'notes',
  'attachments',
  'related',
  'publicationTitle',
  'journalAbbreviation',
  'volume',
  'issue',
  'pages',
  'numPages',
  'language',
  'DOI',
  'URL',
  'ISBN',
  'ISSN',
  'abstractNote',
  'extra',
  'callNumber',
  'rights',
  'itemType'
];

const PREF_KEY = 'viewGroups';
const DEFAULT_MAX_VIEWS = 10;

export function createViewGroups(options) {
  const { logger, i18n, zotero, prefs } = options;
  const Zotero = zotero || globalThis.Zotero;

  function normalizeName(name) {
    return String(name).trim().toLowerCase();
  }

  function getStoredViews() {
    if (!prefs) return [];
    const stored = prefs.get(PREF_KEY);
    if (!stored || typeof stored !== 'object') return [];
    return stored.views || [];
  }

  function setStoredViews(views) {
    if (!prefs) return;
    prefs.set(PREF_KEY, { views });
  }

  function getMaxViews() {
    const max = prefs?.get('viewGroups.maxViews');
    return typeof max === 'number' && max > 0 ? max : DEFAULT_MAX_VIEWS;
  }

  function findViewIndex(name) {
    const normalized = normalizeName(name);
    const views = getStoredViews();
    return views.findIndex(v => normalizeName(v.name) === normalized);
  }

  function getCurrentColumns() {
    const columns = {};
    
    const mainWindow = Zotero?.getMainWindow?.();
    if (!mainWindow) {
      DEFAULT_COLUMNS.forEach(col => columns[col] = true);
      return columns;
    }

    const itemTreeManager = Zotero?.ItemTreeManager;
    if (itemTreeManager && typeof itemTreeManager.getColumns === 'function') {
      const cols = itemTreeManager.getColumns();
      cols.forEach(col => {
        columns[col.dataKey] = !col.hidden;
      });
      return columns;
    }

    const itemTree = mainWindow.document?.getElementById?.('zotero-items-tree');
    if (itemTree && typeof itemTree.getColumns === 'function') {
      const cols = itemTree.getColumns();
      cols.forEach(col => {
        columns[col.dataKey] = !col.hidden;
      });
      return columns;
    }

    DEFAULT_COLUMNS.forEach(col => columns[col] = true);
    return columns;
  }

  function applyColumns(columnVisibility) {
    const mainWindow = Zotero?.getMainWindow?.();
    if (!mainWindow) {
      logger?.debug?.('viewGroups.applyColumns.noWindow');
      return false;
    }

    const visibleColumns = Object.entries(columnVisibility)
      .filter(([_, visible]) => visible)
      .map(([key]) => key);

    const itemTreeManager = Zotero?.ItemTreeManager;
    if (itemTreeManager && typeof itemTreeManager.setColumnsVisible === 'function') {
      itemTreeManager.setColumnsVisible(visibleColumns);
      logger?.debug?.('viewGroups.applyColumns.applied', { count: visibleColumns.length });
      return true;
    }

    const itemTree = mainWindow.document?.getElementById?.('zotero-items-tree');
    if (itemTree && typeof itemTree.setColumnsVisible === 'function') {
      itemTree.setColumnsVisible(visibleColumns);
      logger?.debug?.('viewGroups.applyColumns.applied', { count: visibleColumns.length });
      return true;
    }

    logger?.debug?.('viewGroups.applyColumns.noApi');
    return false;
  }

  function saveView(name, columnVisibility = null) {
    const trimmedName = String(name).trim();
    
    if (!trimmedName) {
      return { success: false, error: 'View name cannot be empty' };
    }

    const views = getStoredViews();
    const normalized = normalizeName(trimmedName);
    
    if (views.some(v => normalizeName(v.name) === normalized)) {
      return { success: false, error: 'Duplicate view name' };
    }

    const maxViews = getMaxViews();
    if (views.length >= maxViews) {
      return { success: false, error: `Maximum ${maxViews} views allowed` };
    }

    const columns = columnVisibility || getCurrentColumns();
    const timestamp = Date.now();

    views.push({
      name: trimmedName,
      columns,
      timestamp
    });

    setStoredViews(views);
    logger?.debug?.('viewGroups.saveView.saved', { name: trimmedName });
    
    return { success: true, name: trimmedName };
  }

  function loadView(name) {
    const views = getStoredViews();
    const normalized = normalizeName(name);
    const view = views.find(v => normalizeName(v.name) === normalized);

    if (!view) {
      return { success: false, error: 'View not found' };
    }

    const applied = applyColumns(view.columns);
    
    if (!applied) {
      return { success: false, error: 'Could not apply columns' };
    }

    logger?.debug?.('viewGroups.loadView.loaded', { name: view.name });
    return { success: true, name: view.name };
  }

  function getSavedViews() {
    return getStoredViews().map(v => ({
      name: v.name,
      columns: v.columns,
      timestamp: v.timestamp
    }));
  }

  function deleteView(name) {
    const views = getStoredViews();
    const index = findViewIndex(name);

    if (index === -1) {
      return { success: false, error: 'View not found' };
    }

    views.splice(index, 1);
    setStoredViews(views);
    logger?.debug?.('viewGroups.deleteView.deleted', { name });

    return { success: true };
  }

  function renameView(oldName, newName) {
    const trimmedNewName = String(newName).trim();
    
    if (!trimmedNewName) {
      return { success: false, error: 'New name cannot be empty' };
    }

    const views = getStoredViews();
    const index = findViewIndex(oldName);

    if (index === -1) {
      return { success: false, error: 'View not found' };
    }

    const normalizedNew = normalizeName(trimmedNewName);
    if (views.some(v => normalizeName(v.name) === normalizedNew && findViewIndex(v.name) !== index)) {
      return { success: false, error: 'Duplicate view name' };
    }

    views[index].name = trimmedNewName;
    views[index].timestamp = Date.now();
    setStoredViews(views);
    logger?.debug?.('viewGroups.renameView.renamed', { oldName, newName: trimmedNewName });

    return { success: true };
  }

  function register() {
    logger?.debug?.('viewGroups.registered');
    return true;
  }

  return {
    register,
    saveView,
    loadView,
    getSavedViews,
    deleteView,
    renameView,
    getCurrentColumns,
    applyColumns
  };
}