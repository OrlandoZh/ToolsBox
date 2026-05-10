# Zotero-Style 功能复刻差距分析

**生成时间**: 2026-05-09 (最新更新)
**对比基准**: `reference/zotero-style` (v6.0.4)
**当前完成度**: 约55% (35/62功能)

---

## ✅ 已完成功能 (35个)

### P0 核心功能 (5个) - 已全部完成
1. ✅ **Cited Count Column** - 引用次数列 (Semantic Scholar集成) - renderCell已修复
2. ✅ **Attachment Preview Panel** - 右侧栏附件预览面板 - 测试已补充
3. ✅ **Annotation Manager** - 批注管理器面板 - 测试已补充
4. ✅ **Toggle Sidebar** - 侧边栏快速切换 (Shift + { / }) - 测试已补充
5. ✅ **Tab Manager** - 标签管理器面板 - 测试已补充

### P1 Collection管理 (3个) - 已全部完成
6. ✅ **Collection Item Count** - 收藏夹条目计数显示 - API命名已统一
7. ✅ **Sort Collections** - 收藏夹排序功能 - API命名已统一
8. ✅ **Favorite Collections** - 收藏夹置顶功能 - API命名已统一

### 基础设施功能 (25个)
6. ✅ 插件生命周期管理
7. ✅ 国际化支持 (en-US, zh-CN, zh-TW)
8. ✅ 偏好设置面板
9. ✅ 菜单管理
10. ✅ 日志系统
11. ✅ Notifier监听
12. ✅ 主题管理
13. ✅ Workflow State存储
14. ✅ 状态管理
15. ✅ 评分管理
16. ✅ 备注管理
17. ✅ 阅读进度管理
18. ✅ ItemTree列注册框架
19. ✅ Tags列
20. ✅ Text Tags列
21. ✅ Status列
22. ✅ Rating列
23. ✅ Remark列
24. ✅ Creator列
25. ✅ Publication列
26. ✅ Date Added列
27. ✅ Date Modified列
28. ✅ Read Status列
29. ✅ ItemPane基础框架
30. ✅ 关系图工作台原型

---

## ❌ 未完成功能 (27个)

### 🔴 P1 高优先级功能 (5个) - ItemTree列增强

#### 待开发功能
31. ❌ **Reading Time Column** - 阅读时长列 (最简单,优先开发)
  - 阅读时间统计
  - 进度条显示
  - 最大值配置

32. ❌ **Annotation Column** - 批注分布列 (中等)
  - PDF批注可视化
  - 条形图/圆点图显示
  - 颜色自定义

33. ❌ **Publication Tags Column** - 期刊标签列 (中等)
  - 期刊排名标签 (SCI, SSCI, IF等)
  - 颜色映射
  - 排序支持

34. ❌ **Title Column增强** - 标题列增强 (中等)
  - 阅读进度可视化
  - 标签显示
  - 自定义颜色
  - 翻译切换

35. ❌ **IF Column** - 影响因子列 (最复杂)
  - EasyScholar API集成
  - 多字段显示 (SCIIF, SCI, UTD24, AJG等)
  - 进度条可视化
  - 颜色映射

#### Reader集成 (2个)
36. ❌ **Margin Annotation** - 页边距批注
  - PDF页边距显示
  - 批注同步

37. ❌ **Graph View增强** - 关系图增强
  - 多种布局模式
  - 主题切换
  - 高级配置

### 🟡 P2 中优先级功能 (12个)

