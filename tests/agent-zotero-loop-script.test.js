import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it, assert } from "./test-framework.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function writeJSON(targetPath, payload) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

describe("Agent Zotero Loop Script", () => {
  it("should plan smart probe e2e in dry-run loop report when failed e2e has probe candidates", () => {
    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "cleanroom-agent-loop-artifacts-"));
    const obsidianDir = path.join(artifactsDir, "obsidian-workbench");

    try {
      writeJSON(path.join(artifactsDir, "agent-zotero-e2e.json"), {
        generatedAt: "2026-04-17T10:00:00.000Z",
        strategy: "hot",
        passed: false,
        issues: ["Reader sidebar interaction failed"],
        hints: [],
        diagnostics: [],
        primaryDiagnosis: null,
        cycles: [
          {
            index: 1,
            passed: false,
            checks: {},
            tests: {
              total: 0,
              passed: 0,
              failed: 0,
            },
            scenarios: {
              total: 1,
              passed: 0,
              failed: 1,
              results: [
                {
                  name: "reader surface smoke",
                  status: "failed",
                },
              ],
            },
            logs: {
              total: 1,
              errorCount: 1,
              warnCount: 0,
              infoCount: 0,
              recentErrors: [
                {
                  message: "pdfDocument is null -> getOutline2",
                },
              ],
            },
            visuals: {
              attempted: false,
              captures: [],
              warnings: [],
            },
          },
        ],
      });
      writeJSON(path.join(artifactsDir, "agent-gate.json"), {
        generatedAt: "2026-04-17T10:01:00.000Z",
        gatePassed: false,
        frontpageSummary: {
          status: "blocked",
          statusLabel: "需先处理",
          headline: "Reader sidebar 交互未闭环。",
          nextAction: "npm run agent:zotero:e2e",
        },
        issues: ["Reader sidebar 交互未闭环。"],
        recommendations: ["重新执行 `npm run agent:zotero:e2e`。"],
      });

      const result = spawnSync("node", ["scripts/agent-zotero-loop.mjs", "--dry-run"], {
        cwd: projectRoot,
        stdio: "pipe",
        encoding: "utf-8",
        env: {
          ...process.env,
          AGENT_ARTIFACTS_DIR: artifactsDir,
          AGENT_OBSIDIAN_DIR: obsidianDir,
        },
      });

      assert.equal(result.status, 0);
      const loopPath = path.join(artifactsDir, "agent-zotero-loop.json");
      const loopMarkdownPath = path.join(artifactsDir, "agent-zotero-loop.md");
      assert.ok(fs.existsSync(loopPath), "expected loop report to be written");
      assert.ok(fs.existsSync(loopMarkdownPath), "expected loop markdown to be written");

      const loop = JSON.parse(fs.readFileSync(loopPath, "utf-8"));
      const markdown = fs.readFileSync(loopMarkdownPath, "utf-8");

      assert.equal(loop.dryRun, true);
      assert.equal(loop.initialState.smartDebugProbeRecommended, true);
      assert.equal(loop.initialState.debugProbeCandidateCount, 1);
      assert.deepEqual(loop.initialState.debugProbeCandidateProbeIDs, ["reader-sidebar-view-closure"]);
      assert.equal(loop.plannedActions[0].id, "refresh-watch");
      assert.equal(loop.plannedActions[1].id, "run-e2e");
      assert.equal(loop.plannedActions[1].commandLabel, "npm run agent:zotero:e2e -- --probe-mode smart");
      assert.deepEqual(loop.plannedActions[1].commandArgs, ["run", "agent:zotero:e2e", "--", "--probe-mode", "smart"]);
      assert.ok(markdown.includes("下一次 E2E 将带 smart probe"));
      assert.ok(markdown.includes("reader-sidebar-view-closure"));
      assert.ok(markdown.includes("npm run agent:zotero:e2e -- --probe-mode smart"));
    } finally {
      fs.rmSync(artifactsDir, { recursive: true, force: true });
    }
  });
});
