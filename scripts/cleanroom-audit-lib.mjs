import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  assertScript,
  createScriptError,
  writeJSONArtifact,
} from "./script-runtime-lib.mjs";

const WINDOW_SIZE = 4;
const MIN_WINDOW_CHARS = 80;
const MIN_WINDOW_ALNUM = 30;
const MAX_REFERENCE_FILE_BYTES = 256 * 1024;
const TEXT_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".json",
  ".xhtml",
  ".css",
  ".ftl",
  ".md",
]);
const PROJECT_SIMILARITY_TARGETS = [
  "src",
  "scripts",
  "addon-static",
  "config",
  "types",
  "examples",
];
const PROJECT_SOURCE_SCAN_TARGETS = [
  "src",
  "scripts",
  "tests",
  "addon-static",
  "config",
  "types",
  "examples",
  "zotero-scenarios",
  "zotero-tests",
  "package.json",
  ".env.example",
];
const SOURCE_SCAN_EXCLUDE_FILES = new Set([
  "config/reference-projects.json",
  "scripts/cleanroom-audit-lib.mjs",
  "scripts/cleanroom-audit.mjs",
  "scripts/cleanroom-similarity.mjs",
]);
const CHINA_COMMERCIAL_DELIVERY_SECTION = "China Commercial Delivery Gate";
const CHINA_LEGAL_DOC_REQUIREMENTS = [
  {
    id: "code-provenance",
    file: "CODE_PROVENANCE.md",
    label: "代码来源留档",
    requiredSnippets: [
      "## 模块来源摘要",
      "## reference 使用边界",
      "## 发布包排除项",
    ],
  },
  {
    id: "third-party-notices",
    file: "THIRD_PARTY_NOTICES.md",
    label: "第三方 notices",
    requiredSnippets: [
      "## 当前发布包内第三方项",
      "## 当前未进入发布包的研究材料",
      "## 维护要求",
    ],
  },
  {
    id: "commercial-delivery-rights-notice",
    file: "COMMERCIAL_DELIVERY_RIGHTS_NOTICE.md",
    label: "商业交付权利说明",
    requiredSnippets: [
      "## 权利边界",
      "## 商业交付提示",
      "UNLICENSED",
    ],
  },
];
const DEFAULT_SPEC_REQUIREMENTS = [
  "Zotero Cleanroom Template",
  "Zotero 7/8",
  "8.0.2-beta.5+c35d7f21e",
  "macOS",
  "Acceptance Criteria (Black-Box)",
];
const SPEC_PLACEHOLDER_PATTERNS = [
  "Plugin name:",
  "Target Zotero versions:",
  "Supported platforms:",
  "Trigger:",
  "Expected behavior:",
  "Use this file to define *what* the plugin should do",
];
const FORBIDDEN_SOURCE_PATTERNS = [
  {
    id: "reference-import",
    label: "引用本地 reference 快照",
    pattern: /\b(?:from|import|require)\b[\s\S]{0,80}reference\//iu,
  },
  {
    id: "agpl-source-path",
    label: "出现已知 AGPL 参考路径",
    pattern: /zotero-plugin-template-main|bibgenie-0\.5\.7|zotero-plugin-scaffold-main|know-ur-zotero-main/iu,
  },
  {
    id: "agpl-license-marker",
    label: "出现 AGPL 许可证标识",
    pattern: /gnu affero|agpl-?3|agplv3/iu,
  },
];

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(targetPath) {
  await fs.mkdir(targetPath, { recursive: true });
}

async function readText(targetPath) {
  return await fs.readFile(targetPath, "utf-8");
}

function normalizeProjectRoot(projectRoot) {
  return path.resolve(projectRoot);
}

function normalizeReferenceRoot(projectRoot, referenceRoot) {
  if (referenceRoot) {
    return path.resolve(referenceRoot);
  }
  const envOverride = String(process.env.CLEANROOM_REFERENCE_ROOT || "").trim();
  if (envOverride) {
    return path.resolve(envOverride);
  }
  return path.join(projectRoot, "reference");
}

