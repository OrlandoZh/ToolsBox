# 参考项目信息缺口分析

> 生成时间: 2026-04-12
> 基准: `config/reference-projects.json` (27 个 manifest 声明) + `reference/` 磁盘实际目录 + `docs/REFERENCE_INDEX.md` (10 个专题 + 路由表)

## 一、磁盘目录与 manifest 的差异

### 1.1 磁盘 plugin/ 有但 manifest 没有的项目（4 个）

| 目录名 | 有源码 | 潜在价值 | 建议 |
|---|---|---|---|
| `Chartero-main` | 是 — Vue + Vite + Worker 完整架构 | 高 — 商业级 AI 插件，src/addon 分层、Vue UI、PDF Worker | 补入 manifest + 开专题 |
| `gemini-zotero-main` | 是 — 标准 zotero-plugin-template 架构 | 中 — Gemini PDF 分析管线 | 补入 manifest |
| `ZotLink-main` | 否 — Python 工具（pyproject.toml + run_server.py），非标准插件 | 低 — 与插件开发无关 | 标记为非插件类别 |
| `actions-and-tags-for-zotero` | 是 — 标准插件结构 v2.4.0 | 中 — 动作和标签管理管线 | 补入 manifest |

### 1.2 磁盘 Templetereference/ 有但 manifest 没有的项目（4 个）

这些项目存在但不在 `reference/plugin/` 而是在 `reference/Templetereference/`，当前完全未纳入 manifest：

| 目录名 | 实际性质 | 潜在价值 | 建议 |
|---|---|---|---|
| `zotero-plugin-scaffold-main` | 官方开发脚手架 v0.8.3 | 高 — 构建/测试/发布/ESLint 工具链，可直接对比模板当前 build.mjs | 补入 manifest + 开专题 |
| `zotero-plugin-template-main` | 官方插件模板 v3.1.0 | 高 — 官方标准模板，应对比与当前模板差异 | 补入 manifest + 开差异分析 |
| `zotero-pdfjs-types-main` | PDF.js 类型定义 | 中 — Zotero fork 的 pdf.js 类型声明，用于 zotero-types | 补入 manifest |
| `know-ur-zotero-main` | Zotero 状态监控工具 v0.0.6 | 中 — activity-oriented 采样思路已在 CURRENT_BACKLOG 中引用 | 补入 manifest |

### 1.3 Templetereference/claude code 目录（agent 基础设施）

该目录包含多个 Claude Code / OpenClaw 相关子项目，与 Zotero 插件无直接关系，但对当前 agent 驱动开发基础设施有直接参考价值：

| 子目录 | 内容 | 建议 |
|---|---|---|
| `anthropic-ai-claude-code-2.1.88.tgz` | Claude Code 官方包 | 保持当前 Fallback 规则对齐 |
| `claude-code-cli-master` | CLI 源码 | 分析 CLI 编排协议 |
| `claude-code-rust-master` | Rust 版 CLI | 了解底层实现 |
| `claude-code-sourcemap-main` | SourceMap 支持 | 与 sourcemap 验证相关 |
| `open-claude-code-main`（×3 变体） | OpenClaw 多版本 | 分析 SDK/CLI/gateway/MCP 协议 |
| `package/` | 包文件 | 版本参考 |

### 1.4 manifest 名与磁盘名不一致的项目（3 个）

| manifest id | 磁盘实际名 | 差异类型 | 建议 |
|---|---|---|---|
| `zoplicate-main` | `zoplicate` | id 含 `-main` 后缀但目录没有 | manifest id 修正为 `zoplicate` |
| `zotero-exitem-main` | `Zotero-Exitem-main` | targetPath 已正确，id 命名不一致 | 无功能影响，id 可修正为 `zotero-exitem-main` 已对齐 |
| `zotero-gpt-master` | `zotero-gpt` | id 含 `-master` 但目录没有 | manifest id 修正为 `zotero-gpt`，targetPath 已正确 |

