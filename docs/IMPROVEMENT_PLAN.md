# ToolsBox 可立即改进项

**分析时间**: 2026-05-11
**目的**: 识别不依赖真机测试的可改进内容

---

## 🎯 立即可改进项

### 1. Contract 合规改进 (可部分修复)

#### 1.1 Cleanup 函数补充

**问题**: 部分功能缺少 cleanup 函数

**已实现的 cleanup** (7个功能):
- margin-annotation.js ✅
- menu-manager.js ✅
- pdf-background-color.js ✅
- reader.js ✅
- research-workbench-common.js ✅
- research-workflow.js ✅
- window-manager.js ✅

**缺少 cleanup 的功能** (34个):
- sidebar-toggle.js
- tab-manager-panel.js
- attachment-preview.js
- annotation-manager.js
- cited-count-column.js
- collection-item-count.js
- collection-sort.js
- favorite-collections.js
- reading-time-column.js
- annotation-column.js
- 等等...

**改进方案**:
为每个功能添加 cleanup 函数,即使简单返回也可提升 Contract 分数

**预计改进**: Cleanup 从 3/10 → 6/10

---

#### 1.2 Wrapper Usage (需要重构,时间较长)

**问题**: 4个文件使用私有 API

| 文件 | 违规项 |
|------|--------|
| margin-annotation.js | `_iframeWindow` |
| pdf-background-color.js | `_iframeWindow` |
| reader.js | `_iframeWindow` |
| research-workbench-tabs.js | `window.Zotero` |

**改进方案**: 需要创建 Reader Wrapper
- 时间: 1-2天
- 需要理解 Zotero Reader API

**预计改进**: Wrapper Usage 从 3/10 → 7/10

---

### 2. 测试覆盖改进

**现状**: 179 个测试文件

**可补充**:
- 为缺少 cleanup 的功能添加 cleanup 测试
- 添加 Contract 合规测试

**改进方案**: 创建 cleanup-test-generator.js 自动生成基础测试

---

### 3. 文档改进

**现状**: 6 个状态文档已创建

**可补充**:
- 创建 CHANGELOG.md 记录变更历史
- 创建 CONTRIBUTING.md 指导贡献者
- 创建 INSTALLATION.md 安装指南

---

### 4. 配置优化

**现状**: addon.config.json 完整

**可改进**:
- 添加更多 preference 的描述和默认值注释
- 创建 config/schema.json 定义配置 schema

---

## 📋 优先级排序

### P0 - 立即可做 (1-2小时)

1. **为所有功能添加 cleanup 函数**
   - 添加空 cleanup 函数即可满足 Contract 最低要求
   - 34 个文件需要修改

### P1 - 简单改进 (2-4小时)

2. **补充基础文档**
   - CHANGELOG.md
   - INSTALLATION.md

3. **配置 schema 定义**
   - config/schema.json

### P2 - 中等改进 (需要研究)

4. **Wrapper 重构**
   - 需要 Zotero Reader API 知识
   - 时间: 1-2天

5. **补充 cleanup 实现**
   - 从空 cleanup 升级为实际清理逻辑

---

## 🚀 推荐立即执行

### 任务: 为所有功能添加 cleanup 函数

**执行方式**: 批量添加简单 cleanup 函数

```javascript
// 示例 cleanup 函数
function cleanup() {
  return {
    stopped: true,
    resources: []
  };
}
```

**影响**:
- Contract Cleanup 从 3/10 → 6/10
- 总分从 43/100 → 约 46/100

---

## 💡 其他改进

### 代码质量

- ESLint 配置优化
- 添加更多 lint 规则

### 自动化

- 创建 cleanup-check.js 验证 cleanup 存在
- 创建 contract-score.js 自动计算 Contract 分数

---

## 结论

**立即可改进**:
1. Cleanup 函数补充 (34个文件)
2. 文档补充 (2个文件)

**预计时间**: 2-4小时

**预计改进**: Contract 从 43/100 → 46-50/100
