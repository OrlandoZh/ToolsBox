/**
 * Title Column Enhanced - ItemTree column displaying title with progress bar and status emojis
 * Data source: item.getField('title'), item.extra for progress, item.getTags() for status
 */

export function createTitleColumnEnhanced(options) {
  const { logger, i18n, zotero, prefs } = options;
  const Zotero = zotero || globalThis.Zotero;

  const dataKey = 'titleEnhanced';

  const DEFAULT_TAG_EMOJIS = {
    reading: '📖',
    done: '✅',
    important: '⭐',
    todo: '📋',
    reviewed: '👁️'
  };

  const DEFAULT_BACKGROUND_COLORS = {
    reading: '#f0f8ff',
    done: '#f0fff0',
    todo: '#fff8f0',
    reviewed: '#f8f0ff'
  };

  const DEFAULT_PROGRESS_COLOR = '#468B97';

  function parsePrefJSON(key, fallback) {
    try {
      const raw = prefs?.get?.(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  const configShowProgress = prefs?.get?.('titleColumnEnhanced.showProgress') !== false;
  const configShowTags = prefs?.get?.('titleColumnEnhanced.showTags') !== false;
  const configProgressColor = prefs?.get?.('titleColumnEnhanced.progressColor') || DEFAULT_PROGRESS_COLOR;
  const configTagEmojis = parsePrefJSON('titleColumnEnhanced.tagEmojis', DEFAULT_TAG_EMOJIS);
  const configBackgroundColors = parsePrefJSON('titleColumnEnhanced.backgroundColors', DEFAULT_BACKGROUND_COLORS);

  function extractTagName(entry) {
    if (typeof entry === 'string') return entry.trim();
    if (entry && typeof entry === 'object') return (entry.tag ?? entry.name ?? '').trim();
    return '';
  }

  function getItemTags(item) {
    if (!item) return [];
    try {
      const raw = item.getTags?.() || item.tags || [];
      return Array.isArray(raw) ? raw.map(extractTagName).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  function getStatusFromTags(tags) {
    const statusTags = tags.filter(t => t.startsWith('/'));
    if (statusTags.length === 0) return '';
    return statusTags[0].slice(1).toLowerCase();
  }

  function getReadingProgress(item) {
    if (!item || !item.id) return 0;

    try {
      const extra = item.getField?.('extra') || '';
      const match = extra.match(/Reading Progress:\s*(\d{1,3})\s*%/i);
      if (match) {
        return Math.max(0, Math.min(100, parseInt(match[1])));
      }

      const progressMatch = extra.match(/Progress:\s*(\d{1,3})\s*%/i);
      if (progressMatch) {
        return Math.max(0, Math.min(100, parseInt(progressMatch[1])));
      }

      const percentMatch = extra.match(/(\d{1,3})\s*%/);
      if (percentMatch && !extra.toLowerCase().includes('cited')) {
        return Math.max(0, Math.min(100, parseInt(percentMatch[1])));
      }
    } catch {
      return 0;
    }

    return 0;
  }

  function getStatusEmoji(item) {
    if (!item || !item.id) return '';

    const tags = getItemTags(item);
    const status = getStatusFromTags(tags);

    if (status === 'reading') return configTagEmojis.reading || '📖';
    if (status === 'done') return configTagEmojis.done || '✅';
    if (status === 'todo') return configTagEmojis.todo || '📋';
    if (status === 'reviewed') return configTagEmojis.reviewed || '👁️';

    const hasImportant = tags.some(t =>
      t.toLowerCase().includes('important') ||
      t === '#important' ||
      t === '⭐'
    );
    if (hasImportant) return configTagEmojis.important || '⭐';

    return '';
  }

  function getBackgroundColor(item) {
    if (!item || !item.id) return '';

    const tags = getItemTags(item);
    const status = getStatusFromTags(tags);

    return configBackgroundColors[status] || '';
  }

  function renderCell(doc, item) {
    const container = doc.createElement('div');
    container.className = 'title-enhanced-cell';

    const title = item?.getField?.('title') || '';
    const progress = getReadingProgress(item);
    const emoji = getStatusEmoji(item);
    const bgColor = getBackgroundColor(item);

    Object.assign(container.style, {
      display: 'flex',
      alignItems: 'center',
      width: '100%',
      height: '100%',
      padding: '2px 4px',
      gap: '4px',
      overflow: 'hidden',
      backgroundColor: bgColor || 'transparent'
    });

    if (configShowProgress && progress > 0) {
      const progressContainer = doc.createElement('div');
      progressContainer.className = 'title-progress-container';

      Object.assign(progressContainer.style, {
        position: 'relative',
        width: '40px',
        height: '16px',
        borderRadius: '2px',
        backgroundColor: '#e5e7eb',
        overflow: 'hidden'
      });

      const progressBar = doc.createElement('div');
      progressBar.className = 'title-progress-bar';

      Object.assign(progressBar.style, {
        width: `${progress}%`,
        height: '100%',
        backgroundColor: configProgressColor,
        borderRadius: '2px'
      });

      progressContainer.appendChild(progressBar);
      container.appendChild(progressContainer);
    }

    const titleElement = doc.createElement('span');
    titleElement.className = 'title-text';
    titleElement.textContent = title;
    titleElement.title = title;

    Object.assign(titleElement.style, {
      flex: '1',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      fontSize: 'inherit'
    });

    container.appendChild(titleElement);

    if (configShowTags && emoji) {
      const tagsContainer = doc.createElement('span');
      tagsContainer.className = 'title-tags';
      tagsContainer.textContent = emoji;

      Object.assign(tagsContainer.style, {
        fontSize: '12px',
        marginLeft: '4px',
        whiteSpace: 'nowrap'
      });

      container.appendChild(tagsContainer);
    }

    return container;
  }

  function sortByTitle(itemA, itemB) {
    const titleA = itemA?.getField?.('title') || '';
    const titleB = itemB?.getField?.('title') || '';
    return titleA.localeCompare(titleB);
  }

  function sortByProgress(itemA, itemB) {
    const progressA = getReadingProgress(itemA);
    const progressB = getReadingProgress(itemB);
    return progressA - progressB;
  }

  function register() {
    if (!Zotero || !Zotero.ItemTreeManager) {
      logger?.error?.('titleColumnEnhanced.register.failed', { reason: 'API not available' });
      return false;
    }

    Zotero.ItemTreeManager.registerColumn({
      dataKey,
      label: i18n?.t?.('toolsbox-column-title-enhanced', 'Enhanced Title') || 'Enhanced Title',
      pluginID: 'toolsbox@orlandozh.github',
      dataProvider: (item) => item?.getField?.('title') || '',
      renderCell: (index, data, column) => {
        const doc = Zotero.getMainWindow().document;
        const item = Zotero.Items?.get?.(index) || null;
        return renderCell(doc, item);
      },
      sortProvider: sortByTitle
    });

    logger?.debug?.('titleColumnEnhanced.registered', { dataKey });
    return true;
  }

  return {
    register,
    renderCell,
    getReadingProgress,
    getStatusEmoji,
    getBackgroundColor,
    sortByTitle,
    sortByProgress,
    dataKey,
    showProgress: configShowProgress,
    showTags: configShowTags,
    progressColor: configProgressColor,
    tagEmojis: configTagEmojis,
    backgroundColors: configBackgroundColors
  };
}