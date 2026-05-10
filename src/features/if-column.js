/**
 * IF Column - ItemTree column displaying journal impact factor data
 * Uses EasyScholar API with caching in item.extra field
 */

const CACHE_EXPIRY_DAYS = 7;
const CACHE_EXPIRY_MS = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

const DEFAULT_FIELDS = ['SCIIF', 'SCI-Q'];
const DEFAULT_COLOR_MAPPING = {
  Q1: '#4caf50',
  Q2: '#2196f3',
  Q3: '#ff9800',
  Q4: '#f44336',
  A: '#4caf50',
  B: '#2196f3',
  C: '#ff9800',
  D: '#f44336'
};

const FIELD_LABELS = {
  SCIIF: 'IF',
  'SCI-Q': 'Q',
  SSCI: 'SSCI',
  UTD24: 'UTD24',
  AJG: 'AJG',
  CCS: 'CCS'
};

/**
 * Create IF Column feature
 * @param {Object} options - Feature options
 * @param {Object} options.logger - Logger instance
 * @param {Object} options.i18n - Internationalization instance
 * @param {Object} options.zotero - Zotero instance
 * @param {Object} options.prefs - Preferences instance
 * @param {Object} options.easyscholarClient - EasyScholar API client
 * @returns {Object} IF Column feature
 */
