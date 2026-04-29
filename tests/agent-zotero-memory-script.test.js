import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it, assert } from "./test-framework.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function writeMemoryFixture(filePath) {
  fs.writeFileSync(filePath, JSON.stringify({
    aboutMemoryExport: {
      ok: true,
      source: "gecko-memory-reporter-manager.getReports",
      generatedAt: "2026-03-21T10:00:00.000Z",
      reporterCount: 1,
      text: "process: Main\npath: explicit\namount: 41943040",
    },
    activities: [
      {
        actionId: "preferences.openPane",
        durationMs: 50,
        memory: {
          before: {
            ok: true,
            reporters: {
              resident: 100 * 1024 * 1024,
              explicit: 40 * 1024 * 1024,
            },
          },
          after: {
            ok: true,
            reporters: {
              resident: 104 * 1024 * 1024,
              explicit: 42 * 1024 * 1024,
            },
          },
        },
      },
    ],
  }), "utf-8");
}

describe("Agent Zotero Memory Script", () => {
  it("should print help", () => {
    const result = spawnSync("node", ["scripts/agent-zotero-memory.mjs", "--help"], {
      cwd: projectRoot,
      stdio: "pipe",
      encoding: "utf-8",
    });

    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes("agent-zotero-memory.mjs"));
    assert.ok(result.stdout.includes("--memory-fixture"));
    assert.ok(result.stdout.includes("--include-about-memory"));
    assert.ok(result.stdout.includes("memory extended diagnostics"));
  });

  it("should generate artifacts from a memory fixture", () => {
    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "cleanroom-agent-zotero-memory-artifacts-"));
    const fixturePath = path.join(artifactsDir, "memory.json");
    writeMemoryFixture(fixturePath);

    try {
      const result = spawnSync("node", [
        "scripts/agent-zotero-memory.mjs",
        "--memory-fixture",
        fixturePath,
        "--scenario",
        "memory extended diagnostics",
        "--include-about-memory",
      ], {
        cwd: projectRoot,
        stdio: "pipe",
        encoding: "utf-8",
        env: {
          ...process.env,
          AGENT_ARTIFACTS_DIR: artifactsDir,
        },
      });

      assert.equal(result.status, 0);
      const reportPath = path.join(artifactsDir, "agent-zotero-memory.json");
      const markdownPath = path.join(artifactsDir, "agent-zotero-memory.md");
      const aboutMemoryPath = path.join(artifactsDir, "agent-zotero-memory-about-memory.txt");
      assert.ok(fs.existsSync(reportPath));
      assert.ok(fs.existsSync(markdownPath));
      assert.ok(fs.existsSync(aboutMemoryPath));
      const report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
      assert.equal(report.kind, "agent-zotero-memory");
      assert.equal(report.scenarioName, "memory extended diagnostics");
      assert.equal(report.gateEffect, "non-blocking");
      assert.equal(report.successfulActivityCount, 1);
      assert.equal(report.rssDeltaMb, 4);
      assert.equal(report.aboutMemoryExport.ok, true);
      assert.equal(report.aboutMemoryExport.text, undefined);
      assert.equal(report.aboutMemoryExport.textArtifact, aboutMemoryPath);
      assert.ok(fs.readFileSync(markdownPath, "utf-8").includes("RSS delta"));
      assert.ok(fs.readFileSync(aboutMemoryPath, "utf-8").includes("path: explicit"));
    } finally {
      fs.rmSync(artifactsDir, { recursive: true, force: true });
    }
  });
});
