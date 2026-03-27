# 本地 Reference 快照说明

本仓库的主历史默认不跟踪 `reference/` 目录。

如果你需要复现历史对照分析、相似度排查或 clean-room 行为研究，可以在本地单独放置 reference 快照，但不要把这些材料纳入主仓提交。

## 推荐做法

1. 在工作区本地创建 `reference/` 目录，仅用于临时研究。
2. 放入你需要的只读快照，例如：
   - `reference/zotero-plugin-template-main`
   - `reference/bibgenie-0.5.7`
3. 运行对照分析、人工比对或相似度检查。
4. 只提交你自己的规格、设计、测试和 clean-room 实现，不提交 reference 快照本身。

## 适用场景

- 复核 [Reference 对比](docs/REFERENCE_COMPARISON.md) 的结论
- 复核 [BibGenie 架构借鉴分析](docs/REFERENCE_BIBGENIE_ANALYSIS.md) 的观察来源
- 进行本地人工 spot-check 或相似度排查

## 约束

- reference 快照仅作为“研究输入”，不是主仓源码资产。
- 文档中的 reference 结论应能独立成立，不以仓库内必须存在 `reference/` 为前提。
- 导出物、发布物和主 git 历史都不应包含 reference 快照。
