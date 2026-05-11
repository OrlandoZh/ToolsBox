# 真实复刻状态审计报告

**审计时间**: 2026-05-10
**审计方式**: 对照源码实际状态
**结论**: **FAIL - 复刻未完成**

---

## ❌ 核心问题

### 1. 文档声称与实际不符

**问题**: `FEATURE_AUDIT_REPORT.md` 声称100%完成,但实际:
- 声称存在但**实际不存在**的文件:
  - ❌ `style-editor.js`
  - ❌ `tldr-panel.js`
  - ❌ `backlinks.js`
  - ❌ `merge-annotations.js`
  - ❌ `attachment-version-switch.js`
  - ❌ `custom-column-datakeys.js`
  - ❌ `api-config-ui.js`
  - ❌ `annotation-color-names.js`
  - ❌ `annotation-manager-config.js`
  - ❌ `paper-matrix-enhanced.js`
  - ❌ `custom-external-api.js`

**实际存在的feature文件**: 仅41个

---

### 2. 配置schema不完整

**问题**: `config/addon.config.json` 只配置到 `readTimeColumn`:

```json
"readTimeColumn.enabled": true,
"readTimeColumn.max": 600,
"readTimeColumn.color": "#468B97",
"readTimeColumn.opacity": "0.7",
"readTimeColumn.progress": true,
"readTimeColumn.text": true
```

但 `feature-composer.js` 注册了大量**未在config中定义**的功能:
- ❌ attachment preview
- ❌ annotation manager
- ❌ IF column
- ❌ publication tags
- ❌ margin annotation
- ❌ AI tags/remark
- ❌ 等等

**影响**: 这些功能缺少:
- PreferencePanes 控件
- 默认开关配置
- Schema定义
- 迁移策略
- Default-off策略

---

### 3. HTML资产缺失

**问题**: `annotation-manager.js` 尝试打开:
```javascript
window.open('chrome://toolsbox/content/annotation-manager.html', ...)
```

**实际**: `addon-static/content/` 目录下**没有任何HTML文件**

**影响**: Annotation Manager功能入口断裂

---

### 4. 外部元数据列实现不完整

**Cited Count Column问题**:
```javascript
// 声称使用Semantic Scholar API
// 实际只从extra字段正则匹配
const extra = item.getField?.('extra') || '';
const match = extra.match(/Cited Count: (\d+)/);
```

- ❌ 无实际API调用
- ❌ 无数据获取逻辑
- ❌ 无缓存管理

**IF Column数据不一致**:
```javascript
// dataProvider返回primitive
dataProvider: async (item) => {
  if (data.sciIF) return data.sciIF;  // 返回数字
  if (data.sciQ) return data.sciQ;     // 返回字符串
}

// renderCell期望对象
renderCell: (index, data, column) => {
  // data可能是数字、字符串或null
  // 但renderCell内部按对象处理
}
```

---

### 5. AI功能无用户入口

**问题**: `ai-generate-tags.js` 和 `ai-generate-remark.js`:
```javascript
function register() {
  logger.info('aiGenerateTags.registered');
  return true;  // 仅log,无实际注册
}
```

**缺失**:
- ❌ 无菜单命令
- ❌ 无工具栏按钮
- ❌ 无Item Pane入口
- ❌ 无默认关闭开关
- ❌ 无provider配置界面

---

### 6. Collection功能违反host-first原则

**问题**: 直接操作Zotero私有DOM:

```javascript
// collection-sort.js
const tree = doc.querySelector('#zotero-collections-tree');
const rows = tree.querySelectorAll('.tree-row');
// 通过prompt和DOM reorder实现排序
```

**违反contract要求**:
- ❌ 未使用wrapper
- ❌ 直接patch私有DOM
- ❌ 不可维护

---

### 7. Reader功能缺host evidence

**Margin Annotation问题**:
```javascript
// 直接依赖私有API
const reader = Zotero.Reader.getReaderByItemID(itemID);
const iframe = reader._iframeWindow;  // 私有属性
```

