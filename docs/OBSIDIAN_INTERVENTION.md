# Obsidian 人工介入

当前项目已经支持把当前插件的功能、可见面、技术脉络和自动化证据导出到独立的 Obsidian 工作台目录，并在其中提供：

- 当前插件功能与技术脉络白板
- 当前插件状态总览
- 当前插件证据索引
- 当前插件功能与可见面地图
- 当前插件功能模块图谱
- 当前插件技术脉络与宿主接入说明
- 面向当前插件的 UI 概念图
- 更接近真实宿主布局的 UI 具象 Excalidraw
- 仅供人工协作阅读的模板快速上手 / 高级介入规范
- 唯一的人机协作输入窗口

当前默认输出仍是以上 Markdown + Canvas + Excalidraw 工作台；如果设置 `AGENT_OBSIDIAN_VISUALS=1`，还会额外生成 Mermaid / Excalidraw companion 视图。

## 目标

当自动化链路无法直接完成修复时，让人工可以在 Obsidian 中接管，并且优先围绕“当前 Zotero 插件”而不是模板框架本身来判断：

- 阅读当前结论
- 查看阻塞项
- 理解当前插件有哪些可见面和宿主接入点
- 打开候选文件
- 在白板和 UI 概念图上整理问题、证据和下一步动作

## 命令

```bash
npm run agent:obsidian
npm run agent:zotero:loop:human
npm run agent:ui:design -- list
npm run agent:ui:design -- run product-ui-design-update --goal "<你的设计目标>"
AGENT_OBSIDIAN_VISUALS=1 npm run agent:obsidian
```

运行后会输出到：

- `obsidian/agent-workbench/00-当前Zotero插件-功能与技术脉络.canvas`
- `obsidian/agent-workbench/01-当前Zotero插件-状态总览.md`
- `obsidian/agent-workbench/02-当前Zotero插件-证据索引.md`
- `obsidian/agent-workbench/03-模板协作-人工快速上手.md`
- `obsidian/agent-workbench/04-模板协作-高级介入规范.md`
- `obsidian/agent-workbench/05-当前Zotero插件-功能与可见面地图.md`
- `obsidian/agent-workbench/06-当前Zotero插件-技术脉络与宿主接入.md`
- `obsidian/agent-workbench/07-当前Zotero插件-偏好设置面板 UI 概念.excalidraw.md`
- `obsidian/agent-workbench/08-当前Zotero插件-条目与上下文窗格 UI 概念.excalidraw.md`
- `obsidian/agent-workbench/09-当前Zotero插件-Reader UI 概念.excalidraw.md`
- `obsidian/agent-workbench/10-模板协作-人工指令窗口.md`
- `obsidian/agent-workbench/11-当前Zotero插件-菜单与子菜单 UI 概念.excalidraw.md`
- `obsidian/agent-workbench/项目模块图谱/00-当前Zotero插件-功能模块总览.md`
- `obsidian/agent-workbench/项目模块图谱/01-主线-偏好设置与宿主窗格.md`
- `obsidian/agent-workbench/项目模块图谱/02-主线-Reader 工具栏与侧栏.md`
- `obsidian/agent-workbench/项目模块图谱/03-主线-菜单与子菜单.md`
- `obsidian/agent-workbench/项目模块图谱/04-支撑-统一装配与 Host Action.md`
- `obsidian/agent-workbench/项目模块图谱/05-支撑-验证与证据闭环.md`
- `obsidian/agent-workbench/项目模块图谱/06-当前扩展波次-模块焦点.md`
- `obsidian/agent-workbench/项目模块图谱/07-能力目录-当前插件能力清单.md`
- `obsidian/agent-workbench/项目模块图谱/当前Zotero插件-功能模块图谱.canvas`
- `obsidian/agent-workbench/14-当前Zotero插件-UI 具象布局图.excalidraw.md`

启用 `AGENT_OBSIDIAN_VISUALS=1` 时还会额外输出：

- `obsidian/agent-workbench/12-当前Zotero插件-交互流转图.md`
- `obsidian/agent-workbench/13-当前Zotero插件-功能版图.excalidraw.md`

手工触发产品整体 UI 设计链后，还会额外输出：

- `obsidian/agent-workbench/20-当前Zotero插件-产品整体 UI 设计与更新流程.excalidraw.md`

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
3. 如果你要人工触发一轮“产品整体 UI 设计 / 更新”草图，再执行：
   - `npm run agent:ui:design -- run product-ui-design-update --goal "<你的设计目标>"`
