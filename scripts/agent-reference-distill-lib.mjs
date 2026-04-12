import { promises as fs } from "node:fs";
import path from "node:path";
import {
  resolveAgentReferenceDistillArtifacts,
} from "./agent-artifacts.mjs";
import {
  getReferenceIntakeRecord,
  listReferenceIntakeRecords,
  updateReferenceIntakeStatus,
} from "./agent-reference-intake-lib.mjs";
import {
  buildDelegationPrompt,
  isPathWithinScopes,
  normalizeDelegationLane,
  resolveDelegationTaskArtifacts,
  reviewEphemeralDelegationTask,
  runEphemeralDelegationTask,
} from "./agent-delegation-lib.mjs";
import {
  buildReferenceTopicTitle,
  filterRawReferenceFiles,
  hashShort,
  isReferenceDocPath,
  REFERENCE_DISTILL_MARKER_END,
  REFERENCE_DISTILL_MARKER_START,
  REFERENCE_INDEX_DISTILLED_TOPICS_END,
  REFERENCE_INDEX_DISTILLED_TOPICS_START,
  REFERENCE_INDEX_RELATIVE_PATH,
  resolveReferenceTopicTarget,
} from "./agent-reference-shared-lib.mjs";
import { writeJSONArtifact } from "./script-runtime-lib.mjs";

export const AGENT_REFERENCE_DISTILL_SCHEMA_VERSION = 1;
const REFERENCE_DISTILLATION_SNAPSHOT_IGNORE_DIRS = Object.freeze([
  ".git",
  "build",
  "dist",
  "node_modules",
]);

const DISTILL_PATTERN_RULES = Object.freeze([
  {
    id: "host-registered-surface",
    pattern: /PreferencePanes|registerPreferencePane|registerSection|registerPanel|register/i,
    summary: "优先吸收宿主注册式 surface 与入口工厂，不要一开始就 patch 宿主 DOM。",
  },
  {
    id: "menu-popup-refresh",
    pattern: /popupshowing|menupopup|menuitem|context menu|submenu/i,
    summary: "菜单类能力应在 `popupshowing` / 打开时刷新可见性与状态，而不是把静态菜单当成真实状态源。",
  },
  {
    id: "reader-toolbar-route",
    pattern: /renderToolbar|toolbar/i,
    summary: "Reader 侧入口优先回到 `renderToolbar` 或宿主 toolbar contract，而不是发明松散别名。",
  },
  {
    id: "window-shell",
    pattern: /openDialog|window\.open|dialog|standalone window/i,
    summary: "复杂交互适合拆到独立 window/dialog shell，主插件只保留宿主入口、状态桥接与关闭策略。",
  },
  {
    id: "iframe-microapp",
    pattern: /iframe|postMessage|micro-app|webview/i,
    summary: "重资源 UI 可以隔离到 iframe / micro-app，宿主层只维护桥接、权限与生命周期。",
  },
  {
    id: "service-queue",
    pattern: /queue|enqueue|dequeue|worker|job|task/i,
    summary: "长耗时流程应下沉到 service / queue，UI 只消费状态快照与结果事件。",
  },
  {
    id: "state-bridge",
    pattern: /bridge|store|state|signal|event/i,
    summary: "UI 与后台之间优先走受控 bridge / state store，而不是互相直连共享可变状态。",
  },
]);

function normalizeString(value) {
  return String(value || "").trim();
}

function dedupeStrings(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((item) => normalizeString(item))
      .filter(Boolean),
  ));
}

function sanitizeChangedFiles(changedFiles) {
  return (Array.isArray(changedFiles) ? changedFiles : [])
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => ({
      path: normalizeString(entry.path) || null,
      changeType: normalizeString(entry.changeType) || "modified",
      beforeSHA256: normalizeString(entry.beforeSHA256) || null,
      afterSHA256: normalizeString(entry.afterSHA256) || null,
    }))
    .filter((entry) => entry.path)
    .sort((left, right) => left.path.localeCompare(right.path, "en"));
}

