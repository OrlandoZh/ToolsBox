# ToolsBox P3 最终功能实施计划

> **For agentic workers:** Use superpowers:subagent-driven-development for efficient execution.

**Goal:** 完成剩余5个P3功能,达到95%+完成度

**Strategy:** 批量并行执行,每个功能30-60分钟

---

## 剩余功能清单 (5个)

### 🎯 优先级排序

**Medium Priority (2个):**
1. **Annotation Color Names** - 批注颜色名称显示 (30分钟)
2. **Annotation Manager Config** - 管理器配置增强 (45分钟)

**Low Priority (3个):**
3. **Paper Matrix Enhanced** - 论文矩阵增强 (60分钟)
4. **Attachment Version Switch** - 附件版本切换 (45分钟)
5. **Custom External API** - 自定义API框架 (60分钟)

---

## Task 1: Annotation Color Names

**Complexity**: Simple  
**Time**: 30 minutes  
**Dependencies**: Annotation Colors (已完成)

**Architecture:**
- 在批注旁显示颜色名称标签
- 配置显示方向(左/右)
- 使用DOM操作在批注元素旁插入标签

**Implementation:**
```javascript
// src/features/annotation-color-names.js
export function createAnnotationColorNames(options) {
  const { logger, zotero, annotationColors, prefs } = options;
  
  const showNames = prefs?.get?.('annotationColorNames.show') !== false;
  const direction = prefs?.get?.('annotationColorNames.direction') || 'right';
  
  function addColorNameToAnnotation(annotationElement, color) {
    const colorName = annotationColors.getColorName(color);
    
    const label = document.createElement('span');
    label.className = 'annotation-color-name';
    label.textContent = colorName;
    label.style.cssText = `
      font-size: 10px;
      color: #666;
      margin-${direction === 'right' ? 'left' : 'right'}: 4px;
    `;
    
    if (direction === 'right') {
      annotationElement.appendChild(label);
    } else {
      annotationElement.insertBefore(label, annotationElement.firstChild);
    }
  }
  
  function register() {
    // Monitor annotation rendering and add color names
    Zotero.Notifier.registerObserver({
      notify: (event, type, ids) => {
        if (type === 'annotation' && showNames) {
          // Find annotation elements and add color names
        }
      }
    }, ['annotation']);
    
    return true;
  }
  
  return { register, addColorNameToAnnotation };
}
```

**Preferences:**
- `annotationColorNames.show` (default: true)
- `annotationColorNames.direction` (default: 'right')

**Tests:** 15+ test cases

---

## Task 2: Annotation Manager Config

**Complexity**: Medium  
**Time**: 45 minutes  
**Dependencies**: Annotation Manager (已完成)

**Architecture:**
- 增强现有annotation-manager.js
- 添加配置选项
- 实现过滤和替换功能

**Implementation:**
```javascript
// 增强 src/features/annotation-manager.js
export function createAnnotationManager(options) {
  // ... 现有代码 ...
  
  // 新增配置
  const ignoreFigureTable = prefs?.get?.('annotationManager.ignoreFigureTable') !== false;
  const replaceTextWithComment = prefs?.get?.('annotationManager.replaceTextWithComment') || false;
  
  function filterAnnotations(annotations) {
    if (ignoreFigureTable) {
      return annotations.filter(ann => {
        // 检查是否为图表批注
        const text = ann.annotationText || '';
        return !text.includes('Figure') && !text.includes('Table');
      });
    }
    return annotations;
  }
  
  function processAnnotationText(annotation) {
    if (replaceTextWithComment && annotation.comment) {
      // 用注释替换批注文本
      return annotation.comment;
    }
    return annotation.annotationText;
  }
  
  return { 
    // ... 现有函数 ...
    filterAnnotations,
    processAnnotationText 
  };
}
```

**Preferences:**
- `annotationManager.ignoreFigureTable` (default: true)
- `annotationManager.replaceTextWithComment` (default: false)

**Tests:** 18+ test cases

---

## Task 3: Paper Matrix Enhanced

**Complexity**: Medium  
**Time**: 60 minutes  
**Dependencies**: 现有matrix功能

**Architecture:**
- 字段配置灵活性
- 布局方向切换(row/column)
- 动态字段排序

**Implementation:**
```javascript
// src/features/paper-matrix-enhanced.js
export function createPaperMatrixEnhanced(options) {
  const { logger, zotero, prefs } = options;
  
  const coreFields = (prefs?.get?.('paperMatrix.coreFields') || '').split(',').filter(f => f);
  const auxiliaryFields = (prefs?.get?.('paperMatrix.auxiliaryFields') || 'firstCreator, year').split(',').filter(f => f);
  const direction = prefs?.get?.('paperMatrix.direction') || 'row';
  
  function renderMatrix(items, config) {
    const table = document.createElement('table');
    table.className = 'paper-matrix';
    table.style.direction = direction === 'row' ? 'ltr' : 'ltr';
    
    if (direction === 'row') {
      // Rows = papers, Columns = fields
      items.forEach(item => {
        const row = document.createElement('tr');
        [...coreFields, ...auxiliaryFields].forEach(field => {
          const cell = document.createElement('td');
          cell.textContent = item.getField(field) || '-';
          row.appendChild(cell);
        });
        table.appendChild(row);
      });
    } else {
      // Rows = fields, Columns = papers
      [...coreFields, ...auxiliaryFields].forEach(field => {
        const row = document.createElement('tr');
        items.forEach(item => {
          const cell = document.createElement('td');
          cell.textContent = item.getField(field) || '-';
          row.appendChild(cell);
        });
        table.appendChild(row);
      });
    }
    
    return table;
  }
  
  return { renderMatrix, getCoreFields, getAuxiliaryFields, getDirection };
}
```

