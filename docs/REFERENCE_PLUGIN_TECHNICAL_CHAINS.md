# Reference Plugin Technical Chains

本文把 `reference/plugin/*` 与 `reference/lajiplugin/*` 中多个参考项目反复出现的实现套路，抽象成可复用的 clean-room 技术链。

它不回答“某个 UI 该挂在哪个 surface”，那是 [UI Creation Paths](./UI_CREATION_PATHS.md) 的职责；它回答的是：

1. 哪些参考项目里的技术链可以安全地泛化到模板
2. 当前模板已经有哪些对应落点
3. 哪些做法只该借模式，不该把产品实现或高风险边界一起带进来

## 使用顺序

- 先判断 UI 路线：看 [docs/UI_CREATION_PATHS.md](./UI_CREATION_PATHS.md)
- 需要追溯“某个 reference 为什么被映射到这条 UI 路线”：看 [docs/REFERENCE_PLUGIN_UI_ANALYSIS.md](./REFERENCE_PLUGIN_UI_ANALYSIS.md)
- 需要按应用场景抽取 `item / collection / field / reader` 的右键菜单、子菜单、`popupshowing` 或 repair 技术链：看 [docs/REFERENCE_PLUGIN_MENU_PATTERNS.md](./REFERENCE_PLUGIN_MENU_PATTERNS.md)
- 需要抽取窗口、服务、队列、嵌入 viewer、重资源等跨项目技术链：看本文

## Clean-room 边界

- 只提炼技术链、生命周期节点、抽象边界与验证重点
- 不照抄参考项目的产品布局、文案、任务命名、品牌语义或 bundle 结构
- 不把 reference 里的高风险能力直接升级成模板默认能力
- 若某条链路会越过当前模板治理边界，只记录为 future path，不默认接入当前主链

## 第二批新增参考项目摘录

这一批新增目录里，不值得逐个“项目功能复述”。更有价值的是区分哪些目录提供了新的技术链信息，哪些只提供边界提醒：

- 本轮重点吸收的来源（当前主要位于 `reference/plugin/`）：
  - `Zotero-Exitem-main`
  - `Zotero-add-items-from-text-main`
  - `paper-chat-for-zotero-master`
  - `marginalia-main`
  - `zotero-ai-assistant-main`
  - `zotero-mcp-main`
  - `mcp-server-zotero-dev-main`
  - `zotero-smart-highlighter-master`
  - `pdf-ai-bookmarks-main`
  - `zotero-ai-collection-bootstrap`
  - `zotero-citation-bootstrap`
- 主要提供“边界/风险认知”的补充样本（当前统一归到 `reference/lajiplugin/`）：
  - `zotero-magic-for-user`
  - `ZotLink-main`
  - `Zotero-One-v6.8.2`
  - `papersgpt-v0.4.5`
  - `garden_v0.0.14`
  - `zotero-box`
- 这批新增参考带来的主要增量，不是新的宿主 UI 路线，而是四类跨项目技术链：
  - 外部 companion / 插件间 bridge
  - durable state / derived index 分层
  - `extract -> validate -> preview -> apply` 导入流水线
  - Reader selection action + context packing

## 第三批 legacy / companion-heavy 参考项目摘录

这一批 `reference/lajiplugin/` 样本更偏“老牌大而全插件”“companion-heavy 工具”“工具包型聚合 runtime”。它们不适合直接当模板骨架，但里面仍然能抽出几条很有价值的通用技术链：

- `zotero-magic-for-user`
  - 主要价值：插件间 bridge contract、共享 `Prefs` 配置发现、`Prefs + 文件缓存 + note + attachment` 的分层存储思路
  - 边界提醒：对另一个插件 runtime 的 `window.*` 级耦合太重，只适合作为 bridge adapter 灵感
- `ZotLink-main`
  - 主要价值：extractor registry、按域名/站点选择 HTTP 或浏览器抓取策略、认证 cookie 同步服务、显式 Zotero 数据目录 contract
  - 边界提醒：这是 companion runtime，不应被误当成模板默认 in-process 能力
- `Zotero-One-v6.8.2`
  - 主要价值：按 selection 语义/可编辑状态/收藏夹状态动态控制菜单显隐、禁用态和子菜单构建
  - 边界提醒：实现是强产品耦合的大单体，不适合作为模板结构来源
- `papersgpt-v0.4.5`
  - 主要价值：插件托管的静态 HTML/XHTML utility page、`_initPromise` ready gate、在独立页面内承载树视图和轻量工具 UI
  - 边界提醒：legacy `loadSubScript`/bootstrap 风格只借窗口生命周期，不回退整套旧运行时
- `garden_v0.0.14`
  - 主要价值：prompt overlay、reader ready wait、keyboard callback registry、toolkit-global 单例管理
  - 边界提醒：`zotero://ztoolkit-debug` 和插件安装 bridge 风险过高，不进模板默认链
