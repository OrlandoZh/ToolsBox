/**
 * Favorite Collections - Pin collections to top of tree
 */

export function createFavoriteCollections(options) {
  const { logger, i18n, zotero, prefs } = options;
  const Zotero = zotero || globalThis.Zotero;

  const PREF_KEY = 'favoriteCollections';
  const OWNER = 'toolsbox-favorite-collections';
  let observerID = null;
  let collectionTree = null;
  let dblClickHandler = null;
  let registered = false;

  function getFavorites() {
    if (!prefs) return [];
    const value = prefs.get(PREF_KEY) || [];
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      return value.split(',').map((entry) => Number(entry.trim())).filter(Number.isFinite);
    }
    return [];
  }

  function addToFavorites(collectionID) {
    const favorites = getFavorites();
    if (!favorites.includes(collectionID)) {
      favorites.push(collectionID);
      prefs?.set(PREF_KEY, favorites);
      logger.debug('favoriteCollections.added', { collectionID });
      updateCollectionTree();
    }
  }

  function removeFromFavorites(collectionID) {
    const favorites = getFavorites();
    const index = favorites.indexOf(collectionID);
    if (index !== -1) {
      favorites.splice(index, 1);
      prefs?.set(PREF_KEY, favorites);
      logger.debug('favoriteCollections.removed', { collectionID });
      updateCollectionTree();
    }
  }

  function isFavorite(collectionID) {
    return getFavorites().includes(collectionID);
  }

  function toggleFavorite(collectionID) {
    if (isFavorite(collectionID)) {
      removeFromFavorites(collectionID);
    } else {
      addToFavorites(collectionID);
    }
  }

  function updateCollectionTree() {
    const mainWindow = Zotero?.getMainWindow();
    if (!mainWindow) return;

    const favorites = getFavorites();
    const activeCollectionTree = mainWindow.document?.getElementById?.('zotero-collections-tree');
    if (!activeCollectionTree) return;

    const rows = activeCollectionTree.querySelectorAll?.('.tree-row') || [];
    rows.forEach(row => {
      const collectionID = parseInt(row.dataset?.id);
      if (favorites.includes(collectionID)) {
        row.classList.add('favorite-collection');
        row.style.fontWeight = 'bold';
        if (row.dataset) {
          row.dataset.toolsboxFavoriteCollection = 'true';
        }

        if (!row.querySelector?.(`.favorite-icon[data-toolsbox-owner="${OWNER}"]`)) {
          const icon = mainWindow.document.createElement('span');
          icon.className = 'favorite-icon';
          if (icon.dataset) {
            icon.dataset.toolsboxOwner = OWNER;
          }
          if (typeof icon.setAttribute === 'function') {
            icon.setAttribute('data-toolsbox-owner', OWNER);
          }
          icon.textContent = '⭐';
          icon.style.marginRight = '4px';
          row.insertBefore(icon, row.firstChild);
        }
      } else {
        row.classList.remove('favorite-collection');
        row.style.fontWeight = '';
        if (row.dataset) {
          delete row.dataset.toolsboxFavoriteCollection;
        }
        const icon = row.querySelector?.(`.favorite-icon[data-toolsbox-owner="${OWNER}"]`) || row.querySelector?.('.favorite-icon');
        if (icon) icon.remove();
      }
    });

    const favoriteRows = Array.from(rows).filter(row =>
      favorites.includes(parseInt(row.dataset?.id))
    );

    favoriteRows.forEach(row => {
      activeCollectionTree.insertBefore(row, activeCollectionTree.firstChild);
    });

    logger.debug('favoriteCollections.treeUpdated', { count: favorites.length });
  }

  function addContextMenu() {
    const mainWindow = Zotero?.getMainWindow();
    if (!mainWindow) return false;

    collectionTree = mainWindow.document?.getElementById?.('zotero-collections-tree');
    if (!collectionTree?.addEventListener) {
      logger?.warn?.('favoriteCollections.listener.skipped', { reason: 'Collection tree not available' });
      return false;
    }

    dblClickHandler = (e) => {
      const row = e.target?.closest?.('.tree-row');
      if (!row) return;

      const collectionID = parseInt(row.dataset?.id);
      if (Number.isFinite(collectionID)) {
        toggleFavorite(collectionID);
      }
    };
    collectionTree.addEventListener('dblclick', dblClickHandler);
    return true;
  }

  function register() {
    if (!Zotero || !Zotero.Collections) {
      logger.warn?.('favoriteCollections.register.skipped', { reason: 'Collections API not available' });
      return false;
    }

    if (registered) {
      updateCollectionTree();
      return true;
    }

    updateCollectionTree();
    addContextMenu();

    if (Zotero.Notifier?.registerObserver) {
      observerID = Zotero.Notifier.registerObserver({
        notify: (event, type, ids) => {
          if (type === 'collection') {
            updateCollectionTree();
          }
        }
      }, ['collection'], 'toolsbox-favorite-collections') || 'toolsbox-favorite-collections';
    } else {
      logger.warn?.('favoriteCollections.notifier.skipped', { reason: 'Notifier API not available' });
    }

    registered = true;
    logger.debug('favoriteCollections.registered');
    return true;
  }

  function destroy() {
    if (collectionTree && dblClickHandler && typeof collectionTree.removeEventListener === 'function') {
      collectionTree.removeEventListener('dblclick', dblClickHandler);
    }
    if (observerID && Zotero?.Notifier?.unregisterObserver) {
      Zotero.Notifier.unregisterObserver(observerID);
    }
    const mainWindow = Zotero?.getMainWindow?.();
    const activeCollectionTree = mainWindow?.document?.getElementById?.('zotero-collections-tree');
    const rows = activeCollectionTree?.querySelectorAll?.('.tree-row') || [];
    rows.forEach((row) => {
      row.classList?.remove?.('favorite-collection');
      if (row.style) {
        row.style.fontWeight = '';
      }
      if (row.dataset) {
        delete row.dataset.toolsboxFavoriteCollection;
      }
      const icon = row.querySelector?.(`.favorite-icon[data-toolsbox-owner="${OWNER}"]`) || row.querySelector?.('.favorite-icon');
      if (icon) {
        if (typeof icon.remove === 'function') {
          icon.remove();
        } else if (icon.parentNode?.removeChild) {
          icon.parentNode.removeChild(icon);
        }
      }
    });
    observerID = null;
    collectionTree = null;
    dblClickHandler = null;
    registered = false;
    logger?.debug?.('favoriteCollections.destroyed');
  }

  return {
    register,
    destroy,
    addToFavorites,
    removeFromFavorites,
    isFavorite,
    toggleFavorite,
    getFavorites
  };
}
