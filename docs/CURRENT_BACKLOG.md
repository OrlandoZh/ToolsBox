# ToolsBox 当前单一事实源

**更新时间**: 2026-05-30
**本轮主线**: `ZOTERO-STYLE-ABSORPTION-WAVE-001`（已收口）+ `P0-INFRASTRUCTURE-TEST-COVERAGE-WAVE-001`（推进中）
**核心目标**: zoterostyle 功能吸收已收口（35+ features + 13 tests = 1729/1729 ✅）；本波推进核心基础设施测试覆盖（reader / menu-manager / item-pane）

---

## 当前单一事实源

本节是当前项目态的唯一 truth。消费者文档只同步 marker block，不维护第二份完成度结论。

<!-- CURRENT-TRUTH-SUMMARY:START -->
当前主线为 `STYLE-CUSTOM-EXTERNAL-API-OPT-IN-WORKFLOW-WAVE-001`：在用户已要求“先冻结发布”的边界内，推进 `Custom External API` default-off opt-in endpoint invocation preview prototype。本波只在 `customExternalAPI.enabled=true` 且 `customExternalAPI.endpoint` 非空的 isolated scenario / 手动验收中注册 `toolsbox-custom-external-api` Item Pane section；section 只展示本地 item metadata/request preview、endpoint host 与手动 `Run` button。只有用户点击按钮后才向配置 endpoint 发送一次 `invokeExternal` POST JSON 请求，并只渲染响应预览。当前 active expansion wave: `STYLE-CUSTOM-EXTERNAL-API-OPT-IN-WORKFLOW-WAVE-001`；验收主线: `default-off-custom-external-api-opt-in-endpoint-workflow`。

发布冻结继续有效且优先级不变：冻结未解除前禁止执行 `gh release create`、`gh release upload`、真实远端 asset mutation、`npm run release:preflight -- --verify-remote`、`npm run agent:gate:release`，也不改 git remote 或 `config/addon.config.json` 的 `updateURL`。`RELEASE-REMOTE-DISTRIBUTION-WAVE-001` 已完成安全 readiness 检查但未执行发布；上一波 `RELEASE-FREEZE-WAVE-001` 与 `STYLE-CLOSURE-AND-RELEASE-PREFLIGHT-WAVE-001` 的本地 release artifacts、plan-only upload checklist、HTTP `404` readiness blocker、GitHub CLI 未登录状态和 origin / release config mismatch 只作为 retained release background；本波不继续三选一远端发布决策。

已收敛并继续保留的实现口径：`createFeatureComposer({ ..., zotero })` 支持可注入 Zotero 依赖；生产默认继续读 `globalThis.Zotero`。Style-like 直接注册项全部通过显式 pref gate 控制，`annotationColumn.enabled` 是 canonical key，`annotationDistributionColumn.enabled` 仅保留 legacy fallback。缺省未显式开启时，直接 Style prototype 不应注册，也不在偏好设置面板中表现为已可用功能。

Custom External API 当前实现口径：`customExternalAPI.enabled=false` 与 `customExternalAPI.endpoint=""` 继续是默认值，不新增 preference pane 控件。显式启用且 endpoint 非空后才注册 `toolsbox-custom-external-api` Item Pane section；`onRender` 渲染 owner-tagged loading shell，`onAsyncRender` 读取当前 item 的本地 `itemID/key/title/itemType/abstract/doi/tags` metadata 并展示 request preview。手动点击 `.toolsbox-custom-external-api-run-button` 后才调用 `custom/external-api` provider 的 `invokeExternal` capability，POST JSON 固定为 `schemaVersion: 1`、`capability: "invokeExternal"`、`consumer: "customExternalAPI"` 与 allowlisted payload；响应只渲染 status、HTTP status、response preview 与 `networkUsed=true/false`。本波不读取 PDF 全文，不发送 notes/annotations/attachment bytes，不保存 response，不写 Zotero item / note / annotation / attachment，不接 TLDR real summary，不新增 provider key 管理或偏好设置面板入口。

AI provider contract 现在扩展为当前 wave 的 runtime 基座：`noop/mock-local` 继续服务 `TLDR` no-network local preview，`summarizeItem` 仍不联网；新增 `custom/external-api` provider 只支持 `invokeExternal`，只有 `networkPolicy="allow-network"`、`customExternalAPI.enabled=true`、endpoint 非空且合法时才可调用。缺 provider、缺 endpoint、invalid endpoint、pref disabled、timeout、fetch error 都返回稳定 disabled/unavailable/error result，不 throw。

TLDR 现在降为历史 baseline：`tldrPanel.enabled=false` 继续是默认值，不新增 preference pane 控件。显式启用后才注册 `toolsbox-tldr-panel` Item Pane section；`onRender` 渲染 owner-tagged loading shell，`onAsyncRender` 读取本地 metadata 并通过 `noop/mock-local` provider 返回 unavailable/mock result。该 section 展示 request preview、metadata preview、provider status、`networkUsed=false` 与 mock summary preview；不生成真实摘要、不读取 PDF 全文、不请求 OpenAI / custom endpoint、不保存 provider key、不写 Zotero item / note / annotation / attachment。

