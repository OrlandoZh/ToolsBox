import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it, assert } from "./test-framework.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function writeProfileFixture(filePath) {
  fs.writeFileSync(filePath, JSON.stringify({
    threads: [
      {
        name: "GeckoMain",
        samples: {
          schema: ["stack", "threadCPUDelta"],
          data: [[0, 4]],
        },
        stackTable: {
          schema: ["prefix", "frame"],
          data: [[null, 0]],
        },
        frameTable: {
          schema: ["location"],
          data: [[0]],
        },
        stringTable: ["chrome://cleanroomtemplate/content/index.js"],
      },
    ],
  }), "utf-8");
}

describe("Agent Zotero Profile Script", () => {
  it("should print help", () => {
    const result = spawnSync("node", ["scripts/agent-zotero-profile.mjs", "--help"], {
      cwd: projectRoot,
      stdio: "pipe",
      encoding: "utf-8",
    });

    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes("agent-zotero-profile.mjs"));
    assert.ok(result.stdout.includes("--include-details"));
    assert.ok(result.stdout.includes("profiler extended diagnostics"));
  });

  it("should generate artifacts from a profile fixture", () => {
    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "cleanroom-agent-zotero-profile-artifacts-"));
    const fixturePath = path.join(artifactsDir, "profile.json");
    writeProfileFixture(fixturePath);

    try {
      const result = spawnSync("node", [
        "scripts/agent-zotero-profile.mjs",
        "--profile-fixture",
        fixturePath,
        "--scenario",
        "profiler extended diagnostics",
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
      const reportPath = path.join(artifactsDir, "agent-zotero-profile.json");
      const markdownPath = path.join(artifactsDir, "agent-zotero-profile.md");
      assert.ok(fs.existsSync(reportPath));
      assert.ok(fs.existsSync(markdownPath));
      const report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
      assert.equal(report.kind, "agent-zotero-profile");
      assert.equal(report.scenarioName, "profiler extended diagnostics");
      assert.equal(report.gateEffect, "non-blocking");
      assert.equal(report.successfulActivityCount, 1);
      assert.ok(fs.readFileSync(markdownPath, "utf-8").includes("Current Plugin"));
    } finally {
      fs.rmSync(artifactsDir, { recursive: true, force: true });
    }
  });
});
