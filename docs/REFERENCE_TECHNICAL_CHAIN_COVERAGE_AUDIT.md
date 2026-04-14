# Reference 技术链覆盖审计

> 用途：回答“当前 managed reference 项目的主要技术链，是否已经被 `REFERENCE_INDEX -> REFERENCE_* -> UI_*` 这层文档承接”。
> 首次沉淀：2026-04-12

## 结论先看

结论不是“都整理完了”，而是：

- **UI 路线、菜单模式、通用插件技术链** 这三大块已经有较稳定的索引层
- **本轮 update 后新浮现的几条关键链** 目前还没有完全升级成“可按任务检索的专题”
- 这些新增链现在大多只停留在：
  - [REFERENCE_UPDATED_PROJECT_MODULE_DELTA.md](./REFERENCE_UPDATED_PROJECT_MODULE_DELTA.md)
  - 或少量 generic chain / UI path 的零散承接

因此，当前 reference 索引层是 **部分覆盖、不是全覆盖**。

## 审计范围

- 当前 managed refs：`config/reference-projects.json`
- 当前索引/专题层：
  - [REFERENCE_INDEX.md](./REFERENCE_INDEX.md)
  - [REFERENCE_PLUGIN_TECHNICAL_CHAINS.md](./REFERENCE_PLUGIN_TECHNICAL_CHAINS.md)
  - [REFERENCE_PLUGIN_MENU_PATTERNS.md](./REFERENCE_PLUGIN_MENU_PATTERNS.md)
  - [REFERENCE_PLUGIN_UI_ANALYSIS.md](./REFERENCE_PLUGIN_UI_ANALYSIS.md)
  - [REFERENCE_AIASSISTANT_REACT_PANEL_PATTERNS.md](./REFERENCE_AIASSISTANT_REACT_PANEL_PATTERNS.md)
  - [REFERENCE_DOM_CONTRACT_VALIDATION_FEASIBILITY.md](./REFERENCE_DOM_CONTRACT_VALIDATION_FEASIBILITY.md)
  - [UI_CREATION_PATHS.md](./UI_CREATION_PATHS.md)
  - [UI_VALIDATION_PATHS.md](./UI_VALIDATION_PATHS.md)
  - [REFERENCE_UPDATED_PROJECT_MODULE_DELTA.md](./REFERENCE_UPDATED_PROJECT_MODULE_DELTA.md)

## 已经覆盖得比较好的链

以下类型已经能在索引层找到比较稳定的落点：

### 1. UI 路线 taxonomy

- 已有承接：
  - [UI_CREATION_PATHS.md](./UI_CREATION_PATHS.md)
  - [REFERENCE_PLUGIN_UI_ANALYSIS.md](./REFERENCE_PLUGIN_UI_ANALYSIS.md)
  - [REFERENCE_AIASSISTANT_REACT_PANEL_PATTERNS.md](./REFERENCE_AIASSISTANT_REACT_PANEL_PATTERNS.md)
- 已覆盖类型：
  - host 注册式 surface
  - `ztoolkit` UI DSL
  - HTML micro-app
  - React host-mounted surface bridge
  - standalone dialog / window shell
  - iframe / embedded app
  - host patch / augment

### 2. 菜单与动态子菜单

- 已有承接：
  - [REFERENCE_PLUGIN_MENU_PATTERNS.md](./REFERENCE_PLUGIN_MENU_PATTERNS.md)
  - [REFERENCE_PLUGIN_TECHNICAL_CHAINS.md](./REFERENCE_PLUGIN_TECHNICAL_CHAINS.md)
- 已覆盖类型：
  - item / collection / field / reader context menu
  - submenu builder
  - `popupshowing` refresh
  - repair / late popup / multi-window menu 恢复

### 3. 通用跨项目技术链

- 已有承接：
  - [REFERENCE_PLUGIN_TECHNICAL_CHAINS.md](./REFERENCE_PLUGIN_TECHNICAL_CHAINS.md)
