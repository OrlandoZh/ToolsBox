# ToolsBox 真实修复计划

> **基于**: REAL_STATUS_AUDIT.md审计结果
> **目标**: 达到clean-room contract验收标准
> **预计**: 8-12天完整修复

---

## 🎯 修复目标

从当前**FAIL状态**达到**PASS验收标准**:
- ✅ Feature inventory完整声明
- ✅ Wrapper-first实现
- ✅ Surface evidence充分
- ✅ Default-off策略完整
- ✅ Cleanup路径清晰
- ✅ Host contract对齐

---

## 📋 Phase 1: 清理虚假文档 (0.5天)

### 目标
更正所有虚假声明,建立真实基线

### 任务
1. **删除/更新虚假文档**:
   - ❌ 删除 `FEATURE_AUDIT_REPORT.md` (声称100%但不真实)
   - ✏️ 更新 `FEATURE_GAP_ANALYSIS.md` (移除不存在的功能)
   - ✏️ 更新 `CURRENT_BACKLOG.md` (反映真实状态)

2. **创建真实状态文档**:
   - ✅ 保留 `REAL_STATUS_AUDIT.md`
   - 📝 创建 `CLEANROOM_COMPLIANCE.md` (contract对齐检查表)

3. **Git提交**:
   ```bash
   git commit -m "docs: correct false completion claims, establish honest baseline"
   ```

### 验收标准
- 所有文档反映真实状态
- 无虚假"100%"声称
- 清晰标注实际完成度(72%)

---

## 📋 Phase 2: 补齐配置Schema (1天)

### 目标
为所有已实现功能补充完整配置

### 任务
1. **扩展addon.config.json**:
   ```json
   {
     "defaultPrefs": {
       // 现有配置...

       // 新增缺失配置
       "annotationManager.enabled": true,
       "annotationManager.ignoreFigureTable": true,
       "annotationManager.replaceTextWithComment": false,

       "ifColumn.enabled": true,
       "ifColumn.field": "sciif",
       "ifColumn.text": true,
       "ifColumn.progress": true,
       "ifColumn.color": "#41a1a2",
       "ifColumn.max": 15,

       "publicationTagsColumn.enabled": true,
       "publicationTagsColumn.fields": "sciif, sci, utd24, ajg",

       "marginAnnotation.enabled": false,  // default-off
       "marginAnnotation.width": 200,
       "marginAnnotation.color": "#86C8BC",

       "aiGenerateTags.enabled": false,  // default-off
       "aiGenerateTags.prompt": "Returns 3 tags...",

       "aiGenerateRemark.enabled": false,  // default-off

       "graphView.enabled": false,  // default-off
       "graphView.theme": "light",
       "graphView.layout": "force",

       "styleEditor.enabled": false,  // default-off
       "styleEditor.css": "",

       "customColumn.enabled": false,  // default-off
       "customColumn.dataKeys": ""
     }
   }
   ```

2. **实现PreferencePanes配置界面**:
   - 为每个功能添加preference section
   - 添加开关、颜色选择器、文本输入等控件
   - 实现配置保存和读取

3. **实现default-off策略**:
   - AI功能默认关闭
   - 网络功能默认关闭
   - 自定义CSS默认关闭

### 验收标准
- 所有功能有对应配置项
- PreferencePanes可访问
- Default-off策略生效

---

## 📋 Phase 3: 修复Format问题 (0.5天)

### 目标
让npm run check通过

### 任务
1. **修复trailing whitespace**:
   ```bash
   # 自动修复
   find src/features -name "*.js" -exec sed -i '' 's/[[:space:]]*$//' {} \;
   ```

2. **添加missing newline**:
   ```bash
   # 确保所有文件以换行结尾
   find src -name "*.js" -exec sh -c 'echo "" >> "$1"' _ {} \;
   ```

3. **运行检查**:
   ```bash
   npm run check
   ```

### 验收标准
- `npm run check` 全部通过
- 无trailing whitespace
- 无missing newline

---

## 📋 Phase 4: 实现缺失Feature文件 (3天)

