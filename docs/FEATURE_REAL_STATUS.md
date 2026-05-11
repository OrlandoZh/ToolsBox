# ToolsBox 功能完成度真实报告

**更新时间**: 2026-05-10
**对比基准**: `reference/zotero-style` (v6.0.4)
**真实完成度**: **72%** (41/57声称功能实际存在)

---

## ⚠️ 重要说明

**本文档反映真实状态,不包含虚假声称**

之前的 `FEATURE_AUDIT_REPORT.md` 和 `FEATURE_GAP_ANALYSIS.md` 声称100%完成但与实际不符,已删除。请以本文档为准。

---

## 📊 真实完成度统计

| 分类 | 声称数量 | 实际存在 | 完成度 |
|------|---------|---------|--------|
| **核心功能** | 10 | 10 | 100% ✅ |
| **ItemTree列** | 12 | 9 | 75% ⚠️ |
| **Reader功能** | 6 | 3 | 50% ❌ |
| **Workflow功能** | 8 | 4 | 50% ❌ |
| **高级定制** | 11 | 5 | 45% ❌ |
| **基础设施** | 10 | 10 | 100% ✅ |
| **总计** | **57** | **41** | **72%** |

---

## ✅ 已实际存在的功能 (41个)

### 核心功能 (10个) - 100% ✅
1. ✅ **Margin Annotation** - `margin-annotation.js`
2. ✅ **Toggle Sidebar** - `sidebar-toggle.js`
3. ✅ **Tab Manager** - `tab-manager-panel.js`
4. ✅ **Attachment Preview** - `attachment-preview.js`
5. ✅ **Annotation Manager** - `annotation-manager.js` (但HTML缺失)
6. ✅ **Cited Count Column** - `cited-count-column.js`
7. ✅ **Collection Item Count** - `collection-item-count.js`
8. ✅ **Sort Collections** - `collection-sort.js`
9. ✅ **Favorite Collections** - `favorite-collections.js`
10. ✅ **Graph View Enhanced** - `graph-view-enhanced.js`

### ItemTree列 (9个) - 75% ⚠️
11. ✅ **Reading Time Column** - `reading-time-column.js`
12. ✅ **Annotation Column** - `annotation-column.js`
13. ✅ **Publication Tags Column** - `publication-tags-column.js`
14. ✅ **Title Column Enhanced** - `title-column-enhanced.js`
15. ✅ **IF Column** - `if-column.js`
16. ✅ **Nested Tags** - `nested-tags.js`
17. ✅ **View Groups** - `view-groups.js`
18. ✅ **PDF Background Color** - `pdf-background-color.js`
19. ✅ **Annotation Colors** - `annotation-colors.js`

### Workflow功能 (4个) - 50% ❌
20. ✅ **AI Generate Tags** - `ai-generate-tags.js` (但无用户入口)
21. ✅ **AI Generate Remark** - `ai-generate-remark.js` (但无用户入口)
22. ✅ **Research Workflow** - `research-workflow.js`
23. ✅ **Workflow State** - `workflow-state.js`

### 基础设施 (10个) - 100% ✅
24. ✅ **Item Tree** - `item-tree.js`
25. ✅ **Item Pane** - `item-pane.js`
26. ✅ **Menu Manager** - `menu-manager.js`
27. ✅ **Menu Command** - `menu-command.js`
28. ✅ **Preference Panes** - `preference-panes.js`
29. ✅ **Theme Manager** - `theme-manager.js`
30. ✅ **Window Manager** - `window-manager.js`
31. ✅ **Prompt** - `prompt.js`
32. ✅ **Reader** - `reader.js`
33. ✅ **Reader Selection Actions** - `reader-selection-actions.js`

### Workbench (8个) - 100% ✅
34. ✅ **Research Workbench Common** - `research-workbench-common.js`
35. ✅ **Research Workbench Graph** - `research-workbench-graph.js`
36. ✅ **Research Workbench Matrix** - `research-workbench-matrix.js`
37. ✅ **Research Workbench Notes** - `research-workbench-notes.js`
38. ✅ **Research Workbench Tabs** - `research-workbench-tabs.js`
39. ✅ **Research Workflow Columns** - `research-workflow-columns.js`
40. ✅ **Theme Contract** - `theme-contract.js`
41. ✅ **WASM Kernel Probe** - `wasm-kernel-probe.js`

---

## ❌ 声称存在但实际缺失的功能 (16个)

### 高优先级缺失 (11个):
1. ❌ **Style Editor** - 文件不存在
2. ❌ **TLDR Panel** - 文件不存在
3. ❌ **Backlinks** - 文件不存在
4. ❌ **Merge Annotations** - 文件不存在
5. ❌ **Attachment Version Switch** - 文件不存在
6. ❌ **Custom Column DataKeys** - 文件不存在
7. ❌ **API Config UI** - 文件不存在
8. ❌ **Annotation Color Names** - 文件不存在
9. ❌ **Annotation Manager Config** - 文件不存在
10. ❌ **Paper Matrix Enhanced** - 文件不存在
11. ❌ **Custom External API** - 文件不存在

### 配置缺失 (5个):
12. ❌ **Tags Column Config** - 代码在research-workflow-columns中但无独立配置
13. ❌ **Text Tags Column Config** - 同上
14. ❌ **Date Format Customization** - 配置缺失
15. ❌ **Rating Column Config** - 配置缺失
16. ❌ **Creator Column Config** - 配置缺失

---

## 🚨 已知问题

### 配置问题
- `config/addon.config.json` 只配置到 `readTimeColumn`
- 大量功能缺少PreferencePanes配置界面
- 缺少default-off策略

### HTML资产缺失
- `annotation-manager.js` 尝试打开 `chrome://toolsbox/content/annotation-manager.html`
- 但 `addon-static/content/` 目录下**无任何HTML文件**

### Contract违规
- Collection功能直接操作私有DOM (`#zotero-collections-tree`)
- Reader功能使用私有API (`_iframeWindow`)
- 未优先使用wrapper

### 功能入口缺失
- AI功能仅log,无菜单/按钮入口
- 外部元数据API未实际调用(仅正则匹配extra字段)

### 代码质量
- `npm run check` 失败(format问题)
- 测试环境不干净(Zotero undefined)

---

## 📋 下一步行动

参见 `REMEDIATION_PLAN.md` 了解详细修复计划:

**Phase 1**: 清理文档 (当前)
**Phase 2-8**: 逐步修复所有问题

**预计修复时间**: 12天
**目标**: 达到clean-room contract验收标准

---

## 🎯 验收标准

当且仅当以下全部满足时才能声称"复刻完成":

- [ ] 所有声称存在的文件实际存在
- [ ] 所有功能有完整配置
- [ ] HTML资产完整
- [ ] Contract要求全部满足
- [ ] npm run check通过
- [ ] 真机测试通过
- [ ] 文档反映真实状态

---

**当前状态**: **FAIL** (72%完成度,多处不满足contract)
**不能声称**: "100%完成"或"复刻完成"
**必须**: 按REMEDIATION_PLAN逐步修复
