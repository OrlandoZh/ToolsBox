import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { resolveAgentArtifactPath } from "./agent-artifacts.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function getAgentRunsDir() {
  return resolveAgentArtifactPath(projectRoot, "agent-runs");
}

function sanitizeName(input, fallback = "run") {
  const normalized = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function toISO(value) {
  return new Date(value).toISOString();
}

export async function ensureAgentRunsDir() {
  const dir = getAgentRunsDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export function createRunRecord({
  runName,
  command,
  args = [],
  metadata = {},
  cwd = process.cwd(),
}) {
  const startedAt = Date.now();
  return {
    id: randomUUID(),
    runName: sanitizeName(runName),
    command,
    args,
    cwd,
    status: "running",
    startedAt,
    startedAtISO: toISO(startedAt),
    finishedAt: null,
    finishedAtISO: null,
    durationMs: null,
    exitCode: null,
    success: null,
    metadata,
  };
}

export function finalizeRunRecord(record, { exitCode = 0, metadata = {} } = {}) {
  const finishedAt = Date.now();
  const durationMs = Math.max(0, finishedAt - Number(record.startedAt || finishedAt));
  const success = Number(exitCode) === 0;

  return {
    ...record,
    status: success ? "passed" : "failed",
    finishedAt,
    finishedAtISO: toISO(finishedAt),
    durationMs,
    exitCode: Number(exitCode),
    success,
    metadata: {
      ...(record.metadata || {}),
      ...(metadata || {}),
    },
  };
}

export async function saveRunRecord(record) {
  const dir = await ensureAgentRunsDir();
  const fileName = `${record.startedAt}-${record.runName}-${record.id}.json`;
  const target = path.join(dir, fileName);
  await fs.writeFile(target, `${JSON.stringify(record, null, 2)}\n`, "utf-8");
  await fs.writeFile(path.join(dir, "latest.json"), `${JSON.stringify(record, null, 2)}\n`, "utf-8");
  return target;
}

export async function listRunRecords() {
  const dir = await ensureAgentRunsDir();
  const entries = await fs.readdir(dir);
  const targets = entries
    .filter((entry) => entry.endsWith(".json") && entry !== "latest.json")
    .map((entry) => path.join(dir, entry))
    .sort();

  const runs = [];
  for (const filePath of targets) {
    const content = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(content);
    runs.push({ filePath, ...parsed });
  }

  runs.sort((a, b) => Number(b.startedAt || 0) - Number(a.startedAt || 0));
  return runs;
}
