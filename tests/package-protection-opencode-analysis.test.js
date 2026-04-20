import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  parsePackageProtectionOpencodeArgs,
  runPackageProtectionOpencodeAnalysis,
} from "../scripts/package-protection-opencode-analysis.mjs";

function writeJSON(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

function makeFakeOpencodeExecutable(payload) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fake-opencode-"));
  const scriptPath = path.join(tempRoot, "fake-opencode.js");
  const payloadText = JSON.stringify(payload);
  fs.writeFileSync(scriptPath, `#!/usr/bin/env node
const payload = ${JSON.stringify(payloadText)};
const sessionID = "ses_test_opencode";
const messageID = "msg_test_opencode";
console.log(JSON.stringify({ type: "step_start", sessionID, part: { type: "step-start", messageID, sessionID } }));
console.log(JSON.stringify({ type: "text", sessionID, part: { type: "text", messageID, sessionID, text: payload } }));
console.log(JSON.stringify({ type: "step_finish", sessionID, part: { type: "step-finish", messageID, sessionID, reason: "stop" } }));
`, "utf-8");
  fs.chmodSync(scriptPath, 0o755);
  return {
    root: tempRoot,
    scriptPath,
  };
}

function buildTempProject({ addonRef = "cleanroomtemplate", addonVersion = "0.1.0" } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "package-protection-opencode-analysis-"));
  writeJSON(path.join(root, "config", "addon.config.json"), {
    addonName: "Cleanroom Template",
    addonId: "cleanroom-template@example.com",
    addonRef,
    addonVersion,
  });
  const buildRoot = path.join(root, "build", addonRef);
  fs.mkdirSync(path.join(buildRoot, "content", "scripts"), { recursive: true });
  fs.writeFileSync(path.join(buildRoot, "content", "scripts", `${addonRef}.js`), "globalThis.bootstrapPlugin = function bootstrapPlugin() {};\n", "utf-8");
  fs.writeFileSync(path.join(buildRoot, "manifest.json"), "{\n  \"manifest_version\": 2\n}\n", "utf-8");
  fs.writeFileSync(path.join(buildRoot, "bootstrap.js"), "var bootstrapPlugin = globalThis.bootstrapPlugin;\n", "utf-8");
  fs.mkdirSync(path.join(root, "dist"), { recursive: true });
  fs.writeFileSync(path.join(root, "dist", `${addonRef}-${addonVersion}-shielded-surface-scrub.xpi`), "fake-xpi", "utf-8");
  return {
    root,
    buildRoot,
  };
}

describe("Package Protection Opencode Analysis", () => {
  it("should parse required args and optional flags", () => {
    const options = parsePackageProtectionOpencodeArgs([
      "--variant", "surface-scrub",
      "--channel", "stable",
      "--model", "openai/gpt-5.4",
      "--agent", "static-auditor",
      "--opencode-bin", "/tmp/opencode",
      "--timeout-ms", "120000",
      "--no-package",
    ]);

    assert.equal(options.variant, "shielded-surface-scrub");
    assert.equal(options.channel, "stable");
    assert.equal(options.model, "openai/gpt-5.4");
    assert.equal(options.agent, "static-auditor");
    assert.equal(options.opencodeBin, "/tmp/opencode");
    assert.equal(options.timeoutMs, 120000);
    assert.equal(options.packageFirst, false);
  });

  it("should persist opencode advisory artifacts and normalize suggested rating", async () => {
    const project = buildTempProject();
    const fake = makeFakeOpencodeExecutable({
      status: "attention",
      owner_role: "opencode-static-analysis",
      rating: "high level architecture",
      summary: "可以归纳启动链和宿主集成面，但还原不出可读模块主体。",
      changed_files: [],
      checks_run: ["read main script", "read manifest", "inspect bootstrap chain"],
      risks: ["仍能识别 loader 与宿主绑定关系"],
      blockers: [],
      next_action: "record-suggested-llm-rating",
    });

    try {
      const { report, paths } = await runPackageProtectionOpencodeAnalysis({
        projectRootPath: project.root,
        variant: "shielded-surface-scrub",
        channel: "stable",
        opencodeBin: fake.scriptPath,
        packageFirst: false,
      });

      const storedJSON = JSON.parse(fs.readFileSync(paths.reportPath, "utf-8"));
      const storedMD = fs.readFileSync(paths.reportMDPath, "utf-8");

      assert.equal(report.suggestedLLMRating, "high-level-architecture");
      assert.equal(report.status, "attention");
      assert.equal(report.analysis.rating, "high-level-architecture");
      assert.equal(report.analysis.changedFiles.length, 0);
      assert.equal(storedJSON.analysis.ownerRole, "opencode-static-analysis");
      assert.equal(storedJSON.opencode.textEventCount, 1);
      assert.ok(Number(storedJSON.opencode.eventCount || 0) >= 2);
      assert.ok(storedMD.includes("Package Protection Opencode Analysis"));
      assert.ok(storedMD.includes("high-level-architecture"));
      assert.ok(storedMD.includes("inspect bootstrap chain"));
    } finally {
      fs.rmSync(project.root, { recursive: true, force: true });
      fs.rmSync(fake.root, { recursive: true, force: true });
    }
  });
});
