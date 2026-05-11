/**
 * 批注管理器
 */

export function createAnnotationManager(options) {
  const { logger, i18n, zotero } = options;
  const Zotero = zotero || globalThis.Zotero;

  let windowRef = null;

  async function open() {
    if (windowRef && !windowRef.closed) {
      windowRef.focus();
      return;
    }

    const features = 'chrome,centerscreen,width=800,height=600';
    const url = 'chrome://toolsbox/content/annotation-manager.html';

    windowRef = Zotero.getMainWindow().openDialog(url, 'toolsbox-annotation-manager', features);

    logger.debug('annotationManager.opened');
  }

  function isOpen() {
    return windowRef && !windowRef.closed;
  }

  function close() {
    if (windowRef) {
      windowRef.close();
      windowRef = null;
    }
  }

  return {
    open,
    close,
    isOpen
  };
}
