export function createCollectionItemCount(options) {
  const { logger, i18n, zotero } = options;
  const Zotero = zotero || globalThis.Zotero;

  const OWNER = 'toolsbox-collection-item-count';
  const countElements = new Map();
  let observerID = null;
  let registered = false;

  function getCollectionCount(collection) {
    if (!collection || !collection.getItems) {
      return 0;
    }
    return collection.getItems().length;
  }

  function getCollectionNodeKey(collectionNode, collectionID) {
    return String(collectionID || collectionNode?.dataset?.id || collectionNode?.id || '');
  }

  function removeElement(element) {
    if (!element) {
      return;
    }
    if (typeof element.remove === 'function') {
      element.remove();
      return;
    }
    if (element.parentNode && typeof element.parentNode.removeChild === 'function') {
      element.parentNode.removeChild(element);
    }
  }

  function tagOwnedElement(element) {
    if (!element) {
      return;
    }
    element.className = 'collection-item-count';
    if (element.dataset) {
      element.dataset.toolsboxOwner = OWNER;
    }
    if (typeof element.setAttribute === 'function') {
      element.setAttribute('data-toolsbox-owner', OWNER);
    }
    element.style.cssText = `
      margin-left: 4px;
      opacity: 0.6;
      font-size: 0.9em;
    `;
  }

  function findOwnedCountLabel(collectionNode, key) {
    const cached = countElements.get(key);
    if (cached) {
      return cached;
    }
    const queried = collectionNode?.querySelector?.(`.collection-item-count[data-toolsbox-owner="${OWNER}"]`)
      || collectionNode?.querySelector?.('.collection-item-count');
    if (queried?.dataset?.toolsboxOwner === OWNER || queried?.getAttribute?.('data-toolsbox-owner') === OWNER) {
      countElements.set(key, queried);
      return queried;
    }
    return null;
  }

  function injectCountLabel(collectionNode, collectionID, count) {
    if (!collectionNode) return;

    const key = getCollectionNodeKey(collectionNode, collectionID);
    if (!key) {
      return;
    }
    let countLabel = findOwnedCountLabel(collectionNode, key);
    if (!countLabel) {
      countLabel = collectionNode.ownerDocument.createElement('span');
      tagOwnedElement(countLabel);
      collectionNode.appendChild(countLabel);
      countElements.set(key, countLabel);
    }

    countLabel.textContent = `(${count})`;
  }

  function updateAllCounts() {
    const mainWindow = Zotero?.getMainWindow?.();
    if (!mainWindow) return;

    const collectionTree = mainWindow.document?.getElementById?.('zotero-collections-tree');
    if (!collectionTree) return;

    const rows = collectionTree.querySelectorAll?.('.tree-row') || [];
    rows.forEach(row => {
      const collectionID = row.dataset?.id;
      if (!collectionID) return;

      const collection = Zotero.Collections?.get?.(collectionID);
      if (collection) {
        const count = getCollectionCount(collection);
        injectCountLabel(row, collectionID, count);
      }
    });
  }

  function destroy() {
    countElements.forEach((element) => {
      removeElement(element);
    });
    countElements.clear();

    if (observerID && Zotero?.Notifier?.unregisterObserver) {
      Zotero.Notifier.unregisterObserver(observerID);
    }
    observerID = null;
    registered = false;
    logger?.debug?.('collectionItemCount.destroyed');
  }

  function register() {
    if (!Zotero || !Zotero.Collections) {
      logger.warn?.('collectionItemCount.register.skipped', { reason: 'Collections API not available' });
      return false;
    }

    if (registered) {
      updateAllCounts();
      return true;
    }

    updateAllCounts();

    if (Zotero.Notifier?.registerObserver) {
      observerID = Zotero.Notifier.registerObserver({
        notify: (event, type, ids) => {
          if (type === 'item' || type === 'collection-item') {
            updateAllCounts();
          }
        }
      }, ['item', 'collection-item'], 'toolsbox-collection-count') || 'toolsbox-collection-count';
    } else {
      logger.warn?.('collectionItemCount.notifier.skipped', { reason: 'Notifier API not available' });
    }

    registered = true;
    logger.debug('collectionItemCount.registered');
    return true;
  }

  return {
    register,
    destroy,
    getCollectionCount,
    updateAllCounts
  };
}
