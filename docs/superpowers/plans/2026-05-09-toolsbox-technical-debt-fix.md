# ToolsBox 技术债务修复计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development

**Goal:** 修复P0功能的严重问题,补充测试覆盖,统一代码规范,为后续P1开发打好基础。

**Architecture:** 保持现有factory pattern,修复renderCell实现,替换console.log为logger,统一API命名。

**Tech Stack:** Zotero 7/8,Logger API,Test Framework,JavaScript ES6+

---

## 问题清单

根据代码审查发现的严重问题:

### 🔴 P0严重问题
1. **cited-count-column.js renderCell空实现** - 不显示任何内容
2. **缺少单元测试** - P0/P1功能零测试覆盖
3. **console.log违规** - 违反Zotero专项规则

### 🟡 P0次要问题
4. **API命名不一致** - register() vs enable()
5. **未使用doc参数** - sidebar-toggle直接用document
6. **中文注释混杂** - 影响国际化

---

## Task 1: 修复cited-count-column.js renderCell

**Files:**
- Modify: `src/features/cited-count-column.js`
- Test: `tests/features/test-cited-count-column.js`

**问题:** renderCell返回空span,不显示引用次数

**修复目标:** 实现完整的渲染逻辑,显示引用次数,支持排序

- [ ] **Step 1: 分析当前实现**

当前代码:
```javascript
// src/features/cited-count-column.js (line 23-26)
renderCell: (index, data, column) => {
  const cell = document.createElement('span');
  return cell;  // ❌ 空实现!
}
```

**根本问题:**
- 没有textContent赋值
- 没有获取item的引用次数数据
- 没有排序支持

- [ ] **Step 2: 读取Semantic Scholar数据**

```javascript
// 添加dataProvider实现
dataProvider: (item, dataKey) => {
  if (!item || !item.id) return '0';

  // 从item.extra读取缓存数据
  const extra = item.getField?.('extra') || '';
  const match = extra.match(/Cited Count: (\d+)/);

  if (match) {
    return match[1]; // 返回字符串用于排序
  }

  // 无数据时返回0
  return '0';
},
```

- [ ] **Step 3: 实现完整renderCell**

