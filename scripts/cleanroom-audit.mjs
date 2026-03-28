import path from "node:path";
import { fileURLToPath } from "node:url";
import { createScriptError } from "./script-runtime-lib.mjs";
import { runCleanroomAudit } from "./cleanroom-audit-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultProjectRoot = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const options = {
    mode: "dev",
    projectRoot: defaultProjectRoot,
    referenceRoot: null,
    reportDir: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--mode") {
      options.mode = String(argv[index + 1] || "").trim() || "dev";
      index += 1;
      continue;
    }
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
  const report = await runCleanroomAudit(options);
  const outputPath = path.join(options.reportDir || path.join(options.projectRoot, "dist"), "cleanroom-audit.json");
  if (report.status !== "passed") {
    throw createScriptError("validation", `Clean-room audit failed: ${report.blockers.join(" | ")}`, {
      failedStage: "evaluate-audit",
    });
  }
  console.log(`Clean-room audit passed: ${outputPath}`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
