/**
 * Favorite Collections - Pin collections to top of tree
 */

export function createFavoriteCollections(options) {
  const { logger, i18n, zotero, prefs } = options;
  const Zotero = zotero || globalThis.Zotero;

  const PREF_KEY = 'favoriteCollections';

  function getFavorites() {
    if (!prefs) return [];
    return prefs.get(PREF_KEY) || [];
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
    const collectionTree = mainWindow.document.getElementById('zotero-collections-tree');
    if (!collectionTree) return;

    const rows = collectionTree.querySelectorAll('.tree-row');
    rows.forEach(row => {
      const collectionID = parseInt(row.dataset?.id);
      if (favorites.includes(collectionID)) {
        row.classList.add('favorite-collection');
        row.style.fontWeight = 'bold';

        if (!row.querySelector('.favorite-icon')) {
          const icon = mainWindow.document.createElement('span');
          icon.className = 'favorite-icon';
          icon.textContent = '⭐';
          icon.style.marginRight = '4px';
          row.insertBefore(icon, row.firstChild);
        }
      } else {
        row.classList.remove('favorite-collection');
        row.style.fontWeight = '';
        const icon = row.querySelector('.favorite-icon');
        if (icon) icon.remove();
      }
    });

    const favoriteRows = Array.from(rows).filter(row =>
      favorites.includes(parseInt(row.dataset?.id))
    );

    favoriteRows.forEach(row => {
      collectionTree.insertBefore(row, collectionTree.firstChild);
    });

    logger.debug('favoriteCollections.treeUpdated', { count: favorites.length });
  }

  function addContextMenu() {
    const mainWindow = Zotero?.getMainWindow();
    if (!mainWindow) return;

    const collectionTree = mainWindow.document.getElementById('zotero-collections-tree');
    if (!collectionTree) return;

    collectionTree.addEventListener('contextmenu', (e) => {
      const row = e.target.closest('.tree-row');
      if (!row) return;

      const collectionID = parseInt(row.dataset?.id);

      const isFav = isFavorite(collectionID);
      const label = isFav
        ? i18n.t('toolsbox-collection-remove-favorite', 'Remove from Favorites')
        : i18n.t('toolsbox-collection-add-favorite', 'Add to Favorites');

      row.addEventListener('dblclick', () => {
        toggleFavorite(collectionID);
      }, { once: true });
    });
  }

  function enable() {
    if (!Zotero || !Zotero.Collections) {
      logger.error('favoriteCollections.enable.failed', { reason: 'Collections API not available' });
      return false;
    }

    updateCollectionTree();
    addContextMenu();

    Zotero.Notifier.registerObserver({
      notify: (event, type, ids) => {
        if (type === 'collection') {
          updateCollectionTree();
        }
      }
    }, ['collection'], 'toolsbox-favorite-collections');

    logger.debug('favoriteCollections.enabled');
    return true;
  }

  return {
    enable,
    addToFavorites,
    removeFromFavorites,
    isFavorite,
    toggleFavorite,
    getFavorites
  };
}
