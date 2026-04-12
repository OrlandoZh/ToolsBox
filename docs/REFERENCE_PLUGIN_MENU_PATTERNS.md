# Reference Plugin Menu Patterns

本文把 `reference/plugin/*` 与 `reference/lajiplugin/*` 中和“右键菜单 / 子菜单 / 动态菜单树”有关的实现，按应用场景重新归类，供 agent 在做 Zotero 菜单类功能时快速选型。

它回答四个问题：

1. 当前是哪个菜单场景，不要把 `item / collection / field / reader` 混成一个“右键菜单”
2. 这个场景优先走官方 `MenuManager`、`Reader.registerEventListener`，还是 `ztoolkit.Menu`
3. 哪些参考项目提供了可复用技术链
4. 哪些 legacy 做法只该保留为索引，不该回灌为模板默认能力

它不是 project truth，也不替代以下文档：

- [docs/UI_CREATION_PATHS.md](./UI_CREATION_PATHS.md)
- [docs/REFERENCE_PLUGIN_TECHNICAL_CHAINS.md](./REFERENCE_PLUGIN_TECHNICAL_CHAINS.md)
- [docs/ZOTERO_HOST_INTERFACE_CONTRACTS.md](./ZOTERO_HOST_INTERFACE_CONTRACTS.md)
- [docs/ZOTERO_HOST_SEMANTIC_INDEX.md](./ZOTERO_HOST_SEMANTIC_INDEX.md)

## 使用顺序

- 先按应用场景判断自己要改的是 `item`、`collection`、`field`、`reader view` 还是 `annotation context menu`
- 宿主已有官方注册面时，优先走官方 API，不要先上 direct DOM patch
- 只有在宿主 popup 到场晚、第三方 toolkit 已是既有前提，或目标 popup 本来就不是官方 manager 管理面时，才考虑 `ztoolkit.Menu.register(...)`
- 只有官方/`ztoolkit` 都不适配，且你明确接受更高的宿主耦合和 cleanup 责任时，才退到直接 `createXULElement("menu" / "menupopup" / "menuitem")`

## 场景总览

| 应用场景 | 首选技术链 | 次选技术链 | 代表参考 |
|---|---|---|---|
| 条目右键里的单动作入口 | `Zotero.MenuManager.registerMenu(... target: "main/library/item")` | `ztoolkit.Menu.register("item", { tag: "menuitem" })` | `zotero-pdf-translate-main`、`zotero-ainote-main`、`zotero-ai-collection-bootstrap` |
| 条目右键里的分组动作 / 子菜单 | `menuType: "submenu"` | `ztoolkit.Menu.register("item", { tag: "menu", children })` | `zotero-format-metadata-main`、`zotero-attanger-main`、`zotero-pdf2zh-main`、`zotero-AI-Butler-main` |
| Collection 右键批处理 | `target: "main/library/collection"` | `ztoolkit.Menu.register("collection", ...)` | `zotero-format-metadata-main`、`zotero-attanger-main`、`zotero-mcp-main` |
| Item Pane 字段/行级上下文菜单 | `target: "itemPane/info/row"` | 无稳定 clean-room 次选，尽量留在官方面 | `zotero-format-metadata-main` |
| Reader 空白区 / 视图区右键 | `Zotero.Reader.registerEventListener("createViewContextMenu", ...)` | 无 | `paper-chat-for-zotero-master` |
| Reader 批注右键 | `Zotero.Reader.registerEventListener("createAnnotationContextMenu", ...)` | 无 | `paper-chat-for-zotero-master`、`actions-and-tags-for-zotero` |
| 菜单项显隐/禁用依赖 live state | `onShowing / context.setVisible / context.setEnabled` | `getVisibility / isHidden / isDisabled + popupshowing` | `zotero-pdf-translate-main`、`zotero-format-metadata-main`、`actions-and-tags-for-zotero` |
| 子菜单内容需要 lazy build / 每次展开刷新 | 官方 submenu 的 `popupshowing` 初始化 | `onpopupshowing + children + popup listeners` | `zotero-main/menuManager.js`、`actions-and-tags-for-zotero`、`Zotero-One-v6.8.2` |
| popup 晚到 / 菜单偶发丢失 / 多窗口 repair | 官方 manager 之外的 repair 监听 | 直接拿 popup 节点 `ztoolkit.Menu.register(popup, ...)` | `gemini-zotero-main`、`Zotero-Exitem-main` |
| 必须直接 patch 原生 menupopup | direct `createXULElement(...)` + append + cleanup | 无 | `zotero-mcp-main`、`Zotero-One-v6.8.2` |

## 场景 1：条目右键里的单动作入口

典型需求：

- 对当前选中的常规条目执行一次批处理
- 只需要一个独立 menu item，不需要二级分组

优先技术链：

