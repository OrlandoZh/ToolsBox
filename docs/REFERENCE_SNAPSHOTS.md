# 本地 Reference 快照说明

本仓库的主历史默认不跟踪 `reference/` 目录。

如果你需要复现历史对照分析、相似度排查或 clean-room 行为研究，可以在本地单独放置 reference 快照，但不要把这些材料纳入主仓提交。

当前本地 `reference/` 目录按四个顶层篮子治理：

- `reference/Templetereference/`
  开发框架参考。
- `reference/zotero-main/`
  Zotero 宿主源码 authoritative source。
- `reference/plugin/`
  Zotero 开源插件参考。
- `reference/lajiplugin/`
  Zotero 其他插件参考。

## 推荐做法

1. 在现有四个顶层篮子下放置或整理只读快照，不再额外平铺新的一级目录。
2. 按素材类型归位，例如：
   - `reference/Templetereference/zotero-plugin-template-main`
   - `reference/zotero-main`
   - `reference/plugin/zotero-ai-assistant-main`
   - `reference/lajiplugin/bibgenie-0.5.7`
3. 运行对照分析、人工比对或相似度检查。
4. 只提交你自己的规格、设计、测试和 clean-room 实现，不提交 reference 快照本身。

## 人工更新链

当前 v1 已新增一条“人工命令触发”的 git-backed reference 更新链：

- manifest：[`../config/reference-projects.json`](../config/reference-projects.json)
- 命令入口：`npm run agent:reference:update -- list`
- 更新单个项目：`npm run agent:reference:update -- update --project <id>`
- 批量更新全部受管项目：`npm run agent:reference:update -- update --all`
- 最近一次执行报告：`dist/agent-reference-update/latest.json`

这条链路只管理 manifest 里声明的 rolling git 快照，默认写域仍然只在本地 `reference/` 与 `dist/`。

## 受管与非受管边界

- 受管项目必须显式声明在 `config/reference-projects.json`，且 `targetPath` 必须位于 `reference/` 下。
- v1 只支持 git-backed 快照，适合像 `reference/zotero-main` 这种“原位刷新”的 rolling snapshot。
- 若目标目录是脏 git worktree、非 git 目录，或现有 `origin` 与 manifest 不一致，命令默认会阻断，不静默覆盖。
- 需要人工确认后重建目标目录时，可显式加 `--replace-existing`；脚本会先把旧目录备份成 `*.backup-<timestamp>`，再拉取新快照。
- 仅当你明确接受丢弃本地改动时，才使用 `--allow-dirty` 对 git-backed 快照做原位 reset。
- 像 `reference/lajiplugin/bibgenie-0.5.7` 这类“版本号写进目录名”的 release/archive 快照，当前继续人工维护；升级版本时，优先新建对应版本目录，而不是把它们纳入 rolling update。

## 适用场景

- 复核 [Reference 对比](REFERENCE_COMPARISON.md) 的结论
- 复核 [BibGenie 架构借鉴分析](REFERENCE_BIBGENIE_ANALYSIS.md) 的观察来源
- 进行本地人工 spot-check 或相似度排查
- 刷新 manifest 中已声明的 git-backed authoritative/reference 快照

## 约束

- reference 快照仅作为“研究输入”，不是主仓源码资产。
- 宿主接口、术语、字段和事件语义只认 `reference/zotero-main/`；`reference/plugin/` 与 `reference/lajiplugin/` 不替代 authoritative source。
- 文档中的 reference 结论应能独立成立，不以仓库内必须存在 `reference/` 为前提。
- 导出物、发布物和主 git 历史都不应包含 reference 快照。
- `agent:reference:update` 不会回写 `docs/CURRENT_BACKLOG.md`、`docs/REFERENCE_*.md`、validation/gate 配置或业务源码；它只刷新本地快照和执行报告。
