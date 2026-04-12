import { promises as fs } from "node:fs";
import path from "node:path";
import {
  resolveAgentReferenceDistillArtifacts,
  resolveAgentReferenceIntakeArtifacts,
} from "./agent-artifacts.mjs";
import {
  collectDistinctReferenceProjects,
  filterRawReferenceFiles,
  hashShort,
  normalizeRepoRelativePath,
  normalizeTopicHint,
  resolveReferenceTopicTarget,
} from "./agent-reference-shared-lib.mjs";
import { writeJSONArtifact } from "./script-runtime-lib.mjs";

export const AGENT_REFERENCE_INTAKE_SCHEMA_VERSION = 1;
export const AGENT_REFERENCE_INTAKE_STATUSES = Object.freeze([
  "pending",
  "queued",
  "distilled",
  "skipped",
  "failed",
]);

function normalizeString(value) {
  return String(value || "").trim();
}

function dedupeStrings(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((item) => normalizeString(item))
      .filter(Boolean),
  )).sort((a, b) => a.localeCompare(b, "en"));
}

function sanitizeRecord(record) {
  if (!record || typeof record !== "object") {
    return null;
  }
  return {
    schemaVersion: Number(record.schemaVersion || AGENT_REFERENCE_INTAKE_SCHEMA_VERSION),
    intakeId: normalizeString(record.intakeId) || null,
    sessionId: normalizeString(record.sessionId) || null,
    taskId: normalizeString(record.taskId) || null,
    activeBatchId: normalizeString(record.activeBatchId) || null,
    topicHint: normalizeTopicHint(record.topicHint),
    topicKey: normalizeString(record.topicKey) || null,
    routerMissReason: normalizeString(record.routerMissReason) || null,
    rawReferenceFiles: filterRawReferenceFiles(record.rawReferenceFiles),
    distinctReferenceProjects: dedupeStrings(record.distinctReferenceProjects),
    thresholdMatched: record.thresholdMatched === true,
    thresholdReasons: {
      rawReferenceFileCount: Number(record.thresholdReasons?.rawReferenceFileCount || 0),
      distinctReferenceProjectCount: Number(record.thresholdReasons?.distinctReferenceProjectCount || 0),
      fileThresholdMatched: record.thresholdReasons?.fileThresholdMatched === true,
      projectThresholdMatched: record.thresholdReasons?.projectThresholdMatched === true,
    },
    status: AGENT_REFERENCE_INTAKE_STATUSES.includes(record.status) ? record.status : "pending",
    statusReason: normalizeString(record.statusReason) || null,
    distillTargetDoc: normalizeRepoRelativePath(record.distillTargetDoc),
    sourceFingerprint: normalizeString(record.sourceFingerprint) || null,
    lastDistilledSourceFingerprint: normalizeString(record.lastDistilledSourceFingerprint) || null,
    lastDistillRunId: normalizeString(record.lastDistillRunId) || null,
    createdAt: normalizeString(record.createdAt) || null,
    updatedAt: normalizeString(record.updatedAt) || null,
    queuedAt: normalizeString(record.queuedAt) || null,
    distilledAt: normalizeString(record.distilledAt) || null,
    failedAt: normalizeString(record.failedAt) || null,
    skippedAt: normalizeString(record.skippedAt) || null,
  };
}

function buildIntakeThreshold(rawReferenceFiles, distinctReferenceProjects) {
  const rawReferenceFileCount = filterRawReferenceFiles(rawReferenceFiles).length;
  const distinctReferenceProjectCount = dedupeStrings(distinctReferenceProjects).length;
  const fileThresholdMatched = rawReferenceFileCount >= 3;
  const projectThresholdMatched = distinctReferenceProjectCount >= 2;
  return {
    thresholdMatched: fileThresholdMatched || projectThresholdMatched,
    thresholdReasons: {
      rawReferenceFileCount,
      distinctReferenceProjectCount,
      fileThresholdMatched,
      projectThresholdMatched,
    },
  };
}