function normalizeReportDir(projectRoot, reportDir) {
  if (reportDir) {
    return path.resolve(reportDir);
  }
  return path.join(projectRoot, "dist");
}

function normalizeLine(line) {
  return String(line || "")
    .replaceAll("\t", " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function hashText(text) {
  return createHash("sha1").update(text).digest("hex");
}

async function collectTextFiles(projectRoot, targets, options = {}) {
  const files = [];
  const skipped = [];
  const queue = [];
  const maxBytes = Number.isFinite(Number(options.maxBytes)) ? Number(options.maxBytes) : null;

  for (const target of targets) {
    const fullPath = path.join(projectRoot, target);
    if (!(await exists(fullPath))) {
      continue;
    }
    queue.push(fullPath);
  }

  while (queue.length > 0) {
    const current = queue.shift();
    const relativePath = path.relative(projectRoot, current) || ".";
    let stats;
    try {
      stats = await fs.stat(current);
    } catch (error) {
      skipped.push({
        file: relativePath,
        reason: error?.code === "ENOENT" ? "路径不存在或为悬空链接" : `无法读取路径：${error?.code || error?.message || "unknown"}`,
      });
      continue;
    }
    if (stats.isDirectory()) {
      let entries = [];
      try {
        entries = await fs.readdir(current, { withFileTypes: true });
      } catch (error) {
        skipped.push({
          file: relativePath,
          reason: `无法遍历目录：${error?.code || error?.message || "unknown"}`,
        });
        continue;
      }
      for (const entry of entries) {
        if (entry.name === ".DS_Store" || entry.name === ".git") {
          continue;
        }
        queue.push(path.join(current, entry.name));
      }
      continue;
    }

    const extension = path.extname(current).toLowerCase();
    if (!TEXT_EXTENSIONS.has(extension)) {
      continue;
    }
    if (maxBytes !== null && stats.size > maxBytes) {
      skipped.push({
        file: relativePath,
        reason: `超过大小上限 ${maxBytes} bytes`,
        sizeBytes: stats.size,
      });
      continue;
    }
    files.push({
      path: current,
      relativePath,
      sizeBytes: stats.size,
    });
  }

  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "en"));
  skipped.sort((left, right) => left.file.localeCompare(right.file, "en"));
  return { files, skipped };
}

function buildWindows(relativePath, content, windowSize = WINDOW_SIZE) {
  const normalizedLines = String(content || "")
    .split(/\r?\n/gu)
    .map((line) => normalizeLine(line))
    .filter(Boolean);

  const windows = [];
  for (let index = 0; index <= normalizedLines.length - windowSize; index += 1) {
    const slice = normalizedLines.slice(index, index + windowSize);
    const joined = slice.join("\n");
    const alphaNumericCount = (joined.match(/[A-Za-z0-9]/gu) || []).length;
    if (joined.length < MIN_WINDOW_CHARS || alphaNumericCount < MIN_WINDOW_ALNUM) {
      continue;
    }
    windows.push({
      hash: hashText(joined),
      lineStart: index + 1,
      text: joined,
      file: relativePath,
    });
  }
  return windows;
}

function buildSimilarityMarkdown(report) {
  const lines = [
    "# Clean-Room Similarity Report",
    "",
    `- Status: \`${report.status}\``,
    `- Generated At: \`${report.generatedAt}\``,
    `- Project Root: \`${report.projectRoot}\``,
    `- Reference Root: \`${report.referenceRoot}\``,
    `- Window Size: \`${report.windowSize}\``,
    `- Project Files Scanned: \`${report.projectFileCount}\``,
    `- Reference Files Scanned: \`${report.referenceFileCount}\``,
    `- Flagged Files: \`${report.flaggedFileCount}\``,
    `- High-Risk Findings: \`${report.highRiskFindingCount}\``,
    "",
  ];

  if (report.status === "unavailable") {
    lines.push(report.summary || "Reference snapshots are unavailable.");
    return lines.join("\n");
  }

  if (report.flaggedFileCount === 0) {
    lines.push("No high-signal exact multi-line matches were detected in the scanned reference set.");
  } else {
    lines.push("## Flagged Files", "");
    for (const item of report.flaggedFiles.slice(0, 12)) {
      const refs = item.topReferenceFiles
        .map((entry) => `${entry.file} x${entry.matchCount}`)
        .join("；");
      lines.push(`- \`${item.file}\`: windows=${item.matchedWindowCount}/${item.projectWindowCount}，ratio=${item.matchedRatioText}，top refs=${refs || "-"}`);
    }
  }

  if (report.skippedReferenceFiles.length > 0) {
    lines.push("", "## Skipped Reference Files", "");
    for (const item of report.skippedReferenceFiles.slice(0, 10)) {
      lines.push(`- \`${item.file}\`: ${item.reason}`);
    }
  }

  return lines.join("\n");
}

