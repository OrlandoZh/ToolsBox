# Reference 路由

> 用途：在不展开长篇研究正文的前提下，快速选择“该读哪份参考资料、为什么读、先读哪个入口”。
> 最后更新：2026-04-19

## 使用方式

- 先按任务选参考，不要默认把所有 `REFERENCE_*` 文档从头通读一遍
- 参考阅读路径固定为 `REFERENCE_INDEX -> REFERENCE_* -> raw reference/*`；只有路由层和专题层无法回答当前问题时，才继续进入 raw reference
- 参考文档只回答技术路径与 clean-room 边界，不是当前项目 truth
- 涉及当前主线、当前 blocker、当前范围时，先回到 [CURRENT_BACKLOG.md](./CURRENT_BACKLOG.md)
- 若同一 controller task/session 已读取 `3` 个及以上 raw reference 文件，或已跨 `2` 个及以上 reference project 做对比，就应该补一条 `REFERENCE_*` 专题沉淀，而不是把参考结论写回 `CURRENT_BACKLOG`

## 当前本地 reference 目录分层

| 目录 | 用途 | 路由提示 |
|------|------|----------|
| `reference/Templetereference/` | 开发框架参考、模板骨架、agent/runtime，以及非宿主 authoritative source 的 Zotero 官方辅助仓库 | 这是“开发框架/官方辅助仓库参考”篮子；需要回看模板/框架来源或 `schema / translators / connectors / utilities` 这类官方辅助仓库时，先按项目名直达对应快照，不把它混入 Zotero 插件路线分析，也不替代 `reference/zotero-main/` |
| `reference/zotero-main/` | Zotero 宿主源码 authoritative source | 触达宿主接口、术语、字段、事件和 surface 语义时，以这里为准，不用 `reference/plugin/*` 里的同名快照替代 |
| `reference/plugin/` | Zotero 开源插件参考 | UI 路线、菜单模式、通用技术链、专项对比默认从这里取只读样本 |
| `reference/lajiplugin/` | Zotero 其他插件参考 | 用于补充历史插件、非主流实现或特殊案例；和 `reference/plugin/` 一样只作为只读研究输入 |

## 按任务选参考

