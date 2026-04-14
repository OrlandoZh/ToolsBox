import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveAgentArtifactPath } from "./agent-artifacts.mjs";
import { buildScriptFailureInfo, isExecutedAsScript } from "./script-runtime-lib.mjs";
import { runAgentDeadChainAudit } from "./agent-dead-chain-audit-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultProjectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

function parseArgs(argv) {
  const options = {
    projectRoot: defaultProjectRoot,
    reportDir: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = String(argv[index] || "").trim();
    if (arg === "--project-root") {
      options.projectRoot = path.resolve(String(argv[index + 1] || "").trim());
      index += 1;
      continue;
    }
    if (arg === "--report-dir") {
      options.reportDir = path.resolve(String(argv[index + 1] || "").trim());
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const report = await runAgentDeadChainAudit(options);
  const reportPath = options.reportDir
    ? path.join(options.reportDir, "agent-dead-chain-audit.json")
    : resolveAgentArtifactPath(options.projectRoot, "agent-dead-chain-audit.json");
  console.log(`Agent dead-chain audit ${report.status}: ${reportPath}`);
}

if (isExecutedAsScript(import.meta.url)) {
  main().catch((error) => {
    const failureInfo = buildScriptFailureInfo(error, {
      durationMs: Math.max(0, Date.now() - scriptStartedAt),
    });
    console.error(`[agent-dead-chain-audit] ${failureInfo.errorCategoryLabel}: ${failureInfo.errorMessage}`);
    process.exit(1);
  });
}
