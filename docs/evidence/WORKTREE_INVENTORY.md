# ToolsBox Worktree Inventory

**Updated**: 2026-05-17
**Branch**: `codex-post-freeze-merge-readiness`
**Truth source**: [../CURRENT_BACKLOG.md](../CURRENT_BACKLOG.md)

This inventory records the post-freeze worktree boundary before batched commits. It is an evidence note, not a second project truth.

## Active Boundary

- Release remains frozen while the active development wave is `STYLE-ATTACHMENT-VERSION-ENABLED-E2E-WAVE-001`.
- Do not run `gh release create`, `gh release upload`, remote asset mutation, `npm run release:preflight -- --verify-remote`, or `npm run agent:gate:release`.
- Do not change git remote or `config/addon.config.json` `updateURL` while publishing is frozen.
- Keep `backlinks.enabled=false`, `mergeAnnotations.enabled=false`, `attachmentVersion.enabled=false`, and other Style-like prototypes default-off.
- Do not promote planned features such as Style Editor, TLDR, Custom External API, Paper Matrix Enhanced, Backlinks semantic search/writeback/cross-library sync, or real annotation mutation.

## Worktree Groups

| Group | Scope | Commit intent |
| --- | --- | --- |
| Style runtime and preferences | `config/addon.config.json`, preference pane assets, `src/app/feature-composer.js`, `src/core/prefs.js`, hardened prototype feature files, Backlinks/Merge Annotations runtime, locale strings, feature/unit tests | Capture default-off Style prototype hardening plus local Backlinks and Merge Annotations workflows |
| Zotero harness and scenarios | `scripts/zotero*.mjs`, `scripts/agent-zotero-e2e.mjs`, `scripts/agent-gate.mjs`, `scripts/build.mjs`, scenario files, harness tests, visual baseline assets | Capture scenario pref injection, enabled workflow E2E support, capture stability, and retained baseline evidence |
| Truth and evidence | `docs/CURRENT_BACKLOG.md`, project wave/validation overrides, surface evidence, status docs, current-truth mirrors, docs consistency tests | Capture release freeze, readiness blockers, and merge-ready documentation state |

## Excluded From Commit Scope

- Regenerated `dist/`, `.zotero-runtime/`, and Obsidian handoff artifacts remain untracked/ignored.
- No remote release artifact is uploaded or verified during this cleanup.
- No visual baseline update is run as part of the freeze cleanup; existing baseline file changes are treated as retained evidence from earlier completed waves.
- No unrelated user work outside the listed groups is reverted.

## Verification Plan

Before final sign-off, run:

```bash
npm run docs:sync-current-truth -- --check
node --input-type=module -e "import './tests/features/test-attachment-version.js'; import './tests/feature-composer.test.js'; import './tests/docs-consistency.test.js'; const { runTests } = await import('./tests/test-framework.js'); await runTests();"
npm run zotero:scenario -- --addon-pref attachmentVersion.enabled=true --scenario "attachment version enabled preview workflow"
npm run agent:check
npm run agent:zotero:e2e -- --no-ui-capture
npm run agent:monitor
npm run agent:gate
npm run agent:sync
```

If watch freshness expires during gate, refresh with `npm run zotero:watch` until startup health passes, then stop the long-running process.
