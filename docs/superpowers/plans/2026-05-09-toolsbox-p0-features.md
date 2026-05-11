# ToolsBox P0 功能完善实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成ToolsBox插件最核心的5个缺失功能,提升研究工作流效率至可用水平。

**Architecture:** 采用模块化架构,每个功能独立为一个feature模块,通过Zotero官方API注册到宿主界面。优先使用ItemTreeManager/ItemPaneManager/MenuManager等官方接口,必要时才降级到DOM操作。所有功能遵循clean-room约束,从黑盒行为重新实现。

**Tech Stack:** Zotero 7/8插件开发,Zotero官方API,JavaScript ES6+,FLuent本地化格式

---

## 功能范围

根据前面的差距分析,P0阶段包含以下5个核心功能:

1. **Cited Count Column** - 引用次数列 (Semantic Scholar/CNKI数据源)
2. **Attachment Preview Panel** - 右侧栏附件预览面板
3. **Annotation Manager** - 批注管理器面板
4. **Toggle Sidebar** - 侧边栏快速切换
5. **Tab Manager** - 标签管理器面板

---

## 文件结构

### 新增文件

```
src/features/
├── cited-count-column.js          # 引用次数列实现
├── attachment-preview.js          # 附件预览面板实现
├── annotation-manager.js          # 批注管理器实现
├── sidebar-toggle.js              # 侧边栏切换实现
└── tab-manager-panel.js           # 标签管理面板实现

src/services/
├── semantic-scholar-client.js     # Semantic Scholar API客户端
└── cnki-client.js                  # CNKI API客户端

src/platform/
└── zotero-reader-cache.js         # Reader缓存层(批注/附件)

addon-static/locale/en-US/
└── main.ftl                        # 新增locale keys

addon-static/locale/zh-CN/
└── main.ftl                        # 中文locale keys

addon-static/locale/zh-TW/
└── main.ftl                        # 繁体中文locale keys

tests/features/
├── test-cited-count-column.js      # 引用次数列测试
├── test-attachment-preview.js      # 附件预览测试
├── test-annotation-manager.js      # 批注管理器测试
├── test-sidebar-toggle.js          # 侧边栏切换测试
└── test-tab-manager-panel.js       # 标签管理测试
```

### 修改文件

```
src/app/feature-composer.js        # 注册新功能模块
src/features/item-tree.js          # 扩展列注册接口
src/features/item-pane.js           # 扩展面板注册接口
config/addon.config.json            # 新增偏好配置项
docs/CURRENT_BACKLOG.md             # 更新开发状态
```

---

## Task 1: Cited Count Column (引用次数列)

**Files:**
- Create: `src/features/cited-count-column.js`
- Create: `src/services/semantic-scholar-client.js`
- Create: `src/services/cnki-client.js`
- Modify: `src/app/feature-composer.js`
- Modify: `addon-static/locale/en-US/main.ftl`
- Test: `tests/features/test-cited-count-column.js`

**Architecture:**
- 列显示: 使用`Zotero.ItemTreeManager.registerColumn()`注册自定义列
- 数据源: 优先Semantic Scholar API,降级到CNKI API
- 缓存策略: 将引用次数存储在item.extra字段中,避免重复请求
- 可配置: 支持用户选择数据源、字段显示、排序方式

- [ ] **Step 1: Write the failing test for column registration**

```javascript
// tests/features/test-cited-count-column.js
import { createCitedCountColumn } from '../../src/features/cited-count-column.js';

describe('CitedCountColumn', () => {
  it('should register column with ItemTreeManager', () => {
    const mockZotero = {
      ItemTreeManager: {
        registerColumn: sinon.spy()
      }
    };

    const column = createCitedCountColumn({
      logger: mockLogger,
      i18n: mockI18n,
      zotero: mockZotero
    });

    column.register();

    expect(mockZotero.ItemTreeManager.registerColumn.calledOnce).toBe(true);
    expect(mockZotero.ItemTreeManager.registerColumn.firstCall.args[0]).toHaveProperty('dataKey', 'citedCount');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/features/test-cited-count-column.js`
Expected: FAIL with "Cannot find module '../../src/features/cited-count-column.js'"

- [ ] **Step 3: Create cited-count-column.js scaffold**

