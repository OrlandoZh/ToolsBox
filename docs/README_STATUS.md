# ToolsBox 当前状态总结

**更新时间**: 2026-05-11 20:00
**真实完成度**: 79% (41/52 功能文件存在)

---

## 🎯 快速概览

### ✅ 已完成

| 项目 | 状态 | 说明 |
|------|------|------|
| **功能代码** | 79% | 41/52 文件存在 |
| **配置** | 100% | addon.config.json 完整 |
| **UI层** | 100% | Preference Pane 完整 |
| **测试** | 100% | 313 测试通过 |
| **构建** | 100% | build/toolsbox 成功 |
| **Surface Evidence** | 50% | 代码位置记录,待截图 |

### ❌ 缺失项

| 项目 | 数量 | 说明 |
|------|------|------|
| **功能文件** | 11个 | 配置存在但文件缺失 |
| **真机测试** | - | 未执行 |
| **Contract 合规** | 43/100 | Wrapper/Cleanup 待修复 |

---

## 📋 11个缺失功能

| 功能 | 配置状态 | 文件状态 |
|------|---------|---------|
| Style Editor | ✅ 已配置 | ❌ 缺失 |
| TLDR Panel | ✅ 已配置 | ❌ 缺失 |
| Backlinks | ✅ 已配置 | ❌ 缺失 |
| Merge Annotations | ✅ 已配置 | ❌ 缺失 |
| Attachment Version Switch | ✅ 已配置 | ❌ 缺失 |
| Custom Column DataKeys | ✅ 已配置 | ❌ 缺失 |
| API Config UI | ✅ 已配置 | ❌ 缺失 |
| Annotation Color Names | ✅ 已配置 | ❌ 缺失 |
| Annotation Manager Config | ✅ 已配置 | ❌ 缺失 |
| Paper Matrix Enhanced | ✅ 已配置 | ❌ 缺失 |
| Custom External API | ✅ 已配置 | ❌ 缺失 |

---

## 🚀 下一步行动

### 立即可做

1. **真机测试** (需要 Zotero 7)
   - 安装 build/toolsbox
   - 验证 Preference Pane
   - 验证 ItemTree 列
   - 记录测试结果

2. **补充截图** (真机测试时)
   - Preference Pane 截图
   - ItemTree 列截图

3. **更新文档**
   - 标记缺失功能为 "not implemented"

### 后续可选

4. **实现缺失功能** (5-7天)
5. **Contract 合规修复** (2-3天)

---

## 📊 验收标准

### MVP 验收 (当前可达)
- [x] 功能代码存在
- [x] 配置完整
- [x] npm run check 通过
- [x] 构建成功
- [ ] 真机测试通过
- [ ] Surface Evidence 截图

### Contract 验收 (需额外工作)
- [ ] Wrapper Usage ≥ 8
- [ ] Surface Evidence ≥ 7
- [ ] Cleanup ≥ 7
- [ ] 总分 ≥ 80

---

## 📁 关键文件位置

| 文件 | 用途 |
|------|------|
| docs/ACTUAL_STATUS.md | 真实状态报告 |
| docs/MISSING_ITEMS.md | 缺失项清单 |
| docs/NEXT_STEPS.md | 后续计划 |
| docs/evidence/ | Surface Evidence |
| build/toolsbox/ | 构建产物 |

---

## 💡 建议

**推荐路径**: MVP 交付
1. 真机测试验证已有功能
2. 补充截图证据
3. 标记缺失功能为未来工作

**时间**: 2-3天完成 MVP 验收