- `zotero-box`
  - 主要价值：大规模 pref matrix 驱动多 surface 显隐、sidebox/toolbar/menu 的状态组合、文件态缓存 + refresh 联动
  - 边界提醒：产品面过宽，应该抽“descriptor + state resolver”，不要照搬其单体 runtime

这一批带来的增量主要收敛成四类补充链路：

- extractor registry + adaptive fetch strategy + auth sync
- state-driven menu exposure + dynamic submenu builder
- hosted static HTML utility app / standalone tool window
- prompt overlay + reader-ready keyboard hooks

## Chain 1. 宿主 Surface + In-surface Micro-App

适用场景：

- Item Pane section 内的复杂 HTML 面板
- context pane 内的多状态交互面板
- Reader 官方事件入口里挂载的小型到中型自定义 UI

代表参考：

- [llm-for-zotero-main/src/modules/contextPanel/index.ts](../reference/plugin/llm-for-zotero-main/src/modules/contextPanel/index.ts)
- [zotero-AI-Butler-main/src/modules/ItemPaneSection.ts](../reference/plugin/zotero-AI-Butler-main/src/modules/ItemPaneSection.ts)
- [zotero-pdf-translate-main/src/hooks.ts](../reference/plugin/zotero-pdf-translate-main/src/hooks.ts)

可复用结构：

- 宿主 surface 负责给出 root、上下文与生命周期
- micro-app 自己负责 `build -> handlers -> refresh -> dispose`
- 显式区分 `body.ownerDocument`、主窗口 document、Reader document
- 用局部 cache、dataset 或小型 registry 维持状态，不把整个 UI 绑定成全局单例

当前模板落点：

- `src/features/item-pane.js`
- `src/features/reader.js`
- `src/core/ui-factory.js`
- `docs/UI_CREATION_PATHS.md` 的 Path 1 / Path 3

不应照抄：

- 参考项目里的聊天产品流、AI 总结业务语义、侧栏具体 DOM 层级与样式结构

## Chain 2. Preference Pane Load Bridge

适用场景：

- 偏好设置面板需要静态 XHTML 片段 + 运行时脚本初始化
- 偏好页需要主题同步、控件绑定、pref 写回、按钮事件

代表参考：

- [llm-for-zotero-main/src/hooks.ts](../reference/plugin/llm-for-zotero-main/src/hooks.ts)
- [zotero-AI-Butler-main/src/hooks.ts](../reference/plugin/zotero-AI-Butler-main/src/hooks.ts)
- [zotero-format-metadata-main/src/modules/preference.ts](../reference/plugin/zotero-format-metadata-main/src/modules/preference.ts)

可复用结构：

- `PreferencePanes.register(...)` 只负责声明 pane
- pane 加载后再跑静态脚本，把 live `window`、`paneID`、`pluginID` 交给初始化函数
- 偏好页脚本只操作静态 content 资源与 live host，不直接耦合主运行时模块图
- 偏好页控件改动要有 live host evidence，不能只靠静态 DOM 猜测

当前模板落点：

- `src/features/preference-panes.js`
- `addon-static/content/preferences.xhtml`
- `addon-static/content/preferences.js`
- `addon-static/content/theme.js`
- `docs/PREFERENCE_PANE_GUIDE.md`

模板当前结论：

- 这条链已经是模板默认路径；下游无需再回退到 legacy `scripts` 驱动

## Chain 3. 声明式 Host Action Descriptor

适用场景：

- 需要把宿主动作建模成稳定 catalog，而不是散落的 DOM 探针
- 需要统一表达 preconditions、readiness、surface target 与 evidence

代表参考：

- [zotero-pdf-translate-main/src/hooks.ts](../reference/plugin/zotero-pdf-translate-main/src/hooks.ts)
- [zotero-addons-main/src/modules/addonTable.ts](../reference/plugin/zotero-addons-main/src/modules/addonTable.ts)
- [actions-and-tags-for-zotero/content/preferences.xhtml](../reference/plugin/actions-and-tags-for-zotero/content/preferences.xhtml)

可复用结构：

- 先把动作定义成 declarative descriptor
- 再由单独的 runner / replay 层执行
- 返回统一的 readiness / observedState / failureKind / evidence target
- 让场景 smoke 与 gate 消费同一份 descriptor，而不是为每个 surface 临时写一次 probe

当前模板落点：

- `src/app/host-action-catalog.js`
- `src/app/host-actions.js`
- `zotero-scenarios/*surface-smoke*.scenario.js`

模板当前结论：

- 应继续走“声明式宿主动作 + 统一结果结构”这条路
- 不把 arbitrary script / arbitrary command 执行能力带进模板默认值

## Chain 4. Standalone Dialog / Window Shell

适用场景：

- 独立管理窗口
- 批量扫描窗口
- 详情窗口、历史版本窗口
- 需要 `focus / reopen / close cleanup` 的子窗口

代表参考：

