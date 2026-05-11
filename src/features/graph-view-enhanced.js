/**
 * Graph View Enhanced - SVG-based relationship visualization
 */

import { createLayoutEngine } from '../services/layout-engine.js';

export function createGraphViewEnhanced(options) {
  const { logger, i18n, zotero, prefs, container } = options;
  const Zotero = zotero || globalThis.Zotero;

  const layoutEngine = createLayoutEngine({ logger });

  let currentLayout = prefs?.get?.('graphView.layout') || 'force';
  let currentTheme = prefs?.get?.('graphView.theme') || 'light';
  let nodeSize = parseInt(prefs?.get?.('graphView.nodeSize') || '20');
  let edgeWidth = parseFloat(prefs?.get?.('graphView.edgeWidth') || '2');
  let showLabels = prefs?.get?.('graphView.showLabels') !== false;

  let svg = null;
  let currentData = null;

  const themes = {
    light: {
      background: '#ffffff',
      node: '#468B97',
      edge: '#cccccc',
      text: '#333333'
    },
    dark: {
      background: '#1a1a1a',
      node: '#86C8BC',
      edge: '#555555',
      text: '#ffffff'
    },
    colorful: {
      background: '#f0f8ff',
      node: '#FF6B6B',
      edge: '#4ECDC4',
      text: '#2C3E50'
    }
  };

  function render(data) {
    if (!container) {
      logger?.error?.('graphView.noContainer');
      return false;
    }

    currentData = data;

    if (svg && svg.parentNode) {
      svg.parentNode.removeChild(svg);
    }

    const doc = container.ownerDocument;
    const SVG_NS = 'http://www.w3.org/2000/svg';

    svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '400px');
    svg.style.background = themes[currentTheme].background;

    const nodes = [...data.nodes];
    const edges = [...data.edges];
    layoutEngine.applyLayout(currentLayout, nodes, edges);

    edges.forEach(edge => {
      const source = nodes.find(n => n.id === edge.source);
      const target = nodes.find(n => n.id === edge.target);

      if (source && target) {
        const line = doc.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', source.x);
        line.setAttribute('y1', source.y);
        line.setAttribute('x2', target.x);
        line.setAttribute('y2', target.y);
        line.setAttribute('stroke', themes[currentTheme].edge);
        line.setAttribute('stroke-width', edgeWidth);
        svg.appendChild(line);
      }
    });

    nodes.forEach(node => {
      const circle = doc.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', node.x);
      circle.setAttribute('cy', node.y);
      circle.setAttribute('r', nodeSize);
      circle.setAttribute('fill', themes[currentTheme].node);
      circle.style.cursor = 'pointer';

      circle.addEventListener('click', () => {
        logger?.debug?.('graphView.node.clicked', { id: node.id });
      });

      svg.appendChild(circle);

      if (showLabels && node.label) {
        const text = doc.createElementNS(SVG_NS, 'text');
        text.setAttribute('x', node.x + nodeSize + 5);
        text.setAttribute('y', node.y + 4);
        text.setAttribute('fill', themes[currentTheme].text);
        text.setAttribute('font-size', '12');
        text.textContent = node.label;
        svg.appendChild(text);
      }
    });

    container.appendChild(svg);

    logger?.debug?.('graphView.rendered', { nodes: nodes.length, edges: edges.length });
    return true;
  }

  function setLayout(layoutName) {
    if (!layoutEngine.getAvailableLayouts().includes(layoutName)) {
      logger?.error?.('graphView.invalidLayout', { layout: layoutName });
      return false;
    }

    currentLayout = layoutName;

    if (currentData) {
      render(currentData);
    }

    logger?.debug?.('graphView.layout.changed', { layout: layoutName });
    return true;
  }

  function setTheme(themeName) {
    if (!themes[themeName]) {
      logger?.error?.('graphView.invalidTheme', { theme: themeName });
      return false;
    }

    currentTheme = themeName;

    if (currentData) {
      render(currentData);
    }

    logger?.debug?.('graphView.theme.changed', { theme: themeName });
    return true;
  }

  function getLayouts() {
    return layoutEngine.getAvailableLayouts();
  }

  function getThemes() {
    return Object.keys(themes);
  }

  function getCurrentLayout() {
    return currentLayout;
  }

  function getCurrentTheme() {
    return currentTheme;
  }

  function register() {
    logger?.info?.('graphViewEnhanced.registered');
    return true;
  }

  return {
    register,
    render,
    setLayout,
    setTheme,
    getLayouts,
    getThemes,
    getCurrentLayout,
    getCurrentTheme
  };
}
