export function createTabManagerPanel(options) {
  const { logger, i18n, zotero } = options;
  const Zotero = zotero || globalThis.Zotero;

  let windowRef = null;

  async function getAllTabs() {
    const tabs = [];
    const readers = Zotero.Reader.getActiveReaders();
    readers.forEach(reader => {
      tabs.push({
        id: reader.tabID,
        title: reader.title || 'Untitled',
        type: 'reader',
        itemID: reader.itemID
      });
    });
    return tabs;
  }

  async function open() {
    if (windowRef && !windowRef.closed) {
      windowRef.focus();
      return;
    }

    const features = 'chrome,centerscreen,width=600,height=400';
    const url = 'chrome://toolsbox/content/tab-manager.html';

    windowRef = Zotero.getMainWindow().openDialog(url, 'toolsbox-tab-manager', features);

    logger.debug('tabManager.opened');
  }

  function close() {
    if (windowRef) {
      windowRef.close();
      windowRef = null;
    }
  }

  function switchToTab(tabID) {
    const reader = Zotero.Reader.getByTabID(tabID);
    if (reader) {
      Zotero.Reader.open(reader.itemID);
      logger.debug('tabManager.switched', { tabID });
    }
  }

  function closeTab(tabID) {
    const reader = Zotero.Reader.getByTabID(tabID);
    if (reader) {
      reader.close();
      logger.debug('tabManager.closed', { tabID });
    }
  }

  return {
    open,
    close,
    getAllTabs,
    switchToTab,
    closeTab
  };
}