Style Editor 现在降为历史 baseline：复用现有 `styleEditor.enabled` 与 `styleEditor.css` pref；`styleEditor.enabled=false` 时完全不注册 command / window。显式启用后注册 `toolsbox-style-editor` command，打开 ToolsBox-owned standalone window shell，编辑、Preview、Save、Reset 均围绕本地 `styleEditor.css` pref 工作。Save / Reset 只写 pref，不写文件，不写 Zotero item / note / annotation / attachment；CSS 只注入 ToolsBox-owned scoped root，不 patch Zotero host document。

Paper Matrix Enhanced 现在降为历史 baseline：`paperMatrix.enabled=false` 继续是默认值；`paper matrix enhanced local workflow` 已证明显式启用时复用既有 `toolsbox-paper-matrix` standalone window shell，展示本地只读 enhanced payload、enhanced filters、enhanced columns，并证明不修改 Zotero item / note / annotation / attachment。本波不重新打开 Paper Matrix runtime，不把增强模式升格为默认开启或偏好设置面板入口。

Attachment Version 现在降为历史 baseline：`attachmentVersion.enabled=false` 继续是默认值，不新增偏好面板可操作入口；显式启用时才注册 `toolsbox-attachment-version` Item Pane section。该 prototype 只读取本地 Zotero item / attachment metadata：选中 regular item 时列出 child attachments；选中 attachment 时列出同 parent 下的 sibling attachments 并标记当前选中项。渲染只使用 owner-tagged DOM，重复 render 清理旧节点，`cleanup()` / `destroy()` 幂等 unregister section。它不切换附件、不覆盖文件、不删除附件、不重命名附件、不创建 note、不改 annotation、不接网络/AI。`attachment version enabled preview workflow` scenario 已作为 retained evidence 证明 enabled workflow 可走。

Backlinks functional scope 已收口并保持历史 baseline：开发验收用 `zotero:scenario -- --addon-pref backlinks.enabled=true` pref 注入已证明默认 pref 未开启时 Backlinks section 不注册；显式开启时 live Item Pane local graph/list 与 `.toolsbox-backlinks-drilldown-button` 可选择来源条目，并保持 item fields 与 relations 不变。默认仍为 `backlinks.enabled=false`，不写 Zotero relation，不修改 item/note/annotation 数据，不调用网络，不接 AI。核心 helpers 保持为 `collectBacklinksForItemAsync`、`buildBacklinkGraphForItem` 与 `selectBacklinkSource`。

Merge Annotations 继续作为历史 baseline：已完成本地 annotation 合并预览、ToolsBox 自有 child note writeback/upsert workflow，以及 enabled real Zotero Item Pane button E2E 证据；默认仍为 `mergeAnnotations.enabled=false`，不修改真实 annotation。

Default-off / planned truth 更新为：`Custom External API` 已推进到 opt-in endpoint invocation preview prototype，但默认仍为 `customExternalAPI.enabled=false` 且 endpoint 默认为空，不在 preference pane 暴露为用户可操作项。`TLDR` 已推进到 local no-network Item Pane preview prototype，但真实 TLDR AI summary、provider key management、OpenAI/custom endpoint summary generation 仍是后续独立 wave。`docs/evidence/STYLE_FEATURE_MATRIX.md` 继续作为 feature matrix / evidence 索引，不替代 current truth。Backlinks semantic search / relation writeback / cross-library sync 继续排后。AI enrichment 与其它未完成能力保持 `planned/default-off`，不把缺 API key 当作本轮主阻断。

已收敛的高风险 surface truth：Collection DOM patch、Reader `_iframeWindow`、margin annotation、PDF background 等能力保持 prototype / default-off；已补 availability guard、owner-tagged DOM、幂等 cleanup / destroy 与 lifecycle cleanup。Attachment Preview（`attachmentPreview.enabled=true`）已吸收自 Toolbox/zoterostyle 的 sidePanelArgs + render hijack 侧栏 PDF 预览实现，默认启用。本波不重新打开 Collection DOM patch / Reader / margin annotation / PDF background 这些 surface，不做 host surface 大重写，不把其它 prototype 升格为默认开启或 beta 可用入口。

当前 release-only 历史线 `ENG-HIGH-104 / ENG-LOW-211~213` 已冻结在远端 readiness 之后；真实闭环仍取决于用户解冻、远端仓库 / 认证 / asset 上传确认。`ENG-HIGH-103`、`READER-HIGH-124 / READER-LOW-261~263`、`READER-HIGH-125`、`READER-HIGH-126`、`HOST-HIGH-201 / HOST-LOW-301~303`、`ZOTERO-HOST-POLISH-WAVE-001`、`OPTIONAL-BUNDLE-WAVE-001` 均只作为历史 contract / mirror 背景保留，不覆盖当前 no-network AI provider contract + release freeze 口径。

