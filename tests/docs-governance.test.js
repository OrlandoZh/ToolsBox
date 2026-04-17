import fs from "node:fs";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";

function readSource(relativePath) {
  return fs.readFileSync(path.resolve(relativePath), "utf-8");
}

function normalizeSlashes(value) {
  return String(value || "").split(path.sep).join("/");
}

function listMarkdownFiles(relativeDir) {
  const directory = path.resolve(relativeDir);
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listMarkdownFiles(path.relative(path.resolve("."), absolutePath));
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      return [normalizeSlashes(path.relative(path.resolve("."), absolutePath))];
    }
    return [];
  }).sort();
}

function collectReferenceLinks(docPath) {
  const source = readSource(docPath);
  return [...source.matchAll(/\((\.\.\/reference\/[^)]+)\)/g)].map((match) => match[1]);
}

function stripLinkFragment(referenceLink) {
  return String(referenceLink || "").split("#")[0].split("?")[0];
}

function toProjectRelativeReferencePath(docPath, referenceLink) {
  const absoluteTarget = path.resolve(
    path.dirname(path.resolve(docPath)),
    stripLinkFragment(referenceLink),
  );
  return normalizeSlashes(path.relative(path.resolve("."), absoluteTarget));
}

function expectedReferenceRoot(projectRelativeReferencePath) {
  const normalized = normalizeSlashes(projectRelativeReferencePath);
  const segments = normalized.split("/");
  if (segments[0] !== "reference") {
    return null;
  }
  if (segments[1] === "zotero-main") {
    return "reference/zotero-main";
  }
  if (segments.length >= 3) {
    return `reference/${segments[1]}/${segments[2]}`;
  }
  return `reference/${segments[1]}`;
}