**Preferences:**
- `paperMatrix.coreFields` (default: '')
- `paperMatrix.auxiliaryFields` (default: 'firstCreator, year')
- `paperMatrix.direction` (default: 'row')

**Tests:** 20+ test cases

---

## Task 4: Attachment Version Switch

**Complexity**: Medium  
**Time**: 45 minutes  
**Dependencies**: Zotero Attachment API

**Architecture:**
- 检测多版本附件
- 版本切换UI
- 记住最后使用版本

**Implementation:**
```javascript
// src/features/attachment-version-switch.js
export function createAttachmentVersionSwitch(options) {
  const { logger, zotero, prefs } = options;
  
  function getAttachmentVersions(item) {
    // 获取item的所有附件版本
    const attachments = Zotero.Items.get(item.getAttachments());
    // 按修改时间排序
    return attachments.sort((a, b) => b.dateModified - a.dateModified);
  }
  
  function switchVersion(item, attachmentID) {
    // 切换到指定版本
    const versions = getAttachmentVersions(item);
    const target = versions.find(v => v.id === attachmentID);
    
    if (target) {
      // 打开指定版本
      Zotero.Reader.open(attachmentID);
      logger.debug('attachmentVersion.switched', { attachmentID });
      return true;
    }
    
    return false;
  }
  
  function createVersionMenu(item) {
    // 创建版本切换菜单
    const versions = getAttachmentVersions(item);
    if (versions.length <= 1) return null;
    
    const menu = document.createElement('menupopup');
    versions.forEach((v, i) => {
      const menuItem = document.createElement('menuitem');
      menuItem.label = `Version ${i + 1} - ${v.dateModified}`;
      menuItem.onclick = () => switchVersion(item, v.id);
      menu.appendChild(menuItem);
    });
    
    return menu;
  }
  
  return { getAttachmentVersions, switchVersion, createVersionMenu };
}
```

**Tests:** 18+ test cases

---

## Task 5: Custom External API

**Complexity**: High  
**Time**: 60 minutes  
**Dependencies**: 通用HTTP客户端

**Architecture:**
- 用户自定义API配置
- 通用请求框架
- 响应处理和缓存

**Implementation:**
```javascript
// src/features/custom-external-api.js
export function createCustomExternalAPI(options) {
  const { logger, prefs } = options;
  
  const apiUrl = prefs?.get?.('customApi.url');
  const apiKey = prefs?.get?.('customApi.key');
  const method = prefs?.get?.('customApi.method') || 'GET';
  const headers = JSON.parse(prefs?.get?.('customApi.headers') || '{}');
  
  async function callCustomAPI(params) {
    if (!apiUrl) {
      logger.error('customApi.noUrl');
      return { success: false, error: 'No API URL configured' };
    }
    
    try {
      const response = await fetch(apiUrl, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
          ...(apiKey && { 'Authorization': `Bearer ${apiKey}` })
        },
        ...(method === 'POST' && { body: JSON.stringify(params) })
      });
      
      const data = await response.json();
      
      logger.debug('customApi.called', { url: apiUrl, status: response.status });
      return { success: true, data };
    } catch (error) {
      logger.error('customApi.failed', { error: error.message });
      return { success: false, error: error.message };
    }
  }
  
  function testConnection() {
    return callCustomAPI({ test: true });
  }
  
  return { callCustomAPI, testConnection };
}
```

**Preferences:**
- `customApi.url` (default: '')
- `customApi.key` (default: '')
- `customApi.method` (default: 'GET')
- `customApi.headers` (default: '{}')

**Tests:** 20+ test cases

---

## 执行计划

### Week 1 Day 1-2 (批量执行)
- **Hour 1**: Task 1 - Annotation Color Names (30min) + Task 2 - Annotation Manager Config (45min)
- **Hour 2**: Task 3 - Paper Matrix Enhanced (60min)
- **Hour 3**: Task 4 - Attachment Version Switch (45min) + Task 5 - Custom External API (60min)

### 验证和收尾
- 运行所有测试 (400+ tests)
- 更新文档 (FEATURE_GAP_ANALYSIS.md, CURRENT_BACKLOG.md)
- 创建release标签: v1.0.0-final
- 准备发布说明

---

## 预期成果

完成后达到:
- **完成度**: 95%+ (62个功能中的59个)
- **剩余**: 3个可选功能
- **状态**: 完全生产就绪

---

**总耗时**: 约4小时 (批量并行执行可缩短至3小时)