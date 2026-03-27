import { promises as fs } from "node:fs";
import path from "node:path";
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

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

async function main() {
  const workspace = resolveObsidianWorkspaceFiles(projectRoot);
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
  const visualViewModel = buildObsidianVisualViewModel(summary);
  const visualsEnabled = resolveObsidianVisualsEnabled();
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
  console.log(`Obsidian intervention workspace generated: ${workspace.dir}`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
