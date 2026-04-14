/**
 * agent-sync-evidence-lib.mjs — 证据链刷新
 *
 * 用途：在 agent:sync 运行时，将当前 dist/ 下已生成的 gate、monitor、e2e、
 * validation 等工件中的关键证据摘要合并为一条带时间戳的证据链，写入
 * `dist/evidence-chain-latest.json`。
 *
 * 该文件供后续 agent:gate、agent:obsidian、controller 汇报等消费，
 * 避免每次都要重新扫描多个分散的工件。
 *
 * 非阻塞：刷新失败不应中断 agent:sync 主链。
 */

import { promises as fs } from "node:fs";
import path from "node:path";

const ARTIFACT_SOURCES = Object.freeze([
  { key: "gate", file: "agent-gate.json", label: "Gate 结论" },
  { key: "gateRelease", file: "agent-gate-release.json", label: "Release Gate 结论" },
  { key: "monitor", file: "agent-monitor-summary.json", label: "Monitor 汇总" },
  { key: "e2e", file: "agent-zotero-e2e-report.json", label: "E2E 报告" },
  { key: "validation", file: "validation-decision.json", label: "验证决策" },
  { key: "context", file: "agent-context.json", label: "Agent 上下文" },
  { key: "contextGuard", file: "agent-context-guard.json", label: "上下文守卫" },
  { key: "provenance", file: "artifact-provenance.json", label: "工件来源" },
  { key: "scenarioCoverage", file: "scenario-coverage.json", label: "场景覆盖" },
]);

async function readArtifact(distDir, source) {
  const filePath = path.join(distDir, source.file);
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function extractKeySignals(data) {
  if (!data || typeof data !== "object") {
    return null;
  }

  const signals = {};

  // Gate signals
  if ("status" in data) signals.status = data.status;
  if ("blocked" in data) signals.blocked = data.blocked;
  if ("passed" in data) signals.passed = data.passed;
  if ("failed" in data) signals.failed = data.failed;
  if ("total" in data) signals.total = data.total;

  // Validation decision
  if ("validationDecision" in data) signals.validationDecision = data.validationDecision;
  if ("decision" in data) signals.decision = data.decision;

  // E2E report
  if ("e2e" in data) signals.e2e = data.e2e;
  if ("cycles" in data) signals.cycles = data.cycles;
  if ("visualCapture" in data) signals.visualCapture = data.visualCapture;

  // Monitor summary
  if ("runName" in data) signals.runName = data.runName;
  if ("passRate" in data) signals.passRate = data.passRate;
  if ("qualityPassRate" in data) signals.qualityPassRate = data.qualityPassRate;

  // Context
  if ("generatedAt" in data) signals.generatedAt = data.generatedAt;
  if ("truthSource" in data) signals.truthSource = data.truthSource;

  // Scenario coverage
  if ("summary" in data) signals.coverageSummary = data.summary;

  return signals;
}

export async function refreshEvidenceChain(projectRoot) {
  const distDir = path.join(projectRoot, "dist");

  // Ensure dist dir exists
  try {
    await fs.mkdir(distDir, { recursive: true });
  } catch {
    // May already exist
  }

  const chain = {
    generatedAt: new Date().toISOString(),
    projectRoot,
    sources: {},
    consolidated: {},
  };

  // Read each artifact and extract key signals
  for (const source of ARTIFACT_SOURCES) {
    const data = await readArtifact(distDir, source);
    chain.sources[source.key] = {
      label: source.label,
      file: source.file,
      found: data !== null,
      signals: data ? extractKeySignals(data) : null,
    };
  }

  // Build consolidated view: merge important signals into a flat summary
  const consolidated = {
    gateStatus: chain.sources.gate?.signals?.status ?? null,
    gateBlocked: chain.sources.gate?.signals?.blocked ?? null,
    monitorPassRate: chain.sources.monitor?.signals?.passRate ?? null,
    e2eCycles: chain.sources.e2e?.signals?.cycles ?? null,
    validationDecision: chain.sources.validation?.signals?.validationDecision
      ?? chain.sources.validation?.signals?.decision ?? null,
    contextGeneratedAt: chain.sources.context?.signals?.generatedAt ?? null,
    coverageSummary: chain.sources.scenarioCoverage?.signals?.coverageSummary ?? null,
  };

  chain.consolidated = consolidated;

  // Write
  const outputPath = path.join(distDir, "evidence-chain-latest.json");
  await fs.writeFile(outputPath, JSON.stringify(chain, null, 2), "utf-8");

  // Log summary
  const foundCount = Object.values(chain.sources).filter((s) => s.found).length;
  const totalCount = ARTIFACT_SOURCES.length;
  console.log(`[agent-sync] Evidence chain refreshed: ${foundCount}/${totalCount} sources found -> ${outputPath}`);

  return chain;
}
