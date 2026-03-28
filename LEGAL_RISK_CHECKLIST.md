# Clean-Room Legal Risk Checklist

本清单不是法律意见。正式发布前仍应进行最终法务审阅。

## Development Gate (must pass now)

- [x] 当前模板黑盒行为已先冻结在 `SPEC.md`，实现与验收都以行为而不是 reference 源码为准。
  Evidence: `SPEC.md` 已写明产品标识、平台声明、默认能力、生命周期、设置治理、Reader 基线与黑盒验收标准。
- [x] 主仓实现文件未导入本地 `reference/` 快照，也未把 reference 路径作为运行依赖。
  Evidence: `npm run cleanroom:audit` 会扫描 `src/`、`scripts/`、`tests/`、`addon-static/` 等目录中的 `reference/` 导入与已知 AGPL 路径。
- [x] 仓库存在可审计的源码基线提交，可用于追溯 clean-room 起点。
  Evidence: `git rev-parse --verify HEAD` 返回当前首个基线提交 `0ba3c96d8ad3e1f9b0ae71a30d24551f6fc768bf`。
- [x] 开发态 clean-room 门禁已被接入日常检查链路，而不是只靠人工记忆执行。
  Evidence: `package.json` 中 `npm run check` 已串联 `npm run cleanroom:audit`。
- [x] 相似度扫描具备标准化输出，但在日常开发中不把本地 reference 快照设为硬依赖。
  Evidence: `scripts/cleanroom-similarity.mjs` 与 `scripts/cleanroom-audit.mjs` 统一输出 `dist/cleanroom-*.{json,md}`，缺少本地 `reference/` 时记录 `status = unavailable`。
- [x] 发布态额外要求 similarity 报告可用，避免“未挂载 reference 快照”直接进入发布检查。
  Evidence: `scripts/release-preflight.mjs` 会调用 `runCleanroomAudit({ mode: "release" })`，发布态要求 `cleanroom-similarity.json` 为 `available`。

## Release Gate (release-only)

当前这组条目继续保留为发版前人工流程；它们不纳入当前“工程化硬化”批次的自动化完成定义。

- [ ] 本次发布使用的本地 reference 快照来源、挂载路径与只读边界已留档。
  Evidence: 以 `dist/cleanroom-similarity.json`、`dist/cleanroom-similarity.md` 和本地团队发布记录为准。
- [ ] similarity 报告已由人工复核，并对高风险匹配项给出处置结论。
  Evidence: 以 `dist/cleanroom-similarity.md` 的复核记录与对应代码审查结论为准。
- [ ] 第三方依赖与发布包 notices 已完成最终核查。
  Evidence: 以本次 release 的依赖审计记录、发布说明与 notices 清单为准。
- [ ] Final legal review completed before shipping.
  Evidence: 以正式发布审批记录或法务签字结论为准。