function buildAuditMarkdown(report) {
  const lines = [
    "# Clean-Room Audit Report",
    "",
    `- Status: \`${report.status}\``,
    `- Mode: \`${report.mode}\``,
    `- Generated At: \`${report.generatedAt}\``,
    `- Project Root: \`${report.projectRoot}\``,
    `- Similarity Status: \`${report.similarity.status}\``,
    `- China Legal Status: \`${report.chinaLegal?.status || "unknown"}\``,
    "",
    "## Checks",
    "",
  ];

  for (const item of report.checks) {
    lines.push(`- [${item.ok ? "x" : " "}] \`${item.id}\` - ${item.label}`);
    if (item.details) {
      lines.push(`  - ${item.details}`);
    }
    if (item.evidence) {
      lines.push(`  - Evidence: ${item.evidence}`);
    }
  }

  if (Array.isArray(report.blockers) && report.blockers.length > 0) {
    lines.push("", "## Blockers", "");
    for (const item of report.blockers) {
      lines.push(`- ${item}`);
    }
  }

  return lines.join("\n");
}

async function writeMarkdownArtifact(filePath, content) {
  await fs.writeFile(filePath, `${String(content || "").trimEnd()}\n`, "utf-8");
}

function pickHighRiskFindings(flaggedFiles) {
  return flaggedFiles.filter((item) => item.matchedWindowCount >= 3 && item.matchedRatio >= 0.2);
}

