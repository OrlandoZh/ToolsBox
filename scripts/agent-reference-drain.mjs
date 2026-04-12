import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { drainReferenceDistillationQueue } from "./agent-reference-drain-lib.mjs";
import { buildScriptFailureInfo } from "./script-runtime-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

function parseArgs(argv) {
  const options = {
    background: true,
    json: false,
  };
  const args = Array.isArray(argv) ? argv.slice() : [];
  for (const arg of args) {
    if (arg === "--foreground") {
      options.background = false;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await drainReferenceDistillationQueue(projectRoot, options);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Reference distillation drain: ${result.status} / queued ${result.queuedCount} / pending ${result.pendingCount}`);
}

main().catch((error) => {
  const failureInfo = buildScriptFailureInfo(error, {
    durationMs: Math.max(0, Date.now() - scriptStartedAt),
  });
  console.error(`[agent-reference-drain] ${failureInfo.errorCategoryLabel}: ${failureInfo.errorMessage}`);
  process.exit(1);
});
