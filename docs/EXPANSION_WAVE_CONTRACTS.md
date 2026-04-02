# Expansion Wave Contracts

> Generated from `config/expansion-wave-contracts.json`. Edit the registry and run `npm run docs:sync-expansion-wave-contracts`.

## Summary

- Generic expansion-wave scaffolding contract for downstream projects entering their next module expansion batch.

## Contracts

### `generic-expansion-wave-v1`

- Version: `1`
- Summary: Use this contract when a downstream project leaves its current closed batch and enters the next module expansion wave.
- Default Validation Profile: `archetype-driven`
- Module Archetypes:
  - `runtime-capability`: Runtime/service/config capability work should default to functional closure and not inherit strict visual by default. (default=`functional-first`)
  - `host-integration`: Host integration work should default to host guard + e2e + gate first, then upgrade to visual only when it reaches a real visible surface. (default=`host-first`)
  - `visible-surface`: Real user-visible surfaces require visual acceptance as part of the wave exit criteria. (default=`visual-required`)
  - `workspace-integration`: Workspace and handoff integrations should verify artifacts, paths, and data flow before any optional visual review. (default=`artifact-first`)
- Required Planning Artifacts:
  - docs/CURRENT_BACKLOG.md 中声明当前扩展 wave 与默认验收主线
  - config/project-expansion-wave.json 中声明当前 wave、scope、archetype 与 acceptanceTrack
- Required Gate Signals:
  - `validationDecision`
  - `agent:monitor`
  - `agent:gate`
- Non-Goals:
  - AIAssistant 的 Phase D strict visual 结论
  - embeddings / connector / outline / obsidian 等产品模块命名
  - 任何产品特定 UI 语义、阶段命名或发布节奏
