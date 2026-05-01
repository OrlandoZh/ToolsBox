# Wind Tunnel 场景模块参考沉淀

> 用途：沉淀从相邻模板项目风洞实验中抽出的通用场景模块，不维护 current truth，不替代 [CURRENT_BACKLOG.md](./CURRENT_BACKLOG.md)。
> 最后更新：2026-05-01

## 参考输入

- `AIAssistant/docs/plans/reader-chat-performance-findings-2026-04-30.md`
- `AIAssistant/dev/agent-runtime/capability-manifest.js`
- `AIAssistant/zotero-scenarios/*reader-chat* / *outline* / *research-knowledge*`
- `Enhancetrans/docs/SCENARIO_MATRIX.md`
- `Enhancetrans/config/performance-budget.json`
- `Enhancetrans/docs/PDF_OVERLAY_POSITIONING_IMPROVEMENT_PLAN.md`
- `Enhancetrans/zotero-scenarios/enhancedtrans-* / wasm-kernel-* / performance-budget / profiler / memory`
- `reference/zotero-main/chrome/content/zotero/ZoteroProtocolHandler.mjs`
- `reference/zotero-main/chrome/content/zotero/xpcom/reader.js`
- `reference/zotero-main/js-build/reader.js`
- `/Applications/Zotero.app/Contents/Resources/app/omni.ja:chrome/content/zotero/reader.xhtml`
- `/Applications/Zotero.app/Contents/Resources/app/omni.ja:chrome/content/zotero/xpcom/reader.js`
- `/Applications/Zotero.app/Contents/Resources/app/omni.ja:resource/reader/reader.css`
- `/Applications/Zotero.app/Contents/Resources/app/omni.ja:resource/reader/pdf/web/viewer.html`
- `/Applications/Zotero.app/Contents/Resources/app/omni.ja:resource/reader/pdf/build/pdf.mjs`
- `/Users/orlandozh/Downloads/web-library-master/src/js/component/libraries.jsx`
- `/Users/orlandozh/Downloads/web-library-master/src/js/component/common/table.jsx`
- `/Users/orlandozh/Downloads/web-library-master/src/js/component/reader.jsx`
- `/Users/orlandozh/Downloads/web-library-master/test/fixtures/state/desktop-test-user-library-view.json`

## 可泛化模块

| 模块 | 风洞应具像化的通用问题 | 不带入的内容 |
|---|---|---|
| Zotero 综合浏览器场景 atlas | 库与分类、条目元数据、附件与存储、检索、笔记批注、引用导出、同步协作、偏好账户、Reader、窗口 lifecycle、运行时与发布更新这些主要产品面都应能在浏览器中切换到对应 shell，并记录事件/压力 | 不把浏览器模拟当作 Zotero 真机证据，不承诺覆盖真实账号、真实文件、真实远端同步 |
| Reader 工作流 | `renderToolbar` 刷新、sidebar reopen、tab reuse、批注菜单、旧状态残留 | 具体产品按钮、面板 ID、AI/翻译品牌文案 |
| 官方浏览器 UI 适配 | Zotero Web Library 的 collection tree、items table、item details、reader shell、fixture 与 icon 作为浏览器 UI 锚点；本地客户端源码继续决定宿主语义 | vendoring 官方源码、把 Web Library 行为误当成本地客户端宿主 API |
| 上下文收敛 | docked panel target follow、same-target fast path、library / Reader pending context 合流、show 请求串行化 | 具体聊天 UI、provider、知识库产品结构 |
| 窗口与 lifecycle | 冷启动恢复、热重载、watch reconnect、多窗口同时挂载、standalone window 复用与 cleanup | 真实宿主替代、发布态窗口功能承诺 |
| 文档与翻译 | 优先复用 Zotero Reader PDF.js build 的 viewer/textLayer/viewport 语义；外层 Reader chrome 用 `reader.xhtml / reader.js / reader.css` 抽出的 browser adapter 表达 menubar、renderToolbar、sidebar、context pane、selection popup、annotation callbacks，再测 PDF overlay 定位、sourceRect / visibleRect 分离、快速替换、导出 dry-run plan、merged context pane 密度 | AGPL 实现细节、具体翻译服务、真实文件写入、完整 XUL/Gecko 宿主替代 |
| 运行时服务 | 偏好传播、服务惰性启动、Wasm worker matrix、activity budget、profiler/memory advisory | 常驻 profiler、默认启用 Wasm/AI 服务 |
| 发布更新 | stable/beta install smoke、`update.json`、`update_link`、远端 HTTP 状态与 gate 归因 | 真实上传或替代 release gate |

