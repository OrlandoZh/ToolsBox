/**
 * PDF Background Color - Customizes PDF Reader background color
 * Applies background color to PDF viewer for improved readability
 */

export function createPDFBackgroundColor(options) {
  const { logger, i18n, zotero, prefs } = options;
  const Zotero = zotero || globalThis.Zotero;

  let color = prefs?.get?.('pdfBackground.color') || '#f5f5dc';
  let applyToAll = prefs?.get?.('pdfBackground.applyToAll') !== false;
  let preserveImages = prefs?.get?.('pdfBackground.preserveImages') !== false;
  let currentReader = null;
  let registered = false;
  let active = false;
  const pendingTimers = new Set();
  const appliedViewers = new Map();

  function isValidColor(colorValue) {
    if (!colorValue || typeof colorValue !== 'string') {
      return false;
    }
    const hex3Regex = /^#[0-9a-fA-F]{3}$/;
    const hex6Regex = /^#[0-9a-fA-F]{6}$/;
    const rgbRegex = /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/;
    const rgbaRegex = /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)$/;
    const namedColors = /^(white|black|red|green|blue|yellow|cyan|magenta|gray|grey|silver|maroon|olive|navy|purple|teal|fuchsia|aqua|lime|orange|pink|beige)$/i;

    return hex3Regex.test(colorValue) ||
           hex6Regex.test(colorValue) ||
           rgbRegex.test(colorValue) ||
           rgbaRegex.test(colorValue) ||
           namedColors.test(colorValue);
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

  function resolveViewer(reader) {
    const frame = resolveReaderFrame(reader);
    if (!frame.available) {
      return {
        available: false,
        reason: frame.reason,
        viewer: null,
      };
    }
    const viewer = frame.doc.querySelector?.('#viewer') ||
                   frame.doc.querySelector?.('.viewer') ||
                   frame.body;
    if (!viewer?.style) {
      return {
        available: false,
        reason: 'Reader viewer style not available',
        viewer: null,
      };
    }
    return {
      available: true,
      viewer,
    };
  }

  function applyBackgroundColor(reader) {
    const resolved = resolveViewer(reader);
    if (!resolved.available) {
      logger?.warn?.('pdfBackground.unavailable', { reason: resolved.reason });
      return false;
    }

    currentReader = reader;
    const { viewer } = resolved;

    if (!appliedViewers.has(reader)) {
      appliedViewers.set(reader, {
        viewer,
        previousBackgroundColor: viewer.style.backgroundColor || '',
      });
    }
    viewer.style.backgroundColor = color;

    logger?.debug?.('pdfBackground.applied', {
      color: color,
      itemID: reader._itemID
    });
    return true;
  }

  function setColor(newColor) {
    if (!isValidColor(newColor)) {
      logger?.error?.('pdfBackground.invalidColor', { color: newColor });
      return false;
    }
    color = newColor;

    if (currentReader) {
      applyBackgroundColor(currentReader);
    }

    return true;
  }

  function getColor() {
    return color;
  }

  function getCurrentReader() {
    if (currentReader) {
      return currentReader;
    }

    if (Zotero?.Reader && typeof Zotero.Reader.getActiveReaders === 'function') {
      const readers = Zotero.Reader.getActiveReaders();
      if (readers && readers.length > 0) {
        return readers[0];
      }
    }

    return null;
  }

  function restoreReader(reader) {
    const entry = appliedViewers.get(reader);
    if (!entry) {
      return;
    }
    if (entry.viewer?.style) {
      entry.viewer.style.backgroundColor = entry.previousBackgroundColor;
    }
    appliedViewers.delete(reader);
  }

  function destroy() {
    active = false;
    pendingTimers.forEach((timerID) => clearTimeout(timerID));
    pendingTimers.clear();
    Array.from(appliedViewers.keys()).forEach((reader) => {
      restoreReader(reader);
    });
    currentReader = null;
    registered = false;
    logger?.debug?.('pdfBackground.destroyed');
  }

  function register() {
    if (!Zotero?.Reader || typeof Zotero.Reader.on !== 'function') {
      logger?.warn?.('pdfBackground.register.skipped', {
        reason: 'Zotero.Reader not available'
      });
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
      logger?.debug?.('pdfBackground.reader.opened', { itemID: reader._itemID });

      if (applyToAll) {
        const timerID = setTimeout(() => {
          pendingTimers.delete(timerID);
          if (!active) {
            return;
          }
          applyBackgroundColor(reader);
        }, 100);
        pendingTimers.add(timerID);
      }
    });

    Zotero.Reader.on('close', (reader) => {
      if (currentReader === reader) {
        currentReader = null;
      }
      restoreReader(reader);
    });

    registered = true;
    active = true;
    logger?.info?.('pdfBackground.registered');
    return true;
  }

  return {
    register,
    applyBackgroundColor,
    destroy,
    setColor,
    getColor,
    getCurrentReader,
    isValidColor,
    resolveReaderFrame,
    get color() { return color; },
    get applyToAll() { return applyToAll; },
    get preserveImages() { return preserveImages; }
  };
}
