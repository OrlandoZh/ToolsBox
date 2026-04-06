import { execFile } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  buildScriptFailureInfo,
  createScriptError,
} from "./script-runtime-lib.mjs";

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

async function main() {
  const gateResult = await runNpmScript("agent:gate", { allowFailure: true });
  await runNpmScript("agent:obsidian");
  const guardResult = await runNpmScript("agent:obsidian:guard:strict", { allowFailure: true });

  if (guardResult.code !== 0) {
    process.exit(guardResult.code);
  }
  if (gateResult.code !== 0) {
    console.log("Agent sync completed with a blocked gate; Obsidian workspace has still been refreshed to the latest project state.");
    process.exit(gateResult.code);
  }
  console.log("Agent sync completed: gate chain, agent-context, obsidian handoff, and strict Obsidian guard are aligned.");
}

main().catch((error) => {
  const failureInfo = buildScriptFailureInfo(error, {
    durationMs: Math.max(0, Date.now() - scriptStartedAt),
  });
  console.error(`[agent-sync] ${failureInfo.errorCategoryLabel}: ${failureInfo.errorMessage}`);
  process.exit(1);
});
