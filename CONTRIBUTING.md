# Contributing

本仓库的目标不是“尽快抄出一个能跑的 Zotero 模版”，而是维护一套 **clean-room、可审阅、可持续扩展** 的开发底座。

## 先看这几个原则

### 1. 保持 clean-room

- 不直接复制本地 reference 快照中的实现代码（如果你挂载了可选的 `reference/` 研究目录）
- 不引入会让仓库受 AGPL 约束的实现片段
- 可以借鉴：
  - 功能目标
  - API 行为
  - 架构分层思路
  - 测试观察结果
- 不可以借鉴：
  - 大段实现代码
  - 原项目工具链代码片段
  - 直接复刻文件结构后粘贴实现

### 2. 优先做小而清晰的改动

- 优先补单一能力或单一缺口
- 改动前先判断写入边界
- 不为顺手而大面积重构

### 3. 代码与文档一起前进

- 代码变了，相关文档也要更新
- 新增脚本时，至少同步：
  - `README.md`
  - 对应专题文档
  - 必要测试

## 推荐提交流程

1. 先理解当前问题属于哪一层
   - 模板骨架
   - Zotero 真机链
   - agent 闭环
   - Obsidian 人工介入
   - 工程化维护
2. 找到对应文档
   - 总体缺口：`docs/CURRENT_BACKLOG.md`
   - agent 路线：`docs/AGENT_AUTONOMY_ROADMAP.md`
   - Zotero 真机：`docs/ZOTERO_TESTING.md`
   - Obsidian 工作台：`docs/OBSIDIAN_INTERVENTION.md`
3. 小范围改动
4. 运行相关验证
5. 同步更新文档

## 本地验证要求

### 任何代码改动至少应执行

```bash
npm test
```

### 涉及构建/配置/类型时建议执行

```bash
npm run lint
npm run format:check
npm run typecheck
npm run verify
```

### 涉及 Zotero 真机链路时建议执行

```bash
npm run zotero:test
npm run zotero:scenario
npm run agent:zotero:e2e
```

### 涉及 agent 汇总/门禁/人工工作台时建议执行

```bash
npm run agent:monitor
npm run agent:gate
npm run agent:obsidian
```

## 涉及补丁能力时的额外要求

- 白名单补丁能力必须保持可审阅
- 不允许无边界扩大自动写入范围
- 新增补丁规则时，至少补：
  - 规则说明
  - 允许修改文件范围
  - 护栏
  - 测试
  - 复验预期

## 涉及 Obsidian 工作台时的要求

- 人工说明文档和 agent 输入要分离
- 不要让 agent 去读取给人看的说明文档
- 保持中文优先、模块化、易读
- 任何会覆盖人工输入的逻辑都必须非常谨慎

## 文档维护要求

以下文档在改动后要优先关注是否需要同步：

- `README.md`
- `FRAMEWORK_CHECKLIST.md`
- `FRAMEWORK_ASSESSMENT.md`
- `docs/CURRENT_BACKLOG.md`
- `docs/ZOTERO_TESTING.md`
- `docs/OBSIDIAN_INTERVENTION.md`

## 不建议的改动方式

- 未经说明直接做大范围重构
- 为了测试通过临时屏蔽真实功能
- 在没有护栏的情况下扩大自动改码能力
- 修改自动生成摘要区，期待这些内容永久保留
- 跳过测试直接更新“已完成”文档

## 当前最欢迎的贡献方向

- 扩大 `P1` 白名单补丁范围
- 建立 `P2` 记忆层
- 补 Reader 深交互真机场景
- 补发布矩阵
- 补工程化维护能力

## 最后说明

如果你不确定一个改动是不是会突破 clean-room 边界，先停下来，优先保守处理。
