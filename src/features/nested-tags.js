/**
 * Nested Tags - Hierarchical tag parsing and rendering
 *
 * Supports separators: # (primary), / (secondary)
 * Example: 'AI#DeepLearning#CNN' → AI → DeepLearning → CNN
 */

const DEFAULT_SEPARATOR = '#';
const DEFAULT_CONNECTOR = '→';
const DEFAULT_INDENT_WIDTH = 10;

function cleanString(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function extractTagText(entry) {
  if (typeof entry === 'string') {
    return cleanString(entry);
  }
  if (entry && typeof entry === 'object') {
    return cleanString(entry.tag ?? entry.name ?? entry.label ?? '');
  }
  return '';
}

export function createNestedTags(options = {}) {
  const { logger, prefs } = options;

  const separator = prefs?.separator || prefs?.get?.('separator') || DEFAULT_SEPARATOR;
  const connector = prefs?.connector || prefs?.get?.('connector') || DEFAULT_CONNECTOR;
  const indentWidth = prefs?.indentWidth || prefs?.get?.('indentWidth') || DEFAULT_INDENT_WIDTH;
  const showConnector = prefs?.showConnector !== false && prefs?.get?.('showConnector') !== false;

  function parseNestedTag(tagString, sep = separator) {
    const text = cleanString(tagString);
    if (!text) {
      return [];
    }

    const parts = text.split(sep).map(cleanString).filter(Boolean);
    if (parts.length === 0) {
      return [];
    }

    const isNested = parts.length > 1;

    return parts.map((part, index) => ({
      level: index,
      text: part,
      isNested
    }));
  }

  function renderNestedTag(parsedTag, opts = {}) {
    if (!parsedTag || !Array.isArray(parsedTag) || parsedTag.length === 0) {
      return '';
    }

    const useConnector = opts.showConnector !== false && showConnector;
    const joinSymbol = useConnector ? ` ${opts.connector || connector} ` : ' ';

    return parsedTag.map(p => p.text).join(joinSymbol);
  }

  function renderNestedTagHTML(parsedTag, opts = {}) {
    if (!parsedTag || !Array.isArray(parsedTag) || parsedTag.length === 0) {
      return '';
    }

    const indent = opts.indentWidth || indentWidth;
    const useConnector = opts.showConnector !== false && showConnector;
    const connSymbol = opts.connector || connector;

    const parts = parsedTag.map((p, idx) => {
      const marginLeft = idx * indent;
      const prefix = idx > 0 && useConnector ? `${connSymbol} ` : '';
      return `<span style="margin-left: ${marginLeft}px">${prefix}${p.text}</span>`;
    });

    return parts.join('');
  }

  function parseAllTags(tags, sep = separator) {
    if (!tags || !Array.isArray(tags) || tags.length === 0) {
      return [];
    }

    return tags.map(entry => {
      const original = extractTagText(entry);
      const parsed = parseNestedTag(original, sep);
      const isNested = parsed.length > 1;

      return {
        original,
        parsed,
        isNested,
        levels: parsed.length
      };
    });
  }

  function groupNestedTags(tags, sep = separator) {
    const parsed = parseAllTags(tags, sep);
    const groups = {};

    parsed.forEach(entry => {
      if (entry.parsed.length > 0) {
        const root = entry.parsed[0].text;
        if (!groups[root]) {
          groups[root] = [];
        }
        groups[root].push(entry);
      }
    });

    return groups;
  }

  function filterNestedTags(tags, sep = separator) {
    return parseAllTags(tags, sep).filter(entry => entry.isNested);
  }

  function filterFlatTags(tags, sep = separator) {
    return parseAllTags(tags, sep).filter(entry => !entry.isNested);
  }

  function formatTagsForDisplay(tags, opts = {}) {
    const parsed = parseAllTags(tags, opts.separator || separator);

    const rendered = parsed.map(entry => {
      if (entry.isNested) {
        return renderNestedTag(entry.parsed, opts);
      }
      return entry.original;
    });

    return rendered.join(', ');
  }

  function formatTagsForHTMLDisplay(tags, opts = {}) {
    const parsed = parseAllTags(tags, opts.separator || separator);

    const rendered = parsed.map(entry => {
      if (entry.isNested) {
        return renderNestedTagHTML(entry.parsed, opts);
      }
      return `<span>${entry.original}</span>`;
    });

    return rendered.join('');
  }

  if (logger && typeof logger.info === 'function') {
    logger.info('nestedTags.created', {
      separator,
      connector,
      indentWidth,
      showConnector
    });
  }

  return {
    parseNestedTag,
    renderNestedTag,
    renderNestedTagHTML,
    parseAllTags,
    groupNestedTags,
    filterNestedTags,
    filterFlatTags,
    formatTagsForDisplay,
    formatTagsForHTMLDisplay,
    separator,
    connector,
    indentWidth,
    showConnector
  };
}

export const NESTED_TAGS_PREF_KEYS = Object.freeze({
  enabled: 'nestedTags.enabled',
  separator: 'nestedTags.separator',
  connector: 'nestedTags.connector',
  indentWidth: 'nestedTags.indentWidth',
  showConnector: 'nestedTags.showConnector',
  secondarySeparator: 'nestedTags.secondarySeparator'
});

export const NESTED_TAGS_DEFAULTS = Object.freeze({
  separator: DEFAULT_SEPARATOR,
  connector: DEFAULT_CONNECTOR,
  indentWidth: DEFAULT_INDENT_WIDTH,
  showConnector: true,
  secondarySeparator: '/'
});