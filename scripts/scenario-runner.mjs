#!/usr/bin/env node
/**
 * scenario-runner.mjs — 场景覆盖矩阵验证骨架
 *
 * 用途：按 docs/SCENARIO_MATRIX.md 中声明的场景，逐一跑通并生成覆盖率报告。
 * 当前为骨架实现，只做以下事情：
 *   1. 扫描 zotero-scenarios/*.scenario.js
 *   2. 读取 docs/SCENARIO_MATRIX.md 中"已覆盖场景"表格
 *   3. 对比两者，输出缺失/不一致的场景列表
 *   4. 写出 dist/scenario-coverage.json
 *
 * 完整实现需要启动 Zotero RDP 并执行每个场景（复用 zotero.mjs scenario 模式）。
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

async function scanScenarioFiles() {
  const scenariosDir = path.join(projectRoot, "zotero-scenarios");
  const entries = await fs.readdir(scenariosDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".scenario.js"))
    .map((e) => e.name)
    .sort();
}

async function parseScenarioMatrix() {
  const matrixPath = path.join(projectRoot, "docs/SCENARIO_MATRIX.md");
  const content = await fs.readFile(matrixPath, "utf-8");
  const coveredScenarios = [];

  // 提取"已覆盖场景"各 subsection 中的表格行
  const tableRowRegex = /\|\s*([^|]+)\s*\|\s*`([^|]+\.scenario\.js)`\s*\|\s*([^|]+)\s*\|\s*(\w+)\s*\|/g;
  let match;
  while ((match = tableRowRegex.exec(content)) !== null) {
    coveredScenarios.push({
      name: match[1].trim(),
      file: match[2].trim(),
      validationType: match[3].trim(),
      status: match[4].trim(),
    });
  }

  return coveredScenarios;
}

function computeCoverage(scenarioFiles, matrixEntries) {
  const matrixFiles = new Set(matrixEntries.map((e) => e.file));
  const missingInMatrix = scenarioFiles.filter((f) => !matrixFiles.has(f));
  const missingFiles = matrixEntries
    .filter((e) => e.status !== "missing" && !scenarioFiles.includes(e.file))
    .map((e) => e.file);

  return {
    totalScenarioFiles: scenarioFiles.length,
    totalMatrixEntries: matrixEntries.length,
    missingInMatrix,
    missingFiles,
    inconsistentEntries: matrixEntries.filter((e) =>
      e.status === "covered" || e.status === "partial"
        ? false
        : e.status === "missing" && scenarioFiles.includes(e.file)
    ),
    summary: {
      covered: matrixEntries.filter((e) => e.status === "covered").length,
      partial: matrixEntries.filter((e) => e.status === "partial").length,
      missing: matrixEntries.filter((e) => e.status === "missing").length,
    },
  };
}

async function main() {
  const scenarioFiles = await scanScenarioFiles();
  const matrixEntries = await parseScenarioMatrix();
  const coverage = computeCoverage(scenarioFiles, matrixEntries);

  const outputDir = path.join(projectRoot, "dist");
  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "scenario-coverage.json");
  await fs.writeFile(outputPath, JSON.stringify(coverage, null, 2), "utf-8");

  console.log("=== Scenario Coverage Report ===\n");
  console.log(`Scenario files found: ${coverage.totalScenarioFiles}`);
  console.log(`Matrix entries: ${coverage.totalMatrixEntries}`);
  console.log(`Covered: ${coverage.summary.covered}`);
  console.log(`Partial: ${coverage.summary.partial}`);
  console.log(`Missing: ${coverage.summary.missing}`);

  if (coverage.missingInMatrix.length > 0) {
    console.log("\n⚠  Files exist but not documented in SCENARIO_MATRIX.md:");
    for (const f of coverage.missingInMatrix) {
      console.log(`  - ${f}`);
    }
  }

  if (coverage.missingFiles.length > 0) {
    console.log("\n⚠  Documented in matrix but file not found:");
    for (const f of coverage.missingFiles) {
      console.log(`  - ${f}`);
    }
  }

  console.log(`\nFull report: ${outputPath}`);
}

main().catch((error) => {
  console.error("[scenario-runner] Error:", error.message);
  process.exit(1);
});
