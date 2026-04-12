import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it, afterEach, assert } from "./test-framework.js";
import {
  runCleanroomAudit,
  runCleanroomSimilarity,
} from "../scripts/cleanroom-audit-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const tempRoots = [];

const VALID_SPEC = `# Zotero Cleanroom Template Specification

- Zotero Cleanroom Template
- Zotero 7/8
- 8.0.2-beta.5+c35d7f21e
- macOS 已验证

## Acceptance Criteria (Black-Box)

- 当前模板黑盒基线已冻结。
`;

const PLACEHOLDER_SPEC = `# Behavior Specification (Rewrite Baseline)

Use this file to define *what* the plugin should do, without referencing prior source code.

## Product Scope
- Plugin name:
- Target Zotero versions:
- Supported platforms:

## Acceptance Criteria (Black-Box)
- [ ] On startup, expected commands appear in UI.
`;

const VALID_LEGAL = `# Clean-Room Legal Risk Checklist

## Development Gate (must pass now)

- [x] SPEC frozen
  Evidence: SPEC.md
- [x] No reference imports
  Evidence: npm run cleanroom:audit

## Release Gate (release-only)

- [ ] Similarity reviewed
  Evidence: dist/cleanroom-similarity.json
- [ ] Final legal review completed before shipping.
  Evidence: release approval record
`;

const INVALID_LEGAL = `# Clean-Room Legal Risk Checklist

## Development Gate (must pass now)

- [ ] SPEC frozen
- [x] No reference imports
  Evidence: npm run cleanroom:audit

## Release Gate (release-only)

- [ ] Similarity reviewed
  Evidence: dist/cleanroom-similarity.json
`;

const VALID_CODE_PROVENANCE = `# Code Provenance Record

## 模块来源摘要

- fixture provenance

## reference 使用边界

- fixture boundary

## 发布包排除项

- fixture excludes
`;

const VALID_THIRD_PARTY_NOTICES = `# Third-Party Notices

## 当前发布包内第三方项

- none

## 当前未进入发布包的研究材料

- reference only

## 维护要求

- keep updated
`;

const VALID_COMMERCIAL_RIGHTS_NOTICE = `# 商业交付权利说明

## 权利边界

- UNLICENSED

## 商业交付提示

- review before shipping
`;

const VALID_LEGAL_WITH_CHINA_GATE = `# Clean-Room Legal Risk Checklist

## Development Gate (must pass now)

- [x] SPEC frozen
  Evidence: SPEC.md
- [x] No reference imports
  Evidence: npm run cleanroom:audit

## Release Gate (release-only)

- [ ] Similarity reviewed
  Evidence: dist/cleanroom-similarity.json
- [ ] Final legal review completed before shipping.
  Evidence: release approval record

## China Commercial Delivery Gate (release-only)

- [x] CODE provenance ready
  Evidence: CODE_PROVENANCE.md
- [x] Third-party notices ready
  Evidence: THIRD_PARTY_NOTICES.md
- [x] Commercial delivery rights notice ready
  Evidence: COMMERCIAL_DELIVERY_RIGHTS_NOTICE.md
`;

function createTempRoot(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

function writeText(root, relativePath, content) {
  const targetPath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, "utf-8");
  return targetPath;
}