| 任务 | 首选 | 次选 | 说明 |
|------|------|------|------|
| 开发框架 / 模板骨架 / agent runtime 参考 | 直接定位 `reference/Templetereference/*` 对应项目快照 | [ARCHITECTURE.md](./ARCHITECTURE.md), [HISTORY_INDEX.md](./HISTORY_INDEX.md) | 这是框架参考篮子，不替代当前项目 truth，也不参与 Zotero 插件路线选型 |
| Zotero 官方生态仓库（schema / utilities / translators / translation-server / connectors）怎么选 | [REFERENCE_ZOTERO_OFFICIAL_ECOSYSTEM.md](./REFERENCE_ZOTERO_OFFICIAL_ECOSYSTEM.md) | [ZOTERO_HOST_INTERFACE_CONTRACTS.md](./ZOTERO_HOST_INTERFACE_CONTRACTS.md), [REFERENCE_PDF_TRANSLATE_PATTERNS.md](./REFERENCE_PDF_TRANSLATE_PATTERNS.md) | 先区分宿主 authoritative source 与官方辅助仓库；不要把 `reference/zotero-main/` 以外的官方仓库误写成宿主 contract |
| 通用 DOM contract / route-specific validator 可行性 | [REFERENCE_DOM_CONTRACT_VALIDATION_FEASIBILITY.md](./REFERENCE_DOM_CONTRACT_VALIDATION_FEASIBILITY.md) | [UI_VALIDATION_PATHS.md](./UI_VALIDATION_PATHS.md), [ZOTERO_HOST_INTERFACE_CONTRACTS.md](./ZOTERO_HOST_INTERFACE_CONTRACTS.md) | 回答“更深入的 DOM contract 检查是否值得做、应按哪些宿主锚点分 route”，先看宿主 source 提供了哪些稳定 primitive |
| React 面板创建 / 切换 / surface bridge | [REFERENCE_AIASSISTANT_REACT_PANEL_PATTERNS.md](./REFERENCE_AIASSISTANT_REACT_PANEL_PATTERNS.md) | [UI_CREATION_PATHS.md](./UI_CREATION_PATHS.md) | 先看 host-mounted React surface、window mode 与哪些部分已吸收到模板 |
| Item Pane Chat 面板 / Reader 文本弹出 / LLM 流式调用 | [REFERENCE_AIASSISTANT_PATTERNS.md](./REFERENCE_AIASSISTANT_PATTERNS.md) | [REFERENCE_AIASSISTANT_REACT_PANEL_PATTERNS.md](./REFERENCE_AIASSISTANT_REACT_PANEL_PATTERNS.md) | 轻量 Chat Section 动态 UI、附件会话持久化、renderTextSelectionPopup 路由 |
| 多 Provider LLM + API Key 轮换 + 任务队列 + 多模态管线 | [REFERENCE_AI_BUTLER_PATTERNS.md](./REFERENCE_AI_BUTLER_PATTERNS.md) | [REFERENCE_AINOTE_PATTERNS.md](./REFERENCE_AINOTE_PATTERNS.md), [REFERENCE_PLUGIN_TECHNICAL_CHAINS.md](./REFERENCE_PLUGIN_TECHNICAL_CHAINS.md) | 6 Provider 注册表 + Facade 统一调用、多 Key 等权重轮换+冷却、TaskQueueManager 优先级调度+流式事件、4 种 AI 管线分阶段回调、MainWindow 单例 Dashboard |
| Agent 运行时 / 多轮工具调用 / MCP / HITL 确认 | [REFERENCE_LLM_FOR_ZOTERO_PATTERNS.md](./REFERENCE_LLM_FOR_ZOTERO_PATTERNS.md) | [REFERENCE_PAPER_CHAT_PATTERNS.md](./REFERENCE_PAPER_CHAT_PATTERNS.md) | 先看完整 Agent 架构（5 种模型适配器、10+ HITL 字段、MCP Server、第三方扩展 API），再看 Paper Chat 的轻量 AI 对话实现 |
| 远端字段下发 / `zotero.sqlite` 缓存 / 认知层隐匿是否有意义 | [REFERENCE_ENHANCEDTRANS_PROTECTION_NOTES.md](./REFERENCE_ENHANCEDTRANS_PROTECTION_NOTES.md) | [ROUTE4_LOCAL_STORAGE_DECISION.md](./ROUTE4_LOCAL_STORAGE_DECISION.md) | 先看参考侧判断“SQLite 落库 + 本地解密”到底是不是主保护策略；若问题已经进入模板侧定夺，再看项目自己的本地存储决策矩阵 |
| Zotero 插件里现成的验证 / 授权 / 混淆 / 防盗版方法有哪些可借鉴边界 | [REFERENCE_YANZHENG_VALIDATION_SECURITY_NOTES.md](./REFERENCE_YANZHENG_VALIDATION_SECURITY_NOTES.md) | [REFERENCE_ENHANCEDTRANS_PROTECTION_NOTES.md](./REFERENCE_ENHANCEDTRANS_PROTECTION_NOTES.md) | 用于区分“API 可用性验证”“服务端认证”“客户端激活码”“本地加密缓存”“追踪/指纹”这几类机制各自的真实价值和风险，不把灰色控制面误当成安全能力 |
| Zotero 宿主里哪些信号最适合做弱绑定 / 二阶段解锁 | [REFERENCE_ZOTERO_HOST_SIGNAL_BINDING_NOTES.md](./REFERENCE_ZOTERO_HOST_SIGNAL_BINDING_NOTES.md) | [PACKAGE_PROTECTION_HOST_WEAK_BINDING_V1.md](./PACKAGE_PROTECTION_HOST_WEAK_BINDING_V1.md), [ROUTE4_LOCAL_STORAGE_DECISION.md](./ROUTE4_LOCAL_STORAGE_DECISION.md), [ZOTERO_HOST_INTERFACE_CONTRACTS.md](./ZOTERO_HOST_INTERFACE_CONTRACTS.md) | 先回答 `profile`、`dataDir`、schema version、插件加载后自动可得能力这几类宿主信号各自的真实价值；若已经进入模板侧 package protection 设计，再跳到宿主弱绑定 V1 设计页 |
| 批量 AI 笔记生成 / 多 Provider LLM / PDF 全文提取 / Prompt 版本管理 | [REFERENCE_AINOTE_PATTERNS.md](./REFERENCE_AINOTE_PATTERNS.md) | [REFERENCE_AIASSISTANT_PATTERNS.md](./REFERENCE_AIASSISTANT_PATTERNS.md) | 批量处理管线 + 流式输出窗口 + 6 Provider 自动检测 + Zotero 全文索引复用 + Markdown→笔记 HTML 转换 |
| 右键菜单 / 子菜单 / `popupshowing` / 菜单 repair | [REFERENCE_PLUGIN_MENU_PATTERNS.md](./REFERENCE_PLUGIN_MENU_PATTERNS.md) | [REFERENCE_PLUGIN_TECHNICAL_CHAINS.md](./REFERENCE_PLUGIN_TECHNICAL_CHAINS.md) | 先按 `item / collection / field / reader` 场景选型，不混成一类菜单 |
| 跨项目通用技术链 | [REFERENCE_PLUGIN_TECHNICAL_CHAINS.md](./REFERENCE_PLUGIN_TECHNICAL_CHAINS.md) | [REFERENCE_COMPARISON.md](./REFERENCE_COMPARISON.md) | 先看哪些模式已可 clean-room 泛化，再看对比快照 |
| managed reference 更新后有没有新增功能模块 | [REFERENCE_UPDATED_PROJECT_MODULE_DELTA.md](./REFERENCE_UPDATED_PROJECT_MODULE_DELTA.md) | [REFERENCE_SNAPSHOTS.md](./REFERENCE_SNAPSHOTS.md) | 用 backup/current 对比区分“真实新增能力”与“只是源码结构重组/模板化” |
| 当前参考技术链是否都已进入索引层 | [REFERENCE_TECHNICAL_CHAIN_COVERAGE_AUDIT.md](./REFERENCE_TECHNICAL_CHAIN_COVERAGE_AUDIT.md) | [REFERENCE_UPDATED_PROJECT_MODULE_DELTA.md](./REFERENCE_UPDATED_PROJECT_MODULE_DELTA.md) | 用覆盖审计区分“已有专题承接”“只有增量报告”“仍缺专题”的链路状态 |
| Zotero 进程内 CPU activity / profiler 采集 / 插件性能归因 | [REFERENCE_KNOW_UR_ZOTERO_PERFORMANCE_PATTERNS.md](./REFERENCE_KNOW_UR_ZOTERO_PERFORMANCE_PATTERNS.md) | [ZOTERO_TESTING.md](./ZOTERO_TESTING.md), [REFERENCE_MCP_SERVER_ZOTERO_DEV_PATTERNS.md](./REFERENCE_MCP_SERVER_ZOTERO_DEV_PATTERNS.md) | Know Ur Zotero 使用 Firefox/Gecko profiler 采样并按 Zotero/Reader/Note Editor/插件资源 URI 归因，适合作为开发诊断参考，不替代当前 e2e/gate |
| 某条 UI 路线为什么映射到某个参考来源 | [REFERENCE_PLUGIN_UI_ANALYSIS.md](./REFERENCE_PLUGIN_UI_ANALYSIS.md) | [UI_CREATION_PATHS.md](./UI_CREATION_PATHS.md) | 先看来源追踪，再回到模板自己的路线选型 |
| Vue UI + Vite 构建 + ChromeWorker 架构 | [REFERENCE_CHARTERO_PATTERNS.md](./REFERENCE_CHARTERO_PATTERNS.md) | [REFERENCE_COMPARISON.md](./REFERENCE_COMPARISON.md) | iframe + 直接注入 addon 实例、Worker 主从通信协议、Vite 多入口构建 |
| Hook 生命周期 + Custom Element + 笔记系统 | [REFERENCE_BETTER_NOTES_PATTERNS.md](./REFERENCE_BETTER_NOTES_PATTERNS.md) | [REFERENCE_COMPARISON.md](./REFERENCE_COMPARISON.md) | Hook 分发器、MyToolkit 选择性导入、bn-workspace 三栏布局、10+ 公共 API 命名空间 |
| AI 对话 + Function Calling + 多 Provider | [REFERENCE_PAPER_CHAT_PATTERNS.md](./REFERENCE_PAPER_CHAT_PATTERNS.md) | [REFERENCE_COMPARISON.md](./REFERENCE_COMPARISON.md) | 多 Provider 接口 + Fallback、30+ 工具定义、流式 Tool Calling、SQLite 迁移、AISummary 批量管线 |
| 轻量 AI 对话 + 双模式（sidebar/window）+ PDF 选区上下文 + 快捷命令 | [REFERENCE_AI_BAR_PATTERNS.md](./REFERENCE_AI_BAR_PATTERNS.md) | [REFERENCE_AIASSISTANT_PATTERNS.md](./REFERENCE_AIASSISTANT_PATTERNS.md) | 双模式 ChatHost、按 section 隔离会话、3 策略 PDF 上下文提取、用户可配置 10 家 Provider、Prompt 拖拽编辑器、explain/summarize/translate/smartCopy |
| AI 智能分类 + Collection 层级树 + 交互式确认 + 批量处理 | [REFERENCE_AI_COLLECTION_PATTERNS.md](./REFERENCE_AI_COLLECTION_PATTERNS.md) | [REFERENCE_AI_BUTLER_PATTERNS.md](./REFERENCE_AI_BUTLER_PATTERNS.md), [REFERENCE_PLUGIN_MENU_PATTERNS.md](./REFERENCE_PLUGIN_MENU_PATTERNS.md) | 层级 Collection 树 + 贪心路径匹配、逐条/批量双模式、Accept/Reject/Archive 交互式确认、API 配置档案、JSON 双格式回退解析、Collection 复选框级联 |
| 多语言翻译管线 / 任务队列 / 服务注册 | [REFERENCE_PDF_TRANSLATE_PATTERNS.md](./REFERENCE_PDF_TRANSLATE_PATTERNS.md) | [REFERENCE_PLUGIN_TECHNICAL_CHAINS.md](./REFERENCE_PLUGIN_TECHNICAL_CHAINS.md) | TranslateTask 队列 + 40+ 服务插件化 + franc 语言检测 + 递归 Fallback |
| BibGenie 风格的 panel / window / UI 路线 | [REFERENCE_BIBGENIE_ANALYSIS.md](./REFERENCE_BIBGENIE_ANALYSIS.md) | [REFERENCE_COMPARISON.md](./REFERENCE_COMPARISON.md) | 只借宿主集成与架构经验，不照搬产品布局 |
| 内部集成 MCP Server / Streamable HTTP / 25 工具 / 语义搜索 / 写操作门控 | [REFERENCE_ZOTERO_MCP_PATTERNS.md](./REFERENCE_ZOTERO_MCP_PATTERNS.md) | [REFERENCE_MCP_SERVER_ZOTERO_DEV_PATTERNS.md](./REFERENCE_MCP_SERVER_ZOTERO_DEV_PATTERNS.md) | Zotero 插件内进程运行 MCP Server（nsIServerSocket + Streamable HTTP），25 工具覆盖文献搜索、内容提取、语义搜索、全文数据库、写操作门控、Collection 管理；与外部 RDP 方案对比，架构更轻量、无需 RDP 协议 |
| 外部 MCP Server / RDP 远程调试 / 26 工具 / Zotero 桥接 | [REFERENCE_MCP_SERVER_ZOTERO_DEV_PATTERNS.md](./REFERENCE_MCP_SERVER_ZOTERO_DEV_PATTERNS.md) | [REFERENCE_LLM_FOR_ZOTERO_PATTERNS.md](./REFERENCE_LLM_FOR_ZOTERO_PATTERNS.md) | 外部 Node.js MCP 通过 Firefox RDP 协议（TCP 帧格式、Actor 层级）控制 Zotero，26 个工具覆盖 JS 执行、DOM 检查、截图、日志、插件管理、构建脚手架 |
| PDF 翻译 / 服务端处理 / LLM 集成 / 文件附加 | [REFERENCE_PDF2ZH_PATTERNS.md](./REFERENCE_PDF2ZH_PATTERNS.md) | [REFERENCE_PLUGIN_TECHNICAL_CHAINS.md](./REFERENCE_PLUGIN_TECHNICAL_CHAINS.md) | 插件+服务端两层架构、文件处理管线、FileProcessor 事件批量、LLM Provider 管理 |
| Gemini AI PDF 书签生成 / 大文件分块上传 / pdf-lib 大纲操作 | [REFERENCE_PDF_AI_BOOKMARKS_PATTERNS.md](./REFERENCE_PDF_AI_BOOKMARKS_PATTERNS.md) | [REFERENCE_PLUGIN_TECHNICAL_CHAINS.md](./REFERENCE_PLUGIN_TECHNICAL_CHAINS.md) | Gemini JSON Schema 约束输出、可恢复上传 + XHR 进度、分块页码偏移检测、pdf-lib Outline 链表构建、IOUtils 降级 I/O |
| Agent 运行时 / 多轮工具调用 / MCP / HITL 确认 | [REFERENCE_LLM_FOR_ZOTERO_PATTERNS.md](./REFERENCE_LLM_FOR_ZOTERO_PATTERNS.md) | [REFERENCE_PAPER_CHAT_PATTERNS.md](./REFERENCE_PAPER_CHAT_PATTERNS.md) | 先看完整 Agent 架构（5 种模型适配器、10+ HITL 字段、MCP Server、第三方扩展 API），再看 Paper Chat 的轻量 AI 对话实现 |
| 早期 AI 对话 / 向量检索 / Meet 对象模式 / 标签系统 | [REFERENCE_ZOTERO_GPT_PATTERNS.md](./REFERENCE_ZOTERO_GPT_PATTERNS.md) | [REFERENCE_LLM_FOR_ZOTERO_PATTERNS.md](./REFERENCE_LLM_FOR_ZOTERO_PATTERNS.md) | 了解"单轮对话 + 上下文注入"早期模式，与 LLM for Zotero 的 Agent 架构对比，理解架构演进路径 |
| 中文文献元数据 / CNKI 集成 / 无头浏览器 | [REFERENCE_JASMINUM_PATTERNS.md](./REFERENCE_JASMINUM_PATTERNS.md) | [REFERENCE_PLUGIN_TECHNICAL_CHAINS.md](./REFERENCE_PLUGIN_TECHNICAL_CHAINS.md) | 三源级联搜索（CNKI/万方/医视）、HeadlessBrowserService、中文 PDF 标题提取、Cookie 验证码沙盒、TaskRunner deferred 选择 |
| PDF 智能高亮 / 双后端 LLM+Non-LLM / Sidecar 进程 / 语义着色 | [REFERENCE_SMART_HIGHLIGHTER_PATTERNS.md](./REFERENCE_SMART_HIGHLIGHTER_PATTERNS.md) | [REFERENCE_PLUGIN_TECHNICAL_CHAINS.md](./REFERENCE_PLUGIN_TECHNICAL_CHAINS.md) | 三信号评分管线、Neural Reranker Sidecar 生命周期、Robust JSON 提取、密度/聚焦配置、Rect Splitter 字符比例插值 |
| 文献综述提炼 / GPT 插件桥接 / PDF 语义选择 / JSON 持久化 / UI 自动修复 | [REFERENCE_EXITEM_PATTERNS.md](./REFERENCE_EXITEM_PATTERNS.md) | [REFERENCE_PLUGIN_MENU_PATTERNS.md](./REFERENCE_PLUGIN_MENU_PATTERNS.md), [REFERENCE_ZOTERO_GPT_PATTERNS.md](./REFERENCE_ZOTERO_GPT_PATTERNS.md) | GPT 插件运行时桥接（同步+异步+15s TTL 缓存）、5 路调用优先级+偏好缓存、文献元数据+笔记+PDF/标注→LLM 结构化提取管线、PDF Embedding 语义选择（1200 char chunk / top-4 cosine / 保留原文顺序）、Folder Summary 多文档合成、自定义 Markdown→HTML 渲染、JSON 文件持久化（opChain 顺序链+自增 ID+完整性修复）、Review Manager 单例+Tab/Dialog 双模式、UI 自动修复（popupshowing + MutationObserver + 渐进重试）、Progress 去重+批量线性映射 |
| 元数据格式化 / 规则引擎 / 批量校验 / 并发处理 | [REFERENCE_FORMAT_METADATA_PATTERNS.md](./REFERENCE_FORMAT_METADATA_PATTERNS.md) | [REFERENCE_PLUGIN_MENU_PATTERNS.md](./REFERENCE_PLUGIN_MENU_PATTERNS.md), [REFERENCE_DUPLICATE_WORKFLOW_PATTERNS.md](./REFERENCE_DUPLICATE_WORKFLOW_PATTERNS.md) | Rule 接口 + defineRule 工厂、Prepare→Apply 两阶段执行、ConcurrentCaller 并发、Notifier 500ms 延迟、逐规则超时隔离、ProgressUI/Reporter 分离 |
| 文献去重 / 级联候选消除 / 批量合并 | [REFERENCE_DUPLICATE_WORKFLOW_PATTERNS.md](./REFERENCE_DUPLICATE_WORKFLOW_PATTERNS.md) | [REFERENCE_PLUGIN_TECHNICAL_CHAINS.md](./REFERENCE_PLUGIN_TECHNICAL_CHAINS.md) | 6 阶段级联消除（dc:replaces→DOI→ISBN→标题→作者→年份）、4 种 Master 策略、暂停/恢复/回退批量合并 |
| 文献去重 / 合并 / 非重复标记 / 重复计数 | [REFERENCE_ZOPLICATE_PATTERNS.md](./REFERENCE_ZOPLICATE_PATTERNS.md) | [REFERENCE_DUPLICATE_WORKFLOW_PATTERNS.md](./REFERENCE_DUPLICATE_WORKFLOW_PATTERNS.md) | 渐进式候选过滤（直接 SQL 查询 Zotero 内部表）、DisjointSetForest 拦截、对称对存储、搜索对象缓存、导入时检测对话框、批量合并暂停/恢复、4 种主条目选择策略 |
| 插件市场 / 多数据源 / 多镜像下载 / 安装状态管理 | [REFERENCE_ADDONS_MARKET_PATTERNS.md](./REFERENCE_ADDONS_MARKET_PATTERNS.md) | [REFERENCE_PLUGIN_TECHNICAL_CHAINS.md](./REFERENCE_PLUGIN_TECHNICAL_CHAINS.md) | 9 种数据源自探测 + 12h 缓存、多镜像下载回退、本地插件 4 策略匹配、EventBus 解耦、Fuse.js 模糊搜索、自定义 URL Scheme + RSA-PSS 验证、Zotero 7/8 兼容层 |
| Word 引文集成 / 拖拽引文 / 虚拟搜索文件夹 / 会话轮询 | [REFERENCE_CITATION_BOOTSTRAP_PATTERNS.md](./REFERENCE_CITATION_BOOTSTRAP_PATTERNS.md) | [REFERENCE_PLUGIN_TECHNICAL_CHAINS.md](./REFERENCE_PLUGIN_TECHNICAL_CHAINS.md) | Word 会话轮询 + JSON diff、execCommand 补丁、坐标检测拖拽、临时方法替换 + try/finally 恢复、虚拟搜索文件夹 + 过滤器链、引文位置编号 |
| BibTeX/BibLaTeX 导出 / Citekey 管理 / Extra 解析 | [REFERENCE_BETTER_BIBTEX_PATTERNS.md](./REFERENCE_BETTER_BIBTEX_PATTERNS.md) | [REFERENCE_PLUGIN_TECHNICAL_CHAINS.md](./REFERENCE_PLUGIN_TECHNICAL_CHAINS.md) | 双源缓存、Scheduler 防抖、Monkey Patch 可切换、Extra 结构化解析、Sandbox 注入、JSON-RPC 服务 |
| 轻量 AI 对话 / Function Calling / 多 Provider | [REFERENCE_PAPER_CHAT_PATTERNS.md](./REFERENCE_PAPER_CHAT_PATTERNS.md) | [REFERENCE_COMPARISON.md](./REFERENCE_COMPARISON.md) | 多 Provider 接口 + Fallback、30+ 工具定义、流式 Tool Calling、SQLite 迁移、AISummary 批量管线 |
| clean-room 参考快照治理 | [REFERENCE_SNAPSHOTS.md](./REFERENCE_SNAPSHOTS.md) | [HISTORY_INDEX.md](./HISTORY_INDEX.md) | 先看本地快照如何使用，再看历史研究入口 |
| git-backed reference 快照人工更新 | [REFERENCE_SNAPSHOTS.md](./REFERENCE_SNAPSHOTS.md) | [`../config/reference-projects.json`](../config/reference-projects.json) | 只更新 manifest 声明的 rolling git 快照；版本号命名的归档快照继续人工维护 |
| Zotero 宿主索引刷新 / authoritative source 漂移复核 | [REFERENCE_ZOTERO_HOST_INDEX_REFRESH_NOTES.md](./REFERENCE_ZOTERO_HOST_INDEX_REFRESH_NOTES.md) | [ZOTERO_HOST_INTERFACE_CONTRACTS.md](./ZOTERO_HOST_INTERFACE_CONTRACTS.md), [ZOTERO_HOST_SEMANTIC_INDEX.md](./ZOTERO_HOST_SEMANTIC_INDEX.md) | 先看最近一次从 `reference/zotero-main` 抽出的漂移点，再决定是否更新 host contract / semantic index / types |
| 本地语义搜索 / Transformers.js ChromeWorker / Embedding 管线 / SQLite vector store / RRF 混合搜索 / Plugin API | [REFERENCE_ZOTSEEK_PATTERNS.md](./REFERENCE_ZOTSEEK_PATTERNS.md) | [REFERENCE_SMART_HIGHLIGHTER_PATTERNS.md](./REFERENCE_SMART_HIGHLIGHTER_PATTERNS.md), [REFERENCE_ZOTERO_MCP_PATTERNS.md](./REFERENCE_ZOTERO_MCP_PATTERNS.md) | 纯本地 AI、无 API Key、ChromeWorker + nomic-embed-text-v1.5、ATTACH DATABASE SQLite、RRF Hybrid Search、Plugin API 可调用；与 Smart Highlighter 的 Sidecar Reranker 和 MCP Plugin 的外部 semantic search 对比 |
| Zotero 宿主权威命名 / 接口锚点 | [ZOTERO_HOST_INTERFACE_CONTRACTS.md](./ZOTERO_HOST_INTERFACE_CONTRACTS.md) | [ZOTERO_HOST_SEMANTIC_INDEX.md](./ZOTERO_HOST_SEMANTIC_INDEX.md), [ZOTERO_TERMINOLOGY_GUIDE.md](./ZOTERO_TERMINOLOGY_GUIDE.md) | 这里是权威 contract，不是普通参考摘要 |

