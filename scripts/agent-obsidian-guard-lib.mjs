import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { parseBooleanEnvFlag } from "./script-runtime-lib.mjs";

const OBSIDIAN_ALLOW_EXTERNAL_ENV = "AGENT_OBSIDIAN_ALLOW_EXTERNAL";
const FALLBACK_TEXT_PATTERNS = [
  "当前缺少足够的自动化结论，请人工查看工件。",
  "待人工介入",
  "当前没有明确阻塞项，优先复核 gate 与 loop 是否一致。",
];

export function resolveObsidianAllowExternal(env = process.env) {
  return parseBooleanEnvFlag(env, OBSIDIAN_ALLOW_EXTERNAL_ENV, {
    defaultValue: false,
  });
}

export function isPathWithinRoot(targetPath, rootPath) {
  const root = path.resolve(String(rootPath || ""));
  const target = path.resolve(String(targetPath || ""));
  if (!root || !target) {
    return false;
  }
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function resolveCanonicalPath(inputPath) {
  const resolved = path.resolve(String(inputPath || ""));
  try {
    return await fs.realpath(resolved);
  } catch {
    return resolved;
  }
}

function resolveArtifactsDir(projectRoot, env = process.env) {
  const customDir = String(env?.AGENT_ARTIFACTS_DIR || "").trim();
  return customDir ? path.resolve(customDir) : path.join(path.resolve(projectRoot), "dist");
}

function resolveArtifactPath(projectRoot, fileName, env = process.env) {
  return path.join(resolveArtifactsDir(projectRoot, env), fileName);
}

async function readJSONArtifact(filePath) {
  try {
    const source = await fs.readFile(filePath, "utf-8");
    return {
      filePath,
      present: true,
      invalid: false,
      payload: JSON.parse(source),
    };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return {
        filePath,
        present: false,
        invalid: false,
        payload: null,
      };
    }
    if (error instanceof SyntaxError) {
      return {
        filePath,
        present: true,
        invalid: true,
        payload: null,
      };
    }
    throw error;
  }
}

async function readTextArtifact(filePath) {
  try {
    return {
      filePath,
      present: true,
      content: await fs.readFile(filePath, "utf-8"),
    };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return {
        filePath,
        present: false,
        content: "",
      };
    }
    throw error;
  }
}

function parseGeneratedAtMs(value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function parseFrontmatter(source) {
  const text = String(source || "");
  if (!text.startsWith("---\n")) {
    return {};
  }
  const match = text.match(/^---\n([\s\S]*?)\n---/u);
  if (!match?.[1]) {
    return {};
  }
  const record = {};
  match[1].split(/\r?\n/u).forEach((line) => {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      return;
    }
    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    record[key] = value;
  });
  return record;
}

function parseCanvasMetadata(source) {
  try {
    const payload = JSON.parse(String(source || "{}"));
    const nodes = Array.isArray(payload?.nodes) ? payload.nodes : [];
    const metaNode = nodes.find((node) => String(node?.text || "").includes("generation_id="));
    const metadata = {};
    String(metaNode?.text || "")
      .split(/\r?\n/u)
      .forEach((line) => {
        const separatorIndex = line.indexOf("=");
        if (separatorIndex <= 0) {
          return;
        }
        const key = line.slice(0, separatorIndex).trim();
        const value = line.slice(separatorIndex + 1).trim();
        if (key) {
          metadata[key] = value;
        }
      });
    return {
      valid: true,
      payload,
      metadata,
      rootText: String(nodes.find((node) => node?.id === "root0001")?.text || ""),
      allText: nodes.map((node) => String(node?.text || "")).join("\n"),
    };
  } catch {
    return {
      valid: false,
      payload: null,
      metadata: {},
      rootText: "",
      allText: "",
    };
  }
}

function getStatusAndRecommendation(result) {
  const issue = buildObsidianWorkspaceGuardIssue(result);
  const recommendation = buildObsidianWorkspaceGuardRecommendation(result);
  return {
    issue,
    recommendation,
  };
}

function pushFinding(result, bucket, finding) {
  result[bucket].push(finding);
  if (bucket === "violations") {
    result.violation = true;
    if (result.strict) {
      result.ok = false;
    }
  }
}

function buildFinding(kind, status, message, details = {}) {
  return {
    kind,
    status,
    message,
    ...details,
  };
}

function containsFallbackText(text) {
  return FALLBACK_TEXT_PATTERNS.some((pattern) => String(text || "").includes(pattern));
}

function hasProjectMirror(record) {
  return Boolean(record && typeof record === "object");
}

