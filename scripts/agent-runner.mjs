import { spawn } from "node:child_process";
import process from "node:process";
import {
  createRunRecord,
  finalizeRunRecord,
  saveRunRecord,
} from "./agent-telemetry-lib.mjs";

const MAX_LOG_TAIL = 4000;

function appendTail(current, chunk, limit = MAX_LOG_TAIL) {
  const next = `${current}${chunk}`;
  return next.length > limit ? next.slice(next.length - limit) : next;
}

function parseArgs(argv) {
  const [runName, ...rest] = argv;
  if (!runName) {
    return null;
  }

  const separatorIndex = rest.indexOf("--");
  if (separatorIndex < 0) {
    return null;
  }

  const commandParts = rest.slice(separatorIndex + 1);
  if (commandParts.length === 0) {
    return null;
  }

  return {
    runName,
    command: commandParts[0],
    args: commandParts.slice(1),
    commandLine: commandParts.join(" "),
  };
}

async function run() {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed) {
    console.error("Usage: node scripts/agent-runner.mjs <run-name> -- <command> [args...]");
    process.exit(1);
  }

  const runRecord = createRunRecord({
    runName: parsed.runName,
    command: parsed.command,
    args: parsed.args,
    metadata: {
      commandLine: parsed.commandLine,
    },
  });

  const child = spawn(parsed.command, parsed.args, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdoutTail = "";
  let stderrTail = "";
  let spawnError = null;

  if (child.stdout) {
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      process.stdout.write(text);
      stdoutTail = appendTail(stdoutTail, text);
    });
  }
  if (child.stderr) {
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      process.stderr.write(text);
      stderrTail = appendTail(stderrTail, text);
    });
  }

  const { exitCode, signal } = await new Promise((resolve) => {
    child.on("error", (error) => {
      spawnError = error?.message || String(error);
      resolve({ exitCode: 1, signal: null });
    });
    child.on("close", (code, closeSignal) => {
      resolve({ exitCode: code ?? 1, signal: closeSignal || null });
    });
  });

  const finalized = finalizeRunRecord(runRecord, {
    exitCode,
    metadata: {
      signal,
      spawnError,
      stdoutTail: stdoutTail.trim() || null,
      stderrTail: stderrTail.trim() || null,
    },
  });
  const filePath = await saveRunRecord(finalized);
  console.log(`Agent run telemetry saved: ${filePath}`);

  process.exit(finalized.exitCode);
}

run().catch((error) => {
  console.error(error?.message || String(error));
  process.exit(1);
});