## 参考专题正文

### 架构模式专题

- Agent 运行时 + 多模型适配 + MCP：[REFERENCE_LLM_FOR_ZOTERO_PATTERNS.md](./REFERENCE_LLM_FOR_ZOTERO_PATTERNS.md)
- 外部 MCP Server + RDP 远程调试 + Zotero 桥接：[REFERENCE_MCP_SERVER_ZOTERO_DEV_PATTERNS.md](./REFERENCE_MCP_SERVER_ZOTERO_DEV_PATTERNS.md)
- 内部集成 MCP Server + Streamable HTTP + 语义搜索 + 写操作门控：[REFERENCE_ZOTERO_MCP_PATTERNS.md](./REFERENCE_ZOTERO_MCP_PATTERNS.md)
- 本地语义搜索 + Transformers.js ChromeWorker + SQLite vector store + RRF 混合搜索 + Plugin API：[REFERENCE_ZOTSEEK_PATTERNS.md](./REFERENCE_ZOTSEEK_PATTERNS.md)
- Vue UI + Vite + Worker 架构：[REFERENCE_CHARTERO_PATTERNS.md](./REFERENCE_CHARTERO_PATTERNS.md)
- Hook + Custom Element + 笔记系统：[REFERENCE_BETTER_NOTES_PATTERNS.md](./REFERENCE_BETTER_NOTES_PATTERNS.md)