function isMeaningfulWave(record) {
  return Boolean(
    record
      && typeof record === "object"
      && (
        String(record.currentWaveName || "").trim()
        || String(record.acceptanceTrack || "").trim()
        || (Array.isArray(record.inScopeModules) && record.inScopeModules.length > 0)
      ),
  );
}

function summarizeFindings(result) {
  if (result.violations.length > 0) {
    result.message = result.violations[0].message;
  } else if (result.warnings.length > 0) {
    result.message = result.warnings[0].message;
  }
  const { issue, recommendation } = getStatusAndRecommendation(result);
  result.issue = issue;
  result.recommendation = recommendation;
  return result;
}

export function buildObsidianWorkspaceGuardIssue(result) {
  if (!result || !result.violation) {
    return null;
  }
  if (result.status === "invalid-artifact") {
    return `Obsidian handoff 工件无效：\`${result.artifactPath}\` 不是合法 JSON。`;
  }
  if (result.status === "invalid-workspace") {
    return `Obsidian handoff 工件缺少有效 workspaceDir：\`${result.artifactPath}\`。`;
  }
  if (result.status === "external-blocked") {
    return `Obsidian workspaceDir 越界：\`${result.workspaceDir || "-"}\` 不属于当前仓库 \`${result.projectRootCanonical}\`。`;
  }
  return result.violations[0]?.message || null;
}

export function buildObsidianWorkspaceGuardRecommendation(result) {
  if (!result || (!result.violation && result.warnings.length === 0)) {
    return null;
  }
  if (result.status === "external-blocked" || result.status === "invalid-workspace" || result.status === "invalid-artifact") {
    return `若确需使用仓库外 Obsidian 目录，请显式设置 \`${OBSIDIAN_ALLOW_EXTERNAL_ENV}=1\`；否则请重新执行 \`npm run agent:sync\` 回写仓库内 fresh 工作台。`;
  }
  return "优先执行 `npm run agent:sync` 重新生成当前项目态工作台；若只是初始化后的 bootstrap shell，请在 fresh `monitor -> gate` 后再刷新 Obsidian。";
}

