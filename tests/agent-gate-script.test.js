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

describe("Agent Gate Script", () => {
  it("should ingest fresh debug probe artifacts as advisory gate evidence", () => {
    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "cleanroom-agent-gate-artifacts-"));

    try {
      writeJSON(path.join(artifactsDir, "agent-monitor.json"), {
        generatedAt: "2026-04-17T10:02:00.000Z",
        total: 1,
        passed: 1,
        failed: 0,
        passRate: 100,
        averageDurationMs: 10,
        runs: [
          {
            runName: "check",
            status: "passed",
            success: true,
            exitCode: 0,
            startedAtISO: "2026-04-17T10:00:00.000Z",
            durationMs: 10,
          },
        ],
      });
      writeJSON(path.join(artifactsDir, "agent-zotero-e2e.json"), {
        generatedAt: "2026-04-17T10:00:00.000Z",
        strategy: "hot",
        probeMode: "off",
        passed: false,
        issues: ["Reader interaction failed"],
        hints: [],
        diagnostics: [],
        primaryDiagnosis: null,
        cycles: [],
      });
      writeJSON(path.join(artifactsDir, "agent-zotero-debug-probe.json"), {
        generatedAt: "2026-04-17T10:01:00.000Z",
        mode: "smart",
        selectionSource: "smart",
        selectedProbeIDs: ["reader-sidebar-view-closure"],
        status: "completed",
        executed: [
          {
            probeId: "reader-sidebar-view-closure",
            status: "completed",
            promotion: "interaction-proved",
          },
        ],
      });

      const result = spawnSync("node", [
        "scripts/agent-gate.mjs",
        "--profile",
        "dev",
        "--min-pass-rate",
        "0",
        "--max-recent-failed",
        "999",
      ], {
        cwd: projectRoot,
        stdio: "pipe",
        encoding: "utf-8",
        env: {
          ...process.env,
          AGENT_ARTIFACTS_DIR: artifactsDir,
        },
      });

      assert.equal(result.status, 2);
      const gatePath = path.join(artifactsDir, "agent-gate.json");
      const gateMarkdownPath = path.join(artifactsDir, "agent-gate.md");
      assert.ok(fs.existsSync(gatePath), "expected gate report to be written");
      assert.ok(fs.existsSync(gateMarkdownPath), "expected gate markdown to be written");

      const gate = JSON.parse(fs.readFileSync(gatePath, "utf-8"));
      const gateMarkdown = fs.readFileSync(gateMarkdownPath, "utf-8");

      assert.equal(gate.zoteroValidation.debugProbe.status, "completed");
      assert.equal(gate.zoteroValidation.debugProbe.freshForLatestE2E, true);
      assert.equal(gate.frontpageSummary.debugProbe.status, "completed");
      assert.ok(
        Array.isArray(gate.frontpageSummary.advisorySignals)
        && gate.frontpageSummary.advisorySignals.some((item) => item.includes("debug probe ready")),
      );
      assert.ok(gateMarkdown.includes("最近 Debug Probe"));
      assert.ok(gateMarkdown.includes("interaction-proved"));
    } finally {
      fs.rmSync(artifactsDir, { recursive: true, force: true });
    }
  });
});
