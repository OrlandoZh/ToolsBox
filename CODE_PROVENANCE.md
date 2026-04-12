# Code Provenance Record

本文件用于记录模板源码、静态资源与发布包边界的来源说明，服务于中国法环境下的独立开发举证；它不是正式法律意见。

## 模块来源摘要

- `src/`、`addon-static/`、`types/`、`scripts/` 当前主线实现均以本仓库自研源码为准。
- 模板默认能力、宿主接口包装、发布脚本与验证链以当前仓库提交历史为可审计基线，不以外部仓库源码副本作为运行前提。
- `build/`、`dist/`、`.zotero-runtime/`、`obsidian/agent-workbench/` 均为可再生工件，不作为权利来源判断依据。

## reference 使用边界

- `reference/` 仅用于本地只读研究、行为对照、宿主术语校准与 similarity 复核。
- `reference/` 不进入 git 主历史，不作为运行依赖，不进入 `.xpi`、pure-project 导出包或商业交付包。
- 研究 reference 时只提炼公开行为、宿主接口命名、黑盒交互路径与技术模式，不直接复制实现、资源或文案。

## 第三方表达隔离规则

- 不直接复用第三方插件或参考仓库的源码片段、locale、图标、README 段落、CSS/XHTML、截图基线或示例文案。
- 若必须引入第三方代码或资源，先在 `THIRD_PARTY_NOTICES.md` 记录来源、许可证、修改情况与是否进入发布包，再决定是否允许分发。
- Zotero 宿主接口适配本身不视为自动侵权豁免；风险控制重点仍是避免复制第三方受保护表达。

## 发布包排除项

- 发布包与 pure-project 导出物默认排除：`reference/`、分析文档、review artifact、Obsidian handoff、agent telemetry、视觉截图基线与本地实验脚本。
- 如果商业交付需要带文档，只应交付当前项目自有的规格、构建脚本、法务骨架与 notices，不交付 reference 研究材料。

## 维护要求

- 每次新增第三方代码、资源、字体、示例数据或文案时，同轮更新本文件与 `THIRD_PARTY_NOTICES.md`。
- 任何委托开发、外包交付或多 agent 协作任务，都应以当前文件作为“来源留档入口”，补齐模块级来源说明与边界说明。