export async function evaluateObsidianWorkspaceGuard(projectRoot, options = {}) {
  const env = options.env || process.env;
  const allowExternal = resolveObsidianAllowExternal(env);
  const strict = options.strict === true;
  const scope = options.scope === "path" ? "path" : "full";
  const handoff = await readJSONArtifact(resolveArtifactPath(projectRoot, "agent-obsidian-handoff.json", env));
  const projectRootCanonical = await resolveCanonicalPath(projectRoot);

  const base = {
    checkedAt: new Date().toISOString(),
    strict,
    scope,
    allowExternal,
    projectRoot: path.resolve(projectRoot),
    projectRootCanonical,
    artifactPath: handoff.filePath,
    handoffPresent: handoff.present,
    handoffInvalid: handoff.invalid,
    generatedAt: handoff.payload?.generatedAt || null,
    generationId: handoff.payload?.generationId || null,
    workspaceDir: null,
    workspaceDirCanonical: null,
    inProject: null,
    bypassed: false,
    violation: false,
    ok: true,
    status: "missing-artifact",
    message: "未发现 Obsidian handoff 工件，已跳过路径归属校验。",
    issue: null,
    recommendation: null,
    warnings: [],
    violations: [],
    freshnessStatus: "skipped",
    coherenceStatus: "skipped",
    contentStatus: "skipped",
    bootstrapShell: handoff.payload?.bootstrapShell === true,
    summarySource: handoff.payload?.summarySource || null,
    summaryHeadline: handoff.payload?.summaryHeadline || null,
    summaryStatusLabel: handoff.payload?.summaryStatusLabel || null,
    summaryNextAction: handoff.payload?.summaryNextAction || null,
    runnableNextCommand: handoff.payload?.runnableNextCommand || null,
    sourceGateGeneratedAt: handoff.payload?.sourceGateGeneratedAt || null,
    sourceMonitorGeneratedAt: handoff.payload?.sourceMonitorGeneratedAt || null,
    sourceLoopGeneratedAt: handoff.payload?.sourceLoopGeneratedAt || null,
    projectContext: handoff.payload?.projectContext || null,
  };

  if (!handoff.present) {
    return base;
  }

  if (handoff.invalid) {
    const result = {
      ...base,
      status: "invalid-artifact",
      violation: true,
      ok: !strict,
      message: `Obsidian handoff 工件不是合法 JSON：${handoff.filePath}`,
    };
    result.issue = buildObsidianWorkspaceGuardIssue(result);
    result.recommendation = buildObsidianWorkspaceGuardRecommendation(result);
    return result;
  }

  const workspaceDirRaw = String(handoff.payload?.workspaceDir || "").trim();
  if (!workspaceDirRaw) {
    const result = {
      ...base,
      status: "invalid-workspace",
      violation: true,
      ok: !strict,
      message: `Obsidian handoff 工件缺少有效 workspaceDir：${handoff.filePath}`,
    };
    result.issue = buildObsidianWorkspaceGuardIssue(result);
    result.recommendation = buildObsidianWorkspaceGuardRecommendation(result);
    return result;
  }

  const workspaceDirCanonical = await resolveCanonicalPath(workspaceDirRaw);
  const inProject = isPathWithinRoot(workspaceDirCanonical, projectRootCanonical);
  const result = {
    ...base,
    workspaceDir: workspaceDirRaw,
    workspaceDirCanonical,
    inProject,
    status: inProject ? "within-project" : "external-blocked",
    message: inProject
      ? `Obsidian workspaceDir 已归属当前仓库：${workspaceDirCanonical}`
      : `Obsidian workspaceDir 越界：${workspaceDirCanonical} 不属于 ${projectRootCanonical}`,
  };

  if (!inProject) {
    if (allowExternal) {
      result.status = "external-allowed";
      result.bypassed = true;
      result.message = `Obsidian workspaceDir 位于仓库外目录，但已通过 ${OBSIDIAN_ALLOW_EXTERNAL_ENV}=1 显式放行：${workspaceDirCanonical}`;
      if (scope === "path") {
        return result;
      }
    } else {
      result.violation = true;
      result.ok = !strict;
      result.issue = buildObsidianWorkspaceGuardIssue(result);
      result.recommendation = buildObsidianWorkspaceGuardRecommendation(result);
      return result;
    }
  } else if (scope === "path") {
    return result;
  }

  const gate = await readJSONArtifact(resolveArtifactPath(projectRoot, "agent-gate.json", env));
  const monitor = await readJSONArtifact(resolveArtifactPath(projectRoot, "agent-monitor.json", env));
  const loop = await readJSONArtifact(resolveArtifactPath(projectRoot, "agent-zotero-loop.json", env));
  const latestSourceMs = Math.max(
    parseGeneratedAtMs(gate.payload?.generatedAt) || 0,
    parseGeneratedAtMs(monitor.payload?.generatedAt) || 0,
  ) || null;
  const handoffGeneratedAtMs = parseGeneratedAtMs(result.generatedAt);

  if (result.bootstrapShell === true) {
    result.freshnessStatus = "bootstrap-shell";
    pushFinding(result, "warnings", buildFinding(
      "freshness",
      "bootstrap-shell",
      "当前 Obsidian 工作台仍是 bootstrap shell；初始化占位允许存在，但不代表当前项目结论，请先执行 `npm run agent:sync`。",
    ));
  } else if (latestSourceMs && handoffGeneratedAtMs && handoffGeneratedAtMs < latestSourceMs) {
    result.freshnessStatus = "stale";
    pushFinding(result, strict ? "violations" : "warnings", buildFinding(
      "freshness",
      "stale",
      "Obsidian 工作台早于最新 gate/monitor 来源，尚未刷新到当前项目态；请执行 `npm run agent:sync`。",
      {
        handoffGeneratedAt: result.generatedAt,
        latestSourceGeneratedAt: new Date(latestSourceMs).toISOString(),
      },
    ));
  } else {
    result.freshnessStatus = "current";
  }

  const statusNotePath = String(handoff.payload?.statusNote || path.join(workspaceDirCanonical, "01-Zotero-Agent-当前状态总览.md"));
  const canvasPath = String(handoff.payload?.architectureCanvas || path.join(workspaceDirCanonical, "00-Zotero-Agent-项目架构与闭环.canvas"));
  const [statusNote, canvas] = await Promise.all([
    readTextArtifact(statusNotePath),
    readTextArtifact(canvasPath),
  ]);

  if (!statusNote.present || !canvas.present) {
    result.coherenceStatus = "missing-generated-files";
    pushFinding(result, strict ? "violations" : "warnings", buildFinding(
      "coherence",
      "missing-generated-files",
      "Obsidian handoff 已存在，但状态页或白板缺失，说明工作台未完整生成。",
      {
        statusNotePresent: statusNote.present,
        canvasPresent: canvas.present,
      },
    ));
    return summarizeFindings(result);
  }

  const statusFrontmatter = parseFrontmatter(statusNote.content);
  const canvasMeta = parseCanvasMetadata(canvas.content);
  if (!canvasMeta.valid) {
    result.coherenceStatus = "invalid-canvas";
    pushFinding(result, strict ? "violations" : "warnings", buildFinding(
      "coherence",
      "invalid-canvas",
      `Obsidian 白板不是合法 JSON Canvas：${canvasPath}`,
    ));
    return summarizeFindings(result);
  }

  const statusGenerationId = String(statusFrontmatter.handoff_generation_id || "").trim();
  const canvasGenerationId = String(canvasMeta.metadata.generation_id || "").trim();
  const statusSummarySource = String(statusFrontmatter.summary_source || "").trim();
  const canvasSummarySource = String(canvasMeta.metadata.summary_source || "").trim();
  const statusBootstrapShell = String(statusFrontmatter.bootstrap_shell || "").trim();
  const canvasBootstrapShell = String(canvasMeta.metadata.bootstrap_shell || "").trim();

  if (!statusGenerationId || !canvasGenerationId || !result.generationId || statusGenerationId !== result.generationId || canvasGenerationId !== result.generationId) {
    result.coherenceStatus = "generation-drift";
    pushFinding(result, strict ? "violations" : "warnings", buildFinding(
      "coherence",
      "generation-drift",
      "Obsidian handoff、状态页与白板不属于同一轮生成，存在 coherence drift。",
      {
        handoffGenerationId: result.generationId,
        statusGenerationId,
        canvasGenerationId,
      },
    ));
  } else if (
    statusSummarySource !== String(result.summarySource || "")
    || canvasSummarySource !== String(result.summarySource || "")
    || statusBootstrapShell !== String(result.bootstrapShell)
    || canvasBootstrapShell !== String(result.bootstrapShell)
  ) {
    result.coherenceStatus = "metadata-drift";
    pushFinding(result, strict ? "violations" : "warnings", buildFinding(
      "coherence",
      "metadata-drift",
      "Obsidian handoff、状态页与白板的 summary source / bootstrap shell 元数据不一致。",
      {
        handoffSummarySource: result.summarySource,
        statusSummarySource,
        canvasSummarySource,
        handoffBootstrapShell: String(result.bootstrapShell),
        statusBootstrapShell,
        canvasBootstrapShell,
      },
    ));
  } else {
    result.coherenceStatus = "aligned";
  }

  const gateFrontpagePresent = Boolean(gate.payload?.frontpageSummary && typeof gate.payload.frontpageSummary === "object");
  const combinedText = `${statusNote.content}\n${canvasMeta.rootText}\n${canvasMeta.allText}`;
  if (gateFrontpagePresent && result.bootstrapShell !== true && containsFallbackText(combinedText)) {
    result.contentStatus = "fallback-drift";
    pushFinding(result, strict ? "violations" : "warnings", buildFinding(
      "content",
      "fallback-drift",
      "当前 gate/monitor 已有有效结论，但 Obsidian 状态页或白板仍停留在 fallback / 模板壳文案。",
    ));
  } else {
    result.contentStatus = "current-project-view";
  }

  const currentWaveName = String(result.projectContext?.expansionWave?.currentWaveName || "").trim();
  if (currentWaveName && !combinedText.includes(currentWaveName)) {
    pushFinding(result, strict ? "violations" : "warnings", buildFinding(
      "content",
      "missing-wave-context",
      "项目已声明 current wave，但 Obsidian 状态页/白板未反映当前 wave 语义。",
      {
        currentWaveName,
      },
    ));
  }

  const validationMirror = result.projectContext?.validationOverrides;
  if (hasProjectMirror(validationMirror) && Number(validationMirror?.overrideCount || 0) > 0) {
    const validationLevel = String(result.projectContext?.validationDecision?.level || "").trim();
    const validationSummary = String(validationMirror?.summary || "").trim();
    if ((validationLevel && !combinedText.includes(validationLevel)) || (validationSummary && !combinedText.includes(validationSummary))) {
      pushFinding(result, strict ? "violations" : "warnings", buildFinding(
        "content",
        "missing-validation-context",
        "项目已声明 validation override，但 Obsidian 状态页/白板未反映当前 validation profile。",
        {
          validationLevel,
        },
      ));
    }
  }

  if (!isMeaningfulWave(result.projectContext?.expansionWave) && result.projectContext?.expansionWave?.present !== false) {
    const wavePlaceholderText = "当前尚未声明项目 expansion wave。";
    if (!combinedText.includes(wavePlaceholderText) && !combinedText.includes("缺少 project-expansion-wave mirror")) {
      pushFinding(result, strict ? "violations" : "warnings", buildFinding(
        "content",
        "missing-wave-placeholder",
        "当前没有 active wave 时，Obsidian 白板应显式展示缺少 / 未声明 wave，而不是退回模板壳。",
      ));
    }
  }

  return summarizeFindings(result);
}