function buildIntakeId({ sessionId, taskId, topicHint }) {
  return `ref-intake-${hashShort({
    sessionId: normalizeString(sessionId) || "default-session",
    taskId: normalizeString(taskId) || "default-task",
    topicHint: normalizeTopicHint(topicHint),
  })}`;
}

async function readIndexFile(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(content);
    return Array.isArray(parsed?.records)
      ? parsed.records.map((item) => sanitizeRecord(item)).filter(Boolean)
      : [];
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writeIndexFiles(projectRoot, records, latestRecord = null) {
  const artifacts = resolveAgentReferenceIntakeArtifacts(projectRoot);
  const sanitizedRecords = records
    .map((item) => sanitizeRecord(item))
    .filter(Boolean)
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  const latest = latestRecord
    ? sanitizeRecord(latestRecord)
    : sanitizedRecords[0] || null;

  await fs.mkdir(artifacts.archiveDir, { recursive: true });
  await Promise.all([
    writeJSONArtifact(artifacts.indexJSON, {
      schemaVersion: AGENT_REFERENCE_INTAKE_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      recordCount: sanitizedRecords.length,
      records: sanitizedRecords,
    }),
    writeJSONArtifact(artifacts.latestJSON, {
      schemaVersion: AGENT_REFERENCE_INTAKE_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      recordCount: sanitizedRecords.length,
      latestRecord: latest,
    }),
  ]);
  return {
    indexJSON: artifacts.indexJSON,
    latestJSON: artifacts.latestJSON,
    records: sanitizedRecords,
    latestRecord: latest,
  };
}

export async function listReferenceIntakeRecords(projectRoot, options = {}) {
  const artifacts = resolveAgentReferenceIntakeArtifacts(projectRoot);
  const records = await readIndexFile(artifacts.indexJSON);
  const sessionId = normalizeString(options.sessionId);
  const taskId = normalizeString(options.taskId);
  const topicHint = normalizeString(options.topicHint);
  return records.filter((record) => {
    if (sessionId && record.sessionId !== sessionId) {
      return false;
    }
    if (taskId && record.taskId !== taskId) {
      return false;
    }
    if (topicHint && record.topicHint !== topicHint) {
      return false;
    }
    return true;
  });
}

export async function getReferenceIntakeRecord(projectRoot, intakeId) {
  const records = await listReferenceIntakeRecords(projectRoot);
  return records.find((record) => record.intakeId === normalizeString(intakeId)) || null;
}

export async function recordReferenceIntake(projectRoot, payload = {}, options = {}) {
  const now = normalizeString(options.now) || new Date().toISOString();
  const artifacts = resolveAgentReferenceIntakeArtifacts(projectRoot);
  const records = await readIndexFile(artifacts.indexJSON);
  const topic = await resolveReferenceTopicTarget(projectRoot, payload.topicHint);
  const rawReferenceFiles = filterRawReferenceFiles(payload.rawReferenceFiles);
  const distinctReferenceProjects = dedupeStrings([
    ...collectDistinctReferenceProjects(rawReferenceFiles),
    ...dedupeStrings(payload.distinctReferenceProjects),
  ]);
  const intakeId = buildIntakeId({
    sessionId: payload.sessionId,
    taskId: payload.taskId,
    topicHint: topic.topicHint,
  });
  const existingIndex = records.findIndex((record) => record.intakeId === intakeId);
  const existing = existingIndex >= 0 ? records[existingIndex] : null;
  const mergedRawReferenceFiles = Array.from(new Set([
    ...(existing?.rawReferenceFiles || []),
    ...rawReferenceFiles,
  ])).sort((a, b) => a.localeCompare(b, "en"));
  const mergedDistinctReferenceProjects = Array.from(new Set([
    ...(existing?.distinctReferenceProjects || []),
    ...distinctReferenceProjects,
  ])).sort((a, b) => a.localeCompare(b, "en"));
  const threshold = buildIntakeThreshold(mergedRawReferenceFiles, mergedDistinctReferenceProjects);
  const sourceFingerprint = hashShort({
    rawReferenceFiles: mergedRawReferenceFiles,
    distinctReferenceProjects: mergedDistinctReferenceProjects,
  }, 16);

  let status = mergedRawReferenceFiles.length === 0
    ? "skipped"
    : threshold.thresholdMatched
      ? "pending"
      : "pending";
  let statusReason = mergedRawReferenceFiles.length === 0
    ? "no-raw-reference-input"
    : threshold.thresholdMatched
      ? "threshold-matched"
      : "threshold-not-yet-matched";

  if (
    existing
    && existing.sourceFingerprint === sourceFingerprint
    && existing.status === "distilled"
  ) {
    status = "distilled";
    statusReason = "already-distilled-same-source";
  } else if (
    existing
    && existing.sourceFingerprint === sourceFingerprint
    && existing.status === "queued"
  ) {
    status = "queued";
    statusReason = "already-queued-same-source";
  } else if (
    existing
    && existing.sourceFingerprint === sourceFingerprint
    && existing.status === "failed"
  ) {
    status = "failed";
    statusReason = "previous-failed-same-source";
  }

  const record = sanitizeRecord({
    ...existing,
    schemaVersion: AGENT_REFERENCE_INTAKE_SCHEMA_VERSION,
    intakeId,
    sessionId: normalizeString(payload.sessionId) || existing?.sessionId || "default-session",
    taskId: normalizeString(payload.taskId) || existing?.taskId || "default-task",
    activeBatchId: normalizeString(payload.activeBatchId) || existing?.activeBatchId || null,
    topicHint: topic.topicHint,
    topicKey: topic.topicKey,
    routerMissReason: normalizeString(payload.routerMissReason) || existing?.routerMissReason || null,
    rawReferenceFiles: mergedRawReferenceFiles,
    distinctReferenceProjects: mergedDistinctReferenceProjects,
    thresholdMatched: threshold.thresholdMatched,
    thresholdReasons: threshold.thresholdReasons,
    status,
    statusReason,
    distillTargetDoc: topic.targetDoc,
    sourceFingerprint,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });

  if (record.status === "skipped") {
    record.skippedAt = now;
  }

  if (existingIndex >= 0) {
    records.splice(existingIndex, 1, record);
  } else {
    records.push(record);
  }
  return await writeIndexFiles(projectRoot, records, record);
}

export async function updateReferenceIntakeStatus(projectRoot, intakeId, updates = {}, options = {}) {
  const now = normalizeString(options.now) || new Date().toISOString();
  const artifacts = resolveAgentReferenceIntakeArtifacts(projectRoot);
  const records = await readIndexFile(artifacts.indexJSON);
  const recordIndex = records.findIndex((item) => item.intakeId === normalizeString(intakeId));
  if (recordIndex < 0) {
    return null;
  }

  const next = sanitizeRecord({
    ...records[recordIndex],
    ...updates,
    updatedAt: now,
  });
  if (!next) {
    return null;
  }
  if (next.status === "queued") {
    next.queuedAt = now;
  }
  if (next.status === "distilled") {
    next.distilledAt = normalizeString(updates.distilledAt) || now;
    next.lastDistilledSourceFingerprint = next.sourceFingerprint;
  }
  if (next.status === "failed") {
    next.failedAt = normalizeString(updates.failedAt) || now;
  }
  if (next.status === "skipped") {
    next.skippedAt = normalizeString(updates.skippedAt) || now;
  }

  records.splice(recordIndex, 1, next);
  await writeIndexFiles(projectRoot, records, next);
  return next;
}

export async function resetReferenceIntakeRecords(projectRoot, options = {}) {
  const artifacts = resolveAgentReferenceIntakeArtifacts(projectRoot);
  const records = await readIndexFile(artifacts.indexJSON);
  const sessionId = normalizeString(options.sessionId);
  const taskId = normalizeString(options.taskId);
  const topicHint = normalizeString(options.topicHint);
  const remaining = records.filter((record) => {
    if (sessionId && record.sessionId !== sessionId) {
      return true;
    }
    if (taskId && record.taskId !== taskId) {
      return true;
    }
    if (topicHint && record.topicHint !== topicHint) {
      return true;
    }
    if (!sessionId && !taskId && !topicHint) {
      return false;
    }
    return false;
  });
  await writeIndexFiles(projectRoot, remaining, remaining[0] || null);
  return {
    clearedCount: Math.max(0, records.length - remaining.length),
    remainingCount: remaining.length,
    indexJSON: artifacts.indexJSON,
    latestJSON: artifacts.latestJSON,
  };
}

async function loadLatestReferenceDistill(projectRoot) {
  const artifacts = resolveAgentReferenceDistillArtifacts(projectRoot);
  try {
    const content = await fs.readFile(artifacts.latestJSON, "utf-8");
    const parsed = JSON.parse(content);
    return parsed?.latestRun && typeof parsed.latestRun === "object" ? parsed.latestRun : null;
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function buildStatusLabel(status) {
  switch (status) {
    case "pending":
      return "待整理";
    case "queued":
      return "后台排队中";
    case "distilled":
      return "已整理";
    case "failed":
      return "整理失败";
    case "skipped":
      return "已跳过";
    default:
      return "空闲";
  }
}

function buildStatusSummary(state) {
  switch (state.status) {
    case "pending":
      return `reference distillation pending（${state.pendingCount}）`;
    case "queued":
      return "reference distillation queued in background";
    case "failed":
      return "last reference distillation failed";
    case "distilled":
      return "latest reference distillation completed";
    case "skipped":
      return "reference distillation skipped";
    default:
      return "reference distillation idle";
  }
}

export async function loadReferenceDistillationState(projectRoot) {
  const records = await listReferenceIntakeRecords(projectRoot);
  const latestDistill = await loadLatestReferenceDistill(projectRoot);
  const thresholdPendingRecords = records.filter((record) => record.status === "pending" && record.thresholdMatched);
  const queuedRecords = records.filter((record) => record.status === "queued");
  const failedRecords = records.filter((record) => record.status === "failed");
  const latestRecord = records
    .slice()
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0] || null;
  const latestFailed = failedRecords
    .slice()
    .sort((a, b) => String(b.failedAt || b.updatedAt || "").localeCompare(String(a.failedAt || a.updatedAt || "")))[0] || null;
  const latestQueued = queuedRecords
    .slice()
    .sort((a, b) => String(b.queuedAt || b.updatedAt || "").localeCompare(String(a.queuedAt || a.updatedAt || "")))[0] || null;
  const latestPending = thresholdPendingRecords
    .slice()
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0] || null;

  let status = "idle";
  let nextSuggestedAction = "继续优先走 REFERENCE_INDEX 路由。";
  if (latestFailed) {
    status = "failed";
    nextSuggestedAction = `npm run agent:reference:distill -- --intake-id ${latestFailed.intakeId}`;
  } else if (latestQueued) {
    status = "queued";
    nextSuggestedAction = "等待后台 reference distillation 完成。";
  } else if (latestPending) {
    status = "pending";
    nextSuggestedAction = "npm run agent:sync";
  } else if (latestDistill?.status === "distilled") {
    status = "distilled";
  } else if (latestRecord?.status === "skipped") {
    status = "skipped";
  }

  const lastTopic = normalizeString(
    latestDistill?.topicHint
    || latestFailed?.topicHint
    || latestQueued?.topicHint
    || latestPending?.topicHint
    || latestRecord?.topicHint,
  ) || null;
  const lastDistilledAt = normalizeString(latestDistill?.finishedAt || latestDistill?.distilledAt) || null;
  const state = {
    schemaVersion: AGENT_REFERENCE_INTAKE_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    status,
    statusLabel: buildStatusLabel(status),
    summary: null,
    pendingCount: thresholdPendingRecords.length,
    queuedCount: queuedRecords.length,
    failedCount: failedRecords.length,
    lastTopic,
    lastDistilledAt,
    nextSuggestedAction,
    lastFailedIntakeId: latestFailed?.intakeId || null,
    lastQueuedIntakeId: latestQueued?.intakeId || null,
    lastPendingIntakeId: latestPending?.intakeId || null,
    latestRunId: normalizeString(latestDistill?.runId) || null,
    latestRunStatus: normalizeString(latestDistill?.status) || null,
  };
  state.summary = buildStatusSummary(state);
  return state;
}