### 目标
补齐11个声称存在但实际缺失的功能

### 实施策略
采用TDD,每个功能半天:

#### Day 1: 简单功能 (3个)
1. **style-editor.js** (2小时):
   ```javascript
   export function createStyleEditor(options) {
     function applyCSS(css) { /* DOM注入 */ }
     function getCSS() { /* 读取preference */ }
     function setCSS(css) { /* 保存preference */ }
     function resetCSS() { /* 清除 */ }
     return { applyCSS, getCSS, setCSS, resetCSS };
   }
   ```

2. **custom-column-datakeys.js** (2小时):
   ```javascript
   export function createCustomColumnDataKeys(options) {
     function registerCustomColumns(dataKeys) { /* 注册列 */ }
     function parseDataKeys(str) { /* 解析 */ }
     return { registerCustomColumns };
   }
   ```

3. **annotation-manager-config.js** (2小时):
   - ignoreFigureTable过滤
   - replaceTextWithComment替换

#### Day 2: Reader功能 (3个)
4. **merge-annotations.js** (3小时):
   - 检测可合并批注
   - 合并逻辑
   - 拆分逻辑

5. **attachment-version-switch.js** (3小时):
   - 版本检测
   - 切换UI
   - 记忆功能

6. **annotation-color-names.js** (2小时):
   - 颜色名称映射
   - 显示方向配置

#### Day 3: 复杂功能 (3个)
7. **api-config-ui.js** (3小时):
   - EasyScholar配置
   - Semantic Scholar配置
   - OpenAI配置

8. **tldr-panel.js** (3小时):
   - TLDR生成
   - OpenAI集成
   - 本地fallback

9. **backlinks.js** (2小时):
   - 双向链接
   - 跳转功能

10. **paper-matrix-enhanced.js** (补充配置,1小时)

11. **custom-external-api.js** (通用框架,1小时)

### 验收标准
- 每个功能有测试文件
- 测试覆盖核心逻辑
- 注册到feature-composer
- 配置项完整

---

## 📋 Phase 5: 创建HTML资产 (1天)

### 目标
补充缺失的静态资产

### 任务
1. **创建annotation-manager.html**:
   ```html
   <!DOCTYPE html>
   <html>
   <head>
     <title>Annotation Manager</title>
     <link rel="stylesheet" href="annotation-manager.css">
   </head>
   <body>
     <div id="annotation-list"></div>
     <script src="annotation-manager.js"></script>
   </body>
   </html>
   ```

2. **创建其他必需HTML**:
   - tldr-panel.html
   - style-editor.html (配置界面)

3. **创建CSS样式**:
   - annotation-manager.css
   - tldr-panel.css

4. **更新chrome.manifest**:
   ```
   content toolsbox content/
   ```

### 验收标准
- HTML文件存在且可访问
- chrome://toolsbox/content/*.html 可打开
- 样式正确加载

---

## 📋 Phase 6: 重构Collection功能 (2天)

### 目标
从私有DOM操作迁移到wrapper-based实现

### 任务
1. **collection-item-count.js重构**:
   ```javascript
   // 当前: 直接查询DOM
   const tree = doc.querySelector('#zotero-collections-tree');

   // 改为: 使用Collection API
   const collection = Zotero.Collections.get(collectionID);
   const count = collection.getChildItems().length;
   ```

2. **collection-sort.js重构**:
   - 移除DOM reorder
   - 使用Zotero.Collections API
   - 实现基于preference的排序

3. **favorite-collections.js重构**:
   - 移除DOM直接操作
   - 使用Collection metadata
   - 实现preference存储

4. **添加wrapper层**:
   - 创建 `src/wrappers/collection-wrapper.js`
   - 封装Collection操作
   - 提供clean API

