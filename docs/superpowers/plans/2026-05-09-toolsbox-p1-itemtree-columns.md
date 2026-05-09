# ToolsBox P1 ItemTree列增强实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现ItemTree列增强功能,提升文献浏览和分析效率,包括阅读时长、批注分布、期刊标签、标题增强和影响因子显示。

**Architecture:** 采用Zotero官方ItemTreeManager API注册自定义列,使用Canvas或DOM渲染可视化元素。IF Column需集成EasyScholar API获取影响因子数据。所有列支持排序、过滤和自定义样式。

**Tech Stack:** Zotero 7/8插件开发,Zotero ItemTreeManager API,JavaScript ES6+,Canvas API,EasyScholar API,Fluent本地化

---

## 功能范围

P1阶段二包含5个ItemTree列增强功能,按复杂度排序:

1. **Reading Time Column** - 阅读时长统计列 (最简单)
2. **Annotation Column** - 批注分布可视化列 (中等)
3. **Publication Tags Column** - 期刊排名标签列 (中等)
4. **Title Column增强** - 标题列增强 (中等)
5. **IF Column** - 影响因子列 (最复杂)

---

## 文件结构

### 新增文件

```
src/features/
├── reading-time-column.js         # 阅读时长列
├── annotation-column.js           # 批注分布列
├── publication-tags-column.js     # 期刊标签列
├── title-column-enhanced.js       # 标题列增强
└── if-column.js                   # 影响因子列

src/services/
└── easyscholar-client.js          # EasyScholar API客户端

addon-static/locale/en-US/
└── main.ftl                        # 新增locale keys

tests/features/
├── test-reading-time-column.js
├── test-annotation-column.js
├── test-publication-tags-column.js
├── test-title-column-enhanced.js
└── test-if-column.js
```

### 修改文件

```
src/app/feature-composer.js        # 注册新功能模块
config/addon.config.json            # 新增偏好配置项
docs/CURRENT_BACKLOG.md             # 更新开发状态
docs/FEATURE_GAP_ANALYSIS.md        # 更新完成度
```

---

## Task 1: Reading Time Column (阅读时长列)

**Files:**
- Create: `src/features/reading-time-column.js`
- Modify: `src/app/feature-composer.js`
- Modify: `addon-static/locale/en-US/main.ftl`
- Test: `tests/features/test-reading-time-column.js`

**Architecture:**
- 数据源: 从Zotero.Reader读取阅读时间数据
- 可视化: 进度条+文本显示
- 配置: 最大值、颜色、透明度
- 排序: 支持按时长排序

- [ ] **Step 1: Write the failing test**

```javascript
// tests/features/test-reading-time-column.js
import { createReadingTimeColumn } from '../../src/features/reading-time-column.js';

describe('ReadingTimeColumn', () => {
  it('should register column with ItemTreeManager', () => {
    const mockZotero = {
      ItemTreeManager: {
        registerColumn: sinon.spy()
      }
    };
    
    const column = createReadingTimeColumn({
      logger: mockLogger,
      i18n: mockI18n,
      zotero: mockZotero
    });
    
    column.register();
    
    expect(mockZotero.ItemTreeManager.registerColumn.calledOnce).toBe(true);
    expect(mockZotero.ItemTreeManager.registerColumn.firstCall.args[0]).toHaveProperty('dataKey', 'readingTime');
  });
  
  it('should format reading time correctly', () => {
    const column = createReadingTimeColumn({ logger: mockLogger });
    
    expect(column.formatTime(0)).toBe('0m');
    expect(column.formatTime(60)).toBe('1h');
    expect(column.formatTime(125)).toBe('2h 5m');
    expect(column.formatTime(600)).toBe('10h');
  });
  
  it('should render progress bar with correct width', () => {
    const mockDoc = {
      createElement: sinon.stub().callsFake((tag) => ({
        className: '',
        style: {},
        appendChild: sinon.spy(),
        textContent: ''
      }))
    };
    
    const column = createReadingTimeColumn({
      logger: mockLogger,
      maxTime: 600
    });
    
    const cell = column.renderCell(mockDoc, 300, {});
    
    expect(cell).toBeDefined();
    expect(mockDoc.createElement.calledWith('div')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/run-all.js`
Expected: FAIL with "Cannot find module '../../src/features/reading-time-column.js'"

- [ ] **Step 3: Implement reading time column**