### AI 集成

- 文献综述提炼 / GPT 插件桥接 / PDF 语义选择 / JSON 持久化 / UI 自动修复：[REFERENCE_EXITEM_PATTERNS.md](./REFERENCE_EXITEM_PATTERNS.md)
- 轻量 AI 对话 + 双模式 + PDF 上下文 + 快捷命令：[REFERENCE_AI_BAR_PATTERNS.md](./REFERENCE_AI_BAR_PATTERNS.md)
- AI 智能分类 + Collection 树 + 交互式确认：[REFERENCE_AI_COLLECTION_PATTERNS.md](./REFERENCE_AI_COLLECTION_PATTERNS.md)
- 多 Provider + Key 轮换 + 多模态管线 + Dashboard：[REFERENCE_AI_BUTLER_PATTERNS.md](./REFERENCE_AI_BUTLER_PATTERNS.md)
- Agent 完整架构（多轮/HITL/MCP/扩展 API）：[REFERENCE_LLM_FOR_ZOTERO_PATTERNS.md](./REFERENCE_LLM_FOR_ZOTERO_PATTERNS.md)
- AI 对话 + Function Calling + 多 Provider：[REFERENCE_PAPER_CHAT_PATTERNS.md](./REFERENCE_PAPER_CHAT_PATTERNS.md)
- Item Pane Chat / Reader 文本弹出 / 轻量对话：[REFERENCE_AIASSISTANT_PATTERNS.md](./REFERENCE_AIASSISTANT_PATTERNS.md)
- 批量 AI 笔记 / 多 Provider / PDF 全文提取 / Prompt 版本：[REFERENCE_AINOTE_PATTERNS.md](./REFERENCE_AINOTE_PATTERNS.md)
- 早期 AI 对话 + 向量检索 + Meet 对象：[REFERENCE_ZOTERO_GPT_PATTERNS.md](./REFERENCE_ZOTERO_GPT_PATTERNS.md)

