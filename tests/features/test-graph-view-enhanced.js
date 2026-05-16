/**
 * Tests for Graph View Enhanced feature
 * Task 2 of P2 Reader integration plan
 */

import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import { createLayoutEngine } from "../../src/services/layout-engine.js";
import { createGraphViewEnhanced } from "../../src/features/graph-view-enhanced.js";

function createMockLogger() {
  const logs = [];
  return {
    debug(message, data) {
      logs.push({ level: 'debug', message, data });
    },
    error(message, data) {
      logs.push({ level: 'error', message, data });
    },
    info(message, data) {
      logs.push({ level: 'info', message, data });
    },
    getLogs() {
      return logs;
    }
  };
}

function createMockI18n() {
  return {
    t(key, fallback) {
      return fallback || key;
    }
  };
}

function createMockPrefs(overrides = {}) {
  const defaults = {
    'graphView.enabled': true,
    'graphView.layout': 'force',
    'graphView.theme': 'light',
    'graphView.nodeSize': '20',
    'graphView.edgeWidth': '2',
    'graphView.showLabels': true,
    ...overrides
  };
  return {
    get(key) {
      return defaults[key];
    }
  };
}

function createMockSVGElement() {
  const children = [];
  const attributes = {};
  const eventListeners = {};

  return {
    tagName: 'svg',
    children,
    attributes,
    eventListeners,
    style: {},
    parentNode: null,
    setAttribute(name, value) {
      attributes[name] = value;
    },
    getAttribute(name) {
      return attributes[name];
    },
    appendChild(child) {
      children.push(child);
      child.parentNode = this;
    },
    removeChild(child) {
      const idx = children.indexOf(child);
      if (idx >= 0) {
        children.splice(idx, 1);
        child.parentNode = null;
      }
    },
    addEventListener(event, handler) {
      if (!eventListeners[event]) {
        eventListeners[event] = [];
      }
      eventListeners[event].push(handler);
    },
    querySelector(selector) {
      return null;
    }
  };
}

function createMockDocument() {
  const svgNS = 'http://www.w3.org/2000/svg';

  return {
    createElementNS(ns, tag) {
      const element = createMockSVGElement();
      element.tagName = tag;
      element.namespaceURI = ns;
      return element;
    },
    querySelector(selector) {
      return null;
    }
  };
}

function createMockContainer() {
  const children = [];
  const doc = createMockDocument();

  return {
    children,
    ownerDocument: doc,
    appendChild(child) {
      children.push(child);
      child.parentNode = this;
    },
    removeChild(child) {
      const idx = children.indexOf(child);
      if (idx >= 0) {
        children.splice(idx, 1);
        child.parentNode = null;
      }
    },
    querySelector(selector) {
      return null;
    },
    getChildren() {
      return children;
    }
  };
}

function createMockZotero() {
  return {};
}

// ============================================
// Layout Engine Tests
// ============================================

