/**
 * Reading Time Column - ItemTree column displaying reading time with progress bar
 * Data source: item.extra field (format: "Reading Time: 123")
 */

export function createReadingTimeColumn(options) {
  const { logger, i18n, zotero, prefs, maxTime, color, opacity, showProgress, showText } = options;
  const Zotero = zotero || globalThis.Zotero;

  const dataKey = 'readingTime';
  const configMaxTime = maxTime || prefs?.get?.('readTimeColumn.max') || 600;
  const configColor = color || prefs?.get?.('readTimeColumn.color') || '#468B97';
  const configOpacity = opacity !== undefined ? opacity : parseFloat(prefs?.get?.('readTimeColumn.opacity') || '0.7');
  const configShowProgress = showProgress !== undefined ? showProgress : prefs?.get?.('readTimeColumn.progress') !== false;
  const configShowText = showText !== undefined ? showText : prefs?.get?.('readTimeColumn.text') !== false;

  function formatTime(minutes) {
    if (minutes < 60) {
      return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }

  function renderCell(doc, minutes, column) {
    const container = doc.createElement('div');
    container.className = 'reading-time-cell';

    Object.assign(container.style, {
      display: 'flex',
      alignItems: 'center',
      width: '100%',
      height: '100%',
      padding: '0 4px'
    });

    if (configShowProgress && minutes > 0) {
      const progressBar = doc.createElement('div');
      progressBar.className = 'reading-time-progress';
      const percentage = Math.min(minutes / configMaxTime, 1) * 100;

      Object.assign(progressBar.style, {
        width: `${percentage}%`,
        height: '60%',
        backgroundColor: configColor,
        opacity: String(configOpacity),
        borderRadius: '2px',
        marginRight: '4px'
      });

      container.appendChild(progressBar);
    }

    if (configShowText) {
      const label = doc.createElement('span');
      label.className = 'reading-time-text';
      label.textContent = formatTime(minutes);

      Object.assign(label.style, {
        fontSize: '0.9em',
        whiteSpace: 'nowrap'
      });

      container.appendChild(label);
    }

    return container;
  }

  function getReadingTime(item) {
    if (!item || !item.id) {
      return 0;
    }

    const readers = Zotero.Reader?.getActiveReaders?.() || [];
    const reader = readers.find(r => r.itemID === item.id);

    if (reader && reader._readTimeMinutes) {
      return reader._readTimeMinutes;
    }

    const extra = item.getField?.('extra') || '';
    const match = extra.match(/Reading Time: (\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  function register() {
    if (!Zotero || !Zotero.ItemTreeManager) {
      logger?.error?.('readingTimeColumn.register.failed', { reason: 'ItemTreeManager not available' });
      return false;
    }

    Zotero.ItemTreeManager.registerColumn({
      dataKey,
      label: i18n?.t?.('toolsbox-column-reading-time', 'Reading Time') || 'Reading Time',
      pluginID: 'toolsbox@orlandozh.github',
      dataProvider: (item) => getReadingTime(item),
      renderCell: (index, data, column) => {
        const doc = Zotero.getMainWindow().document;
        return renderCell(doc, data, column);
      },
      getSortValue: (item) => getReadingTime(item)
    });

    logger?.debug?.('readingTimeColumn.registered', { dataKey });
    return true;
  }

  return {
    register,
    renderCell,
    formatTime,
    getReadingTime,
    dataKey,
    maxTime: configMaxTime,
    color: configColor,
    opacity: configOpacity,
    showProgress: configShowProgress,
    showText: configShowText
  };
}
