# AGENTS

这个文件是给新接手仓库的开发 agent 的薄入口，不维护第二份 project truth。

## Current Truth

- 当前“完成度 / 当前主线 / 当前剩余项”只认 [docs/CURRENT_BACKLOG.md](docs/CURRENT_BACKLOG.md) 的“当前单一事实源”
- 不要直接根据旧 `dist/` 工件、README 历史段落或单次命令输出判断当前主线
- 如果 truth 变化，先更新 `docs/CURRENT_BACKLOG.md`，再运行 `npm run docs:sync-current-truth`

## Default Flow

1. 先运行 `npm run check`
2. 涉及运行时、UI、场景或宿主集成的改动，优先运行 `npm run agent:zotero:e2e`
3. 需要连续热重载观察时，再运行 `npm run zotero:watch`
4. 每轮改动后运行 `npm run agent:monitor` 与 `npm run agent:gate`
5. 以 `agent:gate` / `agent:gate:release` 结论作为是否继续推进的主判据

## Initialization Guard

- 如果 `config/addon.config.json` 仍保留模板默认值，例如 `addonId=cleanroom-template@example.com`、`author=Your Team`、模板仓库 `homepage` 或模板专用 `updateURL`，先暂停功能开发
- 在这种模板态下，agent 必须先向用户确认并初始化这些基础信息：`addonName`、`addonId`、`addonRef`、`author`、`homepage`、`updateURL`
- 同时确认当前目标是“保留完整 agent 工程链继续开发”，还是“导出纯项目后在新目录继续开发”
- 只有这些基础配置确认完成后，才继续后续实现、真机验证或发布链操作

## Release Boundary

- 当前本地链路已经能自动生成 `.xpi`、`dist/update.json`、`dist/release-manifest.json`
- `npm run release:upload -- --provider <provider> --release-tag <tag> --target-base-url <url>` 现在只会校验本地产物并生成 `dist/release-upload-plan.json` / `md`，不会执行真实上传
- 远端发布仍是外部步骤：先跑 `release:upload` 计划壳，再手动上传远端产物，然后运行 `npm run release:preflight -- --verify-remote`
- 只有当前任务明确属于发布链时，才进入 `npm run release:plan -> npm run release:upload -- --provider <provider> --release-tag <tag> --target-base-url <url> -> 手动上传远端产物 -> npm run release:preflight -- --verify-remote -> npm run release:prepare -> npm run release:matrix -> npm run agent:gate:release`
- 当前唯一未收口主线是远端 `update.json` / `update_link` 的真实分发闭环；不要回头重开已完成的 Reader / startup / freshness 批次

## Artifact Boundary

- `build/`、`dist/`、`.zotero-runtime/`、`obsidian/agent-workbench/` 都是可再生工件，不作为源码事实来源
- 这些目录受 `.gitignore` 保护，正常 `git add` / `git push` 不会上传
- 如果需要交付纯源码或纯模板工程，使用 `npm run export:project`