4. 在 Obsidian 中打开工作区，并进入 `obsidian/agent-workbench/`
5. 优先查看：
   - `01-当前Zotero插件-状态总览.md`
   - `00-当前Zotero插件-功能与技术脉络.canvas`
   - `05-当前Zotero插件-功能与可见面地图.md`
   - `项目模块图谱/00-当前Zotero插件-功能模块总览.md`
   - `项目模块图谱/06-当前扩展波次-模块焦点.md`
   - `项目模块图谱/07-能力目录-当前插件能力清单.md`
   - `06-当前Zotero插件-技术脉络与宿主接入.md`
   - `14-当前Zotero插件-UI 具象布局图.excalidraw.md`
   - `03-模板协作-人工快速上手.md`
   - `04-模板协作-高级介入规范.md`
   - `10-模板协作-人工指令窗口.md`
   - `20-当前Zotero插件-产品整体 UI 设计与更新流程.excalidraw.md`（仅在手工 UI 设计链运行后出现）

## 包含内容

- 当前插件主线、摘要结论、下一步建议
- 当前插件功能与技术脉络白板：把功能组、可见面、宿主接入点和证据入口放在同一个空间里
- 当前插件功能与可见面地图：按 `preference pane / item pane / context pane / reader / menu item` 等 surface 分组归纳
- 当前插件功能模块图谱：把当前项目按“主线骨架 / 支撑能力”拆成模块卡片和独立 canvas，便于快速理解哪些模块构成当前插件
- 当前扩展波次模块焦点：把 current wave 的 in-scope / out-of-scope / acceptance track 和当前模块图谱的关系单独写清
- 当前插件能力目录：从 `dev/agent-runtime/capability-manifest.js` 自动派生能力、入口、场景与责任文件，帮助把“模块”继续落到“能力”
- 当前插件技术脉络与宿主接入：说明为什么当前 surface 走宿主注册式、统一节点工厂、菜单注入或 Reader 接入链
- 当前插件 UI 概念图：按偏好设置、条目/上下文窗格、Reader、菜单与子菜单分拆，便于单独讨论某一块 UI
- 当前插件 UI 具象图：把各个 surface 放回接近真实宿主布局的位置，方便开发者建立“模块名 -> 实际界面位置”的直觉映射
- 手工触发的产品整体 UI 设计草图：只在 `20-当前Zotero插件-产品整体 UI 设计与更新流程.excalidraw.md` 中呈现整体产品 UI 设计与演进步骤
- 可选视觉层：交互流转 Mermaid 与功能版图 Excalidraw
- 模板协作快速上手：只给人类阅读，不作为 agent 输入，帮助新接手的人理解如何在当前插件工作台中协作
- 模板协作高级介入规范：只给人类阅读，不作为 agent 输入，适合正式接管一轮执行路径时参考字段语义和介入边界
- 模板协作人工指令窗口：支持填写状态、模式、下一步指令、关注文件、备注
- 人工编辑区保留：agent 刷新工作台时会保留 `## 人工编辑区（保留）` 之后的内容
- 证据工件索引
- Agent 会保留人工编辑区，不会在刷新工作台时覆盖人工指令
- `agent:ui:design` 只允许把设计呈现落到单独的 Obsidian Excalidraw 草图，不覆盖默认 `07~11 / 14` 自动图

说明：

- `AGENT_OBSIDIAN_VISUALS=1` 只是可选增强层，不会改变 `watch / e2e / gate / loop` 的判定语义。
- Mermaid / Excalidraw 只读现有 summary / evidence，不是新的判定源，也不替代 `10-模板协作-人工指令窗口.md`。
- `20-当前Zotero插件-产品整体 UI 设计与更新流程.excalidraw.md` 只作为设计呈现工件；如果要改变 agent 的执行路径，仍然只改 `10-模板协作-人工指令窗口.md`。

## Reader Verdict 收尾约束

当当前阶段显示“等待人工 Reader verdict”时，人工窗口仍然只有这 5 个字段：

- `状态`
- `模式`
- `下一步指令`
- `关注文件`
- `备注`

不要新增第二套输入机制，也不要把 Mermaid / Excalidraw 当成新的 verdict 来源。唯一人工输入面仍然是 `10-模板协作-人工指令窗口.md`。

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
- 如果人工没有改动 `10-模板协作-人工指令窗口.md`，agent 会按自动路径继续
- 如果人工填写了 `force-next + npm run agent:zotero:e2e:update-baseline`，当前回合只执行一次受控 baseline refresh，然后回到默认闭环
- 如果人工填写了 `hold` 模式，当前回合会停在人工设定的节点，等待下一步处理

## 建议流程

推荐把这套链路理解成：

- agent 先自动构建、验证、生成证据
- Obsidian 默认工作台反映的是当前插件的功能面、UI 面和技术脉络，不是模板框架总览
- 模板相关内容只保留在人工协作指南里，避免把框架语义混成当前插件状态
- 人工只在 Obsidian 工作台中改“人工指令窗口”或补充分析
- agent 下一轮读取人工修改，修正开发路径
- agent 完成新一轮执行后，再刷新白板与说明文档

## 配合导出

如果你要把当前插件工程单独交给别人继续开发，而不带 agent / runner / 参考目录等辅助框架，可以再执行：

```bash
npm run export:project
```

这样会在 `dist/` 下生成纯项目导出包。
