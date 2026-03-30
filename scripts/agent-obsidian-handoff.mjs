import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { resolveAgentArtifactPath } from "./agent-artifacts.mjs";
import {
  resolveObsidianVisualsEnabled,
  resolveObsidianWorkspaceFiles,
} from "./agent-obsidian-workspace.mjs";
import {
  buildObsidianVisualFlowMermaidMarkdown,
  buildObsidianVisualVerdictExcalidrawMarkdown,
  buildObsidianVisualViewModel,
  buildObsidianInterventionCanvas,
  buildObsidianInterventionMarkdown,
  buildObsidianEvidenceMarkdown,
  buildHumanAdvancedGuideMarkdown,
  buildHumanQuickstartMarkdown,
  buildHumanInterventionWindowMarkdown,
  summarizeObsidianInterventionContext,
} from "./agent-obsidian-handoff-lib.mjs";
import {
  extractCurrentTruthActiveBatchId,
  readCurrentTruthSummary,
} from "./docs-current-truth-lib.mjs";
import {
  buildScriptFailureInfo,
  writeJSONArtifact,
} from "./script-runtime-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

async function readJSONIfExists(filePath) {
  return await fs.readFile(filePath, "utf-8")
    .then((content) => JSON.parse(content))
    .catch((error) => {
      if (error && error.code === "ENOENT") {
        return null;
      }
      throw error;
    });
}

function readCurrentTruthActiveBatchId(rootDir) {
  try {
    const summary = readCurrentTruthSummary(rootDir);
    return extractCurrentTruthActiveBatchId(summary);
  } catch {
    return null;
  }
}

