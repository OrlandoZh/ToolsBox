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
  let registered = false;
  let active = false;

  function truncateText(text, maxLen = 30) {
    if (!text || text.length <= maxLen) return text || '';
    return text.substring(0, maxLen) + '...';
  }

  function resolveReaderFrame(reader) {
    const frameWindow = reader?._internalReader?._primaryView?._iframeWindow
      || reader?._iframeWindow
      || null;
    const doc = frameWindow?.document || null;
    const body = doc?.body || null;
    if (!frameWindow || !doc || !body) {
      return {
        available: false,
        reason: !frameWindow ? 'Reader frame window not available' : (!doc ? 'Reader frame document not available' : 'Reader frame body not available'),
        frameWindow,
        doc,
        body,
      };
    }
    return {
      available: true,
      frameWindow,
      doc,
      body,
    };
  }

  function removeLayer() {
    if (canvas && canvas.parentNode) {
      canvas.parentNode.removeChild(canvas);
    }

    canvas = null;
    ctx = null;
    currentReader = null;
    currentHeight = 0;
  }

  function createLayer(reader) {
    const frame = resolveReaderFrame(reader);
    if (!frame.available) {
      logger?.warn?.('marginAnnotation.create.unavailable', { reason: frame.reason });
      return null;
    }

    removeLayer();
    currentReader = reader;

    const { doc, body } = frame;
    canvas = doc.createElement('canvas');
    canvas.className = 'margin-annotation-layer';
    if (canvas.dataset) {
      canvas.dataset.toolsboxOwner = 'toolsbox-margin-annotation';
    }
    if (typeof canvas.setAttribute === 'function') {
      canvas.setAttribute('data-toolsbox-owner', 'toolsbox-margin-annotation');
    }
    canvas.width = width;
    canvas.height = body.scrollHeight || 800;
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

    ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
    if (!ctx) {
      logger?.warn?.('marginAnnotation.create.unavailable', { reason: 'Canvas 2D context not available' });
      removeLayer();
      return null;
    }

    body.appendChild(canvas);

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
    removeLayer();

    if (notifierID && Zotero?.Notifier?.unregisterObserver) {
      Zotero.Notifier.unregisterObserver(notifierID);
      notifierID = null;
    }

    registered = false;
    active = false;
    logger?.debug?.('marginAnnotation.destroyed');
  }

  function register() {
    if (!Zotero?.Reader || typeof Zotero.Reader.on !== 'function') {
      logger?.warn?.('marginAnnotation.register.skipped', { reason: 'Zotero.Reader not available' });
      return false;
    }

    if (registered) {
      active = true;
      return true;
    }

    Zotero.Reader.on('open', (reader) => {
      if (!active) {
        return;
      }
      logger?.debug?.('marginAnnotation.reader.opened', { itemID: reader._itemID });

      createLayer(reader);

      if (canvas && Zotero.Annotations) {
        const annotations = Zotero.Annotations.getByItemID(reader._itemID);
        renderAnnotations(annotations, { width, height: canvas?.height || 800 });
      }
    });

    Zotero.Reader.on('close', (reader) => {
      if (currentReader === reader) {
        removeLayer();
      }
    });

    if (Zotero.Notifier) {
      notifierID = Zotero.Notifier.registerObserver({
        notify: (event, type, ids) => {
          if (active && type === 'annotation' && currentReader && Zotero.Annotations) {
            const annotations = Zotero.Annotations.getByItemID(currentReader._itemID);
            renderAnnotations(annotations, { width, height: canvas?.height || currentHeight });
          }
        }
      }, ['annotation']) || null;
    }

    registered = true;
    active = true;
    logger?.info?.('marginAnnotation.registered');
    return true;
  }

  return {
    register,
    createLayer,
    renderAnnotations,
    resize,
    destroy,
    resolveReaderFrame,
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
