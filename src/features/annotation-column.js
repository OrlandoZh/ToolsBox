/**
 * Annotation Column - ItemTree column displaying annotation distribution
 * Data source: Zotero.Annotations.getByItemID()
 */

export function createAnnotationColumn(options) {
  const { logger, i18n, zotero, prefs, style, color, opacity, maxDots } = options;
  const Zotero = zotero || globalThis.Zotero;

  const dataKey = 'annotationDist';
  const configStyle = style || prefs?.get?.('annotationColumn.style') || 'bar';
  const configColor = color || prefs?.get?.('annotationColumn.color') || '#86C8BC';
  const configOpacity = opacity !== undefined ? opacity : parseFloat(prefs?.get?.('annotationColumn.opacity') || '0.7');
  const configMaxDots = maxDots || parseInt(prefs?.get?.('annotationColumn.maxDots') || '50', 10);

  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function renderCell(doc, annotations, column) {
    if (!annotations || annotations.length === 0) {
      const empty = doc.createElement('span');
      empty.textContent = '-';
      empty.style.opacity = '0.3';
      return empty;
    }

    const container = doc.createElement('div');
    container.className = 'annotation-column-cell';

    Object.assign(container.style, {
      width: '100%',
      height: '100%',
      padding: '2px',
      display: 'flex',
      alignItems: 'center'
    });

    if (configStyle === 'bar') {
      renderBarStyle(doc, container, annotations, column);
    } else if (configStyle === 'circle') {
      renderCircleStyle(doc, container, annotations);
    }

    return container;
  }

  function renderBarStyle(doc, container, annotations, column) {
    const canvas = doc.createElement('canvas');
    canvas.width = 100;
    canvas.height = 20;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const totalPages = column?.totalPages || 50;
    const barWidth = canvas.width / totalPages;

    ctx.fillStyle = 'rgba(200, 200, 200, 0.2)';
    ctx.fillRect(0, 5, canvas.width, 10);

    ctx.fillStyle = hexToRgba(configColor, configOpacity);
    annotations.forEach(ann => {
      const page = ann.page || 0;
      if (page > 0) {
        const x = (page - 1) * barWidth;
        ctx.fillRect(x, 5, Math.max(barWidth - 1, 1), 10);
      }
    });

    container.appendChild(canvas);
  }

  function renderCircleStyle(doc, container, annotations) {
    const dotSize = 4;
    const limit = Math.min(annotations.length, configMaxDots);

    for (let i = 0; i < limit; i++) {
      const dot = doc.createElement('span');
      dot.className = 'annotation-dot';

      Object.assign(dot.style, {
        display: 'inline-block',
        width: `${dotSize}px`,
        height: `${dotSize}px`,
        backgroundColor: configColor,
        opacity: String(configOpacity),
        borderRadius: '50%',
        margin: '0 1px'
      });

      container.appendChild(dot);
    }
  }

  function getAnnotations(item) {
    if (!item || !item.id) {
      return [];
    }

    if (typeof item.isAttachment === 'function' && !item.isAttachment()) {
      return [];
    }

    return Zotero.Annotations?.getByItemID?.(item.id) || [];
  }

  function register() {
    if (!Zotero || !Zotero.ItemTreeManager) {
      logger?.error?.('annotationColumn.register.failed', { reason: 'API not available' });
      return false;
    }

    Zotero.ItemTreeManager.registerColumn({
      dataKey,
      label: i18n?.t?.('toolsbox-column-annotation', 'Annotations') || 'Annotations',
      pluginID: 'toolsbox@orlandozh.github',
      dataProvider: (item) => getAnnotations(item),
      renderCell: (index, data, column) => {
        const doc = Zotero.getMainWindow().document;
        return renderCell(doc, data, column);
      }
    });

    logger?.debug?.('annotationColumn.registered', { dataKey });
    return true;
  }

  return {
    register,
    renderCell,
    getAnnotations,
    hexToRgba,
    dataKey,
    style: configStyle,
    color: configColor,
    opacity: configOpacity,
    maxDots: configMaxDots
  };
}