- 已覆盖类型：
  - provider registry + task runner + queue
  - file-backed runtime state
  - durable state + rebuildable index
  - structured import / preview / apply pipeline
  - reader selection actions + context packing
  - extractor registry + adaptive fetch strategy
  - hosted static HTML utility app
  - prompt overlay + reader-ready keyboard hooks
  - companion runtime / plugin-to-plugin bridge

### 4. DOM contract feasibility

- 已有承接：
  - [REFERENCE_DOM_CONTRACT_VALIDATION_FEASIBILITY.md](./REFERENCE_DOM_CONTRACT_VALIDATION_FEASIBILITY.md)
- 已覆盖类型：
  - `preference pane`
  - `item pane micro-app`
  - `reader`
  - `window shell`
  - `iframe app`

## 目前只被“部分承接”的链

这些链 **不是完全没有记录**，但还没有升格成“独立任务入口”或“清晰专题”。

### 1. `llm-for-zotero-main` 的 agent runtime 链

当前已有承接：

- `contextPanel` 的 UI 侧，已被 [UI_CREATION_PATHS.md](./UI_CREATION_PATHS.md) 与 [REFERENCE_PLUGIN_TECHNICAL_CHAINS.md](./REFERENCE_PLUGIN_TECHNICAL_CHAINS.md) 部分吸收
- `standaloneWindow` 可被 `Chain 4 / Path 9` 粗略覆盖
- 文件状态与部分会话态，可被 `Chain 7 / Chain 11` 粗略覆盖

仍未被专题化的部分：

- `action registry + action execution contract`
- `tool definitions + read/search/view paper toolset`
- `file-driven skills + user skill directory`
- `conversation history scope` 与 `open/paper` 双模式会话
- `MinerU auto-watch + processing status`
- `Obsidian` 输出配置与写入链

判断：

- 这是当前 **最大的一块缺口**
- 现有索引层还没有一份“agent runtime / skills / tools / action contracts”专题

### 2. `jasminum-main` 的 headless browser / actor 抓取链

当前已有承接：

- `extractor registry + adaptive fetch strategy` 只覆盖了“策略层”
- [REFERENCE_UPDATED_PROJECT_MODULE_DELTA.md](./REFERENCE_UPDATED_PROJECT_MODULE_DELTA.md) 已明确指出 `headless browser + JSWindowActor child`

仍未被专题化的部分：

- `createHeadlessBrowser(...)`
- JSWindowActor child 的消息/求值/点击/填充/按键桥
- 宿主内 headless page automation 的边界与 clean-room 可复用面

判断：

- 当前索引层 **没有一份专门讲 headless browser + actor 驱动抓取** 的专题

### 3. `zoplicate` 的 duplicate workflow 编排链

当前已有承接：

- 菜单注入与动态显隐，可被 [REFERENCE_PLUGIN_MENU_PATTERNS.md](./REFERENCE_PLUGIN_MENU_PATTERNS.md) 粗略承接
- `notifier-driven` 派生状态更新，可被 `Chain 11` 粗略承接
- `host patch / augment` 可被 [UI_CREATION_PATHS.md](./UI_CREATION_PATHS.md) 的 Path 7 粗略承接

仍未被专题化的部分：

- duplicate pane / duplicate stats / bulk merge / non-duplicates 的整体 workflow
- `patchFindDuplicates` / `patchMergePDFAttachments` 这类宿主行为修补
- duplicate pane、menu、DB、notifier 之间的协同模式

判断：

- 现有索引层还没有一份“duplicate workflow + patcher + notifier orchestration”专题

### 4. `zotero-ai-bar-main` 的 tab-scoped 状态同步链

当前已有承接：