async function main() {
  const workspace = resolveObsidianWorkspaceFiles(projectRoot, process.env);
  const visualsEnabled = resolveObsidianVisualsEnabled(process.env);
  const [loop, gate, monitor, e2e] = await Promise.all([
    readJSONIfExists(resolveAgentArtifactPath(projectRoot, "agent-zotero-loop.json")),
    readJSONIfExists(resolveAgentArtifactPath(projectRoot, "agent-gate.json")),
    readJSONIfExists(resolveAgentArtifactPath(projectRoot, "agent-monitor.json")),
    readJSONIfExists(resolveAgentArtifactPath(projectRoot, "agent-zotero-e2e.json")),
  ]);

  const summary = summarizeObsidianInterventionContext({
    loop,
    gate,
    monitor,
    e2e,
  });
  const currentTruthActiveBatchId = readCurrentTruthActiveBatchId(projectRoot);
  if (currentTruthActiveBatchId) {
    summary.currentTruthActiveBatchId = currentTruthActiveBatchId;
    if (currentTruthActiveBatchId === "READER-HIGH-126") {
      summary.manualVerdictResolved = true;
    }
  }
  const visualViewModel = buildObsidianVisualViewModel(summary);
  const statusMarkdown = buildObsidianInterventionMarkdown(summary);
  const evidenceMarkdown = buildObsidianEvidenceMarkdown(summary);
  const humanQuickstartMarkdown = buildHumanQuickstartMarkdown();
  const humanAdvancedGuideMarkdown = buildHumanAdvancedGuideMarkdown();
  const canvas = buildObsidianInterventionCanvas(summary);
  const visualFlowMarkdown = buildObsidianVisualFlowMermaidMarkdown(visualViewModel);
  const visualVerdictExcalidrawMarkdown = buildObsidianVisualVerdictExcalidrawMarkdown(visualViewModel);
  const existingHumanWindow = await fs.readFile(workspace.humanWindowNote, "utf-8").catch(() => "");
  const humanWindowMarkdown = buildHumanInterventionWindowMarkdown(summary, existingHumanWindow);

  await fs.mkdir(workspace.dir, { recursive: true });
  await fs.writeFile(workspace.statusNote, `${statusMarkdown}\n`, "utf-8");
  await fs.writeFile(workspace.evidenceNote, `${evidenceMarkdown}\n`, "utf-8");
  await fs.writeFile(workspace.humanQuickstartNote, `${humanQuickstartMarkdown}\n`, "utf-8");
  await fs.writeFile(workspace.humanAdvancedGuideNote, `${humanAdvancedGuideMarkdown}\n`, "utf-8");
  await fs.writeFile(workspace.architectureCanvas, `${JSON.stringify(canvas, null, 2)}\n`, "utf-8");
  await fs.writeFile(workspace.humanWindowNote, `${humanWindowMarkdown}\n`, "utf-8");
  if (visualsEnabled) {
    await fs.writeFile(workspace.visualFlowNote, `${visualFlowMarkdown}\n`, "utf-8");
    await fs.writeFile(workspace.visualVerdictExcalidrawNote, `${visualVerdictExcalidrawMarkdown}\n`, "utf-8");
  } else {
    await fs.rm(workspace.visualFlowNote, { force: true }).catch(() => {});
    await fs.rm(workspace.visualVerdictExcalidrawNote, { force: true }).catch(() => {});
  }
  await fs.rm(workspace.legacyHumanGuideNote, { force: true }).catch(() => {});
  const artifactJSONPath = resolveAgentArtifactPath(projectRoot, "agent-obsidian-handoff.json");
  const artifactMDPath = resolveAgentArtifactPath(projectRoot, "agent-obsidian-handoff.md");
  await fs.mkdir(path.dirname(artifactJSONPath), { recursive: true });
  const handoffSummary = {
    generatedAt: new Date().toISOString(),
    success: true,
    workspaceDir: workspace.dir,
    visualsEnabled,
    statusNote: workspace.statusNote,
    evidenceNote: workspace.evidenceNote,
    humanWindowNote: workspace.humanWindowNote,
    visualFlowNote: visualsEnabled ? workspace.visualFlowNote : null,
    visualVerdictExcalidrawNote: visualsEnabled ? workspace.visualVerdictExcalidrawNote : null,
    durationMs: Math.max(0, Date.now() - scriptStartedAt),
    errorCategory: null,
    errorCategoryLabel: null,
    errorMessage: null,
    failedStage: null,
  };
  await writeJSONArtifact(artifactJSONPath, handoffSummary);
  await fs.writeFile(
    artifactMDPath,
    [
      "# Agent Obsidian Handoff",
      "",
      "- 状态: 成功",
      `- 工作台目录: \`${workspace.dir}\``,
      `- 视觉配套: \`${visualsEnabled ? "启用" : "关闭"}\``,
      `- 耗时: \`${handoffSummary.durationMs}ms\``,
      "",
    ].join("\n"),
    "utf-8",
  );
  console.log(`Obsidian intervention workspace generated: ${workspace.dir}`);
}

main().catch(async (error) => {
  const failureInfo = buildScriptFailureInfo(error, {
    durationMs: Math.max(0, Date.now() - scriptStartedAt),
  });
  try {
    const artifactJSONPath = resolveAgentArtifactPath(projectRoot, "agent-obsidian-handoff.json");
    const artifactMDPath = resolveAgentArtifactPath(projectRoot, "agent-obsidian-handoff.md");
    await fs.mkdir(path.dirname(artifactJSONPath), { recursive: true });
    await writeJSONArtifact(artifactJSONPath, {
      generatedAt: new Date().toISOString(),
      success: false,
      workspaceDir: null,
      visualsEnabled: null,
      durationMs: failureInfo.durationMs,
      ...failureInfo,
    });
    await fs.writeFile(
      artifactMDPath,
      [
        "# Agent Obsidian Handoff",
        "",
        "- 状态: 失败",
        `- 分类: \`${failureInfo.errorCategoryLabel}\``,
        `- 阶段: \`${failureInfo.failedStage}\``,
        `- 信息: ${failureInfo.errorMessage}`,
        `- 耗时: \`${failureInfo.durationMs}ms\``,
        "",
      ].join("\n"),
      "utf-8",
    );
  } catch {
    // ignore secondary failure
  }
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
