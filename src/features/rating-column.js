/**
 * Rating Column - ItemTree column displaying item rating from extra field
 * Data source: item.extra field (format: "Rating: 1-5")
 */

export function createRatingColumn(options) {
  const { logger, i18n, zotero } = options;
  const Zotero = zotero || globalThis.Zotero;

  const columnID = 'toolsbox-rating';
  const dataKey = 'rating';

  /**
   * Extract rating value from item.extra field
   * @param {Object} item - Zotero item
   * @param {string} dataKey - Data key identifier
   * @returns {string} Rating value as string for sorting
   */
  function dataProvider(item, dataKey) {
    if (!item || !item.id) return '0';

    const extra = item.getField?.('extra') || '';
    const match = extra.match(/Rating:\s*(\d+)/i);

    return match ? match[1] : '0';
  }

  /**
   * Render cell content for ItemTree column
   * @param {number} index - Row index
   * @param {string} data - Rating data
   * @param {Object} column - Column configuration
   * @returns {HTMLElement} Rendered cell element
   */
  function renderCell(index, data, column) {
    const doc = Zotero.getMainWindow().document;
    const rating = parseInt(data) || 0;
    const clampedRating = Math.max(0, Math.min(5, rating));

    const cell = doc.createElement('div');
    cell.className = `cell ${column.className}`;
    cell.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      gap: 1px;
    `;

    const starContainer = doc.createElement('span');
    starContainer.style.cssText = `
      font-size: 0.85em;
      letter-spacing: -1px;
    `;

    if (clampedRating > 0) {
      starContainer.textContent = '⭐'.repeat(clampedRating);
    } else {
      starContainer.textContent = '—';
      starContainer.style.opacity = '0.3';
    }

    cell.appendChild(starContainer);
    return cell;
  }

  /**
   * Register the column with Zotero's ItemTreeManager
   * @returns {boolean} Success status
   */
  function register() {
    if (!Zotero?.ItemTreeManager) {
      logger?.error?.('ratingColumn.register.failed', { reason: 'ItemTreeManager not available' });
      return false;
    }

    Zotero.ItemTreeManager.registerColumn({
      dataKey,
      label: i18n?.t?.('toolsbox-column-rating', 'Rating') || 'Rating',
      pluginID: 'toolsbox@orlandozh.github',
      dataProvider: (item, dk) => dataProvider(item, dk),
      renderCell: (index, data, column) => renderCell(index, data, column),
      sortReverse: true
    });

    logger?.debug?.('ratingColumn.registered', { columnID });
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
