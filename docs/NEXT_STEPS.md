# ToolsBox Next Steps

**更新时间**: 2026-05-17
**权威入口**: [CURRENT_BACKLOG.md](./CURRENT_BACKLOG.md)

## 当前下一步

发布保持冻结；当前只做工作树整理、分批提交与本地非发布验证。

推荐顺序：

1. 保持 `RELEASE-FREEZE-WAVE-001` truth 与 mirrors 同步。
2. 提交 default-off Style runtime、Backlinks、Merge Annotations 与测试。
3. 单独提交视觉 baseline evidence。
4. 提交 release freeze truth、surface evidence、worktree inventory 与 status docs。
5. 运行 docs sync、targeted tests、`agent:check`、monitor、gate、sync。

## 解冻后才做

- 确认发布目标仓库。
- 确认认证/上传方式。
- 真实上传 `dist/update.json` 与 `dist/toolsbox-0.1.0.xpi`。
- 运行 `npm run release:preflight -- --verify-remote`、`npm run release:prepare`、`npm run release:matrix`、`npm run agent:gate:release`。
