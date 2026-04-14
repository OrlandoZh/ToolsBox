import { execFile } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { refreshGateObsidianGuardSnapshot } from "./agent-gate.mjs";
import {
  buildScriptFailureInfo,
  createScriptError,
  isExecutedAsScript,
} from "./script-runtime-lib.mjs";
import { refreshEvidenceChain } from "./agent-sync-evidence-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

function resolveNpmExecutable() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function runNpmScript(scriptName, { allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    execFile(resolveNpmExecutable(), ["run", scriptName], {
      cwd: projectRoot,
      env: process.env,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    }, (error, stdout = "", stderr = "") => {
      if (error && !allowFailure) {
        reject(createScriptError("execution", `Failed to run npm run ${scriptName}`, {
          failedStage: scriptName,
          details: {
            scriptName,
            exitCode: error.code ?? null,
            stdoutTail: stdout.trim().split("\n").slice(-12).join("\n"),
            stderrTail: stderr.trim().split("\n").slice(-12).join("\n"),
          },
          cause: error,
        }));
        return;
      }
      resolve({
        code: error?.code ?? 0,
        stdout,
        stderr,
      });
    });
  });
}

export async function synchronizeGateAfterObsidian(targetProjectRoot = projectRoot) {
  return await refreshGateObsidianGuardSnapshot(targetProjectRoot, {
    env: process.env,
  });
}

async function main() {
  const gateResult = await runNpmScript("agent:gate", { allowFailure: true });
  const contextGuardResult = await runNpmScript("agent:context:guard:strict", { allowFailure: true });
  if (contextGuardResult.code !== 0) {
    process.exit(contextGuardResult.code);
  }
  await runNpmScript("agent:obsidian");
  const guardResult = await runNpmScript("agent:obsidian:guard:strict", { allowFailure: true });
  await synchronizeGateAfterObsidian(projectRoot);
  const referenceDrainResult = guardResult.code === 0
    ? await runNpmScript("agent:reference:drain", { allowFailure: true })
    : { code: 0, stdout: "", stderr: "" };

  if (guardResult.code !== 0) {
    process.exit(guardResult.code);
  }
  if (gateResult.code !== 0) {
    console.log("Agent sync completed with a blocked gate; Obsidian workspace has still been refreshed to the latest project state.");
    process.exit(gateResult.code);
  }
  if (referenceDrainResult.code !== 0) {
    console.log("Agent sync completed, but reference distillation drain did not finish cleanly; the main gate/context/obsidian chain remains aligned.");
    return;
  }

  // 证据链刷新：将当前 gate/monitor/e2e 工件中的证据摘要合并为一条带时间戳的证据链
  try {
    await refreshEvidenceChain(projectRoot);
  } catch (error) {
    // 证据链刷新失败不阻塞 sync 主链，只记录 warning
    console.warn("[agent-sync] Evidence chain refresh failed (non-blocking):", error.message);
  }

  console.log("Agent sync completed: gate chain, agent-context, obsidian handoff, evidence chain, and strict Obsidian guard are aligned.");
}

if (isExecutedAsScript(import.meta.url)) {
  main().catch((error) => {
    const failureInfo = buildScriptFailureInfo(error, {
      durationMs: Math.max(0, Date.now() - scriptStartedAt),
    });
    console.error(`[agent-sync] ${failureInfo.errorCategoryLabel}: ${failureInfo.errorMessage}`);
    process.exit(1);
  });
}