### 验收标准
- 无私有DOM选择器(#zotero-collections-tree)
- 使用Zotero官方API
- 功能完整可用
- 测试通过

---

## 📋 Phase 7: 补充Reader Host Evidence (2天)

### 目标
为Reader功能提供充分的surface evidence

### 任务
1. **margin-annotation.js改进**:
   - 移除私有API依赖 `_iframeWindow`
   - 使用官方Reader事件:
     ```javascript
     Zotero.Reader.registerEventListener('renderToolbar', ...)
     Zotero.Reader.registerEventListener('contextMenu', ...)
     ```
   - 添加cleanup路径:
     ```javascript
     function cleanup() {
       // 移除canvas
       // 清除observer
       // 移除事件监听
     }
     ```

2. **添加surface evidence**:
   - toolbar按钮证据
   - context menu证据
   - action replay证据
   - 创建screenshots/

3. **pdf-background-color.js改进**:
   - 使用官方API
   - 添加cleanup

4. **文档记录**:
   - 创建 `docs/READER_SURFACE_EVIDENCE.md`
   - 记录每个surface的使用
   - 附截图和代码位置

### 验收标准
- 无私有API调用
- 有cleanup路径
- Surface evidence文档完整
- 真机测试通过

---

## 📋 Phase 8: 真机验证 (2天)

### 目标
在真实Zotero环境中验证所有功能

### 任务
1. **修复测试环境**:
   ```javascript
   // feature-composer.test.js
   // Mock Zotero全局对象
   global.Zotero = {
     ItemTreeManager: { registerColumn: jest.fn() },
     // ... 其他mock
   };
   ```

2. **真机测试清单**:
   - [ ] 所有ItemTree列显示正常
   - [ ] PreferencePanes可打开配置
   - [ ] Annotation Manager可打开
   - [ ] Margin Annotation在Reader显示
   - [ ] AI功能可通过菜单触发
   - [ ] Collection功能正常工作
   - [ ] Graph View可显示
   - [ ] 所有default-off功能关闭
   - [ ] 所有cleanup路径生效

3. **收集evidence**:
   - 截图每个功能
   - 记录测试步骤
   - 保存到 `docs/evidence/`

4. **更新文档**:
   - 更新完成度统计
   - 记录已知问题
   - 创建用户指南

### 验收标准
- 真机测试全部通过
- Evidence完整
- 文档更新
- Contract验收通过

---

## 📊 时间估算

| Phase | 预计时间 | 关键产出 |
|-------|---------|---------|
| Phase 1 | 0.5天 | 文档更正 |
| Phase 2 | 1天 | 配置完整 |
| Phase 3 | 0.5天 | check通过 |
| Phase 4 | 3天 | 11个功能 |
| Phase 5 | 1天 | HTML资产 |
| Phase 6 | 2天 | Collection重构 |
| Phase 7 | 2天 | Reader evidence |
| Phase 8 | 2天 | 真机验证 |
| **总计** | **12天** | **完整可用** |

---

## ✅ 最终验收标准

完成以下所有项才能声称"复刻完成":

### Contract验收检查表

- [ ] **Feature inventory**: 所有功能已声明tier和surface
- [ ] **Clean-room boundary**: 无复制reference源码/资源
- [ ] **Host contract**: 对齐ZOTERO_HOST_INTERFACE_CONTRACTS
- [ ] **Wrapper usage**: 优先使用wrapper,无私有DOM patch
- [ ] **Surface evidence**: 每个surface有截图/代码证据
- [ ] **State integrity**: 数据可迁移/清理/回滚
- [ ] **Default-off**: AI/网络/自定义CSS等默认关闭
- [ ] **Cleanup**: 所有注入/监听有清理路径
- [ ] **测试通过**: npm run check和真机测试通过
- [ ] **文档真实**: 所有文档反映实际状态

---

## 🎯 执行策略

### 每日检查点
- 每个Phase结束时运行 `npm run check`
- 每个功能完成后添加测试
- 每天更新 `REAL_STATUS_AUDIT.md`

### Git工作流
- 每个Phase一个feature分支
- 每个功能一个小commit
- Phase完成后PR合并

### 文档同步
- 实时更新 `CURRENT_BACKLOG.md`
- Phase完成后更新完成度统计
- 保持文档与代码一致

---

## 🚀 立即行动

**第一步**: Phase 1 - 清理虚假文档
**预计完成**: 今天
**责任人**: 主开发agent

开始执行?