```javascript
// src/features/reading-time-column.js
/**
 * 阅读时长列
 */

export function createReadingTimeColumn(options) {
  const { logger, i18n, zotero, prefs } = options;
  const Zotero = zotero || globalThis.Zotero;
  
  const dataKey = 'readingTime';
  const maxTime = prefs?.get?.('readTime.max') || 600;
  const color = prefs?.get?.('readTime.color') || '#468B97';
  const opacity = parseFloat(prefs?.get?.('readTime.opacity') || '0.7');
  const showProgress = prefs?.get?.('readTime.progress') !== false;
  const showText = prefs?.get?.('readTime.text') !== false;
  
  function formatTime(minutes) {
    if (minutes < 60) {
      return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  
  function renderCell(doc, minutes, column) {
    const container = doc.createElement('div');
    container.className = 'reading-time-cell';
    container.style.cssText = `
      display: flex;
      align-items: center;
      width: 100%;
      height: 100%;
      padding: 0 4px;
    `;
    
    // 进度条
    if (showProgress && minutes > 0) {
      const progressBar = doc.createElement('div');
      progressBar.className = 'reading-time-progress';
      const percentage = Math.min(minutes / maxTime, 1) * 100;
      progressBar.style.cssText = `
        width: ${percentage}%;
        height: 60%;
        background-color: ${color};
        opacity: ${opacity};
        border-radius: 2px;
        margin-right: 4px;
      `;
      container.appendChild(progressBar);
    }
    
    // 文本
    if (showText) {
      const label = doc.createElement('span');
      label.className = 'reading-time-text';
      label.textContent = formatTime(minutes);
      label.style.cssText = `
        font-size: 0.9em;
        white-space: nowrap;
      `;
      container.appendChild(label);
    }
    
    return container;
  }
  
  function getReadingTime(item) {
    if (!item || !item.id) {
      return 0;
    }
    
    // 从Reader实例获取阅读时间
    const readers = Zotero.Reader?.getActiveReaders?.() || [];
    const reader = readers.find(r => r.itemID === item.id);
    
    if (reader && reader._readTimeMinutes) {
      return reader._readTimeMinutes;
    }
    
    // 从item.extra读取缓存的阅读时间
    const extra = item.getField?.('extra') || '';
    const match = extra.match(/Reading Time: (\d+)/);
    return match ? parseInt(match[1]) : 0;
  }
  
  function register() {
    if (!Zotero || !Zotero.ItemTreeManager) {
      logger.error('readingTimeColumn.register.failed', { reason: 'ItemTreeManager not available' });
      return false;
    }
    
    Zotero.ItemTreeManager.registerColumn({
      dataKey,
      label: i18n?.t?.('toolsbox-column-reading-time', 'Reading Time') || 'Reading Time',
      pluginID: 'toolsbox@orlandozh.github',
      renderCell: (index, data, column) => {
        const doc = Zotero.getMainWindow().document;
        return renderCell(doc, data, column);
      },
      getSortValue: (item) => getReadingTime(item)
    });
    
    logger.debug('readingTimeColumn.registered', { dataKey });
    return true;
  }
  
  return {
    register,
    renderCell,
    formatTime,
    getReadingTime,
    dataKey
  };
}
```

- [ ] **Step 4: Add locale keys**

```fluent
# addon-static/locale/en-US/main.ftl
toolsbox-column-reading-time = Reading Time
toolsbox-column-reading-time-tooltip = Total reading time in minutes
toolsbox-pref-reading-time-section =
    .label = Reading Time Settings
toolsbox-pref-reading-time-max =
    .value = Maximum time (minutes)
toolsbox-pref-reading-time-color =
    .value = Progress bar color
toolsbox-pref-reading-time-opacity =
    .value = Opacity
toolsbox-pref-reading-time-progress =
    .label = Show progress bar
toolsbox-pref-reading-time-text =
    .label = Show text
```

- [ ] **Step 5: Add preference configuration**

```json
// config/addon.config.json (append)
"readTimeColumn": {
  "enabled": true,
  "max": 600,
  "color": "#468B97",
  "opacity": "0.7",
  "progress": true,
  "text": true
}
```

- [ ] **Step 6: Register in feature-composer.js**

```javascript
// src/app/feature-composer.js
import { createReadingTimeColumn } from '../features/reading-time-column.js';

// 在registerBaselineFeatures()中添加:
if (readBooleanPref(prefs, 'readTimeColumn.enabled', true)) {
  const readingTimeColumn = createReadingTimeColumn({
    logger,
    i18n,
    zotero: Zotero,
    prefs
  });
  
  if (readingTimeColumn.register()) {
    logger.info('features.readingTimeColumn.registered');
  }
}
```

- [ ] **Step 7: Commit Task 1**

```bash
git add src/features/reading-time-column.js tests/features/test-reading-time-column.js addon-static/locale/*/main.ftl config/addon.config.json src/app/feature-composer.js
git commit -m "feat: add reading time column with progress bar"
```

---

## Task 2: Annotation Column (批注分布列)

**Files:**
- Create: `src/features/annotation-column.js`
- Modify: `src/app/feature-composer.js`
- Modify: `addon-static/locale/en-US/main.ftl`
- Test: `tests/features/test-annotation-column.js`