- [zotero-addons-main/src/modules/addonTable.ts](../reference/plugin/zotero-addons-main/src/modules/addonTable.ts)
- [zotero-addons-main/src/modules/addonDetail.ts](../reference/plugin/zotero-addons-main/src/modules/addonDetail.ts)
- [zotero-AI-Butler-main/src/modules/libraryScannerDialog.ts](../reference/plugin/zotero-AI-Butler-main/src/modules/libraryScannerDialog.ts)
- [garden_v0.0.14/content/scripts/garden.js](../reference/lajiplugin/garden_v0.0.14/content/scripts/garden.js)

可复用结构：

- `openDialog(...)` 只负责打开壳
- `_initPromise`、`load` 或等价 ready signal 负责“何时可安全挂载”
- 已打开时优先 focus / reuse，而不是重复造窗口
- close / unload 必须回收窗口内 listener、timer、widget 和外层 registry

当前模板落点：

- `src/utils/window-shell.js`
- `src/features/window-manager.js`
- `src/utils/dialog.js`
- `docs/UI_CREATION_PATHS.md` 的 Path 9

模板当前结论：

- `src/features/window-manager.js` 继续负责主窗口挂载
- 新增的 `src/utils/window-shell.js` 负责 Path 9 的子窗口壳语义：`openDialog -> ready -> focus/reuse -> cleanup`
- 轻量 prompt/confirm 仍走 `src/utils/dialog.js`，不要把它误当成完整 window shell manager

## Chain 4A. Host-mounted React Surface Bridge

适用场景：

- 已经明确要继续使用宿主 surface，而不是独立 iframe/app
- HTML micro-app 已接近组件化前端复杂度
- 希望复用同一套组件树到 `docked / floating / standalone` 等不同 shell
- 仍想把宿主 lifecycle、geometry 和 evidence 判定留在 JS core

来源索引：

- `AIAssistant` 的 `src/features/reader-chat-ui/react-surface.js`
- `AIAssistant` 的 `src/react-ui/reader-chat-window/entry.tsx`
- `AIAssistant` 的 `docs/AGENT_REACT_ARCHITECTURE_BLUEPRINT.md`

可复用结构：

- JS host 侧只负责 root/container、`loadSubScript(...)`、样式单次注入和 mount lifecycle
- React bundle 只暴露全局 renderer bridge：`mount / update / unmount`
- 全局 bridge 需要同时兼容 `window / wrappedJSObject / globalThis`
- 同一组件树可挂到多个 shell，但 `preferred/effective/fallbackReason` 这类窗口模式语义仍应由 JS host 侧掌握

当前模板落点：

- `src/utils/react-surface-bridge.js`
- `src/utils/surface-window-mode.js`
- `src/react-ui/shared/renderer-bridge.tsx`
- `src/react-ui/surface-bridge/entry.tsx`
- `docs/REFERENCE_AIASSISTANT_REACT_PANEL_PATTERNS.md`

模板当前结论：

- 这条链已进入 default-disabled `react-ui` optional bundle 的 implemented baseline
- 模板只吸收了 bridge contract 和 mode normalization，不吸收产品型 dock geometry controller
- 若只是普通 HTML panel，仍优先 Path 3 的 micro-app；不要因为“想用 React”就把 host-visible surface 全部升级到 heavier lane

## Chain 5. Embedded Viewer / Iframe Message Bridge

适用场景：

- 独立 viewer
- 复杂图形/预览页
- 需要把“外层容器壳”和“内层运行时应用”隔离开的场景

代表参考：

- [zotero-AI-Butler-main/addon/content/mindmapViewer.html](../reference/plugin/zotero-AI-Butler-main/addon/content/mindmapViewer.html)
- [zotero-AI-Butler-main/addon/content/mindmap.html](../reference/plugin/zotero-AI-Butler-main/addon/content/mindmap.html)

可复用结构：

- 外层 shell 负责窗口、导出入口、文件权限与关闭行为
- 内层 iframe/html app 负责渲染和高耦合前端依赖
- 双方通过 `postMessage` 和 ready handshake 通信
- shell 需要 fallback resend 与 unload cleanup，避免 ready 消息丢失或窗口关闭后悬挂

当前模板落点：

- 当前模板还没有把这条链做成默认运行时能力
- 若未来进入这条路线，建议组合：
  - `src/utils/window-shell.js`
  - `src/services/resource-loader.js`
  - route-specific validator / surface-local evidence

模板当前结论：

- 这是一条 future path，不是当前默认基线
- 只有当官方 surface + micro-app 明显不够时，才升级到 iframe app

## Chain 6. Provider Registry + Task Runner + Queue

适用场景：

- 多 provider / 多后端适配
- 后台批处理
- 需要 fallback、优先级、重试、批次节流的任务执行

代表参考：

