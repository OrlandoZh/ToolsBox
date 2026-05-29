/**
 * Creator Column - ItemTree column displaying first author/creator
 * Data source: item.getCreators()
 */

export function createCreatorColumn(options) {
  const { logger, i18n, zotero } = options;
  const Zotero = zotero || globalThis.Zotero;

  const columnID = 'toolsbox-creator';
  const dataKey = 'creator';

  /**
   * Extract first creator info from item
   * @param {Object} item - Zotero item
   * @returns {Object|null} Creator object with firstName and lastName, or null
   */
  function getFirstCreator(item) {
    if (!item || !item.getCreators) return null;

    const creators = item.getCreators();
    if (!creators || creators.length === 0) return null;

    const first = creators[0];
    return {
      firstName: first.firstName || '',
      lastName: first.lastName || first.name || ''
    };
  }

  /**
   * Provide sortable data for the column
   * @param {Object} item - Zotero item
   * @param {string} dataKey - Data key identifier
   * @returns {string} Last name for sorting
   */
  function dataProvider(item, dataKey) {
    const creator = getFirstCreator(item);
    return creator ? creator.lastName : '';
  }

  /**
   * Render cell content for ItemTree column
   * @param {number} index - Row index
   * @param {string} data - Creator last name data
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
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `;

    if (data) {
      text.textContent = data;
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
      logger?.error?.('creatorColumn.register.failed', { reason: 'ItemTreeManager not available' });
      return false;
    }

    Zotero.ItemTreeManager.registerColumn({
      dataKey,
      label: i18n?.t?.('toolsbox-column-creator', 'Creator') || 'Creator',
      pluginID: 'toolsbox@orlandozh.github',
      dataProvider: (item, dk) => dataProvider(item, dk),
      renderCell: (index, data, column) => renderCell(index, data, column),
      sortReverse: false
    });

    logger?.debug?.('creatorColumn.registered', { columnID });
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