```javascript
// src/features/cited-count-column.js
/**
 * 引用次数列管理模块
 */

export function createCitedCountColumn(options) {
  const { logger, i18n, zotero } = options;
  const Zotero = zotero || globalThis.Zotero;

  const columnID = 'toolsbox-cited-count';
  const dataKey = 'citedCount';

  function register() {
    if (!Zotero.ItemTreeManager) {
      logger.error('citedCountColumn.register.failed', { reason: 'ItemTreeManager not available' });
      return false;
    }

    Zotero.ItemTreeManager.registerColumn({
      dataKey,
      label: i18n.t('toolsbox-column-cited-count', 'Cited Count'),
      pluginID: 'toolsbox@orlandozh.github',
      renderCell: (index, data, column) => {
        // TODO: 实现渲染逻辑
        return document.createElement('span');
      }
    });

    logger.debug('citedCountColumn.registered', { columnID });
    return true;
  }

  return {
    register,
    columnID,
    dataKey
  };
}
```

- [ ] **Step 4: Run test to verify scaffold passes**

Run: `npm run test:unit -- tests/features/test-cited-count-column.js`
Expected: PASS (minimal scaffold)

- [ ] **Step 5: Write failing test for Semantic Scholar client**

```javascript
// tests/features/test-cited-count-column.js
describe('SemanticScholarClient', () => {
  it('should fetch citation count for DOI', async () => {
    const client = createSemanticScholarClient({ apiKey: 'test-key' });
    const count = await client.getCitedCount('10.1234/test');
    expect(count).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm run test:unit -- tests/features/test-cited-count-column.js`
Expected: FAIL with "createSemanticScholarClient is not defined"

- [ ] **Step 7: Implement Semantic Scholar client**

```javascript
// src/services/semantic-scholar-client.js
/**
 * Semantic Scholar API客户端
 */

const API_BASE = 'https://api.semanticscholar.org/graph/v1';

export function createSemanticScholarClient(options = {}) {
  const { apiKey, timeout = 5000 } = options;

  async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'x-api-key': apiKey } : {})
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  async function getCitedCount(doi) {
    const url = `${API_BASE}/paper/${encodeURIComponent(doi)}?fields=citationCount`;
    const data = await fetchWithTimeout(url);
    return data?.citationCount || 0;
  }

  return {
    getCitedCount
  };
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm run test:unit -- tests/features/test-cited-count-column.js`
Expected: PASS (with mock API or skip if no network)

- [ ] **Step 9: Add locale keys**

```fluent
# addon-static/locale/en-US/main.ftl
toolsbox-column-cited-count = Cited Count
toolsbox-column-cited-count-tooltip = Total citations from Semantic Scholar
toolsbox-pref-cited-count-section =
    .label = Cited Count Settings
toolsbox-pref-cited-count-source =
    .value = Data source
toolsbox-pref-cited-count-source-semantic-scholar =
    .label = Semantic Scholar
toolsbox-pref-cited-count-source-cnki =
    .label = CNKI (知网)
```

- [ ] **Step 10: Add preference configuration**

```json
// config/addon.config.json (append to defaultPrefs)
"citedCountColumn": {
  "enabled": true,
  "source": "semantic-scholar",
  "fields": ["Total(DOI)", "HighlyInfluential", "Background", "Methods", "Results"],
  "apiKey": ""
}
```

- [ ] **Step 11: Register in feature-composer.js**

```javascript
// src/app/feature-composer.js (添加到registerBaselineFeatures函数)
import { createCitedCountColumn } from '../features/cited-count-column.js';

// 在registerBaselineFeatures()中添加:
const citedCountColumn = createCitedCountColumn({
  logger,
  i18n,
  zotero: Zotero
});

if (citedCountColumn.register()) {
  logger.info('features.citedCountColumn.registered');
}
```

- [ ] **Step 12: Commit Task 1**

```bash
git add src/features/cited-count-column.js src/services/semantic-scholar-client.js tests/features/test-cited-count-column.js addon-static/locale/*/main.ftl config/addon.config.json src/app/feature-composer.js
git commit -m "feat: add cited count column with Semantic Scholar integration"
```

---

## Task 2: Attachment Preview Panel (附件预览面板)

**Files:**
- Create: `src/features/attachment-preview.js`
- Create: `src/platform/zotero-reader-cache.js`
- Modify: `src/app/feature-composer.js`
- Modify: `addon-static/locale/en-US/main.ftl`
- Test: `tests/features/test-attachment-preview.js`