```javascript
renderCell: (index, data, column) => {
  const doc = Zotero.getMainWindow().document;

  const cell = doc.createElement('div');
  cell.className = `cell ${column.className}`;
  cell.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  `;

  // 显示引用次数
  const count = doc.createElement('span');
  count.textContent = data || '0';
  count.style.cssText = `
    font-size: 0.9em;
    opacity: 0.8;
  `;

  cell.appendChild(count);

  // 如果引用次数大于10,添加高亮样式
  if (parseInt(data) > 10) {
    cell.style.fontWeight = 'bold';
    cell.style.color = '#4682B4';
  }

  return cell;
},
```

- [ ] **Step 4: 添加排序支持**

```javascript
// 在registerColumn配置中添加
sortReverse: false,  // 默认升序
getSortValue: (item) => {
  return parseInt(dataProvider(item, 'citedCount')) || 0;
}
```

- [ ] **Step 5: 更新完整代码**

完整修复后的cited-count-column.js:
```javascript
// src/features/cited-count-column.js
export function createCitedCountColumn(options) {
  const { logger, i18n, zotero, prefs } = options;
  const Zotero = zotero || globalThis.Zotero;

  const columnID = 'toolsbox-cited-count';
  const dataKey = 'citedCount';

  function dataProvider(item, dataKey) {
    if (!item || !item.id) return '0';

    const extra = item.getField?.('extra') || '';
    const match = extra.match(/Cited Count: (\d+)/);

    return match ? match[1] : '0';
  }

  function renderCell(index, data, column) {
    const doc = Zotero.getMainWindow().document;

    const cell = doc.createElement('div');
    cell.className = `cell ${column.className}`;
    cell.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
    `;

    const count = doc.createElement('span');
    count.textContent = data || '0';
    count.style.cssText = `
      font-size: 0.9em;
      opacity: 0.8;
    `;

    cell.appendChild(count);

    if (parseInt(data) > 10) {
      cell.style.fontWeight = 'bold';
      cell.style.color = '#4682B4';
    }

    return cell;
  }

  function register() {
    if (!Zotero.ItemTreeManager) {
      logger.error('citedCountColumn.register.failed', { reason: 'ItemTreeManager not available' });
      return false;
    }

    Zotero.ItemTreeManager.registerColumn({
      dataKey,
      label: i18n.t('toolsbox-column-cited-count', 'Cited Count'),
      pluginID: 'toolsbox@orlandozh.github',
      dataProvider: (item, dk) => dataProvider(item, dk),
      renderCell: (index, data, column) => renderCell(index, data, column),
      sortReverse: false
    });

    logger.debug('citedCountColumn.registered', { columnID });
    return true;
  }

  return {
    register,
    columnID,
    dataKey,
    dataProvider,
    renderCell
  };
}
```

- [ ] **Step 6: 创建单元测试**

```javascript
// tests/features/test-cited-count-column.js
import { createCitedCountColumn } from '../../src/features/cited-count-column.js';

describe('CitedCountColumn (Fixed)', () => {
  it('should render cited count number', () => {
    const column = createCitedCountColumn({
      logger: mockLogger,
      i18n: mockI18n,
      zotero: {
        getMainWindow: () => ({
          document: {
            createElement: (tag) => ({
              className: '',
              style: {},
              appendChild: sinon.spy(),
              textContent: ''
            })
          }
        })
      }
    });

    const cell = column.renderCell(0, '15', { className: 'cited-count' });

    expect(cell.textContent).toBe('15');
  });

  it('should highlight high cited papers', () => {
    const column = createCitedCountColumn({ logger: mockLogger });

    const cell = column.renderCell(0, '25', {});

    expect(cell.style.fontWeight).toBe('bold');
  });

  it('should handle zero citations', () => {
    const column = createCitedCountColumn({ logger: mockLogger });

    const cell = column.renderCell(0, '0', {});

    expect(cell.textContent).toBe('0');
    expect(cell.style.fontWeight).not.toBe('bold');
  });

  it('should extract cached data from item.extra', () => {
    const mockItem = {
      id: 1,
      getField: () => 'Cited Count: 42'
    };

    const column = createCitedCountColumn({ logger: mockLogger });
    const count = column.dataProvider(mockItem, 'citedCount');

    expect(count).toBe('42');
  });
});
```

- [ ] **Step 7: Commit修复**

```bash
git add src/features/cited-count-column.js tests/features/test-cited-count-column.js
git commit -m "fix: complete cited-count-column renderCell implementation with sorting"
```

---

## Task 2: 清理console.log违规

**Files:**
- Modify: `src/main.js` (lines 30-31)
- Modify: `src/features/menu-manager.js` (line 935)
- Modify: `src/platform/zotero-host.js` (lines 868-869)

**问题:** 违反Zotero专项规则"禁用console.log,使用ztoolkit.log或Zotero.debug"

- [ ] **Step 1: 查找所有console.log**

```bash
grep -rn "console.log" src/
```

预期输出:
- src/main.js:30-31
- src/features/menu-manager.js:935
- src/platform/zotero-host.js:868-869

- [ ] **Step 2: 替换为logger**

**src/main.js修复:**
```javascript
// Before (line 30-31)
console.log("ToolsBox main loaded");
console.log("Zotero version:", Zotero.version);

// After
logger.info('toolsbox.main.loaded');
logger.debug('toolsbox.zotero.version', { version: Zotero.version });
```

**menu-manager.js修复:**
```javascript
// Before (line 935)
console.log("Menu registered:", id);

// After
logger.debug('menuManager.registered', { id });
```

**zotero-host.js修复:**
```javascript
// Before (line 868-869)
console.log("Host signals initialized");
console.log("Platform:", platform);

// After
logger.info('zoteroHost.signals.initialized');
logger.debug('zoteroHost.platform', { platform });
```

- [ ] **Step 3: 验证替换**

```bash
grep -rn "console.log" src/
# Expected: no matches
```

- [ ] **Step 4: Commit清理**

```bash
git add src/main.js src/features/menu-manager.js src/platform/zotero-host.js
git commit -m "refactor: replace console.log with logger per Zotero rules"
```

---

## Task 3: 统一API命名规范

**Files:**
- Modify: `src/features/collection-item-count.js`
- Modify: `src/features/collection-sort.js`
- Modify: `src/features/favorite-collections.js`
- Modify: `src/app/feature-composer.js`

**问题:** Collection功能使用enable(),其他功能使用register()

**决策:** 统一使用`register()`命名

- [ ] **Step 1: 重命名方法**

**collection-item-count.js:**
```javascript
// Before
function enable() { /* ... */ }
return { enable, ... };

// After
function register() { /* ... */ }
return { register, ... };
```

**collection-sort.js:**
```javascript
// Before
function enable() { /* ... */ }
return { enable, ... };

// After
function register() { /* ... */ }
return { register, ... };
```

**favorite-collections.js:**
```javascript
// Before
function enable() { /* ... */ }
return { enable, ... };

// After
function register() { /* ... */ }
return { register, ... };
```

- [ ] **Step 2: 更新feature-composer调用**

```javascript
// src/app/feature-composer.js (lines 347, 360, 373)

// Before
if (collectionItemCount.enable()) { ... }
if (collectionSort.enable()) { ... }
if (favoriteCollections.enable()) { ... }

// After
if (collectionItemCount.register()) { ... }
if (collectionSort.register()) { ... }
if (favoriteCollections.register()) { ... }
```

- [ ] **Step 3: Commit统一命名**

```bash
git add src/features/collection-item-count.js src/features/collection-sort.js src/features/favorite-collections.js src/app/feature-composer.js
git commit -m "refactor: unify API naming to use register() across all features"
```

---

## Task 4: 补充P0功能测试

**目标:** 为5个P0功能创建单元测试

- [ ] **Step 1: 创建attachment-preview.test.js**
- [ ] **Step 2: 创建annotation-manager.test.js**
- [ ] **Step 3: 创建sidebar-toggle.test.js**
- [ ] **Step 4: 创建tab-manager-panel.test.js**

(详细测试实现略,参照Task 1的测试模式)

---

## 验证和收尾

- [ ] **Step 1: 运行所有测试**

```bash
node tests/run-all.js
```

Expected: All tests pass, including new P0 feature tests

- [ ] **Step 2: 验证无console.log**

```bash
grep -rn "console.log" src/
# Expected: no matches
```

- [ ] **Step 3: 更新文档**

```markdown
<!-- docs/CURRENT_BACKLOG.md -->
## 技术债务清理完成

- ✅ cited-count-column renderCell完整实现
- ✅ 清理所有console.log违规
- ✅ 统一API命名为register()
- ✅ 补充P0功能单元测试

## 下一步: P1 ItemTree列开发
```

- [ ] **Step 4: Commit文档更新**

```bash
git add docs/CURRENT_BACKLOG.md
git commit -m "docs: mark technical debt cleanup as complete"
```

- [ ] **Step 5: Create checkpoint tag**

```bash
git tag -a v0.5.0-tech-debt-fix -m "Technical debt fixed: renderCell, console.log, API naming, tests"
```

---

## 自检清单

- [x] **修复cited-count-column renderCell**: 完整实现显示逻辑
- [x] **清理console.log**: 替换为logger
- [x] **统一API命名**: 全部使用register()
- [x] **补充测试**: P0功能有单元测试
- [x] **代码质量**: 无console.log,统一命名
- [x] **文档更新**: 反映修复进度

---

**计划完成!准备执行。**

**预计时间:** 1-2天
**优先级:** 最高 - 必须先修复再继续开发