## 二、lajiplugin 目录未索引信息

`reference/lajiplugin/` 下有 6 个版本号命名的预构建插件（XPI 解压结构：bootstrap.js + manifest.json + prefs.js），其中仅 `bibgenie` 有专题承接，其余 5 个完全未进入 REFERENCE_INDEX.md 路由：

| 目录 | ID | 版本 | 描述 | 可提取信息方向 |
|---|---|---|---|---|
| `bibgenie-0.5.7` | BibGenie | 0.5.7 | AI 研究助手 | 已有专题 — `REFERENCE_BIBGENIE_ANALYSIS.md` |
| `Zotero-One-v6.8.2` | Zotero One | 6.8.2 | 品质 AI 一体化生态 | 独立 App 模式、窗口架构、完整 UI 体系 |
| `papersgpt-v0.4.5` | papersgpt | 0.4.5 | 多模型 PDF 聊天 | AI 论文摘要管线、多 LLM 路由 |
| `zotero-box` | Zotero Box | 2.8.1 | 改进 Zotero 体验 | 侧边栏/浮窗交互模式 |
| `garden_v0.0.14` | Garden | 0.0.14 | 中国宝宝知识图谱插件 | 知识图谱/双向链接集成 |
| `zotero-magic-for-user` | Magic for Zotero | 2.4.2 | 中文社区快捷操作 | 命令面板集成、用户级快捷操作 |

**建议**：至少为 `Zotero-One-v6.8.2` 开专题，分析其独立 App 模式与模板当前 pane 注入模式的差异。

## 三、plugin 目录已覆盖项目缺少专题承接

以下项目在 manifest 中且磁盘存在源码，但 **没有独立专题文档**：

### 3.1 高优先级（建议开专题）

| 项目 | 架构特征 | 可提取信息方向 | 建议专题名 |
|---|---|---|---|
| `zotero-better-notes-master` | 标准模板 | 笔记面板架构、同步机制、Reader 深度集成 | `REFERENCE_BETTER_NOTES_PATTERNS.md` |
| `Chartero-main` | Vue + Vite + Worker | Vue UI 组件、PDF Web Worker、src/addon 分层 | `REFERENCE_CHARTERO_PATTERNS.md` |
| `paper-chat-for-zotero-master` | 标准模板 | 论文对话 UI 模式、上下文管理、多轮对话 | `REFERENCE_PAPER_CHAT_PATTERNS.md` |
| `zotero-pdf-translate-main` | 标准模板 | 翻译服务管线、侧边栏集成、异步任务管理 | `REFERENCE_PDF_TRANSLATE_PATTERNS.md` |

### 3.2 中优先级

| 项目 | 可提取信息方向 |
|---|---|
| `jasminum-main` | 中文元数据抓取、期刊/学位论文特殊字段处理 |
| `zotero-gpt` | LLM 集成、命令面板、快捷操作 |
| `zotero-better-bibtex-master` | 大规模数据管理、citekey 生成、导出格式 |
| `zotero-mcp-main` | MCP 协议集成、外部工具调用 |
| `mcp-server-zotero-dev-main` | MCP Server 架构 |
| `zotero-pdf2zh-main` | PDF 翻译管线（与 pdf-translate 对比） |
| `llm-for-zotero-main` | 多 LLM provider 路由 |
| `gemini-zotero-main` | Gemini PDF 分析、zotero-plugin-template 标准实践 |

### 3.3 低优先级（当前技术链覆盖可能已足够）

以下项目在 `REFERENCE_PLUGIN_TECHNICAL_CHAINS.md` 跨项目技术链审计中隐式覆盖，不需要独立专题：
`zotero-addons-main`, `zotero-ai-assistant-main`, `zotero-ainote-main`, `zotero-attanger-main`,
`zotero-ai-bar-main`, `zotero-ai-collection-bootstrap`, `zotero-format-metadata-main`,
`zotero-smart-highlighter-master`, `pdf-ai-bookmarks-main`, `zotero-citation-bootstrap`,
`marginalia-main`, `aidea-zotero-master`, `zotero-AI-Butler-main`

