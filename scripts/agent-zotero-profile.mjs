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
import { resolveZoteroProfileArtifacts } from "./zotero-agent-artifacts.mjs";
import {
  buildProfileMarkdown,
  buildProfileReport,
  DEFAULT_PROFILER_SCENARIO_NAME,
  parseProfileArgs,
} from "./agent-zotero-profile-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

function usage() {
  console.log(`Usage: node scripts/agent-zotero-profile.mjs [options]

Options:
  --scenario <name>        Scenario name to run (default: ${DEFAULT_PROFILER_SCENARIO_NAME})
                           Extended workload: profiler extended diagnostics
  --include-details        Include detailed thread and stack summaries in JSON
  --duration-ms <n>        Minimum profiler window per live activity
  --profile-fixture <path> Analyze a local Firefox profiler JSON fixture instead of launching Zotero
  --skip-build             Reuse current build output for live Zotero profiling
  --help                   Show this help
`);
}

async function ensureArtifactDir(artifacts) {
  await fs.mkdir(artifacts.artifactsDir, { recursive: true });
}

async function persistProfileReport(artifacts, report) {
  await ensureArtifactDir(artifacts);
  await Promise.all([
    writeJSONArtifact(artifacts.reportJSON, report),
    fs.writeFile(artifacts.reportMD, buildProfileMarkdown(report), "utf-8"),
  ]);
}

async function readJSONFile(filePath) {
  const content = await fs.readFile(filePath, "utf-8");
  return JSON.parse(content);
}

export async function main(argv = process.argv.slice(2), options = {}) {
  const artifacts = resolveZoteroProfileArtifacts(projectRoot);
  let parsed;
  try {
    parsed = parseProfileArgs(argv);
    if (parsed.help) {
      usage();
      return {
        help: true,
      };
    }

    if (parsed.profileFixture) {
      const profileData = await readJSONFile(path.resolve(parsed.profileFixture));
      const report = buildProfileReport({
        profileData,
        includeDetails: parsed.includeDetails,
        scenarioName: parsed.scenario,
        generatedAt: new Date().toISOString(),
        durationMs: Math.max(0, Date.now() - scriptStartedAt),
      });
      await persistProfileReport(artifacts, report);
      console.log(`[agent:zotero:profile] Report: ${artifacts.reportJSON}`);
      return report;
    }

    const scenarioRun = await (options.runScenarioModeImpl || runScenarioMode)({
      projectRootPath: projectRoot,
      skipPackage: parsed.skipBuild,
      scenarioPattern: parsed.scenario,
      scenarioFilePattern: "profiler-diagnostics.scenario.js",
      scenarioRuntimeOptions: {
        profilerDurationMs: parsed.durationMs,
      },
      quiet: false,
    });
    const report = buildProfileReport({
      scenarioResult: scenarioRun.scenarioResult,
      scenarioName: parsed.scenario,
      includeDetails: parsed.includeDetails,
      generatedAt: new Date().toISOString(),
      durationMs: Math.max(0, Date.now() - scriptStartedAt),
    });
    await persistProfileReport(artifacts, report);
    console.log(`[agent:zotero:profile] Report: ${artifacts.reportJSON}`);
    return report;
  }
  catch (error) {
    const failure = {
      version: 1,
      generatedAt: new Date().toISOString(),
      kind: "agent-zotero-profile",
      advisory: true,
      gateEffect: "non-blocking",
      status: "failed",
      statusLabel: "失败",
      scenarioName: parsed?.scenario || DEFAULT_PROFILER_SCENARIO_NAME,
      includeDetails: parsed?.includeDetails === true,
      ...buildScriptFailureInfo(error, {
        durationMs: Math.max(0, Date.now() - scriptStartedAt),
        failedStage: error?.failedStage || "agent-zotero-profile",
      }),
      activities: [],
      summary: "profiler diagnostics failed before producing usable CPU profile data",
    };
    await persistProfileReport(artifacts, failure);
    console.error(`[agent:zotero:profile] ${failure.errorCategoryLabel}: ${failure.errorMessage}`);
    console.error(`[agent:zotero:profile] Report: ${artifacts.reportJSON}`);
    process.exitCode = 1;
    return failure;
  }
}

if (isExecutedAsScript(import.meta.url)) {
  await main();
}
