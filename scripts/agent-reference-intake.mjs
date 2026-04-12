import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  listReferenceIntakeRecords,
  recordReferenceIntake,
  resetReferenceIntakeRecords,
} from "./agent-reference-intake-lib.mjs";
import { buildScriptFailureInfo } from "./script-runtime-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

function parseArgs(argv) {
  const options = {
    command: "list",
    rawReferenceFiles: [],
    distinctReferenceProjects: [],
    json: false,
  };
  const args = Array.isArray(argv) ? argv.slice() : [];
  if (args[0] && !args[0].startsWith("--")) {
    options.command = args.shift();
  }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--session-id":
        options.sessionId = args[index + 1];
        index += 1;
        break;
      case "--task-id":
        options.taskId = args[index + 1];
        index += 1;
        break;
      case "--active-batch-id":
        options.activeBatchId = args[index + 1];
        index += 1;
        break;
      case "--topic-hint":
        options.topicHint = args[index + 1];
        index += 1;
        break;
      case "--router-miss-reason":
        options.routerMissReason = args[index + 1];
        index += 1;
        break;
      case "--raw-file":
      case "--raw-reference-file":
        options.rawReferenceFiles.push(args[index + 1]);
        index += 1;
        break;
      case "--project":
      case "--reference-project":
        options.distinctReferenceProjects.push(args[index + 1]);
        index += 1;
        break;
      case "--json":
        options.json = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === "record") {
    const result = await recordReferenceIntake(projectRoot, options);
    const latest = result.latestRecord || null;
    if (options.json) {
      console.log(JSON.stringify({
        ok: true,
        command: "record",
        latestRecord: latest,
        recordCount: result.records.length,
      }, null, 2));
      return;
    }
    console.log(`Reference intake recorded: ${latest?.intakeId || "-"} / ${latest?.status || "-"} / ${latest?.distillTargetDoc || "-"}`);
    return;
  }

  if (options.command === "reset") {
    const result = await resetReferenceIntakeRecords(projectRoot, options);
    if (options.json) {
      console.log(JSON.stringify({
        ok: true,
        command: "reset",
        ...result,
      }, null, 2));
      return;
    }
    console.log(`Reference intake reset: cleared ${result.clearedCount}, remaining ${result.remainingCount}`);
    return;
  }

  const records = await listReferenceIntakeRecords(projectRoot, options);
  if (options.json) {
    console.log(JSON.stringify({
      ok: true,
      command: "list",
      recordCount: records.length,
      records,
    }, null, 2));
    return;
  }
  if (records.length === 0) {
    console.log("No reference intake records.");
    return;
  }
  records.forEach((record) => {
    console.log(`${record.intakeId} | ${record.status} | ${record.topicHint} | ${record.thresholdReasons.rawReferenceFileCount} files / ${record.thresholdReasons.distinctReferenceProjectCount} projects`);
  });
}

main().catch((error) => {
  const failureInfo = buildScriptFailureInfo(error, {
    durationMs: Math.max(0, Date.now() - scriptStartedAt),
  });
  console.error(`[agent-reference-intake] ${failureInfo.errorCategoryLabel}: ${failureInfo.errorMessage}`);
  process.exit(1);
});
