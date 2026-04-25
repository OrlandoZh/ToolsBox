import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_RELEASE_CHANNEL,
  listComputerUseWorkflowCatalog,
  prepareComputerUseWorkflowSessions,
} from "./agent-computer-use-workflows-lib.mjs";
import {
  buildScriptFailureInfo,
  isExecutedAsScript,
} from "./script-runtime-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultProjectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();
const DEFAULT_LIST_SURFACE_LIMIT = 3;

function printUsage() {
  console.log([
    "Usage: node scripts/agent-computer-use-workflows.mjs [list|prepare] [workflowId] [options]",
    "",
    "Commands:",
    "  list                         Show the mandatory batch plus conditional Computer Use candidates",
    "  prepare [workflowId]        Create isolated Computer Use session artifacts for the selected workflow",
    "",
    "Workflow IDs:",
    "  review-workbench-visible-smoke",
    "  release-install-local",
    "  surface-local",
    "  surface-local:<surface-id>",
    "",
    "Options:",
    "  --all-triggered             Prepare the mandatory batch plus all triggered conditional batches",
    "  --surface <surface-id>      Focus surface-local list/prepare on the selected surface (repeatable)",
    `  --surface-limit <n>        Limit plain-text list output to the first N surfaces; default ${DEFAULT_LIST_SURFACE_LIMIT}`,
    "  --show-all-surfaces        Disable plain-text list truncation for surface-local entries",
    "  --channel <stable|beta>     Select the release-install channel; default stable",
    "  --release-handoff           Treat the current batch as a release/install handoff",
    "  --human-confirmation        Request a local install confirmation batch for handoff review",
    "  --changed-path <path>       Inject changed paths for surface trigger detection (repeatable)",
    "  --artifacts-root <path>     Override the Computer Use session root; default /tmp/codex-cu",
    "  --project-root <path>       Override project root",
    "  --json                      Print JSON output",
    "  --help, -h                  Show this help",
  ].join("\n"));
}

function requireOptionValue(args, index, optionName) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${optionName} requires a value`);
  }
  return value;
}

function parseIntegerOption(value, optionName) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${optionName} must be a non-negative integer`);
  }
  return parsed;
}

