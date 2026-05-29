/**
 * Remark Column - ItemTree column displaying first line of abstract/note
 * Data source: item.getField('abstractNote')
 */

export function createRemarkColumn(options) {
  const { logger, i18n, zotero } = options;
  const Zotero = zotero || globalThis.Zotero;

  const columnID = 'toolsbox-remark';
  const dataKey = 'remark';

  const MAX_CHARS = 80;

  /**
   * Extract first N characters from abstract/note
   * @param {Object} item - Zotero item
   * @returns {string} First 80 chars or empty string
   */
  function getRemark(item) {
    if (!item || !item.getField) return '';

    const abstract = item.getField('abstractNote') || '';
    return abstract.substring(0, MAX_CHARS);
  }

  /**
   * Provide sortable data for the column
   * @param {Object} item - Zotero item
   * @param {string} dataKey - Data key identifier
   * @returns {string} First 80 chars for sorting
   */
  function dataProvider(item, dataKey) {
    return getRemark(item);
  }

  /**
   * Render cell content for ItemTree column
   * @param {number} index - Row index
   * @param {string} data - Remark text data
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
      padding: 0 4px;
    `;

    const text = doc.createElement('span');
    text.style.cssText = `
      font-size: 0.85em;
      font-style: italic;
      color: #757575;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `;

    if (data) {
      text.textContent = data.length >= MAX_CHARS ? data + '...' : data;
    } else {
      text.textContent = '\u2014';
      text.style.color = '#9e9e9e';
    }

    cell.appendChild(text);

    return cell;
  }

  /**
   * Register the column with Zotero's ItemTreeManager
   * @returns {boolean} Success status
   */
  function register() {
    if (!Zotero?.ItemTreeManager) {
      logger?.error?.('remarkColumn.register.failed', { reason: 'ItemTreeManager not available' });
      return false;
    }

    Zotero.ItemTreeManager.registerColumn({
      dataKey,
      label: i18n?.t?.('toolsbox-column-remark', 'Remark') || 'Remark',
      pluginID: 'toolsbox@orlandozh.github',
      dataProvider: (item, dk) => dataProvider(item, dk),
      renderCell: (index, data, column) => renderCell(index, data, column),
      sortReverse: false
    });

    logger?.debug?.('remarkColumn.registered', { columnID });
    return true;
  }

  function cleanup() {
    if (Zotero?.ItemTreeManager) {
      Zotero.ItemTreeManager.unregisterColumn(columnID);
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
