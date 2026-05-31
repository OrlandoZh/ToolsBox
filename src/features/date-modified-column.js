/**
 * Date Modified Column - ItemTree column displaying item last modification date
 * Data source: item.dateModified (Zotero built-in field)
 */

export function createDateModifiedColumn(options) {
  const { logger, i18n, zotero } = options;
  const Zotero = zotero || globalThis.Zotero;

  const columnID = 'toolsbox-date-modified';
  const dataKey = 'dateModified';

  /**
   * Extract date modified from Zotero item
   * @param {Object} item - Zotero item
   * @param {string} dataKey - Data key identifier
   * @returns {string} ISO date string for sorting
   */
  function dataProvider(item, dataKey) {
    if (!item || !item.id) return '';

    const dateModified = item.getField?.('dateModified') || item.dateModified || '';
    if (!dateModified) return '';

    try {
      const date = new Date(dateModified);
      if (isNaN(date.getTime())) return '';
      return date.toISOString();
    } catch (e) {
      return '';
    }
  }

  /**
   * Format ISO date string to YYYY-MM-DD
   * @param {string} isoDate - ISO date string
   * @returns {string} Formatted date
   */
  function formatDate(isoDate) {
    if (!isoDate) return '';

    try {
      const date = new Date(isoDate);
      if (isNaN(date.getTime())) return '';

      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');

      return `${year}-${month}-${day}`;
    } catch (e) {
      return '';
    }
  }

  /**
   * Render cell content for ItemTree column
   * @param {number} index - Row index
   * @param {string} data - ISO date string
   * @param {Object} column - Column configuration
   * @returns {HTMLElement} Rendered cell element
   */
  function renderCell(index, data, column) {
    const doc = Zotero.getMainWindow().document;

    const cell = doc.createElement('div');
    cell.className = `cell ${column.className}`;
    cell.style.cssText = `
      display: flex;
      align-items: center;
      width: 100%;
      height: 100%;
      padding: 0 6px;
    `;

    const dateText = doc.createElement('span');
    dateText.textContent = formatDate(data) || '—';
    dateText.style.cssText = `
      font-size: 0.9em;
      opacity: 0.85;
      white-space: nowrap;
    `;

    if (!data) {
      dateText.style.opacity = '0.3';
    }

    cell.appendChild(dateText);
    return cell;
  }

  /**
   * Register the column with Zotero's ItemTreeManager
   * @returns {boolean} Success status
   */
  function register() {
    if (!Zotero?.ItemTreeManager) {
      logger?.error?.('dateModifiedColumn.register.failed', { reason: 'ItemTreeManager not available' });
      return false;
    }

    Zotero.ItemTreeManager.registerColumn({
      dataKey,
      label: i18n?.t?.('toolsbox-column-date-modified', 'Date Modified') || 'Date Modified',
      pluginID: 'toolsbox@orlandozh.github',
      dataProvider: (item, dk) => dataProvider(item, dk),
      renderCell: (index, data, column) => renderCell(index, data, column),
      sortReverse: true
    });

    logger?.debug?.('dateModifiedColumn.registered', { columnID });
    return true;
  }

  function cleanup() {
    if (Zotero?.ItemTreeManager) {
      Zotero.ItemTreeManager.unregisterColumn(dataKey);
    }
    return {
      stopped: true,
      resources: ['column:' + columnID]
    };
  }

  return {
    register,
    cleanup,
    columnID,
    dataKey,
    dataProvider,
    renderCell
  };
}