function sanitizeDelegationProfile(profile) {
  if (!profile || typeof profile !== "object") {
    return null;
  }
  return {
    taskId: normalizeString(profile.taskId) || null,
    title: normalizeString(profile.title) || null,
    lane: normalizeDelegationLane(profile.lane) || "opencode-implementation-delivery",
    mode: normalizeString(profile.mode) || "docs-only-background",
    contractReference: normalizeString(profile.contractReference) || null,
    scopePaths: assertAllowedReferenceWriteTargets(profile.scopePaths || []),
    dependsOn: dedupeStrings(profile.dependsOn),
    promptTemplate: normalizeString(profile.promptTemplate) || null,
    reviewChecklist: dedupeStrings(profile.reviewChecklist),
    testCommands: dedupeStrings(profile.testCommands),
    handoffArtifacts: dedupeStrings(profile.handoffArtifacts),
    prompt: normalizeString(profile.prompt) || null,
    promptDigest: normalizeString(profile.promptDigest) || null,
  };
}

function sanitizeRunRecord(record) {
  if (!record || typeof record !== "object") {
    return null;
  }
  return {
    schemaVersion: Number(record.schemaVersion || AGENT_REFERENCE_DISTILL_SCHEMA_VERSION),
    runId: normalizeString(record.runId) || null,
    intakeId: normalizeString(record.intakeId) || null,
    sessionId: normalizeString(record.sessionId) || null,
    taskId: normalizeString(record.taskId) || null,
    status: normalizeString(record.status) || "failed",
    topicHint: normalizeString(record.topicHint) || null,
    topicKey: normalizeString(record.topicKey) || null,
    targetDoc: normalizeString(record.targetDoc) || null,
    indexUpdated: record.indexUpdated === true,
    createdTopic: record.createdTopic === true,
    updatedTopic: record.updatedTopic === true,
    rawReferenceFiles: filterRawReferenceFiles(record.rawReferenceFiles),
    distinctReferenceProjects: dedupeStrings(record.distinctReferenceProjects),
    writeTargets: dedupeStrings(record.writeTargets),
    delegationTaskId: normalizeString(record.delegationTaskId) || null,
    delegationArtifactBase: normalizeString(record.delegationArtifactBase) || null,
    reviewStatus: normalizeString(record.reviewStatus) || null,
    providerResultPresent: record.providerResultPresent === true,
    changedFiles: sanitizeChangedFiles(record.changedFiles),
    outOfScopeFiles: dedupeStrings(record.outOfScopeFiles),
    delegationProfile: sanitizeDelegationProfile(record.delegationProfile),
    summary: normalizeString(record.summary) || null,
    startedAt: normalizeString(record.startedAt) || null,
    finishedAt: normalizeString(record.finishedAt) || null,
    failureMessage: normalizeString(record.failureMessage) || null,
  };
}