export async function runCleanroomSimilarity(options = {}) {
  const projectRoot = normalizeProjectRoot(options.projectRoot || process.cwd());
  const referenceRoot = normalizeReferenceRoot(projectRoot, options.referenceRoot);
  const reportDir = normalizeReportDir(projectRoot, options.reportDir);

  await ensureDir(reportDir);

  if (!(await exists(referenceRoot))) {
    const unavailableReport = {
      generatedAt: new Date().toISOString(),
      status: "unavailable",
      summary: "Reference snapshots are not mounted locally; similarity scan recorded availability only.",
      projectRoot,
      referenceRoot,
      windowSize: WINDOW_SIZE,
      projectFileCount: 0,
      referenceFileCount: 0,
      flaggedFileCount: 0,
      highRiskFindingCount: 0,
      flaggedFiles: [],
      skippedReferenceFiles: [],
    };
    await writeJSONArtifact(path.join(reportDir, "cleanroom-similarity.json"), unavailableReport);
    await writeMarkdownArtifact(
      path.join(reportDir, "cleanroom-similarity.md"),
      buildSimilarityMarkdown(unavailableReport),
    );
    return unavailableReport;
  }

  const projectCollection = await collectTextFiles(projectRoot, PROJECT_SIMILARITY_TARGETS);
  const referenceCollection = await collectTextFiles(referenceRoot, ["."], {
    maxBytes: MAX_REFERENCE_FILE_BYTES,
  });

  const referenceIndex = new Map();
  for (const file of referenceCollection.files) {
    const content = await readText(file.path);
    const windows = buildWindows(file.relativePath, content);
    for (const item of windows) {
      const occurrences = referenceIndex.get(item.hash) || [];
      if (occurrences.length < 24) {
        occurrences.push({
          file: item.file,
          lineStart: item.lineStart,
        });
      }
      referenceIndex.set(item.hash, occurrences);
    }
  }

  const flaggedFiles = [];
  for (const file of projectCollection.files) {
    const content = await readText(file.path);
    const windows = buildWindows(file.relativePath, content);
    if (windows.length === 0) {
      continue;
    }

    const referenceMatches = new Map();
    for (const item of windows) {
      const matches = referenceIndex.get(item.hash) || [];
      for (const match of matches) {
        const current = referenceMatches.get(match.file) || 0;
        referenceMatches.set(match.file, current + 1);
      }
    }

    const matchedWindowCount = Array.from(referenceMatches.values())
      .reduce((total, value) => total + value, 0);
    if (matchedWindowCount === 0) {
      continue;
    }

    const topReferenceFiles = Array.from(referenceMatches.entries())
      .map(([matchedFile, matchCount]) => ({
        file: matchedFile,
        matchCount,
      }))
      .sort((left, right) => right.matchCount - left.matchCount || left.file.localeCompare(right.file, "en"))
      .slice(0, 5);

    const matchedRatio = matchedWindowCount / windows.length;
    flaggedFiles.push({
      file: file.relativePath,
      projectWindowCount: windows.length,
      matchedWindowCount,
      matchedRatio,
      matchedRatioText: `${(matchedRatio * 100).toFixed(2)}%`,
      topReferenceFiles,
    });
  }

  flaggedFiles.sort((left, right) => {
    if (right.matchedWindowCount !== left.matchedWindowCount) {
      return right.matchedWindowCount - left.matchedWindowCount;
    }
    if (right.matchedRatio !== left.matchedRatio) {
      return right.matchedRatio - left.matchedRatio;
    }
    return left.file.localeCompare(right.file, "en");
  });

  const highRiskFindings = pickHighRiskFindings(flaggedFiles);
  const report = {
    generatedAt: new Date().toISOString(),
    status: "available",
    summary: highRiskFindings.length > 0
      ? `Detected ${highRiskFindings.length} high-risk similarity finding(s).`
      : "Similarity scan completed without high-risk findings.",
    projectRoot,
    referenceRoot,
    windowSize: WINDOW_SIZE,
    projectFileCount: projectCollection.files.length,
    referenceFileCount: referenceCollection.files.length,
    flaggedFileCount: flaggedFiles.length,
    highRiskFindingCount: highRiskFindings.length,
    flaggedFiles,
    skippedReferenceFiles: referenceCollection.skipped,
  };

  await writeJSONArtifact(path.join(reportDir, "cleanroom-similarity.json"), report);
  await writeMarkdownArtifact(
    path.join(reportDir, "cleanroom-similarity.md"),
    buildSimilarityMarkdown(report),
  );
  return report;
}

function evaluateSpecDocument(content) {
  const issues = [];
  for (const pattern of SPEC_PLACEHOLDER_PATTERNS) {
    if (content.includes(pattern)) {
      issues.push(`SPEC 仍包含占位片段: ${pattern}`);
    }
  }
  for (const required of DEFAULT_SPEC_REQUIREMENTS) {
    if (!content.includes(required)) {
      issues.push(`SPEC 缺少必需说明: ${required}`);
    }
  }
  return {
    ok: issues.length === 0,
    issues,
  };
}

function parseChecklistSections(content) {
  const lines = String(content || "").split(/\r?\n/gu);
  let currentSection = "";
  let currentItem = null;
  const items = [];

  for (const line of lines) {
    const sectionMatch = line.match(/^##\s+(.+)$/u);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      currentItem = null;
      continue;
    }

    const itemMatch = line.match(/^- \[([ xX])\] (.+)$/u);
    if (itemMatch) {
      currentItem = {
        section: currentSection,
        checked: itemMatch[1].toLowerCase() === "x",
        label: itemMatch[2].trim(),
        evidence: "",
      };
      items.push(currentItem);
      continue;
    }

    const evidenceMatch = line.match(/^\s+Evidence:\s*(.+)$/u);
    if (currentItem && evidenceMatch) {
      currentItem.evidence = evidenceMatch[1].trim();
    }
  }

  return items;
}