- Reader / Item Pane surface 本身已有 UI 路线覆盖
- [REFERENCE_UPDATED_PROJECT_MODULE_DELTA.md](./REFERENCE_UPDATED_PROJECT_MODULE_DELTA.md) 已指出 `tabObserver.ts`

仍未被专题化的部分：

- `Zotero.Notifier.registerObserver(..., ['tab'])`
- tab 切换驱动的会话上下文同步
- 多 reader / 多 tab 场景下的 window-local 状态归属

判断：

- 这是一个 **重要但还不足以单独成大专题** 的缺口
- 更适合后续并入 agent runtime 或 reader state 专题，而不是单独拉一篇超短文

### 5. `zotero-gpt` 的 bootstrap 主引导迁移链

当前已有承接：

- `prompt overlay + keyboard hooks` 可由 `Chain 17` 粗略承接
- `plugin-to-plugin bridge` 可部分覆盖 Better Notes 集成
- [REFERENCE_UPDATED_PROJECT_MODULE_DELTA.md](./REFERENCE_UPDATED_PROJECT_MODULE_DELTA.md) 已指出其 `bootstrap/source tree` 可读化价值

仍未被专题化的部分：

- 老插件从根目录脚本式实现迁移到 `addon / hooks / modules / views` 的主引导组织
- `Views + tags + Better Notes + OpenAI bridge` 的历史插件模块化重组路径

判断：

- 当前索引层还没有一份“legacy addon -> bootstrap/module tree”迁移专题
- 但这条链样本数还偏少，暂时更适合保留在审计结论里，而不是马上升格为单独权威专题

## 显式引用覆盖的机械信号

按当前 `REFERENCE_* / UI_*` 文档中的项目名显式引用看：

- 许多 managed refs 只在 1~2 份文档里出现
- `jasminum-main`、`zotero-ai-bar-main`、`zoplicate`、`zotero-gpt` 当前几乎都只在 [REFERENCE_UPDATED_PROJECT_MODULE_DELTA.md](./REFERENCE_UPDATED_PROJECT_MODULE_DELTA.md) 被明确点名
- `llm-for-zotero-main` 虽然在多份文档中出现，但其 **agent runtime 深层链路** 仍没有专门专题

这说明：

- 当前 reference 索引层更擅长覆盖“老一批已被吸收的 UI/菜单/通用骨架”
- 对“update 后新显性的能力链”还停留在增量报告层，尚未完全升格为任务路由层

## 当前推荐的补专题顺序

### P0：优先补

#### `REFERENCE_AGENT_RUNTIME_PATTERNS.md`

建议以 `llm-for-zotero-main` 为主样本，吸收：

- action registry
- tool contract
- paper read/search/view pipeline
- file-driven skills
- user skill folder
- standalone chat / history scope
- Obsidian output

#### `REFERENCE_HEADLESS_FETCH_PATTERNS.md`

建议以 `jasminum-main` 为主样本，吸收：

- headless browser service
- JSWindowActor child
- evaluate/click/fill/press 消息桥
- remote page automation 的 clean-room 边界

#### `REFERENCE_DUPLICATE_WORKFLOW_PATTERNS.md`

建议以 `zoplicate` 为主样本，吸收：

- duplicate pane
- bulk merge
- non-duplicates
- duplicate stats
- notifier refresh
- host patcher

### P1：后续并入型补充

- `tab-aware state sync`
  - 更适合并入上面的 `agent runtime` 或未来 `reader state` 专题
- `legacy addon bootstrap/module migration`
  - 更适合等再积累 1~2 个样本后再专题化

## 对当前索引层的结论

如果问题是：

- “当前 reference 索引层能不能支持大多数 UI / menu / generic chain 选型？”
  - **可以**
- “当前 managed refs 里所有重要技术链，是不是都已经有对应专题？”
  - **还没有**

更准确地说：

- 当前索引层已经形成了 **主干骨架**
- 但本轮新增价值最高的几条链，还处在 **增量报告 > 专题路由** 之间的中间态
