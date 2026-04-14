import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { readCurrentTruthState } from "./docs-current-truth-lib.mjs";
import { resolveAgentArtifactPath, resolveAgentArtifactsDir } from "./agent-artifacts.mjs";
import { loadDelegationManifest } from "./agent-delegation-lib.mjs";
import {
  assertPlainObject,
  createScriptError,
  writeJSONArtifact,
} from "./script-runtime-lib.mjs";

const AGENT_DEAD_CHAIN_AUDIT_JSON = "dist/agent-dead-chain-audit.json";
const AGENT_DEAD_CHAIN_AUDIT_MD = "dist/agent-dead-chain-audit.md";
const HARD_DEAD_FINDING_KINDS = new Set([
  "missing-script-target",
  "missing-npm-script-ref",
  "missing-doc-link",
]);
const RETIRED_FINDING_KINDS = new Set([
  "retired-delegation-task",
  "stale-delegation-task",
  "superseded-framework-bundle",
]);
const ACTIONABLE_RETIRED_FINDING_KINDS = new Set([
  "retired-delegation-task",
  "stale-delegation-task",
]);
const HISTORY_RETAINED_FINDING_KINDS = new Set([
  "superseded-framework-bundle",
]);
const LOCAL_LINK_PROTOCOL_PATTERN = /^(?:https?:|mailto:|tel:|data:|javascript:)/iu;
const MARKDOWN_LINK_PATTERN = /!?\[[^\]]*\]\(([^)]+)\)/gu;
const NODE_FILE_PATTERN = /\bnode\s+([^\s"'`]+)/gu;
const NPM_RUN_PATTERN = /\bnpm\s+run\s+([A-Za-z0-9:_-]+)/gu;
const RETIRED_DELEGATION_PATTERNS = [
  /仅作为历史契约源保留/iu,
  /当前仅作为历史契约源保留/iu,
  /只保留为历史契约源/iu,
  /仅保留为历史工件/iu,
  /已完成并仅保留为历史工件/iu,
  /不再作为 active 主线/iu,
  /不再作为 active batch/iu,
  /不再代表当前 active/iu,
];

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizePathForReport(value) {
  return normalizeString(value).replaceAll("\\", "/");
}

function uniqueStrings(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => normalizeString(value))
      .filter(Boolean),
  ));
}

function sortStrings(values) {
  return uniqueStrings(values).sort((left, right) => left.localeCompare(right, "en"));
}

function sortByTaskOrder(values, taskIndexMap) {
  return uniqueStrings(values).sort((left, right) => {
    const leftIndex = Number(taskIndexMap?.get(left));
    const rightIndex = Number(taskIndexMap?.get(right));
    if (Number.isFinite(leftIndex) && Number.isFinite(rightIndex) && leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }
    if (Number.isFinite(leftIndex)) {
      return -1;
    }
    if (Number.isFinite(rightIndex)) {
      return 1;
    }
    return left.localeCompare(right, "en");
  });
}

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readJSONIfExists(filePath) {
  if (!(await exists(filePath))) {
    return null;
  }
  const content = await fs.readFile(filePath, "utf-8");
  try {
    return JSON.parse(content);
  } catch (error) {
    throw createScriptError("validation", `Invalid JSON file: ${normalizePathForReport(filePath)}`, {
      failedStage: "read-json",
      details: {
        filePath: normalizePathForReport(filePath),
        causeMessage: String(error?.message || error || "Invalid JSON"),
      },
      cause: error,
    });
  }
}

async function loadDelegationAuditContext(projectRoot) {
  const manifestPath = path.join(projectRoot, "config", "agent-delegation-tasks.json");
  if (!(await exists(manifestPath))) {
    return null;
  }
  const manifest = await loadDelegationManifest(projectRoot, { manifestPath });
  const tasks = Array.isArray(manifest?.tasks) ? manifest.tasks : [];
  const taskMap = new Map();
  const taskIndexMap = new Map();
  const retiredTaskIds = new Set();
  const dependentMap = new Map();
  const allDependentMap = new Map();

  tasks.forEach((task, index) => {
    const taskId = normalizeString(task?.taskId);
    if (!taskId) {
      return;
    }
    taskMap.set(taskId, task);
    taskIndexMap.set(taskId, index);
    dependentMap.set(taskId, { active: [], retired: [] });
    allDependentMap.set(taskId, []);
    if (findRetiredDelegationEvidence(task)) {
      retiredTaskIds.add(taskId);
    }
  });

  tasks.forEach((task) => {
    const taskId = normalizeString(task?.taskId);
    if (!taskId) {
      return;
    }
    const bucket = retiredTaskIds.has(taskId) ? "retired" : "active";
    uniqueStrings(task?.dependsOn).forEach((dependency) => {
      const typedRecord = dependentMap.get(dependency);
      if (typedRecord) {
        typedRecord[bucket].push(taskId);
      }
      const allRecord = allDependentMap.get(dependency);
      if (allRecord) {
        allRecord.push(taskId);
      }
    });
  });

  return {
    manifestPath: normalizePathForReport(manifestPath),
    tasks,
    taskMap,
    taskIndexMap,
    retiredTaskIds,
    dependentMap,
    allDependentMap,
  };
}

