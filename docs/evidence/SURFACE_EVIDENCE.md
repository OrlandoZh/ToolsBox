# Surface Evidence 文档

**创建时间**: 2026-05-11
**目的**: 记录 ToolsBox 功能的实际证据,满足 Contract 要求

---

## Evidence 类别

### 1. ItemTree 列 (Column Evidence)

**已实现列**:
- Reading Time Column
- Annotation Column
- Publication Tags Column
- Title Column Enhanced
- IF Column
- Cited Count Column

**证据方式**:
- 代码位置记录
- 功能测试结果

### 2. Preference Pane (UI Evidence)

**已创建**:
- preferences.xhtml - 6 个配置面板
- preferences.js - Bridge controller
- preferences.css - 样式

### 3. Reader 功能 (Reader Evidence)

**已实现**:
- Margin Annotation
- PDF Background Color

### 4. Collection 功能 (Collection Evidence)

**已实现**:
- Collection Item Count
- Collection Sort
- Favorite Collections

---

## 代码位置证据

### ItemTree 列实现

| 功能 | 文件位置 | 注册位置 |
|------|---------|---------|
| Reading Time | src/features/reading-time-column.js | feature-composer.js:393 |
| Annotation | src/features/annotation-column.js | feature-composer.js:406 |
| Publication Tags | src/features/publication-tags-column.js | feature-composer.js:419 |
| IF Column | src/features/if-column.js | feature-composer.js:452 |
| Cited Count | src/features/cited-count-column.js | feature-composer.js:282 |

### Preference Pane 实现

| 组件 | 文件位置 |
|------|---------|
| XUL Template | addon-static/content/preferences.xhtml |
| Controller | addon-static/content/preferences.js |
| CSS | addon-static/content/preferences.css |
| Registration | feature-composer.js:153 |

### Reader 功能实现

| 功能 | 文件位置 | 注册位置 |
|------|---------|---------|
| Margin Annotation | src/features/margin-annotation.js | feature-composer.js:466 |
| PDF Background | src/features/pdf-background-color.js | feature-composer.js:479 |

### Collection 功能实现

| 功能 | 文件位置 | 注册位置 |
|------|---------|---------|
| Item Count | src/features/collection-item-count.js | feature-composer.js:355 |
| Sort | src/features/collection-sort.js | feature-composer.js:367 |
| Favorites | src/features/favorite-collections.js | feature-composer.js:380 |

---

## 构建证据

### Build Report

```json
{
  "generatedAt": "2026-05-11T11:57:25.121Z",
  "addonRef": "toolsbox",
  "addonVersion": "0.1.0",
  "buildRoot": "build/toolsbox",
  "bundlePath": "build/toolsbox/content/scripts/toolsbox.js"
}
```

### Build Files

- manifest.json ✅
- bootstrap.js ✅
- prefs.js ✅
- content/scripts/toolsbox.js ✅
- content/preferences.xhtml ✅
- locale/en-US/main.ftl ✅

---

## 测试证据

### npm run check

| 检查项 | 结果 |
|--------|------|
| lint | ✅ Pass |
| format:check | ✅ Pass |
| typecheck | ✅ Pass |
| verify | ✅ Pass |
| cleanroom:audit | ✅ Pass |

### npm test

- **总测试数**: 313
- **通过率**: 100%
- **测试框架**: 自定义 test-framework.js

---

## Contract 合规证据

### 已满足项

| Contract 要求 | 证据 |
|--------------|------|
| Feature inventory | docs/ACTUAL_STATUS.md |
| Clean-room boundary | 源码重新实现 |
| Preference Pane | addon-static/content/preferences.xhtml |
| Default-off | addon.config.json (AI功能 disabled) |

### 待修复项

| Contract 要求 | 当前状态 | 缺失证据 |
|--------------|---------|---------|
| Wrapper Usage | 违规 | 需重构 Collection |
| Surface Evidence | 本文档 | ✅ 正在创建 |
| Cleanup 函数 | 缺失 | 需添加 |

---

## 真机测试计划

### 测试环境

- Zotero 版本: 7.x
- 安装方式: 开发模式 (build/toolsbox)

### 测试清单

1. Preference Pane 加载
2. ItemTree 列显示
3. Collection 功能
4. Reader 功能
5. AI 功能 (需 API key)

---

## 截图计划

**需要截图的 Surface**:
1. Preference Pane - General 面板
2. Preference Pane - Columns 面板
3. ItemTree - Reading Time 列
4. ItemTree - Annotation 列
5. Collection - Favorite 标记

**截图方法**: 真机测试时使用 Playwright 或手动截图

---

## Evidence Summary

| 类别 | 状态 | 完成度 |
|------|------|--------|
| 代码位置 | ✅ 记录 | 100% |
| 构建产物 | ✅ 存在 | 100% |
| 测试结果 | ✅ 通过 | 100% |
| 截图证据 | ⏳ 待真机 | 0% |
| Contract合规 | ⚠️ 部分 | 43% |

**下一步**: 执行真机测试,补充截图证据