# Clean-Room Contract合规检查表

**用途**: 验收时逐项检查,确保满足contract所有要求
**状态**: 当前FAIL,需修复到PASS

---

## ✅ Contract检查表

### 1. Feature Inventory声明 ✅

| 要求 | 当前状态 | 证据 |
|------|---------|------|
| 所有功能声明tier | ⚠️ 部分 | REFERENCE_ZOTERO_STYLE_CLEANROOM_CONTRACT.md有tier定义 |
| 声明surface位置 | ⚠️ 部分 | 部分功能未声明 |
| 声明in/out scope | ❌ 缺失 | 需补充 |

**修复**: 为每个功能补充完整声明

---

### 2. Clean-Room Boundary ✅

| 要求 | 当前状态 | 证据 |
|------|---------|------|
| 无复制reference源码 | ✅ 通过 | 源码为重新实现 |
| 无复制reference资源 | ⚠️ 检查 | 未使用reference图标/CSS |
| 无复制文案 | ⚠️ 检查 | locale strings为新建 |
| 无私有实现复制 | ✅ 通过 | 未使用reference私有代码 |

**状态**: 基本通过

---

### 3. Host Contract对齐 ❌

| 要求 | 当前状态 | 证据 |
|------|---------|------|
| PreferencePanes对齐 | ❌ 缺失 | 配置不完整 |
| ItemTree wrapper使用 | ⚠️ 部分 | 列已用wrapper,但Collection未用 |
| ItemPane section对齐 | ⚠️ 部分 | 部分section未对齐 |
| Menu wrapper使用 | ✅ 通过 | menu-manager使用 |
| Reader官方事件 | ❌ 违规 | 使用私有API `_iframeWindow` |

**修复**:
- Collection功能重构为wrapper
- Reader功能移除私有API
- 补齐PreferencePanes

---

### 4. Wrapper Usage ❌

| 要求 | 当前状态 | 证据 |
|------|---------|------|
| 优先使用wrapper | ❌ 违规 | Collection直接DOM操作 |
| 无私有DOM patch | ❌ 违规 | 使用 `#zotero-collections-tree` |
| 无私有API调用 | ❌ 违规 | `reader._iframeWindow` |

**违规位置**:
- `collection-item-count.js`: 直接查询DOM
- `collection-sort.js`: DOM reorder
- `margin-annotation.js`: `_iframeWindow`

**修复**: 创建collection-wrapper,使用官方API

---

### 5. Surface Evidence ❌

| Surface | 证据状态 | 位置 |
|---------|---------|------|
| ItemTree列 | ⚠️ 部分 | 有代码无截图 |
| ItemPane section | ❌ 缺失 | 无证据 |
| Menu commands | ⚠️ 部分 | 有注册无截图 |
| Reader toolbar | ❌ 缺失 | 无证据 |
| Reader context menu | ❌ 缺失 | 无证据 |
| Annotation header | ❌ 缺失 | 无证据 |

**修复**:
- 创建 `docs/evidence/` 目录
- 截图每个surface
- 记录代码位置

---

### 6. State Integrity ⚠️

| 要求 | 当前状态 | 证据 |
|------|---------|------|
| 数据可迁移 | ⚠️ 部分 | extra字段格式简单 |
| 数据可清理 | ⚠️ 检查 | 需验证 |
| 数据可回滚 | ❌ 缺失 | 无版本管理 |

**修复**:
- 定义数据schema
- 实现清理函数
- 添加版本管理

---

### 7. Default-Off策略 ❌

| 功能类型 | 当前状态 | 证据 |
|---------|---------|------|
| AI功能 | ❌ 缺失 | 无default-off配置 |
| 网络功能 | ❌ 缺失 | 无default-off配置 |
| 自定义CSS | ❌ 缺失 | 无style-editor |
| 独立窗口 | ⚠️ 部分 | 部分有配置 |

**修复**:
- addon.config.json添加default-off配置
- AI/网络/CSS默认disabled

---

### 8. Cleanup路径 ❌

| 资源类型 | 当前状态 | 证据 |
|---------|---------|------|
| 窗口清理 | ⚠️ 检查 | 需验证 |
| 菜单清理 | ⚠️ 检查 | 需验证 |
| Reader注入清理 | ❌ 缺失 | 无cleanup函数 |
| 样式清理 | ❌ 缺失 | 无style-editor |
| Timer清理 | ⚠️ 检查 | 需验证 |
| Observer清理 | ⚠️ 检查 | 需验证 |

**修复**:
- 每个功能添加cleanup函数
- 确保shutdown调用

---

### 9. 测试通过 ❌

| 检查项 | 当前状态 |
|--------|---------|
| npm run lint | ✅ 通过 |
| npm run format:check | ❌ 失败 |
| npm run typecheck | ✅ 通过 |
| npm run verify | ⚠️ 未知 |
| npm run cleanroom:audit | ⚠️ 未知 |
| npm test | ❌ 失败(Zotero undefined) |

**修复**:
- 修复format问题
- 修复测试环境

---

### 10. 文档真实 ✅

| 文档 | 当前状态 |
|------|---------|
| FEATURE_REAL_STATUS.md | ✅ 真实 |
| REAL_STATUS_AUDIT.md | ✅ 真实 |
| REMEDIATION_PLAN.md | ✅ 真实 |
| CURRENT_BACKLOG.md | ✅ 真实 |
| CLEANROOM_COMPLIANCE.md | ✅ 真实 |

---

## 📊 总体评分

| Contract项 | 评分 | 状态 |
|-----------|------|------|
| Feature inventory | 7/10 | ⚠️ |
| Clean-room boundary | 9/10 | ✅ |
| Host contract | 4/10 | ❌ |
| Wrapper usage | 3/10 | ❌ |
| Surface evidence | 2/10 | ❌ |
| State integrity | 5/10 | ⚠️ |
| Default-off | 0/10 | ❌ |
| Cleanup | 3/10 | ❌ |
| 测试通过 | 3/10 | ❌ |
| 文档真实 | 10/10 | ✅ |

**总分**: **43/100** ❌ FAIL

---

## 🎯 PASS标准

总分达到 **80/100** 且无任何❌项:

- Feature inventory ≥ 8
- Clean-room boundary ≥ 9 (已达标)
- Host contract ≥ 8
- Wrapper usage ≥ 8
- Surface evidence ≥ 7
- State integrity ≥ 8
- Default-off ≥ 8
- Cleanup ≥ 7
- 测试通过 ≥ 9
- 文档真实 ≥ 9 (已达标)

---

## 📋 修复检查表

完成以下修复才能达标:

### Phase 2-8必须完成:
- [ ] 补齐配置schema (Phase 2)
- [ ] 实现缺失11个功能 (Phase 4)
- [ ] Collection重构为wrapper (Phase 6)
- [ ] Reader移除私有API (Phase 7)
- [ ] 补充surface evidence (Phase 7)
- [ ] 实现default-off策略 (Phase 2)
- [ ] 添加cleanup函数 (Phase 7)
- [ ] 修复测试环境 (Phase 8)
- [ ] 真机验证通过 (Phase 8)

---

**当前**: **FAIL** (43/100)
**目标**: **PASS** (80/100+)
**预计修复**: 12天 (按REMEDIATION_PLAN)

**不能声称"复刻完成"直到所有项达标!**