`P2` 上下文感知记忆与趋势层深化已完成并保留为背景；Style acceptance truth、默认关闭策略、测试链、Backlinks local prototype、Merge Annotations local preview、default-off note writeback workflow、enabled Merge Annotations writeback E2E、enabled Backlinks local graph/drilldown E2E、Backlinks full UI visual evidence 分类、Zotero 真机验收闭环、release local preflight、release freeze closure、feature matrix、default-off local Attachment Version prototype、Paper Matrix Enhanced local field/filter/sort preview、Style Editor local CSS prototype、AI provider no-network contract 与 TLDR local Item Pane no-network preview 已作为历史基线收口。历史 Style waves retained: `STYLE-PROTOTYPE-HARDENING-WAVE-001`、`STYLE-BACKLINKS-LOCAL-WAVE-001`、`STYLE-MERGE-ANNOTATIONS-PREVIEW-WAVE-001`、`STYLE-MERGE-ANNOTATIONS-WRITEBACK-WAVE-001`、`STYLE-MERGE-ANNOTATIONS-WRITEBACK-E2E-WAVE-001`、`STYLE-BACKLINKS-LOCAL-GRAPH-E2E-WAVE-001`、`STYLE-BACKLINKS-VISUAL-EVIDENCE-CLOSURE-WAVE-001`、`STYLE-CLOSURE-AND-RELEASE-PREFLIGHT-WAVE-001`、`RELEASE-FREEZE-WAVE-001`、`STYLE-FEATURE-MATRIX-AND-ATTACHMENT-VERSION-WAVE-001`、`STYLE-ATTACHMENT-VERSION-ENABLED-E2E-WAVE-001`、`STYLE-PAPER-MATRIX-ENHANCED-LOCAL-WAVE-001`、`STYLE-EDITOR-LOCAL-CSS-PROTOTYPE-WAVE-001`、`STYLE-AI-PROVIDER-CONTRACT-NO-NETWORK-WAVE-001`、`STYLE-TLDR-LOCAL-ITEM-PANE-PROTOTYPE-WAVE-001`。本波不追 `zotero-style` 100% 复刻，只补 Custom External API default-off opt-in endpoint invocation preview prototype。
<!-- CURRENT-TRUTH-SUMMARY:END -->

<!-- CURRENT-TRUTH-META:START -->
{
  "activeBatchId": "STYLE-CUSTOM-EXTERNAL-API-OPT-IN-WORKFLOW-WAVE-001",
  "currentWaveName": "STYLE-CUSTOM-EXTERNAL-API-OPT-IN-WORKFLOW-WAVE-001",
  "acceptanceTrack": "default-off-custom-external-api-opt-in-endpoint-workflow"
}
<!-- CURRENT-TRUTH-META:END -->

---

## 本轮验收标准

本轮“完成”表示 `Custom External API` default-off opt-in endpoint invocation preview prototype 已可注册、可渲染、可清理、可在真实 Zotero scenario 中显式启用验证：默认关闭或 endpoint 为空时无可见 surface；显式 pref 注入时 live Item Pane 手动按钮向本地 loopback endpoint 发送一次 allowlisted metadata POST，并只展示 response preview。它不表示 TLDR real summary、自动 enrichment、response-to-note、credential management、远端 `update.json` / `update_link` 真实分发闭环已经完成。

1. `customExternalAPI.enabled=false`、`customExternalAPI.endpoint=""`、`tldrPanel.enabled=false` 保持默认值。
2. 不新增偏好设置面板可操作入口，不把 Custom External API / TLDR 升格为默认开启或 beta opt-in。
3. `createCustomExternalAPI` 只在 `customExternalAPI.enabled=true` 且 endpoint 非空合法时注册 `toolsbox-custom-external-api` Item Pane section；默认关闭或 endpoint 缺失时不注册、不显示。
4. Custom External API section 只读取本地 item `itemID/key/title/itemType/abstract/doi/tags` metadata；不读取 PDF 全文，不发送 notes/annotations/attachment 文件内容。
5. 请求只在用户点击 `.toolsbox-custom-external-api-run-button` 后发出；POST JSON 只包含 `schemaVersion`、`capability`、`consumer` 与 allowlisted payload。
6. `custom/external-api` provider 只支持 `invokeExternal`；只有 `networkPolicy="allow-network"`、pref enabled、endpoint 非空合法时可调用。
7. `noop/mock-local` 与 TLDR `summarizeItem` no-network path 保持 fetch-free，`networkUsed=false`。
8. 响应只渲染 status、HTTP status、response preview、`networkUsed=true/false`；失败、timeout、invalid endpoint、missing endpoint 都稳定显示 unavailable/error state，不 throw。
9. 不保存 response，不创建 note，不写 Extra/tags，不修改 item/note/annotation/attachment，不重构 `aiGenerateTags` / `aiGenerateRemark` 主流程。
10. Paper Matrix Enhanced / Attachment Version / Backlinks / Merge Annotations / Style Editor runtime 不在本波重开；其它 Style-like prototype 默认关闭策略保持不变。
11. 发布冻结继续有效：禁止执行 `gh release create`、`gh release upload`、真实远端 asset mutation、`npm run release:preflight -- --verify-remote`、`npm run agent:gate:release`。
12. 不改 git remote，不改 `config/addon.config.json` 的 `updateURL`，不做 `OrlandoZh/ToolsBox` / `OrlandoZh/AddonTemplate4Z` / 其它远端三选一发布决策。
13. 本轮验证以 targeted Custom External API / AI provider contract / TLDR / feature-composer / docs-consistency、docs sync、enabled Zotero scenario、`agent:check`、no-ui E2E、dev monitor / gate / sync 为主；不刷新视觉 baseline。
14. 只有用户明确解冻并确认目标远端与认证方式后，才恢复 remote distribution closure。

