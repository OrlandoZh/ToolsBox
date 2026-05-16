/**
 * Collection排序功能
 */

export function createCollectionSort(options) {
  const { logger, i18n, zotero, prefs } = options;
  const Zotero = zotero || globalThis.Zotero;
  const OWNER = 'toolsbox-collection-sort';
  const BUTTON_ID = 'toolsbox-collection-sort-button';
  let sortButton = null;
  let clickHandler = null;
  let registered = false;
  let parentElement = null;
  let previousParentPosition = null;

  const SORT_OPTIONS = {
    name: (a, b) => (a.name || '').localeCompare(b.name || ''),
    nameDesc: (a, b) => (b.name || '').localeCompare(a.name || ''),
    itemCount: (a, b) => (a.getItems?.() || []).length - (b.getItems?.() || []).length,
    itemCountDesc: (a, b) => (b.getItems?.() || []).length - (a.getItems?.() || []).length,
    dateAdded: (a, b) => (a.dateAdded || 0) - (b.dateAdded || 0),
    dateAddedDesc: (a, b) => (b.dateAdded || 0) - (a.dateAdded || 0)
  };

  function sortCollections(collections, sortBy = 'name') {
    const sortFn = SORT_OPTIONS[sortBy];
    if (!sortFn) {
      logger.warn('collectionSort.unknownSort', { sortBy });
      return collections;
    }

    return [...collections].sort(sortFn);
  }

  function applySort(sortBy) {
    const mainWindow = Zotero?.getMainWindow();
    if (!mainWindow) return;

    const collectionTree = mainWindow.document?.getElementById?.('zotero-collections-tree');
    if (!collectionTree) return;

    const rootCollections = Zotero.Collections?.getByLibrary?.(Zotero.Libraries?.userLibraryID) || [];
    const sorted = sortCollections(rootCollections, sortBy);

    const rows = Array.from(collectionTree.querySelectorAll?.('.tree-row') || []);
    const sortedRows = sorted.map(col =>
      rows.find(row => row.dataset?.id === String(col.id))
    ).filter(Boolean);

    sortedRows.forEach(row => {
      collectionTree.appendChild(row);
    });

    if (prefs) {
      prefs.set('collectionItem.sortBy', sortBy);
    }

    logger.debug('collectionSort.applied', { sortBy });
  }

  function addSortButton() {
    const mainWindow = Zotero?.getMainWindow();
    if (!mainWindow) return false;

    const collectionTree = mainWindow.document?.getElementById?.('zotero-collections-tree');
    if (!collectionTree?.parentElement) {
      logger?.warn?.('collectionSort.button.skipped', { reason: 'Collection tree not available' });
      return false;
    }

    const existingButton = mainWindow.document?.getElementById?.(BUTTON_ID);
    if (existingButton) {
      sortButton = existingButton;
      return true;
    }

    sortButton = mainWindow.document.createElement('button');
    sortButton.id = BUTTON_ID;
    sortButton.className = 'collection-sort-button';
    if (sortButton.dataset) {
      sortButton.dataset.toolsboxOwner = OWNER;
    }
    if (typeof sortButton.setAttribute === 'function') {
      sortButton.setAttribute('data-toolsbox-owner', OWNER);
    }
    sortButton.textContent = i18n?.t('toolsbox-collection-sort-button', 'Sort') || 'Sort';
    sortButton.style.cssText = `
      position: absolute;
      top: 4px;
      right: 4px;
      padding: 2px 8px;
      font-size: 12px;
      cursor: pointer;
    `;

    clickHandler = (e) => {
      e.preventDefault();
      showSortMenu(mainWindow);
    };
    sortButton.addEventListener('click', clickHandler);

    parentElement = collectionTree.parentElement;
    previousParentPosition = parentElement.style.position;
    if (!parentElement.style.position) {
      parentElement.style.position = 'relative';
    }
    parentElement.appendChild(sortButton);

    logger.debug('collectionSort.buttonAdded');
    return true;
  }

  function showSortMenu(window) {
    const options = [
      'name: Sort by Name (A-Z)',
      'nameDesc: Sort by Name (Z-A)',
      'itemCount: Sort by Item Count (Low-High)',
      'itemCountDesc: Sort by Item Count (High-Low)',
      'dateAdded: Sort by Date Added (Old-New)',
      'dateAddedDesc: Sort by Date Added (New-Old)'
    ];

    const choice = window.prompt(
      i18n?.t('toolsbox-collection-sort-prompt', 'Choose sort method:') || 'Choose sort method:',
      options.join('\n')
    );

    if (choice) {
      const sortBy = choice.split(':')[0];
      applySort(sortBy);
    }
  }

  function register() {
    if (!Zotero || !Zotero.Collections) {
      logger.warn?.('collectionSort.register.skipped', { reason: 'Collections API not available' });
      return false;
    }

    if (registered) {
      return true;
    }

    addSortButton();

    const lastSortBy = prefs?.get('collectionItem.sortBy');
    if (lastSortBy) {
      applySort(lastSortBy);
    }

    registered = true;
    logger.debug('collectionSort.registered');
    return true;
  }

  function destroy() {
    if (sortButton && clickHandler && typeof sortButton.removeEventListener === 'function') {
      sortButton.removeEventListener('click', clickHandler);
    }
    if (sortButton) {
      if (typeof sortButton.remove === 'function') {
        sortButton.remove();
      } else if (sortButton.parentNode && typeof sortButton.parentNode.removeChild === 'function') {
        sortButton.parentNode.removeChild(sortButton);
      }
    }
    if (parentElement && previousParentPosition !== null) {
      parentElement.style.position = previousParentPosition;
    }
    sortButton = null;
    clickHandler = null;
    parentElement = null;
    previousParentPosition = null;
    registered = false;
    logger?.debug?.('collectionSort.destroyed');
  }

  return {
    register,
    destroy,
    sortCollections,
    applySort
  };
}