function listTrackedFiles(projectRoot) {
  const result = spawnSync("git", ["ls-files", "-z"], {
    cwd: projectRoot,
    encoding: "utf-8",
  });
  if (result.status !== 0) {
    return [];
  }
  return String(result.stdout || "")
    .split("\0")
    .map((entry) => normalizePathForReport(entry))
    .filter(Boolean);
}

function resolveRelativeTarget(baseDir, target) {
  const normalized = normalizeString(target)
    .replace(/^<|>$/gu, "")
    .split("#")[0]
    .split("?")[0]
    .trim();
  if (!normalized || normalized.startsWith("#") || LOCAL_LINK_PROTOCOL_PATTERN.test(normalized)) {
    return null;
  }
  if (path.isAbsolute(normalized)) {
    return null;
  }
  return path.resolve(baseDir, normalized);
}

function extractNodeFileRefs(command) {
  const refs = [];
  let match;
  while ((match = NODE_FILE_PATTERN.exec(String(command || ""))) !== null) {
    const candidate = normalizeString(match[1]);
    if (!candidate || candidate.startsWith("-")) {
      continue;
    }
    if (candidate.startsWith("node:")) {
      continue;
    }
    if (!candidate.includes("/") && !/\.[cm]?[jt]sx?$/u.test(candidate)) {
      continue;
    }
    refs.push(candidate);
  }
  return uniqueStrings(refs);
}

function extractNpmRunRefs(command) {
  const refs = [];
  let match;
  while ((match = NPM_RUN_PATTERN.exec(String(command || ""))) !== null) {
    const scriptName = normalizeString(match[1]);
    if (scriptName) {
      refs.push(scriptName);
    }
  }
  return uniqueStrings(refs);
}

function findRetiredDelegationEvidence(task) {
  const candidateFields = [
    ["title", task?.title],
    ["promptTemplate", task?.promptTemplate],
    ...((Array.isArray(task?.reviewChecklist) ? task.reviewChecklist : []).map((item, index) => [`reviewChecklist[${index}]`, item])),
  ];

  for (const [fieldName, rawValue] of candidateFields) {
    const value = normalizeString(rawValue);
    if (!value) {
      continue;
    }
    for (const pattern of RETIRED_DELEGATION_PATTERNS) {
      const match = pattern.exec(value);
      if (match) {
        return `${fieldName}: ${normalizeString(match[0])}`;
      }
    }
  }

  return null;
}

function buildFinding({
  kind,
  severity,
  owner,
  path: filePath,
  summary,
  evidence = null,
  recommendedAction,
  safeDeleteCandidate = false,
  dependencyState = null,
  activeDependentIds = [],
  retiredDependentIds = [],
}) {
  return {
    kind,
    severity,
    owner,
    path: normalizePathForReport(filePath),
    summary: normalizeString(summary),
    evidence: normalizeString(evidence) || null,
    recommendedAction: normalizeString(recommendedAction) || null,
    safeDeleteCandidate: safeDeleteCandidate === true,
    dependencyState: normalizeString(dependencyState) || null,
    activeDependentIds: uniqueStrings(activeDependentIds),
    retiredDependentIds: uniqueStrings(retiredDependentIds),
  };
}

async function collectScriptFindings(projectRoot, packageJSON) {
  const findings = [];
  const scripts = packageJSON?.scripts && typeof packageJSON.scripts === "object"
    ? packageJSON.scripts
    : {};

  for (const [scriptName, command] of Object.entries(scripts)) {
    for (const fileRef of extractNodeFileRefs(command)) {
      const resolved = path.resolve(projectRoot, fileRef);
      if (!(await exists(resolved))) {
        findings.push(buildFinding({
          kind: "missing-script-target",
          severity: "high",
          owner: `package.json#scripts.${scriptName}`,
          path: "package.json",
          summary: `脚本 \`${scriptName}\` 指向的 Node 入口不存在：${fileRef}`,
          evidence: String(command || ""),
          recommendedAction: "修复脚本入口，或删除已经失效的脚本链路。",
        }));
      }
    }
    for (const referencedScript of extractNpmRunRefs(command)) {
      if (!Object.hasOwn(scripts, referencedScript)) {
        findings.push(buildFinding({
          kind: "missing-npm-script-ref",
          severity: "high",
          owner: `package.json#scripts.${scriptName}`,
          path: "package.json",
          summary: `脚本 \`${scriptName}\` 引用了不存在的 npm script：${referencedScript}`,
          evidence: String(command || ""),
          recommendedAction: "补齐被引用脚本，或移除已经断开的 npm run 链路。",
        }));
      }
    }
  }

  return findings;
}

