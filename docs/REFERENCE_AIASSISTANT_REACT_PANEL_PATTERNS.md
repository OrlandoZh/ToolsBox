# AIAssistant React Panel Patterns

本文记录从 `AIAssistant` 项目提炼出的 React 面板创建与切换经验。

它的职责只有两个：

1. 说明哪些经验已经被吸收到模板
2. 给下游项目保留一份“只读索引”，指向仍然偏产品化、不应直接塞进模板核心的做法

它不是当前项目 truth，也不替代以下文档：

- `docs/CURRENT_BACKLOG.md`
- `docs/UI_CREATION_PATHS.md`
- `docs/OPTIONAL_BUNDLES.md`
- `docs/ZOTERO_HOST_INTERFACE_CONTRACTS.md`
- `docs/ZOTERO_HOST_SEMANTIC_INDEX.md`

## 已吸收到模板的通用部分

### 1. Host-mounted React surface bridge

已落到模板：

- `src/utils/react-surface-bridge.js`
- `src/react-ui/shared/renderer-bridge.tsx`
- `src/react-ui/surface-bridge/entry.tsx`

保留的通用语义：

- JS core 继续掌握宿主 lifecycle、surface root、geometry、evidence 和 fallback 判定
- React/TS lane 只暴露全局 renderer bridge，不反客为主接管宿主运行时
- target document/window 在需要时才 `loadSubScript(...)`
- 样式只按 document 注入一次
- bridge contract 固定为 `mount / update / unmount`
- renderer global 同时尝试 `window / wrappedJSObject / globalThis`

### 2. Surface/window mode normalization

已落到模板：

- `src/utils/surface-window-mode.js`

保留的通用语义：

- 区分 `preferredWindowMode` 和 `effectiveWindowMode`
- 保留 `default / docked / floating / standalone` 四态
- `docked` 不可用时，显式返回 fallback 到 `floating` 的原因
- `standalone` 作为独立窗口模式，不与 `floating` / `docked` 的壳语义混在一起

模板没有吸收的部分：

- 具体 dock 几何测量
- 具体 host sidebar 自动恢复
- 具体 dock/floating shell DOM 结构

## 保留为索引参考的 AIAssistant 特有经验

以下经验有价值，但目前仍明显带有产品语义或宿主策略，不直接进入模板默认实现：

### Docked shell 必须是独立控制器

- `docked` 不是“floating shell 换一层 attached 皮肤”
- 真正的 `docked` 成功态，应该由单独的 docked shell/controller 负责
- 如果产品要做 BibGenie 风格贴边，应让 sidebar geometry 成为布局真相，而不是把 panel 塞进宿主 sidebar 子节点内部

### Geometry truth 来自 live sidebar/context pane

- `docked` 布局应取 live `context pane / item pane / sidebar` bounds
- 宿主太窄、sidebar 未开、context pane 不可用，都应返回显式 unavailable / fallback 原因
- 不要用固定宽度或 viewport 猜测冒充 dock 成功

### Floating geometry 与 dock geometry 分离持久化

- 浮窗位置/尺寸要有自己独立的持久化来源
- dock 临时推导出来的 rect 只可用于回退或过渡，不应覆盖用户真实浮窗偏好

### Standalone stabilization 是单独的验证主题

- `standalone` 经常需要单独的 shell reuse / close cleanup / reopen stabilization smoke
- 不要让 standalone 专项问题回流阻断已经收口的 host-surface convergence 主链

### Sidebar takeover 只借发现模式，不照搬 takeover 逻辑

- AIAssistant 的 `sidebar.js` 里，按 `id / role / data-*` 匹配按钮或 panel 的发现方式值得借鉴
- 但真正的 sidebar takeover 逻辑、owned/native 元素切换策略和产品动作流，仍属于项目特化实现
- 模板当前更应优先复用 `src/features/reader.js` 既有的 `findSidebarViewElements(...)` / `selectSidebarView(...)`

## 适合回看 AIAssistant 的源文件

以下路径属于来源索引，不是模板 authoritative source：

- `src/features/reader-chat-ui/react-surface.js`
- `src/react-ui/reader-chat-window/entry.tsx`
- `src/features/reader-chat-ui/index.js`
- `src/features/outline/sidebar.js`
- `docs/AGENT_REACT_ARCHITECTURE_BLUEPRINT.md`
- `docs/PREFERENCE_PANE_PATTERNS.md`

## 模板使用建议

- 只需要“在现有 host surface 里挂一个 React 面板”时，优先复用模板的 `surface-bridge`
- 只需要独立窗口时，优先复用 `window-shell` 路线并在下游项目中提供自己的窗口 shell
- 需要 `docked / floating / standalone` 三态切换时，先用 `surface-window-mode` 固定 preferred/effective/fallback 语义，再决定是否值得实现产品自己的 shell/controller
- 真正进入贴边式 geometry、右侧栏恢复或 sidebar takeover 前，先确认这已经是下游产品需求，而不是模板治理需求