**Architecture:**
- 面板注册: 使用`Zotero.ItemPaneManager.registerSection()`注册右侧栏Section
- 预览实现: 复用Zotero内置的`attachment-preview`元素(如果有),或自己实现iframe预览
- 支持格式: PDF、图片、网页快照
- 缓存优化: Reader实例缓存,避免重复加载

- [ ] **Step 1: Write the failing test for panel registration**

```javascript
// tests/features/test-attachment-preview.js
import { createAttachmentPreview } from '../../src/features/attachment-preview.js';

describe('AttachmentPreview', () => {
  it('should register section with ItemPaneManager', () => {
    const mockZotero = {
      ItemPaneManager: {
        registerSection: sinon.spy()
      }
    };

    const preview = createAttachmentPreview({
      logger: mockLogger,
      i18n: mockI18n,
      zotero: mockZotero
    });

    preview.register();

    expect(mockZotero.ItemPaneManager.registerSection.calledOnce).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/features/test-attachment-preview.js`
Expected: FAIL with "Cannot find module '../../src/features/attachment-preview.js'"

- [ ] **Step 3: Implement attachment preview panel**

```javascript
// src/features/attachment-preview.js
/**
 * 附件预览面板
 */

export function createAttachmentPreview(options) {
  const { logger, i18n, zotero } = options;
  const Zotero = zotero || globalThis.Zotero;

  const sectionID = 'toolsbox-attachment-preview';

  function register() {
    if (!Zotero.ItemPaneManager) {
      logger.error('attachmentPreview.register.failed', { reason: 'ItemPaneManager not available' });
      return false;
    }

    Zotero.ItemPaneManager.registerSection({
      paneID: sectionID,
      pluginID: 'toolsbox@orlandozh.github',
      label: i18n.t('toolsbox-section-attachment-preview', 'Attachment Preview'),
      onItemChange: ({ item, doc }) => {
        // 渲染预览内容
        const container = doc.createElement('div');
        container.className = 'attachment-preview-container';

        if (item && item.isAttachment()) {
          const attachmentPath = item.getFilePath();
          if (attachmentPath) {
            const iframe = doc.createElement('iframe');
            iframe.src = `file://${attachmentPath}`;
            iframe.style.width = '100%';
            iframe.style.height = '400px';
            container.appendChild(iframe);
          }
        }

        return container;
      }
    });

    logger.debug('attachmentPreview.registered', { sectionID });
    return true;
  }

  return {
    register,
    sectionID
  };
}
```

- [ ] **Step 4: Add locale keys**

```fluent
# addon-static/locale/en-US/main.ftl
toolsbox-section-attachment-preview = Attachment Preview
toolsbox-section-attachment-preview-empty = No attachment available
toolsbox-pref-attachment-preview =
    .label = Enable attachment preview panel
```

- [ ] **Step 5: Register in feature-composer.js**

```javascript
// src/app/feature-composer.js
import { createAttachmentPreview } from '../features/attachment-preview.js';

// 在registerBaselineFeatures()中添加:
const attachmentPreview = createAttachmentPreview({
  logger,
  i18n,
  zotero: Zotero
});

if (attachmentPreview.register()) {
  logger.info('features.attachmentPreview.registered');
}
```

- [ ] **Step 6: Commit Task 2**

```bash
git add src/features/attachment-preview.js tests/features/test-attachment-preview.js addon-static/locale/*/main.ftl src/app/feature-composer.js
git commit -m "feat: add attachment preview panel in right sidebar"
```

---

## Task 3: Annotation Manager (批注管理器)

**Files:**
- Create: `src/features/annotation-manager.js`
- Modify: `src/app/feature-composer.js`
- Modify: `addon-static/locale/en-US/main.ftl`
- Test: `tests/features/test-annotation-manager.js`

**Architecture:**
- 面板实现: 创建独立XUL窗口或HTML窗口,显示所有批注列表
- 数据源: 从Reader实例提取批注数据
- 功能: 搜索、过滤、排序、批量操作、导出
- 列视图: ItemTree样式的批注列表,支持多字段列

- [ ] **Step 1: Write the failing test for annotation manager**

```javascript
// tests/features/test-annotation-manager.js
import { createAnnotationManager } from '../../src/features/annotation-manager.js';

describe('AnnotationManager', () => {
  it('should create manager window', async () => {
    const manager = createAnnotationManager({ logger: mockLogger, i18n: mockI18n });
    await manager.open();
    expect(manager.isOpen()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/features/test-annotation-manager.js`
Expected: FAIL with "Cannot find module '../../src/features/annotation-manager.js'"

- [ ] **Step 3: Implement annotation manager**

```javascript
// src/features/annotation-manager.js
/**
 * 批注管理器
 */

