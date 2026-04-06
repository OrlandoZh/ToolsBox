import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  buildAgentContextGuardIssue,
  buildAgentContextGuardRecommendation,
  evaluateAgentContextGuard,
} from "./agent-context-guard-lib.mjs";
import {
  buildScriptFailureInfo,
  createScriptError,
} from "./script-runtime-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

function parseArgs(argv) {
  const options = {
    strict: false,
  };
  for (const arg of argv) {
    if (arg === "--strict") {
      options.strict = true;
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
  const result = await evaluateAgentContextGuard(projectRoot, {
    strict: options.strict,
  });
  const issue = buildAgentContextGuardIssue(result);
  const recommendation = buildAgentContextGuardRecommendation(result);
  const modeLabel = options.strict ? "strict" : "warn";

  console.log(`Agent context guard (${modeLabel}): ${result.status}`);
  console.log(result.message);
  if (issue) {
    console.log(`Issue: ${issue}`);
  }
  if (recommendation) {
    console.log(`Recommendation: ${recommendation}`);
  }

  if (result.violation && options.strict) {
    process.exit(2);
  }
}

main().catch((error) => {
  const failureInfo = buildScriptFailureInfo(error, {
    durationMs: Math.max(0, Date.now() - scriptStartedAt),
  });
  console.error(`[agent-context-guard] ${failureInfo.errorCategoryLabel}: ${failureInfo.errorMessage}`);
  process.exit(1);
});
