import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { resolveAgentMemoryArtifacts } from "./agent-artifacts.mjs";
import {
  archiveAgentSignalHistory,
  buildAgentSignalPayloads,
  loadAutofixHistoryEntries,
  summarizeAgentMemory,
  writeAgentMemoryArtifacts,
} from "./agent-memory-lib.mjs";
import { resolveZoteroAutofixArtifacts } from "./zotero-agent-artifacts.mjs";
import {
  buildScriptFailureInfo,
  writeJSONArtifact,
} from "./script-runtime-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

async function loadJSONIfExists(filePath) {
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
  const autofixArtifacts = resolveZoteroAutofixArtifacts(projectRoot);
  const [e2eReport, autofixReport, historyEntries] = await Promise.all([
    loadJSONIfExists(autofixArtifacts.e2eReportJSON),
    loadJSONIfExists(autofixArtifacts.reportJSON),
    loadAutofixHistoryEntries(autofixArtifacts.historyDir),
  ]);
  const signalPayloads = await buildAgentSignalPayloads(projectRoot);
  const signalTrends = await archiveAgentSignalHistory(projectRoot, signalPayloads);

  const summary = summarizeAgentMemory({
    e2eReport,
    autofixReport,
    historyEntries,
    signalTrends,
  });
  summary.errorCategory = null;
  summary.errorCategoryLabel = null;
  summary.errorMessage = null;
  summary.failedStage = null;
  summary.durationMs = Math.max(0, Date.now() - scriptStartedAt);
  const persistedSummary = await writeAgentMemoryArtifacts(projectRoot, summary);
  console.log(`Agent memory generated: ${persistedSummary.archive?.reportJSON || "agent-memory.json"}`);
}

main().catch(async (error) => {
  const failureInfo = buildScriptFailureInfo(error, {
    durationMs: Math.max(0, Date.now() - scriptStartedAt),
  });
  const artifacts = resolveAgentMemoryArtifacts(projectRoot);
  try {
    await fs.mkdir(path.dirname(artifacts.reportJSON), { recursive: true });
    await writeJSONArtifact(artifacts.reportJSON, {
      generatedAt: new Date().toISOString(),
      present: false,
      archive: {
        present: false,
      },
      durationMs: failureInfo.durationMs,
      ...failureInfo,
    });
    await fs.writeFile(
      artifacts.reportMD,
      [
        "# Agent Memory",
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
  console.error(`${failureInfo.errorCategoryLabel}: ${failureInfo.errorMessage}`);
  process.exit(1);
});