- [zotero-pdf-translate-main/src/modules/services/base.ts](../reference/plugin/zotero-pdf-translate-main/src/modules/services/base.ts)
- [zotero-pdf-translate-main/src/modules/services/index.ts](../reference/plugin/zotero-pdf-translate-main/src/modules/services/index.ts)
- [zotero-pdf-translate-main/src/utils/task.ts](../reference/plugin/zotero-pdf-translate-main/src/utils/task.ts)
- [zotero-AI-Butler-main/src/modules/taskQueue.ts](../reference/plugin/zotero-AI-Butler-main/src/modules/taskQueue.ts)

可复用结构：

- provider descriptor 只描述能力、配置和调用面
- task runner 负责把单次任务补足上下文、状态与错误归一
- queue manager 负责并发、节流、重试、优先级与持久化
- UI 只消费任务状态，不直接持有执行控制权

当前模板落点：

- `src/services/registry.js`
- `src/services/resource-loader.js`
- `src/services/task-runner.js`
- `src/services/task-queue.js`

模板当前结论：

- 当前模板现已提供最小 `task runner + task queue` 骨架：runner 负责 descriptor 分发和结果快照，queue 负责并发和重试
- 若下游真的需要多 provider / 后台批处理，继续把 provider catalog、持久化与 UI 展示放在 runner 之上，不要直接把任务逻辑塞进 UI 模块

## Chain 7. File-backed Runtime State

适用场景：

- 聊天历史
- 附件引用索引
- 超出 `Prefs` 适用范围的中大型运行时状态

代表参考：

- [gemini-zotero-main/src/modules/storage/historyStorage.ts](../reference/plugin/gemini-zotero-main/src/modules/storage/historyStorage.ts)
- [llm-for-zotero-main/src/hooks.ts](../reference/plugin/llm-for-zotero-main/src/hooks.ts)
- [zotero-magic-for-user/docs/DATA_STORAGE_MODULE.md](../reference/lajiplugin/zotero-magic-for-user/docs/DATA_STORAGE_MODULE.md)

可复用结构：

- 小配置仍用 `Prefs`
- 大对象、时间序列、聊天历史改落到 `Zotero.DataDirectory.dir` 下的独立目录
- 需要 cache、debounce save、size limit 与 migration

当前模板落点：

- `src/services/file-state-store.js`
- `src/platform/zotero-file-storage.js`
- `src/platform/zotero-json-state-store.js`

模板当前结论：

- 当前模板现已提供最小 `file-state-store + zotero-file-storage` 组合：service 负责 cache/migration，platform adapter 负责 `Zotero.DataDirectory.dir` 下的文本文件读写
- 当前模板现已补上 `src/platform/zotero-json-state-store.js` 作为推荐最短路径：当目录和文件命名已明确时，直接一步接线即可
- 只有当状态明显超出设置 schema 范畴时才引入；不要把本该是配置的内容迁移成文件存储，也不要把中大型运行时状态硬塞进 `Prefs`

## Chain 8. Heavy Resource Loader

适用场景：

- WASM
- 大模型推理 runtime
- PDF/索引/嵌入模型这类高成本资源

代表参考：

- [bibgenie-0.5.7/content/modules/mupdf-loader.mjs](../reference/lajiplugin/bibgenie-0.5.7/content/modules/mupdf-loader.mjs)

可复用结构：

- `init()` 幂等
- `_initPromise` 去重
- load / validate / dispose 分离
- 多路加载与资源校验
- 关闭时显式释放内存或句柄

当前模板落点：

- `src/services/resource-loader.js`
- `docs/REFERENCE_BIBGENIE_ANALYSIS.md`

模板当前结论：

- 这条链已经被模板吸收为通用骨架
- 后续若引入重资源模块，应优先复用现有 resource loader，而不是每个模块自己发明状态机

## Chain 9. Custom Element Workspace

适用场景：

- 长期存在的复杂工作台
- 多栏 pane
- 深度 XUL 宿主集成

代表参考：

- [zotero-better-notes-master/src/extras/customElements.ts](../reference/plugin/zotero-better-notes-master/src/extras/customElements.ts)
- [zotero-pdf-translate-main/src/extras/customElements.ts](../reference/plugin/zotero-pdf-translate-main/src/extras/customElements.ts)

可复用结构：

- define-once registry
- custom element 自己管理 `init / render / destroy`
- 宿主长期存在的 pane 骨架与业务逻辑分层

当前模板落点：

- 当前模板没有默认启用这条路线
- 相关选型与验证边界见：
  - [docs/UI_CREATION_PATHS.md](./UI_CREATION_PATHS.md)
  - [docs/UI_VALIDATION_PATHS.md](./UI_VALIDATION_PATHS.md)

模板当前结论：

- 这是高级路线，不应作为默认 demo 或默认模板入口
- 只有在下一波扩展明确需要“长期存在的复杂工作台”时，才值得进入新 wave

## Chain 10. Companion Runtime / Plugin-to-Plugin Bridge

适用场景：

- 需要复用“已安装的另一个 Zotero 插件”提供的运行时或配置
- 需要把 Zotero 进程内能力桥接给本地 HTTP / MCP companion
- 需要让外部 AI / Python / Node runtime 与 Zotero 保持显式会话