### PDF 处理与高亮

- PDF 智能高亮 / 双后端 / Sidecar / 语义着色：[REFERENCE_SMART_HIGHLIGHTER_PATTERNS.md](./REFERENCE_SMART_HIGHLIGHTER_PATTERNS.md)
- Gemini AI PDF 书签生成 / 分块上传 / pdf-lib 大纲：[REFERENCE_PDF_AI_BOOKMARKS_PATTERNS.md](./REFERENCE_PDF_AI_BOOKMARKS_PATTERNS.md)

### 文献集成

- 中文文献元数据 / CNKI / 无头浏览器：[REFERENCE_JASMINUM_PATTERNS.md](./REFERENCE_JASMINUM_PATTERNS.md)
- BibTeX/BibLaTeX 导出 / Citekey 管理：[REFERENCE_BETTER_BIBTEX_PATTERNS.md](./REFERENCE_BETTER_BIBTEX_PATTERNS.md)
- PDF 翻译 / 服务端处理 / LLM 集成：[REFERENCE_PDF2ZH_PATTERNS.md](./REFERENCE_PDF2ZH_PATTERNS.md)

### 插件管理与集成

- 插件市场 / 多数据源 / 多镜像下载：[REFERENCE_ADDONS_MARKET_PATTERNS.md](./REFERENCE_ADDONS_MARKET_PATTERNS.md)
- Word 引文集成 / 拖拽引文 / 虚拟搜索文件夹：[REFERENCE_CITATION_BOOTSTRAP_PATTERNS.md](./REFERENCE_CITATION_BOOTSTRAP_PATTERNS.md)

