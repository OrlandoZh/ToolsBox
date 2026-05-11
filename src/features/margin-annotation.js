/**
 * Margin Annotation - Displays PDF annotations in page margin
 * Data source: Zotero.Annotations API
 */

export function createMarginAnnotation(options) {
  const { logger, i18n, zotero, prefs } = options;
  const Zotero = zotero || globalThis.Zotero;

  const width = prefs?.get?.('marginAnnotation.width') || 200;
  const color = prefs?.get?.('marginAnnotation.color') || '#86C8BC';
  const opacity = parseFloat(prefs?.get?.('marginAnnotation.opacity') || '0.7');
  const fontSize = parseInt(prefs?.get?.('marginAnnotation.fontSize') || '12');
  const lineHeight = parseInt(prefs?.get?.('marginAnnotation.lineHeight') || '16');

  let canvas = null;
  let ctx = null;
  let currentReader = null;
  let currentHeight = 0;
  let notifierID = null;

  function truncateText(text, maxLen = 30) {
    if (!text || text.length <= maxLen) return text || '';
    return text.substring(0, maxLen) + '...';
  }

  function createLayer(reader) {
    if (!reader || !reader._iframeWindow) {
      logger?.error?.('marginAnnotation.create.failed', { reason: 'Invalid reader' });
      return null;
    }

    currentReader = reader;

    const doc = reader._iframeWindow.document;
    canvas = doc.createElement('canvas');
    canvas.className = 'margin-annotation-layer';
    canvas.width = width;
    canvas.height = doc.body.scrollHeight || 800;
    currentHeight = canvas.height;

    canvas.style.cssText = `
      position: absolute;
      right: 0;
      top: 0;
      width: ${width}px;
      height: ${canvas.height}px;
      background: rgba(255, 255, 255, 0.95);
      border-left: 1px solid #ddd;
      z-index: 9999;
      pointer-events: auto;
    `;

    ctx = canvas.getContext('2d');

    doc.body.appendChild(canvas);

    logger?.debug?.('marginAnnotation.layer.created', { width, height: canvas.height });
    return canvas;
  }

  function renderAnnotations(annotations, viewport) {
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!annotations || annotations.length === 0) {
      logger?.debug?.('marginAnnotation.noAnnotations');
      return;
    }

    ctx.font = `${fontSize}px Arial, sans-serif`;
    ctx.globalAlpha = opacity;

    annotations.forEach((ann, i) => {
      const y = i * (lineHeight + 5) + 10;

      ctx.fillStyle = 'rgba(134, 200, 188, 0.1)';
      ctx.fillRect(0, y - 5, width, lineHeight + 5);

      ctx.fillStyle = color;
      const text = truncateText(ann.text, 30);
      ctx.fillText(text, 10, y + fontSize - 2);
    });

    logger?.debug?.('marginAnnotation.rendered', { count: annotations.length });
  }

  function resize(newWidth, newHeight) {
    if (!canvas) return;

    if (newWidth) {
      canvas.width = newWidth;
      canvas.style.width = `${newWidth}px`;
    }

    if (newHeight) {
      canvas.height = newHeight;
      canvas.style.height = `${newHeight}px`;
    }

    currentHeight = newHeight || currentHeight;

    logger?.debug?.('marginAnnotation.resized', { width: canvas.width, height: canvas.height });
  }

  function destroy() {
    if (canvas && canvas.parentNode) {
      canvas.parentNode.removeChild(canvas);
    }

    canvas = null;
    ctx = null;
    currentReader = null;
    currentHeight = 0;

    if (notifierID && Zotero?.Notifier) {
      Zotero.Notifier.unregisterObserver(notifierID);
      notifierID = null;
    }

    logger?.debug?.('marginAnnotation.destroyed');
  }

  function register() {
    if (!Zotero || !Zotero.Reader) {
      logger?.error?.('marginAnnotation.register.failed', { reason: 'Zotero.Reader not available' });
      return false;
    }

    Zotero.Reader.on('open', (reader) => {
      logger?.debug?.('marginAnnotation.reader.opened', { itemID: reader._itemID });

      createLayer(reader);

      if (Zotero.Annotations) {
        const annotations = Zotero.Annotations.getByItemID(reader._itemID);
        renderAnnotations(annotations, { width, height: canvas?.height || 800 });
      }
    });

    Zotero.Reader.on('close', (reader) => {
      if (currentReader === reader) {
        destroy();
      }
    });

    if (Zotero.Notifier) {
      notifierID = Zotero.Notifier.registerObserver({
        notify: (event, type, ids) => {
          if (type === 'annotation' && currentReader && Zotero.Annotations) {
            const annotations = Zotero.Annotations.getByItemID(currentReader._itemID);
            renderAnnotations(annotations, { width, height: canvas?.height || currentHeight });
          }
        }
      }, ['annotation']);
    }

    logger?.info?.('marginAnnotation.registered');
    return true;
  }

  return {
    register,
    createLayer,
    renderAnnotations,
    resize,
    destroy,
    truncateText,
    getWidth: () => canvas?.width || width,
    getHeight: () => canvas?.height || currentHeight,
    width,
    color,
    opacity,
    fontSize,
    lineHeight
  };
}
