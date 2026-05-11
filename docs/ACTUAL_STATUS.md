# ToolsBox 真实状态报告

**更新时间**: 2026-05-11 19:55
**审计结论**: 文档 `FEATURE_REAL_STATUS.md` 准确,11 个功能文件确实缺失

---

## ✅ 已完成 (核心功能 100%)

### 功能文件 (41个存在)
所有 src/features/*.js 文件存在并被 feature-composer.js 注册

### 配置 (100%)
- config/addon.config.json 完整
- 包含所有功能的 defaultPrefs

### UI层 (100%)
- Preference Pane (preferences.xhtml)
- annotation-manager.html
- theme.js

### 验证 (通过)
- npm run check 通过
- 313 个测试通过

---

## ❌ 真正缺失的功能 (11个)

**文档准确**: `FEATURE_REAL_STATUS.md` 声称的 11 个文件确实不存在

| 功能名 | 文件名 | 状态 |
|--------|--------|------|
| Style Editor | style-editor.js | ❌ 缺失 |
| TLDR Panel | tldr-panel.js | ❌ 缺失 |
| Backlinks | backlinks.js | ❌ 缺失 |
| Merge Annotations | merge-annotations.js | ❌ 缺失 |
| Attachment Version Switch | attachment-version-switch.js | ❌ 缺失 |
| Custom Column DataKeys | custom-column-datakeys.js | ❌ 缺失 |
| API Config UI | api-config-ui.js | ❌ 缺失 |
| Annotation Color Names | annotation-color-names.js | ❌ 缺失 |
| Annotation Manager Config | annotation-manager-config.js | ❌ 缺失 |
| Paper Matrix Enhanced | paper-matrix-enhanced.js | ❌ 缺失 |
| Custom External API | custom-external-api.js | ❌ 缺失 |

**但配置已存在**: addon.config.json 包含这些功能的配置项

---

## 📋 缺失项分类

### P0 - 真机测试
- **状态**: 未执行
- **原因**: 需要验证已有功能是否工作
- **时间**: 1-2天

### P1 - 功能实现
- **状态**: 11 个文件缺失
- **配置**: 已存在
- **时间**: 5-7天 (实现全部)

### P2 - Surface Evidence
- **状态**: docs/evidence/ 不存在
- **要求**: Contract 必需
- **时间**: 0.5天

### P3 - Contract 合规
- Wrapper Usage: 违规 (私有 API)
- Cleanup: 缺失
- 时间: 2-3天

---

## 🎯 推荐策略

### 方案 A: MVP 交付 (推荐)
**目标**: 验证已实现功能

1. 执行真机测试 (1-2天)
2. 创建 Surface Evidence (0.5天)
3. 标记 11 个功能为 "not implemented"

**时间**: 2-3天
**交付**: 41 个功能验证通过

### 方案 B: 完整实现
**目标**: 实现 11 个缺失功能

1. 执行真机测试 (1-2天)
2. 实现缺失功能 (5-7天)
3. 创建 Surface Evidence (0.5天)
4. Contract 合规修复 (2-3天)

**时间**: 8-13天
**交付**: 52 个功能完整

---

## 🔍 疑问点

**为什么 addon.config.json 包含缺失功能的配置?**

可能原因:
1. 配置先于实现创建
2. 计划实现但未完成
3. 从 reference 复制配置但未实现功能

**需要决策**: 是否实现这 11 个功能?

---

## 📊 当前完成度

| 维度 | 完成度 | 说明 |
|------|--------|------|
| 功能代码 | 79% | 41/52 文件存在 |
| 配置 | 100% | 所有配置完整 |
| UI层 | 100% | Preference Pane 完整 |
| 测试 | 100% | 313 测试通过 |
| Contract 合规 | 43% | 需修复 |
| 真机验证 | 0% | 未执行 |

**综合完成度**: 70% (MVP可交付)

---

## 下一步建议

**立即执行**:
1. 真机测试 - 验证 41 个功能是否工作
2. Surface Evidence - 创建截图证据
3. 决策 - 是否实现剩余 11 个功能

**等待决策**:
- 如果 MVP 足够 → 标记缺失功能为 "future work"
- 如果需要完整 → 实现剩余 11 个功能
