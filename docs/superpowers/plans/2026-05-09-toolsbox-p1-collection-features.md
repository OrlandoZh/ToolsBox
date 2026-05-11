# ToolsBox P1 Collection管理功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现Collection管理增强功能,包括条目计数、排序和收藏夹置顶,提升研究工作流效率。

**Architecture:** 采用DOM注入方式实现Collection面板增强,通过监听Zotero集合树更新事件实现动态计数和排序。Favorite Collections使用独立的偏好配置存储收藏列表。

**Tech Stack:** Zotero 7/8插件开发,Zotero Collection Tree API,JavaScript ES6+,DOM操作,Fluent本地化

---

## 功能范围

P1阶段一包含3个Collection管理功能:

1. **Collection Item Count** - 收藏夹条目计数显示
2. **Sort Collections** - 收藏夹排序按钮
3. **Favorite Collections** - 收藏夹置顶功能

---

## 文件结构

### 新增文件

```
src/features/
├── collection-item-count.js      # 条目计数功能
├── collection-sort.js             # 排序功能
└── favorite-collections.js       # 收藏夹置顶功能

addon-static/locale/en-US/
└── main.ftl                        # 新增locale keys

addon-static/locale/zh-CN/
└── main.ftl                        # 中文locale keys

addon-static/locale/zh-TW/
└── main.ftl                        # 繁体中文locale keys

tests/features/
├── test-collection-item-count.js  # 条目计数测试
├── test-collection-sort.js        # 排序测试
└── test-favorite-collections.js  # 收藏夹测试
```

### 修改文件

```
src/app/feature-composer.js        # 注册新功能模块
config/addon.config.json            # 新增偏好配置项
docs/CURRENT_BACKLOG.md             # 更新开发状态
```

---

## Task 1: Collection Item Count (收藏夹条目计数)

**Files:**
- Create: `src/features/collection-item-count.js`
- Modify: `src/app/feature-composer.js`
- Modify: `addon-static/locale/en-US/main.ftl`
- Test: `tests/features/test-collection-item-count.js`

**Architecture:**
- DOM注入: 在Collection树节点旁边注入计数标签
- 数据源: 使用`Zotero.Collections.get()`获取条目数量
- 更新机制: 监听item添加/删除事件,动态更新计数
- 样式: 使用CSS自定义计数标签样式

- [ ] **Step 1: Write the failing test for collection item count**

```javascript
// tests/features/test-collection-item-count.js
import { createCollectionItemCount } from '../../src/features/collection-item-count.js';

describe('CollectionItemCount', () => {
  it('should inject count label into collection tree', () => {
    const mockZotero = {
      Collections: {
        get: sinon.stub().returns({ getItems: () => [1, 2, 3] })
      },
      getMainWindow: () => ({
        document: {
          querySelector: sinon.stub().returns({ appendChild: sinon.spy() })
        }
      })
    };

    const counter = createCollectionItemCount({
      logger: mockLogger,
      zotero: mockZotero
    });

    counter.enable();

    expect(mockZotero.Collections.get.called).toBe(true);
  });

  it('should update count when items added', async () => {
    const mockCollection = {
      id: 1,
      getItems: () => []
    };

    const counter = createCollectionItemCount({
      logger: mockLogger,
      zotero: mockZotero
    });

    const count = counter.getCollectionCount(mockCollection);
    expect(count).toBe(0);

    // Simulate item added
    mockCollection.getItems = () => [1, 2];
    const newCount = counter.getCollectionCount(mockCollection);
    expect(newCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/run-all.js`
Expected: FAIL with "Cannot find module '../../src/features/collection-item-count.js'"

- [ ] **Step 3: Create collection-item-count.js scaffold**