- 官方 `Zotero.MenuManager.registerMenu(...)`
- target 优先写成 `main/library/item`

代表参考：

- [reference/plugin/zotero-pdf-translate-main/src/modules/menu.ts](../reference/plugin/zotero-pdf-translate-main/src/modules/menu.ts)
- [reference/plugin/zotero-ainote-main/src/hooks.ts](../reference/plugin/zotero-ainote-main/src/hooks.ts)
- [reference/plugin/zotero-ai-collection-bootstrap/src/modules/menu.ts](../reference/plugin/zotero-ai-collection-bootstrap/src/modules/menu.ts)
- [reference/plugin/paper-chat-for-zotero-master/src/modules/ai-summary/AISummaryService.ts](../reference/plugin/paper-chat-for-zotero-master/src/modules/ai-summary/AISummaryService.ts)

可复用经验：

- `onCommand` 只消费当前 selection，不把 selection 解析散落到业务层各处
- 可见性优先按“是否有可处理条目”判断，而不是仅按偏好开关判断
- PDF attachment、note、非 regular item 是否参与，应该在 menu 层就先过滤
- 如果只是一个动作，没必要先造 submenu

模板吸收结论：

- 这是最适合模板默认收敛成统一 wrapper 的菜单场景
- 未来模板里的条目右键默认应继续优先走官方 manager，而不是直接 `ztoolkit`

## 场景 2：条目右键里的分组动作 / 子菜单

典型需求：

- 功能组里有 2 个以上动作
- 同一入口下需要分组、separator、二级 submenu
- 既要压缩顶层菜单噪声，又要保留多个 related action

首选技术链：

- 官方 `menuType: "submenu"`，子项放到 `menus: []`

次选技术链：

- `ztoolkit.Menu.register("item", { tag: "menu", children: [...] })`

代表参考：

- [reference/plugin/zotero-format-metadata-main/src/modules/menu.ts](../reference/plugin/zotero-format-metadata-main/src/modules/menu.ts)
- [reference/plugin/zotero-attanger-main/src/modules/menu.ts](../reference/plugin/zotero-attanger-main/src/modules/menu.ts)
- [reference/plugin/zotero-pdf2zh-main/plugin/src/modules/pdf2zh.ts](../reference/plugin/zotero-pdf2zh-main/plugin/src/modules/pdf2zh.ts)
- [reference/plugin/zotero-AI-Butler-main/src/hooks.ts](../reference/plugin/zotero-AI-Butler-main/src/hooks.ts)
- [reference/plugin/actions-and-tags-for-zotero/content/scripts/zoterotag.js](../reference/plugin/actions-and-tags-for-zotero/content/scripts/zoterotag.js)

可复用经验：

- “一个产品组入口 + 子项若干”适合 submenu，不适合平铺多个顶层 menu item
- separator 应写成结构的一部分，而不是在外层 append 时到处手工插
- 官方 `submenu` 更适合 target 明确、上下文稳定的 host menu
- `ztoolkit` submenu 更适合已经沉淀了 toolkit 菜单树 DSL 的项目

风险边界：

- legacy 大单体插件往往会把几十个动作都塞进一个 submenu；这只能借“树结构”，不要照搬信息架构
- `menuTools` 里的大型产品导航，不等于 item context menu 也应该做成同样的大树

模板吸收结论：

- 模板应吸收“submenu 是一等结构，不是多个平铺 item 的临时分组”
- 但不吸收任何产品特定的多级菜单树和品牌文案

## 场景 3：Collection 右键批处理

典型需求：

- 以 collection 为批处理范围执行索引、清理、批量分类、批量导入
- 右键作用对象不是 item，而是 collection 节点

首选技术链：

- 官方 `target: "main/library/collection"`

次选技术链：

- `ztoolkit.Menu.register("collection", ...)`

代表参考：

- [reference/plugin/zotero-format-metadata-main/src/modules/menu.ts](../reference/plugin/zotero-format-metadata-main/src/modules/menu.ts)
- [reference/plugin/zotero-attanger-main/src/modules/menu.ts](../reference/plugin/zotero-attanger-main/src/modules/menu.ts)
- [reference/plugin/zotero-mcp-main/zotero-mcp-plugin/src/hooks.ts](../reference/plugin/zotero-mcp-main/zotero-mcp-plugin/src/hooks.ts)
- [reference/plugin/actions-and-tags-for-zotero/content/scripts/zoterotag.js](../reference/plugin/actions-and-tags-for-zotero/content/scripts/zoterotag.js)

可复用经验：

- item 和 collection 的 selection 语义完全不同，不能复用同一套可见性判断
- collection 菜单经常天然适合 submenu，因为动作往往是“build / rebuild / clear”一组
- 如果 collection action 可能很重，菜单层只负责触发，不应在 `popupshowing` 期间做真实重活