代表参考：

- [Zotero-Exitem-main/src/modules/reviewConfig.ts](../reference/plugin/Zotero-Exitem-main/src/modules/reviewConfig.ts)
- [Zotero-Exitem-main/src/modules/reviewAI.ts](../reference/plugin/Zotero-Exitem-main/src/modules/reviewAI.ts)
- [zotero-magic-for-user/PLUGIN_COMMUNICATION.md](../reference/lajiplugin/zotero-magic-for-user/PLUGIN_COMMUNICATION.md)
- [zotero-mcp-main/zotero-mcp-plugin/src/modules/httpServer.ts](../reference/plugin/zotero-mcp-main/zotero-mcp-plugin/src/modules/httpServer.ts)
- [zotero-mcp-main/zotero-mcp-plugin/src/modules/streamableMCPServer.ts](../reference/plugin/zotero-mcp-main/zotero-mcp-plugin/src/modules/streamableMCPServer.ts)
- [mcp-server-zotero-dev-main/ARCHITECTURE.md](../reference/plugin/mcp-server-zotero-dev-main/ARCHITECTURE.md)
- [ZotLink-main/run_server.py](../reference/plugin/ZotLink-main/run_server.py)

可复用结构：

- 先做 capability detection / readiness detection，再决定是否启用 bridge
- bridge adapter 单独收口，不把 `window.*`、共享 prefs、端口会话和业务逻辑混写
- 会话、端口、超时、错误归一、降级提示都应是 contract，而不是散落在 UI 逻辑里
- 明确区分：
  - plugin-to-plugin bridge
  - in-process HTTP/MCP server
  - out-of-process companion runtime
- 桥接能力必须可禁用、可诊断、可清理，不能默认永久常驻

当前模板落点：

- `src/core/http.js`
- `src/services/resource-loader.js`
- `src/services/task-runner.js`
- `src/app/runtime-capabilities.js`
- `src/platform/*`

模板当前结论：

- 这条链目前还不是模板默认能力，但已经成为明确的 future path
- 如果后续要吸收，只应引入“bridge contract + capability detection + session cleanup”这部分低风险骨架
- 不把 arbitrary external command、arbitrary script、隐式全局 API 读取带进模板默认值

## Chain 11. Durable State + Rebuildable Derived Index

适用场景：

- 多会话历史、任务状态、认证状态等“不可轻易重建”的运行时数据
- semantic index、向量缓存、列状态这类“可重建但更新昂贵”的派生数据
- 需要 notifier 驱动、debounce 更新、增量重建和 view refresh 的长期状态

代表参考：

- [paper-chat-for-zotero-master/src/modules/chat/db/StorageDatabase.ts](../reference/plugin/paper-chat-for-zotero-master/src/modules/chat/db/StorageDatabase.ts)
- [paper-chat-for-zotero-master/src/modules/chat/migration/migrateToSQLite.ts](../reference/plugin/paper-chat-for-zotero-master/src/modules/chat/migration/migrateToSQLite.ts)
- [marginalia-main/src/modules/storageManager.ts](../reference/plugin/marginalia-main/src/modules/storageManager.ts)
- [zotero-mcp-main/zotero-mcp-plugin/src/hooks.ts](../reference/plugin/zotero-mcp-main/zotero-mcp-plugin/src/hooks.ts)
- [zotero-mcp-main/zotero-mcp-plugin/src/modules/semanticIndexColumn.ts](../reference/plugin/zotero-mcp-main/zotero-mcp-plugin/src/modules/semanticIndexColumn.ts)
- [zotero-box/content/scripts/zoterobox.js](../reference/lajiplugin/zotero-box/content/scripts/zoterobox.js)

可复用结构：

- 明确区分 durable state 与 rebuildable index，不把两者混进同一层存储语义
- 存储初始化应具备 `initPromise` / 幂等 / schema version / migration
- 派生索引更新宜走：
  - notifier
  - pending set
  - debounce
  - batch rebuild / incremental update
  - surface refresh
- 面向 ItemTree/列表列等高频 surface，要有短 TTL cache 和显式 invalidation
- 不可重建的数据要优先追求一致性；可重建的数据要优先追求刷新成本可控

当前模板落点：

- `src/services/file-state-store.js`
- `src/platform/zotero-file-storage.js`
- `src/platform/zotero-json-state-store.js`
- `src/services/task-queue.js`

模板当前结论：

- 模板当前已经覆盖“JSON 文件态”的最小 durable state 路径
- 新参考提示我们下一步若进入更重的 runtime state，可以考虑补：
  - `sqlite-state-store`
  - `derived-index-manager`
  - `notifier-driven batch updater`
- 在未明确进入这类 wave 前，不应把 SQLite / semantic index 默认塞进模板主链

## Chain 12. Structured Import / Preview / Apply Pipeline

适用场景：

