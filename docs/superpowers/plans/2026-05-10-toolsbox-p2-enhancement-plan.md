# ToolsBox P2 中优先级功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现P2中优先级功能,包括标签系统增强、Workflow改进、Reader增强和AI集成功能。

**Architecture:** 采用Zotero官方API为主,辅以必要的DOM操作和外部API集成。AI功能使用OpenAI API,其他功能基于本地数据管理。

**Tech Stack:** Zotero 7/8插件开发,Zotero API,OpenAI API,DOM操作,Fluent本地化

---

## 功能范围

P2中优先级包含6个核心功能,按优先级排序:

1. **Nested Tags** - 层级标签显示 (最简单,优先开发)
2. **View Groups** - 视图预设保存 (中等)
3. **Annotation Colors** - 批注颜色面板 (中等)
4. **AI Generate Tags** - OpenAI标签生成 (中等,需API)
5. **AI Generate Remark** - AI备注生成 (中等,需API)
6. **PDF Background Color** - PDF背景色 (简单)

---

## Task 1: Nested Tags (层级标签)

**Complexity**: Simple  
**Estimated Time**: 1-2 hours  
**Dependencies**: None

**Architecture:**
- 数据源: 从item.getTags()获取标签数据
- 层级解析: 支持#/分隔符,解析为层级结构
- 可视化: 在Tags列显示层级缩进和连接符号
- 配置: 分隔符(#/),连接符号(→/|),缩进宽度

- [ ] **Implement Nested Tags**

**Files:**
- Create: `src/features/nested-tags.js`
- Test: `tests/features/test-nested-tags.js`

**Implementation:**
```javascript
export function createNestedTags(options) {
  const { logger, prefs } = options;
  
  const separator = prefs?.get?.('nestedTags.separator') || '#';
  const connector = prefs?.get?.('nestedTags.connector') || '→';
  const indentWidth = parseInt(prefs?.get?.('nestedTags.indentWidth') || '10');
  
  function parseNestedTags(tags) {
    // 解析层级标签
    // 输入: ['AI#DeepLearning#CNN', 'Method#CNN']
    // 输出: [{level: 0, text: 'AI'}, {level: 1, text: 'DeepLearning'}, ...]
  }
  
  function renderNestedTags(doc, parsedTags) {
    // 渲染层级标签,带缩进和连接符号
  }
  
  return { parseNestedTags, renderNestedTags };
}
```

---

## Task 2: View Groups (视图预设)

**Complexity**: Medium  
**Estimated Time**: 2-3 hours  
**Dependencies**: None

**Architecture:**
- 数据源: ItemTree列可见性状态
- 存储: 在prefs中存储视图配置 (JSON)
- 功能: 保存视图、切换视图、删除视图
- 配置: 视图名称、列可见性列表

- [ ] **Implement View Groups**

**Files:**
- Create: `src/features/view-groups.js`
- Test: `tests/features/test-view-groups.js`

**Implementation:**
```javascript
export function createViewGroups(options) {
  const { logger, zotero, prefs } = options;
  
  function saveView(name, columnVisibility) {
    // 保存当前视图配置
    // columnVisibility: {title: true, date: false, tags: true, ...}
  }
  
  function loadView(name) {
    // 加载视图配置并应用
  }
  
  function getSavedViews() {
    // 返回所有已保存的视图列表
  }
  
  function deleteView(name) {
    // 删除视图
  }
  
  return { saveView, loadView, getSavedViews, deleteView };
}
```

---

## Task 3: Annotation Colors (批注颜色面板)

**Complexity**: Medium  
**Estimated Time**: 2-3 hours  
**Dependencies**: Zotero Annotations API

**Architecture:**
- 数据源: Zotero.Annotations批注颜色数据
- 颜色方案: 预定义颜色+用户自定义颜色
- 功能: 颜色选择、颜色命名、分组管理
- 配置: 颜色列表、颜色名称、分组标签

- [ ] **Implement Annotation Colors**

**Files:**
- Create: `src/features/annotation-colors.js`
- Test: `tests/features/test-annotation-colors.js`

**Implementation:**
```javascript
export function createAnnotationColors(options) {
  const { logger, zotero, prefs } = options;
  
  const colorScheme = [
    { color: '#ffd700', name: 'Important', group: 'Priority' },
    { color: '#ff6b6b', name: 'Key Point', group: 'Priority' },
    { color: '#4ecdc4', name: 'Method', group: 'Content' },
    { color: '#45b7d1', name: 'Result', group: 'Content' },
    // ... more colors
  ];
  
  function getColorName(color) {
    // 根据颜色值返回名称
  }
  
  function getColorsByGroup(group) {
    // 返回指定分组的颜色列表
  }
  
  function applyColorToAnnotation(annotationID, color) {
    // 为批注应用颜色
  }
  
  return { getColorName, getColorsByGroup, applyColorToAnnotation };
}
```

---

## Task 4: AI Generate Tags (AI标签生成)

**Complexity**: Medium (需API集成)  
**Estimated Time**: 3-4 hours  
**Dependencies**: OpenAI API

**Architecture:**
- API集成: OpenAI Chat Completion API
- Prompt配置: 用户可自定义prompt
- 流程: 提取摘要 → 发送到OpenAI → 解析返回标签 → 保存到item
- 缓存: 避免重复调用API (缓存到item.extra)

- [ ] **Implement AI Generate Tags**

**Files:**
- Create: `src/services/openai-client.js`
- Create: `src/features/ai-generate-tags.js`
- Test: `tests/features/test-ai-generate-tags.js`

**Implementation:**
```javascript
// src/services/openai-client.js
export function createOpenAIClient(options) {
  const { apiKey, baseUrl } = options;
  
  async function chatCompletion(prompt, content) {
    // 调用OpenAI Chat Completion API
    // POST https://api.openai.com/v1/chat/completions
    // Headers: Authorization: Bearer {apiKey}
    // Body: {model: 'gpt-3.5-turbo', messages: [{role: 'user', content: `${prompt}\n${content}`}]}
  }
  
  return { chatCompletion };
}

// src/features/ai-generate-tags.js
export function createAIGenerateTags(options) {
  const { logger, openaiClient, prefs } = options;
  
  const prompt = prefs?.get?.('aiGenerateTags.prompt') || 
    'Returns 3 tags that fit this abstract as a JSON list.';
  
  async function generateTags(item) {
    // 1. 提取摘要 (item.getField('abstractNote'))
    // 2. 调用OpenAI API
    // 3. 解析返回的JSON标签列表
    // 4. 保存到item.tags
  }
  
  return { generateTags };
}
```

---

## Task 5: AI Generate Remark (AI备注生成)

**Complexity**: Medium (需API集成)  
**Estimated Time**: 2-3 hours  
**Dependencies**: OpenAI API (复用Task 4的client)

**Architecture:**
- API集成: 复用OpenAI client from Task 4
- Prompt配置: 用户可自定义摘要生成prompt
- 流程: 提取标题+摘要 → 发送到OpenAI → 生成简要备注 → 保存到item.extra

- [ ] **Implement AI Generate Remark**

**Files:**
- Create: `src/features/ai-generate-remark.js`
- Test: `tests/features/test-ai-generate-remark.js`

**Implementation:**
```javascript
export function createAIGenerateRemark(options) {
  const { logger, openaiClient, prefs } = options;
  
  const prompt = prefs?.get?.('aiGenerateRemark.prompt') || 
    'Generate a brief remark (2-3 sentences) summarizing this paper.';
  
  async function generateRemark(item) {
    // 1. 提取标题和摘要
    // 2. 调用OpenAI API
    // 3. 生成备注文本
    // 4. 保存到item.extra
  }
  
  return { generateRemark };
}
```

---

## Task 6: PDF Background Color (PDF背景色)

**Complexity**: Simple  
**Estimated Time**: 1 hour  
**Dependencies**: Zotero Reader API

**Architecture:**
- 数据源: Reader实例的PDF viewer
- 应用: 通过CSS或DOM操作修改PDF背景色
- 配置: 背景色选择、主题适配 (light/dark模式)

- [ ] **Implement PDF Background Color**

**Files:**
- Create: `src/features/pdf-background-color.js`
- Test: `tests/features/test-pdf-background-color.js`

**Implementation:**
```javascript
export function createPDFBackgroundColor(options) {
  const { logger, zotero, prefs } = options;
  
  const backgroundColor = prefs?.get?.('pdfBackground.color') || '#f5f5dc';
  
  function applyBackgroundColor(reader) {
    // 修改Reader的PDF viewer背景色
    // reader._iframeWindow.document.body.style.backgroundColor = backgroundColor
  }
  
  return { applyBackgroundColor };
}
```

---

## 实施顺序和优先级

**Phase 1 (最简单,快速完成):**
1. Nested Tags (1-2h)
2. PDF Background Color (1h)

**Phase 2 (中等复杂度):**
3. View Groups (2-3h)
4. Annotation Colors (2-3h)

**Phase 3 (需API集成):**
5. AI Generate Tags (3-4h)
6. AI Generate Remark (2-3h) - 复用OpenAI client

**预计总时间:** 12-16小时

---

## 验证和收尾

- [ ] **Run all tests**: All 240+ tests pass
- [ ] **Update documentation**: CURRENT_BACKLOG.md, FEATURE_GAP_ANALYSIS.md
- [ ] **Create release tag**: v0.7.0-p2-enhancements

---

**计划完成!准备执行。**

**关键注意事项:**
- Nested Tags需解析标签字符串,支持多种分隔符
- View Groups需处理ItemTree API的列可见性管理
- Annotation Colors需理解Zotero批注颜色存储格式
- AI功能需OpenAI API key配置,建议使用gpt-3.5-turbo降低成本
- PDF Background Color需处理不同Reader版本的DOM结构差异