function parseArgs(argv) {
  const options = {
    command: "list",
    workflowId: null,
    allTriggered: false,
    surfaceIds: [],
    surfaceLimit: DEFAULT_LIST_SURFACE_LIMIT,
    showAllSurfaces: false,
    channel: DEFAULT_RELEASE_CHANNEL,
    releaseHandoff: false,
    humanConfirmation: false,
    changedPaths: [],
    sessionRoot: null,
    projectRoot: defaultProjectRoot,
    json: false,
    help: false,
  };

  const args = Array.isArray(argv) ? argv.slice() : [];
  if (args[0] && !args[0].startsWith("--")) {
    options.command = args.shift();
  }
  if (args[0] && !args[0].startsWith("--")) {
    options.workflowId = args.shift();
  }

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    switch (token) {
      case "--all-triggered":
        options.allTriggered = true;
        break;
      case "--surface":
        options.surfaceIds.push(requireOptionValue(args, index, "--surface"));
        index += 1;
        break;
      case "--surface-limit":
        options.surfaceLimit = parseIntegerOption(requireOptionValue(args, index, "--surface-limit"), "--surface-limit");
        index += 1;
        break;
      case "--show-all-surfaces":
        options.showAllSurfaces = true;
        break;
      case "--channel":
        options.channel = requireOptionValue(args, index, "--channel");
        index += 1;
        break;
      case "--release-handoff":
        options.releaseHandoff = true;
        break;
      case "--human-confirmation":
        options.humanConfirmation = true;
        break;
      case "--changed-path":
        options.changedPaths.push(requireOptionValue(args, index, "--changed-path"));
        index += 1;
        break;
      case "--artifacts-root":
        options.sessionRoot = path.resolve(requireOptionValue(args, index, "--artifacts-root"));
        index += 1;
        break;
      case "--project-root":
        options.projectRoot = path.resolve(requireOptionValue(args, index, "--project-root"));
        index += 1;
        break;
      case "--json":
        options.json = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${token}`);
    }
  }

  return options;
}

function printListResult(result, options = {}) {
  const printWorkflowDetails = (workflow) => {
    if (workflow.claimBoundary?.defaultProofKind) {
      console.log(`  default-proof: ${workflow.claimBoundary.defaultProofKind}`);
    }
    if (workflow.claimBoundary?.proofScope) {
      console.log(`  proof-scope: ${workflow.claimBoundary.proofScope}`);
    }
    if ((workflow.claimBoundary?.defaultNonClaims || []).length > 0) {
      console.log(`  default-non-claims: ${workflow.claimBoundary.defaultNonClaims.join(" | ")}`);
    }
    if ((workflow.triggerReasons || []).length > 0) {
      console.log(`  trigger-reasons: ${workflow.triggerReasons.join(" | ")}`);
    }
    if ((workflow.blockers || []).length > 0) {
      console.log(`  blockers: ${workflow.blockers.join(" | ")}`);
    }
    if (workflow.launchRuntime?.desktopInstanceMatchSummary) {
      console.log(`  runtime-binding: ${workflow.launchRuntime.desktopInstanceMatchSummary}`);
    }
    if (workflow.launchRuntime?.desktopInstancePreflightSummary) {
      console.log(`  runtime-preflight: ${workflow.launchRuntime.desktopInstancePreflightSummary}`);
    }
  };

  const mandatory = Array.isArray(result.mandatory) ? result.mandatory : [];
  mandatory.forEach((workflow) => {
    console.log([
      workflow.id,
      workflow.kind,
      workflow.triggerStatus,
      workflow.target,
    ].join(" | "));
    printWorkflowDetails(workflow);
  });
  const releaseInstall = result.conditional?.releaseInstall;
  if (releaseInstall) {
    console.log([
      releaseInstall.id,
      releaseInstall.kind,
      releaseInstall.triggerStatus,
      releaseInstall.target || ((releaseInstall.triggerReasons || []).join(",") || "-"),
    ].join(" | "));
    printWorkflowDetails(releaseInstall);
  }
  const surfaces = Array.isArray(result.conditional?.surfaces) ? result.conditional.surfaces : [];
  const showAllSurfaces = options.showAllSurfaces === true || (options.surfaceIds || []).length > 0;
  const surfaceLimit = Number.isInteger(options.surfaceLimit) ? options.surfaceLimit : DEFAULT_LIST_SURFACE_LIMIT;
  const visibleSurfaces = showAllSurfaces ? surfaces : surfaces.slice(0, surfaceLimit);
  const hiddenSurfaces = showAllSurfaces ? [] : surfaces.slice(visibleSurfaces.length);
  visibleSurfaces.forEach((workflow) => {
    console.log([
      workflow.id,
      workflow.kind,
      workflow.triggerStatus,
      workflow.target || ((workflow.triggerReasons || []).join(",") || "-"),
    ].join(" | "));
    printWorkflowDetails(workflow);
  });
  if (hiddenSurfaces.length > 0) {
    console.log([
      "surface-local",
      "conditional-surface",
      "truncated",
      `${hiddenSurfaces.length} more surfaces hidden`,
    ].join(" | "));
    console.log(`  hidden-surface-ids: ${hiddenSurfaces.map((workflow) => workflow.surfaceId || workflow.id).join(" | ")}`);
    console.log("  rerun: npm run agent:computer-use:list -- --show-all-surfaces");
    console.log("  focus-one: npm run agent:computer-use:list -- --surface <surface-id>");
  }
  if (surfaces.length === 0) {
    console.log("surface-local | conditional-surface | skipped | no-triggered-surfaces");
  }
}

function printPrepareResult(result) {
  if ((result.prepared || []).length === 0) {
    console.log("No Computer Use sessions prepared.");
    return;
  }
  result.prepared.forEach((workflow) => {
    console.log([
      workflow.id,
      workflow.activation?.status || "skipped",
      workflow.target,
      workflow.artifactsDir,
    ].join(" | "));
    if (workflow.recordGuidance?.defaultCommand) {
      console.log(`  default-record (${workflow.recordGuidance.defaultProofKind}): ${workflow.recordGuidance.defaultCommand}`);
    }
    if ((workflow.recordGuidance?.defaultNonClaims || []).length > 0) {
      console.log(`  default-non-claims: ${workflow.recordGuidance.defaultNonClaims.join(" | ")}`);
    }
    (workflow.recordGuidance?.alternateCommands || []).forEach((entry) => {
      console.log(`  alternate-record (${entry.proofKind}): ${entry.command}`);
      if ((entry.nonClaims || []).length > 0) {
        console.log(`  alternate-non-claims (${entry.proofKind}): ${entry.nonClaims.join(" | ")}`);
      }
    });
    (workflow.recordGuidance?.cautions || []).forEach((entry) => {
      console.log(`  caution: ${entry}`);
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  if (options.command === "list") {
    const result = await listComputerUseWorkflowCatalog(options.projectRoot, options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printListResult(result, options);
    }
    return;
  }

  if (options.command === "prepare") {
    const result = await prepareComputerUseWorkflowSessions(options.projectRoot, options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPrepareResult(result);
    }
    return;
  }

  throw new Error(`Unknown command: ${options.command}`);
}

if (isExecutedAsScript(import.meta.url)) {
  main().catch((error) => {
    const failureInfo = buildScriptFailureInfo(error, {
      durationMs: Math.max(0, Date.now() - scriptStartedAt),
    });
    console.error(`[agent-computer-use-workflows] ${failureInfo.errorCategoryLabel}: ${failureInfo.errorMessage}`);
    process.exit(1);
  });
}