本波 Custom External API opt-in workflow fresh evidence 已刷新并通过：

- Targeted Custom External API / AI provider contract / feature-composer / zotero-script tests 已通过；`33/33`。
- Combined Custom External API / AI provider contract / TLDR / feature-composer / docs-consistency tests 已通过；`35/35`。
- Scenario listing 通过；`npm run zotero:scenario -- --scenario-file custom-external-api-opt-in.scenario.js --list-scenarios` 列出 `custom external api opt-in workflow`。
- Default-off scenario 通过；未注入 pref 时 `customExternalAPI.enabled=false` 或 endpoint empty，`toolsbox-custom-external-api` section 不注册。
- Enabled scenario 通过；`npm run zotero:scenario -- --addon-pref customExternalAPI.enabled=true --addon-pref customExternalAPI.endpoint=http://127.0.0.1:0/toolsbox --scenario-file custom-external-api-opt-in.scenario.js --scenario "custom external api opt-in workflow"` 为 `1/1` passed，runner 启动本地 loopback endpoint，live Item Pane button 发出 1 次 POST，`networkUsed=true`，item snapshot unchanged。
- `npm run docs:sync-current-truth -- --check` 通过；current truth marker blocks in sync。
- `npm run agent:check` 通过；full test 链单轮结束，`1623/1623`。
- `npm run agent:zotero:e2e -- --no-ui-capture` fresh 通过；2 cycles，scenario failed `0`，runtime log error `0`，visual drift `0`，DOM contract `passed`。
- `npm run zotero:watch` startup health fresh 通过；watch status `healthy`，随后停止常驻 watch。
- `npm run agent:monitor` fresh 生成；validation level 为 `visual-not-needed`，aggregate monitor 仍保留两条早前 failed check 历史 run，但当前 gate 不受阻断。
- `npm run agent:gate` fresh 通过；gate issues `[]`，validation level 为 `visual-not-needed`。
- `npm run agent:sync` fresh 通过；gate chain、agent-context、Obsidian handoff、evidence chain 与 strict Obsidian guard aligned。

发布冻结前的 remote distribution readiness 已刷新，当前结论是 retained blocker / frozen，不再继续推进：

- Local release artifacts 已就绪：`dist/toolsbox-0.1.0.xpi`、`dist/update.json`、`dist/release-manifest.json`、`dist/release-preflight.json`、`dist/release-plan.json`、`dist/release-matrix.json`。
- Release identity 对齐：addonId `toolsbox@orlandozh.github`，version `0.1.0`，updateURL `https://github.com/OrlandoZh/ToolsBox/releases/download/release/update.json`，update_link `https://github.com/OrlandoZh/ToolsBox/releases/download/release/toolsbox-0.1.0.xpi`。
- `curl -sI https://github.com/OrlandoZh/ToolsBox/releases/download/release/update.json` 返回 HTTP `404`。
- `curl -sI https://github.com/OrlandoZh/ToolsBox/releases/download/release/toolsbox-0.1.0.xpi` 返回 HTTP `404`。
- `curl -sI https://github.com/OrlandoZh/ToolsBox` 返回 HTTP `404`；目标仓库在未登录视角下不可见或不存在。
- `gh` CLI 可用；路径为 `/opt/homebrew/bin/gh`。
- `gh auth status -h github.com` 显示未登录，不能执行 authenticated release upload。
- 当前 `git remote -v` 指向 `https://github.com/OrlandoZh/AddonTemplate4Z.git`，与 release config 指向的 `OrlandoZh/ToolsBox` 不一致。
- 未运行 `npm run release:preflight -- --verify-remote`，避免在未上传前用预期 404 覆盖本地 passed preflight。
- 未运行 `npm run agent:gate:release`，因为 release matrix 仍为 `attention`，远端 verification pending。

上一波 closure / release preflight 已刷新并收口到本地 plan-only 边界：

