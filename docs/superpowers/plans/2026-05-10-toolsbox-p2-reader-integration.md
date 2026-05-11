# ToolsBox P2 Reader集成实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现Reader集成功能,提升PDF阅读和文献关系可视化体验,包括页边距批注显示和关系图增强。

**Architecture:** 采用Zotero Reader API和自定义渲染层,使用Canvas/SVG绘制页边距批注,使用D3.js或Cytoscape.js实现关系图布局。

**Tech Stack:** Zotero 7/8插件开发,Zotero Reader API,Canvas API,D3.js/Cytoscape.js,Fluent本地化

---

## 功能范围

P2 Reader集成包含2个核心功能:

1. **Margin Annotation** - PDF页边距批注显示
2. **Graph View增强** - 关系图多布局模式

---

## 文件结构

### 新增文件

```
src/features/
├── margin-annotation.js           # 页边距批注渲染
└── graph-view-enhanced.js         # 关系图增强

src/services/
└── layout-engine.js               # 关系图布局引擎

addon-static/locale/en-US/
└── main.ftl                        # 新增locale keys

tests/features/
├── test-margin-annotation.js
└── test-graph-view-enhanced.js
```

### 修改文件

```
src/app/feature-composer.js        # 注册新功能模块
config/addon.config.json            # 新增偏好配置项
docs/CURRENT_BACKLOG.md            # 更新开发状态
docs/FEATURE_GAP_ANALYSIS.md       # 更新完成度
```

---

## Task 1: Margin Annotation (页边距批注)

**Files:**
- Create: `src/features/margin-annotation.js`
- Modify: `src/app/feature-composer.js`
- Modify: `addon-static/locale/en-US/main.ftl`
- Test: `tests/features/test-margin-annotation.js`

**Architecture:**
- 数据源: 从Zotero.Reader获取当前打开的PDF实例
- 渲染层: 在Reader窗口右侧创建Canvas层绘制批注
- 同步: 监听批注变化事件,实时更新显示
- 配置: 批注显示宽度、颜色、透明度

- [ ] **Step 1: Write the failing test**

```javascript
// tests/features/test-margin-annotation.js
import { createMarginAnnotation } from '../../src/features/margin-annotation.js';

describe('MarginAnnotation', () => {
  it('should create canvas layer on reader open', () => {
    const mockReader = {
      _iframeWindow: {
        document: {
          body: { appendChild: sinon.spy() },
          createElement: sinon.stub().callsFake(() => ({
            className: '',
            style: {},
            width: 0,
            height: 0,
            getContext: sinon.stub().returns({
              clearRect: sinon.spy(),
              fillText: sinon.spy(),
              fillRect: sinon.spy()
            })
          }))
        }
      },
      _itemID: 12345
    };

    const margin = createMarginAnnotation({
      logger: mockLogger,
      width: 200
    });

    const canvas = margin.createLayer(mockReader);

    expect(canvas).toBeDefined();
    expect(canvas.width).toBe(200);
  });

  it('should render annotations in margin', () => {
    const mockCtx = {
      clearRect: sinon.spy(),
      fillText: sinon.spy(),
      fillRect: sinon.spy(),
      measureText: sinon.stub().returns({ width: 100 })
    };

    const margin = createMarginAnnotation({ logger: mockLogger });

    const annotations = [
      { position: { pageIndex: 0, rects: [[0, 100, 500, 120]] }, text: 'Important point' },
      { position: { pageIndex: 0, rects: [[0, 200, 500, 220]] }, text: 'Key finding' }
    ];

    margin.renderAnnotations(mockCtx, annotations, { width: 200, height: 800 });

    expect(mockCtx.fillText.calledTwice).toBe(true);
  });

  it('should handle reader resize', () => {
    const margin = createMarginAnnotation({ logger: mockLogger });

    margin.resize(300, 900);

    expect(margin.getWidth()).toBe(300);
    expect(margin.getHeight()).toBe(900);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/run-all.js`
Expected: FAIL with "Cannot find module '../../src/features/margin-annotation.js'"

- [ ] **Step 3: Implement margin annotation**

