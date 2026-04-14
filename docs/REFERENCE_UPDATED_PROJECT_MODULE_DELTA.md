# Reference 更新后的模块增量分析

> 用途：回答“managed reference 更新后，哪些项目真的出现了新增功能模块，哪些只是源码结构重组或文档/测试变动”。
> 首次沉淀：2026-04-12

## 适用范围

- 本文只分析 `agent:reference:update` 更新后的 **模块增量**
- 它不是当前项目 truth，不改写 [CURRENT_BACKLOG.md](./CURRENT_BACKLOG.md)
- 它也不是 raw reference 替代品；需要细节时仍回到对应 `reference/*`

## 本轮方法

- 基线来源：本次 reference update 生成的 `*.backup-20260412T*` 快照与当前 managed refs
- 判断口径：
  - `confirmed-new-module`：当前快照里新增了可执行模块，并且能看到被注册/接线/配置消费
  - `source-visible-not-net-new`：当前快照里出现了大量新源码模块，但更像“旧功能从打包产物切到 bootstrap/source tree 后变得可读”，不直接认定为净新增产品能力
  - `non-functional-delta`：只有文档、测试、locale、图标或其他非功能增量
- 关注面优先放在 `src/*`、`addon/*`、注册入口、偏好设置与可见 surface

## 本轮结论

### 1. 确认存在新增功能模块

#### `jasminum-main`

- 分类：`confirmed-new-module`
- 新增模块：
  - `src/modules/services/wanfangdata.ts`
  - `src/utils/headlessBrowser.ts`
  - `addon/chrome/content/actors/JasminumHeadlessChild.mjs`
- 证据：
  - `src/modules/services/index.ts` 已接入 `WanfangData`
  - `wanfangdata.ts` 通过 `addon.api.createHeadlessBrowser(...)` 抓取 `wanfangdata.com.cn`
  - 偏好设置 locale 已出现 `WanfangData` 选项
- 能力判断：
  - 新增一个面向万方数据的 metadata/search/translate 来源
  - 同时引入 headless browser + JSWindowActor child 的宿主内抓取链
- 对模板相关性：
  - `中`
  - 更像“隐藏浏览器 / actor 驱动的远端内容抓取模式”参考
  - 不直接改变当前模板的 DOM contract 主线，但对未来 HTML 页面抓取、remote page 自动化、actor wiring 很有参考价值

#### `llm-for-zotero-main`

- 分类：`confirmed-new-module`
- 新增 action 模块：
  - `src/agent/actions/completeMetadata.ts`
  - `src/agent/actions/libraryStatistics.ts`
  - `src/agent/actions/literatureReview.ts`
- 新增 skill / runtime 模块：
  - `src/agent/skills/evidence-based-qa.md`
  - `src/agent/skills/import-cited-reference.md`
  - `src/agent/skills/literature-review.md`
  - `src/agent/skills/note-editing.md`
  - `src/agent/skills/note-from-paper.md`
  - `src/agent/skills/simple-paper-qa.md`
  - `src/agent/skills/write-to-obsidian.md`
  - `src/agent/skills/userSkills.ts`
- 新增 paper-read / visual-read 工具：
  - `src/agent/tools/read/readAttachment.ts`
  - `src/agent/tools/read/readPaper.ts`
  - `src/agent/tools/read/searchPaper.ts`
  - `src/agent/tools/read/viewPdfPages.ts`
  - `src/agent/tools/read/pdfToolUtils.ts`
- 新增 surface / conversation 模块：
  - `src/modules/contextPanel/historyLoader.ts`
  - `src/modules/contextPanel/standaloneWindow.ts`
  - `addon/content/standaloneChat.xhtml`
- 新增 background processing / integration 模块：
  - `src/modules/mineruAutoWatch.ts`
  - `src/modules/mineruProcessingStatus.ts`
  - `src/utils/obsidianConfig.ts`
- 证据：
  - `src/agent/actions/index.ts` 已注册三条新 action
  - `src/agent/skills/index.ts` 已把新增 skills 作为 built-in skill files 暴露
  - `src/modules/contextPanel/index.ts` 已导出 `openStandaloneChat`
  - `src/hooks.ts` 已接线 `startAutoWatch / stopAutoWatch`
  - `addon/prefs.js` 与 `preferences.xhtml` 已新增 Obsidian 与 MinerU auto-watch 配置
- 能力判断：
  - 从单一 chat/context panel，扩到更完整的 agent runtime：动作、技能、读论文工具、独立聊天窗口、会话历史范围、MinerU 自动处理、Obsidian 输出
  - 这是本轮最明显的“功能面继续扩张”参考项目
- 对模板相关性：
  - `高`
  - 尤其适合借鉴：
    - route-aware tool/action 注册
    - standalone window / side panel 双路 surface
    - 文件型 skills 与用户自定义 skill 目录
    - paper-read / evidence retrieval / page capture 的 agent tool 设计

#### `zotero-ai-bar-main`

- 分类：`confirmed-new-module`
- 新增模块：
  - `src/modules/tabObserver.ts`
- 证据：
  - `src/hooks.ts` 已显式 `import` 并调用 `registerTabObserver()`
  - 模块通过 `Zotero.Notifier.registerObserver(..., ['tab'], ...)` 追踪 tab select
