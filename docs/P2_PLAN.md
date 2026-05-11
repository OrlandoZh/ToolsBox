# P2阶段计划: 已存在功能变成真实可用

**目标**: 修复已存在但实际不可用的功能
**时间**: 预计3-4小时
**前置条件**: P0+P1已完成 ✅

---

## 📋 问题清单

### 2.1 Annotation Manager

**问题**: 打开HTML时无数据传入,存在XSS风险

**文件位置**:
- `src/features/annotation-manager.js:18` - 需要传入annotations
- `addon-static/content/annotation-manager.html:124` - innerHTML未转义

**修复方案**:
```javascript
// annotation-manager.js - 添加数据桥接
function openAnnotationManager(annotations) {
  const win = Zotero.getMainWindow().openDialog(
    'chrome://toolsbox/content/annotation-manager.html',
    'toolsbox-annotation-manager',
    'chrome,centerscreen,width=800,height=600',
    { annotations }
  );
}

// annotation-manager.html - 修复XSS
function renderAnnotation(ann) {
  const div = document.createElement('div');
  div.className = 'annotation-item';

  const text = document.createElement('div');
  text.className = 'annotation-text';
  text.textContent = ann.text; // 使用textContent而非innerHTML
  div.appendChild(text);

  return div;
}
```

**验收**: 打开窗口显示真实annotation数据,无XSS风险

---

### 2.2 AI Generate Tags / Remark

**问题**: 无用户入口,无API key时静默失败

**文件位置**:
- `src/features/ai-generate-tags.js` - 无菜单注册
- `src/features/ai-generate-remark.js` - 无菜单注册

**修复方案**:
```javascript
// feature-composer.js - 添加菜单入口
menuManager.registerItemMenuItem({
  id: 'toolsbox-ai-tags',
  label: i18n.t('menu.ai-generate-tags', 'Generate AI Tags'),
  onCommand: async (items) => {
    if (!prefs.get('openai.apiKey')) {
      Zotero.alert(null, 'ToolsBox', 'Please configure OpenAI API key in preferences');
      return;
    }
    const tags = await aiGenerateTags.generateTags(items[0]);
    // ...
  },
  disabled: () => !prefs.get('openai.apiKey')
});

// 同样添加 ai-generate-remark 入口
```

**验收**:
1. 无API key时菜单可见但disabled,点击提示配置
2. 有API key时菜单可用,执行成功

---

### 2.3 Cited Count Column

**问题**: 只读Extra字段,非真实API集成

**文件位置**:
- `src/features/cited-count-column.js:22-25` - dataProvider只匹配Extra

**修复方案** (短期):
```javascript
// 文档明确说明: 当前实现仅读取Extra缓存字段
// 用户需要手动从Semantic Scholar同步到Extra:
// Extra字段格式: "Cited Count: 42"

// 或提供手动同步按钮
menuManager.registerItemMenuItem({
  id: 'toolsbox-sync-cited',
  label: i18n.t('menu.sync-cited-count', 'Sync Citation Count'),
  onCommand: async (items) => {
    const item = items[0];
    const doi = item.getField('DOI');
    if (!doi) {
      Zotero.alert(null, 'ToolsBox', 'Item has no DOI');
      return;
    }
    // 调用Semantic Scholar API
    const count = await semanticScholarClient.getCitedCount(doi);
    // 写入Extra字段
    item.setField('extra', updateExtraField(item, 'Cited Count', count));
    await item.saveTx();
  }
});
```

**验收**: 文档明确说明当前为缓存读取,或提供手动同步按钮

---

### 2.4 IF Column

**问题**: dataProvider与renderCell数据形态不一致

**文件位置**:
- `src/features/if-column.js` - 需要检查数据流

**修复方案**:
```javascript
// 统一数据形态: dataProvider返回对象,renderCell处理对象
function dataProvider(item, dataKey) {
  const extra = item.getField?.('extra') || '';
  const ifMatch = extra.match(/IF: ([\d.]+)/);

  return {
    value: ifMatch ? parseFloat(ifMatch[1]) : 0,
    year: extra.match(/IF Year: (\d{4})/)?.[1] || null
  };
}

function renderCell(index, data, column) {
  const doc = Zotero.getMainWindow().document;
  const cell = doc.createElement('div');

  if (typeof data === 'object' && data.value) {
    cell.textContent = data.value.toFixed(2);
    if (data.year) {
      cell.title = `IF ${data.year}`;
    }
  } else {
    cell.textContent = String(data || '0');
  }

  return cell;
}
```

**验收**: 列正确显示IF值,无undefined显示

---

### 2.5 Attachment Preview

**问题**: iframe file:// 安全边界不明确

**文件位置**:
- `src/features/attachment-preview.js` - 需要审查

**修复方案**:
```javascript
// 添加类型白名单和空状态处理
const ALLOWED_TYPES = [
  'application/pdf',
  'image/png', 'image/jpeg', 'image/gif',
  'text/plain'
];

function renderPreview(attachment) {
  const contentType = attachment.attachmentContentType;

  if (!ALLOWED_TYPES.includes(contentType)) {
    return renderEmptyState('Preview not available for this file type');
  }

  const path = attachment.getFilePath();
  if (!path || !fileExists(path)) {
    return renderEmptyState('File not found');
  }

  // 使用moz-file安全协议
  iframe.src = `moz-file://${encodeURIComponent(path)}`;
}

function cleanup() {
  if (iframe) {
    iframe.src = 'about:blank';
    iframe.remove();
  }
}
```

**验收**:
1. 只允许白名单类型预览
2. 空状态正确显示
3. cleanup时清理iframe

---

## 🔧 执行顺序

### Phase 2A: 简单修复 (1小时)
1. ✅ IF Column 数据形态修复
2. ✅ Cited Count 文档明确

### Phase 2B: 安全修复 (1小时)
3. ✅ Annotation Manager XSS修复
4. ✅ Attachment Preview 安全边界

### Phase 2C: 功能入口 (1-2小时)
5. ✅ AI Generate Tags 菜单入口
6. ✅ AI Generate Remark 菜单入口

---

## 📝 验收标准

**每个功能需满足**:
- [ ] 有用户入口(菜单/按钮/快捷键)
- [ ] 无数据时显示空状态而非崩溃
- [ ] 无配置时有明确提示而非静默失败
- [ ] cleanup函数真实清理资源
- [ ] 有基本测试覆盖

---

## 🚀 开始执行

我建议按以下顺序逐个修复:
1. IF Column (最简单)
2. Cited Count 文档 (次简单)
3. Annotation Manager (安全关键)
4. Attachment Preview (安全关键)
5. AI菜单入口 (功能完善)

是否批准此计划?
