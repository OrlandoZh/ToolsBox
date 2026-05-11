export function createCollectionItemCount(options) {
  const { logger, i18n, zotero } = options;
  const Zotero = zotero || globalThis.Zotero;

  const countElements = new Map();

  function getCollectionCount(collection) {
    if (!collection || !collection.getItems) {
      return 0;
    }
    return collection.getItems().length;
  }

  function injectCountLabel(collectionNode, count) {
    if (!collectionNode) return;

    let countLabel = countElements.get(collectionNode.id);
    if (!countLabel) {
      countLabel = collectionNode.ownerDocument.createElement('span');
      countLabel.className = 'collection-item-count';
      countLabel.style.cssText = `
        margin-left: 4px;
        opacity: 0.6;
        font-size: 0.9em;
      `;
      collectionNode.appendChild(countLabel);
      countElements.set(collectionNode.id, countLabel);
    }

    countLabel.textContent = `(${count})`;
  }

  function updateAllCounts() {
    const mainWindow = Zotero.getMainWindow();
    if (!mainWindow) return;

    const collectionTree = mainWindow.document.getElementById('zotero-collections-tree');
    if (!collectionTree) return;

    const rows = collectionTree.querySelectorAll('.tree-row');
    rows.forEach(row => {
      const collectionID = row.dataset?.id;
      if (!collectionID) return;

      const collection = Zotero.Collections.get(collectionID);
      if (collection) {
        const count = getCollectionCount(collection);
        injectCountLabel(row, count);
      }
    });
  }

  function register() {
    if (!Zotero || !Zotero.Collections) {
      logger.error('collectionItemCount.register.failed', { reason: 'Collections API not available' });
      return false;
    }

    updateAllCounts();

    Zotero.Notifier.registerObserver({
      notify: (event, type, ids) => {
        if (type === 'item' || type === 'collection-item') {
          updateAllCounts();
        }
      }
    }, ['item', 'collection-item'], 'toolsbox-collection-count');

    logger.debug('collectionItemCount.registered');
    return true;
  }

  return {
    register,
    getCollectionCount,
    updateAllCounts
  };
}