async function readDistillIndex(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(content);
    return Array.isArray(parsed?.runs)
      ? parsed.runs.map((item) => sanitizeRunRecord(item)).filter(Boolean)
      : [];
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writeDistillArtifacts(projectRoot, runRecord, markdown) {
  const artifacts = resolveAgentReferenceDistillArtifacts(projectRoot);
  const runs = await readDistillIndex(artifacts.indexJSON);
  const sanitizedRun = sanitizeRunRecord(runRecord);
  const remainingRuns = runs.filter((item) => item.runId !== sanitizedRun.runId);
  remainingRuns.unshift(sanitizedRun);

  await fs.mkdir(artifacts.archiveDir, { recursive: true });
  await Promise.all([
    writeJSONArtifact(path.join(artifacts.archiveDir, `${sanitizedRun.runId}.json`), sanitizedRun),
    fs.writeFile(path.join(artifacts.archiveDir, `${sanitizedRun.runId}.md`), `${markdown}\n`, "utf-8"),
    writeJSONArtifact(artifacts.indexJSON, {
      schemaVersion: AGENT_REFERENCE_DISTILL_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      runCount: remainingRuns.length,
      runs: remainingRuns,
    }),
    writeJSONArtifact(artifacts.latestJSON, {
      schemaVersion: AGENT_REFERENCE_DISTILL_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      latestRun: sanitizedRun,
    }),
    fs.writeFile(artifacts.latestMD, `${markdown}\n`, "utf-8"),
  ]);
  return sanitizedRun;
}

export function assertAllowedReferenceWriteTargets(targets) {
  const normalized = dedupeStrings(targets);
  const invalidTargets = normalized.filter((item) => !isReferenceDocPath(item));
  if (invalidTargets.length > 0) {
    throw new Error(`Reference distillation write scope exceeded: ${invalidTargets.join("、")}`);
  }
  return normalized;
}

async function readTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function buildReferenceDistillationPromptTemplate(intake, topic) {
  return [
    "该任务仅供 reference distillation 后台整理使用。",
    "只提炼 clean-room 可复用技术路径、路由说明与适用边界，不照抄产品实现、布局、文案或宿主 patch 细节。",
    "优先更新已有 REFERENCE 专题；只有 topic 不存在时才新建专题并补 REFERENCE_INDEX 路由。",
    "不得修改 raw reference、CURRENT_BACKLOG、validation/gate 配置、project mirrors、业务源码或其他产品文档。",
    `当前 topic: ${intake.topicHint}；允许写域固定为 ${[topic.targetDoc, REFERENCE_INDEX_RELATIVE_PATH].join("、")}。`,
    "阅读路径固定为 REFERENCE_INDEX -> REFERENCE_* -> raw reference/*；当前整理只用于参考沉淀，不升级为 project truth。",
    `只读取本次 intake 已列出的 raw reference 文件：${intake.rawReferenceFiles.join("、") || "无"}。`,
    "topic 文档必须继续使用 REFERENCE-DISTILLATION managed block；REFERENCE_INDEX 必须继续使用 REFERENCE-DISTILLED-TOPICS managed block。",
    "最终输出必须是单个 JSON 对象，至少包含：status、owner_role、summary、changed_files、checks_run、risks、blockers、next_action。",
  ].join(" ");
}

export function buildReferenceDistillationDocsOnlyProfile(intake, topic, options = {}) {
  const runId = normalizeString(options.runId) || "reference-distill";
  const taskId = `REFERENCE-DISTILL-${topic.topicKey}-${hashShort({
    intakeId: intake.intakeId,
    runId,
  }, 8).toUpperCase()}`;
  const scopePaths = assertAllowedReferenceWriteTargets([
    topic.targetDoc,
    REFERENCE_INDEX_RELATIVE_PATH,
  ].filter(Boolean));
  const promptTemplate = buildReferenceDistillationPromptTemplate(intake, topic);
  const contractReference = `ephemeral://reference-distillation -> ${taskId}`;
  const task = {
    taskId,
    title: `Reference distillation / ${intake.topicHint}`,
    lane: "opencode-implementation-delivery",
    scopePaths,
    dependsOn: [],
    promptTemplate,
    reviewChecklist: [
      "只允许写 docs/REFERENCE_*.md 与 docs/REFERENCE_INDEX.md。",
      "不得把参考结论自动提升为 current truth 或 contract。",
      "不得改 raw reference、业务源码、validation/gate 配置或 project mirrors。",
    ],
    testCommands: [],
    handoffArtifacts: [
      "dist/agent-reference-intake/index.json",
      "dist/agent-reference-distill/latest.json",
    ],
  };
  const prompt = buildDelegationPrompt(task, {
    manifestPath: "ephemeral://reference-distillation",
    inlineContract: true,
  });
  return sanitizeDelegationProfile({
    ...task,
    mode: "docs-only-background",
    contractReference,
    prompt,
    promptDigest: hashShort(prompt, 16),
  });
}

function toProjectArtifactRef(projectRoot, absolutePath) {
  const relative = path.relative(projectRoot, absolutePath).replaceAll("\\", "/");
  return relative && !relative.startsWith("../") && !path.isAbsolute(relative)
    ? relative
    : absolutePath;
}

export async function materializeReferenceDistillationDocs(projectRoot, intake, options = {}) {
  const topic = options.topic || await resolveReferenceTopicTarget(projectRoot, intake.topicHint);
  const targetDoc = topic.targetDoc;
  const sourceContents = {};
  await Promise.all(intake.rawReferenceFiles.map(async (filePath) => {
    const absolutePath = path.join(projectRoot, filePath);
    sourceContents[filePath] = await readTextIfExists(absolutePath) || "";
  }));
  const insightBullets = buildInsightBullets(intake.rawReferenceFiles, sourceContents);
  const boundaryBullets = buildBoundaryBullets(intake);
  const routeBullets = buildRouteBullets(intake);
  const topicTitle = buildReferenceTopicTitle(intake.topicHint, intake.topicKey);
  const managedBlock = renderDistillationManagedBlock({
    intake,
    topicTitle,
    insightBullets,
    routeBullets,
    boundaryBullets,
  });

  const absoluteTargetDoc = path.join(projectRoot, targetDoc);
  const existingDoc = await readTextIfExists(absoluteTargetDoc);
  const nextDoc = existingDoc
    ? upsertManagedBlock(existingDoc, managedBlock)
    : buildNewTopicDocument({ topicTitle, managedBlock });
  await fs.mkdir(path.dirname(absoluteTargetDoc), { recursive: true });
  await fs.writeFile(absoluteTargetDoc, `${nextDoc.trimEnd()}\n`, "utf-8");

  let indexUpdated = false;
  if (!topic.targetExists) {
    const absoluteIndexPath = path.join(projectRoot, REFERENCE_INDEX_RELATIVE_PATH);
    const existingIndex = await readTextIfExists(absoluteIndexPath) || "";
    const nextIndex = upsertReferenceIndexTopics(existingIndex, buildIndexTopicEntry(targetDoc, topicTitle));
    await fs.writeFile(absoluteIndexPath, `${nextIndex.trimEnd()}\n`, "utf-8");
    indexUpdated = true;
  }

  return {
    targetDoc,
    indexUpdated,
    createdTopic: !topic.targetExists,
    updatedTopic: true,
    topicTitle,
  };
}

export function evaluateReferenceDistillationChangeScope(changedFiles, scopePaths) {
  const normalizedScopePaths = assertAllowedReferenceWriteTargets(scopePaths);
  const normalizedChangedFiles = sanitizeChangedFiles(changedFiles);
  const outOfScopeFiles = normalizedChangedFiles
    .filter((entry) => !isPathWithinScopes(entry.path, normalizedScopePaths))
    .map((entry) => entry.path);
  return {
    scopePaths: normalizedScopePaths,
    changedFiles: normalizedChangedFiles,
    outOfScopeFiles,
    withinScope: outOfScopeFiles.length === 0,
  };
}

export function assertReferenceDistillationChangedFilesWithinScope(changedFiles, scopePaths) {
  const report = evaluateReferenceDistillationChangeScope(changedFiles, scopePaths);
  if (!report.withinScope) {
    throw new Error(`Reference distillation write scope exceeded after execution: ${report.outOfScopeFiles.join("、")}`);
  }
  return report;
}

function buildInsightBullets(referenceFiles, sourceContents) {
  const insights = [];
  DISTILL_PATTERN_RULES.forEach((rule) => {
    const matchedFiles = referenceFiles.filter((filePath) => rule.pattern.test(sourceContents[filePath] || ""));
    if (matchedFiles.length > 0) {
      insights.push(`${rule.summary} 证据文件：${matchedFiles.slice(0, 3).join("、")}。`);
    }
  });
  if (insights.length === 0) {
    insights.push("本轮 raw reference 更适合作为路由来源与 API 线索，暂未抽到稳定可泛化的独立技术链。");
  }
  return insights.slice(0, 5);
}

function buildBoundaryBullets(intake) {
  return [
    "只提炼 clean-room 可复用技术路径、路由说明与适用边界，不照抄产品布局、命名、文案或宿主 patch 细节。",
    "如果某条结论未来要升级为 contract，由 controller 人工提升到 `AGENT_INDEX` / contract 文档；本专题不自动升格为 truth。",
    intake.distinctReferenceProjects.length >= 2
      ? "本次输入已跨多个 reference project，对比结论只保留共性技术链，不把单一项目产品决策误写成模板默认路线。"
      : "本次输入主要来自单一 reference project；优先把结论写成“可借鉴路径 + 不适用边界”，不要扩写成广义模板真相。",
  ];
}

function buildRouteBullets(intake) {
  const bullets = [
    "阅读顺序固定为 `REFERENCE_INDEX -> REFERENCE_* -> raw reference/*`；只有当路由层无法回答当前问题时才进入 raw reference。",
    `本次 intake topic 为 \`${intake.topicHint}\`，distiller 写域固定在 \`${intake.distillTargetDoc}\` 与 \`${REFERENCE_INDEX_RELATIVE_PATH}\`。`,
  ];
  if (intake.distinctReferenceProjects.length >= 2) {
    bullets.push("由于本次已跨两个及以上 reference project，对比结论应优先落成参考专题，而不是写回 CURRENT_BACKLOG 口径。");
  }
  return bullets;
}

function renderDistillationManagedBlock({ intake, topicTitle, insightBullets, routeBullets, boundaryBullets }) {
  const sourceFileBullets = intake.rawReferenceFiles.map((item) => `- \`${item}\``);
  const projectBullets = intake.distinctReferenceProjects.map((item) => `- \`${item}\``);
  return [
    REFERENCE_DISTILL_MARKER_START,
    "## 自动整理摘要",
    "",
    `- 主题：${topicTitle}`,
    `- Intake：\`${intake.intakeId}\` / session=\`${intake.sessionId}\` / task=\`${intake.taskId}\``,
    `- 最近整理：\`${new Date().toISOString()}\``,
    `- 触发阈值：raw files \`${intake.thresholdReasons.rawReferenceFileCount}\` / projects \`${intake.thresholdReasons.distinctReferenceProjectCount}\``,
    "",
    "## Clean-Room 可复用技术路径",
    "",
    ...insightBullets.map((item) => `- ${item}`),
    "",
    "## 路由与适用边界",
    "",
    ...routeBullets.map((item) => `- ${item}`),
    ...boundaryBullets.map((item) => `- ${item}`),
    "",
    "## 本次原始来源",
    "",
    ...(projectBullets.length > 0 ? projectBullets : ["- 本次未记录到有效 reference project。"]),
    ...(sourceFileBullets.length > 0 ? sourceFileBullets : ["- 本次未记录到有效 raw reference 文件。"]),
    REFERENCE_DISTILL_MARKER_END,
  ].join("\n");
}

function upsertManagedBlock(existingContent, managedBlock) {
  const current = String(existingContent || "").trim();
  if (!current) {
    return managedBlock;
  }
  if (current.includes(REFERENCE_DISTILL_MARKER_START) && current.includes(REFERENCE_DISTILL_MARKER_END)) {
    const before = current.slice(0, current.indexOf(REFERENCE_DISTILL_MARKER_START)).trimEnd();
    const after = current.slice(current.indexOf(REFERENCE_DISTILL_MARKER_END) + REFERENCE_DISTILL_MARKER_END.length).trimStart();
    return [before, managedBlock, after].filter(Boolean).join("\n\n");
  }
  return `${current}\n\n${managedBlock}`;
}

function buildNewTopicDocument({ topicTitle, managedBlock }) {
  return [
    `# ${topicTitle}`,
    "",
    "> 用途：自动收口跨 raw reference 的 clean-room 技术路径与路由说明，不作为 project truth。",
    "",
    managedBlock,
    "",
  ].join("\n");
}

function buildIndexTopicEntry(targetDoc, topicTitle) {
  const basename = path.basename(targetDoc);
  return `- [${basename}](./${basename})：${topicTitle}`;
}

function upsertReferenceIndexTopics(existingContent, topicEntry) {
  const current = String(existingContent || "").trim();
  if (!current) {
    return [
      "# Reference 路由",
      "",
      "## 自动整理专题",
      "",
      REFERENCE_INDEX_DISTILLED_TOPICS_START,
      topicEntry,
      REFERENCE_INDEX_DISTILLED_TOPICS_END,
      "",
    ].join("\n");
  }
  if (current.includes(REFERENCE_INDEX_DISTILLED_TOPICS_START) && current.includes(REFERENCE_INDEX_DISTILLED_TOPICS_END)) {
    const start = current.indexOf(REFERENCE_INDEX_DISTILLED_TOPICS_START);
    const end = current.indexOf(REFERENCE_INDEX_DISTILLED_TOPICS_END);
    const managedContent = current
      .slice(start + REFERENCE_INDEX_DISTILLED_TOPICS_START.length, end)
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- "));
    const nextEntries = dedupeStrings([...managedContent, topicEntry]).sort((a, b) => a.localeCompare(b, "zh-CN"));
    return [
      current.slice(0, start + REFERENCE_INDEX_DISTILLED_TOPICS_START.length),
      "",
      ...nextEntries,
      current.slice(end),
    ].join("\n");
  }
  const insertion = [
    "### 自动整理专题",
    "",
    REFERENCE_INDEX_DISTILLED_TOPICS_START,
    topicEntry,
    REFERENCE_INDEX_DISTILLED_TOPICS_END,
  ].join("\n");
  if (current.includes("## 当前参考资产")) {
    return current.replace("## 当前参考资产", `## 当前参考资产\n\n${insertion}`);
  }
  return `${current}\n\n${insertion}\n`;
}

function buildRunMarkdown(runRecord) {
  return [
    `# Reference Distillation / ${runRecord.topicHint || runRecord.topicKey || "-"}`,
    "",
    `- 状态: \`${runRecord.status}\``,
    `- Intake: \`${runRecord.intakeId || "-"}\``,
    `- Target Doc: \`${runRecord.targetDoc || "-"}\``,
    `- 创建专题: \`${runRecord.createdTopic ? "yes" : "no"}\``,
    `- 更新索引: \`${runRecord.indexUpdated ? "yes" : "no"}\``,
    `- Delegation Task: \`${runRecord.delegationTaskId || runRecord.delegationProfile?.taskId || "-"}\``,
    `- Delegation Artifact Base: \`${runRecord.delegationArtifactBase || "-"}\``,
    `- Review Status: \`${runRecord.reviewStatus || "-"}\``,
    `- Provider Result Present: \`${runRecord.providerResultPresent ? "yes" : "no"}\``,
    `- Docs-only Profile: scope=\`${(runRecord.delegationProfile?.scopePaths || []).join("、") || "-"}\` / digest=\`${runRecord.delegationProfile?.promptDigest || "-"}\``,
    `- Changed Files: ${(runRecord.changedFiles || []).map((item) => `\`${item.path}\``).join("、") || "-"}`,
    `- Out Of Scope: ${(runRecord.outOfScopeFiles || []).map((item) => `\`${item}\``).join("、") || "-"}`,
    `- Started At: \`${runRecord.startedAt || "-"}\``,
    `- Finished At: \`${runRecord.finishedAt || "-"}\``,
    `- Summary: ${runRecord.summary || "-"}`,
    "",
  ].join("\n");
}

