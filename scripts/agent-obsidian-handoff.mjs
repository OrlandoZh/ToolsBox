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
  buildPluginFeatureMapMarkdown,
  buildPluginModuleMapArtifacts,
  buildPluginUIConcreteExcalidraw,
  buildPluginUIConceptArtifacts,
  buildObsidianVisualFlowMermaidMarkdown,
  buildObsidianVisualVerdictExcalidrawMarkdown,
  buildObsidianVisualViewModel,
  buildObsidianInterventionCanvas,
  buildObsidianInterventionMarkdown,
  buildObsidianEvidenceMarkdown,
  buildObsidianTechnicalLineageMarkdown,
  buildHumanAdvancedGuideMarkdown,
  buildHumanQuickstartMarkdown,
  buildHumanInterventionWindowMarkdown,
  summarizeObsidianInterventionContext,
} from "./agent-obsidian-handoff-lib.mjs";
import {
  readCurrentTruthState,
} from "./docs-current-truth-lib.mjs";
import {
  buildScriptFailureInfo,
  writeJSONArtifact,
} from "./script-runtime-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

function parseArgs(argv) {
  const options = {
    bootstrapShell: false,
  };
  for (const arg of argv) {
    if (arg === "--bootstrap-shell") {
      options.bootstrapShell = true;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

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

async function readProjectJSONIfExists(relativePath) {
  return await readJSONIfExists(path.join(projectRoot, relativePath));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const workspace = resolveObsidianWorkspaceFiles(projectRoot, process.env);
  const visualsEnabled = resolveObsidianVisualsEnabled(process.env);
  const [loop, gate, monitor, e2e, agentContext, projectExpansionWave, projectValidationOverrides, addonConfig] = await Promise.all([
    readJSONIfExists(resolveAgentArtifactPath(projectRoot, "agent-zotero-loop.json")),
    readJSONIfExists(resolveAgentArtifactPath(projectRoot, "agent-gate.json")),
    readJSONIfExists(resolveAgentArtifactPath(projectRoot, "agent-monitor.json")),
    readJSONIfExists(resolveAgentArtifactPath(projectRoot, "agent-zotero-e2e.json")),
    readJSONIfExists(resolveAgentArtifactPath(projectRoot, "agent-context.json")),
    readProjectJSONIfExists(path.join("config", "project-expansion-wave.json")),
    readProjectJSONIfExists(path.join("config", "project-validation-overrides.json")),
    readProjectJSONIfExists(path.join("config", "addon.config.json")),
  ]);
  const currentTruthState = (() => {
    try {
      return readCurrentTruthState(projectRoot);
    } catch {
      return null;
    }
  })();

  const summary = {
    ...summarizeObsidianInterventionContext({
      loop,
      gate,
      monitor,
      e2e,
      agentContext,
      currentTruthSummary: currentTruthState?.summary || null,
      currentTruthActiveBatchId: currentTruthState?.activeBatchId || null,
      projectExpansionWave,
      projectValidationOverrides,
      bootstrapShell: options.bootstrapShell,
    }),
    addonConfig: addonConfig || null,
  };
  const visualViewModel = buildObsidianVisualViewModel(summary);
  const statusMarkdown = buildObsidianInterventionMarkdown(summary);
  const evidenceMarkdown = buildObsidianEvidenceMarkdown(summary);
  const featureMapMarkdown = buildPluginFeatureMapMarkdown(summary);
  const moduleMapArtifacts = buildPluginModuleMapArtifacts(summary);
  const technicalLineageMarkdown = buildObsidianTechnicalLineageMarkdown(summary);
  const conceptArtifacts = buildPluginUIConceptArtifacts(summary);
  const uiConcreteExcalidrawMarkdown = buildPluginUIConcreteExcalidraw(summary);
  const humanQuickstartMarkdown = buildHumanQuickstartMarkdown();
  const humanAdvancedGuideMarkdown = buildHumanAdvancedGuideMarkdown();
  const canvas = buildObsidianInterventionCanvas(summary);
  const visualFlowMarkdown = buildObsidianVisualFlowMermaidMarkdown(visualViewModel);
  const visualVerdictExcalidrawMarkdown = buildObsidianVisualVerdictExcalidrawMarkdown(visualViewModel);
  const existingHumanWindow = await fs.readFile(workspace.humanWindowNote, "utf-8").catch(() => "");
  const humanWindowMarkdown = buildHumanInterventionWindowMarkdown(summary, existingHumanWindow);

  await fs.mkdir(workspace.dir, { recursive: true });
  await fs.mkdir(workspace.moduleMapDir, { recursive: true });
  await fs.writeFile(workspace.statusNote, `${statusMarkdown}\n`, "utf-8");
  await fs.writeFile(workspace.evidenceNote, `${evidenceMarkdown}\n`, "utf-8");
  await fs.writeFile(workspace.featureMapNote, `${featureMapMarkdown}\n`, "utf-8");
  await fs.writeFile(workspace.technicalLineageNote, `${technicalLineageMarkdown}\n`, "utf-8");
  await fs.writeFile(workspace.preferencePaneConceptNote, `${conceptArtifacts.preferencePaneMarkdown}\n`, "utf-8");
  await fs.writeFile(workspace.paneConceptNote, `${conceptArtifacts.paneMarkdown}\n`, "utf-8");
  await fs.writeFile(workspace.readerConceptNote, `${conceptArtifacts.readerMarkdown}\n`, "utf-8");
  await fs.writeFile(workspace.menuConceptNote, `${conceptArtifacts.menuMarkdown}\n`, "utf-8");
  await fs.writeFile(workspace.humanQuickstartNote, `${humanQuickstartMarkdown}\n`, "utf-8");
  await fs.writeFile(workspace.humanAdvancedGuideNote, `${humanAdvancedGuideMarkdown}\n`, "utf-8");
  await fs.writeFile(workspace.architectureCanvas, `${JSON.stringify(canvas, null, 2)}\n`, "utf-8");
  await fs.writeFile(workspace.moduleMapOverviewNote, `${moduleMapArtifacts.overviewMarkdown}\n`, "utf-8");
  await fs.writeFile(workspace.moduleMapCanvas, `${JSON.stringify(moduleMapArtifacts.canvas, null, 2)}\n`, "utf-8");
  await fs.writeFile(workspace.moduleMapPaneNote, `${moduleMapArtifacts.cards[0]?.markdown || ""}\n`, "utf-8");
  await fs.writeFile(workspace.moduleMapReaderNote, `${moduleMapArtifacts.cards[1]?.markdown || ""}\n`, "utf-8");
  await fs.writeFile(workspace.moduleMapMenuNote, `${moduleMapArtifacts.cards[2]?.markdown || ""}\n`, "utf-8");
  await fs.writeFile(workspace.moduleMapComposeNote, `${moduleMapArtifacts.cards[3]?.markdown || ""}\n`, "utf-8");
  await fs.writeFile(workspace.moduleMapValidationNote, `${moduleMapArtifacts.cards[4]?.markdown || ""}\n`, "utf-8");
  await fs.writeFile(workspace.moduleMapWaveNote, `${moduleMapArtifacts.waveMarkdown || ""}\n`, "utf-8");
  await fs.writeFile(workspace.moduleMapCapabilityCatalogNote, `${moduleMapArtifacts.capabilityCatalogMarkdown || ""}\n`, "utf-8");
  await fs.writeFile(workspace.humanWindowNote, `${humanWindowMarkdown}\n`, "utf-8");
  await fs.writeFile(workspace.uiConcreteExcalidrawNote, `${uiConcreteExcalidrawMarkdown}\n`, "utf-8");
  if (visualsEnabled) {
    await fs.writeFile(workspace.visualFlowNote, `${visualFlowMarkdown}\n`, "utf-8");
    await fs.writeFile(workspace.visualVerdictExcalidrawNote, `${visualVerdictExcalidrawMarkdown}\n`, "utf-8");
  } else {
    await fs.rm(workspace.visualFlowNote, { force: true }).catch(() => {});
    await fs.rm(workspace.visualVerdictExcalidrawNote, { force: true }).catch(() => {});
  }
  for (const legacyPath of Array.isArray(workspace.legacyWorkspaceFiles) ? workspace.legacyWorkspaceFiles : []) {
    await fs.rm(legacyPath, { force: true }).catch(() => {});
  }
  await fs.rm(workspace.legacyHumanGuideNote, { force: true }).catch(() => {});
  const artifactJSONPath = resolveAgentArtifactPath(projectRoot, "agent-obsidian-handoff.json");
  const artifactMDPath = resolveAgentArtifactPath(projectRoot, "agent-obsidian-handoff.md");
  await fs.mkdir(path.dirname(artifactJSONPath), { recursive: true });
  const handoffSummary = {
    generatedAt: new Date().toISOString(),
    generationId: summary.generationId,
    success: true,
    workspaceDir: workspace.dir,
    visualsEnabled,
    statusNote: workspace.statusNote,
    evidenceNote: workspace.evidenceNote,
    featureMapNote: workspace.featureMapNote,
    technicalLineageNote: workspace.technicalLineageNote,
    humanWindowNote: workspace.humanWindowNote,
    architectureCanvas: workspace.architectureCanvas,
    moduleMapDir: workspace.moduleMapDir,
    moduleMapOverviewNote: workspace.moduleMapOverviewNote,
    moduleMapCanvas: workspace.moduleMapCanvas,
    moduleMapWaveNote: workspace.moduleMapWaveNote,
    moduleMapCapabilityCatalogNote: workspace.moduleMapCapabilityCatalogNote,
    moduleMapNotes: [
      workspace.moduleMapPaneNote,
      workspace.moduleMapReaderNote,
      workspace.moduleMapMenuNote,
      workspace.moduleMapComposeNote,
      workspace.moduleMapValidationNote,
      workspace.moduleMapWaveNote,
      workspace.moduleMapCapabilityCatalogNote,
    ],
    uiConceptNotes: [
      workspace.preferencePaneConceptNote,
      workspace.paneConceptNote,
      workspace.readerConceptNote,
      workspace.menuConceptNote,
    ],
    uiConcreteExcalidrawNote: workspace.uiConcreteExcalidrawNote,
    visualFlowNote: visualsEnabled ? workspace.visualFlowNote : null,
    visualVerdictExcalidrawNote: visualsEnabled ? workspace.visualVerdictExcalidrawNote : null,
    summarySource: summary.summarySource || null,
    summaryStatusLabel: summary.summaryStatusLabel || null,
    summaryHeadline: summary.summaryHeadline || null,
    summaryNextAction: summary.summaryNextAction || null,
    runnableNextCommand: summary.runnableNextCommand || null,
    sourceGateGeneratedAt: summary.sourceGateGeneratedAt || null,
    sourceMonitorGeneratedAt: summary.sourceMonitorGeneratedAt || null,
    sourceLoopGeneratedAt: summary.sourceLoopGeneratedAt || null,
    sourceAgentContextGeneratedAt: summary.agentContext?.generatedAt || null,
    sourceAgentContextDigest: summary.agentContext?.budgetMeta?.digest || null,
    sourceAgentContextAlignmentStatus: summary.agentContext?.alignmentRef?.status || null,
    bootstrapShell: summary.bootstrapShell === true,
    projectContext: summary.projectContext || null,
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
      `- 摘要来源: \`${handoffSummary.summarySource || "-"}\``,
      `- 摘要状态: \`${handoffSummary.summaryStatusLabel || "-"}\``,
      `- 摘要结论: ${handoffSummary.summaryHeadline || "-"}`,
      `- 摘要下一步: ${handoffSummary.summaryNextAction || "-"}`,
      `- 可执行命令: \`${handoffSummary.runnableNextCommand || "-"}\``,
      `- 模块图谱总览: \`${workspace.moduleMapOverviewNote}\``,
      `- 当前 wave 焦点: \`${workspace.moduleMapWaveNote}\``,
      `- 能力目录: \`${workspace.moduleMapCapabilityCatalogNote}\``,
      `- 模块图谱白板: \`${workspace.moduleMapCanvas}\``,
      `- UI 具象图: \`${workspace.uiConcreteExcalidrawNote}\``,
      `- Bootstrap Shell: \`${handoffSummary.bootstrapShell ? "是" : "否"}\``,
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
