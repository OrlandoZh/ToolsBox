/**
 * Publication Tags Column - ItemTree column displaying journal ranking badges
 * Data source: item.getField('publicationTitle')
 */

export function createPublicationTagsColumn(options) {
  const { logger, i18n, zotero, prefs } = options;
  const Zotero = zotero || globalThis.Zotero;

  const dataKey = 'publicationTags';

  const JOURNAL_TAGS = {
    'nature': ['SCI-Q1', 'IF>30', 'Top'],
    'science': ['SCI-Q1', 'IF>30', 'Top'],
    'cell': ['SCI-Q1', 'IF>30', 'Top'],
    'pnas': ['SCI-Q1', 'IF>10', 'Top'],
    'physical review letters': ['SCI-Q1', 'IF>8'],
    'journal of biological chemistry': ['SCI-Q2', 'IF>5'],
    'journal of personality and social psychology': ['SSCI-Q1', 'SSCI', 'IF>5'],
    'psychological bulletin': ['SSCI-Q1', 'SSCI', 'IF>10'],
    'american economic review': ['SSCI-Q1', 'SSCI', 'IF>8'],
    'journal of finance': ['SSCI-Q1', 'SSCI', 'IF>8'],
    'new england journal of medicine': ['SCI-Q1', 'IF>50', 'Top'],
    'the lancet': ['SCI-Q1', 'IF>30', 'Top'],
    'jama': ['SCI-Q1', 'IF>30', 'Top'],
    'bmj': ['SCI-Q1', 'IF>10'],
    'chemical reviews': ['SCI-Q1', 'IF>30', 'Top'],
    'nature chemistry': ['SCI-Q1', 'IF>20', 'Top'],
    'nature physics': ['SCI-Q1', 'IF>15', 'Top'],
    'physical review a': ['SCI-Q2'],
    'physical review b': ['SCI-Q2'],
    'ieee transactions on pattern analysis and machine intelligence': ['SCI-Q1', 'IF>20', 'Top'],
    'acm transactions on graphics': ['SCI-Q1', 'IF>8'],
    'neurips': ['Top', 'IF>10'],
    'icml': ['Top'],
    'cvpr': ['Top', 'IF>10'],
  };

  const TAG_COLORS = {
    'SCI-Q1': '#22c55e',
    'SCI-Q2': '#3b82f6',
    'SCI-Q3': '#eab308',
    'SCI-Q4': '#ef4444',
    'SSCI-Q1': '#22c55e',
    'SSCI-Q2': '#3b82f6',
    'SSCI-Q3': '#eab308',
    'SSCI-Q4': '#ef4444',
    'SSCI': '#8b5cf6',
    'SCI': '#06b6d4',
    'IF>50': '#f97316',
    'IF>30': '#f97316',
    'IF>20': '#f97316',
    'IF>15': '#f97316',
    'IF>10': '#f97316',
    'IF>8': '#f97316',
    'IF>5': '#f97316',
    'Top': '#ec4899',
  };

  const TAG_PRIORITY = {
    'Top': 1000,
    'IF>50': 900,
    'IF>30': 890,
    'IF>20': 880,
    'IF>15': 870,
    'IF>10': 860,
    'IF>8': 850,
    'IF>5': 840,
    'SCI-Q1': 440,
    'SCI-Q2': 430,
    'SCI-Q3': 420,
    'SCI-Q4': 410,
    'SSCI-Q1': 340,
    'SSCI-Q2': 330,
    'SSCI-Q3': 320,
    'SSCI-Q4': 310,
    'SSCI': 300,
    'SCI': 400,
  };

  function getJournalTags(journalName) {
    if (!journalName) return [];
    const normalizedName = journalName.toLowerCase().trim();
    return JOURNAL_TAGS[normalizedName] || [];
  }

  function getTagColor(tag) {
    return TAG_COLORS[tag] || '#6b7280';
  }

  function getTagPriority(tag) {
    return TAG_PRIORITY[tag] || 0;
  }

  function renderCell(doc, tags) {
    if (!tags || tags.length === 0) {
      const empty = doc.createElement('span');
      empty.textContent = '-';
      empty.style.opacity = '0.3';
      return empty;
    }

    const container = doc.createElement('div');
    container.className = 'publication-tags-cell';

    Object.assign(container.style, {
      width: '100%',
      height: '100%',
      padding: '2px 4px',
      display: 'flex',
      alignItems: 'center',
      gap: '3px',
      flexWrap: 'wrap',
      overflow: 'hidden'
    });

    const sortedTags = [...tags].sort((a, b) => getTagPriority(b) - getTagPriority(a));

    for (const tag of sortedTags) {
      const badge = doc.createElement('span');
      badge.className = 'pub-tag-badge';
      badge.textContent = tag;

      Object.assign(badge.style, {
        display: 'inline-block',
        padding: '1px 4px',
        fontSize: '10px',
        fontWeight: '500',
        borderRadius: '3px',
        backgroundColor: getTagColor(tag),
        color: '#ffffff',
        whiteSpace: 'nowrap',
        lineHeight: '1.2'
      });

      container.appendChild(badge);
    }

    return container;
  }

  function dataProvider(item, key) {
    if (!item || !item.id) return [];
    
    const publicationTitle = item.getField?.('publicationTitle');
    if (!publicationTitle) return [];
    
    return getJournalTags(publicationTitle);
  }

  function register() {
    if (!Zotero || !Zotero.ItemTreeManager) {
      logger?.error?.('publicationTagsColumn.register.failed', { reason: 'API not available' });
      return false;
    }

    Zotero.ItemTreeManager.registerColumn({
      dataKey,
      label: i18n?.t?.('toolsbox-column-publication-tags', 'Publication Tags') || 'Publication Tags',
      pluginID: 'toolsbox@orlandozh.github',
      dataProvider: (item) => dataProvider(item, dataKey),
      renderCell: (index, data, column) => {
        const doc = Zotero.getMainWindow().document;
        return renderCell(doc, data, column);
      },
      sortProvider: (itemA, itemB) => {
        const tagsA = dataProvider(itemA, dataKey);
        const tagsB = dataProvider(itemB, dataKey);
        const priorityA = tagsA.reduce((max, tag) => Math.max(max, getTagPriority(tag)), 0);
        const priorityB = tagsB.reduce((max, tag) => Math.max(max, getTagPriority(tag)), 0);
        return priorityB - priorityA;
      }
    });

    logger?.debug?.('publicationTagsColumn.registered', { dataKey });
    return true;
  }

  return {
    register,
    renderCell,
    getJournalTags,
    getTagColor,
    getTagPriority,
    dataProvider,
    dataKey
  };
}