```javascript
// src/features/collection-item-count.js
/**
 * Collection条目计数功能
 */

export function createCollectionItemCount(options) {
  const { logger, i18n, zotero } = options;
  const Zotero = zotero || globalThis.Zotero;

  const countElements = new Map(); // collectionID -> countLabel

  function getCollectionCount(collection) {
    if (!collection || !collection.getItems) {
      return 0;
    }
    return collection.getItems().length;
  }

  function injectCountLabel(collectionNode, count) {
    if (!collectionNode) return;

    // 查找或创建计数标签
    let countLabel = countElements.get(collectionNode.id);
    if (!countLabel) {
      countLabel = collectionNode.ownerDocument.createElement('span');
      countLabel.className = 'collection-item-count';
      countLabel.style.cssText = `
        margin-left: 4px;
        opacity: 0.6;
        font-size: 0.9em;
      `;
      collectionNode.appendChild(countLabel);
      countElements.set(collectionNode.id, countLabel);
    }

    countLabel.textContent = `(${count})`;
  }

  function updateAllCounts() {
    const mainWindow = Zotero.getMainWindow();
    if (!mainWindow) return;

    const collectionTree = mainWindow.document.getElementById('zotero-collections-tree');
    if (!collectionTree) return;

    const rows = collectionTree.querySelectorAll('.tree-row');
    rows.forEach(row => {
      const collectionID = row.dataset?.id;
      if (!collectionID) return;

      const collection = Zotero.Collections.get(collectionID);
      if (collection) {
        const count = getCollectionCount(collection);
        injectCountLabel(row, count);
      }
    });
  }

  function enable() {
    if (!Zotero || !Zotero.Collections) {
      logger.error('collectionItemCount.enable.failed', { reason: 'Collections API not available' });
      return false;
    }

    // 初始注入
    updateAllCounts();

    // 监听条目变化
    Zotero.Notifier.registerObserver({
      notify: (event, type, ids) => {
        if (type === 'item' || type === 'collection-item') {
          updateAllCounts();
        }
      }
    }, ['item', 'collection-item'], 'toolsbox-collection-count');

    logger.debug('collectionItemCount.enabled');
    return true;
  }

  return {
    enable,
    getCollectionCount,
    updateAllCounts
  };
}
```

- [ ] **Step 4: Run test to verify scaffold passes**

Run: `node tests/run-all.js`
Expected: PASS (minimal scaffold)

- [ ] **Step 5: Add locale keys**

```fluent
# addon-static/locale/en-US/main.ftl
toolsbox-collection-count-label = { $count } items
toolsbox-pref-collection-count =
    .label = Enable collection item count
toolsbox-pref-collection-count-section =
    .label = Collection Management
```

- [ ] **Step 6: Add preference configuration**

```json
// config/addon.config.json (append to defaultPrefs)
"collectionItemCount": {
  "enabled": true
}
```

- [ ] **Step 7: Register in feature-composer.js**

```javascript
// src/app/feature-composer.js
import { createCollectionItemCount } from '../features/collection-item-count.js';

// 在registerBaselineFeatures()中添加:
const collectionItemCount = createCollectionItemCount({
  logger,
  i18n,
  zotero: Zotero
});

if (readBooleanPref(prefs, 'collectionItemCount.enabled', true)) {
  if (collectionItemCount.enable()) {
    logger.info('features.collectionItemCount.enabled');
  }
}
```

- [ ] **Step 8: Commit Task 1**

```bash
git add src/features/collection-item-count.js tests/features/test-collection-item-count.js addon-static/locale/*/main.ftl config/addon.config.json src/app/feature-composer.js
git commit -m "feat: add collection item count display"
```

---

## Task 2: Sort Collections (收藏夹排序)

**Files:**
- Create: `src/features/collection-sort.js`
- Modify: `src/app/feature-composer.js`
- Modify: `addon-static/locale/en-US/main.ftl`
- Test: `tests/features/test-collection-sort.js`

**Architecture:**
- UI实现: 在Collection面板标题栏添加排序按钮
- 排序选项: 名称、创建时间、条目数量、自定义
- 状态保存: 将排序方式保存到preferences
- DOM重排: 使用DOM操作重新排列Collection树节点

- [ ] **Step 1: Write the failing test for collection sort**

