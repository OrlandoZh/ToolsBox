# ToolsBox Worktree Inventory

**Updated**: 2026-05-19
**Branch**: `codex-post-freeze-merge-readiness`
**Truth source**: [../CURRENT_BACKLOG.md](../CURRENT_BACKLOG.md)

This inventory records the post-freeze worktree boundary before batched commits. It is an evidence note, not a second project truth.

## Active Boundary

- Release remains frozen while the active development wave is `STYLE-CUSTOM-EXTERNAL-API-OPT-IN-WORKFLOW-WAVE-001`.
- Do not run `gh release create`, `gh release upload`, remote asset mutation, `npm run release:preflight -- --verify-remote`, or `npm run agent:gate:release`.
- Do not change git remote or `config/addon.config.json` `updateURL` while publishing is frozen.
- Keep `backlinks.enabled=false`, `mergeAnnotations.enabled=false`, `attachmentVersion.enabled=false`, `paperMatrix.enabled=false`, `styleEditor.enabled=false`, `tldrPanel.enabled=false`, `customExternalAPI.enabled=false`, and other Style-like prototypes default-off.
- Do not promote planned features such as TLDR real provider summary, Custom External API response-to-note / credential management / automatic enrichment, Backlinks semantic search/writeback/cross-library sync, or real annotation mutation.

## Worktree Groups

| Group | Scope | Commit intent |
| --- | --- | --- |
| Custom External API opt-in preview | `src/features/custom-external-api.js`, `src/app/feature-composer.js`, Custom External API tests and scenario | Capture default-off Item Pane opt-in endpoint invocation preview with allowlisted metadata POST and no Zotero data mutation |
| AI provider contract | `src/services/ai-provider-contract.js`, service exports, targeted service/composer tests | Retain no-network TLDR path and add Custom External API allow-network provider gated by pref + endpoint |
| TLDR local preview | `src/features/tldr-panel.js`, TLDR tests and scenario | Preserve default-off local Item Pane no-network TLDR preview without real provider calls or Zotero data mutation |
| Retained Style prototypes | Style Editor / Paper Matrix / Attachment Version / Backlinks / Merge Annotations runtime and scenarios | Preserve completed default-off prototype baselines without reopening their runtime scope |
| Truth and evidence | `docs/CURRENT_BACKLOG.md`, project wave/validation overrides, surface evidence, status docs, current-truth mirrors, docs consistency tests | Capture Custom External API current truth, release freeze, readiness blockers, and merge-ready documentation state |

## Excluded From Commit Scope

- Regenerated `dist/`, `.zotero-runtime/`, and Obsidian handoff artifacts remain untracked/ignored.
- No remote release artifact is uploaded or verified during this cleanup.
- No visual baseline update is run as part of the freeze cleanup; existing baseline file changes are treated as retained evidence from earlier completed waves.
- No unrelated user work outside the listed groups is reverted.

## Verification Plan

Before final sign-off, run:

```bash
npm run docs:sync-current-truth -- --check
node --input-type=module -e "import './tests/features/test-tldr-panel.js'; import './tests/services/test-ai-provider-contract.js'; import './tests/feature-composer.test.js'; import './tests/docs-consistency.test.js'; const { runTests } = await import('./tests/test-framework.js'); await runTests();"
node --input-type=module -e "import './tests/features/test-custom-external-api.js'; import './tests/services/test-ai-provider-contract.js'; import './tests/features/test-tldr-panel.js'; import './tests/feature-composer.test.js'; import './tests/docs-consistency.test.js'; const { runTests } = await import('./tests/test-framework.js'); await runTests();"
npm run zotero:scenario -- --addon-pref customExternalAPI.enabled=true --addon-pref customExternalAPI.endpoint=http://127.0.0.1:0/toolsbox --scenario-file custom-external-api-opt-in.scenario.js --scenario "custom external api opt-in workflow"
npm run agent:check
npm run agent:zotero:e2e -- --no-ui-capture
npm run agent:monitor
npm run agent:gate
npm run agent:sync
```

If watch freshness expires during gate, refresh with `npm run zotero:watch` until startup health passes, then stop the long-running process.
