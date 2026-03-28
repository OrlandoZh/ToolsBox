import path from "node:path";
import {
  applyCurrentTruthSyncPlan,
  buildCurrentTruthSyncPlan,
} from "./docs-current-truth-lib.mjs";

function printUsage() {
  console.log(`Usage: node scripts/docs-sync-current-truth.mjs [--check] [--project-root <path>]`);
}

function parseArgs(argv) {
  const options = {
    check: false,
    projectRoot: process.cwd(),
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--check") {
      options.check = true;
      continue;
    }
    if (token === "--project-root") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new Error("--project-root requires a value");
      }
      options.projectRoot = nextValue;
      index += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const rootDir = path.resolve(options.projectRoot || process.cwd());
  const plan = buildCurrentTruthSyncPlan({ rootDir });

  if (options.check) {
    if (plan.changedFiles.length > 0) {
      const files = plan.changedFiles.map((entry) => `- ${entry.relativePath}`).join("\n");
      console.error(`Current truth summary drift detected:\n${files}`);
      process.exitCode = 1;
      return;
    }
    console.log("Current truth summary blocks are in sync.");
    return;
  }

  const updatedFiles = applyCurrentTruthSyncPlan(plan);
  if (updatedFiles.length === 0) {
    console.log("Current truth summary blocks already synchronized.");
    return;
  }

  console.log(`Updated current truth summary blocks in ${updatedFiles.length} file(s):`);
  for (const file of updatedFiles) {
    console.log(`- ${file}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