- `npm run docs:sync-current-truth -- --check` 通过。
- Combined targeted Backlinks / feature-composer / docs-consistency tests 通过；`27/27`。
- `npm run agent:check` 通过；full test 链单轮结束，`1582/1582`。
- 首次 `npm run agent:gate` 因 watch stale 失败；`npm run zotero:watch` 已刷新 startup health，watch status `健康`，startup error/warning `0/0`，随后手动停止常驻 watch。
- `npm run agent:monitor` fresh 通过；failed `0`。
- `npm run agent:gate` fresh 通过；gate issues `[]`，validation level `visual-recommended` 且非阻断。
- `npm run agent:sync` fresh 通过；gate chain、agent-context、Obsidian handoff、evidence chain 与 strict Obsidian guard aligned。
- `npm run release:plan` 通过；生成 `dist/toolsbox-0.1.0.xpi`、`dist/update.json`、`dist/release-manifest.json`、`dist/release-preflight.json`、`dist/release-plan.json`、`dist/release-matrix.json` 与 release notes。
- Release artifact identity 对齐：addonId `toolsbox@orlandozh.github`，version `0.1.0`，updateURL `https://github.com/OrlandoZh/ToolsBox/releases/download/release/update.json`，update_link `https://github.com/OrlandoZh/ToolsBox/releases/download/release/toolsbox-0.1.0.xpi`，XPI SHA256 `6aa361482f60bb62412b5678f359b6951d3b0b2d2a92041c97ad8c8165f7b965`。
- `npm run release:upload -- --provider github-release --release-tag release --target-base-url https://github.com/OrlandoZh/ToolsBox/releases/download/release/` 通过；`dist/release-upload-plan.json` status `passed`，`executionMode="plan-only"`，`networkActionsPerformed=false`。
- `dist/release-matrix.json` 为 `attention`；stable / beta profile 均待补远端验证。这是冻结期间保留的 release readiness debt，不阻断当前 freeze closure。
- `npm run agent:gate:release` 未运行；冻结期间也不运行，避免把 release gate 变成当前主线。

上一波 Backlinks visual evidence closure 已刷新并分类：

- `npm run docs:sync-current-truth -- --check` 通过。
- Combined targeted Backlinks / feature-composer / docs-consistency tests 通过；`27/27`。
- `npm run agent:zotero:e2e` 完整 UI capture 已执行；tests `3/3`、scenario `31/31`、runtime error `0`，视觉层报告 Reader / surface-local drift 与尺寸差异。
- `npm run agent:zotero:e2e -- --no-ui-capture` fresh 通过；2 cycles，scenario failed `0`，runtime error `0`，Backlinks default-off branch 两轮均为 `sectionRegistered=false`。
- Surface smoke / DOM contract 佐证通过；`item pane DOM contract advisory`、`preference pane surface smoke`、`library item pane surface smoke` 与 `reader surface smoke` 均 passed。
- 本波不运行 `npm run agent:zotero:e2e:update-baseline`；视觉差异记录为 `visual-recommended` 非阻断 debt。
- `npm run zotero:watch` startup health fresh 通过；watch status `healthy`，startup error/warning `0/0`，随后手动停止常驻 watch。
- `npm run agent:monitor` fresh 通过；`12/12`，watch healthy，E2E fresh，failed `0`。
- `npm run agent:gate` fresh 通过；gate issues `[]`，validation level `visual-recommended` 且非阻断。
- `npm run agent:sync` fresh 通过；gate chain、agent-context、Obsidian handoff、evidence chain 与 strict Obsidian guard aligned。

上一波 Backlinks local graph/drilldown fresh 证据已刷新并收口：

- Scenario listing 通过；`npm run zotero:scenario -- --scenario-file backlinks-local-graph.scenario.js --list-scenarios` 列出 `backlinks local graph drilldown workflow`。
- Enabled graph/drilldown scenario 通过；`npm run zotero:scenario -- --addon-pref backlinks.enabled=true --scenario "backlinks local graph drilldown workflow"` 为 `1/1` passed，mode 为 `enabled-local-graph-drilldown`，点击 `.toolsbox-backlinks-drilldown-button` 后 selectedIDs 命中来源条目且 `itemSnapshotsUnchanged=true`。
- Default-off branch 通过；未注入 pref 时 `backlinks.enabled=false`，`toolsbox-backlinks` section 不注册。
- Combined targeted Backlinks / feature-composer / docs-consistency tests 通过；`27/27`。
- `npm run docs:sync-current-truth -- --check` 通过；current truth marker blocks in sync。
- `npm run agent:check` 通过；full test 链单轮结束，`1582/1582`。
- `npm run agent:zotero:e2e -- --no-ui-capture` fresh 通过；2 cycles，cycle tests `3/3`，scenario `31/31` each cycle，scenario failed `0`，runtime log error `0`，visual capture skipped by flag。
- `npm run zotero:watch` startup health fresh 通过；watch status `healthy`，startup error/warning `0/0`，随后手动停止常驻 watch。
- `npm run agent:monitor` fresh 通过；`12/12`，watch healthy，E2E fresh，failed `0`。
- `npm run agent:gate` fresh 通过；gate issues `[]`，validation level `visual-recommended` 且非阻断。
- `npm run agent:sync` fresh 通过；gate chain、agent-context、Obsidian handoff、evidence chain 与 strict Obsidian guard aligned。

