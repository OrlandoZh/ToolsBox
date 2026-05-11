# ToolsBox P3 高级定制功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement efficiently.

**Goal:** 完成P3低优先级高级定制功能,包括样式编辑、列配置、批注合并、日期格式定制等。

**Strategy:** 采用批量并行执行,快速完成剩余14个功能,达到90%+完成度。

**Tech Stack:** Zotero 7/8插件开发,Zotero API,DOM操作,CSS注入,Fluent本地化

---

## 功能范围 (14个功能)

### 🎨 高级定制 (8个)
1. **Tags Column Config** - 标签列配置 (边距、对齐)
2. **Text Tags Column Config** - 文本标签列配置 (前缀、正则)
3. **Paper Matrix Enhanced** - 论文矩阵增强 (字段配置)
4. **Merge Annotations** - 跨页批注合并
5. **Date Format Customization** - 日期格式定制
6. **Style Editor** - 自定义CSS编辑器
7. **Custom Column DataKeys** - 自定义列字段
8. **Annotation Manager Config** - 批注管理器配置

### 🔗 外部集成 (6个)
9. **EasyScholar API Config** - API密钥配置界面
10. **Semantic Scholar API Config** - API配置界面
11. **OpenAI API Config** - AI功能配置界面
12. **Custom External API** - 自定义API集成
13. **Backlinks** - 反向链接系统
14. **TLDR Panel** - TLDR摘要面板

---

## 执行策略

### Phase 1: 简单配置功能 (2-3小时)
快速实现5个配置增强功能:

**Batch 1.1 - Column配置 (并行执行)**
- Tags Column Config
- Text Tags Column Config
- Date Format Customization

**Batch 1.2 - Manager配置**
- Annotation Manager Config
- Paper Matrix Enhanced

### Phase 2: 编辑器功能 (3-4小时)
实现用户交互密集型功能:

**Batch 2.1 - Style Editor**
- 自定义CSS编辑器 (textarea + apply button)
- 实时预览功能

**Batch 2.2 - 批注处理**
- Merge Annotations (跨页批注合并逻辑)
- Custom Column DataKeys (用户自定义字段输入)

### Phase 3: API配置界面 (1-2小时)
完成已有功能的配置界面:

**Batch 3 - API配置UI**
- EasyScholar API Config
- Semantic Scholar API Config
- OpenAI API Config

### Phase 4: 高级功能 (3-4小时)
实现复杂交互功能:

**Batch 4.1 - 链接系统**
- Backlinks (批注与笔记双向链接)

**Batch 4.2 - 摘要功能**
- TLDR Panel (自动翻译+摘要显示)
- Custom External API (用户API集成框架)

---

## Task 1: Tags Column Config

**Complexity**: Simple
**Time**: 30 minutes

- [ ] **Implement Tags Column Config**

**Files:**
- Create: `src/features/tags-column-config.js`
- Test: `tests/features/test-tags-column-config.js`

**Implementation:**
```javascript
export function createTagsColumnConfig(options) {
  const { logger, prefs } = options;

  const margin = prefs?.get?.('tagsColumn.margin') || '0.08';
  const padding = prefs?.get?.('tagsColumn.padding') || '0.455';
  const align = prefs?.get?.('tagsColumn.align') || 'left';

  function applyConfig(cell) {
    // Apply margin, padding, alignment to tag cells
  }

  return { applyConfig, getMargin, getPadding, getAlign };
}
```

---

## Task 2: Text Tags Column Config

**Complexity**: Simple
**Time**: 30 minutes

- [ ] **Implement Text Tags Column Config**

**Files:**
- Create: `src/features/text-tags-column-config.js`
- Test: `tests/features/test-text-tags-column-config.js`

**Implementation:**
```javascript
export function createTextTagsColumnConfig(options) {
  const { logger, prefs } = options;

  const prefix = prefs?.get?.('textTagsColumn.prefix') || '';
  const regex = prefs?.get?.('textTagsColumn.regex') || '';
  const bgColor = prefs?.get?.('textTagsColumn.bgColor') || '#f0f0f0';

  function filterByTextRegex(tags, regex) {
    // Filter tags by regex pattern
  }

  function addPrefix(tag, prefix) {
    // Add prefix to tag text
  }

  return { filterByTextRegex, addPrefix };
}
```