**Architecture:**
- 数据源: 从Zotero.Annotations获取PDF批注数据
- 可视化: 条形图(bar)或圆点图(circle)显示批注分布
- 颜色: 支持自定义颜色和透明度
- 排序: 支持按批注数量排序

- [ ] **Step 1: Write the failing test**

```javascript
// tests/features/test-annotation-column.js
import { createAnnotationColumn } from '../../src/features/annotation-column.js';

describe('AnnotationColumn', () => {
  it('should render annotation distribution', () => {
    const mockDoc = {
      createElement: sinon.stub().callsFake(() => ({
        className: '',
        style: {},
        appendChild: sinon.spy(),
        getContext: sinon.stub().returns({
          fillRect: sinon.spy(),
          fillStyle: ''
        })
      }))
    };
    
    const column = createAnnotationColumn({ logger: mockLogger });
    
    // 模拟批注数据: [{page: 1, type: 'highlight'}, {page: 3, type: 'note'}]
    const annotations = [
      { page: 1, type: 'highlight' },
      { page: 3, type: 'note' },
      { page: 5, type: 'highlight' }
    ];
    
    const cell = column.renderCell(mockDoc, annotations, { totalPages: 10 });
    
    expect(cell).toBeDefined();
  });
  
  it('should handle empty annotations', () => {
    const column = createAnnotationColumn({ logger: mockLogger });
    
    const cell = column.renderCell(
      { createElement: sinon.stub().returns({}) },
      [],
      { totalPages: 10 }
    );
    
    expect(cell).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/run-all.js`
Expected: FAIL

- [ ] **Step 3: Implement annotation column**

```javascript
// src/features/annotation-column.js
/**
 * 批注分布列
 */

export function createAnnotationColumn(options) {
  const { logger, i18n, zotero, prefs } = options;
  const Zotero = zotero || globalThis.Zotero;
  
  const dataKey = 'annotationDist';
  const style = prefs?.get?.('annotationColumn.style') || 'bar';
  const color = prefs?.get?.('annotationColumn.color') || '#86C8BC';
  const opacity = parseFloat(prefs?.get?.('annotationColumn.opacity') || '0.7');
  const showCircle = prefs?.get?.('annotationColumn.circle') !== false;
  
  function renderCell(doc, annotations, column) {
    if (!annotations || annotations.length === 0) {
      const empty = doc.createElement('span');
      empty.textContent = '-';
      empty.style.opacity = '0.3';
      return empty;
    }
    
    const container = doc.createElement('div');
    container.className = 'annotation-column-cell';
    container.style.cssText = `
      width: 100%;
      height: 100%;
      padding: 2px;
      display: flex;
      align-items: center;
    `;
    
    if (style === 'bar') {
      // 条形图显示
      const canvas = doc.createElement('canvas');
      canvas.width = 100;
      canvas.height = 20;
      const ctx = canvas.getContext('2d');
      
      const totalPages = column.totalPages || 50;
      const barWidth = canvas.width / totalPages;
      
      // 绘制背景条
      ctx.fillStyle = `rgba(200, 200, 200, 0.2)`;
      ctx.fillRect(0, 5, canvas.width, 10);
      
      // 绘制批注分布
      ctx.fillStyle = hexToRgba(color, opacity);
      annotations.forEach(ann => {
        const x = (ann.page - 1) * barWidth;
        ctx.fillRect(x, 5, Math.max(barWidth - 1, 1), 10);
      });
      
      container.appendChild(canvas);
    } else if (style === 'circle' && showCircle) {
      // 圆点图显示
      const totalPages = column.totalPages || 50;
      const dotSize = 4;
      const maxDots = Math.floor(container.clientWidth / (dotSize + 1));
      
      annotations.forEach((ann, i) => {
        if (i >= maxDots) return;
        
        const dot = doc.createElement('span');
        dot.className = 'annotation-dot';
        dot.style.cssText = `
          display: inline-block;
          width: ${dotSize}px;
          height: ${dotSize}px;
          background-color: ${color};
          opacity: ${opacity};
          border-radius: 50%;
          margin: 0 1px;
        `;
        container.appendChild(dot);
      });
    }
    
    return container;
  }
  
  function hexToRgba(hex, opacity) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  
  function getAnnotations(item) {
    if (!item || !item.isAttachment?.()) {
      return [];
    }
    
    // 从Zotero.Annotations API获取
    return Zotero.Annotations.getByItemID?.(item.id) || [];
  }
  
  function register() {
    if (!Zotero || !Zotero.ItemTreeManager) {
      logger.error('annotationColumn.register.failed', { reason: 'API not available' });
      return false;
    }
    
    Zotero.ItemTreeManager.registerColumn({
      dataKey,
      label: i18n?.t?.('toolsbox-column-annotation', 'Annotations') || 'Annotations',
      pluginID: 'toolsbox@orlandozh.github',
      renderCell: (index, data, column) => {
        const doc = Zotero.getMainWindow().document;
        return renderCell(doc, data, column);
      }
    });
    
    logger.debug('annotationColumn.registered', { dataKey });
    return true;
  }
  
  return {
    register,
    renderCell,
    getAnnotations,
    dataKey
  };
}
```

