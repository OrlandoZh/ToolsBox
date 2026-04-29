import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { runScenarioMode } from "./zotero.mjs";
import {
  buildScriptFailureInfo,
  isExecutedAsScript,
  writeJSONArtifact,
} from "./script-runtime-lib.mjs";
import { resolveZoteroMemoryArtifacts } from "./zotero-agent-artifacts.mjs";
import {
  buildMemoryMarkdown,
  buildMemoryReport,
  DEFAULT_MEMORY_SCENARIO_NAME,
  parseMemoryArgs,
} from "./agent-zotero-memory-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

function usage() {
  console.log(`Usage: node scripts/agent-zotero-memory.mjs [options]

Options:
  --scenario <name>        Scenario name to run (default: ${DEFAULT_MEMORY_SCENARIO_NAME})
                           Extended workload: memory extended diagnostics
  --include-details        Include raw memory snapshots in JSON
  --include-about-memory   Export full Gecko about:memory reporter text to a sidecar file
  --duration-ms <n>        Minimum observation window per live activity
  --memory-fixture <path>  Analyze a local memory diagnostics fixture instead of launching Zotero
  --skip-build             Reuse current build output for live Zotero diagnostics
  --help                   Show this help
`);
}

async function ensureArtifactDir(artifacts) {
  await fs.mkdir(artifacts.artifactsDir, { recursive: true });
}

async function persistMemoryReport(artifacts, report) {
  await ensureArtifactDir(artifacts);
  const aboutMemoryText = typeof report?.aboutMemoryExport?.text === "string"
    ? report.aboutMemoryExport.text
    : "";
  const jsonReport = aboutMemoryText
    ? {
        ...report,
        aboutMemoryExport: {
          ...report.aboutMemoryExport,
          text: undefined,
          textArtifact: artifacts.aboutMemoryTXT,
        },
      }
    : report;
  await Promise.all([
    writeJSONArtifact(artifacts.reportJSON, jsonReport),
    fs.writeFile(artifacts.reportMD, buildMemoryMarkdown(report), "utf-8"),
    aboutMemoryText
      ? fs.writeFile(artifacts.aboutMemoryTXT, aboutMemoryText, "utf-8")
      : Promise.resolve(),
  ]);
}

async function readJSONFile(filePath) {
  const content = await fs.readFile(filePath, "utf-8");
  return JSON.parse(content);
}

export async function main(argv = process.argv.slice(2), options = {}) {
  const artifacts = resolveZoteroMemoryArtifacts(projectRoot);
  let parsed;
  try {
    parsed = parseMemoryArgs(argv);
    if (parsed.help) {
      usage();
      return { help: true };
    }

    if (parsed.memoryFixture) {
      const memoryFixture = await readJSONFile(path.resolve(parsed.memoryFixture));
      const report = buildMemoryReport({
        memoryFixture,
        includeDetails: parsed.includeDetails,
        includeAboutMemory: parsed.includeAboutMemory,
        scenarioName: parsed.scenario,
        generatedAt: new Date().toISOString(),
        durationMs: Math.max(0, Date.now() - scriptStartedAt),
      });
      await persistMemoryReport(artifacts, report);
      console.log(`[agent:zotero:memory] Report: ${artifacts.reportJSON}`);
      return report;
    }

    const scenarioRun = await (options.runScenarioModeImpl || runScenarioMode)({
      projectRootPath: projectRoot,
      skipPackage: parsed.skipBuild,
      scenarioPattern: parsed.scenario,
      scenarioFilePattern: "memory-diagnostics.scenario.js",
      scenarioRuntimeOptions: {
        memoryDurationMs: parsed.durationMs,
        memoryIncludeAboutMemory: parsed.includeAboutMemory,
      },
      quiet: false,
    });
    const report = buildMemoryReport({
      scenarioResult: scenarioRun.scenarioResult,
      scenarioName: parsed.scenario,
      includeDetails: parsed.includeDetails,
      includeAboutMemory: parsed.includeAboutMemory,
      generatedAt: new Date().toISOString(),
      durationMs: Math.max(0, Date.now() - scriptStartedAt),
    });
    await persistMemoryReport(artifacts, report);
    console.log(`[agent:zotero:memory] Report: ${artifacts.reportJSON}`);
    return report;
  }
  catch (error) {
    const failure = {
      version: 1,
      generatedAt: new Date().toISOString(),
      kind: "agent-zotero-memory",
      advisory: true,
      gateEffect: "non-blocking",
      status: "failed",
      statusLabel: "失败",
      scenarioName: parsed?.scenario || DEFAULT_MEMORY_SCENARIO_NAME,
      includeDetails: parsed?.includeDetails === true,
      includeAboutMemory: parsed?.includeAboutMemory === true,
      ...buildScriptFailureInfo(error, {
        durationMs: Math.max(0, Date.now() - scriptStartedAt),
        failedStage: error?.failedStage || "agent-zotero-memory",
      }),
      activities: [],
      summary: "memory diagnostics failed before producing usable memory data",
    };
    await persistMemoryReport(artifacts, failure);
    console.error(`[agent:zotero:memory] ${failure.errorCategoryLabel}: ${failure.errorMessage}`);
    console.error(`[agent:zotero:memory] Report: ${artifacts.reportJSON}`);
    process.exitCode = 1;
    return failure;
  }
}

if (isExecutedAsScript(import.meta.url)) {
  await main();
}
