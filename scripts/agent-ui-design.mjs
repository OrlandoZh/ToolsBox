import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  buildUIDesignDelegationTask,
  listUIDesignWorkflows,
  runUIDesignWorkflow,
} from "./agent-ui-design-lib.mjs";
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
    "Usage: node scripts/agent-ui-design.mjs [list|run] [workflowId] [options]",
    "",
    "Commands:",
    "  list                            Show available manual UI design workflows",
    "  run [workflowId]                Run the selected UI design workflow",
    "",
    "Options:",
    "  --goal <text>                   Manual design goal for the sub-agent",
    "  --reviewer <name>               Reviewer label for delegation review",
    "  --project-root <path>           Override project root",
    "  --json                          Print JSON output",
    "  --help, -h                      Show this help",
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
    command: "list",
    workflowId: null,
    goal: null,
    reviewer: "codex-ui-design-controller",
    json: false,
    help: false,
    projectRoot: defaultProjectRoot,
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
      case "--goal":
        options.goal = requireOptionValue(args, index, "--goal");
        index += 1;
        break;
      case "--reviewer":
        options.reviewer = requireOptionValue(args, index, "--reviewer");
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

function printListResult(result) {
  if ((result.workflows || []).length === 0) {
    console.log("No UI design workflows.");
    return;
  }
  result.workflows.forEach((workflow) => {
    console.log([
      workflow.id,
      workflow.outputMode,
      workflow.notePathRelative || workflow.notePath,
      workflow.workspaceInProject ? "in-project" : "external-workspace-blocked",
    ].join(" | "));
  });
}

function printRunResult(result) {
  console.log([
    result.workflowId,
    result.review?.reviewStatus || (result.ok ? "accepted" : "needs-fix"),
    result.notePathRelative || result.notePath,
    result.artifactBase,
  ].join(" | "));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  if (options.command === "list") {
    const result = listUIDesignWorkflows(options.projectRoot);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    printListResult(result);
    return;
  }

  if (options.command === "run") {
    buildUIDesignDelegationTask(options.projectRoot, options.workflowId, {
      goal: options.goal,
    });
    const result = await runUIDesignWorkflow(options.projectRoot, options.workflowId, {
      goal: options.goal,
      reviewer: options.reviewer,
    });
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printRunResult(result);
    }
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
    console.error(`[agent-ui-design] ${failureInfo.errorCategoryLabel}: ${failureInfo.errorMessage}`);
    process.exit(1);
  });
}
