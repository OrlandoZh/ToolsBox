import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  buildComputerUseValidationPlan,
  inspectComputerUseValidationContracts,
  recordComputerUseValidationResult,
  startComputerUseValidation,
} from "./agent-computer-use-validation-lib.mjs";
import {
  buildScriptFailureInfo,
  isExecutedAsScript,
} from "./script-runtime-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultProjectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

function printUsage() {
  console.log([
    "Usage: node scripts/agent-computer-use-validation.mjs [plan|run|record|inspect] [options]",
    "",
    "Commands:",
    "  plan                         Print the default-disabled lane plan",
    "  run                          Start a manual Computer Use validation session artifact",
    "  record                       Record a Computer Use validation result",
    "  inspect                      Validate the lane contract",
    "",
    "Options:",
    "  --user-requested             Required for run; confirms explicit user activation",
    "  --target <text>              Validation target or visible surface",
    "  --verdict <pass|fail|partial>  Result verdict for record",
    "  --summary <text>             Result summary for record",
    "  --proof-kind <kind>         Proof scope for record",
    "  --entry-route-observed <text>  Observed human/internal entry route for record",
    "  --host-visible-entry-observed  Mark that a real host-visible entry was directly observed",
    "  --no-host-visible-entry-observed  Mark that no real host-visible entry was observed",
    "  --runtime-instance-match <matched|mismatched|unknown>  Record whether Computer Use observed the intended runtime instance",
    "  --runtime-instance-evidence <text>  Explain how the runtime instance was matched or why it mismatched",
    "  --evidence <text>            Evidence note for record",
    "  --risk <text>                Add a risk note for record; repeatable",
    "  --blocker <text>             Add a blocker note for record; repeatable",
    "  --next-action <text>         Next action note for record",
    "  --project-root <path>        Override project root",
    "  --json                       Print JSON output",
    "  --help, -h                   Show this help",
  ].join("\n"));
}

function requireOptionValue(args, index, optionName) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${optionName} requires a value`);
  }
  return value;
}

function parseArgs(argv) {
  const options = {
    command: "plan",
    projectRoot: defaultProjectRoot,
    userRequested: false,
    target: null,
    verdict: null,
    summary: null,
    proofKind: null,
    entryRouteObserved: null,
    hostVisibleEntryObserved: null,
    runtimeInstanceMatch: null,
    runtimeInstanceEvidence: null,
    evidence: null,
    risks: [],
    blockers: [],
    nextAction: null,
    json: false,
    help: false,
  };

  const args = Array.isArray(argv) ? argv.slice() : [];
  if (args[0] && !args[0].startsWith("--")) {
    options.command = args.shift();
  }

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    switch (token) {
      case "--user-requested":
        options.userRequested = true;
        break;
      case "--target":
        options.target = requireOptionValue(args, index, "--target");
        index += 1;
        break;
      case "--verdict":
        options.verdict = requireOptionValue(args, index, "--verdict");
        index += 1;
        break;
      case "--summary":
        options.summary = requireOptionValue(args, index, "--summary");
        index += 1;
        break;
      case "--proof-kind":
        options.proofKind = requireOptionValue(args, index, "--proof-kind");
        index += 1;
        break;
      case "--entry-route-observed":
        options.entryRouteObserved = requireOptionValue(args, index, "--entry-route-observed");
        index += 1;
        break;
      case "--host-visible-entry-observed":
        options.hostVisibleEntryObserved = true;
        break;
      case "--no-host-visible-entry-observed":
        options.hostVisibleEntryObserved = false;
        break;
      case "--runtime-instance-match":
        options.runtimeInstanceMatch = requireOptionValue(args, index, "--runtime-instance-match");
        index += 1;
        break;
      case "--runtime-instance-evidence":
        options.runtimeInstanceEvidence = requireOptionValue(args, index, "--runtime-instance-evidence");
        index += 1;
        break;
      case "--evidence":
        options.evidence = requireOptionValue(args, index, "--evidence");
        index += 1;
        break;
      case "--risk":
        options.risks.push(requireOptionValue(args, index, "--risk"));
        index += 1;
        break;
      case "--blocker":
        options.blockers.push(requireOptionValue(args, index, "--blocker"));
        index += 1;
        break;
      case "--next-action":
        options.nextAction = requireOptionValue(args, index, "--next-action");
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

function printPlan(result) {
  console.log([
    result.laneId,
    result.status,
    `defaultEnabled=${result.defaultEnabled ? "true" : "false"}`,
    `gateEffect=${result.gateEffect}`,
    result.activation?.command || "-",
  ].join(" | "));
}

function printRunResult(result) {
  console.log([
    result.laneId,
    result.status,
    result.activation?.target || "-",
    result.artifactPaths?.json || "-",
  ].join(" | "));
}

function printInspectResult(result) {
  console.log([
    result.laneId,
    result.ok ? "ok" : "failed",
    `defaultEnabled=${result.enabledByDefault ? "true" : "false"}`,
    `issues=${result.issues.length}`,
  ].join(" | "));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  if (options.command === "plan") {
    const result = buildComputerUseValidationPlan(options.projectRoot, options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    printPlan(result);
    return;
  }

  if (options.command === "run") {
    const result = await startComputerUseValidation(options.projectRoot, options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    printRunResult(result);
    return;
  }

  if (options.command === "record") {
    const result = await recordComputerUseValidationResult(options.projectRoot, options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    printRunResult(result);
    return;
  }

  if (options.command === "inspect") {
    const result = inspectComputerUseValidationContracts(options.projectRoot, options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    printInspectResult(result);
    if (!result.ok) {
      process.exitCode = 1;
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
    console.error(`[agent-computer-use-validation] ${failureInfo.errorCategoryLabel}: ${failureInfo.errorMessage}`);
    process.exit(1);
  });
}
