# ToolsBox 真实状态报告

**更新时间**: 2026-05-11
**核心目标**: 可信、可验收、可继续扩展

---

## 当前单一事实源

本节记录项目当前可验证的真实状态。

<!-- CURRENT-TRUTH-SUMMARY:START -->
**验证状态**: npm run check部分通过
**功能状态**: Style复刻为partial/prototype
**阻塞点**: npm test需改进测试覆盖
<!-- CURRENT-TRUTH-SUMMARY:END -->

---

## ⚠️ 重要声明

**本文档严格遵循用户要求**:不虚报完成度,不声称"100%完成"。

---

## 📊 当前验证状态

| 验证项 | 状态 | 备注 |
|--------|------|------|
| npm run lint | ✅ 通过 | 语法和JSON检查 |
| npm run format:check | ✅ 通过 | whitespace规则 |
| npm run typecheck | ✅ 通过 | 声明漂移检查 |
| npm run verify | ✅ 通过 | 核心文件验证 |
| npm test | ⏳ 运行中 | 测试覆盖需改进 |
| npm run check | ⏳ 未完成 | 需npm test通过 |

---

## 📋 Style 复刻状态

**核心功能代码**: 部分/prototype

### 已实现功能 (可测试)

| 功能 | 文件 | 状态 | 问题 |
|------|------|------|------|
| Reading Time Column | ✅ 存在 | prototype | 需真机验证 |
| Annotation Column | ✅ 存在 | prototype | 需真机验证 |
| Cited Count Column | ✅ 存在 | prototype | 仅读Extra,非API集成 |
| IF Column | ✅ 存在 | prototype | 数据形态不一致 |
| Collection Item Count | ✅ 存在 | host-surface-prototype | 直接DOM patch |
| Collection Sort | ✅ 存在 | host-surface-prototype | 直接DOM patch |
| Favorite Collections | ✅ 存在 | host-surface-prototype | 直接DOM patch |
| Margin Annotation | ✅ 存在 | host-surface-prototype | 使用私有API |
| PDF Background | ✅ 存在 | host-surface-prototype | 使用私有API |

### 未实现功能 (配置存在但文件缺失)

| 功能 | 配置状态 | 文件状态 | 处理方式 |
|------|---------|---------|---------|
| Style Editor | ✅ 已配置 | ❌ 缺失 | planned/not implemented |
| TLDR Panel | ✅ 已配置 | ❌ 缺失 | planned/not implemented |
| Backlinks | ✅ 已配置 | ❌ 缺失 | planned/not implemented |
| Merge Annotations | ✅ 已配置 | ❌ 缺失 | planned/not implemented |
| Attachment Version Switch | ✅ 已配置 | ❌ 缺失 | planned/not implemented |
| Custom Column DataKeys | ✅ 已配置 | ❌ 缺失 | planned/not implemented |
| API Config UI | ✅ 已配置 | ❌ 缺失 | planned/not implemented |
| Annotation Color Names | ✅ 已配置 | ❌ 缺失 | planned/not implemented |
| Annotation Manager Config | ✅ 已配置 | ❌ 缺失 | planned/not implemented |
| Paper Matrix Enhanced | ✅ 已配置 | ❌ 缺失 | planned/not implemented |
| Custom External API | ✅ 已配置 | ❌ 缺失 | planned/not implemented |

---

## 🚨 Contract 合规问题

### 未达标项

| Contract 要求 | 当前状态 | 修复方案 |
|--------------|---------|---------|
| Wrapper Usage | 违规 | Collection/Reader需重构为wrapper |
| Cleanup 函数 | 部分 | 需为所有注册模块添加cleanup |
| Surface Evidence | 缺失 | 需真机测试截图 |
| Default-off | 部分 | AI/网络功能已关闭 |

---

## 📝 配置一致性

### 已对齐

- addon.config.json 与 feature-composer.js 读取的 pref key 已补齐
- AI/外部网络功能默认关闭:
  - aiGenerateTags.enabled=false
  - aiGenerateRemark.enabled=false
  - tldrPanel.enabled=false
  - customExternalAPI.enabled=false

---

## 🔧 P0-P1 修复进度

### P0: 验收链

- ✅ 添加缺失测试文件导入到 run-all.js
- ✅ 移除 preferences.xhtml XML declaration
- ⏳ feature-composer.test.js Zotero undefined (需mock)
- ⏳ preferences-theme-script.test.js (需修复)

### P1: 配置一致性

- ✅ 对齐 addon.config.json 与 feature-composer.js

---

## 📌 文档口径

**遵循用户要求**:
- "构建通过" ✅
- "基础静态检查通过" ✅
- "npm run check 未通过,阻塞在 npm test" ⏳
- "Style clean-room 复刻为 partial/prototype" ✅

**禁止使用**:
- ❌ "100%完成"
- ❌ "313 tests 100%"
- ❌ "功能代码100%"

---

## 下一步

1. 让 npm run check 真实通过
2. 修复 run-all 覆盖
3. 修复 feature-composer 全局 Zotero
4. 把未实现功能从"已完成"降级为 planned
