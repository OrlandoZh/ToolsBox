/**
 * 侧边栏快速切换
 */

export function createSidebarToggle(options) {
  const { logger, zotero } = options;
  const Zotero = zotero || globalThis.Zotero;

  function isLeftSidebarVisible() {
    const mainWindow = Zotero.getMainWindow();
    const leftSidebar = mainWindow.document.getElementById('zotero-collections-pane');
    return Boolean(leftSidebar && !leftSidebar.hidden);
  }

  function toggleLeftSidebar() {
    const mainWindow = Zotero.getMainWindow();
    const leftSidebar = mainWindow.document.getElementById('zotero-collections-pane');
    if (leftSidebar) {
      leftSidebar.hidden = !leftSidebar.hidden;
      logger.debug('sidebarToggle.leftSidebar.toggled', { visible: !leftSidebar.hidden });
    }
  }

  function isRightSidebarVisible() {
    const mainWindow = Zotero.getMainWindow();
    const rightSidebar = mainWindow.document.getElementById('zotero-item-pane');
    return Boolean(rightSidebar && !rightSidebar.hidden);
  }

  function toggleRightSidebar() {
    const mainWindow = Zotero.getMainWindow();
    const rightSidebar = mainWindow.document.getElementById('zotero-item-pane');
    if (rightSidebar) {
      rightSidebar.hidden = !rightSidebar.hidden;
      logger.debug('sidebarToggle.rightSidebar.toggled', { visible: !rightSidebar.hidden });
    }
  }

  function register() {
    const mainWindow = Zotero.getMainWindow();

    mainWindow.addEventListener('keydown', (event) => {
      if (event.shiftKey && event.key === '{') {
        event.preventDefault();
        toggleLeftSidebar();
      } else if (event.shiftKey && event.key === '}') {
        event.preventDefault();
        toggleRightSidebar();
      }
    });

    logger.debug('sidebarToggle.registered');
    return true;
  }

  return {
    register,
    toggleLeftSidebar,
    toggleRightSidebar,
    isLeftSidebarVisible,
    isRightSidebarVisible
  };
}
