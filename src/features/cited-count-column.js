/**
 * Cited Count Column - ItemTree column displaying citation counts
 * Uses Semantic Scholar API as primary data source
 */

export function createCitedCountColumn(options) {
  const { logger, i18n, zotero } = options;
  const Zotero = zotero || globalThis.Zotero;

  const columnID = 'toolsbox-cited-count';
  const dataKey = 'citedCount';

  /**
   * Extract cached citation count from item.extra field
   * @param {Object} item - Zotero item
   * @param {string} dataKey - Data key identifier
   * @returns {string} Citation count as string for sorting
   */
  function dataProvider(item, dataKey) {
    if (!item || !item.id) return '0';
    
    const extra = item.getField?.('extra') || '';
    const match = extra.match(/Cited Count: (\d+)/);
    
    return match ? match[1] : '0';
  }

  /**
   * Render cell content for ItemTree column
   * @param {number} index - Row index
   * @param {string} data - Citation count data
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
    
    const count = doc.createElement('span');
    count.textContent = data || '0';
    count.style.cssText = `
      font-size: 0.9em;
      opacity: 0.8;
    `;
    
    cell.appendChild(count);
    
    // Highlight high-cited papers (>10 citations)
    if (parseInt(data) > 10) {
      cell.style.fontWeight = 'bold';
      cell.style.color = '#4682B4';
    }
    
    return cell;
  }

  /**
   * Register the column with Zotero's ItemTreeManager
   * @returns {boolean} Success status
   */
  function register() {
    if (!Zotero?.ItemTreeManager) {
      logger?.error?.('citedCountColumn.register.failed', { reason: 'ItemTreeManager not available' });
      return false;
    }

    Zotero.ItemTreeManager.registerColumn({
      dataKey,
      label: i18n?.t?.('toolsbox-column-cited-count', 'Cited Count') || 'Cited Count',
      pluginID: 'toolsbox@orlandozh.github',
      dataProvider: (item, dk) => dataProvider(item, dk),
      renderCell: (index, data, column) => renderCell(index, data, column),
      sortReverse: false
    });

    logger?.debug?.('citedCountColumn.registered', { columnID });
    return true;
  }

  return {
    register,
    columnID,
    dataKey,
    dataProvider,
    renderCell
  };
}