### 文献去重与合并

- 文献去重 / 合并 / 非重复标记 / 重复计数：[REFERENCE_ZOPLICATE_PATTERNS.md](./REFERENCE_ZOPLICATE_PATTERNS.md)

### 通用技术链

- 规则引擎 + 元数据格式化 + 批量校验：[REFERENCE_FORMAT_METADATA_PATTERNS.md](./REFERENCE_FORMAT_METADATA_PATTERNS.md)
- 跨项目通用技术链：[REFERENCE_PLUGIN_TECHNICAL_CHAINS.md](./REFERENCE_PLUGIN_TECHNICAL_CHAINS.md)
- 技术链覆盖审计：[REFERENCE_TECHNICAL_CHAIN_COVERAGE_AUDIT.md](./REFERENCE_TECHNICAL_CHAIN_COVERAGE_AUDIT.md)
- 模块增量盘点：[REFERENCE_UPDATED_PROJECT_MODULE_DELTA.md](./REFERENCE_UPDATED_PROJECT_MODULE_DELTA.md)
- Zotero 进程内 CPU activity / profiler 采集：[REFERENCE_KNOW_UR_ZOTERO_PERFORMANCE_PATTERNS.md](./REFERENCE_KNOW_UR_ZOTERO_PERFORMANCE_PATTERNS.md)
- 多语言翻译管线：[REFERENCE_PDF_TRANSLATE_PATTERNS.md](./REFERENCE_PDF_TRANSLATE_PATTERNS.md)
- 文献去重 / 级联消除 / 批量合并：[REFERENCE_DUPLICATE_WORKFLOW_PATTERNS.md](./REFERENCE_DUPLICATE_WORKFLOW_PATTERNS.md)

