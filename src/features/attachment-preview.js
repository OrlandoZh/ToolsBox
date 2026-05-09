/**
 * Attachment Preview Panel
 * Displays PDF/image/web snapshot previews in Zotero's right sidebar
 */

export function createAttachmentPreview(options) {
  const { logger, i18n, zotero } = options;
  const Zotero = zotero || globalThis.Zotero;
  
  const sectionID = 'toolsbox-attachment-preview';
  
  function register() {
    if (!Zotero.ItemPaneManager) {
      logger.error('attachmentPreview.register.failed', { reason: 'ItemPaneManager not available' });
      return false;
    }
    
    Zotero.ItemPaneManager.registerSection({
      paneID: sectionID,
      pluginID: 'toolsbox@orlandozh.github',
      label: i18n.t('toolsbox-section-attachment-preview', 'Attachment Preview'),
      onItemChange: ({ item, doc }) => {
        const container = doc.createElement('div');
        container.className = 'attachment-preview-container';
        
        if (item && item.isAttachment()) {
          const attachmentPath = item.getFilePath();
          if (attachmentPath) {
            const iframe = doc.createElement('iframe');
            iframe.src = `file://${attachmentPath}`;
            iframe.style.width = '100%';
            iframe.style.height = '400px';
            container.appendChild(iframe);
          }
        }
        
        return container;
      }
    });
    
    logger.debug('attachmentPreview.registered', { sectionID });
    return true;
  }
  
  return {
    register,
    sectionID
  };
}
