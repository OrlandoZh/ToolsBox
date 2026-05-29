/**
 * Read Status Column - ItemTree column displaying read/unread status
 * Data source: item.extra field (format: "Read: true" or "Read: false")
 */

export function createReadStatusColumn(options) {
  const { logger, i18n, zotero } = options;
  const Zotero = zotero || globalThis.Zotero;

  const columnID = 'toolsbox-read-status';
  const dataKey = 'readStatus';

  /**
   * Extract read status from item.extra field
   * @param {Object} item - Zotero item
   * @param {string} dataKey - Data key identifier
   * @returns {string} 'true' if read, 'false' if unread (for sorting)
   */
  function dataProvider(item, dataKey) {
    if (!item || !item.id) return 'false';

    const extra = item.getField?.('extra') || '';
    const match = extra.match(/Read:\s*(true|false)/i);

    return match ? match[1].toLowerCase() : 'false';
  }

  /**
   * Render cell content for ItemTree column
   * @param {number} index - Row index
   * @param {string} data - Read status data ('true' or 'false')
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
      justify-content: center;
      width: 100%;
      height: 100%;
    `;

    const isRead = data === 'true';

    const icon = doc.createElement('span');
    icon.textContent = isRead ? '\u2713' : '\u25cb';
    icon.style.cssText = `
      font-size: 1em;
      font-weight: ${isRead ? 'bold' : 'normal'};
      color: ${isRead ? '#2e7d32' : '#9e9e9e'};
    `;

    cell.appendChild(icon);

    return cell;
  }

  /**
   * Register the column with Zotero's ItemTreeManager
   * @returns {boolean} Success status
   */
  function register() {
    if (!Zotero?.ItemTreeManager) {
      logger?.error?.('readStatusColumn.register.failed', { reason: 'ItemTreeManager not available' });
      return false;
    }

    Zotero.ItemTreeManager.registerColumn({
      dataKey,
      label: i18n?.t?.('toolsbox-column-read-status', 'Read') || 'Read',
      pluginID: 'toolsbox@orlandozh.github',
      dataProvider: (item, dk) => dataProvider(item, dk),
      renderCell: (index, data, column) => renderCell(index, data, column),
      sortReverse: true
    });

    logger?.debug?.('readStatusColumn.registered', { columnID });
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