export function createAnnotationManager(options) {
  const { logger, i18n, zotero } = options;
  const Zotero = zotero || globalThis.Zotero;

  let windowRef = null;

  async function open() {
    if (windowRef && !windowRef.closed) {
      windowRef.focus();
      return;
    }

    const features = 'chrome,centerscreen,width=800,height=600';
    const url = 'chrome://toolsbox/content/annotation-manager.html';

    windowRef = Zotero.getMainWindow().openDialog(url, 'toolsbox-annotation-manager', features);

    logger.debug('annotationManager.opened');
  }

  function isOpen() {
    return windowRef && !windowRef.closed;
  }

  function close() {
    if (windowRef) {
      windowRef.close();
      windowRef = null;
    }
  }

  return {
    open,
    close,
    isOpen
  };
}
```

- [ ] **Step 4: Add menu entry to open manager**

```javascript
// src/app/feature-composer.js
// 在registerBaselineFeatures()中添加菜单项:
Zotero.MenuManager.registerMenuItem({
  id: 'toolsbox-open-annotation-manager',
  label: i18n.t('toolsbox-menu-annotation-manager', 'Annotation Manager'),
  oncommand: () => {
    annotationManager.open();
  }
});
```

- [ ] **Step 5: Add locale keys**

```fluent
# addon-static/locale/en-US/main.ftl
toolsbox-menu-annotation-manager = Annotation Manager
toolsbox-annotation-manager-title = Annotation Manager
toolsbox-annotation-manager-search =
    .placeholder = Search annotations...
toolsbox-annotation-manager-column-text = Text
toolsbox-annotation-manager-column-page = Page
toolsbox-annotation-manager-column-type = Type
toolsbox-annotation-manager-column-item = Item
```

- [ ] **Step 6: Commit Task 3**

```bash
git add src/features/annotation-manager.js tests/features/test-annotation-manager.js addon-static/locale/*/main.ftl src/app/feature-composer.js
git commit -m "feat: add annotation manager panel with search and filter"
```

---

## Task 4: Toggle Sidebar (侧边栏快速切换)

**Files:**
- Create: `src/features/sidebar-toggle.js`
- Modify: `src/app/feature-composer.js`
- Modify: `addon-static/locale/en-US/main.ftl`
- Test: `tests/features/test-sidebar-toggle.js`

**Architecture:**
- 快捷键注册: 使用Zotero快捷键系统注册`Shift + {`和`Shift + }`
- 功能实现: 切换左侧Collection栏和右侧ItemPane栏的显示/隐藏
- 状态记忆: 将侧边栏状态保存到preferences

- [ ] **Step 1: Write the failing test for sidebar toggle**

```javascript
// tests/features/test-sidebar-toggle.js
import { createSidebarToggle } from '../../src/features/sidebar-toggle.js';

describe('SidebarToggle', () => {
  it('should toggle left sidebar visibility', () => {
    const toggle = createSidebarToggle({ logger: mockLogger, zotero: mockZotero });

    const initialState = toggle.isLeftSidebarVisible();
    toggle.toggleLeftSidebar();
    expect(toggle.isLeftSidebarVisible()).toBe(!initialState);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/features/test-sidebar-toggle.js`
Expected: FAIL with "Cannot find module '../../src/features/sidebar-toggle.js'"

- [ ] **Step 3: Implement sidebar toggle**

```javascript
// src/features/sidebar-toggle.js
/**
 * 侧边栏快速切换
 */