describe("LayoutEngine", () => {
  it("should create layout engine with available layouts", () => {
    const mockLogger = createMockLogger();
    const engine = createLayoutEngine({ logger: mockLogger });

    const layouts = engine.getAvailableLayouts();

    assert.ok(layouts.includes('force'), "Should include force layout");
    assert.ok(layouts.includes('tree'), "Should include tree layout");
    assert.ok(layouts.includes('circular'), "Should include circular layout");
  });

  it("should apply force layout to nodes", () => {
    const mockLogger = createMockLogger();
    const engine = createLayoutEngine({ logger: mockLogger });

    const nodes = [
      { id: '1', label: 'Node 1' },
      { id: '2', label: 'Node 2' },
      { id: '3', label: 'Node 3' }
    ];
    const edges = [];

    const result = engine.applyLayout('force', nodes, edges);

    assert.equal(result, true, "applyLayout should return true");
    nodes.forEach(node => {
      assert.ok(typeof node.x === 'number', `Node ${node.id} should have x coordinate`);
      assert.ok(typeof node.y === 'number', `Node ${node.id} should have y coordinate`);
    });
  });

  it("should apply tree layout with hierarchical positioning", () => {
    const mockLogger = createMockLogger();
    const engine = createLayoutEngine({ logger: mockLogger });

    const nodes = [
      { id: '1', label: 'Root', level: 0 },
      { id: '2', label: 'Child 1', level: 1 },
      { id: '3', label: 'Child 2', level: 1 },
      { id: '4', label: 'Grandchild', level: 2 }
    ];
    const edges = [
      { source: '1', target: '2' },
      { source: '1', target: '3' },
      { source: '2', target: '4' }
    ];

    const result = engine.applyLayout('tree', nodes, edges);

    assert.equal(result, true, "applyLayout should return true");

    // Root should be at top (lower y)
    const root = nodes.find(n => n.id === '1');
    assert.ok(root.y < 100, "Root should be near top");
  });

  it("should apply circular layout with nodes in circle", () => {
    const mockLogger = createMockLogger();
    const engine = createLayoutEngine({ logger: mockLogger });

    const nodes = [
      { id: '1', label: 'Node 1' },
      { id: '2', label: 'Node 2' },
      { id: '3', label: 'Node 3' },
      { id: '4', label: 'Node 4' }
    ];
    const edges = [];

    const result = engine.applyLayout('circular', nodes, edges);

    assert.equal(result, true, "applyLayout should return true");

    // All nodes should have coordinates
    nodes.forEach(node => {
      assert.ok(typeof node.x === 'number', `Node ${node.id} should have x coordinate`);
      assert.ok(typeof node.y === 'number', `Node ${node.id} should have y coordinate`);
    });

    // Nodes should be roughly equidistant from center
    const centerX = 400;
    const centerY = 300;
    const distances = nodes.map(n =>
      Math.sqrt(Math.pow(n.x - centerX, 2) + Math.pow(n.y - centerY, 2))
    );

    distances.forEach((d, i) => {
      assert.ok(d > 100, `Node ${i} should be far from center (distance: ${d})`);
    });
  });

  it("should return false for invalid layout name", () => {
    const mockLogger = createMockLogger();
    const engine = createLayoutEngine({ logger: mockLogger });

    const nodes = [{ id: '1' }];
    const edges = [];

    const result = engine.applyLayout('invalid', nodes, edges);

    assert.equal(result, false, "applyLayout should return false for invalid layout");

    const logs = mockLogger.getLogs();
    const errorLog = logs.find(l => l.level === 'error');
    assert.ok(errorLog, "Should log error for invalid layout");
  });

  it("should handle empty nodes array", () => {
    const mockLogger = createMockLogger();
    const engine = createLayoutEngine({ logger: mockLogger });

    const nodes = [];
    const edges = [];

    const result = engine.applyLayout('force', nodes, edges);

    assert.equal(result, true, "applyLayout should return true for empty nodes");
  });

  it("should handle single node", () => {
    const mockLogger = createMockLogger();
    const engine = createLayoutEngine({ logger: mockLogger });

    const nodes = [{ id: '1', label: 'Single' }];
    const edges = [];

    const result = engine.applyLayout('force', nodes, edges);

    assert.equal(result, true, "applyLayout should return true for single node");
    assert.ok(typeof nodes[0].x === 'number', "Node should have x coordinate");
    assert.ok(typeof nodes[0].y === 'number', "Node should have y coordinate");
  });
});

// ============================================
// Graph View Enhanced Tests
// ============================================