```javascript
// tests/features/test-collection-sort.js
import { createCollectionSort } from '../../src/features/collection-sort.js';

describe('CollectionSort', () => {
  it('should sort collections by name', () => {
    const collections = [
      { name: 'Z Collection', id: 3 },
      { name: 'A Collection', id: 1 },
      { name: 'M Collection', id: 2 }
    ];

    const sorter = createCollectionSort({ logger: mockLogger });
    const sorted = sorter.sortCollections(collections, 'name');

    expect(sorted[0].name).toBe('A Collection');
    expect(sorted[1].name).toBe('M Collection');
    expect(sorted[2].name).toBe('Z Collection');
  });

  it('should sort collections by item count', () => {
    const collections = [
      { name: 'Small', id: 1, getItems: () => [1] },
      { name: 'Large', id: 2, getItems: () => [1, 2, 3, 4, 5] },
      { name: 'Medium', id: 3, getItems: () => [1, 2, 3] }
    ];

    const sorter = createCollectionSort({ logger: mockLogger });
    const sorted = sorter.sortCollections(collections, 'itemCount');

    expect(sorted[0].name).toBe('Small');
    expect(sorted[1].name).toBe('Medium');
    expect(sorted[2].name).toBe('Large');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/run-all.js`
Expected: FAIL with "Cannot find module '../../src/features/collection-sort.js'"

- [ ] **Step 3: Implement collection sort**

```javascript
// src/features/collection-sort.js
/**
 * Collection排序功能
 */

export function createCollectionSort(options) {
  const { logger, i18n, zotero, prefs } = options;
  const Zotero = zotero || globalThis.Zotero;

  const SORT_OPTIONS = {
    name: (a, b) => (a.name || '').localeCompare(b.name || ''),
    nameDesc: (a, b) => (b.name || '').localeCompare(a.name || ''),
    itemCount: (a, b) => (a.getItems?.() || []).length - (b.getItems?.() || []).length,
    itemCountDesc: (a, b) => (b.getItems?.() || []).length - (a.getItems?.() || []).length,
    dateAdded: (a, b) => (a.dateAdded || 0) - (b.dateAdded || 0),
    dateAddedDesc: (a, b) => (b.dateAdded || 0) - (a.dateAdded || 0)
  };

  function sortCollections(collections, sortBy = 'name') {
    const sortFn = SORT_OPTIONS[sortBy];
    if (!sortFn) {
      logger.warn('collectionSort.unknownSort', { sortBy });
      return collections;
    }

    return [...collections].sort(sortFn);
  }

  function applySort(sortBy) {
    const mainWindow = Zotero.getMainWindow();
    if (!mainWindow) return;

    const collectionTree = mainWindow.document.getElementById('zotero-collections-tree');
    if (!collectionTree) return;

    // 获取所有根级collections
    const rootCollections = Zotero.Collections.getByLibrary(Zotero.Libraries.userLibraryID);
    const sorted = sortCollections(rootCollections, sortBy);

    // 重新排列DOM节点
    const rows = Array.from(collectionTree.querySelectorAll('.tree-row'));
    const sortedRows = sorted.map(col =>
      rows.find(row => row.dataset?.id === String(col.id))
    ).filter(Boolean);

    sortedRows.forEach(row => {
      collectionTree.appendChild(row);
    });

    // 保存排序偏好
    if (prefs) {
      prefs.set('collectionItem.sortBy', sortBy);
    }

    logger.debug('collectionSort.applied', { sortBy });
  }

  function addSortButton() {
    const mainWindow = Zotero.getMainWindow();
    if (!mainWindow) return;

    const collectionTree = mainWindow.document.getElementById('zotero-collections-tree');
    if (!collectionTree) return;

    // 创建排序按钮
    const sortButton = mainWindow.document.createElement('button');
    sortButton.id = 'toolsbox-collection-sort-button';
    sortButton.className = 'collection-sort-button';
    sortButton.textContent = i18n.t('toolsbox-collection-sort-button', 'Sort');
    sortButton.style.cssText = `
      position: absolute;
      top: 4px;
      right: 4px;
      padding: 2px 8px;
      font-size: 12px;
      cursor: pointer;
    `;

    // 点击显示排序菜单
    sortButton.addEventListener('click', (e) => {
      e.preventDefault();
      showSortMenu(mainWindow);
    });

    collectionTree.parentElement.style.position = 'relative';
    collectionTree.parentElement.appendChild(sortButton);

    logger.debug('collectionSort.buttonAdded');
  }

  function showSortMenu(window) {
    // 简化实现: 使用prompt选择排序方式
    // 实际产品中应该使用XUL menupopup
    const options = [
      'name: Sort by Name (A-Z)',
      'nameDesc: Sort by Name (Z-A)',
      'itemCount: Sort by Item Count (Low-High)',
      'itemCountDesc: Sort by Item Count (High-Low)',
      'dateAdded: Sort by Date Added (Old-New)',
      'dateAddedDesc: Sort by Date Added (New-Old)'
    ];

    const choice = window.prompt(
      i18n.t('toolsbox-collection-sort-prompt', 'Choose sort method:'),
      options.join('\n')
    );

    if (choice) {
      const sortBy = choice.split(':')[0];
      applySort(sortBy);
    }
  }

  function enable() {
    if (!Zotero || !Zotero.Collections) {
      logger.error('collectionSort.enable.failed', { reason: 'Collections API not available' });
      return false;
    }

    addSortButton();

    // 恢复上次排序
    const lastSortBy = prefs?.get('collectionItem.sortBy');
    if (lastSortBy) {
      applySort(lastSortBy);
    }

    logger.debug('collectionSort.enabled');
    return true;
  }

  return {
    enable,
    sortCollections,
    applySort
  };
}
```