## 四、已发现但未利用的技术模式

### 4.1 Chartero — Vue + Vite + Worker 架构

- **UI 框架**: Vue（当前模板使用 React optional bundle）
- **构建**: Vite（当前模板使用 esbuild）
- **Worker**: Web Worker 处理 PDF 解析（当前模板无 Worker 模式）
- **分层**: `src/bootstrap/` 入口 + `src/vue/` 组件 + `src/worker/` 处理
- **可借鉴**: Vue vs React 对比、Worker 异步 PDF 处理、Vite vs esbuild 构建差异

### 4.2 gemini-zotero — 标准模板最佳实践

- **模板**: 基于 windingwind/zotero-plugin-template
- **工具链**: `zotero-plugin.config.ts` 配置驱动
- **模块**: utils 层（locale/prefs/window/ztoolkit）+ hooks 生命周期 + addon 注册
- **可借鉴**: 标准模板的 hooks 模式、ztoolkit 封装思路、类型声明结构

### 4.3 zotero-plugin-scaffold — 官方脚手架

- **文档齐全**: build / serve / test / release / eslint 完整文档
- **可对比**: 与当前 `scripts/build.mjs` 的差异、测试框架选择、发布流程

### 4.4 know-ur-zotero — 状态监控

- **已在 CURRENT_BACKLOG 中引用**: activity-oriented 采样思路
- **应正式承接**: 把引用转化为结构化专题

### 4.5 lajiplugin 6 个预构建包

- **共同特征**: 均为 XPI 解压结构（bootstrap.js + manifest.json + prefs.js 在根目录）
- **差异化价值**: 不展示源码实现，但展示 manifest 模式、偏好注册模式、bootstrap 入口模式
- **Zotero-One 特别值得关注**: v6.8.2 版本号暗示成熟度高

## 五、backup 目录治理

磁盘上有 34 个 `.backup-*` 目录，全部为 `20260412T084926Z` 时间戳的统一快照。这些 backup 目录与主目录一一对应，不产生新的信息缺口。

**当前状态**：backup 仅作为版本锁定快照使用，无需单独索引。

## 六、总结与行动建议

### 6.1 立即可做（manifest/路由修复）

1. 补入 4 个 plugin/ 有源码但 manifest 没有的项目（Chartero、gemini-zotero）
2. 补入 4 个 Templetereference/ 有源码但 manifest 没有的项目
3. 清理 2 个空目录（ZotLink-main、actions-and-tags-for-zotero）
4. 修正 3 个 manifest id 命名不一致

### 6.2 中期（专题开新）

5. 为 `Chartero-main` 开专题（Vue + Worker 架构）
6. 为 `zotero-better-notes-master` 开专题
7. 为 `zotero-plugin-scaffold-main` 开专题（构建/测试工具链对比）
8. 为 `Zotero-One-v6.8.2` 开专题（独立 App 模式）
9. 为 `know-ur-zotero-main` 开专题（已在 CURRENT_BACKLOG 中引用）

### 6.3 基础设施

10. 评估 `open-claude-code-main` 与当前 `agent:delegate` 的对齐程度
11. 对比 `zotero-plugin-template-main` 与当前模板的差异

### 6.4 统计概览

| 维度 | 数量 |
|---|---|
| manifest 声明项目 | 27 |
| 磁盘 plugin/ 目录（非 backup） | 34 |
| 磁盘 plugin/ 有源码 | 32 |
| 磁盘 plugin/ 空目录 | 2 |
| 磁盘 Templetereference/ 项目（非 claude code） | 4 |
| 磁盘 lajiplugin 目录 | 6 |
| 磁盘有源码但 manifest 无 | 8 |
| 已有专题承接 | 10（含通用/比较类） |
| 无专题但高优先级 | 4 |
| 无专题但中优先级 | 8 |
