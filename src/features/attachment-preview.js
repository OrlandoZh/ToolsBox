/**
 * Attachment Preview Panel
 * Displays PDF/image previews in Zotero's right sidebar
 * Security: Only whitelisted file types are allowed for preview
 */

const ALLOWED_CONTENT_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'text/plain'
];

const SUPPORTED_EXTENSIONS = [
  '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.txt'
];

function isPreviewable(attachment) {
  if (!attachment || typeof attachment.isAttachment !== 'function' || !attachment.isAttachment()) {
    return false;
  }

  const contentType = attachment.attachmentContentType;
  if (contentType && ALLOWED_CONTENT_TYPES.includes(contentType)) {
    return true;
  }

  const path = typeof attachment.getFilePath === 'function' ? attachment.getFilePath() : null;
  if (path) {
    const ext = path.toLowerCase().slice(path.lastIndexOf('.'));
    return SUPPORTED_EXTENSIONS.includes(ext);
  }

  return false;
}

function renderEmptyState(doc, message) {
  const container = doc.createElement('div');
  container.className = 'attachment-preview-empty';
  container.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: #666;
    font-size: 14px;
  `;
  container.textContent = message;
  return container;
}

export function createAttachmentPreview(options) {
  const { logger, i18n, zotero } = options;
  const Zotero = zotero || globalThis.Zotero;

  const sectionID = 'toolsbox-attachment-preview';
  let currentIframe = null;
  let registered = false;

  function cleanup() {
    if (currentIframe) {
      currentIframe.src = 'about:blank';
      if (typeof currentIframe.remove === 'function') {
        currentIframe.remove();
      } else if (currentIframe.parentNode && typeof currentIframe.parentNode.removeChild === 'function') {
        currentIframe.parentNode.removeChild(currentIframe);
      }
      currentIframe = null;
    }
    return {
      stopped: true,
      resources: ['iframe']
    };
  }

  function register() {
    if (!Zotero?.ItemPaneManager || typeof Zotero.ItemPaneManager.registerSection !== 'function') {
      logger.warn?.('attachmentPreview.register.skipped', { reason: 'ItemPaneManager not available' });
      return false;
    }

    if (registered) {
      return true;
    }

    Zotero.ItemPaneManager.registerSection({
      paneID: sectionID,
      pluginID: 'toolsbox@orlandozh.github',
      label: i18n.t('toolsbox-section-attachment-preview', 'Attachment Preview'),
      onItemChange: ({ item, doc }) => {
        cleanup();

        if (!doc || typeof doc.createElement !== 'function') {
          logger.warn?.('attachmentPreview.render.skipped', { reason: 'Document not available' });
          return null;
        }

        const container = doc.createElement('div');
        container.className = 'attachment-preview-container';
        container.style.cssText = 'width: 100%; min-height: 200px;';

        if (!item || typeof item.isAttachment !== 'function' || !item.isAttachment()) {
          container.appendChild(renderEmptyState(doc, 'No attachment selected'));
          return container;
        }

        const attachmentPath = typeof item.getFilePath === 'function' ? item.getFilePath() : null;
        if (!attachmentPath) {
          container.appendChild(renderEmptyState(doc, 'File not found'));
          return container;
        }

        if (!isPreviewable(item)) {
          const contentType = item.attachmentContentType || 'Unknown';
          container.appendChild(renderEmptyState(doc, `Preview not available for ${contentType}`));
          return container;
        }

        try {
          const iframe = doc.createElement('iframe');
          iframe.className = 'attachment-preview-iframe';
          if (iframe.dataset) {
            iframe.dataset.toolsboxOwner = 'toolsbox-attachment-preview';
          }
          if (typeof iframe.setAttribute === 'function') {
            iframe.setAttribute('data-toolsbox-owner', 'toolsbox-attachment-preview');
          }
          iframe.style.cssText = 'width: 100%; height: 400px; border: none;';
          iframe.src = `moz-file://${encodeURIComponent(attachmentPath)}`;

          container.appendChild(iframe);
          currentIframe = iframe;

          logger.debug('attachmentPreview.loaded', {
            itemID: item.id,
            path: attachmentPath
          });
        } catch (error) {
          logger.error('attachmentPreview.loadError', {
            itemID: item.id,
            error: error.message
          });
          container.appendChild(renderEmptyState(doc, 'Preview failed to load'));
        }

        return container;
      }
    });

    registered = true;
    logger.debug('attachmentPreview.registered', { sectionID });
    return true;
  }

  return {
    register,
    cleanup,
    destroy: cleanup,
    sectionID,
    isPreviewable
  };
}