模板吸收结论：

- 模板当前已把 collection scene 单独收口为 `hasCollectionSelection`、`collectionTreeRowID`、`collectionTreeRowType` 这组 context contract，不和 item menu 共用 context shape

## 场景 4：Item Pane 字段/行级上下文菜单

典型需求：

- 只针对某个 metadata field 或 info row 生效
- 需要知道当前 fieldName、tabType、当前行的上下文

首选技术链：

- 官方 `Zotero.MenuManager.registerMenu(...)`
- target 写成 `itemPane/info/row`

代表参考：

- [reference/plugin/zotero-format-metadata-main/src/modules/menu.ts](../reference/plugin/zotero-format-metadata-main/src/modules/menu.ts)

可复用经验：

- 用 `context.fieldName` 做精准判断，比全局扫描 Item Pane DOM 稳定
- `context.setVisible(...)` 和 `context.setEnabled(...)` 应在 `onShowing` 里完成
- 字段级菜单适合 official manager，不适合 direct DOM patch

模板吸收结论：

- 这是强宿主语义场景，应优先被模板的 Host Interface / Semantic 文档覆盖
- 如果不是明确要做 metadata field 级动作，不要误用这条链

## 场景 5：Reader 视图区 / 批注右键

典型需求：

- 在 Reader 空白区、当前视图区、选中文本、批注对象上追加右键项
- 想把当前 `reader.itemID`、annotation ids 或 reader selection 带进动作

唯一优先技术链：

- `Zotero.Reader.registerEventListener("createViewContextMenu" | "createAnnotationContextMenu", handler, pluginID)`

代表参考：

- [reference/plugin/paper-chat-for-zotero-master/src/modules/ai-summary/AISummaryService.ts](../reference/plugin/paper-chat-for-zotero-master/src/modules/ai-summary/AISummaryService.ts)
- [reference/plugin/actions-and-tags-for-zotero/content/scripts/zoterotag.js](../reference/plugin/actions-and-tags-for-zotero/content/scripts/zoterotag.js)
- [reference/zotero-main/chrome/content/zotero/xpcom/pluginAPI/menuManager.js](../reference/zotero-main/chrome/content/zotero/xpcom/pluginAPI/menuManager.js)

可复用经验：

- Reader 菜单不是 `item` 菜单的 DOM 变体，而是单独的宿主 surface
- handler 应通过 `event.append({ label, onCommand })` 追加动作，而不是自己找 Reader DOM 里的 `menupopup`
- 批注菜单更适合基于 `params.ids` 或 `reader.itemID` 推导目标条目
- view 菜单和 annotation 菜单虽然形式接近，但上下文不同，最好分开注册和注销

模板吸收结论：

- Reader context menu 应继续被视为独立宿主接口，不应并入普通 menu manager wrapper 的旧别名语义

## 场景 6：显隐、禁用与 lazy submenu 刷新

典型需求：

- 菜单项是否可见、是否可用取决于当前 selection / prefs / host state
- submenu 的子项需要每次展开时按 live state 刷新

首选技术链：

- 官方 manager：`onShowing / onShown / setVisible / setEnabled`
- 官方 submenu：依赖 submenu popup 的 `popupshowing` 做 lazy init

次选技术链：

- `ztoolkit.Menu.register(...)` 里的 `getVisibility / isHidden / isDisabled / onShowing / onpopupshowing`

代表参考：

- [reference/plugin/zotero-pdf-translate-main/src/modules/menu.ts](../reference/plugin/zotero-pdf-translate-main/src/modules/menu.ts)
- [reference/plugin/zotero-format-metadata-main/src/modules/menu.ts](../reference/plugin/zotero-format-metadata-main/src/modules/menu.ts)
- [reference/plugin/actions-and-tags-for-zotero/content/scripts/zoterotag.js](../reference/plugin/actions-and-tags-for-zotero/content/scripts/zoterotag.js)
- [reference/zotero-main/chrome/content/zotero/xpcom/pluginAPI/menuManager.js](../reference/zotero-main/chrome/content/zotero/xpcom/pluginAPI/menuManager.js)
- [reference/lajiplugin/Zotero-One-v6.8.2/Zotero-One-v6.8.2-deobfuscated/scripts/zoteroif.js](../reference/lajiplugin/Zotero-One-v6.8.2/Zotero-One-v6.8.2-deobfuscated/scripts/zoteroif.js)

可复用经验：

- 显隐/禁用是 live host state，不应在启动时一次性决定
- submenu 的 children 若依赖 live data，应在 popup 打开时刷新，而不是 startup 时一次性写死
- 官方 manager 已经把 submenu 的 lazy `popupshowing` 初始化内建进 runtime；能用官方时就不要自己重造
- 如果走 toolkit/legacy path，要自己承担 popup listener 去重和 cleanup