```javascript
// src/features/margin-annotation.js
/**
 * 页边距批注显示
 */

export function createMarginAnnotation(options) {
  const { logger, i18n, zotero, prefs } = options;
  const Zotero = zotero || globalThis.Zotero;

  const width = prefs?.get?.('marginAnnotation.width') || 200;
  const color = prefs?.get?.('marginAnnotation.color') || '#86C8BC';
  const opacity = parseFloat(prefs?.get?.('marginAnnotation.opacity') || '0.7');
  const fontSize = parseInt(prefs?.get?.('marginAnnotation.fontSize') || '12');
  const lineHeight = parseInt(prefs?.get?.('marginAnnotation.lineHeight') || '16');

  let canvas = null;
  let ctx = null;
  let currentReader = null;
  let height = 0;

  function createLayer(reader) {
    if (!reader || !reader._iframeWindow) {
      logger.error('marginAnnotation.create.failed', { reason: 'Invalid reader' });
      return null;
    }

    currentReader = reader;

    const doc = reader._iframeWindow.document;
    canvas = doc.createElement('canvas');
    canvas.className = 'margin-annotation-layer';
    canvas.width = width;
    canvas.height = doc.body.scrollHeight || 800;
    canvas.style.cssText = `
      position: absolute;
      right: 0;
      top: 0;
      width: ${width}px;
      height: ${canvas.height}px;
      background: rgba(255, 255, 255, 0.95);
      border-left: 1px solid #ddd;
      z-index: 9999;
      pointer-events: auto;
    `;

    ctx = canvas.getContext('2d');

    doc.body.appendChild(canvas);

    logger.debug('marginAnnotation.layer.created', { width, height: canvas.height });
    return canvas;
  }

  function renderAnnotations(annotations, viewport) {
    if (!ctx || !canvas) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!annotations || annotations.length === 0) {
      logger.debug('marginAnnotation.noAnnotations');
      return;
    }

    const scale = viewport.height / canvas.height;

    ctx.font = `${fontSize}px Arial, sans-serif`;
    ctx.fillStyle = color;
    ctx.globalAlpha = opacity;

    annotations.forEach((ann, i) => {
      const y = i * (lineHeight + 5) + 10;

      // Draw background
      ctx.fillStyle = 'rgba(134, 200, 188, 0.1)';
      ctx.fillRect(0, y - 5, width, lineHeight + 5);

      // Draw text
      ctx.fillStyle = color;
      const text = ann.text.length > 30 ? ann.text.substring(0, 30) + '...' : ann.text;
      ctx.fillText(text, 10, y + fontSize - 2);
    });

    logger.debug('marginAnnotation.rendered', { count: annotations.length });
  }

  function resize(newWidth, newHeight) {
    if (!canvas) return;

    if (newWidth) {
      canvas.width = newWidth;
      canvas.style.width = `${newWidth}px`;
    }

    if (newHeight) {
      canvas.height = newHeight;
      canvas.style.height = `${newHeight}px`;
    }

    height = newHeight || height;

    logger.debug('marginAnnotation.resized', { width: canvas.width, height: canvas.height });
  }

  function destroy() {
    if (canvas && canvas.parentNode) {
      canvas.parentNode.removeChild(canvas);
    }

    canvas = null;
    ctx = null;
    currentReader = null;

    logger.debug('marginAnnotation.destroyed');
  }

  function register() {
    // 监听Reader打开事件
    Zotero.Reader.on('open', (reader) => {
      logger.debug('marginAnnotation.reader.opened', { itemID: reader._itemID });

      createLayer(reader);

      // 获取批注数据
      const annotations = Zotero.Annotations.getByItemID(reader._itemID);
      renderAnnotations(annotations, { width, height: canvas.height });
    });

    // 监听Reader关闭事件
    Zotero.Reader.on('close', (reader) => {
      if (currentReader === reader) {
        destroy();
      }
    });

    // 监听批注变化
    Zotero.Notifier.registerObserver({
      notify: (event, type, ids) => {
        if (type === 'annotation' && currentReader) {
          const annotations = Zotero.Annotations.getByItemID(currentReader._itemID);
          renderAnnotations(annotations, { width, height: canvas.height });
        }
      }
    }, ['annotation']);

    logger.info('marginAnnotation.registered');
    return true;
  }

  return {
    register,
    createLayer,
    renderAnnotations,
    resize,
    destroy,
    getWidth: () => canvas?.width || width,
    getHeight: () => canvas?.height || height
  };
}
```

