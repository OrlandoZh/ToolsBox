# Obsidian 人工介入

当前项目已经支持把 agent 闭环状态导出到独立的 Obsidian 工作台目录，并在其中提供：

- 项目架构白板
- 当前状态总览
- 证据索引
- 人工快速上手
- 高级介入规范
- 人工指令窗口

当前默认输出仍是以上 Markdown + Canvas 工作台；如果设置 `AGENT_OBSIDIAN_VISUALS=1`，还会额外生成 Mermaid / Excalidraw companion 视图。

## 目标

当自动化链路无法直接完成修复时，让人工可以在 Obsidian 中接管：

- 阅读当前结论
- 查看阻塞项
- 打开候选文件
- 在白板上整理问题、证据和下一步动作

## 命令

```bash
npm run agent:obsidian
npm run agent:zotero:loop:human
AGENT_OBSIDIAN_VISUALS=1 npm run agent:obsidian
```

运行后会输出到：

- `obsidian/agent-workbench/00-Zotero-Agent-项目架构与闭环.canvas`
- `obsidian/agent-workbench/01-Zotero-Agent-当前状态总览.md`
- `obsidian/agent-workbench/02-Zotero-Agent-证据索引.md`
- `obsidian/agent-workbench/03-Zotero-Agent-人工快速上手.md`
- `obsidian/agent-workbench/04-Zotero-Agent-高级介入规范.md`
- `obsidian/agent-workbench/10-Zotero-Agent-人工指令窗口.md`

启用 `AGENT_OBSIDIAN_VISUALS=1` 时还会额外输出：

- `obsidian/agent-workbench/05-Zotero-Agent-闭环流程图.md`
- `obsidian/agent-workbench/06-Zotero-Agent-人工复核决策.excalidraw.md`

如需单独管理，可设置：

```bash
AGENT_OBSIDIAN_DIR=/你的/Obsidian/工作区 npm run agent:obsidian
AGENT_OBSIDIAN_DIR=/你的/Obsidian/工作区 AGENT_OBSIDIAN_VISUALS=1 npm run agent:obsidian
```

## 推荐用法

1. 先执行一轮自动化：
   - `npm run agent:zotero:loop`
   - 或 `npm run agent:zotero:loop:human`
2. 如果只想刷新 Obsidian 视图，再执行：
   - `npm run agent:obsidian`
3. 在 Obsidian 中打开工作区，并进入 `obsidian/agent-workbench/`
4. 优先查看：
   - `01-Zotero-Agent-当前状态总览.md`
   - `00-Zotero-Agent-项目架构与闭环.canvas`
   - `03-Zotero-Agent-人工快速上手.md`
   - `04-Zotero-Agent-高级介入规范.md`
   - `10-Zotero-Agent-人工指令窗口.md`

## 包含内容

- 当前状态、摘要结论、下一步建议
- 项目架构白板：插件本体、agent 自动构建链、人工修改入口、证据工件、下一步路径
- 可选视觉层：闭环 Mermaid 流程图与人工 verdict Excalidraw 决策图
- 人工快速上手：只给人类阅读，不作为 agent 输入，适合新进入项目时先理解工作台和推荐路径
- 高级介入规范：只给人类阅读，不作为 agent 输入，适合正式接管一轮执行路径时参考字段语义和介入边界
- 人工指令窗口：支持填写状态、模式、下一步指令、关注文件、备注
- 人工编辑区保留：agent 刷新工作台时会保留 `## 人工编辑区（保留）` 之后的内容
- 证据工件索引
- Agent 会保留人工编辑区，不会在刷新工作台时覆盖人工指令

说明：

- `AGENT_OBSIDIAN_VISUALS=1` 只是可选增强层，不会改变 `watch / e2e / gate / loop` 的判定语义。
- Mermaid / Excalidraw 只读现有 summary / evidence，不是新的判定源，也不替代 `10-Zotero-Agent-人工指令窗口.md`。

## Reader Verdict 收尾约束

当当前阶段显示“等待人工 Reader verdict”时，人工窗口仍然只有这 5 个字段：

- `状态`
- `模式`
- `下一步指令`
- `关注文件`
- `备注`

不要新增第二套输入机制，也不要把 Mermaid / Excalidraw 当成新的 verdict 来源。唯一人工输入面仍然是 `10-Zotero-Agent-人工指令窗口.md`。

推荐只使用以下三种模板：

1. `预期 UI 变化`
   - `状态: ready`
   - `模式: force-next`
   - `下一步指令: npm run agent:zotero:e2e:update-baseline`
   - 含义：只执行一次受控 baseline refresh，随后回到默认闭环。
2. `真实回归`
   - `状态: hold`
   - `模式: hold`
   - `关注文件:` 填 Reader / scenario 相关最小文件集合
   - `备注:` 写清差异说明，随后再由 Codex 开最小修复批次。
3. `证据不足`
   - `状态: hold`
   - `模式: hold`
   - `备注:` 写清缺失证据项
   - 含义：先补证据，不直接刷新 baseline。

## 人工不介入时

- `npm run agent:obsidian` 只负责刷新工作台，不会阻塞自动化
- `npm run agent:zotero:loop:human` 会提供一个短暂人工窗口
- 如果人工没有改动 `10-Zotero-Agent-人工指令窗口.md`，agent 会按自动路径继续
- 如果人工填写了 `force-next + npm run agent:zotero:e2e:update-baseline`，当前回合只执行一次受控 baseline refresh，然后回到默认闭环
- 如果人工填写了 `hold` 模式，当前回合会停在人工设定的节点，等待下一步处理

## 建议流程

推荐把这套链路理解成：

- agent 先自动构建、验证、生成证据
- 人工只在 Obsidian 工作台中改“人工指令窗口”或补充分析
- agent 下一轮读取人工修改，修正开发路径
- agent 完成新一轮执行后，再刷新白板与说明文档

## 配合导出

如果你要把当前插件工程单独交给别人继续开发，而不带 agent / runner / 参考目录等辅助框架，可以再执行：

```bash
npm run export:project
```

这样会在 `dist/` 下生成纯项目导出包。