模板吸收结论：

- 模板可吸收“live state 只在 showing 阶段求值”这个原则
- 但不应吸收 legacy 全局 `popupshowing` 大分发器

## 场景 7：popup 晚到、菜单丢失、多窗口 repair

典型需求：

- 插件启动时目标 popup 还不存在
- 某些窗口/reload 周期里菜单项偶发丢失
- 多窗口环境下要对每个新窗口补一次菜单

常见技术链：

- 先 `waitForMenu(...)`，再把真实 popup 节点传给 `ztoolkit.Menu.register(popup, options)`
- 在 `popupshowing` 时做 `ensureMenuExists(...)`
- 对每个新窗口补 repair 监听，并在关闭时清理

代表参考：

- [reference/plugin/gemini-zotero-main/src/modules/batch/batchProcessor.ts](../reference/plugin/gemini-zotero-main/src/modules/batch/batchProcessor.ts)
- [reference/plugin/Zotero-Exitem-main/src/modules/reviewUI.ts](../reference/plugin/Zotero-Exitem-main/src/modules/reviewUI.ts)

可复用经验：

- popup repair 适合做“宿主现实比契约更脏”时的兜底，不应成为第一实现路径
- 如果走 repair，必须同时解决幂等、重复注册、窗口销毁 cleanup
- repair 更像 host hardening，不像产品逻辑

模板吸收结论：

- 这类做法适合保留为附加索引，不适合直接升级成模板默认菜单主链

## 场景 8：直接 XUL / DOM 注入 `menu + menupopup + menuitem`

典型需求：

- 目标 popup 不在官方 manager 覆盖面内
- 现有项目没有统一 toolkit，或者已有代码就是 direct DOM
- 必须自己精确控制插入位置、节点结构和子菜单拼装

技术链：

- `doc.createXULElement("menu")`
- `doc.createXULElement("menupopup")`
- `doc.createXULElement("menuitem")`
- `appendChild(...)`
- 记录已注入节点，窗口关闭时清理

代表参考：

- [reference/plugin/zotero-mcp-main/zotero-mcp-plugin/src/hooks.ts](../reference/plugin/zotero-mcp-main/zotero-mcp-plugin/src/hooks.ts)
- [reference/lajiplugin/Zotero-One-v6.8.2/Zotero-One-v6.8.2-deobfuscated/menuPopup/menuPopup.js](../reference/lajiplugin/Zotero-One-v6.8.2/Zotero-One-v6.8.2-deobfuscated/menuPopup/menuPopup.js)

可复用经验：

- direct DOM 适合拿来理解最底层 `menu -> menupopup -> menuitem` 结构
- 若要跨平台 icon 正常显示，往往还要补 `menu-iconic / menuitem-iconic`、`list-style-image`
- direct DOM 路线要自己承担 i18n、显隐、插入顺序、cleanup、重复注册和多窗口同步

模板吸收结论：

- 这条链只保留为 fallback index
- 模板默认不应以 direct XUL patch 作为条目/collection 右键的主路径

## 模板该吸收什么，不该吸收什么

建议吸收为模板知识的部分：

- 先按 `item / collection / field / reader` 区分场景，再选 API
- `MenuManager` 用于官方 host-visible menu surface
- `Reader.registerEventListener(... createViewContextMenu / createAnnotationContextMenu ...)` 用于 Reader 右键
- submenu 应视为一等结构，不要用多个零散 item 代替
- visible/enabled 只在 showing 阶段按 live state 求值
- popup repair 是 hardening fallback，不是默认设计

只保留为索引、不应默认接入模板的部分：

- legacy 大单体插件的全局 `popupshowing` 分发器
- 强产品耦合的大型多级菜单树
- direct XUL patch 作为日常首选路径
- 依赖 obfuscated runtime 或跨插件强耦合的菜单构造器

## 与现有模板文档的分工

- 如果你是在选“菜单属于哪条 UI 路线”，先看 [docs/UI_CREATION_PATHS.md](./UI_CREATION_PATHS.md)
- 如果你是在抽“菜单之外的窗口、队列、iframe、服务”等通用链路，先看 [docs/REFERENCE_PLUGIN_TECHNICAL_CHAINS.md](./REFERENCE_PLUGIN_TECHNICAL_CHAINS.md)
- 如果你是在改模板自己的宿主菜单包装层，再回到：
  - [docs/ZOTERO_HOST_INTERFACE_CONTRACTS.md](./ZOTERO_HOST_INTERFACE_CONTRACTS.md)
  - [docs/ZOTERO_HOST_SEMANTIC_INDEX.md](./ZOTERO_HOST_SEMANTIC_INDEX.md)
  - [src/features/menu-manager.js](../src/features/menu-manager.js)