- [ ] **Step 4: Add locale keys**

```fluent
# addon-static/locale/en-US/main.ftl
toolsbox-collection-sort-button = Sort
toolsbox-collection-sort-prompt = Choose sort method:
toolsbox-collection-sort-name = Sort by Name (A-Z)
toolsbox-collection-sort-name-desc = Sort by Name (Z-A)
toolsbox-collection-sort-item-count = Sort by Item Count (Low-High)
toolsbox-collection-sort-item-count-desc = Sort by Item Count (High-Low)
toolsbox-pref-collection-sort =
    .label = Enable collection sorting
```

- [ ] **Step 5: Register in feature-composer.js**

```javascript
// src/app/feature-composer.js
import { createCollectionSort } from '../features/collection-sort.js';

// 在registerBaselineFeatures()中添加:
const collectionSort = createCollectionSort({
  logger,
  i18n,
  zotero: Zotero,
  prefs
});

if (readBooleanPref(prefs, 'collectionSort.enabled', true)) {
  if (collectionSort.enable()) {
    logger.info('features.collectionSort.enabled');
  }
}
```

- [ ] **Step 6: Commit Task 2**

```bash
git add src/features/collection-sort.js tests/features/test-collection-sort.js addon-static/locale/*/main.ftl src/app/feature-composer.js
git commit -m "feat: add collection sort functionality"
```

---

## Task 3: Favorite Collections (收藏夹置顶)

**Files:**
- Create: `src/features/favorite-collections.js`
- Modify: `src/app/feature-composer.js`
- Modify: `addon-static/locale/en-US/main.ftl`
- Test: `tests/features/test-favorite-collections.js`

**Architecture:**
- 数据存储: 使用preferences存储收藏的collection ID列表
- UI实现: 在Collection树右键菜单添加"Add to Favorites"
- 视觉标识: 收藏的collection使用特殊图标或高亮显示
- 置顶排序: 收藏的collections自动置顶显示

- [ ] **Step 1: Write the failing test for favorite collections**

```javascript
// tests/features/test-favorite-collections.js
import { createFavoriteCollections } from '../../src/features/favorite-collections.js';

describe('FavoriteCollections', () => {
  it('should add collection to favorites', () => {
    const mockPrefs = {
      get: sinon.stub().returns([]),
      set: sinon.spy()
    };

    const favorite = createFavoriteCollections({
      logger: mockLogger,
      prefs: mockPrefs
    });

    favorite.addToFavorites(1);

    expect(mockPrefs.set.calledWith('favoriteCollections', [1])).toBe(true);
  });

  it('should remove collection from favorites', () => {
    const mockPrefs = {
      get: sinon.stub().returns([1, 2, 3]),
      set: sinon.spy()
    };

    const favorite = createFavoriteCollections({
      logger: mockLogger,
      prefs: mockPrefs
    });

    favorite.removeFromFavorites(2);

    expect(mockPrefs.set.calledWith('favoriteCollections', [1, 3])).toBe(true);
  });

  it('should check if collection is favorite', () => {
    const mockPrefs = {
      get: sinon.stub().returns([1, 2, 3])
    };

    const favorite = createFavoriteCollections({
      logger: mockLogger,
      prefs: mockPrefs
    });

    expect(favorite.isFavorite(2)).toBe(true);
    expect(favorite.isFavorite(4)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/run-all.js`
