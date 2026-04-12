import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { runReferenceDistillation } from "./agent-reference-distill-lib.mjs";
import { buildScriptFailureInfo } from "./script-runtime-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

function parseArgs(argv) {
  const options = {
    intakeId: null,
    json: false,
  };
  const args = Array.isArray(argv) ? argv.slice() : [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--intake-id":
        options.intakeId = args[index + 1];
        index += 1;
        break;
      case "--json":
        options.json = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (!options.intakeId) {
    throw new Error("--intake-id is required");
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await runReferenceDistillation(projectRoot, options);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== "distilled") {
      process.exit(1);
    }
    return;
  }
  console.log(`Reference distillation ${result.status}: ${result.topicHint || result.topicKey || "-"} -> ${result.targetDoc || "-"}`);
  if (result.status !== "distilled") {
    process.exit(1);
  }
}

main().catch((error) => {
  const failureInfo = buildScriptFailureInfo(error, {
    durationMs: Math.max(0, Date.now() - scriptStartedAt),
  });
  console.error(`[agent-reference-distill] ${failureInfo.errorCategoryLabel}: ${failureInfo.errorMessage}`);
  process.exit(1);
});