async function collectDocLinkFindings(projectRoot, trackedFiles) {
  const findings = [];
  const markdownFiles = trackedFiles
    .filter((entry) => entry.endsWith(".md"))
    .filter((entry) => !entry.startsWith("dist/") && !entry.startsWith("build/") && !entry.startsWith("reference/"));

  for (const relativePath of markdownFiles) {
    const absolutePath = path.join(projectRoot, relativePath);
    const content = await fs.readFile(absolutePath, "utf-8");
    let match;
    while ((match = MARKDOWN_LINK_PATTERN.exec(content)) !== null) {
      const rawTarget = normalizeString(match[1]);
      const resolved = resolveRelativeTarget(path.dirname(absolutePath), rawTarget);
      if (!resolved) {
        continue;
      }
      if (!(await exists(resolved))) {
        findings.push(buildFinding({
          kind: "missing-doc-link",
          severity: "medium",
          owner: relativePath,
          path: relativePath,
          summary: `文档链接目标不存在：${rawTarget}`,
          evidence: rawTarget,
          recommendedAction: "修复文档路由，或删除已经失效的历史链接。",
        }));
      }
    }
  }

  return findings;
}

async function collectDelegationTaskFindings(projectRoot, delegationContext = null) {
  const context = delegationContext || await loadDelegationAuditContext(projectRoot);
  if (!context) {
    return [];
  }
  const { tasks, dependentMap } = context;
  const findings = [];

  for (const task of tasks) {
    const taskId = normalizeString(task?.taskId);
    const title = normalizeString(task?.title) || taskId || "unknown-task";
    const scopePaths = uniqueStrings(task?.scopePaths);
    const retiredEvidence = findRetiredDelegationEvidence(task);
    const dependents = dependentMap.get(taskId) || { active: [], retired: [] };
    const activeDependentIds = sortStrings(dependents.active);
    const retiredDependentIds = sortStrings(dependents.retired);
    const dependencyState = activeDependentIds.length > 0
      ? "referenced-by-active"
      : retiredDependentIds.length > 0
        ? "referenced-by-retired-only"
        : retiredEvidence
          ? "retired-leaf"
          : null;
    const existingScopePaths = [];
    for (const scopePath of scopePaths) {
      if (await exists(path.join(projectRoot, scopePath))) {
        existingScopePaths.push(scopePath);
      }
    }
    if (scopePaths.length > 0 && existingScopePaths.length === 0) {
      findings.push(buildFinding({
        kind: "stale-delegation-task",
        severity: "low",
        owner: taskId || title,
        path: "config/agent-delegation-tasks.json",
        summary: `委托任务 \`${taskId || title}\` 的 scopePaths 已全部失效`,
        evidence: retiredEvidence
          ? `${scopePaths.join("；")}；${retiredEvidence}`
          : scopePaths.join("；"),
        recommendedAction: "如果该任务只剩历史意义，可从委托 manifest 中移除或迁成纯历史记录。",
        safeDeleteCandidate: true,
        dependencyState,
        activeDependentIds,
        retiredDependentIds,
      }));
      continue;
    }
    if (retiredEvidence) {
      const recommendedAction = activeDependentIds.length > 0
        ? "该历史任务仍被 active task 依赖；应先迁移或剪断依赖，再考虑从 manifest 收缩。"
        : retiredDependentIds.length > 0
          ? "该历史任务只被其他历史任务引用；可在整段历史链一起收缩时统一处理。"
          : "该历史任务当前已是叶子节点；可优先人工复核是否从 manifest 收缩。";
      findings.push(buildFinding({
        kind: "retired-delegation-task",
        severity: "low",
        owner: taskId || title,
        path: "config/agent-delegation-tasks.json",
        summary: `委托任务 \`${taskId || title}\` 已标记为历史契约/历史工件链路`,
        evidence: retiredEvidence,
        recommendedAction,
        dependencyState,
        activeDependentIds,
        retiredDependentIds,
      }));
    }
  }

  return findings;
}

