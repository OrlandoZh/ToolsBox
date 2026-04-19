# Zotero 官方生态参考路由

> 用途：回答“除了 `reference/zotero-main/` 之外，Zotero 官方还有哪些仓库值得作为开发参考，以及应如何按任务分流”。
> 范围：这是参考专题，不是 current truth；它不改变默认 `agent:gate` / `release` 主线，也不把任何官方辅助仓库升格为宿主 authoritative source。
> 最后更新：2026-04-18

## 结论先看

如果当前问题是：

- 宿主接口、字段、事件、surface 语义

那么仍然只认：

- `reference/zotero-main/`

如果当前问题是：

- item type / field / creator type / CSL 映射 / locale 元数据
- translator 编写、网页抓取、导入导出、无客户端翻译运行时
- 浏览器连接器与网页捕获链路
- Zotero 在多个代码库间复用的 utility 行为

则应按问题类型再分流到 Zotero 官方的辅助仓库，而不是把它们混成新的宿主 contract。

## 推荐路由

### 1. 宿主接口与 UI surface

首选：

- `reference/zotero-main/`

适用任务：

- `PreferencePanes` / `ItemPaneManager` / `Reader` / `menu item`
- 宿主字段、事件、枚举、surface 生命周期
- 包装层 contract、semantic index、terminology 对齐

不应用这些仓库替代：

- `zotero-schema`
- `utilities`
- `translators`
- `translation-server`
- `zotero-connectors`

原因：

- 它们提供的是数据模型、共享工具、translator 运行时或浏览器集成参考，不是 Zotero 桌面宿主 API 的 authoritative source。

### 2. 数据模型与 item/field 语义

首选：

- `reference/Templetereference/zotero-schema-master`

次选：

- `reference/Templetereference/zotero-utilities-master`
- `reference/zotero-main/`

适用任务：

- item type / field / creator type 对照
- CSL type / field 映射
- locale label 元数据
- 和 schema 直接相关的 item utility 行为

使用原则：

- 先用 `zotero-schema` 回答“数据结构是什么”
- 再用 `utilities` 回答“这些 schema 数据如何被通用工具消费”
- 只有当问题落到桌面宿主真实实现或 UI contract 时，才回到 `zotero-main`

### 3. translator 编写与导入导出链路

首选：

- `reference/Templetereference/zotero-translators-master`

次选：

- `reference/Templetereference/zotero-translation-server-master`
- `reference/zotero-main/`

适用任务：

- 网站 translator 模式
- import / export translator
- translator 调试、测试、发布前的行为对照
- “不启动 Zotero 客户端时，translator 如何运行”的问题

使用原则：

- `translators` 负责 translator 本体与样例
- `translation-server` 负责 Node 侧 translator runtime
- `zotero-main` 只在需要桌面侧 translate 架构或宿主集成细节时回看

### 4. 浏览器连接器与网页捕获

首选：

- `reference/Templetereference/zotero-connectors-master`

次选：

- `reference/Templetereference/zotero-translators-master`
- `reference/zotero-main/`

适用任务：

- 浏览器扩展捕获流程
- connector 与 translator 的协作边界
- WebExtension 侧页面抓取、注入、rebuild/watch 流程

使用原则：

- 如果问题在浏览器扩展侧，先看 `zotero-connectors`
- 如果问题进一步落到网页 translator 识别与抽取，再看 `translators`
- 如果问题最终落到桌面端导入、保存或宿主 API，再回到 `zotero-main`

### 5. 通用工具函数与共享 helper

首选：

- `reference/Templetereference/zotero-utilities-master`

次选：

- `reference/Templetereference/zotero-schema-master`

适用任务：

- 日期、OpenURL、schema helper、cached types
- 想区分“这是 Zotero 共享 utility 行为”还是“这是某个插件自己发明的 helper”

使用原则：

- 只把它当成共享工具行为参考
- 不把它引申成当前模板的运行时依赖建议
- 不因为它存在，就绕开当前模板的 clean-room / 零外部依赖约束

## 当前最值得吸收的增量

相对于仓库里已经较充分吸收的社区模板/脚手架参考，这条官方生态 lane 当前更适合承接以下问题：

- `zotero-schema`：未来若进入 item metadata、字段映射、schema 驱动表单或导出映射，可直接作为参考入口
- `translators` + `translation-server`：未来若进入导入导出、网页抓取、服务端 translator 运行时，这是比普通插件样本更直接的官方链路
- `zotero-connectors`：未来若进入浏览器集成、网页捕获或 connector-like 工作流，可减少只从社区插件侧倒推的偏差
- `utilities`：未来若要判断某段通用逻辑是否本来就属于 Zotero 共享工具层，可先来这里做 clean-room 对照

## 不要误用

- 不要把这些官方辅助仓库写进 `docs/CURRENT_BACKLOG.md` 当 current truth
- 不要把它们当成新的宿主 authoritative source；宿主接口仍只认 `reference/zotero-main/`
- 不要因为看到了 `utilities` 或 `translation-server`，就默认当前模板应引入对应运行时依赖
- 不要把“官方仓库”与“当前主线优先级”混为一谈；当前主线仍以 backlog 为准

## 推荐阅读顺序

1. 先判定问题是不是宿主 contract 问题；如果是，直接回 `reference/zotero-main/`
2. 若不是宿主 contract，再按数据模型 / translator / connector / utility 四类分流
3. 只有当官方生态专题仍不足以回答问题时，再进入更具体的社区插件专题