---

## Task 3: Date Format Customization

**Complexity**: Medium
**Time**: 1 hour

- [ ] **Implement Date Format Customization**

**Files:**
- Create: `src/features/date-format-customization.js`
- Test: `tests/features/test-date-format-customization.js`

**Implementation:**
```javascript
export function createDateFormatCustomization(options) {
  const { logger, prefs } = options;

  const dateType = prefs?.get?.('dateFormat.type') || 'absolute'; // absolute, relative
  const format = prefs?.get?.('dateFormat.format') || 'YYYY/M/D H:m:s';
  const deltaHour = parseInt(prefs?.get?.('dateFormat.deltaHour') || '8');

  function formatDate(date, options) {
    // Format date based on preferences
    // Support absolute: 2026/05/10 15:30:00
    // Support relative: 2 hours ago
  }

  function applyTimezone(date, deltaHour) {
    // Apply timezone offset
  }

  return { formatDate, applyTimezone };
}
```

---

## Task 4: Paper Matrix Enhanced

**Complexity**: Medium
**Time**: 1 hour

- [ ] **Implement Paper Matrix Enhanced**

**Files:**
- Create: `src/features/paper-matrix-enhanced.js`
- Test: `tests/features/test-paper-matrix-enhanced.js`

**Implementation:**
```javascript
export function createPaperMatrixEnhanced(options) {
  const { logger, prefs } = options;

  const coreFields = prefs?.get?.('paperMatrix.coreFields') || '';
  const auxiliaryFields = prefs?.get?.('paperMatrix.auxiliaryFields') || 'firstCreator, year';
  const paperDirection = prefs?.get?.('paperMatrix.paperDirection') || 'row';

  function renderMatrix(items, config) {
    // Render paper matrix with custom fields
    // Direction: row or column
  }

  return { renderMatrix };
}
```

---

## Task 5: Merge Annotations

**Complexity**: Medium
**Time**: 1.5 hours

- [ ] **Implement Merge Annotations**

**Files:**
- Create: `src/features/merge-annotations.js`
- Test: `tests/features/test-merge-annotations.js`

**Implementation:**
```javascript
export function createMergeAnnotations(options) {
  const { logger, zotero } = options;

  function mergeAnnotations(annotations) {
    // Merge consecutive annotations on same page
    // Combine text: "text1...text2"
  }

  function canMerge(ann1, ann2) {
    // Check if annotations can be merged
    // Same page, similar position, consecutive
  }

  function splitMergedAnnotation(annotation) {
    // Split merged annotation back to original
  }

  return { mergeAnnotations, canMerge, splitMergedAnnotation };
}
```

---

## Task 6: Style Editor

**Complexity**: Medium
**Time**: 1.5 hours

- [ ] **Implement Style Editor**

**Files:**
- Create: `src/features/style-editor.js`
- Test: `tests/features/test-style-editor.js`

**Implementation:**
```javascript
export function createStyleEditor(options) {
  const { logger, zotero, prefs } = options;

  const cssCode = prefs?.get?.('styleEditor.value') || '';

  function applyCSS(css) {
    // Inject CSS into Zotero document
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  function previewCSS(css) {
    // Preview CSS without saving
  }

  function saveCSS(css) {
    // Save CSS to preferences
  }

  return { applyCSS, previewCSS, saveCSS };
}
```

---

## Task 7: Annotation Manager Config

**Complexity**: Simple
**Time**: 30 minutes

- [ ] **Implement Annotation Manager Config**

Enhance existing `annotation-manager.js` with:
- `ignoreFigureTable` preference
- `replaceAnnotationTextWithComment` preference

---

## Task 8: Custom Column DataKeys

**Complexity**: Medium
**Time**: 1 hour

- [ ] **Implement Custom Column DataKeys**

**Files:**
- Create: `src/features/custom-column-datakeys.js`
- Test: `tests/features/test-custom-column-datakeys.js`