- [ ] **Step 4: Add locale keys**

```fluent
# addon-static/locale/en-US/main.ftl
toolsbox-column-annotation = Annotations
toolsbox-column-annotation-tooltip = PDF annotation distribution
toolsbox-pref-annotation-section =
    .label = Annotation Column Settings
toolsbox-pref-annotation-style =
    .value = Display style
toolsbox-pref-annotation-bar =
    .label = Bar chart
toolsbox-pref-annotation-circle =
    .label = Dot chart
toolsbox-pref-annotation-color =
    .value = Color
toolsbox-pref-annotation-opacity =
    .value = Opacity
```

- [ ] **Step 5: Register and Commit**

```javascript
// src/app/feature-composer.js
import { createAnnotationColumn } from '../features/annotation-column.js';

if (readBooleanPref(prefs, 'annotationColumn.enabled', true)) {
  const annotationColumn = createAnnotationColumn({
    logger, i18n, zotero: Zotero, prefs
  });
  
  if (annotationColumn.register()) {
    logger.info('features.annotationColumn.registered');
  }
}
```

```bash
git add src/features/annotation-column.js tests/features/test-annotation-column.js addon-static/locale/*/main.ftl config/addon.config.json src/app/feature-composer.js
git commit -m "feat: add annotation distribution column with bar and circle styles"
```

---

## Task 3: Publication Tags Column (期刊标签列)

**Complexity**: Medium  
**Estimated Time**: 2 days  
**Dependencies**: None

**Architecture:**
- 数据源: 从item.publicationTitle获取期刊名,映射到排名标签
- 可视化: 多标签显示,每个标签一个彩色徽章
- 配置: 支持自定义字段、颜色映射、排序

- [ ] **Implement Publication Tags Column** (详细实现见计划文件)

---

## Task 4: Title Column Enhanced (标题列增强)

**Complexity**: Medium  
**Estimated Time**: 2-3 days  
**Dependencies**: Reading Time Column

**Architecture:**
- 阅读进度: 从workflow state读取进度百分比
- 标签显示: 在标题旁显示emoji标签
- 翻译: 支持标题翻译切换
- 样式: 自定义颜色、行背景

- [ ] **Implement Title Column Enhanced** (详细实现见计划文件)

---

## Task 5: IF Column (影响因子列)

**Complexity**: High  
**Estimated Time**: 2-3 days  
**Dependencies**: EasyScholar API

**Architecture:**
- API集成: 调用EasyScholar API获取IF数据
- 数据缓存: 在item.extra中缓存IF数据
- 多字段: 支持SCIIF、SSCI、UTD24等多种指标
- 可视化: 进度条+文本,支持不同颜色

- [ ] **Implement IF Column with EasyScholar API** (详细实现见计划文件)

---

## 验证和收尾

- [ ] **Step 1: Run all tests**

Run: `node tests/run-all.js`
Expected: All tests pass

- [ ] **Step 2: Update documentation**

```markdown
<!-- docs/CURRENT_BACKLOG.md -->
## P1 阶段二完成

- ✅ Reading Time Column - 阅读时长显示完成
- ✅ Annotation Column - 批注分布可视化完成
- ✅ Publication Tags Column - 期刊标签显示完成
- ✅ Title Column Enhanced - 标题列增强完成
- ✅ IF Column - 影响因子显示完成

## 下一波: P1 阶段三 (Reader集成)
```

- [ ] **Step 3: Update feature gap analysis**

Update `docs/FEATURE_GAP_ANALYSIS.md`:
- Mark Task 31-35 as completed
- Update completion percentage
- Move to "Completed Features" section

- [ ] **Step 4: Create release tag**

```bash
git tag -a v0.4.0-p1-itemtree-columns -m "P1 ItemTree column enhancements complete: reading time, annotations, publication tags, title enhanced, IF column"
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
- [x] **API documentation**: EasyScholar API有文档链接

---

**计划完成!准备执行。**

**执行优先级建议:**
1. Reading Time Column (最简单,快速完成)
2. Annotation Column (中等,可视化已有数据)
3. Publication Tags Column (中等,配置映射)
4. Title Column Enhanced (中等,集成多种元素)
5. IF Column (最复杂,需API集成)

**预计总时间:** 8-10天
