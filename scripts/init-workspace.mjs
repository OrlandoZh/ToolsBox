import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveAgentArtifactPath } from "./agent-artifacts.mjs";
import { evaluateObsidianWorkspaceGuard } from "./agent-obsidian-guard-lib.mjs";
import { cleanProvenanceSensitiveArtifacts } from "./agent-provenance-lib.mjs";
import { resolveObsidianWorkspaceFiles } from "./agent-obsidian-workspace.mjs";
import {
  buildScriptFailureInfo,
  createScriptError,
  writeJSONArtifact,
} from "./script-runtime-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

function execNodeScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [scriptPath, ...args], {
      cwd: projectRoot,
      env: process.env,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    }, (error, stdout = "", stderr = "") => {
      if (error) {
        reject(createScriptError("execution", `Failed to run ${path.basename(scriptPath)}`, {
          failedStage: "run-handoff",
          details: {
            scriptPath,
            exitCode: error.code ?? null,
            stdoutTail: stdout.trim().split("\n").slice(-8).join("\n"),
            stderrTail: stderr.trim().split("\n").slice(-8).join("\n"),
          },
          cause: error,
        }));
        return;
      }
      resolve({
        stdout,
        stderr,
      });
    });
  });
}

async function main() {
  const defaultWorkspace = resolveObsidianWorkspaceFiles(projectRoot, {});
  const cleanedArtifactPaths = await cleanProvenanceSensitiveArtifacts(projectRoot);
  await fs.rm(defaultWorkspace.dir, { recursive: true, force: true });

  const handoffScript = path.join(projectRoot, "scripts", "agent-obsidian-handoff.mjs");
  await execNodeScript(handoffScript, ["--bootstrap-shell"]);

  const guard = await evaluateObsidianWorkspaceGuard(projectRoot, {
    strict: true,
    scope: "path",
    env: process.env,
  });
  const projectRootCanonical = await fs.realpath(projectRoot).catch(() => projectRoot);
  const durationMs = Math.max(0, Date.now() - scriptStartedAt);
  const report = {
    generatedAt: new Date().toISOString(),
    success: guard.ok,
    markerVersion: 1,
    projectRoot,
    projectRootCanonical,
    cleanedWorkspaceDir: defaultWorkspace.dir,
    cleanedArtifactPaths,
    guard,
    durationMs,
    errorCategory: null,
    errorCategoryLabel: null,
    errorMessage: null,
    failedStage: null,
  };

  const reportPath = resolveAgentArtifactPath(projectRoot, "init-workspace.json");
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await writeJSONArtifact(reportPath, report);

  console.log(`Workspace initialized: cleaned ${defaultWorkspace.dir}`);
  console.log(`Workspace initialized: cleaned ${cleanedArtifactPaths.length} provenance-sensitive artifact targets`);
  console.log(`Obsidian workspace guard (strict): ${guard.status}`);
  if (guard.violation) {
    process.exit(2);
  }
}

main().catch(async (error) => {
  const failureInfo = buildScriptFailureInfo(error, {
    durationMs: Math.max(0, Date.now() - scriptStartedAt),
  });
  const reportPath = resolveAgentArtifactPath(projectRoot, "init-workspace.json");
  try {
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await writeJSONArtifact(reportPath, {
      generatedAt: new Date().toISOString(),
      success: false,
      cleanedWorkspaceDir: null,
      cleanedArtifactPaths: [],
      guard: null,
      ...failureInfo,
    });
  } catch {
    // ignore secondary failure
  }
  console.error(`[init-workspace] ${failureInfo.errorCategoryLabel}: ${failureInfo.errorMessage}`);
  process.exit(1);
});