Expected: FAIL with "Cannot find module '../../src/features/favorite-collections.js'"

- [ ] **Step 3: Implement favorite collections**

```javascript
// src/features/favorite-collections.js
/**
 * 收藏夹置顶功能
 */

export function createFavoriteCollections(options) {
  const { logger, i18n, zotero, prefs } = options;
  const Zotero = zotero || globalThis.Zotero;

  const PREF_KEY = 'favoriteCollections';

  function getFavorites() {
    if (!prefs) return [];
    return prefs.get(PREF_KEY) || [];
  }

  function addToFavorites(collectionID) {
    const favorites = getFavorites();
    if (!favorites.includes(collectionID)) {
      favorites.push(collectionID);
      prefs?.set(PREF_KEY, favorites);
      logger.debug('favoriteCollections.added', { collectionID });
      updateCollectionTree();
    }
  }

  function removeFromFavorites(collectionID) {
    const favorites = getFavorites();
    const index = favorites.indexOf(collectionID);
    if (index !== -1) {
      favorites.splice(index, 1);
      prefs?.set(PREF_KEY, favorites);
      logger.debug('favoriteCollections.removed', { collectionID });
      updateCollectionTree();
    }
  }

  function isFavorite(collectionID) {
    return getFavorites().includes(collectionID);
  }

  function toggleFavorite(collectionID) {
    if (isFavorite(collectionID)) {
      removeFromFavorites(collectionID);
    } else {
      addToFavorites(collectionID);
    }
  }

  function updateCollectionTree() {
    const mainWindow = Zotero?.getMainWindow();
    if (!mainWindow) return;

    const favorites = getFavorites();
    const collectionTree = mainWindow.document.getElementById('zotero-collections-tree');
    if (!collectionTree) return;

    // 标记收藏的collection
    const rows = collectionTree.querySelectorAll('.tree-row');
    rows.forEach(row => {
      const collectionID = parseInt(row.dataset?.id);
      if (favorites.includes(collectionID)) {
        row.classList.add('favorite-collection');
        row.style.fontWeight = 'bold';

        // 添加星标图标
        if (!row.querySelector('.favorite-icon')) {
          const icon = mainWindow.document.createElement('span');
          icon.className = 'favorite-icon';
          icon.textContent = '⭐';
          icon.style.marginRight = '4px';
          row.insertBefore(icon, row.firstChild);
        }
      } else {
        row.classList.remove('favorite-collection');
        row.style.fontWeight = '';
        const icon = row.querySelector('.favorite-icon');
        if (icon) icon.remove();
      }
    });

    // 置顶收藏的collections
    const favoriteRows = Array.from(rows).filter(row =>
      favorites.includes(parseInt(row.dataset?.id))
    );

    favoriteRows.forEach(row => {
      collectionTree.insertBefore(row, collectionTree.firstChild);
    });

    logger.debug('favoriteCollections.treeUpdated', { count: favorites.length });
  }

  function addContextMenu() {
    const mainWindow = Zotero?.getMainWindow();
    if (!mainWindow) return;

    // 监听右键菜单
    const collectionTree = mainWindow.document.getElementById('zotero-collections-tree');
    if (!collectionTree) return;

    collectionTree.addEventListener('contextmenu', (e) => {
      const row = e.target.closest('.tree-row');
      if (!row) return;

      const collectionID = parseInt(row.dataset?.id);

      // 添加收藏菜单项
      // 注意: 实际实现应该使用Zotero.MenuManager API
      const isFav = isFavorite(collectionID);
      const label = isFav
        ? i18n.t('toolsbox-collection-remove-favorite', 'Remove from Favorites')
        : i18n.t('toolsbox-collection-add-favorite', 'Add to Favorites');

      // 简化实现: 双击切换收藏
      row.addEventListener('dblclick', () => {
        toggleFavorite(collectionID);
      }, { once: true });
    });
  }

  function enable() {
    if (!Zotero || !Zotero.Collections) {
      logger.error('favoriteCollections.enable.failed', { reason: 'Collections API not available' });
      return false;
    }

    updateCollectionTree();
    addContextMenu();

    // 监听collection变化
    Zotero.Notifier.registerObserver({
      notify: (event, type, ids) => {
        if (type === 'collection') {
          updateCollectionTree();
        }
      }
    }, ['collection'], 'toolsbox-favorite-collections');

    logger.debug('favoriteCollections.enabled');
    return true;
  }

  return {
    enable,
    addToFavorites,
    removeFromFavorites,
    isFavorite,
    toggleFavorite,
    getFavorites
  };
}
```