export function createIFColumn(options) {
  const { logger, i18n, zotero, prefs, easyscholarClient } = options;
  const Zotero = zotero || globalThis.Zotero;

  const dataKey = 'impactFactor';

  const configFields = prefs?.get?.('ifColumn.fields')?.split?.(',') || DEFAULT_FIELDS;
  const configShowProgress = prefs?.get?.('ifColumn.showProgress') !== 'false';
  const configColorMapping = parseColorMapping(prefs?.get?.('ifColumn.colorMapping')) || DEFAULT_COLOR_MAPPING;
  const configCacheExpiry = parseInt(prefs?.get?.('ifColumn.cacheExpiry') || CACHE_EXPIRY_DAYS, 10);

  /**
   * Parse color mapping from preference string
   * @param {string} str - Color mapping string (e.g., "Q1:#4caf50,Q2:#2196f3")
   * @returns {Object|null} Color mapping object
   */
  function parseColorMapping(str) {
    if (!str || typeof str !== 'string') return null;
    const mapping = {};
    const pairs = str.split(',');
    for (const pair of pairs) {
      const [key, value] = pair.split(':');
      if (key && value) {
        mapping[key.trim()] = value.trim();
      }
    }
    return Object.keys(mapping).length > 0 ? mapping : null;
  }

  /**
   * Extract cached IF data from item.extra field
   * @param {string} extra - Item extra field content
   * @returns {Object|null} Cached IF data or null
   */
  function extractCachedIF(extra) {
    if (!extra || typeof extra !== 'string') return null;
    
    const match = extra.match(/IF-Data: (\{[^}]+\})/);
    if (!match) return null;
    
    try {
      const data = JSON.parse(match[1]);
      return data;
    } catch {
      return null;
    }
  }

  /**
   * Check if cached data is expired
   * @param {number} timestamp - Cache timestamp
   * @returns {boolean} True if expired
   */
  function isExpired(timestamp) {
    if (!timestamp) return true;
    const expiryMs = configCacheExpiry * 24 * 60 * 60 * 1000;
    return Date.now() - timestamp > expiryMs;
  }

  /**
   * Update item.extra field with IF data
   * @param {Object} item - Zotero item
   * @param {Object} data - IF data to cache
   */
  async function updateItemExtra(item, data) {
    if (!item || !data) return;
    
    const extra = item.getField?.('extra') || '';
    const cleanedExtra = extra.replace(/IF-Data: \{[^}]+\}\n?/g, '').trim();
    
    const cacheData = {
      ...data,
      timestamp: Date.now()
    };
    
    const newExtra = `${cleanedExtra}\nIF-Data: ${JSON.stringify(cacheData)}`.trim();
    
    try {
      item.setField('extra', newExtra);
      await item.saveTx();
      logger?.debug?.('ifColumn.cacheUpdated', { itemID: item.id });
    } catch (error) {
      logger?.error?.('ifColumn.cacheUpdateFailed', {
        itemID: item.id,
        error: error.message
      });
    }
  }

  /**
   * Get IF data for an item
   * @param {Object} item - Zotero item
   * @returns {Promise<Object|null>} IF data or null
   */
  async function getIFData(item) {
    if (!item || !item.id) return null;
    
    const journal = item.getField?.('publicationTitle');
    if (!journal) return null;
    
    const cached = extractCachedIF(item.getField?.('extra'));
    if (cached && !isExpired(cached.timestamp)) {
      logger?.debug?.('ifColumn.usingCache', { itemID: item.id, journal });
      return cached;
    }
    
    if (!easyscholarClient) {
      logger?.warn?.('ifColumn.noClient', { itemID: item.id });
      return cached || null;
    }
    
    try {
      const metrics = await easyscholarClient.getJournalMetrics(journal);
      if (!metrics) {
        return cached || null;
      }
      
      await updateItemExtra(item, metrics);
      return metrics;
    } catch (error) {
      logger?.error?.('ifColumn.fetchError', {
        itemID: item.id,
        journal,
        error: error.message
      });
      return cached || null;
    }
  }

  /**
   * Get color for a quartile value
   * @param {string} value - Quartile value (Q1, Q2, Q3, Q4, etc.)
   * @returns {string} Color hex value
   */
  function getColorForValue(value) {
    if (!value) return '#9e9e9e';
    return configColorMapping[value] || '#9e9e9e';
  }

  /**
   * Render cell content for ItemTree column
   * @param {Document} doc - Document object
   * @param {Object} ifData - IF data object
   * @param {Object} column - Column configuration
   * @returns {HTMLElement} Rendered cell element
   */
  function renderCell(doc, ifData, column) {
    const container = doc.createElement('div');
    container.className = 'if-column-cell';
    
    Object.assign(container.style, {
      display: 'flex',
      alignItems: 'center',
      flexWrap: 'wrap',
      width: '100%',
      height: '100%',
      padding: '2px 4px',
      gap: '4px'
    });
    
    if (!ifData) {
      const emptyLabel = doc.createElement('span');
      emptyLabel.textContent = '-';
      emptyLabel.style.opacity = '0.5';
      container.appendChild(emptyLabel);
      return container;
    }
    
    for (const field of configFields) {
      const fieldEl = renderField(doc, field, ifData);
      if (fieldEl) {
        container.appendChild(fieldEl);
      }
    }
    
    return container;
  }

  /**
   * Render a single field element
   * @param {Document} doc - Document object
   * @param {string} field - Field name
   * @param {Object} ifData - IF data object
   * @returns {HTMLElement|null} Field element or null
   */
  function renderField(doc, field, ifData) {
    const fieldKey = field.trim().toUpperCase();
    let value = null;
    
    if (fieldKey === 'SCIIF' || fieldKey === 'IF') {
      value = ifData.sciIF;
    } else if (fieldKey === 'SCI-Q' || fieldKey === 'Q') {
      value = ifData.sciQ;
    } else if (fieldKey === 'SSCI') {
      value = ifData.ssci;
    } else if (fieldKey === 'UTD24') {
      value = ifData.utd24;
    } else if (fieldKey === 'AJG') {
      value = ifData.ajg;
    } else if (fieldKey === 'CCS') {
      value = ifData.ccs;
    }
    
    if (value === null || value === undefined) return null;
    
    const fieldContainer = doc.createElement('div');
    fieldContainer.className = `if-field if-field-${fieldKey.toLowerCase()}`;
    
    Object.assign(fieldContainer.style, {
      display: 'flex',
      alignItems: 'center',
      padding: '2px 6px',
      borderRadius: '3px',
      fontSize: '0.85em',
      fontWeight: '500',
      backgroundColor: 'rgba(0, 0, 0, 0.05)',
      marginRight: '4px'
    });
    
    const label = doc.createElement('span');
    label.className = 'if-field-label';
    label.textContent = FIELD_LABELS[fieldKey] || fieldKey;
    label.style.marginRight = '4px';
    label.style.opacity = '0.7';
    fieldContainer.appendChild(label);
    
    const valueEl = doc.createElement('span');
    valueEl.className = 'if-field-value';
    
    if (typeof value === 'boolean') {
      valueEl.textContent = value ? '✓' : '✗';
      valueEl.style.color = value ? '#4caf50' : '#9e9e9e';
    } else if (fieldKey === 'SCI-Q' || fieldKey === 'Q' || fieldKey === 'SCIIF' || fieldKey === 'IF') {
      valueEl.textContent = String(value);
      valueEl.style.color = getColorForValue(String(value));
      valueEl.style.fontWeight = 'bold';
      
      if (configShowProgress && (fieldKey === 'SCIIF' || fieldKey === 'IF') && typeof value === 'number') {
        const progressBar = doc.createElement('div');
        const percentage = Math.min(value / 20, 1) * 100;
        Object.assign(progressBar.style, {
          width: `${percentage}%`,
          height: '3px',
          backgroundColor: getColorForValue(ifData.sciQ || 'Q1'),
          borderRadius: '2px',
          marginTop: '2px',
          position: 'absolute',
          bottom: '0',
          left: '0',
          opacity: '0.3'
        });
        fieldContainer.style.position = 'relative';
        fieldContainer.style.overflow = 'hidden';
        fieldContainer.appendChild(progressBar);
      }
    } else {
      valueEl.textContent = String(value);
    }
    
    fieldContainer.appendChild(valueEl);
    return fieldContainer;
  }

  /**
   * Register the column with Zotero's ItemTreeManager
   * @returns {boolean} Success status
   */
  function register() {
    if (!Zotero?.ItemTreeManager) {
      logger?.error?.('ifColumn.register.failed', { reason: 'ItemTreeManager not available' });
      return false;
    }

    Zotero.ItemTreeManager.registerColumn({
      dataKey,
      label: i18n?.t?.('toolsbox-column-if', 'Impact Factor') || 'Impact Factor',
      pluginID: 'toolsbox@orlandozh.github',
      dataProvider: async (item) => {
        const data = await getIFData(item);
        if (!data) return null;
        
        if (data.sciIF) return data.sciIF;
        if (data.sciQ) return data.sciQ;
        if (data.ssci) return 'SSCI';
        return null;
      },
      renderCell: (index, data, column) => {
        const doc = Zotero.getMainWindow().document;
        return renderCell(doc, data, column);
      },
      getSortValue: async (item) => {
        const data = await getIFData(item);
        if (!data) return -1;
        if (data.sciIF) return data.sciIF;
        if (data.sciQ) {
          const qMap = { Q1: 4, Q2: 3, Q3: 2, Q4: 1 };
          return qMap[data.sciQ] || 0;
        }
        return 0;
      }
    });

    logger?.debug?.('ifColumn.registered', { dataKey });
    return true;
  }

  return {
    register,
    dataKey,
    getIFData,
    renderCell,
    extractCachedIF,
    isExpired,
    updateItemExtra,
    getColorForValue,
    configFields,
    configShowProgress,
    configColorMapping
  };
}
