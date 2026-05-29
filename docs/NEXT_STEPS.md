# ToolsBox Next Steps

**更新时间**: 2026-05-19
**权威入口**: [CURRENT_BACKLOG.md](./CURRENT_BACKLOG.md)

## 当前下一步

发布保持冻结；`STYLE-CUSTOM-EXTERNAL-API-OPT-IN-WORKFLOW-WAVE-001` 的本地非发布验证闭环已刷新通过。

推荐顺序：

1. 下一波再拆 TLDR real AI summary / provider key management 的 privacy/network/provider contract。
2. Custom External API response-to-note / credential management / automatic enrichment 继续保持 planned/default-off。
3. 发布继续冻结，不运行 release remote verify 或 release gate。

## 解冻后才做

- 确认发布目标仓库。
- 确认认证/上传方式。
- 真实上传 `dist/update.json` 与 `dist/toolsbox-0.1.0.xpi`。
- 运行 `npm run release:preflight -- --verify-remote`、`npm run release:prepare`、`npm run release:matrix`、`npm run agent:gate:release`。