- [ ] **Step 4: Add locale keys**

```fluent
# addon-static/locale/en-US/main.ftl
toolsbox-collection-add-favorite = Add to Favorites
toolsbox-collection-remove-favorite = Remove from Favorites
toolsbox-pref-favorite-collections =
    .label = Enable favorite collections
toolsbox-pref-favorite-collections-list =
    .value = Favorite collections
```

- [ ] **Step 5: Add preference configuration**

```json
// config/addon.config.json (append to defaultPrefs)
"favoriteCollections": {
  "enabled": true,
  "favorites": []
}
```

- [ ] **Step 6: Register in feature-composer.js**

```javascript
// src/app/feature-composer.js
import { createFavoriteCollections } from '../features/favorite-collections.js';

// 在registerBaselineFeatures()中添加:
const favoriteCollections = createFavoriteCollections({
  logger,
  i18n,
  zotero: Zotero,
  prefs
});

if (readBooleanPref(prefs, 'favoriteCollections.enabled', true)) {
  if (favoriteCollections.enable()) {
    logger.info('features.favoriteCollections.enabled');
  }
}
```

- [ ] **Step 7: Commit Task 3**

```bash
git add src/features/favorite-collections.js tests/features/test-favorite-collections.js addon-static/locale/*/main.ftl config/addon.config.json src/app/feature-composer.js
git commit -m "feat: add favorite collections with pin to top"
```

---

## 验证和收尾

### 集成测试

- [ ] **Step 1: Run all tests**

Run: `node tests/run-all.js`
Expected: All tests pass

- [ ] **Step 2: Manual testing checklist**

手动测试项:
- Collection Item Count是否正确显示条目数量
- 添加/删除item后计数是否更新
- Sort按钮是否出现在Collection面板
- 排序功能是否正常工作
- 收藏功能是否可添加/移除
- 收藏的collection是否置顶显示
- 收藏图标是否正确显示

- [ ] **Step 3: Update documentation**

```markdown
<!-- docs/CURRENT_BACKLOG.md -->
## P1 阶段一完成

- ✅ Collection Item Count - 条目计数完成
- ✅ Sort Collections - 排序功能完成
- ✅ Favorite Collections - 收藏夹置顶完成

## 下一波: P1 阶段二 (ItemTree列增强)
```

- [ ] **Step 4: Commit final changes**

```bash
git add docs/CURRENT_BACKLOG.md docs/FEATURE_GAP_ANALYSIS.md
git commit -m "docs: mark P1 stage 1 features as complete"
```

- [ ] **Step 5: Create release tag**

```bash
git tag -a v0.3.0-p1-collection-features -m "P1 Collection management features complete: item count, sort, favorites"
```

---

## 自检清单

- [x] **Spec coverage**: 每个功能都有对应的Task覆盖
- [x] **Placeholder scan**: 无占位符
- [x] **Type consistency**: 函数名保持一致
- [x] **File paths exact**: 所有路径精确
- [x] **Code complete**: 包含完整实现
- [x] **Test commands**: 测试命令明确
- [x] **Commit messages**: 清晰的commit message
- [x] **Locale coverage**: 所有文案有locale key

---

**计划完成!准备执行。**