## 性能瓶颈提示

- 状态读取要分 light/pure 与 recovery side effect；风洞里可用 target-follow 场景显示“读状态触发恢复”的抖动。
- `show()` 全局串行、重复等待、same-target 复用过晚、duplicate mount/update、全量 refresh 都适合被抽成可调压力，而不绑定具体 UI。
- 文档 overlay 的主要压力不是翻译质量，而是定位、锚点、旧 run 覆盖、新旧 overlay cleanup、长译文裁剪和导出队列。
- 文档分析应尽量接 Zotero 自带 PDF.js：`zotero://pdf.js/...` 在宿主里代理到 `resource://zotero/pdf.js/...`，Reader 侧真实锚点来自 `PDFViewerApplication.pdfViewer`、page viewport、text layer 与 page index；浏览器风洞只能作为 dev-only harness，缺本地 build 时必须显式标记 fallback。
- Reader 可见面不能只停留在裸 iframe：应把 Zotero `reader.xhtml` 的 menubar / command / toolbar anchor 与 `reader.js` 的 `createReader(...)` callback 面（`onOpenContextMenu`、`onSaveAnnotations`、`onAddToNote`、`onSetZoom`、sidebar/context pane state）抽成浏览器 adapter，并用运行时 manifest 显示 `reader.xhtml / reader.js / reader.css` 的 source-anchor 通过数。PDF 页渲染可是真实 Zotero PDF.js，Reader chrome 与宿主回调仍是 source-derived mock，不声称完整替代 Zotero 真机。
- 运行时服务应默认表达 lazy / advisory / default-disabled；风洞可以显示成本矩阵，但不能把模拟指标升级为 release gate。

## 模板边界

- 场景命名使用 Template / 通用宿主术语，不复刻相邻项目的产品名、DOM id、视觉布局或业务文案。
- Zotero Web Library adapter 只通过 `--zotero-web-library-root` / `ZOTERO_WEB_LIBRARY_ROOT` 显式读取 operator 指定的外部根目录，用于 browser UI grammar、脱敏 fixture display-field 采样与静态 icon；不把官方 Web Library 源码复制进模板仓库，也不透传 fixture 内的 API key、links、request options 或 file URL。
- Zotero PDF.js harness 只通过 `--zotero-pdfjs-root` / `ZOTERO_PDFJS_ROOT` 显式读取 operator 指定的 Zotero Reader PDF.js build；PDF 样本可用 `--sample-pdf` / `ZOTERO_WIND_TUNNEL_SAMPLE_PDF` 挂载 operator 指定的本地真实 PDF，未指定时才使用合成 fixture；Reader source harness 通过 `--zotero-reader-source-root` / `ZOTERO_READER_SOURCE_ROOT` 或从 PDF.js root 向上推断的本地 Zotero app 提取根目录读取 `reader.xhtml / reader.js / reader.css` 锚点；Reader browser adapter 可从这些结构和事件面抽象外壳，但不直接运行 XUL chrome window；不在风洞 server 中联网下载或构建 Zotero Reader，也不把 PDF.js/source fallback 伪装成真机证据。
- 风洞只做 browser-side 具像化和压力调参；真实结论仍以 `agent:zotero:e2e -> agent:monitor -> agent:gate` 为准。
- reference-derived 场景应标记来源类型与 gap kind，便于后续项目把模板场景替换为自己的具体模块。