function evaluateLegalChecklist(content) {
  const items = parseChecklistSections(content);
  const developmentItems = items.filter((item) => item.section.includes("Development Gate"));
  const releaseItems = items.filter((item) => item.section.includes("Release Gate"));
  const developmentIssues = [];
  const releaseStructureIssues = [];

  if (developmentItems.length === 0) {
    developmentIssues.push("缺少 Development Gate 区段。");
  }
  if (releaseItems.length === 0) {
    releaseStructureIssues.push("缺少 Release Gate 区段。");
  }

  for (const item of developmentItems) {
    if (!item.checked) {
      developmentIssues.push(`Development Gate 未勾选: ${item.label}`);
    }
    if (!item.evidence) {
      developmentIssues.push(`Development Gate 缺少 Evidence: ${item.label}`);
    }
  }

  for (const item of releaseItems) {
    if (!item.evidence) {
      releaseStructureIssues.push(`Release Gate 缺少 Evidence: ${item.label}`);
    }
  }

  return {
    items,
    developmentItems,
    releaseItems,
    developmentGateOK: developmentIssues.length === 0,
    releaseGateStructured: releaseStructureIssues.length === 0,
    developmentIssues,
    releaseStructureIssues,
  };
}

async function evaluateChinaLegalDocs(projectRoot) {
  const docs = [];
  const missingDocs = [];
  const contentIssues = [];

  for (const requirement of CHINA_LEGAL_DOC_REQUIREMENTS) {
    const absolutePath = path.join(projectRoot, requirement.file);
    if (!(await exists(absolutePath))) {
      missingDocs.push(requirement.file);
      docs.push({
        id: requirement.id,
        file: requirement.file,
        label: requirement.label,
        present: false,
        contentReady: false,
        missingSnippets: requirement.requiredSnippets,
      });
      continue;
    }

    const content = await readText(absolutePath);
    const missingSnippets = requirement.requiredSnippets.filter((snippet) => !content.includes(snippet));
    if (missingSnippets.length > 0) {
      contentIssues.push(`${requirement.file} 缺少必需片段: ${missingSnippets.join("、")}`);
    }
    docs.push({
      id: requirement.id,
      file: requirement.file,
      label: requirement.label,
      present: true,
      contentReady: missingSnippets.length === 0,
      missingSnippets,
    });
  }

  return {
    docs,
    missingDocs,
    contentIssues,
    docPackReady: missingDocs.length === 0 && contentIssues.length === 0,
  };
}

function evaluateChinaCommercialDeliveryGate(legalItems) {
  const chinaItems = legalItems.filter((item) => item.section.includes(CHINA_COMMERCIAL_DELIVERY_SECTION));
  const structureIssues = [];
  const completionIssues = [];

  if (chinaItems.length === 0) {
    structureIssues.push("缺少 China Commercial Delivery Gate 区段。");
  }

  for (const item of chinaItems) {
    if (!item.evidence) {
      structureIssues.push(`China Commercial Delivery Gate 缺少 Evidence: ${item.label}`);
    }
    if (!item.checked) {
      completionIssues.push(`China Commercial Delivery Gate 未勾选: ${item.label}`);
    }
  }

  return {
    items: chinaItems,
    structureIssues,
    completionIssues,
    structured: structureIssues.length === 0,
    deliveryGateOK: structureIssues.length === 0 && completionIssues.length === 0,
  };
}

async function evaluateChinaLegalPack(projectRoot, legalEvaluation, mode) {
  const docEvaluation = await evaluateChinaLegalDocs(projectRoot);
  const gateEvaluation = evaluateChinaCommercialDeliveryGate(legalEvaluation.items);
  const issues = [
    ...docEvaluation.missingDocs.map((file) => `缺少中国法交付文档: ${file}`),
    ...docEvaluation.contentIssues,
    ...gateEvaluation.structureIssues,
    ...gateEvaluation.completionIssues,
  ];
  const summary = issues.join("；") || "中国法商业交付文档骨架与 release-only gate 已就绪。";
  const blocking = mode === "release" && issues.length > 0;

  return {
    status: blocking ? "blocking" : (issues.length > 0 ? "advisory" : "ready"),
    summary,
    docPackReady: docEvaluation.docPackReady,
    deliveryGateOK: docEvaluation.docPackReady && gateEvaluation.deliveryGateOK,
    missingDocs: docEvaluation.missingDocs,
    docIssues: docEvaluation.contentIssues,
    gateIssues: [
      ...gateEvaluation.structureIssues,
      ...gateEvaluation.completionIssues,
    ],
    docs: docEvaluation.docs,
    items: gateEvaluation.items,
  };
}

