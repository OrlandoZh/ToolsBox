/**
 * Annotation Colors - 批注颜色管理
 * Provides predefined color scheme with names and groups for PDF annotations
 */

const COLOR_SCHEME = {
  'Important': { hex: '#ffd700', group: 'Priority' },
  'Key Point': { hex: '#ff6b6b', group: 'Priority' },
  'Method': { hex: '#4ecdc4', group: 'Content' },
  'Result': { hex: '#45b7d1', group: 'Content' },
  'Background': { hex: '#96ceb4', group: 'Content' },
  'Question': { hex: '#dda0dd', group: 'Other' },
  'Idea': { hex: '#ffeb3b', group: 'Other' },
  'Todo': { hex: '#ff9800', group: 'Other' }
};

export function createAnnotationColors(options = {}) {
  const { logger, zotero } = options;
  const Zotero = zotero || globalThis.Zotero;

  function getColorName(hexColor) {
    if (!hexColor || typeof hexColor !== 'string') return null;

    const normalized = hexColor.toLowerCase().trim();
    if (!normalized.match(/^#[0-9a-f]{6}$/i)) return null;

    for (const [name, config] of Object.entries(COLOR_SCHEME)) {
      if (config.hex.toLowerCase() === normalized) {
        return name;
      }
    }
    return null;
  }

  function getColorsByGroup(groupName) {
    if (!groupName || typeof groupName !== 'string') return [];

    const colors = [];
    for (const [name, config] of Object.entries(COLOR_SCHEME)) {
      if (config.group === groupName) {
        colors.push({ name, hex: config.hex, group: config.group });
      }
    }
    return colors;
  }

  function getAllColors() {
    return Object.entries(COLOR_SCHEME).map(([name, config]) => ({
      name,
      hex: config.hex,
      group: config.group
    }));
  }

  function isValidHexColor(color) {
    if (!color || typeof color !== 'string') return false;
    return /^#[0-9a-f]{6}$/i.test(color.trim());
  }

  async function applyColorToAnnotation(annotationID, color) {
    if (!annotationID) {
      return { success: false, error: 'Invalid annotation ID' };
    }

    if (!isValidHexColor(color)) {
      return { success: false, error: 'Invalid color format' };
    }

    try {
      const annotation = Zotero?.Annotations?.get?.(annotationID);
      if (!annotation) {
        return { success: false, error: 'Annotation not found' };
      }

      if (typeof annotation.setColor === 'function') {
        annotation.setColor(color);
      } else {
        annotation.color = color;
      }

      if (typeof annotation.saveTx === 'function') {
        await annotation.saveTx();
      } else if (typeof annotation.save === 'function') {
        await annotation.save();
      }

      logger?.debug?.('annotationColors.colorApplied', {
        annotationID,
        color,
        colorName: getColorName(color)
      });

      return { success: true };
    } catch (error) {
      logger?.error?.('annotationColors.applyError', {
        annotationID,
        color,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  function getGroupNames() {
    return [...new Set(Object.values(COLOR_SCHEME).map(c => c.group))];
  }

  function register() {
    logger?.debug?.('annotationColors.registered');
    return true;
  }

  return {
    register,
    getColorName,
    getColorsByGroup,
    getAllColors,
    applyColorToAnnotation,
    isValidHexColor,
    getGroupNames
  };
}
