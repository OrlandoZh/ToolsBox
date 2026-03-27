import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  archiveAgentSignalHistory,
  buildAgentSignalPayloads,
  loadAutofixHistoryEntries,
  summarizeAgentMemory,
  writeAgentMemoryArtifacts,
} from "./agent-memory-lib.mjs";
import { resolveZoteroAutofixArtifacts } from "./zotero-agent-artifacts.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

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
  const persistedSummary = await writeAgentMemoryArtifacts(projectRoot, summary);
  console.log(`Agent memory generated: ${persistedSummary.archive?.reportJSON || "agent-memory.json"}`);
}

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exit(1);
});