- 从自由文本、LLM 提炼结果或半结构化输入批量生成 Zotero 条目
- 批量导入前需要 preview、校验、选择性应用与回滚友好的错误呈现
- 需要把“提取”“验证”“导入”拆成不同阶段，而不是一键黑盒执行

代表参考：

- [Zotero-add-items-from-text-main/src/llm/service.ts](../reference/plugin/Zotero-add-items-from-text-main/src/llm/service.ts)
- [Zotero-add-items-from-text-main/src/import.ts](../reference/plugin/Zotero-add-items-from-text-main/src/import.ts)
- [Zotero-add-items-from-text-main/src/ui.ts](../reference/plugin/Zotero-add-items-from-text-main/src/ui.ts)
- [Zotero-Exitem-main/src/modules/reviewAI.ts](../reference/plugin/Zotero-Exitem-main/src/modules/reviewAI.ts)

可复用结构：

- 建议固定分层为：
  - capture input
  - extract structured result
  - lenient parse / normalize
  - validate / align
  - preview / select
  - apply / import
  - summarize errors
- `lenient JSON parse + normalize + index alignment` 很适合作为模板级通用小原语
- item type / DOI / author / extra 的 normalization 应独立于 UI 对话框
- preview dialog 与 progress dialog 只负责交互，不直接承担导入规则
- cancel token、分批进度与错误聚合，比单次大函数更适合模板抽象

当前模板落点：

- `src/utils/dialog.js`
- `src/utils/progress-window.js`
- `src/utils/window-shell.js`
- `src/services/task-runner.js`

模板当前结论：

- 模板当前缺少一条明确的“structured import pipeline”通用骨架
- 这是非常值得补进模板的下一类 clean-room 原语，但应保持 runtime-neutral，不绑定具体 LLM/provider 语义

## Chain 13. Reader Selection Actions + Context Packing

适用场景：

- Reader 选中文本浮层里注入翻译、解释、引用、摘要等动作
- 需要把“选中文本 + 条目元数据 + PDF 全文 / 批注 / 局部上下文”打包给上层服务
- 在调用昂贵模型前，先做启发式筛选、chunking 或本地候选提炼

代表参考：

- [marginalia-main/src/modules/translationPopup.ts](../reference/plugin/marginalia-main/src/modules/translationPopup.ts)
- [zotero-ai-assistant-main/src/modules/reader.ts](../reference/plugin/zotero-ai-assistant-main/src/modules/reader.ts)
- [paper-chat-for-zotero-master/src/modules/chat/PdfExtractor.ts](../reference/plugin/paper-chat-for-zotero-master/src/modules/chat/PdfExtractor.ts)
- [zotero-smart-highlighter-master/src/reading-highlights.ts](../reference/plugin/zotero-smart-highlighter-master/src/reading-highlights.ts)
- [pdf-ai-bookmarks-main/pdf-ai-bookmarks.js](../reference/plugin/pdf-ai-bookmarks-main/pdf-ai-bookmarks.js)

可复用结构：

- 低层事件入口继续基于 `renderTextSelectionPopup`
- 高层逻辑应拆成：
  - action registration
  - context packing
  - optional heuristic pre-processing
  - async execution
  - UI feedback / cleanup
- 选区动作常常需要 fallback：
  - 直接读 event params
  - 读当前 Reader 选区
  - 读附件全文 / 批注文本
- 本地 heuristic / rerank / chunking 适合在昂贵 LLM 调用前先做一层廉价筛选
- popup 内按钮与结果容器应视为 surface-local UI，不应偷偷扩张成全局 runtime 单例

当前模板落点：

- `src/features/reader.js`
- `src/app/host-action-catalog.js`
- `src/app/host-actions.js`

模板当前结论：

- 模板当前已经有 Reader 事件桥与 host action 基础，但还缺少上层 `reader-selection-actions` / `reader-content-extractor` 级别的可复用原语
- 这条链很适合作为下一步模板改进目标，因为它仍然保持 clean-room、host-aligned、且不必默认绑定 AI provider

## Chain 14. Extractor Registry + Adaptive Fetch Strategy

适用场景：

- 需要从 URL、DOI 或站点页面提取结构化元数据
- 同一类任务既可能走纯 HTTP，也可能因为反爬/登录/动态页面而需要浏览器驱动
- companion runtime 需要把认证状态、路径 contract 和抓取策略独立管理

代表参考：

- [ZotLink-main/zotlink/extractors/base_extractor.py](../reference/plugin/ZotLink-main/zotlink/extractors/base_extractor.py)
- [ZotLink-main/zotlink/extractors/extractor_manager.py](../reference/plugin/ZotLink-main/zotlink/extractors/extractor_manager.py)
- [ZotLink-main/zotlink/cookie_sync/sync_manager.py](../reference/plugin/ZotLink-main/zotlink/cookie_sync/sync_manager.py)
- [ZotLink-main/zotlink/zotero_integration.py](../reference/plugin/ZotLink-main/zotlink/zotero_integration.py)
- [ZotLink-main/zotlink/zotero_mcp_server.py](../reference/plugin/ZotLink-main/zotlink/zotero_mcp_server.py)