上一波基线 fresh 证据：

- Targeted feature-composer / build tests 通过。
- `npm test` 单轮通过。
- `npm run agent:check` 通过，并重建当前仓库 fresh agent-run telemetry。
- `npm run agent:zotero:e2e` 通过；两轮场景失败 `0`、视觉漂移 `0`、capability 覆盖 `11/11`。
- `npm run agent:monitor` 与 `npm run agent:gate` 通过；gate issues 为空。
- `npm run agent:sync` 已刷新 gate chain、agent-context、Obsidian handoff 与 evidence chain。

上一波 Backlinks local prototype 证据已刷新并收口：

- Targeted Backlinks test 通过；`tests/features/test-backlinks.js` 为 `9/9`。
- Targeted feature-composer test 通过；`7/7`，覆盖 default-off / enabled registration / lifecycle cleanup。
- Targeted docs-consistency test 通过；combined targeted Backlinks / feature-composer / docs-consistency 为 `22/22`。
- `npm run docs:sync-current-truth -- --check` 通过。
- `npm test` 单轮通过，`1557/1557`。
- 当前完整 `npm run check` 通过，`1557/1557`。
- E2E harness targeted test 通过；`2/2`。
- `npm run agent:zotero:e2e -- --no-ui-capture` fresh 通过；两轮场景失败 `0`、runtime error `0`、DOM contract `passed`、capability `11/11`。完整 UI capture 曾出现 Reader focus / activation brightness 类视觉漂移；在当前 `visual-recommended` 级别下作为后续建议项，不阻断本波 default-off Backlinks 功能闭环。
- `npm run zotero:watch` startup health fresh 通过；watch 证据进入 gate。
- `npm run agent:monitor` 与 `npm run agent:gate` fresh 通过；gate blocker `0`。
- `npm run agent:sync` 已刷新 gate chain、agent-context、Obsidian handoff 与 evidence chain。

上一波 Merge Annotations local preview fresh 证据已刷新并收口：

- Targeted Merge Annotations test 通过；`tests/features/test-merge-annotations.js` 为 `10/10`。
- Targeted feature-composer test 通过；`7/7`，覆盖 default-off / enabled registration / lifecycle cleanup。
- Targeted docs-consistency test 通过；`6/6`，combined targeted Merge Annotations / feature-composer / docs-consistency 为 `23/23`。
- `npm run docs:sync-current-truth -- --check` 通过；current truth marker blocks in sync。
- `npm run agent:check` 通过；full test 链单轮结束，`1567/1567`。
- `npm run agent:zotero:e2e -- --no-ui-capture` fresh 通过；2 cycles，cycle tests `3/3`，scenario `29/29` each cycle，scenario failed `0`，runtime log error `0`，visual drift `0`，DOM contract `passed`，scenario-bound capability `11/11`。
- `npm run zotero:watch` startup health fresh 通过；watch status 为 healthy，随后手动停止常驻 watch。
- `npm run agent:monitor` fresh 通过；failed `0`。
- `npm run agent:gate` fresh 通过；gate issues `[]`，validation level 仍为 `visual-recommended` 且非阻断。
- `npm run agent:sync` fresh 通过；gate chain、agent-context、Obsidian handoff、evidence chain 与 strict Obsidian guard aligned。

上一波 Merge Annotations note writeback fresh 证据已刷新并收口：

- Targeted Merge Annotations writeback test 通过；`tests/features/test-merge-annotations.js` 为 `15/15`。
- Targeted feature-composer test 通过；`7/7`，覆盖 default-off / enabled registration / lifecycle cleanup。
- Targeted docs-consistency test 通过；`6/6`，combined targeted Merge Annotations / feature-composer / docs-consistency 为 `28/28`。
- `npm run docs:sync-current-truth -- --check` 通过；current truth marker blocks in sync。
- `npm run agent:check` 通过；full test 链单轮结束，`1572/1572`。
- `npm run agent:zotero:e2e -- --no-ui-capture` fresh 通过；2 cycles，cycle tests `3/3`，scenario `29/29` each cycle，scenario failed `0`，runtime log error `0`，visual drift `0`，DOM contract `passed`，scenario-bound capability `11/11`。
- `npm run zotero:watch` startup health fresh 通过；watch status 为 healthy，随后手动停止常驻 watch。
- `npm run agent:monitor` fresh 通过；failed `0`。
- `npm run agent:gate` fresh 通过；gate issues `[]`，validation level 仍为 `visual-recommended` 且非阻断。
- `npm run agent:sync` fresh 通过；gate chain、agent-context、Obsidian handoff、evidence chain 与 strict Obsidian guard aligned。

