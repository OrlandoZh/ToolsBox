import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveAgentArtifactPath } from "./agent-artifacts.mjs";
import {
  buildCuratedPdfMarkdown,
  CURATED_PDF_SCENARIO_FILE_PATTERN,
  getDefaultCuratedPdfManifestPath,
  summarizeCuratedPdfManifest,
  summarizeCuratedPdfScenarioResults,
} from "./agent-zotero-curated-pdf-lib.mjs";
import {
  buildScriptFailureInfo,
  createScriptError,
  isExecutedAsScript,
  readJSONFile,
  writeJSONArtifact,
} from "./script-runtime-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

function usage() {
  console.log(`Usage: node scripts/agent-zotero-curated-pdf.mjs [options]

Options:
  --manifest <path>    Override curated manifest path for preflight and scenario runtime
  --scenario <pattern> Filter curated scenarios by scenario name (substring or glob)
  --keep-open          Keep Zotero open after the scenario command
  --no-package         Reuse the current build output without packaging again
`);
}

function parseArgs(argv) {
  const parsed = {
    manifestPath: getDefaultCuratedPdfManifestPath(projectRoot),
    scenarioPattern: null,
    keepOpen: false,
    skipPackage: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = String(argv[index] || "").trim();
    switch (flag) {
      case "":
        break;
      case "--help":
      case "-h":
        usage();
        return null;
      case "--manifest":
        index += 1;
        if (index >= argv.length) {
          throw createScriptError("args", "--manifest requires a value", {
            failedStage: "parse-args",
          });
        }
        parsed.manifestPath = path.resolve(String(argv[index] || "").trim());
        break;
      case "--scenario":
        index += 1;
        if (index >= argv.length) {
          throw createScriptError("args", "--scenario requires a value", {
            failedStage: "parse-args",
          });
        }
        parsed.scenarioPattern = String(argv[index] || "").trim() || null;
        break;
      case "--keep-open":
        parsed.keepOpen = true;
        break;
      case "--no-package":
        parsed.skipPackage = true;
        break;
      default:
        throw createScriptError("args", `Unknown option: ${flag}`, {
          failedStage: "parse-args",
        });
    }
  }

  return parsed;
}

function createCuratedPdfArtifacts(root) {
  return {
    reportJSON: resolveAgentArtifactPath(root, "agent-zotero-curated-pdf.json"),
    reportMD: resolveAgentArtifactPath(root, "agent-zotero-curated-pdf.md"),
    scenarioReportJSON: resolveAgentArtifactPath(root, "zotero-scenario-last-run.json"),
  };
}

async function ensureArtifactDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function runScenarioCommand(options) {
  const args = [
    path.join(projectRoot, "scripts", "zotero.mjs"),
    "scenario",
    "--scenario-file",
    CURATED_PDF_SCENARIO_FILE_PATTERN,
  ];
  if (options.scenarioPattern) {
    args.push("--scenario", options.scenarioPattern);
  }
  if (options.keepOpen) {
    args.push("--keep-open");
  }
  if (options.skipPackage) {
    args.push("--no-package");
  }

  const stdoutTail = [];
  const stderrTail = [];
  const pushTail = (target, chunk) => {
    const lines = String(chunk || "").split(/\r?\n/u).filter(Boolean);
    for (const line of lines) {
      target.push(line);
    }
    while (target.length > 40) {
      target.shift();
    }
  };

  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        CLEANROOM_PDF_TEST_CORPUS_MANIFEST_PATH: options.manifestPath,
      },
    });

    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      pushTail(stdoutTail, chunk);
    });
    child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
      pushTail(stderrTail, chunk);
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      resolve({
        command: process.execPath,
        args,
        exitCode: Number.isInteger(code) ? code : null,
        signal: signal || null,
        stdoutTail,
        stderrTail,
      });
    });
  });
}