可复用结构：

- 用 base extractor contract 固定 `canHandle / extract / requiresAuth / supportedTypes`
- manager 只负责：
  - 注册 extractor
  - 选择策略
  - fallback
  - 错误归一
- 认证状态与 cookie 同步服务单独建层，不和抓取规则混写
- 显式区分：
  - HTTP extractor
  - browser extractor
  - auth sync service
  - Zotero integration adapter
- 如果 companion 依赖 Zotero 数据目录或数据库路径，路径来源必须有清晰优先级和显式 override contract

当前模板落点：

- `src/services/registry.js`
- `src/core/http.js`
- `src/services/task-runner.js`
- `src/services/task-queue.js`
- `src/platform/*`

模板当前结论：

- 这条链非常适合作为未来“companion extraction/import pipeline”参考
- 但模板默认值只应吸收 `extractor contract + strategy selection + error normalization` 这部分低风险骨架
- cookie 抓取、浏览器驱动和外部 companion 常驻服务，仍应保持显式 opt-in

## Chain 15. State-driven Menu Exposure + Dynamic Submenu Builder

适用场景：

- 菜单项是否出现，取决于当前 selection 语义、编辑权限、tab 类型和用户配置
- 需要按实时数据构建“转到收藏夹”“关联集合”“附件动作”这类子菜单
- 同一套功能要在 item menu、collection menu、toolbar、sidebox 之间共享状态判断

代表参考：

- [Zotero-One-v6.8.2/Zotero-One-v6.8.2-deobfuscated/ui/ui.js](../reference/lajiplugin/Zotero-One-v6.8.2/Zotero-One-v6.8.2-deobfuscated/ui/ui.js)
- [zotero-box/content/prefs.xhtml](../reference/lajiplugin/zotero-box/content/prefs.xhtml)
- [zotero-box/content/scripts/zoterobox.js](../reference/lajiplugin/zotero-box/content/scripts/zoterobox.js)

可复用结构：

- 先把 live context 收敛成稳定状态对象，例如：
  - `libraryType`
  - `selectedType`
  - `editable`
  - `tabType`
  - `preference flags`
- 菜单 descriptor 只表达“何时 visible / disabled / children”，不直接掺业务副作用
- 动态 submenu builder 单独读取当前 collections / favorites / attachment capabilities，再产出 children
- sidebox / toolbar / context pane 这类真实 surface，优先由同一份状态解析层驱动，避免每个 surface 各写一套 if/else
- 状态变化后要能局部 refresh，而不是靠整页重挂载恢复正确性

当前模板落点：

- `src/features/menu-manager.js`
- `src/app/host-action-catalog.js`
- `src/app/host-actions.js`
- `src/features/item-pane.js`
- `src/features/reader.js`

模板当前结论：

- 这条链现已进入模板基线：`createMenuStateResolver()`、`registerStateDrivenMenu()` 与 `menu.show / menu.trigger` 的 `menuPath` 验证链已把 dynamic submenu builder 收到 host-visible surface 主链
- 当前继续补强的重点不再是“是否吸收这条链”，而是围绕 collection scene、submenu path 与 surface-local evidence 细化验证

## Chain 16. Hosted Static HTML Utility App

适用场景：

- 需要一个独立于宿主 surface 的轻量工具页、树视图页、批处理页或聊天页
- UI 复杂度已经超过 alert/prompt，但又没必要升级到 iframe app 或长期常驻 workspace
- 希望窗口壳和页面内应用之间保持清晰边界

代表参考：

- [papersgpt-v0.4.5/bootstrap.js](../reference/lajiplugin/papersgpt-v0.4.5/bootstrap.js)
- [papersgpt-v0.4.5/chrome/content/autopilot.html](../reference/lajiplugin/papersgpt-v0.4.5/chrome/content/autopilot.html)
- [papersgpt-v0.4.5/chrome/content/selectpapers.html](../reference/lajiplugin/papersgpt-v0.4.5/chrome/content/selectpapers.html)
- [papersgpt-v0.4.5/chrome/content/addons.xhtml](../reference/lajiplugin/papersgpt-v0.4.5/chrome/content/addons.xhtml)

可复用结构：

- 窗口壳只负责打开页面、传入最小初始化参数和 ready gate
- 页面内应用自己负责 DOM、样式、虚拟列表/树、局部交互与事件绑定
- `_initPromise` 或等价 ready signal 应明确暴露给窗口壳，而不是靠猜测页面何时可用
- 静态工具页应保持“hosted utility app”边界，只向壳层申请必要能力，不反向耦合整个插件运行时
- 如果页面只是独立工具，不必强行挂回 item pane / context pane

当前模板落点：

- `src/utils/window-shell.js`
- `src/utils/dialog.js`
- `addon-static/content/*`
- [docs/UI_CREATION_PATHS.md](./UI_CREATION_PATHS.md) 的 Path 9

