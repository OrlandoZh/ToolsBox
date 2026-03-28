import path from "node:path";
import { fileURLToPath } from "node:url";
import { createScriptError } from "./script-runtime-lib.mjs";
import { runCleanroomSimilarity } from "./cleanroom-audit-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultProjectRoot = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const options = {
    projectRoot: defaultProjectRoot,
    referenceRoot: null,
    reportDir: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--project-root") {
      options.projectRoot = path.resolve(String(argv[index + 1] || "").trim());
      index += 1;
      continue;
    }
    if (arg === "--reference-root") {
      options.referenceRoot = path.resolve(String(argv[index + 1] || "").trim());
      index += 1;
      continue;
    }
    if (arg === "--report-dir") {
      options.reportDir = path.resolve(String(argv[index + 1] || "").trim());
      index += 1;
      continue;
    }
    throw createScriptError("args", `Unknown option: ${arg}`, {
      failedStage: "parse-args",
    });
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await runCleanroomSimilarity(options);
  console.log(`Clean-room similarity ${report.status}: ${path.join(options.reportDir || path.join(options.projectRoot, "dist"), "cleanroom-similarity.json")}`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
