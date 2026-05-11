# 当前真实状态

**更新时间**: 2026-05-10
**真实完成度**: 72% (41/57功能实际存在)

---

## ⚠️ 状态更正

之前的文档声称100%完成,但实际审计发现:
- 声称57个功能但仅41个实际存在
- 16个功能文件缺失
- 配置schema不完整
- HTML资产缺失
- Contract违规

详见: `REAL_STATUS_AUDIT.md`, `FEATURE_REAL_STATUS.md`, `REMEDIATION_PLAN.md`

---

## 📊 已实际完成 (41个)

### ✅ 核心功能 (10个)
1. Margin Annotation
2. Toggle Sidebar  
3. Tab Manager
4. Attachment Preview
5. Annotation Manager (HTML缺失)
6. Cited Count Column
7. Collection Item Count
8. Sort Collections
9. Favorite Collections
10. Graph View Enhanced

### ✅ ItemTree列 (9个)
11. Reading Time Column
12. Annotation Column
13. Publication Tags Column
14. Title Column Enhanced
15. IF Column
16. Nested Tags
17. View Groups
18. PDF Background Color
19. Annotation Colors

### ✅ Workflow (4个)
20. AI Generate Tags (无入口)
21. AI Generate Remark (无入口)
22. Research Workflow
23. Workflow State

### ✅ 基础设施 (18个)
24-41. Item Tree/Pane/Menu/Theme/Window等

---

## ❌ 缺失功能 (16个)

**高优先级 (11个文件不存在)**:
1. Style Editor ❌
2. TLDR Panel ❌
3. Backlinks ❌
4. Merge Annotations ❌
5. Attachment Version Switch ❌
6. Custom Column DataKeys ❌
7. API Config UI ❌
8. Annotation Color Names ❌
9. Annotation Manager Config ❌
10. Paper Matrix Enhanced ❌
11. Custom External API ❌

**配置缺失 (5个)**:
12-16. Tags/Text/Date/Rating/Creator Column配置

---

## 🚨 关键问题

1. **HTML资产**: annotation-manager.html等不存在
2. **配置schema**: addon.config.json不完整
3. **Contract违规**: 私有DOM/API使用
4. **用户入口**: AI功能无菜单/按钮
5. **代码质量**: npm run check失败

---

## 📋 修复计划

参见 `REMEDIATION_PLAN.md`:

**Phase 1**: 清理文档 (当前)
**Phase 2**: 补齐配置
**Phase 3**: 修复format
**Phase 4**: 实现缺失功能(11个)
**Phase 5**: 创建HTML资产
**Phase 6**: 重构Collection
**Phase 7**: Reader evidence
**Phase 8**: 真机验证

**预计**: 12天完成

---

## 🎯 当前任务

**Phase 1 进度**: 50%
- ✅ 已删除虚假文档
- ✅ 已创建真实状态文档
- ⏳ 正在更新backlog
- ⏳ 待创建compliance检查表

---

## ✅ 验收标准

Contract要求全部满足才能"复刻完成":
- Feature inventory声明 ✅
- 无复制reference ✅
- Host contract对齐 ❌
- Wrapper-first ❌
- Surface evidence ❌
- State integrity ⚠️
- Default-off ❌
- Cleanup路径 ❌
- npm check ❌
- 文档真实 ✅

**当前**: FAIL
**目标**: PASS