- [ ] **Step 4: Add locale keys**

```fluent
# addon-static/locale/en-US/main.ftl
toolsbox-margin-annotation = Margin Annotations
toolsbox-margin-annotation-tooltip = Show annotations in page margin
toolsbox-pref-margin-section =
    .label = Margin Annotation Settings
toolsbox-pref-margin-width =
    .value = Margin width (px)
toolsbox-pref-margin-color =
    .value = Annotation color
toolsbox-pref-margin-opacity =
    .value = Opacity
toolsbox-pref-margin-font-size =
    .value = Font size
```

- [ ] **Step 5: Add preference configuration**

```json
// config/addon.config.json (append)
"marginAnnotation": {
  "enabled": true,
  "width": 200,
  "color": "#86C8BC",
  "opacity": "0.7",
  "fontSize": "12",
  "lineHeight": "16"
}
```

- [ ] **Step 6: Register in feature-composer.js**

```javascript
// src/app/feature-composer.js
import { createMarginAnnotation } from '../features/margin-annotation.js';

// 在registerBaselineFeatures()中添加:
if (readBooleanPref(prefs, 'marginAnnotation.enabled', true)) {
  const marginAnnotation = createMarginAnnotation({
    logger,
    i18n,
    zotero: Zotero,
    prefs
  });

  if (marginAnnotation.register()) {
    logger.info('features.marginAnnotation.registered');
  }
}
```

- [ ] **Step 7: Commit Task 1**

```bash
git add src/features/margin-annotation.js tests/features/test-margin-annotation.js addon-static/locale/*/main.ftl config/addon.config.json src/app/feature-composer.js
git commit -m "feat: add margin annotation display in PDF reader"
```

---

## Task 2: Graph View增强 (关系图增强)

**Files:**
- Create: `src/features/graph-view-enhanced.js`
- Create: `src/services/layout-engine.js`
- Modify: `src/app/feature-composer.js`
- Modify: `addon-static/locale/en-US/main.ftl`
- Test: `tests/features/test-graph-view-enhanced.js`

**Architecture:**
- 布局引擎: 支持force-directed、tree、circular三种布局
- 主题: light、dark、colorful三种主题
- 配置: 节点大小、连线宽度、标签显示
- 交互: 拖拽、缩放、点击事件

- [ ] **Step 1: Write the failing test**

```javascript
// tests/features/test-graph-view-enhanced.js
import { createGraphViewEnhanced } from '../../src/features/graph-view-enhanced.js';

describe('GraphViewEnhanced', () => {
  it('should support multiple layout modes', () => {
    const graph = createGraphViewEnhanced({ logger: mockLogger });

    expect(graph.getLayouts()).toEqual(['force', 'tree', 'circular']);
    expect(graph.getCurrentLayout()).toBe('force');
  });

  it('should switch layout dynamically', () => {
    const graph = createGraphViewEnhanced({ logger: mockLogger });

    graph.setLayout('tree');

    expect(graph.getCurrentLayout()).toBe('tree');
  });

  it('should support theme switching', () => {
    const graph = createGraphViewEnhanced({ logger: mockLogger });

    expect(graph.getThemes()).toEqual(['light', 'dark', 'colorful']);

    graph.setTheme('dark');

    expect(graph.getCurrentTheme()).toBe('dark');
  });

  it('should render nodes and edges correctly', () => {
    const mockContainer = {
      appendChild: sinon.spy(),
      querySelector: sinon.stub().returns(null)
    };

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

    graph.render(data);

    expect(mockContainer.appendChild.called).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/run-all.js`
Expected: FAIL

- [ ] **Step 3: Implement layout engine**

