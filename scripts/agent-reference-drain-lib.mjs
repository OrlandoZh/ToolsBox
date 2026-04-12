import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getReferenceIntakeRecord,
  listReferenceIntakeRecords,
  loadReferenceDistillationState,
  updateReferenceIntakeStatus,
} from "./agent-reference-intake-lib.mjs";
import { hasSuccessfulDistillationForSource, runReferenceDistillation } from "./agent-reference-distill-lib.mjs";
import { resolveAgentArtifactPath } from "./agent-artifacts.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_DISTILL_SCRIPT_PATH = path.join(__dirname, "agent-reference-distill.mjs");

function normalizeString(value) {
  return String(value || "").trim();
}

async function loadJSONIfExists(filePath) {
  try {
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function loadSyncAlignment(projectRoot) {
  const [gate, context] = await Promise.all([
    loadJSONIfExists(resolveAgentArtifactPath(projectRoot, "agent-gate.json")),
    loadJSONIfExists(resolveAgentArtifactPath(projectRoot, "agent-context.json")),
  ]);
  const gatePassed = gate?.gatePassed === true;
  const alignmentStatus = String(context?.runtimeCompact?.alignmentRef?.status || context?.sourceAlignment?.status || "").trim();
  const alignmentStage = String(context?.runtimeCompact?.alignmentRef?.generationStage || context?.sourceAlignment?.generationStage || "").trim();
  return {
    gatePassed,
    alignmentStatus,
    alignmentStage,
    syncSettled: gatePassed && alignmentStatus === "aligned" && alignmentStage === "post-gate",
  };
}

function defaultBackgroundScheduler(projectRoot, intakeId) {
  const child = spawn(process.execPath, [DEFAULT_DISTILL_SCRIPT_PATH, "--intake-id", intakeId], {
    cwd: projectRoot,
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
  return {
    scheduled: true,
    mode: "background",
    pid: child.pid ?? null,
  };
}

export async function drainReferenceDistillationQueue(projectRoot, options = {}) {
  const alignment = await loadSyncAlignment(projectRoot);
  const allRecords = await listReferenceIntakeRecords(projectRoot);
  const runDistillation = typeof options.runReferenceDistillation === "function"
    ? options.runReferenceDistillation
    : runReferenceDistillation;
  const candidates = allRecords
    .filter((record) => record.status === "pending" && record.thresholdMatched === true)
    .sort((a, b) => String(a.updatedAt || "").localeCompare(String(b.updatedAt || "")));

  if (!alignment.syncSettled) {
    return {
      status: "pending",
      queuedCount: 0,
      pendingCount: candidates.length,
      skippedCount: 0,
      reason: "sync-not-settled",
      alignment,
    };
  }

  const background = options.background !== false;
  const scheduleBackground = typeof options.scheduleBackground === "function"
    ? options.scheduleBackground
    : defaultBackgroundScheduler;
  const queued = [];
  const skipped = [];
  const queuedTopicKeys = new Set(
    allRecords
      .filter((record) => record.status === "queued")
      .map((record) => record.topicKey)
      .filter(Boolean),
  );

  for (const candidate of candidates) {
    const freshRecord = await getReferenceIntakeRecord(projectRoot, candidate.intakeId);
    if (!freshRecord || freshRecord.status !== "pending" || freshRecord.thresholdMatched !== true) {
      continue;
    }
    const sameTopicQueued = Boolean(freshRecord.topicKey) && queuedTopicKeys.has(freshRecord.topicKey);
    if (sameTopicQueued) {
      skipped.push({
        intakeId: freshRecord.intakeId,
        reason: "same-topic-already-queued",
      });
      continue;
    }
    if (await hasSuccessfulDistillationForSource(projectRoot, freshRecord)) {
      await updateReferenceIntakeStatus(projectRoot, freshRecord.intakeId, {
        status: "skipped",
        statusReason: "already-distilled-same-session-source",
      });
      skipped.push({
        intakeId: freshRecord.intakeId,
        reason: "already-distilled-same-session-source",
      });
      continue;
    }

    await updateReferenceIntakeStatus(projectRoot, freshRecord.intakeId, {
      status: "queued",
      statusReason: background ? "queued-in-background" : "queued-foreground",
    });
    if (freshRecord.topicKey) {
      queuedTopicKeys.add(freshRecord.topicKey);
    }
    if (background) {
      const scheduled = await Promise.resolve(scheduleBackground(projectRoot, freshRecord.intakeId, {
        projectRoot,
        intake: freshRecord,
      }));
      queued.push({
        intakeId: freshRecord.intakeId,
        mode: scheduled?.mode || "background",
        pid: scheduled?.pid ?? null,
      });
    } else {
      const run = await runDistillation(projectRoot, { intakeId: freshRecord.intakeId });
      queued.push({
        intakeId: freshRecord.intakeId,
        mode: "foreground",
        runId: run.runId,
        status: run.status,
      });
    }
  }

  const state = await loadReferenceDistillationState(projectRoot);
  return {
    status: background && queued.length > 0 ? "queued" : state.status,
    queuedCount: queued.length,
    pendingCount: state.pendingCount,
    skippedCount: skipped.length,
    alignment,
    queued,
    skipped,
  };
}