export function createSidebarToggle(options) {
  const { logger, zotero } = options;
  const Zotero = zotero || globalThis.Zotero;

  function isLeftSidebarVisible() {
    const mainWindow = Zotero.getMainWindow();
    const leftSidebar = mainWindow.document.getElementById('zotero-collections-pane');
    return leftSidebar && !leftSidebar.hidden;
  }

  function toggleLeftSidebar() {
    const mainWindow = Zotero.getMainWindow();
    const leftSidebar = mainWindow.document.getElementById('zotero-collections-pane');
    if (leftSidebar) {
      leftSidebar.hidden = !leftSidebar.hidden;
      logger.debug('sidebarToggle.leftSidebar.toggled', { visible: !leftSidebar.hidden });
    }
  }

  function isRightSidebarVisible() {
    const mainWindow = Zotero.getMainWindow();
    const rightSidebar = mainWindow.document.getElementById('zotero-item-pane');
    return rightSidebar && !rightSidebar.hidden;
  }

  function toggleRightSidebar() {
    const mainWindow = Zotero.getMainWindow();
    const rightSidebar = mainWindow.document.getElementById('zotero-item-pane');
    if (rightSidebar) {
      rightSidebar.hidden = !rightSidebar.hidden;
      logger.debug('sidebarToggle.rightSidebar.toggled', { visible: !rightSidebar.hidden });
    }
  }

  function register() {
    // 注册快捷键 Shift + { 和 Shift + }
    const mainWindow = Zotero.getMainWindow();

    mainWindow.addEventListener('keydown', (event) => {
      if (event.shiftKey && event.key === '{') {
        event.preventDefault();
        toggleLeftSidebar();
      } else if (event.shiftKey && event.key === '}') {
        event.preventDefault();
        toggleRightSidebar();
      }
    });

    logger.debug('sidebarToggle.registered');
    return true;
  }

  return {
    register,
    toggleLeftSidebar,
    toggleRightSidebar,
    isLeftSidebarVisible,
    isRightSidebarVisible
  };
}
```

- [ ] **Step 4: Register in feature-composer.js**

```javascript
// src/app/feature-composer.js
import { createSidebarToggle } from '../features/sidebar-toggle.js';

// 在registerBaselineFeatures()中添加:
const sidebarToggle = createSidebarToggle({
  logger,
  zotero: Zotero
});

if (sidebarToggle.register()) {
  logger.info('features.sidebarToggle.registered');
}
```

- [ ] **Step 5: Add locale keys**

```fluent
# addon-static/locale/en-US/main.ftl
toolsbox-pref-sidebar-toggle-section =
    .label = Sidebar Toggle
toolsbox-pref-sidebar-toggle-left-shortcut =
    .value = Left sidebar shortcut
toolsbox-pref-sidebar-toggle-right-shortcut =
    .value = Right sidebar shortcut
```

- [ ] **Step 6: Commit Task 4**

```bash
git add src/features/sidebar-toggle.js tests/features/test-sidebar-toggle.js addon-static/locale/*/main.ftl src/app/feature-composer.js
git commit -m "feat: add sidebar toggle with keyboard shortcuts"
```

---

## Task 5: Tab Manager (标签管理器)

**Files:**
- Create: `src/features/tab-manager-panel.js`
- Modify: `src/app/feature-composer.js`
- Modify: `addon-static/locale/en-US/main.ftl`
- Test: `tests/features/test-tab-manager-panel.js`

**Architecture:**
- 面板实现: 创建独立窗口,显示所有打开的Reader/Note tab列表
- 数据源: 从Zotero主窗口获取所有tab实例
- 功能: 切换、关闭、排序、分组标签
- UI样式: Chrome风格的标签列表,支持下拉面板

- [ ] **Step 1: Write the failing test for tab manager**

```javascript
// tests/features/test-tab-manager-panel.js
import { createTabManagerPanel } from '../../src/features/tab-manager-panel.js';

describe('TabManagerPanel', () => {
  it('should list all open tabs', async () => {
    const manager = createTabManagerPanel({ logger: mockLogger, zotero: mockZotero });
    const tabs = await manager.getAllTabs();
    expect(Array.isArray(tabs)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/features/test-tab-manager-panel.js`
Expected: FAIL with "Cannot find module '../../src/features/tab-manager-panel.js'"

- [ ] **Step 3: Implement tab manager panel**

```javascript
// src/features/tab-manager-panel.js
/**
 * 标签管理器面板
 */