function writeJSON(root, relativePath, payload) {
  writeText(root, relativePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function writeChinaLegalDocs(root) {
  writeText(root, "CODE_PROVENANCE.md", VALID_CODE_PROVENANCE);
  writeText(root, "THIRD_PARTY_NOTICES.md", VALID_THIRD_PARTY_NOTICES);
  writeText(root, "COMMERCIAL_DELIVERY_RIGHTS_NOTICE.md", VALID_COMMERCIAL_RIGHTS_NOTICE);
}

function initGitBaseline(root) {
  execFileSync("git", ["init"], {
    cwd: root,
    stdio: "pipe",
  });
  execFileSync("git", ["config", "user.name", "Codex Test"], {
    cwd: root,
    stdio: "pipe",
  });
  execFileSync("git", ["config", "user.email", "codex@example.com"], {
    cwd: root,
    stdio: "pipe",
  });
  execFileSync("git", ["add", "."], {
    cwd: root,
    stdio: "pipe",
  });
  execFileSync("git", ["commit", "-m", "fixture"], {
    cwd: root,
    stdio: "pipe",
  });
}

function createAuditFixture(options = {}) {
  const root = createTempRoot("addontemplate-cleanroom-audit-");
  writeText(root, "SPEC.md", options.specContent ?? VALID_SPEC);
  writeText(root, "LEGAL_RISK_CHECKLIST.md", options.legalContent ?? VALID_LEGAL);
  writeText(root, "src/main.js", "export const baseline = true;\n");
  writeText(root, "scripts/demo.mjs", "export const demo = 'ok';\n");
  writeText(root, "package.json", "{\n  \"name\": \"fixture\"\n}\n");
  writeText(root, ".env.example", "FIXTURE=1\n");
  if (options.withReference === true) {
    writeText(root, "reference/demo.md", "Reference snapshot fixture.\n");
  }
  if (options.withChinaDocs === true) {
    writeChinaLegalDocs(root);
  }
  initGitBaseline(root);
  return root;
}

function createReleaseFixture(options = {}) {
  const root = createAuditFixture({
    withReference: options.withReference === true,
    withChinaDocs: options.withChinaDocs === true,
    legalContent: options.legalContent,
  });
  const config = {
    addonName: "Zotero Cleanroom Template",
    addonId: "cleanroom-template@example.com",
    addonRef: "cleanroomtemplate",
    addonVersion: "0.1.0",
    updateURL: "https://example.com/downloads/cleanroomtemplate/update.json",
    strictMinVersion: "6.999",
    strictMaxVersion: "8.*",
  };
  const xpiPath = path.join(root, "dist", `${config.addonRef}-${config.addonVersion}.xpi`);

  writeJSON(root, "config/addon.config.json", config);
  writeJSON(root, `build/${config.addonRef}/build-report.json`, {
    addonRef: config.addonRef,
    addonVersion: config.addonVersion,
  });
  writeJSON(root, "dist/release-manifest.json", {
    addonId: config.addonId,
    addonRef: config.addonRef,
    addonVersion: config.addonVersion,
    xpiName: path.basename(xpiPath),
    xpiPath,
    updateLink: "https://example.com/downloads/cleanroomtemplate/cleanroomtemplate-0.1.0.xpi",
    updateURL: config.updateURL,
  });
  writeJSON(root, "dist/update.json", {
    addons: {
      [config.addonId]: {
        updates: [
          {
            version: config.addonVersion,
            update_link: "https://example.com/downloads/cleanroomtemplate/cleanroomtemplate-0.1.0.xpi",
            applications: {
              zotero: {
                strict_min_version: config.strictMinVersion,
                strict_max_version: config.strictMaxVersion,
              },
            },
          },
        ],
      },
    },
  });
  writeText(root, `dist/${config.addonRef}-${config.addonVersion}.xpi`, "fixture-xpi\n");

  execFileSync("git", ["add", "."], {
    cwd: root,
    stdio: "pipe",
  });
  execFileSync("git", ["commit", "-m", "release-fixture"], {
    cwd: root,
    stdio: "pipe",
  });

  return root;
}

function readJSON(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf-8"));
}

describe("Cleanroom Audit", () => {
  afterEach(() => {
    while (tempRoots.length > 0) {
      const root = tempRoots.pop();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("should fail audit when SPEC.md is still placeholder text", async () => {
    const root = createAuditFixture({ specContent: PLACEHOLDER_SPEC });

    const report = await runCleanroomAudit({
      projectRoot: root,
      reportDir: path.join(root, "dist"),
    });

    assert.equal(report.status, "failed");
    assert.ok(report.blockers.some((item) => item.includes("SPEC")));
    assert.equal(readJSON(root, "dist/cleanroom-audit.json").status, "failed");
  });

  it("should fail audit when Development Gate is incomplete", async () => {
    const root = createAuditFixture({ legalContent: INVALID_LEGAL });

    const report = await runCleanroomAudit({
      projectRoot: root,
      reportDir: path.join(root, "dist"),
    });

    assert.equal(report.status, "failed");
    assert.ok(report.blockers.some((item) => item.includes("Development Gate")));
  });

  it("should write unavailable similarity report when reference snapshots are absent", async () => {
    const root = createAuditFixture();

    const report = await runCleanroomSimilarity({
      projectRoot: root,
      reportDir: path.join(root, "dist"),
    });

    assert.equal(report.status, "unavailable");
    assert.equal(readJSON(root, "dist/cleanroom-similarity.json").status, "unavailable");
    assert.ok(fs.existsSync(path.join(root, "dist", "cleanroom-similarity.md")));
  });

  it("should keep China commercial delivery findings advisory in dev mode", async () => {
    const root = createAuditFixture();

    const report = await runCleanroomAudit({
      projectRoot: root,
      reportDir: path.join(root, "dist"),
    });

    assert.equal(report.status, "passed");
    assert.equal(report.chinaLegal.status, "advisory");
    assert.ok(report.chinaLegal.missingDocs.includes("CODE_PROVENANCE.md"));
    assert.ok(report.chinaLegal.gateIssues.some((item) => item.includes("China Commercial Delivery Gate")));
  });

  it("should allow the managed reference manifest to point at reference snapshots without failing source isolation", async () => {
    const root = createAuditFixture();
    writeJSON(root, "config/reference-projects.json", {
      version: 1,
      projects: [
        {
          id: "demo-reference",
          label: "Demo Reference",
          enabled: true,
          targetPath: "reference/plugin/demo-reference",
          source: {
            type: "git",
            url: "https://github.com/example/demo-reference.git",
            ref: "main",
            refType: "branch",
          },
        },
      ],
    });

    const report = await runCleanroomAudit({
      projectRoot: root,
      reportDir: path.join(root, "dist"),
    });

    assert.equal(report.status, "passed");
    const sourceIsolation = report.checks.find((item) => item.id === "source-isolation-scan");
    assert.equal(sourceIsolation?.ok, true);
  });

  it("should fail release preflight when release-mode similarity is unavailable", () => {
    const root = createReleaseFixture();
    let capturedError = null;

    try {
      execFileSync("node", [path.join(projectRoot, "scripts", "release-preflight.mjs"), "--project-root", root], {
        cwd: projectRoot,
        stdio: "pipe",
      });
    } catch (error) {
      capturedError = error;
    }

    assert.ok(capturedError, "Expected release-preflight to fail without reference snapshots");
    const output = String(capturedError.stderr || capturedError.stdout || "");
    assert.ok(output.includes("Clean-room release audit failed"));
    const preflightReport = readJSON(root, "dist/release-preflight.json");
    assert.equal(preflightReport.status, "failed");
    assert.equal(preflightReport.errorCategory, "validation");
    assert.equal(preflightReport.failedStage, "cleanroom-audit");
  });

  it("should fail release preflight when China commercial delivery pack is missing", () => {
    const root = createReleaseFixture({
      withReference: true,
    });
    let capturedError = null;

    try {
      execFileSync("node", [path.join(projectRoot, "scripts", "release-preflight.mjs"), "--project-root", root], {
        cwd: projectRoot,
        stdio: "pipe",
      });
    } catch (error) {
      capturedError = error;
    }

    assert.ok(capturedError, "Expected release-preflight to fail without China commercial delivery docs");
    const preflightReport = readJSON(root, "dist/release-preflight.json");
    assert.equal(preflightReport.status, "failed");
    assert.equal(preflightReport.failedStage, "cleanroom-audit");
    assert.equal(preflightReport.chinaLegalStatus, "blocking");
    assert.equal(preflightReport.chinaCommercialDeliveryGateOK, false);
    assert.ok(preflightReport.chinaLegalMissingDocs.includes("CODE_PROVENANCE.md"));
  });

  it("should pass release-mode cleanroom audit when China commercial delivery pack is ready", async () => {
    const root = createReleaseFixture({
      withReference: true,
      withChinaDocs: true,
      legalContent: VALID_LEGAL_WITH_CHINA_GATE,
    });

    const report = await runCleanroomAudit({
      mode: "release",
      projectRoot: root,
      reportDir: path.join(root, "dist"),
    });

    assert.equal(report.status, "passed");
    assert.equal(report.chinaLegal.status, "ready");
    assert.equal(report.chinaLegal.docPackReady, true);
    assert.equal(report.chinaLegal.deliveryGateOK, true);
  });
});
