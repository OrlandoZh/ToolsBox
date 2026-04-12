import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  listManagedReferenceProjects,
  updateManagedReferenceProjects,
} from "./agent-reference-update-lib.mjs";
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
    "Usage: node scripts/agent-reference-update.mjs [list|update] [options]",
    "",
    "Options:",
    "  --project <id>         Select a managed reference project (repeatable)",
    "  --all                  Select all managed reference projects",
    "  --allow-dirty          Allow resetting a dirty git-backed target in place",
    "  --replace-existing     Backup and replace non-git / dirty / mismatched targets",
    "  --project-root <path>  Override project root",
    "  --json                 Print JSON output",
    "  --help, -h             Show this help",
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
    projectIds: [],
    all: false,
    allowDirty: false,
    replaceExisting: false,
    json: false,
    help: false,
    projectRoot: defaultProjectRoot,
  };

  const args = Array.isArray(argv) ? argv.slice() : [];
  if (args[0] && !args[0].startsWith("--")) {
    options.command = args.shift();
  }

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    switch (token) {
      case "--project":
        options.projectIds.push(requireOptionValue(args, index, "--project"));
        index += 1;
        break;
      case "--all":
        options.all = true;
        break;
      case "--allow-dirty":
        options.allowDirty = true;
        break;
      case "--replace-existing":
        options.replaceExisting = true;
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

function formatLocalState(localState) {
  if (!localState?.exists) {
    return "missing";
  }
  if (localState.kind !== "git") {
    return "non-git";
  }
  return [
    "git",
    localState.dirty ? "dirty" : "clean",
    localState.currentCommitShort || "-",
  ].join(" / ");
}

function printListResult(result) {
  if ((result.projects || []).length === 0) {
    console.log("No managed reference projects.");
    return;
  }
  result.projects.forEach((project) => {
    console.log([
      project.id,
      project.enabled ? "enabled" : "disabled",
      project.targetPath,
      `${project.source.refType}:${project.source.ref}`,
      formatLocalState(project.localState),
    ].join(" | "));
  });
}

function printUpdateResult(result) {
  if ((result.results || []).length === 0) {
    console.log("No reference projects were updated.");
    return;
  }
  result.results.forEach((entry) => {
    const before = entry.beforeState?.currentCommitShort || "-";
    const after = entry.afterState?.currentCommitShort || before;
    const backup = entry.backupPath ? ` | backup ${entry.backupPath}` : "";
    const error = entry.errorMessage ? ` | ${entry.errorMessage}` : "";
    console.log(`${entry.id} | ${entry.status} | ${entry.reason} | ${before} -> ${after}${backup}${error}`);
  });
  console.log(`Reference update artifact: ${result.artifactPath}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  if (options.command === "list") {
    const result = await listManagedReferenceProjects(options.projectRoot, options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    printListResult(result);
    return;
  }

  if (options.command === "update") {
    const result = await updateManagedReferenceProjects(options.projectRoot, options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printUpdateResult(result);
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
    console.error(`[agent-reference-update] ${failureInfo.errorCategoryLabel}: ${failureInfo.errorMessage}`);
    process.exit(1);
  });
}