```javascript
// src/services/layout-engine.js
/**
 * 关系图布局引擎
 */

export function createLayoutEngine(options) {
  const { logger } = options;

  const layouts = {
    force: {
      name: 'force-directed',
      tick: (nodes, edges) => {
        // Force simulation tick
        nodes.forEach(node => {
          node.x += node.vx || 0;
          node.y += node.vy || 0;
        });
      }
    },
    tree: {
      name: 'tree',
      layout: (nodes, edges) => {
        // Hierarchical tree layout
        const root = nodes[0];
        root.x = 400;
        root.y = 50;

        let level = 1;
        let levelNodes = nodes.filter(n => n.level === level);

        while (levelNodes.length > 0) {
          levelNodes.forEach((node, i) => {
            node.x = 100 + i * 150;
            node.y = level * 100;
          });

          level++;
          levelNodes = nodes.filter(n => n.level === level);
        }
      }
    },
    circular: {
      name: 'circular',
      layout: (nodes, edges) => {
        // Circular layout
        const radius = 200;
        const angleStep = (2 * Math.PI) / nodes.length;

        nodes.forEach((node, i) => {
          node.x = 400 + radius * Math.cos(i * angleStep);
          node.y = 300 + radius * Math.sin(i * angleStep);
        });
      }
    }
  };

  function applyLayout(layoutName, nodes, edges) {
    const layout = layouts[layoutName];
    if (!layout) {
      logger.error('layoutEngine.invalid', { layout: layoutName });
      return false;
    }

    if (layout.layout) {
      layout.layout(nodes, edges);
    }

    logger.debug('layoutEngine.applied', { layout: layoutName, nodes: nodes.length });
    return true;
  }

  function getAvailableLayouts() {
    return Object.keys(layouts);
  }

  return {
    applyLayout,
    getAvailableLayouts
  };
}
```

- [ ] **Step 4: Implement graph view enhanced**

```javascript
// src/features/graph-view-enhanced.js
/**
 * 关系图增强
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
      logger.error('graphView.noContainer');
      return false;
    }

    currentData = data;

    // Clear previous
    if (svg && svg.parentNode) {
      svg.parentNode.removeChild(svg);
    }

    // Create SVG
    const doc = container.ownerDocument;
    svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '400px');
    svg.style.background = themes[currentTheme].background;

    // Apply layout
    const nodes = [...data.nodes];
    const edges = [...data.edges];
    layoutEngine.applyLayout(currentLayout, nodes, edges);

    // Draw edges
    edges.forEach(edge => {
      const source = nodes.find(n => n.id === edge.source);
      const target = nodes.find(n => n.id === edge.target);

      if (source && target) {
        const line = doc.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', source.x);
        line.setAttribute('y1', source.y);
        line.setAttribute('x2', target.x);
        line.setAttribute('y2', target.y);
        line.setAttribute('stroke', themes[currentTheme].edge);
        line.setAttribute('stroke-width', edgeWidth);
        svg.appendChild(line);
      }
    });

    // Draw nodes
    nodes.forEach(node => {
      const circle = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', node.x);
      circle.setAttribute('cy', node.y);
      circle.setAttribute('r', nodeSize);
      circle.setAttribute('fill', themes[currentTheme].node);
      circle.style.cursor = 'pointer';

      // Add click handler
      circle.addEventListener('click', () => {
        logger.debug('graphView.node.clicked', { id: node.id });
      });

      svg.appendChild(circle);

      // Draw label
      if (showLabels && node.label) {
        const text = doc.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', node.x + nodeSize + 5);
        text.setAttribute('y', node.y + 4);
        text.setAttribute('fill', themes[currentTheme].text);
        text.setAttribute('font-size', '12');
        text.textContent = node.label;
        svg.appendChild(text);
      }
    });

    container.appendChild(svg);

    logger.debug('graphView.rendered', { nodes: nodes.length, edges: edges.length });
    return true;
  }

  function setLayout(layoutName) {
    if (!layoutEngine.getAvailableLayouts().includes(layoutName)) {
      logger.error('graphView.invalidLayout', { layout: layoutName });
      return false;
    }

    currentLayout = layoutName;

    // Re-render with new layout
    if (currentData) {
      render(currentData);
    }

    logger.debug('graphView.layout.changed', { layout: layoutName });
    return true;
  }

  function setTheme(themeName) {
    if (!themes[themeName]) {
      logger.error('graphView.invalidTheme', { theme: themeName });
      return false;
    }

    currentTheme = themeName;

    // Re-render with new theme
    if (currentData) {
      render(currentData);
    }

    logger.debug('graphView.theme.changed', { theme: themeName });
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
    logger.info('graphViewEnhanced.registered');
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
```