- 能力判断：
  - 不是一个大 feature bundle，而是补了一条“tab 切换 -> 当前聊天上下文 / 当前 tab ID 同步”的状态观察器
  - 更像 Reader / Item Pane 聊天面板保持会话上下文正确性的基础设施模块
- 对模板相关性：
  - `中高`
  - 对需要按 tab / reader instance 维持 surface 状态的模板扩展很有参考价值

### 2. 出现了新源码模块，但不宜直接认定为净新增功能

#### `zoplicate`

- 分类：`source-visible-not-net-new`
- 现快照新增了完整 bootstrap/source tree，可直接读到：
  - `src/modules/bulkDuplicates.ts`
  - `src/modules/duplicateItems.ts`
  - `src/modules/duplicateStats.ts`
  - `src/modules/duplicates.ts`
  - `src/modules/menus.ts`
  - `src/modules/merger.ts`
  - `src/modules/nonDuplicates.ts`
  - `src/modules/notifier.ts`
  - `src/modules/patcher.ts`
  - `src/db/*`
- 但旧 backup 基本是打包后的 addon 产物：
  - `bootstrap.js`
  - `manifest.json`
  - `prefs.js`
  - `chrome/content/*`
  - `locale/*`
- 结合 README，可确认这些能力很多早已存在：
  - 重复条目检测
  - 自动 bulk merge
  - non-duplicates 管理
  - duplicate stats
- 判断：
  - 本轮更像“参考可读性大幅提升”，不宜把上述模块全算成产品新功能
  - 但对 clean-room 分析价值反而变高，因为现在可以直接按 source module 研究其菜单、patcher、duplicate pane、notifier、DB 分层
- 对模板相关性：
  - `高`
  - 尤其适合参考：
    - menu item + duplicate pane 协同
    - notifier -> UI refresh
    - patcher 风格宿主行为修补
    - preference + pane + stats 的多 surface 协作

#### `zotero-gpt`（当前改为 `bootstrap` 分支）

- 分类：`source-visible-not-net-new`
- 当前快照新增可读源码：
  - `src/modules/Meet/*`
  - `src/modules/views.ts`
  - `src/modules/base.ts`
  - `src/modules/localStorage.ts`
  - `src/modules/locale.ts`
  - `src/modules/utils.ts`
  - `src/hooks.ts`
  - `src/addon.ts`
- 但旧 backup 同样是更接近打包产物的 addon 根目录：
  - `bootstrap.js`
  - `chrome.manifest`
  - `install.rdf`
  - `manifest.json`
  - `prefs.js`
  - `chrome/content/preferences.xhtml`
- 判断：
  - 这更像仓库切到 bootstrap/source 分支后，把原本“可运行但不利于 clean-room 研究”的成品结构，暴露成了可分析的模块树
  - 现阶段不能仅凭这次更新就断言其终端用户功能发生了同等规模增长
- 对模板相关性：
  - `中高`
  - 主要价值在于：
    - 老插件向 bootstrap-template 迁移后的主引导文件组织
    - chat UI / tag prompt / Better Notes 集成的源码入口
    - 把历史脚本式实现拆成 `addon / hooks / modules / views` 的迁移方式

### 3. 本轮没有看到新增功能模块，或增量主要是非功能项

- `Zotero-add-items-from-text-main`
  - 主要是 `docs/` 新增
- `aidea-zotero-master`
  - 主要是 `test/` 新增
- `zotero-AI-Butler-main`
  - 主要是 `test/` 新增
- `zotero-better-bibtex-master`
  - 主要是 test fixture 新增
- `zotero-mcp-main`
  - 主要是 locale / image 资源新增，未见新增功能模块
- `zotero-ai-collection-bootstrap`
  - 本轮未观察到新增模块
- `zotero-main`
  - 本轮不应据目录差异误判：最新 backup 与当前 `HEAD` 实际是同一 commit
  - 因此本次 update 对宿主 authoritative source 不构成新的功能模块增量结论

## 对模板的系统性启发

### 高相关参考

- `llm-for-zotero-main`
  - 适合继续拆解 agent runtime、skills、standalone window、paper-read tool、Obsidian 输出
- `zoplicate`
  - 适合继续拆解 menu/pane/notifier/patcher 的多 surface 协作

### 中高相关参考

- `jasminum-main`
  - 适合研究 headless browser + actor 的宿主内抓取链
- `zotero-ai-bar-main`
  - 适合研究 tab-aware 状态同步
- `zotero-gpt`
  - 适合研究旧插件迁移到 bootstrap 主引导文件后的模块化组织

## 使用建议

- 如果问题是“这次 update 后有没有值得跟进的新能力面”，优先看：
  - `llm-for-zotero-main`
  - `jasminum-main`
  - `zotero-ai-bar-main`
- 如果问题是“有没有新的 clean-room 参考拆解价值”，则另外补看：
  - `zoplicate`
  - `zotero-gpt`
- 如果问题是“宿主 authoritative source 有没有新模块”，本轮结论是：
  - `zotero-main` 没有形成新的模块增量结论