describe("Docs Governance", () => {
  it("should keep CURRENT_BACKLOG as the only current-truth document contract", () => {
    const backlog = readSource("docs/CURRENT_BACKLOG.md");
    const agentIndex = readSource("docs/AGENT_INDEX.md");
    const historyIndex = readSource("docs/HISTORY_INDEX.md");
    const referenceIndex = readSource("docs/REFERENCE_INDEX.md");

    [
      "## 当前单一事实源",
      "<!-- CURRENT-TRUTH-SUMMARY:START -->",
      "<!-- CURRENT-TRUTH-SUMMARY:END -->",
    ].forEach((snippet) => {
      assert.includes(backlog, snippet);
    });
    assert.includes(agentIndex, "当前主线、当前 blocker、当前范围只认这里");
    assert.includes(historyIndex, "不记录当前状态");
    assert.includes(referenceIndex, "不是当前项目 truth");
  });

  it("should keep routers free from duplicated active state detail", () => {
    const agents = readSource("AGENTS.md");
    const claude = readSource("CLAUDE.md");
    const agentIndex = readSource("docs/AGENT_INDEX.md");
    const historyIndex = readSource("docs/HISTORY_INDEX.md");
    const referenceIndex = readSource("docs/REFERENCE_INDEX.md");

    [
      "`99%`",
      "`ENG-HIGH-104 / ENG-LOW-211~213`",
      "`ZOTERO-HOST-POLISH-WAVE-001`",
      "`2026-04-08T01:26:26.211Z`",
    ].forEach((snippet) => {
      assert.ok(!agents.includes(snippet), `AGENTS.md should not repeat dynamic current-state detail: ${snippet}`);
      assert.ok(!claude.includes(snippet), `CLAUDE.md should not repeat dynamic current-state detail: ${snippet}`);
      assert.ok(!agentIndex.includes(snippet), `docs/AGENT_INDEX.md should stay a thin router: ${snippet}`);
      assert.ok(!historyIndex.includes(snippet), `docs/HISTORY_INDEX.md should not carry active-state detail: ${snippet}`);
      assert.ok(!referenceIndex.includes(snippet), `docs/REFERENCE_INDEX.md should stay a task router: ${snippet}`);
    });
  });

  it("should keep CLAUDE as a controller entry that routes back to the canonical truth and contract", () => {
    const claude = readSource("CLAUDE.md");

    assert.includes(claude, "这个文件是给 Claude Code 的主引导文件");
    assert.includes(claude, "[docs/CURRENT_BACKLOG.md](docs/CURRENT_BACKLOG.md)");
    assert.includes(claude, "[docs/AGENT_INDEX.md](docs/AGENT_INDEX.md)");
    assert.includes(claude, "[AGENTS.md](AGENTS.md)");
    assert.includes(claude, "controller overlay");
    assert.includes(claude, "当前模板仍以 [AGENTS.md](AGENTS.md) 作为主协作 contract");
    assert.includes(claude, "通用性结论");
    assert.includes(claude, "优先使用仓库已有编排入口");
  });

  it("should keep the history index as the route for long-tail historical docs", () => {
    const historyIndex = readSource("docs/HISTORY_INDEX.md");

    [
      "./CLEANROOM_REFACTOR_PLAN.md",
      "./REFERENCE_SNAPSHOTS.md",
      "./AIASSISTANT_PITFALLS.md",
      "./REFERENCE_COMPARISON.md",
    ].forEach((snippet) => {
      assert.includes(historyIndex, snippet);
    });
  });

  it("should preserve canonical task pointers in the thin reference router", () => {
    const referenceIndex = readSource("docs/REFERENCE_INDEX.md");

    [
      "REFERENCE_INDEX -> REFERENCE_* -> raw reference/*",
      "REFERENCE_AIASSISTANT_REACT_PANEL_PATTERNS.md",
      "REFERENCE_PLUGIN_MENU_PATTERNS.md",
      "REFERENCE_PLUGIN_TECHNICAL_CHAINS.md",
      "REFERENCE_PLUGIN_UI_ANALYSIS.md",
      "REFERENCE_BIBGENIE_ANALYSIS.md",
    ].forEach((snippet) => {
      assert.includes(referenceIndex, snippet);
    });
  });

  it("should keep reference routing aligned to the four local buckets", () => {
    const referenceIndex = readSource("docs/REFERENCE_INDEX.md");
    const referenceSnapshots = readSource("docs/REFERENCE_SNAPSHOTS.md");
    const agents = readSource("AGENTS.md");

    [
      "`reference/Templetereference/`",
      "`reference/zotero-main/`",
      "`reference/plugin/`",
      "`reference/lajiplugin/`",
    ].forEach((snippet) => {
      assert.includes(referenceIndex, snippet);
      assert.includes(referenceSnapshots, snippet);
    });
    assert.includes(referenceIndex, "开发框架参考");
    assert.includes(referenceIndex, "固定写 `reference/zotero-main/`");
    assert.includes(referenceSnapshots, "宿主接口、术语、字段和事件语义只认 `reference/zotero-main/`");
    assert.includes(agents, "`REFERENCE_INDEX -> REFERENCE_* -> raw reference/*`");
    assert.includes(agents, "`agent:reference:intake`");
  });

  it("should keep reference links on canonical roots and only verify mounted snapshots when available", () => {
    const docs = listMarkdownFiles("docs");
    const hasLocalReferenceSnapshots = fs.existsSync(path.resolve("reference"));

    for (const docPath of docs) {
      for (const referenceLink of collectReferenceLinks(docPath)) {
        const projectRelativeReferencePath = toProjectRelativeReferencePath(docPath, referenceLink);
        const expectedRoot = expectedReferenceRoot(projectRelativeReferencePath);
        if (expectedRoot) {
          assert.ok(
            projectRelativeReferencePath === expectedRoot
              || projectRelativeReferencePath.startsWith(`${expectedRoot}/`),
            `${docPath} should route ${projectRelativeReferencePath} through ${expectedRoot}`,
          );
        }
        if (hasLocalReferenceSnapshots) {
          assert.ok(
            fs.existsSync(
              path.resolve(
                path.dirname(path.resolve(docPath)),
                stripLinkFragment(referenceLink),
              ),
            ),
            `${docPath} references missing local snapshot: ${referenceLink}`,
          );
        }
      }
    }
  });
});