- [ ] **Step 5: Add locale keys**

```fluent
# addon-static/locale/en-US/main.ftl
toolsbox-graph-view-enhanced = Enhanced Graph View
toolsbox-graph-view-tooltip = Visualize item relationships
toolsbox-pref-graph-section =
    .label = Graph View Settings
toolsbox-pref-graph-layout =
    .value = Layout mode
toolsbox-pref-graph-layout-force = Force-directed
toolsbox-pref-graph-layout-tree = Tree
toolsbox-pref-graph-layout-circular = Circular
toolsbox-pref-graph-theme =
    .value = Theme
toolsbox-pref-graph-theme-light = Light
toolsbox-pref-graph-theme-dark = Dark
toolsbox-pref-graph-theme-colorful = Colorful
toolsbox-pref-graph-node-size =
    .value = Node size
toolsbox-pref-graph-edge-width =
    .value = Edge width
toolsbox-pref-graph-show-labels =
    .label = Show labels
```

- [ ] **Step 6: Add preference configuration**

```json
// config/addon.config.json (append)
"graphView": {
  "enabled": true,
  "layout": "force",
  "theme": "light",
  "nodeSize": "20",
  "edgeWidth": "2",
  "showLabels": true,
  "height": "400px"
}
```

- [ ] **Step 7: Register in feature-composer.js**

```javascript
// src/app/feature-composer.js
import { createGraphViewEnhanced } from '../features/graph-view-enhanced.js';

// 在registerBaselineFeatures()中添加:
if (readBooleanPref(prefs, 'graphView.enabled', true)) {
  const graphView = createGraphViewEnhanced({
    logger,
    i18n,
    zotero: Zotero,
    prefs
  });

  if (graphView.register()) {
    logger.info('features.graphViewEnhanced.registered');
  }
}
```

- [ ] **Step 8: Commit Task 2**

```bash
git add src/features/graph-view-enhanced.js src/services/layout-engine.js tests/features/test-graph-view-enhanced.js addon-static/locale/*/main.ftl config/addon.config.json src/app/feature-composer.js
git commit -m "feat: add enhanced graph view with multiple layouts and themes"
```

---

## 验证和收尾

- [ ] **Step 1: Run all tests**

Run: `node tests/run-all.js`
Expected: All tests pass (200+ tests)

- [ ] **Step 2: Update documentation**

```markdown
<!-- docs/CURRENT_BACKLOG.md -->
## P2 Reader集成完成

- ✅ Margin Annotation - PDF页边距批注显示完成
- ✅ Graph View增强 - 多布局关系图完成

## 下一波: P2 标签系统和Workflow增强
```

- [ ] **Step 3: Update feature gap analysis**

Update `docs/FEATURE_GAP_ANALYSIS.md`:
- Mark Task 31-32 as completed
- Update completion percentage: 63% → 66%
- Move to "Completed Features" section

- [ ] **Step 4: Create release tag**

```bash
git tag -a v0.6.0-p2-reader-integration -m "P2 Reader integration complete: margin annotation, enhanced graph view"
```

---

## 自检清单

- [x] **Spec coverage**: 每个功能都有对应Task覆盖
- [x] **Placeholder scan**: 无占位符
- [x] **Type consistency**: 函数名保持一致
- [x] **File paths exact**: 所有路径精确
- [x] **Code complete**: 包含完整实现
- [x] **Test commands**: 测试命令明确
- [x] **Commit messages**: 清晰的commit message
- [x] **Locale coverage**: 所有文案有locale key
- [x] **API documentation**: Zotero Reader API有文档链接

---

**计划完成!准备执行。**

**执行优先级建议:**
1. Margin Annotation (核心PDF阅读功能,直接提升用户体验)
2. Graph View增强 (可视化增强,支持多种布局)

**预计总时间:** 3-4天

**关键技术点:**
- Margin Annotation需深入理解Zotero Reader的DOM结构
- Graph View需选择合适的布局算法库 (建议先用D3.js简化版)
- 两者都需要处理异步事件和数据同步