模板当前结论：

- 这是比 iframe app 更轻、也更容易 clean-room 化的一条中间路线
- 当官方 surface 明显不适合承载整块工具页时，可以优先考虑“window shell + hosted static page”

## Chain 17. Prompt Overlay + Reader-ready Keyboard Hooks

适用场景：

- 需要命令面板 / prompt overlay 来触发多种动作，而不想把交互绑死在单个菜单入口
- 需要让快捷键同时覆盖主窗口和 Reader iframe
- Reader 相关键盘动作只有在 reader 完全 ready 后才安全绑定

代表参考：

- [garden_v0.0.14/content/scripts/garden.js](../reference/lajiplugin/garden_v0.0.14/content/scripts/garden.js)

可复用结构：

- prompt manager 与具体命令逻辑分层，overlay 只负责输入、建议和执行调度
- keyboard callback registry 单独维护注册/注销，不把快捷键副作用散到业务模块
- 绑定 Reader 键盘事件前先等 ready signal，例如：
  - `_initPromise`
  - view initialized
  - iframe ready
- 需要跨窗口时，优先做 window-scoped singleton，而不是把 overlay/shortcut 状态散落成多个半初始化实例
- 清理顺序要显式：unregister callbacks、移除 DOM、释放 window 级引用

当前模板落点：

- `src/features/prompt.js`
- `src/core/lifecycle.js`
- `src/features/reader.js`

模板当前结论：

- 当前模板已经有 command palette 集成基础，但还没有把 reader-ready keyboard hooks 抽成通用层
- 如果未来要补强命令面板体验，可以吸收这条链；但不要把 `garden` 里的 debug/install bridge 一起带进来

## High-risk Chain: Arbitrary Script / Debug / Install Bridge

代表参考：

- [actions-and-tags-for-zotero/content/scripts/zoterotag.js](../reference/plugin/actions-and-tags-for-zotero/content/scripts/zoterotag.js)
- [garden_v0.0.14/content/scripts/garden.js](../reference/lajiplugin/garden_v0.0.14/content/scripts/garden.js)

观察结论：

- 某些参考项目把“脚本执行”“调试桥”“外部 URL 驱动动作”做成强能力入口
- 另一些工具包型项目还会把“协议驱动安装插件”或“外部应用远程执行命令”做成默认 bridge
- 这类能力对产品插件可能有价值，但对 clean-room 模板默认值而言风险过高

模板结论：

- 不将 arbitrary script / arbitrary command / arbitrary external bridge / protocol-driven install bridge 作为模板默认能力
- 模板只吸收其中“声明式动作 catalog + 前置条件 + 验证 contract”这部分低风险结构

## 当前模板建议优先复用的原语

- `src/features/preference-panes.js`
- `src/features/menu-manager.js`
- `src/features/prompt.js`
- `src/utils/window-shell.js`
- `src/app/host-action-catalog.js`
- `src/app/host-actions.js`
- `src/services/registry.js`
- `src/services/file-state-store.js`
- `src/platform/zotero-file-storage.js`
- `src/platform/zotero-json-state-store.js`
- `src/services/resource-loader.js`
- `src/services/task-runner.js`
- `src/services/task-queue.js`

## 一句话决策表

- 只是选 UI 路线：看 [docs/UI_CREATION_PATHS.md](./UI_CREATION_PATHS.md)
- 要管理偏好页静态脚本桥：走 `Preference Pane Load Bridge`
- 要做子窗口壳：走 `src/utils/window-shell.js`
- 要做 provider / 后台任务：先从 `src/services/task-runner.js` + `src/services/task-queue.js` 起步
- 要做中大型运行时状态：先从 `src/services/file-state-store.js` 起步
- 要把 file state 接到 Zotero 宿主：优先用 `src/platform/zotero-file-storage.js`
- 目录和文件名已明确时：优先用 `src/platform/zotero-json-state-store.js`
- 要做重资源：先复用 `src/services/resource-loader.js`
- 要接外部 companion / 已装插件 runtime：先建 bridge contract，不要直接在业务层读取 `window.*` / 跨插件 prefs
- 要做 companion 抽取/导入：优先按 `extractor registry -> strategy selection -> auth sync -> apply` 分层
- 要做状态驱动菜单/子菜单：优先先补 context resolver，再补 menu descriptor / submenu builder
- 要做导入类工作流：优先按 `extract -> validate -> preview -> apply` 分层
- 要做 Reader 选区动作：优先按 `renderTextSelectionPopup -> context pack -> async action -> cleanup` 分层
- 要做托管工具页：优先用 `src/utils/window-shell.js` 承载 hosted static HTML page
- 要做命令面板 + Reader 快捷键：优先把 prompt manager 与 reader-ready keyboard hooks 分层
- 要做 iframe app 或 custom element workspace：先确认是否真的进入了新的 expansion wave