describe("GraphViewEnhanced", () => {
  it("should support multiple layout modes", () => {
    const mockLogger = createMockLogger();
    const graph = createGraphViewEnhanced({ logger: mockLogger });

    const layouts = graph.getLayouts();

    assert.deepEqual(layouts, ['force', 'tree', 'circular'], "Should return all layout modes");
    assert.equal(graph.getCurrentLayout(), 'force', "Default layout should be force");
  });

  it("should switch layout dynamically", () => {
    const mockLogger = createMockLogger();
    const graph = createGraphViewEnhanced({ logger: mockLogger });

    graph.setLayout('tree');

    assert.equal(graph.getCurrentLayout(), 'tree', "Layout should be changed to tree");

    graph.setLayout('circular');

    assert.equal(graph.getCurrentLayout(), 'circular', "Layout should be changed to circular");
  });

  it("should support theme switching", () => {
    const mockLogger = createMockLogger();
    const graph = createGraphViewEnhanced({ logger: mockLogger });

    const themes = graph.getThemes();

    assert.deepEqual(themes, ['light', 'dark', 'colorful'], "Should return all themes");
    assert.equal(graph.getCurrentTheme(), 'light', "Default theme should be light");

    graph.setTheme('dark');

    assert.equal(graph.getCurrentTheme(), 'dark', "Theme should be changed to dark");
  });

  it("should render nodes and edges correctly", () => {
    const mockContainer = createMockContainer();
    const mockLogger = createMockLogger();

    const graph = createGraphViewEnhanced({
      logger: mockLogger,
      container: mockContainer
    });

    const data = {
      nodes: [
        { id: '1', label: 'Paper A' },
        { id: '2', label: 'Paper B' }
      ],
      edges: [
        { source: '1', target: '2' }
      ]
    };

    const result = graph.render(data);

    assert.equal(result, true, "render should return true");
    assert.ok(mockContainer.getChildren().length > 0, "Container should have SVG element");
  });

  it("should create SVG element with correct namespace", () => {
    const mockContainer = createMockContainer();
    const mockLogger = createMockLogger();

    const graph = createGraphViewEnhanced({
      logger: mockLogger,
      container: mockContainer
    });

    const data = {
      nodes: [{ id: '1', label: 'Node' }],
      edges: []
    };

    graph.render(data);

    const svg = mockContainer.getChildren()[0];
    assert.ok(svg, "SVG element should be created");
    assert.equal(svg.namespaceURI, 'http://www.w3.org/2000/svg', "SVG should have correct namespace");
  });

  it("should render nodes as circles", () => {
    const mockContainer = createMockContainer();
    const mockLogger = createMockLogger();

    const graph = createGraphViewEnhanced({
      logger: mockLogger,
      container: mockContainer
    });

    const data = {
      nodes: [
        { id: '1', label: 'Node 1' },
        { id: '2', label: 'Node 2' }
      ],
      edges: []
    };

    graph.render(data);

    const svg = mockContainer.getChildren()[0];
    const circles = svg.children.filter(c => c.tagName === 'circle');

    assert.equal(circles.length, 2, "Should render 2 circles for 2 nodes");
  });

  it("should render edges as lines", () => {
    const mockContainer = createMockContainer();
    const mockLogger = createMockLogger();

    const graph = createGraphViewEnhanced({
      logger: mockLogger,
      container: mockContainer
    });

    const data = {
      nodes: [
        { id: '1', label: 'Node 1' },
        { id: '2', label: 'Node 2' },
        { id: '3', label: 'Node 3' }
      ],
      edges: [
        { source: '1', target: '2' },
        { source: '2', target: '3' }
      ]
    };

    graph.render(data);

    const svg = mockContainer.getChildren()[0];
    const lines = svg.children.filter(c => c.tagName === 'line');

    assert.equal(lines.length, 2, "Should render 2 lines for 2 edges");
  });

  it("should render node labels", () => {
    const mockContainer = createMockContainer();
    const mockLogger = createMockLogger();

    const graph = createGraphViewEnhanced({
      logger: mockLogger,
      container: mockContainer
    });

    const data = {
      nodes: [
        { id: '1', label: 'Paper A' },
        { id: '2', label: 'Paper B' }
      ],
      edges: []
    };

    graph.render(data);

    const svg = mockContainer.getChildren()[0];
    const texts = svg.children.filter(c => c.tagName === 'text');

    assert.ok(texts.length >= 2, "Should render text elements for labels");
  });

  it("should use custom node size from preferences", () => {
    const mockContainer = createMockContainer();
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs({
      'graphView.nodeSize': '30'
    });

    const graph = createGraphViewEnhanced({
      logger: mockLogger,
      container: mockContainer,
      prefs: mockPrefs
    });

    const data = {
      nodes: [{ id: '1', label: 'Node' }],
      edges: []
    };

    graph.render(data);

    const svg = mockContainer.getChildren()[0];
    const circle = svg.children.find(c => c.tagName === 'circle');

    assert.equal(circle.attributes.r, 30, "Circle radius should match preference");
  });

  it("should use custom edge width from preferences", () => {
    const mockContainer = createMockContainer();
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs({
      'graphView.edgeWidth': '3'
    });

    const graph = createGraphViewEnhanced({
      logger: mockLogger,
      container: mockContainer,
      prefs: mockPrefs
    });

    const data = {
      nodes: [
        { id: '1', label: 'Node 1' },
        { id: '2', label: 'Node 2' }
      ],
      edges: [{ source: '1', target: '2' }]
    };

    graph.render(data);

    const svg = mockContainer.getChildren()[0];
    const line = svg.children.find(c => c.tagName === 'line');

    assert.equal(line.attributes['stroke-width'], 3, "Line stroke-width should match preference");
  });

  it("should apply light theme colors", () => {
    const mockContainer = createMockContainer();
    const mockLogger = createMockLogger();

    const graph = createGraphViewEnhanced({
      logger: mockLogger,
      container: mockContainer
    });

    graph.setTheme('light');

    const data = {
      nodes: [{ id: '1', label: 'Node' }],
      edges: []
    };

    graph.render(data);

    const svg = mockContainer.getChildren()[0];
    assert.equal(svg.style.background, '#ffffff', "Background should be white for light theme");

    const circle = svg.children.find(c => c.tagName === 'circle');
    assert.equal(circle.attributes.fill, '#468B97', "Node color should match light theme");
  });

  it("should apply dark theme colors", () => {
    const mockContainer = createMockContainer();
    const mockLogger = createMockLogger();

    const graph = createGraphViewEnhanced({
      logger: mockLogger,
      container: mockContainer
    });

    graph.setTheme('dark');

    const data = {
      nodes: [{ id: '1', label: 'Node' }],
      edges: []
    };

    graph.render(data);

    const svg = mockContainer.getChildren()[0];
    assert.equal(svg.style.background, '#1a1a1a', "Background should be dark for dark theme");

    const circle = svg.children.find(c => c.tagName === 'circle');
    assert.equal(circle.attributes.fill, '#86C8BC', "Node color should match dark theme");
  });

  it("should apply colorful theme colors", () => {
    const mockContainer = createMockContainer();
    const mockLogger = createMockLogger();

    const graph = createGraphViewEnhanced({
      logger: mockLogger,
      container: mockContainer
    });

    graph.setTheme('colorful');

    const data = {
      nodes: [{ id: '1', label: 'Node' }],
      edges: []
    };

    graph.render(data);

    const svg = mockContainer.getChildren()[0];
    assert.equal(svg.style.background, '#f0f8ff', "Background should be light blue for colorful theme");

    const circle = svg.children.find(c => c.tagName === 'circle');
    assert.equal(circle.attributes.fill, '#FF6B6B', "Node color should be red for colorful theme");
  });

  it("should re-render when layout changes", () => {
    const mockContainer = createMockContainer();
    const mockLogger = createMockLogger();

    const graph = createGraphViewEnhanced({
      logger: mockLogger,
      container: mockContainer
    });

    const data = {
      nodes: [
        { id: '1', label: 'Node 1' },
        { id: '2', label: 'Node 2' }
      ],
      edges: []
    };

    graph.render(data);
    graph.setLayout('circular');

    const logs = mockLogger.getLogs();
    const layoutChangeLog = logs.find(l => l.message === 'graphView.layout.changed');
    assert.ok(layoutChangeLog, "Should log layout change");
  });

  it("should re-render when theme changes", () => {
    const mockContainer = createMockContainer();
    const mockLogger = createMockLogger();

    const graph = createGraphViewEnhanced({
      logger: mockLogger,
      container: mockContainer
    });

    const data = {
      nodes: [{ id: '1', label: 'Node' }],
      edges: []
    };

    graph.render(data);
    graph.setTheme('dark');

    const logs = mockLogger.getLogs();
    const themeChangeLog = logs.find(l => l.message === 'graphView.theme.changed');
    assert.ok(themeChangeLog, "Should log theme change");
  });

  it("should return false for invalid layout", () => {
    const mockLogger = createMockLogger();
    const graph = createGraphViewEnhanced({ logger: mockLogger });

    const result = graph.setLayout('invalid');

    assert.equal(result, false, "setLayout should return false for invalid layout");
  });

  it("should return false for invalid theme", () => {
    const mockLogger = createMockLogger();
    const graph = createGraphViewEnhanced({ logger: mockLogger });

    const result = graph.setTheme('invalid');

    assert.equal(result, false, "setTheme should return false for invalid theme");
  });

  it("should return false when rendering without container", () => {
    const mockLogger = createMockLogger();
    const graph = createGraphViewEnhanced({ logger: mockLogger });

    const data = {
      nodes: [{ id: '1', label: 'Node' }],
      edges: []
    };

    const result = graph.render(data);

    assert.equal(result, false, "render should return false without container");
  });

  it("should handle edges with missing nodes", () => {
    const mockContainer = createMockContainer();
    const mockLogger = createMockLogger();

    const graph = createGraphViewEnhanced({
      logger: mockLogger,
      container: mockContainer
    });

    const data = {
      nodes: [{ id: '1', label: 'Node 1' }],
      edges: [{ source: '1', target: 'nonexistent' }]
    };

    const result = graph.render(data);

    // Should still render successfully, just skip invalid edges
    assert.equal(result, true, "render should succeed with missing target node");
  });

  it("should use preferences for default layout", () => {
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs({
      'graphView.layout': 'tree'
    });

    const graph = createGraphViewEnhanced({
      logger: mockLogger,
      prefs: mockPrefs
    });

    assert.equal(graph.getCurrentLayout(), 'tree', "Should use preference for default layout");
  });

  it("should use preferences for default theme", () => {
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs({
      'graphView.theme': 'dark'
    });

    const graph = createGraphViewEnhanced({
      logger: mockLogger,
      prefs: mockPrefs
    });

    assert.equal(graph.getCurrentTheme(), 'dark', "Should use preference for default theme");
  });

  it("should register successfully", () => {
    const mockLogger = createMockLogger();
    const graph = createGraphViewEnhanced({ logger: mockLogger });

    const result = graph.register();

    assert.equal(result, true, "register should return true");

    const logs = mockLogger.getLogs();
    const registerLog = logs.find(l => l.message === 'graphViewEnhanced.registered');
    assert.ok(registerLog, "Should log registration");
  });

  it("should clear previous SVG on re-render", () => {
    const mockContainer = createMockContainer();
    const mockLogger = createMockLogger();

    const graph = createGraphViewEnhanced({
      logger: mockLogger,
      container: mockContainer
    });

    const data = {
      nodes: [{ id: '1', label: 'Node' }],
      edges: []
    };

    graph.render(data);
    assert.equal(mockContainer.getChildren().length, 1, "Should have one SVG after first render");

    graph.render(data);
    assert.equal(mockContainer.getChildren().length, 1, "Should still have one SVG after re-render");
  });

  it("should expose all public methods", () => {
    const mockLogger = createMockLogger();
    const graph = createGraphViewEnhanced({ logger: mockLogger });

    assert.typeOf(graph.register, 'function', "Should have register method");
    assert.typeOf(graph.render, 'function', "Should have render method");
    assert.typeOf(graph.setLayout, 'function', "Should have setLayout method");
    assert.typeOf(graph.setTheme, 'function', "Should have setTheme method");
    assert.typeOf(graph.getLayouts, 'function', "Should have getLayouts method");
    assert.typeOf(graph.getThemes, 'function', "Should have getThemes method");
    assert.typeOf(graph.getCurrentLayout, 'function', "Should have getCurrentLayout method");
    assert.typeOf(graph.getCurrentTheme, 'function', "Should have getCurrentTheme method");
  });

  it("should handle nodes without labels", () => {
    const mockContainer = createMockContainer();
    const mockLogger = createMockLogger();

    const graph = createGraphViewEnhanced({
      logger: mockLogger,
      container: mockContainer
    });

    const data = {
      nodes: [{ id: '1' }],
      edges: []
    };

    const result = graph.render(data);

    assert.equal(result, true, "render should succeed without node labels");
  });

  it("should hide labels when showLabels is false", () => {
    const mockContainer = createMockContainer();
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs({
      'graphView.showLabels': false
    });

    const graph = createGraphViewEnhanced({
      logger: mockLogger,
      container: mockContainer,
      prefs: mockPrefs
    });

    const data = {
      nodes: [{ id: '1', label: 'Node' }],
      edges: []
    };

    graph.render(data);

    const svg = mockContainer.getChildren()[0];
    const texts = svg.children.filter(c => c.tagName === 'text');

    assert.equal(texts.length, 0, "Should not render text elements when showLabels is false");
  });

  it("should add click handlers to nodes", () => {
    const mockContainer = createMockContainer();
    const mockLogger = createMockLogger();

    const graph = createGraphViewEnhanced({
      logger: mockLogger,
      container: mockContainer
    });

    const data = {
      nodes: [{ id: '1', label: 'Node' }],
      edges: []
    };

    graph.render(data);

    const svg = mockContainer.getChildren()[0];
    const circle = svg.children.find(c => c.tagName === 'circle');

    assert.ok(circle.eventListeners.click, "Circle should have click event listener");
    assert.ok(circle.eventListeners.click.length > 0, "Should have at least one click handler");
  });
});

await runTestsIfMain(import.meta.url);