async function execute(options, artifacts) {
  const manifest = await readJSONFile(options.manifestPath, {
    missingCategory: "environment",
    invalidCategory: "validation",
    failedStage: "read-curated-manifest",
    label: options.manifestPath,
  });
  const manifestSummary = summarizeCuratedPdfManifest(manifest, {
    manifestPath: options.manifestPath,
  });
  const commandResult = await runScenarioCommand(options);
  const scenarioReport = await readJSONFile(artifacts.scenarioReportJSON, {
    missingCategory: "execution",
    invalidCategory: "validation",
    failedStage: "read-scenario-report",
    label: artifacts.scenarioReportJSON,
  });
  const scenarioSummary = summarizeCuratedPdfScenarioResults(scenarioReport, {
    scenarioPattern: options.scenarioPattern,
  });

  const report = {
    generatedAt: new Date().toISOString(),
    durationMs: Math.max(0, Date.now() - scriptStartedAt),
    status: scenarioSummary.status,
    manifestPath: options.manifestPath,
    manifestSummary,
    scenarioFilePattern: CURATED_PDF_SCENARIO_FILE_PATTERN,
    scenarioPattern: options.scenarioPattern,
    scenarioReportPath: artifacts.scenarioReportJSON,
    scenarioSummary,
    commandResult,
  };

  if (commandResult.exitCode !== 0) {
    throw createScriptError("execution", `Curated PDF scenario command exited with code ${commandResult.exitCode}`, {
      failedStage: "run-curated-scenarios",
      details: {
        exitCode: commandResult.exitCode,
        signal: commandResult.signal,
      },
    });
  }

  if (scenarioSummary.status !== "passed") {
    throw createScriptError(
      scenarioSummary.status === "unavailable" ? "environment" : "validation",
      scenarioSummary.summary,
      {
        failedStage: "validate-curated-scenarios",
        details: {
          scenarioStatus: scenarioSummary.status,
          importedScenarioNames: scenarioSummary.importedScenarioNames,
          unavailableScenarioNames: scenarioSummary.unavailableScenarioNames,
          failedScenarioNames: scenarioSummary.failedScenarioNames,
          missingScenarioNames: scenarioSummary.missingScenarioNames,
        },
      },
    );
  }

  return report;
}

async function writeReport(artifacts, report) {
  await ensureArtifactDir(artifacts.reportJSON);
  await writeJSONArtifact(artifacts.reportJSON, report);
  await fs.writeFile(artifacts.reportMD, buildCuratedPdfMarkdown(report), "utf-8");
}

export async function main(argv = process.argv.slice(2)) {
  const artifacts = createCuratedPdfArtifacts(projectRoot);
  let options = null;

  try {
    options = parseArgs(argv);
    if (!options) {
      return 0;
    }
    const report = await execute(options, artifacts);
    await writeReport(artifacts, report);
    console.log(`Curated PDF dev-only report: ${artifacts.reportJSON}`);
    return 0;
  }
  catch (error) {
    const failureInfo = buildScriptFailureInfo(error, {
      durationMs: Date.now() - scriptStartedAt,
    });
    const report = {
      generatedAt: new Date().toISOString(),
      status: "failed",
      manifestPath: options?.manifestPath || null,
      scenarioFilePattern: CURATED_PDF_SCENARIO_FILE_PATTERN,
      scenarioPattern: options?.scenarioPattern || null,
      errorCategory: failureInfo.errorCategory,
      errorCategoryLabel: failureInfo.errorCategoryLabel,
      errorMessage: failureInfo.errorMessage,
      failedStage: failureInfo.failedStage,
      durationMs: failureInfo.durationMs,
      details: failureInfo.details,
    };
    await writeReport(artifacts, report);
    console.error(`[agent-zotero-curated-pdf] ${failureInfo.errorCategoryLabel}: ${failureInfo.errorMessage}`);
    return 1;
  }
}

if (isExecutedAsScript(import.meta.url)) {
  const exitCode = await main();
  process.exit(exitCode);
}