**缺失**:
- ❌ renderToolbar证据
- ❌ context-menu证据
- ❌ action replay证据
- ❌ cleanup路径

---

### 8. Format检查失败

运行 `npm run check`:
```
Format check failed:
src/features/ai-generate-remark.js - trailing whitespace (7处)
src/features/ai-generate-tags.js - trailing whitespace (4处)
src/features/annotation-colors.js - trailing whitespace (4处)
... (20+文件)
```

**影响**: 代码质量不符合标准

---

### 9. 测试环境问题

`feature-composer.test.js`:
```
Zotero is not defined
0/6 tests failed
```

**问题**: 主注册链在Node测试环境不干净

---

## 📊 真实完成度统计

| 分类 | 文档声称 | 实际存在 | 完成度 |
|------|---------|---------|--------|
| **源文件** | 57个 | 41个 | 72% |
| **配置完整性** | 100% | 30% | ❌ |
| **HTML资产** | 完整 | 0个 | ❌ |
| **功能可用性** | 100% | ~40% | ❌ |
| **代码质量** | 优秀 | 需修复 | ⚠️ |

---

## 🎯 核心差距

### 按Contract要求的差距分析:

| Contract要求 | 当前状态 | 差距 |
|-------------|---------|------|
| Feature inventory声明 | ❌ 未声明 | 需补充 |
| Clean-room boundary | ⚠️ 部分违反 | 需修正 |
| Host contract对齐 | ❌ 未对齐 | 需重构 |
| Wrapper usage | ❌ 未优先使用 | 需重构 |
| Surface evidence | ❌ 无证据 | 需补充 |
| State integrity | ⚠️ 部分缺失 | 需完善 |
| Default-off策略 | ❌ 缺失 | 需实现 |
| Cleanup路径 | ❌ 缺失 | 需实现 |

---

## 🚨 风险评估

### 高风险项:
1. **文档虚假声明** - 声称完成但实际不存在
2. **配置缺失** - 大量功能无配置项
3. **资产缺失** - HTML等静态资产不存在
4. **违反contract** - 直接操作私有DOM/API
5. **测试环境不干净** - 主注册链失败

### 中风险项:
1. **数据不一致** - dataProvider和renderCell类型不匹配
2. **代码质量** - format check失败
3. **无用户入口** - AI功能无法使用
4. **API未实现** - 外部元数据获取缺失

---

## 📝 正确的优先级

按contract要求应按以下顺序修复:

### Phase 1: 清理truth和配置 (1-2天)
1. 更正所有虚假文档
2. 补齐 `addon.config.json` schema
3. 实现PreferencePanes配置界面
4. 实现default-off策略

### Phase 2: 补缺失资产 (2-3天)
1. 创建annotation-manager.html
2. 补充静态资源
3. 实现缺失的11个feature文件
4. 添加用户可达入口

### Phase 3: 修正host contract违规 (3-5天)
1. Collection功能重构为wrapper-based
2. Reader功能补充host evidence
3. 清理私有DOM/API依赖
4. 补充cleanup路径

### Phase 4: 真机验证 (2-3天)
1. 修复测试环境
2. 真实Zotero环境测试
3. Surface evidence收集
4. Scenario验证

---

## ✅ 审计结论

**状态**: **FAIL**

**核心问题**:
1. 文档声称与实际严重不符
2. 配置schema不完整
3. 静态资产缺失
4. 违反clean-room contract
5. 缺少host evidence

**不能验收理由**:
- 不满足feature inventory要求
- 不满足wrapper-first原则
- 不满足surface evidence要求
- 不满足default-off要求
- 不满足cleanup要求

**建议**:
- 立即停止声称"100%完成"
- 按上述Phase逐步修复
- 建立严格的feature验收流程
- 补充真机测试证据

---

**下一步行动**: 制定详细的修复计划和timeline
