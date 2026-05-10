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
  let openCallbacks = [];
  let closeCallbacks = [];

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

  function applyBackgroundColor(reader) {
    if (!reader || !reader._iframeWindow) {
      logger?.error?.('pdfBackground.noReader', { reason: 'Invalid reader' });
      return false;
    }

    currentReader = reader;

    const doc = reader._iframeWindow.document;
    
    const viewer = doc.querySelector('#viewer') || 
                   doc.querySelector('.viewer') || 
                   doc.body;

    if (viewer && viewer.style) {
      viewer.style.backgroundColor = color;
    }

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
    
    if (Zotero?.Reader) {
      const readers = Zotero.Reader.getActiveReaders();
      if (readers && readers.length > 0) {
        return readers[0];
      }
    }
    
    return null;
  }

  function destroy() {
    currentReader = null;
    openCallbacks = [];
    closeCallbacks = [];
    logger?.debug?.('pdfBackground.destroyed');
  }

  function register() {
    if (!Zotero || !Zotero.Reader) {
      logger?.error?.('pdfBackground.register.failed', { 
        reason: 'Zotero.Reader not available' 
      });
      return false;
    }

    Zotero.Reader.on('open', (reader) => {
      logger?.debug?.('pdfBackground.reader.opened', { itemID: reader._itemID });

      if (applyToAll) {
        setTimeout(() => {
          applyBackgroundColor(reader);
        }, 100);
      }
    });

    Zotero.Reader.on('close', (reader) => {
      if (currentReader === reader) {
        currentReader = null;
      }
    });

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
    get color() { return color; },
    get applyToAll() { return applyToAll; },
    get preserveImages() { return preserveImages; }
  };
}
