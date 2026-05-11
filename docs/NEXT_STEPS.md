# ToolsBox 项目后续计划

**创建时间**: 2026-05-11
**当前状态**: 功能代码完成,Contract 合规不足

---

## 🎯 真实完成度分析

### ✅ 已完成 (85%+)

1. **功能代码** - 41个文件全部存在
   - src/features/*.js (41个文件)
   - src/app/feature-composer.js (已注册所有功能)
   - src/services/*.js (客户端服务)

2. **配置** - addon.config.json 完整
   - 所有功能配置项已添加
   - default-off 策略已实现 (AI/网络功能默认 disabled)

3. **UI层** - 已创建
   - Preference Pane (preferences.xhtml, preferences.js)
   - HTML资产 (annotation-manager.html)
   - Theme (theme.js)

4. **验证** - npm run check 通过
   - lint ✅
   - format:check ✅
   - typecheck ✅
   - verify ✅
   - cleanroom:audit ✅

---

## ❌ 真正缺失的内容

### 1. Contract 合规 (43/100 → 需达到 80+)

| Contract 项 | 当前 | 目标 | 缺失内容 |
|------------|------|------|---------|
| **Host Contract** | 4/10 | 8+ | Collection/Reader 私有API使用 |
| **Wrapper Usage** | 3/10 | 8+ | 未使用官方 wrapper |
| **Surface Evidence** | 2/10 | 7+ | 无截图/验证证据 |
| **Default-Off** | 0/10 | 8+ | **已完成,需更新文档** |
| **Cleanup 路径** | 3/10 | 7+ | 缺少 cleanup 函数 |

### 2. 功能入口

- AI功能 (ai-generate-tags, ai-generate-remark) - 无菜单/按钮
- 某些功能可能需要 UI 入口

### 3. 真机测试

- 未在真实 Zotero 环境测试
- 需验证 Preference Pane 加载
- 需验证所有功能实际工作

---

## 📋 后续任务清单

### Phase 1: 更新文档 (0.5天) ⭐ **优先**

**问题**: FEATURE_REAL_STATUS.md 声称 11 个功能缺失,但实际不存在

**任务**:
1. 更新 FEATURE_REAL_STATUS.md - 删除虚假缺失项
2. 更新 CLEANROOM_COMPLIANCE.md - Default-Off 已完成
3. 更新 CURRENT_BACKLOG.md - 反映真实 85%+ 完成度
4. 创建功能对照表 (ToolsBox 命名 vs zotero-style 命名)

**产出**: 文档真实反映现状

---

### Phase 2: 真机测试 (1-2天) ⭐ **关键**

**原因**: 无法验证功能是否真正工作

**任务**:
1. 构建 xpi 插件包
2. 安装到 Zotero 7
3. 验证 Preference Pane 加载
4. 测试核心功能:
   - ItemTree 列显示
   - Collection 功能
   - Reader 功能
   - AI 功能 (需配置 API key)

**产出**: 真机测试报告

---

### Phase 3: Contract 合规修复 (3-5天)

**优先级**: Host Contract > Wrapper > Surface Evidence > Cleanup

#### 3.1 Collection Wrapper (1天)
- [ ] 创建 collection-wrapper.js
- [ ] 重构 collection-item-count.js 使用 wrapper
- [ ] 重构 collection-sort.js 使用 wrapper
- [ ] 移除私有 DOM 操作

#### 3.2 Reader Contract (1天)
- [ ] 移除 `_iframeWindow` 私有 API
- [ ] 使用官方 Reader 事件系统
- [ ] margin-annotation.js 重构

#### 3.3 Surface Evidence (0.5天)
- [ ] 创建 docs/evidence/ 目录
- [ ] 截图所有 ItemTree 列
- [ ] 截图 Preference Pane
- [ ] 记录代码位置

#### 3.4 Cleanup 函数 (0.5天)
- [ ] 为每个功能添加 cleanup() 函数
- [ ] 确保插件禁用时正确清理

**产出**: Contract 合规评分 80+

---

### Phase 4: 功能入口补充 (1天,可选)

**仅当真机测试发现缺失时执行**

- [ ] 为 AI 功能添加菜单入口
- [ ] 为其他功能补充 UI 入口

---

## ⏱️ 时间估算

| Phase | 预计时间 | 优先级 |
|-------|---------|--------|
| Phase 1: 文档更新 | 0.5天 | ⭐⭐⭐ |
| Phase 2: 真机测试 | 1-2天 | ⭐⭐⭐ |
| Phase 3: Contract 修复 | 3-5天 | ⭐⭐ |
| Phase 4: 功能入口 | 1天 | ⭐ (可选) |

**总计**: 5.5-8.5天

---

## 🎯 验收标准

### 最低验收 (MVP)
- [x] 功能代码完整
- [x] 配置完整
- [x] npm run check 通过
- [ ] 真机测试通过
- [ ] Contract 合规 ≥ 60

### 完整验收
- [ ] Contract 合规 ≥ 80
- [ ] 无 ❌ 项
- [ ] Surface Evidence 完整
- [ ] 文档真实

---

## 📊 当前状态总结

**功能完成度**: 85%+ (代码+配置)
**Contract 合规**: 43/100 (FAIL)
**真机测试**: 未开始

**关键阻塞**:
1. 文档存在虚假信息 (FEATURE_REAL_STATUS.md)
2. 缺少真机验证
3. Contract 合规不足

**下一步**: 立即执行 Phase 1 (文档更新)