async function scanSourceFilesForForbiddenPatterns(projectRoot) {
  const collection = await collectTextFiles(projectRoot, PROJECT_SOURCE_SCAN_TARGETS);
  const findings = [];

  for (const file of collection.files) {
    if (SOURCE_SCAN_EXCLUDE_FILES.has(file.relativePath)) {
      continue;
    }
    const content = await readText(file.path);
    for (const pattern of FORBIDDEN_SOURCE_PATTERNS) {
      if (pattern.pattern.test(content)) {
        findings.push({
          file: file.relativePath,
          patternId: pattern.id,
          label: pattern.label,
        });
      }
    }
  }

  return findings.sort((left, right) => left.file.localeCompare(right.file, "en"));
}

function checkGitBaseline(projectRoot) {
  const result = spawnSync("git", ["rev-parse", "--verify", "HEAD"], {
    cwd: projectRoot,
    encoding: "utf-8",
  });
  return {
    ok: result.status === 0,
    output: String(result.stdout || result.stderr || "").trim(),
  };
}

export async function runCleanroomAudit(options = {}) {
  const projectRoot = normalizeProjectRoot(options.projectRoot || process.cwd());
  const referenceRoot = normalizeReferenceRoot(projectRoot, options.referenceRoot);
  const reportDir = normalizeReportDir(projectRoot, options.reportDir);
  const mode = String(options.mode || "dev").trim() || "dev";

  assertScript(mode === "dev" || mode === "release", "cleanroom audit mode must be dev or release", {
    category: "args",
    failedStage: "parse-args",
  });

  await ensureDir(reportDir);

  const specPath = path.join(projectRoot, "SPEC.md");
  const legalPath = path.join(projectRoot, "LEGAL_RISK_CHECKLIST.md");
  const specContent = await readText(specPath)
    .catch(() => {
      throw createScriptError("validation", "Missing SPEC.md", {
        failedStage: "read-spec",
      });
    });
  const legalContent = await readText(legalPath)
    .catch(() => {
      throw createScriptError("validation", "Missing LEGAL_RISK_CHECKLIST.md", {
        failedStage: "read-legal-checklist",
      });
    });

  const similarity = await runCleanroomSimilarity({
    projectRoot,
    referenceRoot,
    reportDir,
  });
  const specEvaluation = evaluateSpecDocument(specContent);
  const legalEvaluation = evaluateLegalChecklist(legalContent);
  const chinaLegal = await evaluateChinaLegalPack(projectRoot, legalEvaluation, mode);
  const forbiddenPatternFindings = await scanSourceFilesForForbiddenPatterns(projectRoot);
  const gitBaseline = checkGitBaseline(projectRoot);

  const checks = [
    {
      id: "spec-baseline",
      label: "SPEC 已脱离占位模板并冻结当前模板黑盒契约",
      ok: specEvaluation.ok,
      required: true,
      evidence: "SPEC.md",
      details: specEvaluation.issues.join("；") || "SPEC 已覆盖版本、平台、功能与黑盒验收标准。",
    },
    {
      id: "legal-development-gate",
      label: "LEGAL_RISK_CHECKLIST 的 Development Gate 已全部勾选并带 Evidence",
      ok: legalEvaluation.developmentGateOK,
      required: true,
      evidence: "LEGAL_RISK_CHECKLIST.md",
      details: legalEvaluation.developmentIssues.join("；") || `Development Gate items: ${legalEvaluation.developmentItems.length}`,
    },
    {
      id: "legal-release-gate-structure",
      label: "LEGAL_RISK_CHECKLIST 的 Release Gate 已明确列出并带 Evidence",
      ok: legalEvaluation.releaseGateStructured,
      required: true,
      evidence: "LEGAL_RISK_CHECKLIST.md",
      details: legalEvaluation.releaseStructureIssues.join("；") || `Release Gate items: ${legalEvaluation.releaseItems.length}`,
    },
    {
      id: "source-isolation-scan",
      label: "实现文件未导入本地 reference 快照或明显 AGPL 路径",
      ok: forbiddenPatternFindings.length === 0,
      required: true,
      evidence: "npm run cleanroom:audit",
      details: forbiddenPatternFindings.length === 0
        ? "未发现 reference/、AGPL 或已知 AGPL 参考路径出现在实现文件。"
        : forbiddenPatternFindings.map((item) => `${item.file} -> ${item.label}`).join("；"),
    },
    {
      id: "git-baseline",
      label: "仓库已存在可审计的 clean-room 基线提交",
      ok: gitBaseline.ok,
      required: true,
      evidence: "git rev-parse --verify HEAD",
      details: gitBaseline.ok ? `HEAD=${gitBaseline.output}` : "仓库中尚无可验证提交。",
    },
    {
      id: "similarity-report-available",
      label: "发布态 similarity 报告必须可用",
      ok: mode !== "release" || similarity.status === "available",
      required: mode === "release",
      evidence: "dist/cleanroom-similarity.json",
      details: similarity.status === "available"
        ? similarity.summary
        : "本地未挂载 reference 快照，release 模式下不可放行。",
    },
    {
      id: "china-commercial-delivery-doc-pack",
      label: "中国法商业交付文档骨架已就绪",
      ok: chinaLegal.docPackReady,
      required: mode === "release",
      evidence: "CODE_PROVENANCE.md / THIRD_PARTY_NOTICES.md / COMMERCIAL_DELIVERY_RIGHTS_NOTICE.md",
      details: chinaLegal.missingDocs.length > 0 || chinaLegal.docIssues.length > 0
        ? [
          chinaLegal.missingDocs.length > 0 ? `缺少文档: ${chinaLegal.missingDocs.join("、")}` : "",
          chinaLegal.docIssues.join("；"),
        ].filter(Boolean).join("；")
        : `文档骨架已就绪: ${CHINA_LEGAL_DOC_REQUIREMENTS.map((item) => item.file).join("、")}`,
    },
    {
      id: "china-commercial-delivery-gate",
      label: "LEGAL_RISK_CHECKLIST 的 China Commercial Delivery Gate 已完成并带 Evidence",
      ok: chinaLegal.deliveryGateOK,
      required: mode === "release",
      evidence: "LEGAL_RISK_CHECKLIST.md",
      details: chinaLegal.gateIssues.join("；")
        || (chinaLegal.deliveryGateOK
          ? `China Commercial Delivery Gate items: ${chinaLegal.items.length}`
          : chinaLegal.summary),
    },
  ];

  const blockers = checks.filter((item) => item.required && !item.ok)
    .map((item) => `${item.label}: ${item.details}`);
  const report = {
    generatedAt: new Date().toISOString(),
    status: blockers.length === 0 ? "passed" : "failed",
    mode,
    projectRoot,
    referenceRoot,
    similarity: {
      status: similarity.status,
      summary: similarity.summary,
      flaggedFileCount: similarity.flaggedFileCount,
      highRiskFindingCount: similarity.highRiskFindingCount,
    },
    chinaLegal: {
      status: chinaLegal.status,
      summary: chinaLegal.summary,
      docPackReady: chinaLegal.docPackReady,
      deliveryGateOK: chinaLegal.deliveryGateOK,
      missingDocs: chinaLegal.missingDocs,
      docIssues: chinaLegal.docIssues,
      gateIssues: chinaLegal.gateIssues,
    },
    checks,
    blockers,
  };

  await writeJSONArtifact(path.join(reportDir, "cleanroom-audit.json"), report);
  await writeMarkdownArtifact(
    path.join(reportDir, "cleanroom-audit.md"),
    buildAuditMarkdown(report),
  );
  return report;
}