### UI 路线

- 面板创建与 React surface：[REFERENCE_AIASSISTANT_REACT_PANEL_PATTERNS.md](./REFERENCE_AIASSISTANT_REACT_PANEL_PATTERNS.md)
- 菜单与子菜单：[REFERENCE_PLUGIN_MENU_PATTERNS.md](./REFERENCE_PLUGIN_MENU_PATTERNS.md)
- UI 路线来源追踪：[REFERENCE_PLUGIN_UI_ANALYSIS.md](./REFERENCE_PLUGIN_UI_ANALYSIS.md)

### 宿主 Contract

- 宿主索引刷新笔记：[REFERENCE_ZOTERO_HOST_INDEX_REFRESH_NOTES.md](./REFERENCE_ZOTERO_HOST_INDEX_REFRESH_NOTES.md)
- DOM contract / 路由验证可行性：[REFERENCE_DOM_CONTRACT_VALIDATION_FEASIBILITY.md](./REFERENCE_DOM_CONTRACT_VALIDATION_FEASIBILITY.md)
- 宿主接口契约：[ZOTERO_HOST_INTERFACE_CONTRACTS.md](./ZOTERO_HOST_INTERFACE_CONTRACTS.md)
- 宿主语义索引：[ZOTERO_HOST_SEMANTIC_INDEX.md](./ZOTERO_HOST_SEMANTIC_INDEX.md)
- 宿主术语指南：[ZOTERO_TERMINOLOGY_GUIDE.md](./ZOTERO_TERMINOLOGY_GUIDE.md)