export async function runReferenceDistillation(projectRoot, options = {}) {
  const intake = await getReferenceIntakeRecord(projectRoot, options.intakeId);
  const startedAt = new Date().toISOString();
  const runId = `ref-distill-${hashShort({
    intakeId: options.intakeId,
    startedAt,
  })}`;

  if (!intake) {
    const missingRun = sanitizeRunRecord({
      schemaVersion: AGENT_REFERENCE_DISTILL_SCHEMA_VERSION,
      runId,
      intakeId: options.intakeId,
      status: "failed",
      startedAt,
      finishedAt: new Date().toISOString(),
      summary: "Reference distillation failed: intake record not found.",
      failureMessage: `Missing intake record: ${options.intakeId || "-"}`,
      writeTargets: [],
    });
    await writeDistillArtifacts(projectRoot, missingRun, buildRunMarkdown(missingRun));
    return missingRun;
  }

  const topic = await resolveReferenceTopicTarget(projectRoot, intake.topicHint);
  const targetDoc = topic.targetDoc;
  const docsOnlyProfile = buildReferenceDistillationDocsOnlyProfile(intake, topic, {
    runId,
  });
  const writeTargets = docsOnlyProfile.scopePaths.slice();
  const delegationArtifacts = resolveDelegationTaskArtifacts(projectRoot, docsOnlyProfile.taskId);
  const runTask = typeof options.runTask === "function"
    ? options.runTask
    : runEphemeralDelegationTask;
  const reviewTask = typeof options.reviewTask === "function"
    ? options.reviewTask
    : reviewEphemeralDelegationTask;
  const delegationTaskOptions = {
    manifestPath: "ephemeral://reference-distillation",
    inlineContract: true,
    captureSnapshotOptions: {
      ignoreDirs: REFERENCE_DISTILLATION_SNAPSHOT_IGNORE_DIRS,
    },
    ...(options.delegationTaskOptions || {}),
  };
  const reviewTaskOptions = {
    reviewer: "reference-distill-controller",
    ...(options.reviewTaskOptions || {}),
  };
  let delegationRun = null;
  let delegationReview = null;
  let failureMessage = null;

  try {
    delegationRun = await runTask(projectRoot, docsOnlyProfile, delegationTaskOptions);
    delegationReview = await reviewTask(projectRoot, docsOnlyProfile, {
      ...reviewTaskOptions,
      runRecord: delegationRun,
    });

    const scopeReport = evaluateReferenceDistillationChangeScope(
      delegationRun?.changedFiles || [],
      docsOnlyProfile.scopePaths,
    );
    const indexUpdated = scopeReport.changedFiles.some((entry) => entry.path === REFERENCE_INDEX_RELATIVE_PATH);
    const topicChange = scopeReport.changedFiles.find((entry) => entry.path === targetDoc) || null;
    const createdTopic = topicChange?.changeType === "added";
    const updatedTopic = Boolean(topicChange);
    const succeeded = delegationRun?.exitCode === 0 && delegationReview?.reviewStatus === "accepted";
    if (!succeeded) {
      if (delegationRun?.exitCode !== 0) {
        failureMessage = delegationRun?.executionErrorMessage
          || `Delegation task failed with exit code ${delegationRun?.exitCode ?? "unknown"}.`;
      } else {
        failureMessage = `Reference distillation review finished as ${delegationReview?.reviewStatus || "failed"}: ${(delegationReview?.reviewNotes || []).join("；") || "unknown review failure"}`;
      }
    }

    const finishedAt = new Date().toISOString();
    const runRecord = sanitizeRunRecord({
      schemaVersion: AGENT_REFERENCE_DISTILL_SCHEMA_VERSION,
      runId,
      intakeId: intake.intakeId,
      sessionId: intake.sessionId,
      taskId: intake.taskId,
      status: succeeded ? "distilled" : "failed",
      topicHint: intake.topicHint,
      topicKey: intake.topicKey,
      targetDoc,
      indexUpdated,
      createdTopic,
      updatedTopic,
      rawReferenceFiles: intake.rawReferenceFiles,
      distinctReferenceProjects: intake.distinctReferenceProjects,
      writeTargets,
      delegationTaskId: docsOnlyProfile.taskId,
      delegationArtifactBase: toProjectArtifactRef(projectRoot, delegationArtifacts.baseDir),
      reviewStatus: delegationReview?.reviewStatus || null,
      providerResultPresent: delegationRun?.providerResultPresent === true,
      changedFiles: delegationRun?.changedFiles || [],
      outOfScopeFiles: scopeReport.outOfScopeFiles,
      delegationProfile: docsOnlyProfile,
      startedAt,
      finishedAt,
      summary: succeeded
        ? createdTopic
          ? `Created ${targetDoc} and patched ${REFERENCE_INDEX_RELATIVE_PATH}.`
          : `Updated ${targetDoc} from ${intake.rawReferenceFiles.length} raw reference files.`
        : `Reference distillation failed for ${targetDoc}.`,
      failureMessage,
    });
    await writeDistillArtifacts(projectRoot, runRecord, buildRunMarkdown(runRecord));
    await updateReferenceIntakeStatus(projectRoot, intake.intakeId, succeeded ? {
      status: "distilled",
      statusReason: "distilled",
      distillTargetDoc: targetDoc,
      lastDistillRunId: runId,
      distilledAt: finishedAt,
    } : {
      status: "failed",
      statusReason: "distill-failed",
      lastDistillRunId: runId,
      failedAt: finishedAt,
    }, { now: finishedAt });
    return runRecord;
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const scopeReport = evaluateReferenceDistillationChangeScope(
      delegationRun?.changedFiles || [],
      docsOnlyProfile.scopePaths,
    );
    const runRecord = sanitizeRunRecord({
      schemaVersion: AGENT_REFERENCE_DISTILL_SCHEMA_VERSION,
      runId,
      intakeId: intake.intakeId,
      sessionId: intake.sessionId,
      taskId: intake.taskId,
      status: "failed",
      topicHint: intake.topicHint,
      topicKey: intake.topicKey,
      targetDoc,
      rawReferenceFiles: intake.rawReferenceFiles,
      distinctReferenceProjects: intake.distinctReferenceProjects,
      writeTargets,
      delegationTaskId: docsOnlyProfile.taskId,
      delegationArtifactBase: toProjectArtifactRef(projectRoot, delegationArtifacts.baseDir),
      reviewStatus: delegationReview?.reviewStatus || null,
      providerResultPresent: delegationRun?.providerResultPresent === true,
      changedFiles: delegationRun?.changedFiles || scopeReport.changedFiles,
      outOfScopeFiles: scopeReport.outOfScopeFiles,
      delegationProfile: docsOnlyProfile,
      startedAt,
      finishedAt,
      summary: `Reference distillation failed for ${targetDoc}.`,
      failureMessage: String(error?.message || error || "Unknown failure"),
    });
    await writeDistillArtifacts(projectRoot, runRecord, buildRunMarkdown(runRecord));
    await updateReferenceIntakeStatus(projectRoot, intake.intakeId, {
      status: "failed",
      statusReason: "distill-failed",
      lastDistillRunId: runId,
      failedAt: finishedAt,
    }, { now: finishedAt });
    return runRecord;
  }
}

export async function hasSuccessfulDistillationForSource(projectRoot, intake) {
  const records = await listReferenceIntakeRecords(projectRoot, {
    sessionId: intake.sessionId,
  });
  return records.some((record) => (
    record.intakeId !== intake.intakeId
    && record.topicKey === intake.topicKey
    && record.status === "distilled"
    && record.lastDistilledSourceFingerprint
    && record.lastDistilledSourceFingerprint === intake.sourceFingerprint
  ));
}