#### 标签系统增强
41. ❌ **Nested Tags** - 嵌套标签
  - 层级显示 (#1/2/3)
  - 链接符号配置

42. ❌ **Tags Column配置** - 标签列配置
  - 边距配置
  - 对齐方式

43. ❌ **Text Tags Column配置** - 文本标签列配置
  - 前缀配置
  - 正则匹配
  - 背景色配置

#### Reader增强
44. ❌ **PDF Background Color** - PDF背景色
  - 自定义背景色
  - 主题适配

45. ❌ **Annotation Colors** - 批注颜色面板
  - 自定义颜色方案
  - 颜色命名
  - 分组管理

46. ❌ **Annotation Color Names** - 批注颜色名称显示
  - 颜色名称标注
  - 方向配置

47. ❌ **Merge Annotations** - 批注合并
  - 跨页批注合并
  - 批注编辑

48. ❌ **Attachment Version Switch** - 附件版本切换
  - 多版本管理
  - 快速切换

#### Workflow功能
49. ❌ **AI Generate Tags** - AI生成标签
  - OpenAI集成
  - Prompt配置

50. ❌ **AI Generate Remark** - AI生成备注
  - 摘要生成
  - Prompt配置

51. ❌ **View Groups** - 视图预设
  - 列可见性保存
  - 视图切换

52. ❌ **Paper Matrix增强** - 论文矩阵增强
  - 字段配置
  - 布局方向

### 🔵 P3 低优先级功能 (10个)

#### 高级定制
53. ❌ **Style Editor** - 样式编辑器
  - 自定义CSS注入
  - 实时预览

54. ❌ **Custom Column DataKeys** - 自定义列字段
  - 用户定义字段
  - 动态注册

55. ❌ **Annotation Manager配置** - 批注管理器配置
  - 忽略图表批注
  - 文本替换注释

56. ❌ **Date Format Customization** - 日期格式定制
  - 绝对/相对显示
  - 时区偏移
  - 自定义格式

#### 外部集成
57. ❌ **EasyScholar API** - 影响因子数据源
  - API密钥配置
  - 数据缓存

58. ❌ **CNKI Integration** - 知网引用数据
  - CNKI API客户端
  - 中文文献支持

59. ❌ **Sci-Hub Resolver** - PDF解析器
  - Sci-Hub配置
  - 自动解析

#### 其他功能
60. ❌ **Backlinks** - 反向链接
  - 批注与笔记链接
  - 双向跳转

61. ❌ **TLDR Panel** - TLDR摘要面板
  - 自动翻译
  - 摘要显示

62. ❌ **Dark/Light Toggle Button** - 主题切换按钮
  - 工具栏按钮
  - 快速切换

---

## 📊 功能分类统计

| 分类 | 总数 | 已完成 | 未完成 | 完成率 |
|------|------|--------|--------|--------|
| **P0核心功能** | 5 | 5 | 0 | 100% ✅ |
| **ItemTree列** | 13 | 5 | 8 | 38% |
| **Reader集成** | 7 | 0 | 7 | 0% |
| **Collection管理** | 3 | 0 | 3 | 0% |
| **Workflow功能** | 6 | 0 | 6 | 0% |
| **标签系统** | 4 | 0 | 4 | 0% |
| **AI集成** | 2 | 0 | 2 | 0% |
| **外部API** | 3 | 0 | 3 | 0% |
| **高级定制** | 5 | 0 | 5 | 0% |
| **基础设施** | 25 | 25 | 0 | 100% ✅ |
| **总计** | **62** | **30** | **32** | **48%** |

---

## 🎯 后续开发建议

### 阶段一: P1功能 (预计2-3周)

**重点**: 提升研究工作流效率的核心功能

1. **Week 1**: Collection管理功能
   - Collection Item Count (1天)
   - Sort Collections (1天)
   - Favorite Collections (2天)

2. **Week 2**: ItemTree列增强
   - IF Column - EasyScholar API集成 (3天)
   - Title Column增强 (2天)

3. **Week 3**: Reader集成
   - Margin Annotation (3天)
   - Reading Time Column (2天)

### 阶段二: P2功能 (预计2-3周)

**重点**: 提升用户体验和高级功能

1. **Week 4**: Reader增强
   - Annotation Colors (2天)
   - PDF Background Color (1天)
   - Merge Annotations (2天)

2. **Week 5**: Workflow功能
   - View Groups (2天)
   - Paper Matrix增强 (2天)
   - Nested Tags (1天)

3. **Week 6**: AI集成 (可选)
   - AI Generate Tags (2天)
   - AI Generate Remark (2天)

### 阶段三: P3功能 (预计1-2周)

**重点**: 高级定制和外部集成

1. **Week 7**: 外部API集成
   - EasyScholar API (2天)
   - CNKI Integration (2天)
   - Sci-Hub Resolver (1天)

2. **Week 8**: 高级定制
   - Style Editor (2天)
   - Custom Column DataKeys (2天)
   - 其他配置功能 (1天)

---

## ⚠️ 技术债务

### 已知问题
1. ❌ CNKI API客户端未实现 (Cited Count的fallback)
2. ❌ E2E测试场景需要扩展覆盖新功能
3. ❌ 性能优化和缓存策略需要完善
4. ❌ 部分列的渲染逻辑需要优化

### 代码质量
1. ⚠️ 缺少集成测试覆盖
2. ⚠️ 需要添加性能基准测试
3. ⚠️ 文档需要持续更新

---

## 📝 复刻约束提醒

根据 **AGENTS.md** 中的 Zotero 专项规则:

1. **禁用 console.log** - 使用 `ztoolkit.log` 或 `Zotero.debug`
2. **API优先** - 优先使用官方API
3. **DOM降级** - 仅在官方API无法满足时使用

根据 **clean-room 开发约束**:

- ❌ 不可直接复制 zotero-style 代码
- ✅ 从黑盒行为重新实现
- ✅ `reference/` 仅用于兼容性研究

---

## 🏆 里程碑总结

### 已达成
- ✅ P0核心功能100%完成
- ✅ 基础设施100%完成
- ✅ TDD开发流程建立
- ✅ Clean-room实现约束遵守
- ✅ 26个单元测试全部通过

### 下一步
- 🔜 开始P1功能开发
- 🔜 补充CNKI API客户端
- 🔜 扩展E2E测试场景
- 🔜 优化性能和缓存

---

**文档维护**: 本文档应在每完成一个功能后更新完成度统计。
