# ToolsBox 真机测试报告

**测试时间**: 待执行
**测试版本**: 0.1.0
**构建产物**: build/toolsbox

---

## 测试环境准备

### 安装步骤

1. 打开 Zotero 7
2. 进入 Tools → Developer → Run JavaScript
3. 执行: `Zotero.AddonManager.installAddonFromPath('/path/to/build/toolsbox')`

### 验证清单

**必须验证的功能**:
- [ ] Preference Pane 加载
- [ ] Preference Pane 各面板显示
- [ ] ItemTree 列注册
- [ ] Collection 功能
- [ ] Reader 功能

---

## 测试结果模板

### Preference Pane 测试

**测试命令**: 打开 Tools → ToolsBox Preferences

**预期结果**:
- 6 个配置面板显示
- General/Columns/Reader/AI/Style/APIs

**实际结果**: (待填写)

---

### ItemTree 列测试

**测试命令**: 在 Zotero 主窗口查看列列表

**预期列**:
- Reading Time
- Annotation Distribution
- Publication Tags
- IF (Impact Factor)
- Cited Count

**实际结果**: (待填写)

---

### Collection 功能测试

**测试项目**:
- Collection Item Count
- Collection Sort
- Favorite Collections

**实际结果**: (待填写)

---

### Reader 功能测试

**测试项目**:
- Margin Annotation 显示
- PDF Background Color

**实际结果**: (待填写)

---

## 问题记录

**发现的问题**: (待填写)

---

## 结论

**测试状态**: 待执行
**功能验证**: 待确认
**下一步**: 执行真机测试

---

## 备注

真机测试需要 Zotero 7 环境,当前无法自动执行。
建议手动测试或使用 CI 环境中的 Zotero 实例。
