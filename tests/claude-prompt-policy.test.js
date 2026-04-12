import fs from "node:fs";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";

function readClaude() {
  return fs.readFileSync(path.resolve("CLAUDE.md"), "utf-8");
}

describe("Claude Prompt Policy", () => {
  it("should keep Codex and opencode lanes availability-gated instead of mandatory", () => {
    const claude = readClaude();

    [
      "`Codex 插件`、`opencode run`、`mco` 不能假设一定可用，只能在当前环境实际可调用时使用",
      "如当前环境已安装并允许调用 Claude Code 的 Codex 插件",
      "如当前环境已安装并允许调用 `opencode run`",
      "在“Codex / opencode / mco 这些具体工具链”层面不是完全通用，必须降级为“如果当前环境可用则启用”",
    ].forEach((snippet) => {
      assert.includes(claude, snippet);
    });

    [
      "优先调用 Claude Code 已安装的 Codex 插件。",
      "默认使用 `opencode run` 承担实际编写。",
      "Codex 插件一定可用",
      "opencode run 一定可用",
    ].forEach((snippet) => {
      assert.equal(
        claude.includes(snippet),
        false,
        `CLAUDE.md should not make tool availability mandatory: ${snippet}`,
      );
    });
  });

  it("should keep Codex write permission controlled and opencode write scope explicitly bounded", () => {
    const claude = readClaude();

    [
      "该 lane 默认仍以分析、审查、建议为主；但如本轮明确把它指定为 strict write owner，也可以在已声明 `scopePaths`、验收要求和写域边界内直接实现或收口关键改动。",
      "该 lane 只在 scope 明确时获得写权限，并且必须服从控制器给出的 `scopePaths`、验收要求和写域边界。",
      "架构与规划 lane",
      "实施与交付 lane",
      "默认只允许一个 strict write owner",
      "并发任务不能有重叠 `scopePaths`",
      "若架构与规划 lane 未被显式指定为 write owner，其输出默认是建议，不直接视为已落地",
      "worker 只在 `scopePaths` 内执行，不越权扩面，不代替控制器改策略，也不直接反问用户",
      "worker 回传至少包含：",
      "`status`",
      "`owner_role`",
      "`changed_files`",
      "`checks_run`",
      "`blockers`",
      "`next_action`",
      "未满足架构与规划前置条件时，不要由 Claude 自己直接生成最终计划、拆分和派工结论；应先让 Codex 产出架构与规划草案，再由控制器收口",
      "不要擅自假设外部 CLI 一定可写仓库。",
    ].forEach((snippet) => {
      assert.includes(claude, snippet);
    });

    [
      "该 lane 默认拥有仓库写权限。",
      "低逻辑 lane 默认拥有仓库写权限。",
      "Codex lane 可不受 `scopePaths` 限制直接改仓库。",
      "高逻辑 lane 的输出默认是已落地",
      "高逻辑 lane：",
      "低逻辑 lane：",
    ].forEach((snippet) => {
      assert.equal(
        claude.includes(snippet),
        false,
        `CLAUDE.md should keep write ownership constrained: ${snippet}`,
      );
    });
  });

  it("should keep repository orchestration ahead of direct Codex or opencode dispatch", () => {
    const claude = readClaude();

    [
      "如果 `config/agent-delegation-tasks.json` 已覆盖当前任务，或当前委派 manifest 已明确当前阶段由 Codex 的架构规划角色或 `opencode run` 的实施交付角色负责，默认先复用 `npm run agent:delegate:list` / `run` / `review` / `close`",
      "仓库已经有 `agent:delegate`、`monitor`、`gate`、`sync` 等编排入口时，优先复用，不要绕开",
      "只有仓库没有定义时，才采用你自己的通用控制器流程",
      "对当前模板，默认优先复用：",
      "`npm run agent:delegate:list`",
      "`npm run agent:delegate:run`",
      "`npm run agent:delegate:review`",
      "`npm run agent:delegate:close`",
      "运行 `npm run agent:monitor` 与 `npm run agent:gate`",
    ].forEach((snippet) => {
      assert.includes(claude, snippet);
    });
  });

  it("should keep scenario-based Codex/opencode default order and post-analysis mco escalation", () => {
    const claude = readClaude();

    [
      "若当前默认模型是 `qwen3.6-plus`，优先把它用于长上下文整合型任务，而不是把它当成默认架构主裁决者。",
      "若当前默认模型是 `qwen3.6-plus`，不要因为它上下文窗口大，就把复杂逻辑裁决、复杂实现或高风险架构判断默认交给它",
      "默认把它当成“长上下文整合器 + 视觉/证据归并器”，不是默认的复杂逻辑主裁决者，也不是默认的复杂实现主写者。",
      "先让 `qwen3.6-plus` 整理证据、上下文、候选约束",
      "再让 Codex 负责架构分析、规划、拆分和关键裁决",
      "中大型规划任务、拆阶段、`scopePaths` 切分、派工草案与验证蓝图，默认先交给 Codex 产出第一版，再由 Claude Code 控制器结合 truth 与仓库约束做最终裁决。",
      "架构与规划类任务默认先让 Codex 完成第一次蓝图 / review / root-cause 分析",
      "若任务本身是在做规划、拆阶段、`scopePaths` 切分、派工方案或验证计划，中大型场景默认先交给 Codex 形成第一版方案；Claude Code 不应先自己长时间独立拆分，再把 Codex 降成事后 review。",
      "routine implementation / docs / tests / shell-heavy work 默认优先通过 `Bash` 调用 `opencode run` 承担实现。",
      "`mco` 不是第一次分析入口。",
      "只有完成一次架构与规划分析后仍未收敛，或一次分析加一次定向修复后仍未收敛，才允许升级到 `mco`。",
      "若任务主要是在整理大量文档、会话、日志、scenario 结果、`monitor / gate / e2e` 工件，且目标是形成证据对齐、状态摘要、验证清单、风险列表，可优先让 `qwen3.6-plus` 处理。",
      "但这类输出默认只视为“整理结果”和“候选结论”，最终架构与策略判断仍由 Codex 或控制器确认。",
      "若本轮不走默认工具顺序，必须先在对用户的中间汇报里说明：",
      "如果是规划 / 拆分 / 派工任务，为什么不先交给 Codex",
      "不要因为 Claude Code 自带 `Read/Grep/Edit/Bash`，就在架构与规划类任务一开始跳过 Codex，或在实施与交付类任务一开始跳过 `opencode run`。",
      "不要在第一次架构与规划分析之前，直接把复杂问题升级到 `mco`。",
      "不要在中大型规划任务、拆阶段或 `scopePaths` 切分任务里，先让 Claude 自己长时间独立产出完整拆分方案，再把 Codex 只当成补充 review。",
      "不要因为它支持长上下文，就把复杂逻辑裁决或复杂编程实现默认交给它。",
    ].forEach((snippet) => {
      assert.includes(claude, snippet);
    });
  });

  it("should keep Zotero acceptance routed to agent:zotero:e2e instead of generic browser e2e", () => {
    const claude = readClaude();

    [
      "`E2E` 在 Zotero 语境里默认专指 Zotero 宿主验收，而不是网页浏览器测试。",
      "默认验收入口是 `npm run agent:zotero:e2e`，以及仓库既有的 `zotero:scenario` / host action / `agent:monitor` / `agent:gate` / host guard / semantic guard 链。",
      "不得把 Zotero 的 smoke、toolbar、Reader、Annotation、`preference pane`、`item pane`、`context pane` 或其他宿主 surface 验收，默认路由到 `ecc:e2e-runner`、Playwright、browser automation 或网页 E2E agent。",
      "只有当目标明确是 Web 页面而不是 Zotero 宿主 surface，或用户明确要求网页 E2E / Playwright / browser runner 时，才允许走 `ecc:e2e-runner` 或同类浏览器测试入口。",
      "如果语言同时出现 `E2E`、`toolbar smoke`、`scenario` 之类容易触发网页测试默认路由的词，必须先按宿主语义判定：",
      "为什么 `agent:zotero:e2e` / `zotero:scenario` 不是正确入口",
    ].forEach((snippet) => {
      assert.includes(claude, snippet);
    });

    [
      "Zotero 的 smoke 默认走 Playwright。",
      "toolbar smoke scenario 默认就是网页 E2E。",
      "Reader 验收默认交给 `ecc:e2e-runner`。",
    ].forEach((snippet) => {
      assert.equal(
        claude.includes(snippet),
        false,
        `CLAUDE.md should not default Zotero acceptance to browser e2e: ${snippet}`,
      );
    });
  });

  it("should keep initialization guard for template identity defaults", () => {
    const claude = readClaude();

    [
      "## 14. 初始化保护",
      "如果发现 `config/addon.config.json` 仍回退到模板默认值",
      "模板 `addonId`",
      "模板 `author`",
      "模板 `homepage`",
      "模板 `updateURL`",
      "先暂停功能开发。",
      "先修正项目身份信息，再继续后续实现。",
    ].forEach((snippet) => {
      assert.includes(claude, snippet);
    });
  });
});