### 官方生态

- Zotero 官方生态分流：[REFERENCE_ZOTERO_OFFICIAL_ECOSYSTEM.md](./REFERENCE_ZOTERO_OFFICIAL_ECOSYSTEM.md)

### 专项分析

- BibGenie 架构分析：[REFERENCE_BIBGENIE_ANALYSIS.md](./REFERENCE_BIBGENIE_ANALYSIS.md)
- EnhancedTrans 路线 4 参考笔记：[REFERENCE_ENHANCEDTRANS_PROTECTION_NOTES.md](./REFERENCE_ENHANCEDTRANS_PROTECTION_NOTES.md)
- 路线 4 本地存储决策：[ROUTE4_LOCAL_STORAGE_DECISION.md](./ROUTE4_LOCAL_STORAGE_DECISION.md)
- yanzheng 验证与防盗版参考笔记：[REFERENCE_YANZHENG_VALIDATION_SECURITY_NOTES.md](./REFERENCE_YANZHENG_VALIDATION_SECURITY_NOTES.md)
- Zotero 宿主信号与弱绑定参考笔记：[REFERENCE_ZOTERO_HOST_SIGNAL_BINDING_NOTES.md](./REFERENCE_ZOTERO_HOST_SIGNAL_BINDING_NOTES.md)
- 跨项目比较：[REFERENCE_COMPARISON.md](./REFERENCE_COMPARISON.md)
- 快照治理：[REFERENCE_SNAPSHOTS.md](./REFERENCE_SNAPSHOTS.md)
- manifest：[`../config/reference-projects.json`](../config/reference-projects.json)

### yanzheng 安全研究子仓库

`reference/yanzheng/` 是独立的安全/防盗版研究仓库，包含专门的插件安全分析文档：

- yanzheng 安全研究 README：[`../reference/yanzheng/docs/README.md`](../reference/yanzheng/docs/README.md)
- Mindmap 插件安全分析（硬编码 AES、伪造设备绑定）：[`../reference/yanzheng/docs/mindmap完整分析报告.md`](../reference/yanzheng/docs/mindmap完整分析报告.md)
- Style 插件攻击行为分析（远程验证、eval 风险）：[`../reference/yanzheng/docs/style插件攻击行为分析.md`](../reference/yanzheng/docs/style插件攻击行为分析.md)
- 彩蛋与隐藏功能分析（GPT 硬编码 API Key、Reference 隐藏快捷键）：[`../reference/yanzheng/docs/彩蛋与字段验证分析.md`](../reference/yanzheng/docs/彩蛋与字段验证分析.md)
- 安全机制图谱：[`../reference/yanzheng/docs/安全机制图谱.md`](../reference/yanzheng/docs/安全机制图谱.md)

**yanzheng 子仓库项目清单**（详见 `yanzheng/docs/README.md`）：

| 项目 | 版本 | 状态 | 用途 |
|------|------|------|------|
| zotero-mindmap-plugin | 1.0.3 | 安全研究 | 激活机制破解、硬编码密钥、伪造设备绑定分析 |
| zotero-style (Ethereal Style) | 5.9.9 | 安全研究 | 远程验证端点、eval 风险、HTTP 明文传输分析 |
| zotero-reference (Ethereal Reference) | 1.7.1 | 安全研究 | 隐藏快捷键、window.eval 代码注入分析 |
| zotero-gpt | 3.0.9 | 安全研究 | 硬编码 API Key、远程更新劫持分析 |
| bibgenie | 0.6.4 | 安全研究 | 更新版本，与主 reference 对比 |
| ai4paper | 3.2.1.6 | 安全研究 | 更新版本，与主 reference 对比 |

## 当前参考资产

## 维护规则

- 不要在本页记录当前 active wave、当前 blocker、动态统计或教程式长正文
- 新增参考专题时，优先补“按任务选参考”的入口，而不是先写项目数量或覆盖率叙述
- 当 `reference/` 顶层目录职责变化时，先更新本页和 [REFERENCE_SNAPSHOTS.md](./REFERENCE_SNAPSHOTS.md)，再去补具体专题正文
- 涉及 Zotero 宿主 authoritative source 的路由，固定写 `reference/zotero-main/`；不要把开源插件快照误写成宿主权威入口
- 如果某份参考材料已经升格为模板 contract，应优先在 [AGENT_INDEX.md](./AGENT_INDEX.md) 中补其 authoritative 入口，而不是继续只留在参考路由层
- 自动 reference distillation 只允许更新 `docs/REFERENCE_*.md` 与本页；它不改 raw `reference/`、truth、validation/gate 配置或产品文档