async function collectSupersededBundleFindings(projectRoot) {
  const bundlePath = path.join(projectRoot, "config", "framework-backfill-bundles.json");
  const payload = await readJSONIfExists(bundlePath);
  if (!payload) {
    return [];
  }
  const bundles = Array.isArray(payload?.bundles) ? payload.bundles : [];
  const findings = [];

  for (const bundle of bundles) {
    if (normalizeString(bundle?.lifecycle) !== "superseded") {
      continue;
    }
    const bundleId = normalizeString(bundle?.id) || "unknown-bundle";
    const supersededBy = normalizeString(bundle?.supersededBy);
    findings.push(buildFinding({
      kind: "superseded-framework-bundle",
      severity: "low",
      owner: bundleId,
      path: "config/framework-backfill-bundles.json",
      summary: `治理 bundle \`${bundleId}\` 已被 superseded${supersededBy ? `，替代者为 \`${supersededBy}\`` : ""}`,
      evidence: bundle?.summary || null,
      recommendedAction: "保留为历史治理记录，或在确认没有消费者后再收缩相关 mirror/说明文本。",
    }));
  }

  return findings;
}

function buildTrunkSummary(currentTruth, expansionWave) {
  const summaryLines = String(currentTruth?.summary || "")
    .split(/\r?\n/gu)
    .map((line) => normalizeString(line))
    .filter(Boolean);

  return {
    source: "docs/CURRENT_BACKLOG.md",
    activeBatchId: currentTruth?.activeBatchId || null,
    currentWaveName: currentTruth?.currentWaveName || normalizeString(expansionWave?.currentWaveName) || null,
    acceptanceTrack: currentTruth?.acceptanceTrack || normalizeString(expansionWave?.acceptanceTrack) || null,
    inScopeModules: sortStrings(expansionWave?.inScopeModules),
    outOfScopeModules: sortStrings(expansionWave?.outOfScopeModules),
    highlightedFacts: summaryLines.slice(0, 6),
    summary: normalizeString(currentTruth?.summary),
  };
}

function summarizeFindings(findings) {
  const items = Array.isArray(findings) ? findings : [];
  const kindCounts = {};
  for (const item of items) {
    kindCounts[item.kind] = (kindCounts[item.kind] || 0) + 1;
  }
  const hardDeadCount = items.filter((item) => HARD_DEAD_FINDING_KINDS.has(item.kind)).length;
  const retiredChainCount = items.filter((item) => RETIRED_FINDING_KINDS.has(item.kind)).length;
  const actionableRetiredChainCount = items.filter((item) => ACTIONABLE_RETIRED_FINDING_KINDS.has(item.kind)).length;
  const historyRetainedCount = items.filter((item) => HISTORY_RETAINED_FINDING_KINDS.has(item.kind)).length;
  const supersededBundleCount = items.filter((item) => item.kind === "superseded-framework-bundle").length;
  const safeDeleteCandidateCount = items.filter((item) => item.safeDeleteCandidate === true).length;
  let status = "clean";
  if (hardDeadCount > 0) {
    status = "warning";
  } else if (items.length > 0) {
    status = "advisory";
  }
  const statusLabel = status === "warning"
    ? "发现硬死链"
    : status === "advisory"
      ? actionableRetiredChainCount > 0
        ? "建议收口"
        : "历史保留"
      : "干净";

  let summary = "未发现需要修剪的死链或已退休旧链路。";
  if (status === "warning") {
    summary = `发现 ${hardDeadCount} 个硬死链入口。`;
    if (actionableRetiredChainCount > 0) {
      summary = `${summary} 另有 ${actionableRetiredChainCount} 个可继续收缩的 delegation 历史链候选。`;
    }
    if (historyRetainedCount > 0) {
      summary = `${summary} 另有 ${historyRetainedCount} 个历史治理保留项${supersededBundleCount === historyRetainedCount ? "（superseded framework bundle）" : ""}。`;
    }
  } else if (status === "advisory") {
    if (actionableRetiredChainCount > 0) {
      summary = `未发现硬死链；发现 ${actionableRetiredChainCount} 个可继续收缩的 delegation 历史链候选。`;
      if (historyRetainedCount > 0) {
        summary = `${summary} 另有 ${historyRetainedCount} 个历史治理保留项${supersededBundleCount === historyRetainedCount ? "（superseded framework bundle）" : ""}。`;
      }
    } else if (historyRetainedCount > 0) {
      summary = `未发现硬死链，也没有待收缩的 delegation 历史链；另有 ${historyRetainedCount} 个历史治理保留项${supersededBundleCount === historyRetainedCount ? "（superseded framework bundle）" : ""}。`;
    }
  }

  return {
    status,
    statusLabel,
    summary,
    totalCount: items.length,
    hardDeadCount,
    retiredChainCount,
    actionableRetiredChainCount,
    historyRetainedCount,
    supersededBundleCount,
    safeDeleteCandidateCount,
    kindCounts,
  };
}

function toPruneCandidateSnapshot(item) {
  return {
    taskId: normalizeString(item.owner) || null,
    kind: normalizeString(item.kind) || null,
    summary: normalizeString(item.summary) || null,
    dependencyState: normalizeString(item.dependencyState) || null,
    activeDependentIds: uniqueStrings(item.activeDependentIds),
    retiredDependentIds: uniqueStrings(item.retiredDependentIds),
    recommendedAction: normalizeString(item.recommendedAction) || null,
    safeDeleteCandidate: item.safeDeleteCandidate === true,
  };
}

function buildPruneWave({
  waveId,
  title,
  strategy,
  candidateItems,
  summary,
}) {
  const items = Array.isArray(candidateItems) ? candidateItems : [];
  return {
    waveId,
    title,
    strategy,
    candidateCount: items.length,
    taskIds: items.map((item) => item.taskId).filter(Boolean),
    summary: normalizeString(summary) || null,
  };
}

function buildChainCollapseProposals(candidateItems, delegationContext) {
  if (!delegationContext || !Array.isArray(candidateItems) || candidateItems.length === 0) {
    return [];
  }

  const candidateIds = new Set(candidateItems.map((item) => normalizeString(item.taskId)).filter(Boolean));
  const visited = new Set();
  const proposals = [];
  const { taskMap, taskIndexMap, allDependentMap } = delegationContext;

  for (const seedId of sortByTaskOrder(Array.from(candidateIds), taskIndexMap)) {
    if (!seedId || visited.has(seedId)) {
      continue;
    }

    const queue = [seedId];
    const clusterIds = [];
    while (queue.length > 0) {
      const currentId = queue.shift();
      if (!currentId || visited.has(currentId) || !candidateIds.has(currentId)) {
        continue;
      }
      visited.add(currentId);
      clusterIds.push(currentId);

      const task = taskMap.get(currentId);
      const neighbors = [
        ...uniqueStrings(task?.dependsOn),
        ...uniqueStrings(allDependentMap.get(currentId)),
      ];
      for (const neighborId of neighbors) {
        if (candidateIds.has(neighborId) && !visited.has(neighborId)) {
          queue.push(neighborId);
        }
      }
    }

    const orderedClusterIds = sortByTaskOrder(clusterIds, taskIndexMap);
    const upstreamAnchorTaskIds = [];
    const downstreamBoundaryTaskIds = [];
    const exitTaskIds = [];

    for (const taskId of orderedClusterIds) {
      const task = taskMap.get(taskId);
      const dependsOn = uniqueStrings(task?.dependsOn);
      const dependents = uniqueStrings(allDependentMap.get(taskId));

      if (dependsOn.some((dependencyId) => !candidateIds.has(dependencyId))) {
        upstreamAnchorTaskIds.push(...dependsOn.filter((dependencyId) => !candidateIds.has(dependencyId)));
      }
      const outsideDependents = dependents.filter((dependentId) => !candidateIds.has(dependentId));
      if (outsideDependents.length > 0) {
        exitTaskIds.push(taskId);
        downstreamBoundaryTaskIds.push(...outsideDependents);
      }
    }

    const orderedUpstreamAnchorTaskIds = sortByTaskOrder(upstreamAnchorTaskIds, taskIndexMap);
    const orderedDownstreamBoundaryTaskIds = sortByTaskOrder(downstreamBoundaryTaskIds, taskIndexMap);
    const orderedExitTaskIds = sortByTaskOrder(exitTaskIds, taskIndexMap);
    const suggestedDependencyRewrites = [];

    if (orderedUpstreamAnchorTaskIds.length > 0) {
      for (const boundaryTaskId of orderedDownstreamBoundaryTaskIds) {
        const boundaryTask = taskMap.get(boundaryTaskId);
        const replaceDependencyTaskIds = sortByTaskOrder(
          uniqueStrings(boundaryTask?.dependsOn).filter((dependencyId) => candidateIds.has(dependencyId)),
          taskIndexMap,
        );
        if (replaceDependencyTaskIds.length === 0) {
          continue;
        }
        suggestedDependencyRewrites.push({
          taskId: boundaryTaskId,
          replaceDependencyTaskIds,
          suggestedDependencyTaskIds: orderedUpstreamAnchorTaskIds,
        });
      }
    }

    const rootTaskId = orderedClusterIds[0] || null;
    proposals.push({
      proposalId: rootTaskId ? `chain-collapse:${rootTaskId}` : `chain-collapse:${proposals.length + 1}`,
      removableTaskIds: orderedClusterIds,
      upstreamAnchorTaskIds: orderedUpstreamAnchorTaskIds,
      exitTaskIds: orderedExitTaskIds,
      downstreamBoundaryTaskIds: orderedDownstreamBoundaryTaskIds,
      suggestedDependencyRewrites,
      summary: orderedUpstreamAnchorTaskIds.length > 0 && orderedDownstreamBoundaryTaskIds.length > 0
        ? `可评估把 ${orderedDownstreamBoundaryTaskIds.join("、")} 对历史链 ${orderedClusterIds.join(" -> ")} 的依赖，桥接到更早锚点 ${orderedUpstreamAnchorTaskIds.join("、")}，再考虑移除这段纯历史桥。`
        : `这段纯历史桥 ${orderedClusterIds.join(" -> ")} 仍需要人工确认边界依赖后，才能继续评估 manifest 收缩。`,
    });
  }

  return proposals;
}

function buildNextWaveProposal(nextWave, pruneContext = {}) {
  if (!nextWave || typeof nextWave !== "object") {
    return null;
  }
  const waveId = normalizeString(nextWave.waveId);
  const taskIds = uniqueStrings(nextWave.taskIds);
  if (taskIds.length === 0) {
    return null;
  }

  if (waveId === "stale-scope-prune" || waveId === "retired-leaf-review") {
    return {
      advisory: true,
      manifestPath: "config/agent-delegation-tasks.json",
      waveId,
      action: "review-and-remove-task-ids",
      removeTaskIds: taskIds,
      summary: waveId === "stale-scope-prune"
        ? "这些任务的 scopePaths 已全部失效，适合先做手工确认后从 manifest 收缩。"
        : "这些历史任务已是叶子节点，适合先做手工确认后从 manifest 收缩。",
      preconditions: [
        "确认这些 taskId 不再被当前 truth、README 或其他治理文档作为 active 任务引用。",
        "确认删除后重新运行 dead-chain / monitor / gate，摘要仍与 current truth 一致。",
      ],
      verificationCommands: [
        "node scripts/agent-dead-chain-audit.mjs",
        "node scripts/agent-monitor.mjs",
        "node scripts/agent-gate.mjs --profile dev",
      ],
    };
  }

  if (waveId === "retired-chain-review") {
    const chainCollapseProposals = Array.isArray(pruneContext.chainCollapseProposals)
      ? pruneContext.chainCollapseProposals
      : [];
    return {
      advisory: true,
      manifestPath: "config/agent-delegation-tasks.json",
      waveId,
      action: "review-chain-collapse",
      removeTaskIds: [],
      chainCollapseProposals,
      summary: chainCollapseProposals.length > 0
        ? "这一波建议先评估历史链桥接重写，再按整段历史链收缩 manifest。"
        : "这一波仍需要先迁移依赖或按整段历史链整理，当前不建议直接删除 taskId。",
      preconditions: [
        "先确认下游 boundary task 的 dependsOn 可以桥接到更早的稳定锚点，而不会改写 current truth。",
        "依赖改写后重新运行 dead-chain / monitor / gate，确认摘要仍与当前单一事实源一致。",
      ],
      verificationCommands: [
        "node scripts/agent-dead-chain-audit.mjs",
        "node scripts/agent-monitor.mjs",
        "node scripts/agent-gate.mjs --profile dev",
      ],
    };
  }

  return {
    advisory: true,
    manifestPath: "config/agent-delegation-tasks.json",
    waveId,
    action: "review-before-removal",
    removeTaskIds: [],
    summary: "这一波仍需要先迁移依赖或按整段历史链整理，当前不建议直接删除 taskId。",
    preconditions: [
      "先完成依赖迁移或链路合并，再评估 manifest 收缩。",
    ],
    verificationCommands: [
      "node scripts/agent-dead-chain-audit.mjs",
      "node scripts/agent-monitor.mjs",
      "node scripts/agent-gate.mjs --profile dev",
    ],
  };
}

function buildPrunePlan(findings, delegationContext = null) {
  const items = Array.isArray(findings) ? findings : [];
  const staleScopeCandidates = items
    .filter((item) => item.kind === "stale-delegation-task" && item.safeDeleteCandidate === true)
    .map(toPruneCandidateSnapshot);
  const retiredLeafCandidates = items
    .filter((item) => item.kind === "retired-delegation-task" && item.dependencyState === "retired-leaf")
    .map(toPruneCandidateSnapshot);
  const retiredChainOnlyCandidates = items
    .filter((item) => item.kind === "retired-delegation-task" && item.dependencyState === "referenced-by-retired-only")
    .map(toPruneCandidateSnapshot);
  const blockedByActiveCandidates = items
    .filter((item) => item.kind === "retired-delegation-task" && item.dependencyState === "referenced-by-active")
    .map(toPruneCandidateSnapshot);
  const chainCollapseProposals = buildChainCollapseProposals(retiredChainOnlyCandidates, delegationContext);

  let summary = "当前没有可优先收缩的 delegation 历史链路。";
  if (
    staleScopeCandidates.length > 0
    || retiredLeafCandidates.length > 0
    || retiredChainOnlyCandidates.length > 0
    || blockedByActiveCandidates.length > 0
  ) {
    summary = `建议先处理 ${staleScopeCandidates.length} 个 scope 全失效候选，再人工复核 ${retiredLeafCandidates.length} 个 retired leaf；另有 ${retiredChainOnlyCandidates.length} 个仅被历史链引用、${blockedByActiveCandidates.length} 个仍被 active 依赖。`;
  }

  const reviewWaves = [];
  if (staleScopeCandidates.length > 0) {
    reviewWaves.push(buildPruneWave({
      waveId: "stale-scope-prune",
      title: "先处理 scope 全失效历史任务",
      strategy: "safe-delete-review",
      candidateItems: staleScopeCandidates,
      summary: "这些任务的 scopePaths 已全部失效，可优先复核是否直接从 manifest 收缩。",
    }));
  }
  if (retiredLeafCandidates.length > 0) {
    reviewWaves.push(buildPruneWave({
      waveId: "retired-leaf-review",
      title: "优先复核 retired leaf",
      strategy: "leaf-first-review",
      candidateItems: retiredLeafCandidates,
      summary: "这些历史任务已无任何下游依赖，是最适合先做人工收缩确认的一波。",
    }));
  }
  if (retiredChainOnlyCandidates.length > 0) {
    reviewWaves.push(buildPruneWave({
      waveId: "retired-chain-review",
      title: "再处理仅被历史链引用的任务段",
      strategy: "chain-collapse-review",
      candidateItems: retiredChainOnlyCandidates,
      summary: "这些历史任务仍被其他历史任务引用，更适合按整段链路一起收缩。",
    }));
  }
  if (blockedByActiveCandidates.length > 0) {
    reviewWaves.push(buildPruneWave({
      waveId: "active-dependency-migration",
      title: "最后迁移 active 依赖边界",
      strategy: "dependency-migration-review",
      candidateItems: blockedByActiveCandidates,
      summary: "这些历史任务仍被 active task 依赖，必须先迁移依赖或重写链路，再考虑删除。",
    }));
  }
  const nextWave = reviewWaves[0] || null;
  const nextWaveProposal = buildNextWaveProposal(nextWave, {
    chainCollapseProposals,
  });

  return {
    summary,
    nextWave,
    nextWaveProposal,
    reviewWaves,
    chainCollapseProposalCount: chainCollapseProposals.length,
    chainCollapseProposals: chainCollapseProposals.slice(0, 10),
    staleScopeCandidateCount: staleScopeCandidates.length,
    leafReviewCandidateCount: retiredLeafCandidates.length,
    retiredChainOnlyCount: retiredChainOnlyCandidates.length,
    blockedByActiveCount: blockedByActiveCandidates.length,
    staleScopeCandidates: staleScopeCandidates.slice(0, 10),
    leafReviewCandidates: retiredLeafCandidates.slice(0, 10),
    retiredChainOnlyCandidates: retiredChainOnlyCandidates.slice(0, 10),
    blockedByActiveCandidates: blockedByActiveCandidates.slice(0, 10),
  };
}

function buildMarkdownReport(report) {
  const lines = [
    "# Agent Dead-Chain Audit",
    "",
    `- Status: \`${report.status}\``,
    `- Status Label: \`${report.statusLabel || "-"}\``,
    `- Generated At: \`${report.generatedAt}\``,
    `- Summary: ${report.summary}`,
    "",
    "## Current Trunk",
    "",
    `- Active Batch: \`${report.trunk.activeBatchId || "-"}\``,
    `- Current Wave: \`${report.trunk.currentWaveName || "-"}\``,
    `- Acceptance Track: \`${report.trunk.acceptanceTrack || "-"}\``,
    `- In-Scope Modules: ${report.trunk.inScopeModules.length > 0 ? report.trunk.inScopeModules.join("、") : "-"}`,
    `- Out-of-Scope Modules: ${report.trunk.outOfScopeModules.length > 0 ? report.trunk.outOfScopeModules.join("、") : "-"}`,
    "",
    "## Findings",
    "",
    `- Total: \`${report.findings.totalCount}\``,
    `- Hard Dead: \`${report.findings.hardDeadCount}\``,
    `- Retired Chains: \`${report.findings.retiredChainCount}\``,
    `- Actionable Retired Chains: \`${report.findings.actionableRetiredChainCount ?? 0}\``,
    `- Historical Retained Items: \`${report.findings.historyRetainedCount ?? 0}\``,
    `- Superseded Framework Bundles: \`${report.findings.supersededBundleCount ?? 0}\``,
    `- Safe Delete Candidates: \`${report.findings.safeDeleteCandidateCount}\``,
    "",
  ];

  if (report.prunePlan) {
    lines.push("## Prune Plan", "");
    lines.push(`- Summary: ${report.prunePlan.summary || "-"}`);
    lines.push(`- Next Wave: \`${report.prunePlan.nextWave?.waveId || "-"}\` / ${report.prunePlan.nextWave?.title || "-"}`);
    lines.push(`- Next Proposal: \`${report.prunePlan.nextWaveProposal?.action || "-"}\` / ${(report.prunePlan.nextWaveProposal?.removeTaskIds || []).join("、") || "-"}`);
    lines.push(`- Chain Collapse Proposals: \`${report.prunePlan.chainCollapseProposalCount ?? 0}\``);
    lines.push(`- Stale Scope Candidates: \`${report.prunePlan.staleScopeCandidateCount ?? 0}\``);
    lines.push(`- Retired Leaf Review: \`${report.prunePlan.leafReviewCandidateCount ?? 0}\``);
    lines.push(`- Retired Chain Only: \`${report.prunePlan.retiredChainOnlyCount ?? 0}\``);
    lines.push(`- Blocked By Active: \`${report.prunePlan.blockedByActiveCount ?? 0}\``);
    lines.push("");
  }

  if (report.items.length === 0) {
    lines.push("未发现问题。");
    return lines.join("\n");
  }

  for (const item of report.items) {
    lines.push(`- [${item.kind}] ${item.summary}`);
    lines.push(`  - Owner: ${item.owner || "-"}`);
    lines.push(`  - Path: ${item.path || "-"}`);
    lines.push(`  - Severity: ${item.severity || "-"}`);
    if (item.evidence) {
      lines.push(`  - Evidence: ${item.evidence}`);
    }
    if (item.recommendedAction) {
      lines.push(`  - Action: ${item.recommendedAction}`);
    }
    if (item.dependencyState) {
      lines.push(`  - Dependency State: ${item.dependencyState}`);
    }
    if (Array.isArray(item.activeDependentIds) && item.activeDependentIds.length > 0) {
      lines.push(`  - Active Dependents: ${item.activeDependentIds.join("、")}`);
    }
    if (Array.isArray(item.retiredDependentIds) && item.retiredDependentIds.length > 0) {
      lines.push(`  - Retired Dependents: ${item.retiredDependentIds.join("、")}`);
    }
    lines.push(`  - Safe Delete Candidate: ${item.safeDeleteCandidate ? "yes" : "no"}`);
  }

  return lines.join("\n");
}

export async function runAgentDeadChainAudit(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || process.cwd());
  const reportDir = path.resolve(options.reportDir || resolveAgentArtifactsDir(projectRoot));
  const outJSON = options.reportDir
    ? path.join(reportDir, path.basename(AGENT_DEAD_CHAIN_AUDIT_JSON))
    : resolveAgentArtifactPath(projectRoot, path.basename(AGENT_DEAD_CHAIN_AUDIT_JSON));
  const outMD = options.reportDir
    ? path.join(reportDir, path.basename(AGENT_DEAD_CHAIN_AUDIT_MD))
    : resolveAgentArtifactPath(projectRoot, path.basename(AGENT_DEAD_CHAIN_AUDIT_MD));
  await fs.mkdir(reportDir, { recursive: true });

  const currentTruth = readCurrentTruthState(projectRoot);
  const expansionWave = await readJSONIfExists(path.join(projectRoot, "config", "project-expansion-wave.json")) || {};
  assertPlainObject(expansionWave, "project expansion wave", {
    category: "validation",
    failedStage: "read-expansion-wave",
  });

  const packageJSON = await readJSONIfExists(path.join(projectRoot, "package.json"));
  assertPlainObject(packageJSON, "package.json", {
    category: "validation",
    failedStage: "read-package-json",
  });

  const trackedFiles = listTrackedFiles(projectRoot);
  const delegationContext = await loadDelegationAuditContext(projectRoot);
  const findings = [
    ...(await collectScriptFindings(projectRoot, packageJSON)),
    ...(await collectDocLinkFindings(projectRoot, trackedFiles)),
    ...(await collectDelegationTaskFindings(projectRoot, delegationContext)),
    ...(await collectSupersededBundleFindings(projectRoot)),
  ].sort((left, right) => {
    const severityRank = { high: 0, medium: 1, low: 2 };
    const leftRank = severityRank[left.severity] ?? 99;
    const rightRank = severityRank[right.severity] ?? 99;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    if (left.kind !== right.kind) {
      return left.kind.localeCompare(right.kind, "en");
    }
    return left.path.localeCompare(right.path, "en");
  });

  const findingSummary = summarizeFindings(findings);
  const prunePlan = buildPrunePlan(findings, delegationContext);
  const report = {
    generatedAt: new Date().toISOString(),
    status: findingSummary.status,
    statusLabel: findingSummary.statusLabel,
    summary: findingSummary.summary,
    hardDeadCount: findingSummary.hardDeadCount,
    retiredChainCount: findingSummary.retiredChainCount,
    actionableRetiredChainCount: findingSummary.actionableRetiredChainCount,
    historyRetainedCount: findingSummary.historyRetainedCount,
    supersededBundleCount: findingSummary.supersededBundleCount,
    safeDeleteCandidateCount: findingSummary.safeDeleteCandidateCount,
    projectRoot: normalizePathForReport(projectRoot),
    trunk: buildTrunkSummary(currentTruth, expansionWave),
    findings: findingSummary,
    prunePlan,
    items: findings,
  };

  await Promise.all([
    writeJSONArtifact(outJSON, report),
    fs.writeFile(
      outMD,
      `${buildMarkdownReport(report)}\n`,
      "utf-8",
    ),
  ]);

  return report;
}
