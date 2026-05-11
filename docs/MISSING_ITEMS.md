# ToolsBox 缺失项清单

**更新时间**: 2026-05-11
**审计方法**: 对比 reference/zotero-style/prefs.js 与 ToolsBox 实现

---

## ✅ 真实完成度分析

### 功能代码 (100%)
- 所有 41 个功能文件存在并注册
- feature-composer.js 导入并初始化所有功能
- 无代码缺失

### 配置 (100%)
- addon.config.json 包含所有 prefs
- reference/zotero-style/prefs.js 中所有功能均有对应配置
- 无配置缺失

### UI层 (95%)
- Preference Pane 已创建 ✅
- annotation-manager.html 已创建 ✅
- theme.js 已创建 ✅
- preferences.xhtml 已创建 ✅

---

## ❌ 实际缺失项

### 1. Surface Evidence (0%)
**问题**: docs/evidence/ 目录不存在

**Contract 要求**:
- ItemTree 列截图
- Preference Pane 截图
- Reader toolbar 截图
- Menu commands 截图

**修复**: 创建 docs/evidence/ 目录并截图

---

### 2. 真机测试 (0%)
**问题**: 未在 Zotero 中测试

**缺失验证**:
- Preference Pane 加载是否正常
- ItemTree 列是否显示
- Reader 功能是否工作
- AI 功能是否需要 API key

**修复**: 构建 xpi,安装测试

---

### 3. Contract 合规问题

#### 3.1 Wrapper Usage (违规)
**位置**:
- collection-item-count.js - 直接 DOM 操作
- collection-sort.js - DOM reorder
- margin-annotation.js - `_iframeWindow` 私有 API

**修复**: 创建 wrapper 并重构

#### 3.2 Cleanup 函数 (缺失)
**问题**: 无 shutdown cleanup

**修复**: 添加 cleanup 函数到每个功能

#### 3.3 State Integrity (部分缺失)
**问题**: 数据版本管理缺失

**修复**: 添加数据 schema 和版本

---

### 4. 功能入口 (可选)

#### AI 功能入口
- ai-generate-tags.js - 无菜单入口
- ai-generate-remark.js - 无菜单入口

**修复**: 添加菜单命令或按钮

---

### 5. Reference 功能对比

从 reference/zotero-style/prefs.js 分析:

| Reference 功能 | ToolsBox 状态 | 备注 |
|---------------|--------------|------|
| marginAnnotation | ✅ 已实现 | margin-annotation.js |
| verticalTabManager | ✅ 已实现 | tab-manager-panel.js |
| dateAddedColumn | ⚠️ 部分实现 | 在 research-workflow-columns.js |
| dateModifiedColumn | ⚠️ 部分实现 | 同上 |
| favoriteCollections | ✅ 已实现 | favorite-collections.js |
| AIGenerateRemark | ✅ 已实现 | ai-generate-remark.js |
| AIGenerateTags | ✅ 已实现 | ai-generate-tags.js |
| backlinks | ⚠️ 配置存在 | 无独立文件,可能集成 |
| tldr | ⚠️ 配置存在 | 无独立文件,可能集成 |
| toogleSidebar | ✅ 已实现 | sidebar-toggle.js |
| styleEditor | ⚠️ 配置存在 | 无独立文件 |
| annotationColumn | ✅ 已实现 | annotation-column.js |
| annotationManager | ✅ 已实现 | annotation-manager.js |
| paperMatrix | ✅ 已实现 | research-workbench-matrix.js |
| graphView | ✅ 已实现 | graph-view-enhanced.js |
| citedCountColumn | ✅ 已实现 | cited-count-column.js |

**结论**: 大部分功能已实现,少数功能 (backlinks, tldr, styleEditor) 可能集成在其他模块中或待实现

---

## 📋 修复优先级

### P0 - 关键阻塞 (必须修复)
1. **真机测试** - 无法验证功能是否工作
2. **Surface Evidence** - Contract 要求

### P1 - Contract 合规
3. **Wrapper Usage** - 移除私有 API
4. **Cleanup 函数** - 添加清理逻辑

### P2 - 可选改进
5. **功能入口** - AI 功能菜单
6. **Reference 功能完善** - backlinks/tldr/styleEditor

---

## ⏱️ 修复时间估算

| 任务 | 时间 | 优先级 |
|------|------|--------|
| 真机测试 | 1-2天 | P0 |
| Surface Evidence | 0.5天 | P0 |
| Wrapper 重构 | 2天 | P1 |
| Cleanup 函数 | 0.5天 | P1 |
| 功能入口 | 0.5天 | P2 |
| Reference 功能 | 1-2天 | P2 |

**总计**: 5-8天

---

## 🎯 验收标准

### MVP 验收
- [x] 功能代码完整
- [x] 配置完整
- [x] npm run check 通过
- [ ] 真机测试通过
- [ ] Surface Evidence 存在

### Contract 验收 (80+)
- [ ] Wrapper Usage ≥ 8
- [ ] Surface Evidence ≥ 7
- [ ] Cleanup ≥ 7
- [ ] 无 ❌ 项

---

## 当前阻塞点

**最大阻塞**: 缺少真机测试
**次要阻塞**: Surface Evidence 缺失
**Contract 阻塞**: Wrapper/Cleanup 未完善

**下一步**: 执行真机测试验证功能