本波 Merge Annotations enabled writeback E2E fresh 证据已刷新并收口：

- Scenario listing 通过；`npm run zotero:scenario -- --scenario-file merge-annotations-writeback.scenario.js --list-scenarios` 列出 `merge annotations enabled writeback workflow`。
- Enabled writeback scenario 通过；`npm run zotero:scenario -- --addon-pref mergeAnnotations.enabled=true --scenario "merge annotations enabled writeback workflow"` 为 `1/1` passed，并走 live Item Pane button create/update 同一个 ToolsBox merge note。
- Default-off 同名 scenario 通过；未注入 pref 时 `mergeAnnotations.enabled=false` 分支保持 section 不注册。
- Combined targeted ItemPane / Merge Annotations / feature-composer / zotero-script / docs-consistency tests 通过；`46/46`。
- `npm run docs:sync-current-truth -- --check` 通过；current truth marker blocks in sync。
- `npm run agent:check` 通过；full test 链单轮结束，`1577/1577`。
- `npm run agent:zotero:e2e -- --no-ui-capture` fresh 通过；2 cycles，report status `passed`，issues `[]`。
- `npm run zotero:watch` startup health fresh 通过；watch status 为 healthy，随后手动停止常驻 watch。
- `npm run agent:monitor` fresh 通过；failed `0`。
- `npm run agent:gate` fresh 通过；gate issues `[]`，validation level 仍为 `visual-recommended` 且非阻断。
- `npm run agent:sync` fresh 通过；gate chain、agent-context、Obsidian handoff、evidence chain 与 strict Obsidian guard aligned。

---

## Style Prototype Inventory

### 可测试 prototype / 已有基础实现

| 能力 | 当前口径 | 默认状态 |
| --- | --- | --- |
| Reading Time Column | 本地列 prototype，需 host 验收 | default-off |
| Annotation Column | `annotationColumn.enabled` canonical，legacy fallback 兼容 | default-off |
| Cited Count Column | 读取本地缓存/Extra 的 prototype，不声明远端引用 API 闭环 | default-off |
| IF Column | 本地字段解析 prototype | default-off |
| Collection Item Count / Sort / Favorite | Collection DOM patch prototype；本波补 owner-tag / idempotent cleanup | default-off |
| Attachment Preview | sidePanelArgs + render hijack，`<attachment-preview>` XUL 在右侧栏渲染 PDF；支持 library/reader 双 context、sidePanelArgs 注册、render hijack 注入按钮、event delegation 点击处理、自动条目选择刷新、垂直连续滚动、zoom 控制、iframe CSS 注入与幂等 cleanup。渲染只使用 Zotero 内建 attachment-preview 元素，不打开外部网络连接。 | enabled |
| Margin Annotation / PDF Background | Reader prototype；本波补 frame resolver / unavailable / destroy 恢复 | default-off |
| Backlinks | 本地只读反向链接 graph/drilldown prototype；显式引用扫描、async Item Pane 渲染、来源条目选择，不做远端/AI/relation 写回 | default-off |
| Merge Annotations | 已有本地 annotation 合并预览 + ToolsBox 自有 child note writeback workflow；已补 enabled 真实 Zotero Item Pane writeback/upsert E2E 证据，不修改真实 annotation | default-off |
| Attachment Version | 本地只读 attachment version preview prototype；显式启用后注册 Item Pane section，读取 child/sibling attachment metadata，不做切换/覆盖/删除/写回 | default-off |
| Paper Matrix Enhanced | 本地只读 standalone Paper Matrix enhanced payload；显式启用后展示新增字段、筛选与排序，不写 item/note/annotation/attachment | default-off |
| Style Editor | 本地 CSS standalone window prototype；显式启用后编辑/预览/保存 `styleEditor.css`，CSS 只注入 ToolsBox-owned scoped root | default-off |
| TLDR | 本地只读 Item Pane no-network preview prototype；显式启用后展示 metadata/request preview 与 unavailable/mock result，不发网络请求 | default-off |
| Custom External API | 本地 Item Pane opt-in endpoint invocation preview prototype；显式启用且 endpoint 非空后手动点击发送 allowlisted metadata POST，只渲染 response preview，不写 Zotero 数据 | default-off |
| AI Provider Contract | TLDR no-network + Custom External API opt-in provider contract；`summarizeItem` 继续 no-network，`invokeExternal` 仅 allow-network + enabled + endpoint 时可调用 | internal/default-off |
| Sidebar Toggle / Tab Manager / View Groups / Graph View | prototype，可单测，不作为已完整复刻 | default-off |
| Research Workflow / Workbench | 当前已注册主线能力，继续按既有 contract 验收 | enabled |

### Planned / Default-off

| 能力 | 当前口径 |
| --- | --- |
| TLDR real AI summary | planned/default-off；已有 local no-network preview，未实现真实 provider / key / summary generation |
| Custom External API response-to-note / credential management / automatic enrichment | planned/default-off；本波只做 opt-in response preview |
| AI Generate Tags / Remark | default-off；缺 API key 不是本轮主阻断 |

