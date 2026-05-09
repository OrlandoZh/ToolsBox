/**
 * Cited Count Column - ItemTree column displaying citation counts
 * Uses Semantic Scholar API as primary data source
 */

export function createCitedCountColumn(options) {
  const { logger, i18n, zotero } = options;
  const Zotero = zotero || globalThis.Zotero;

  const columnID = 'toolsbox-cited-count';
  const dataKey = 'citedCount';

  function register() {
    if (!Zotero?.ItemTreeManager) {
      logger?.error?.('citedCountColumn.register.failed', { reason: 'ItemTreeManager not available' });
      return false;
    }

    Zotero.ItemTreeManager.registerColumn({
      dataKey,
      label: i18n?.t?.('toolsbox-column-cited-count', 'Cited Count') || 'Cited Count',
      pluginID: 'toolsbox@orlandozh.github',
      renderCell: (index, data, column) => {
        const cell = document.createElement('span');
        return cell;
      }
    });

    logger?.debug?.('citedCountColumn.registered', { columnID });
    return true;
  }

  return {
    register,
    columnID,
    dataKey
  };
}