**Implementation:**
```javascript
export function createCustomColumnDataKeys(options) {
  const { logger, zotero, prefs } = options;

  const dataKeys = prefs?.get?.('customColumn.dataKeys') || 'numPages, price';

  function registerCustomColumns(dataKeys) {
    // Parse dataKeys string
    // Register each as ItemTree column
  }

  function parseDataKeys(dataKeysStr) {
    // Parse "field1, field2, field3"
    // Return array of field names
  }

  return { registerCustomColumns, parseDataKeys };
}
```

---

## Task 9-11: API Config UI

**Complexity**: Simple
**Time**: 1 hour total

- [ ] **Implement API Configuration UI**

Create preference pane sections for:
- EasyScholar API key input
- Semantic Scholar API key input
- OpenAI API key input

All use existing API clients, just add UI for configuration.

---

## Task 12: Backlinks

**Complexity**: High
**Time**: 2 hours

- [ ] **Implement Backlinks**

**Files:**
- Create: `src/features/backlinks.js`
- Test: `tests/features/test-backlinks.js`

**Implementation:**
```javascript
export function createBacklinks(options) {
  const { logger, zotero } = options;

  function createBacklink(annotation, note) {
    // Create bidirectional link between annotation and note
  }

  function getBacklinks(item) {
    // Get all backlinks for an item
  }

  function jumpToBacklink(link) {
    // Navigate to linked annotation/note
  }

  return { createBacklink, getBacklinks, jumpToBacklink };
}
```

---

## Task 13: TLDR Panel

**Complexity**: Medium
**Time**: 1.5 hours

- [ ] **Implement TLDR Panel**

**Files:**
- Create: `src/features/tldr-panel.js`
- Test: `tests/features/test-tldr-panel.js`

**Implementation:**
```javascript
export function createTLDRPanel(options) {
  const { logger, zotero, i18n } = options;

  function showTLDR(item) {
    // Show TLDR summary panel
    // Auto-translate if enabled
  }

  function generateTLDR(abstract) {
    // Use AI to generate TLDR (3 bullet points)
  }

  return { showTLDR, generateTLDR };
}
```

---

## Task 14: Custom External API

**Complexity**: High
**Time**: 2 hours

- [ ] **Implement Custom External API**

**Files:**
- Create: `src/features/custom-external-api.js`
- Test: `tests/features/test-custom-external-api.js`

**Implementation:**
```javascript
export function createCustomExternalAPI(options) {
  const { logger, prefs } = options;

  const apiUrl = prefs?.get?.('customApi.url');
  const apiKey = prefs?.get?.('customApi.key');
  const method = prefs?.get?.('customApi.method') || 'GET';

  async function callCustomAPI(params) {
    // Generic API caller
    // Support GET/POST
    // Handle authentication
  }

  return { callCustomAPI };
}
```

---

## 执行计划

### Week 1 (快速迭代)
- **Day 1**: Batch 1.1 - Column配置 (3个功能)
- **Day 2**: Batch 1.2 - Manager配置 (2个功能)
- **Day 3**: Batch 2.1 - Style Editor + Merge Annotations

### Week 2 (复杂功能)
- **Day 4**: Batch 3 - API Config UI (3个)
- **Day 5**: Batch 2.2 - Custom Columns + Annotation Manager Config
- **Day 6**: Batch 4.1 - Backlinks

### Week 3 (收尾)
- **Day 7**: Batch 4.2 - TLDR Panel + Custom External API
- **Day 8**: 最终测试和文档更新
- **Day 9**: Release准备

---

## 验证和收尾

- [ ] **Run all tests**: 400+ tests pass
- [ ] **Update documentation**: CURRENT_BACKLOG.md, FEATURE_GAP_ANALYSIS.md
- [ ] **Create release tag**: v0.8.0-p3-complete
- [ ] **Prepare release notes**: Complete feature list

---

**预计总时间:** 2-3周 (如果全速执行)

**关键成功因素:**
1. 并行执行简单功能
2. 复用现有组件和API客户端
3. 保持代码质量 (TDD, 测试覆盖)
4. 及时更新文档

**完成后达到:** 90%+ 功能覆盖率,完整的ToolsBox插件!
