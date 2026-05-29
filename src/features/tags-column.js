/**
 * Tags Column - ItemTree column displaying item tags as colored badges
 * Data source: item.getTags() Zotero API
 */

export function createTagsColumn(options) {
  const { logger, i18n, zotero } = options;
  const Zotero = zotero || globalThis.Zotero;

  const columnID = 'toolsbox-tags';
  const dataKey = 'tags';

  const TAG_COLORS = [
    '#E3F2FD', '#F3E5F5', '#E8F5E9', '#FFF3E0', '#FCE4EC',
    '#E0F7FA', '#F1F8E9', '#FFF8E1', '#FBE9E7', '#E8EAF6'
  ];

  const TAG_TEXT_COLORS = [
    '#1565C0', '#7B1FA2', '#2E7D32', '#E65100', '#C2185B',
    '#00838F', '#558B2F', '#F9A825', '#D84315', '#283593'
  ];

  /**
   * Get tag names from Zotero item
   * @param {Object} item - Zotero item
   * @param {string} dataKey - Data key identifier
   * @returns {string} Comma-separated tag names for sorting
   */
  function dataProvider(item, dataKey) {
    if (!item || !item.id) return '';

    try {
      const tags = item.getTags?.() || [];
      return tags.map(t => t.tag || t).join(', ');
    } catch (e) {
      return '';
    }
  }

  /**
   * Render cell content for ItemTree column
   * @param {number} index - Row index
   * @param {string} data - Tag data
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
      gap: 3px;
      overflow: hidden;
    `;

    // data is a comma-separated string from dataProvider
    const tagNames = data ? data.split(', ').filter(t => t.trim()) : [];

    if (tagNames.length === 0) {
      const empty = doc.createElement('span');
      empty.textContent = '—';
      empty.style.cssText = 'opacity: 0.3; font-size: 0.9em;';
      cell.appendChild(empty);
      return cell;
    }

    const displayTags = tagNames.slice(0, 3);
    const remaining = tagNames.length - displayTags.length;

    displayTags.forEach((tagName, idx) => {
      const badge = doc.createElement('span');
      const colorIdx = idx % TAG_COLORS.length;

      badge.textContent = tagName.trim();
      badge.style.cssText = `
        display: inline-block;
        padding: 1px 6px;
        border-radius: 10px;
        font-size: 0.75em;
        white-space: nowrap;
        background-color: ${TAG_COLORS[colorIdx]};
        color: ${TAG_TEXT_COLORS[colorIdx]};
        border: 1px solid ${TAG_TEXT_COLORS[colorIdx]}20;
        line-height: 1.4;
      `;

      cell.appendChild(badge);
    });

    if (remaining > 0) {
      const more = doc.createElement('span');
      more.textContent = `+${remaining}`;
      more.style.cssText = `
        font-size: 0.75em;
        opacity: 0.6;
        white-space: nowrap;
        padding-left: 2px;
      `;
      cell.appendChild(more);
    }

    return cell;
  }

  /**
   * Register the column with Zotero's ItemTreeManager
   * @returns {boolean} Success status
   */
  function register() {
    if (!Zotero?.ItemTreeManager) {
      logger?.error?.('tagsColumn.register.failed', { reason: 'ItemTreeManager not available' });
      return false;
    }

    Zotero.ItemTreeManager.registerColumn({
      dataKey,
      label: i18n?.t?.('toolsbox-column-tags', 'Tags') || 'Tags',
      pluginID: 'toolsbox@orlandozh.github',
      dataProvider: (item, dk) => dataProvider(item, dk),
      renderCell: (index, data, column) => renderCell(index, data, column),
      sortReverse: false
    });

    logger?.debug?.('tagsColumn.registered', { columnID });
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