---

## 验证命令

本轮验证只允许本地非发布检查；不执行远端上传、远端 verify、release gate 或 visual baseline 更新：

```bash
npm run docs:sync-current-truth -- --check
node --input-type=module -e "import './tests/features/test-custom-external-api.js'; import './tests/services/test-ai-provider-contract.js'; import './tests/features/test-tldr-panel.js'; import './tests/feature-composer.test.js'; import './tests/docs-consistency.test.js'; const { runTests } = await import('./tests/test-framework.js'); await runTests();"
npm run zotero:scenario -- --scenario-file custom-external-api-opt-in.scenario.js --list-scenarios
npm run zotero:scenario -- --addon-pref customExternalAPI.enabled=true --addon-pref customExternalAPI.endpoint=http://127.0.0.1:0/toolsbox --scenario-file custom-external-api-opt-in.scenario.js --scenario "custom external api opt-in workflow"
npm run agent:check
npm run agent:zotero:e2e -- --no-ui-capture
npm run agent:monitor
npm run agent:gate
npm run agent:sync
```

冻结期间显式禁止执行：

```bash
gh release create ...
gh release upload ...
npm run release:preflight -- --verify-remote
npm run agent:gate:release
npm run agent:zotero:e2e:update-baseline
```

如 watch 证据在 closure 检查中变 stale，再补跑：

```bash
npm run zotero:watch
```

本波不跑 `npm run agent:zotero:e2e:update-baseline`。冻结未解除前，不执行真实 release upload，也不运行 verify-remote 覆盖本地 passed preflight。

上一波 release readiness 与本地 preflight 命令只作为 retained baseline 参考，本波主验收以 freeze truth、mirror 同步和 dev gate 一致为准。

---

## ZOTERO-STYLE-ABSORPTION-WAVE-001（已收口）

本波完成了从 Toolbox/zoterostyle 的功能吸收与测试覆盖推进，不追 100% 复刻。

### Stage 0-3: Feature Absorption

- **Stage 0**: CodeGraph 初始化与索引（546 files, 8055 nodes, 7503 edges）
- **Stage 1**: 启用 10 个 default-off 功能 + 接线 nested-tags orphan（27/27 targeted tests）
- **Stage 2**: 新建 8 个 Item Tree 列：rating / tags / date-added / date-modified / read-status / creator / publication / remark
- **Stage 3**: 新建 5 个 UI 功能：add-tags / related-items / explore-panel / dark-light-button / title-translate
- **Integration**: 13 gates + 13 prefs + 13 force-sets 全部接入 feature-composer.js / addon.config.json / kernel.js

### Stage 4-5: Test Coverage + Review

- **Stage 4**: 13 个新测试文件全部接入 run-all.js
- **Stage 5**: Codex review → 发现 P2（测试未接入 runner）→ 已修复

### 验收证据

| 指标 | 结果 |
|------|------|
| 新 feature 源文件 | 13（8 columns + 5 UI）|
| 新测试文件 | 13 |
| 测试总数 | 1,729/1,729 passing（0 failures）|
| 集成关键点 | feature-composer.js（13 gates）、addon.config.json（13 prefs）、kernel.js（13 force-sets）|
| CodeGraph | 546 files, 8055 nodes, 7503 edges |
| Codex review | P2 发现（未接入 runner）→ 已修复 |
| docs:sync-current-truth | 已同步 |
| agent:gate | 已通过 |

### zoterostyle 覆盖率

| 前 | 后 |
|----|-----|
| 9 enabled + 26 default-off = 83% | 35+ enabled + 13 tested = ~92% visible |

### 本波约束（已遵守）

- 所有 prototype default-off，通过 `isPreferenceEnabled()` gate 控制
- 不使用 console.log（使用注入 logger）
- 所有 feature 有 `register()` + `cleanup()` 生命周期
- 不追 zotero-style 100% 复刻，clean-room 实现
- 发布冻结持续有效

---

## 历史状态

- `ENG-HIGH-104 / ENG-LOW-211~213` 已冻结在真实远端 `update.json` / `update_link` 分发闭环之前；当前 blocker 是用户已要求先冻结发布，目标远端仓库 / CLI auth / asset upload 尚未确认。
- `HOST-HIGH-201 / HOST-LOW-301~303` 与 `ZOTERO-HOST-POLISH-WAVE-001` 已完成并保留为 host-visible contract 背景。
- `READER-HIGH-123` 已完成唯一 Reader verdict，并转为历史契约源。
- `READER-HIGH-124 / READER-LOW-261~263`、`READER-HIGH-125`、`READER-HIGH-126` 的历史结论继续保留，但本轮不重新打开。
- 历史 baseline 命令 `npm run agent:zotero:e2e:update-baseline` 与 `2000x1200` 视觉上下文只作为旧验收记录，不作为当前 Style prototype 完成度声明。
