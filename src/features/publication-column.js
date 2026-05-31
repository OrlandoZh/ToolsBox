/**
 * Publication Column - ItemTree column displaying publication venue
 * Data source: item.getField('publicationTitle' | 'journalAbbreviation' | 'proceedingsTitle' | 'conferenceName')
 */

export function createPublicationColumn(options) {
  const { logger, i18n, zotero } = options;
  const Zotero = zotero || globalThis.Zotero;

  const columnID = 'toolsbox-publication';
  const dataKey = 'publication';

  /**
   * Extract publication name from item with fallback chain
   * @param {Object} item - Zotero item
   * @returns {string} Publication name or empty string
   */
  function getPublication(item) {
    if (!item || !item.getField) return '';

    return item.getField('publicationTitle')
      || item.getField('journalAbbreviation')
      || item.getField('proceedingsTitle')
      || item.getField('conferenceName')
      || '';
  }

  /**
   * Provide sortable data for the column
   * @param {Object} item - Zotero item
   * @param {string} dataKey - Data key identifier
   * @returns {string} Publication name for sorting
   */
  function dataProvider(item, dataKey) {
    return getPublication(item);
  }

  /**
   * Render cell content for ItemTree column
   * @param {number} index - Row index
   * @param {string} data - Publication name data
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
      font-size: 0.9em;
      font-style: italic;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `;

    if (data) {
      text.textContent = data.length > 30 ? data.substring(0, 30) + '...' : data;
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
      logger?.error?.('publicationColumn.register.failed', { reason: 'ItemTreeManager not available' });
      return false;
    }

    Zotero.ItemTreeManager.registerColumn({
      dataKey,
      label: i18n?.t?.('toolsbox-column-publication', 'Publication') || 'Publication',
      pluginID: 'toolsbox@orlandozh.github',
      dataProvider: (item, dk) => dataProvider(item, dk),
      renderCell: (index, data, column) => renderCell(index, data, column),
      sortReverse: false
    });

    logger?.debug?.('publicationColumn.registered', { columnID });
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