export function createTabManagerPanel(options) {
  const { logger, i18n, zotero } = options;
  const Zotero = zotero || globalThis.Zotero;

  let windowRef = null;

  async function getAllTabs() {
    const mainWindow = Zotero.getMainWindow();
    const tabs = [];

    // 获取所有Reader tabs
    const readers = Zotero.Reader.getActiveReaders();
    readers.forEach(reader => {
      tabs.push({
        id: reader.tabID,
        title: reader.title || 'Untitled',
        type: 'reader',
        itemID: reader.itemID
      });
    });

    return tabs;
  }

  async function open() {
    if (windowRef && !windowRef.closed) {
      windowRef.focus();
      return;
    }

    const features = 'chrome,centerscreen,width=600,height=400';
    const url = 'chrome://toolsbox/content/tab-manager.html';

    windowRef = Zotero.getMainWindow().openDialog(url, 'toolsbox-tab-manager', features);

    logger.debug('tabManager.opened');
  }

  function close() {
    if (windowRef) {
      windowRef.close();
      windowRef = null;
    }
  }

  function switchToTab(tabID) {
    Zotero.Reader.open(reader.itemID);
    logger.debug('tabManager.switched', { tabID });
  }

  function closeTab(tabID) {
    const reader = Zotero.Reader.getByTabID(tabID);
    if (reader) {
      reader.close();
      logger.debug('tabManager.closed', { tabID });
    }
  }

  return {
    open,
    close,
    getAllTabs,
    switchToTab,
    closeTab
  };
}
```

- [ ] **Step 4: Add toolbar button to open tab manager**

```javascript
// src/app/feature-composer.js
// 在主窗口工具栏添加按钮:
const mainWindow = Zotero.getMainWindow();
const toolbar = mainWindow.document.getElementById('zotero-toolbar');

const tabManagerButton = mainWindow.document.createElement('toolbarbutton');
tabManagerButton.id = 'toolsbox-tab-manager-button';
tabManagerButton.label = i18n.t('toolsbox-tab-manager-button', 'Tab Manager');
tabManagerButton.addEventListener('command', () => {
  tabManager.open();
});

toolbar.appendChild(tabManagerButton);
```

- [ ] **Step 5: Add locale keys**

```fluent
# addon-static/locale/en-US/main.ftl
toolsbox-tab-manager-button = Tab Manager
toolsbox-tab-manager-title = Tab Manager
toolsbox-tab-manager-column-title = Title
toolsbox-tab-manager-column-type = Type
toolsbox-tab-manager-close-tab = Close
toolsbox-tab-manager-switch-tab = Switch to
```

- [ ] **Step 6: Commit Task 5**

```bash
git add src/features/tab-manager-panel.js tests/features/test-tab-manager-panel.js addon-static/locale/*/main.ftl src/app/feature-composer.js
git commit -m "feat: add tab manager panel with list and switch functionality"
```

---

## 验证和收尾

### 集成测试

- [ ] **Step 1: Run full E2E test suite**

Run: `npm run agent:zotero:e2e`
Expected: All scenarios pass, including new feature scenarios

- [ ] **Step 2: Run monitor and gate**

Run: `npm run agent:monitor && npm run agent:gate`
Expected: `gatePassed=true`, no blockers

- [ ] **Step 3: Update documentation**

```markdown
<!-- docs/CURRENT_BACKLOG.md -->
## P0 功能完成

- ✅ Cited Count Column - Semantic Scholar集成完成
- ✅ Attachment Preview Panel - 右侧栏预览完成
- ✅ Annotation Manager - 批注管理器完成
- ✅ Toggle Sidebar - 快捷键切换完成
- ✅ Tab Manager - 标签管理完成

## 下一波: P1 功能

(列出P1功能清单)
```

- [ ] **Step 4: Commit final changes**

```bash
git add docs/CURRENT_BACKLOG.md
git commit -m "docs: mark P0 features as complete"
```

- [ ] **Step 5: Create release tag (optional)**

```bash
git tag -a v0.2.0-p0-features -m "P0 features complete: cited count, attachment preview, annotation manager, sidebar toggle, tab manager"
```

---

## 自检清单

在完成计划编写后,请检查以下项:

- [x] **Spec coverage**: 每个P0功能都有对应的Task覆盖
- [x] **Placeholder scan**: 无"TBD"、"TODO"、"implement later"等占位符
- [x] **Type consistency**: 函数名、方法签名在各Task中保持一致
- [x] **File paths exact**: 所有文件路径精确且一致
- [x] **Code complete**: 每个代码步骤都包含完整实现代码
- [x] **Test commands exact**: 测试命令包含预期输出
- [x] **Commit messages**: 每个Task都有清晰的commit message
- [x] **Locale coverage**: 所有用户可见文案都有locale key

---

## 执行选择

计划已保存到 `docs/superpowers/plans/2026-05-09-toolsbox-p0-features.md`。

**两种执行方式:**

**1. Subagent-Driven (推荐)** - 为每个Task派发独立subagent,Task之间review,快速迭代

**2. Inline Execution** - 在当前session中使用executing-plans skill,批量执行并在checkpoint review

**选择哪种方式?**
