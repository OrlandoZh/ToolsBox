import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, it, assert } from "./test-framework.js";
import {
  buildValidationDecision,
  collectValidationContext,
  loadProjectValidationOverrides,
  loadValidationDomainsRegistry,
} from "../scripts/agent-validation-decision-lib.mjs";

const projectRoot = path.resolve(".");

function writeJSON(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

describe("Agent Validation Decision", () => {
  it("should load the template validation domain registry", () => {
    const { registry } = loadValidationDomainsRegistry(projectRoot);

    assert.equal(registry.schemaVersion, 1);
    assert.ok(registry.domains.some((entry) => entry.id === "visible-surface"));
    assert.ok(registry.domains.some((entry) => entry.id === "runtime-config"));
    assert.ok(registry.domains.some((entry) => entry.id === "host-wrapper"));
    assert.ok(registry.domains.some((entry) => entry.id === "governance-docs"));
  });

  it("should load project validation overrides even when the template keeps them empty", () => {
    const { registry, missing } = loadProjectValidationOverrides(projectRoot);

    assert.equal(missing, false);
    assert.equal(registry.schemaVersion, 1);
    assert.equal(Array.isArray(registry.overrides), true);
  });

  it("should classify DOM contract wave paths as visual-recommended in the active advisory wave", () => {
    const decision = buildValidationDecision({
      projectRoot,
      changedPaths: ["src/features/reader.js"],
      e2e: {
        present: false,
        status: "missing",
      },
    });

    assert.equal(decision.level, "visual-recommended");
    assert.equal(decision.decisionSource, "project-override");
    assert.ok(decision.matchedDomain.includes("host-wrapper"));
    assert.ok(decision.matchedProjectOverride.includes("zotero-dom-contract-wave-001"));
    assert.equal(decision.blocking, false);
    assert.equal(typeof decision.deferredEvidenceAction, "string");
  });

  it("should keep the active DOM contract wave advisory when completed baseline paths coexist", () => {
    const decision = buildValidationDecision({
      projectRoot,
      changedPaths: [
        "src/features/reader.js",
        "config/zotero-host-interface-contracts.json",
      ],
      e2e: {
        present: false,
        status: "missing",
      },
    });

    assert.equal(decision.level, "visual-recommended");
    assert.equal(decision.decisionSource, "project-override");
    assert.deepEqual(decision.matchedProjectOverride, ["zotero-dom-contract-wave-001"]);
    assert.equal(decision.blocking, false);
  });

  it("should classify visual-not-needed for runtime and settings-only changes", () => {
    const decision = buildValidationDecision({
      projectRoot,
      changedPaths: [
        "src/services/ai-config.js",
        "src/settings/schema-extension.js",
      ],
      e2e: {
        present: true,
        status: "failed",
        visualEvidenceObserved: true,
        visualEvidenceItemCount: 4,
        visualEvidenceFailingItemCount: 2,
      },
    });

    assert.equal(decision.level, "visual-not-needed");
    assert.equal(decision.blocking, false);
    assert.ok(decision.matchedDomain.includes("runtime-config"));
  });

  it("should classify visual-required when changed paths hit actual visible surfaces", () => {
    const decision = buildValidationDecision({
      projectRoot,
      changedPaths: ["addon-static/content/preferences.xhtml"],
      e2e: {
        present: true,
        status: "passed",
        visualEvidenceObserved: true,
        visualEvidenceItemCount: 2,
        visualEvidenceFailingItemCount: 0,
      },
    });

    assert.equal(decision.level, "visual-required");
    assert.equal(decision.blocking, false);
    assert.ok(decision.matchedDomain.includes("visible-surface"));
  });

  it("should escalate to visual-required when runtime signals report visual drift", () => {
    const decision = buildValidationDecision({
      projectRoot,
      changedPaths: ["src/services/ai-config.js"],
      e2e: {
        present: true,
        status: "failed",
        visualDriftCount: 2,
        visualMissingCount: 0,
        visualEvidenceObserved: true,
        visualEvidenceItemCount: 4,
        visualEvidenceFailingItemCount: 2,
      },
    });

    assert.equal(decision.level, "visual-required");
    assert.equal(decision.decisionSource, "runtime-signals");
    assert.equal(decision.escalatedByRuntimeSignals, true);
  });

  it("should prefer project overrides over default domains", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-validation-overrides-"));
    try {
      const { registry } = loadValidationDomainsRegistry(projectRoot);
      writeJSON(path.join(tempRoot, "config", "validation-domains.json"), {
        schemaVersion: registry.schemaVersion,
        summary: registry.summary,
        domains: registry.domains.map((entry) => ({
          id: entry.id,
          version: entry.version,
          summary: entry.summary,
          pathMatchers: entry.pathMatchers.map((matcher) => matcher.pattern),
          defaultDecision: entry.defaultDecision,
          requiredChecks: entry.requiredChecks,
          escalationSignals: entry.escalationSignals,
          nonGoals: entry.nonGoals,
        })),
      });
      writeJSON(path.join(tempRoot, "config", "project-validation-overrides.json"), {
        schemaVersion: 1,
        summary: "test project overrides",
        overrides: [
          {
            id: "reader-host-wrapper-non-visual-batch",
            summary: "Test override for host wrapper only batch.",
            pathMatchers: ["^src/features/reader(?:/|\\.|$)"],
            decision: "visual-not-needed",
            requiredChecks: [
              "继续以 `npm run check` -> `npm run agent:zotero:e2e` -> `npm run agent:monitor` / `npm run agent:gate` 完成功能闭环。",
            ],
            nonGoals: ["test only"],
          },
        ],
      });

      const decision = buildValidationDecision({
        projectRoot: tempRoot,
        changedPaths: ["src/features/reader.js"],
        e2e: {
          present: false,
          status: "missing",
        },
      });

      assert.equal(decision.level, "visual-not-needed");
      assert.equal(decision.decisionSource, "project-override");
      assert.ok(decision.matchedProjectOverride.includes("reader-host-wrapper-non-visual-batch"));
      assert.ok(decision.matchedDomain.includes("host-wrapper"));
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("should classify mixed batches as visual-required once a visible surface is touched", () => {
    const decision = buildValidationDecision({
      projectRoot,
      changedPaths: [
        "src/settings/ai-settings.js",
        "src/features/reader-chat.js",
      ],
      e2e: {
        present: true,
        status: "passed",
        visualEvidenceObserved: true,
        visualEvidenceItemCount: 3,
        visualEvidenceFailingItemCount: 0,
      },
    });

    assert.equal(decision.level, "visual-required");
    assert.ok(decision.matchedDomain.includes("visible-surface"));
  });

  it("should support AGENT_VISUAL_POLICY_OVERRIDE override", () => {
    const previous = process.env.AGENT_VISUAL_POLICY_OVERRIDE;
    process.env.AGENT_VISUAL_POLICY_OVERRIDE = "not-needed";
    try {
      const decision = buildValidationDecision({
        projectRoot,
        changedPaths: ["src/features/reader-chat.js"],
        e2e: {
          present: true,
          status: "failed",
          visualEvidenceObserved: true,
          visualEvidenceItemCount: 4,
          visualEvidenceFailingItemCount: 2,
        },
      });
      assert.equal(decision.level, "visual-not-needed");
      assert.equal(decision.decisionSource, "env-override");
    } finally {
      if (previous === undefined) {
        delete process.env.AGENT_VISUAL_POLICY_OVERRIDE;
      } else {
        process.env.AGENT_VISUAL_POLICY_OVERRIDE = previous;
      }
    }
  });

  it("should mark blocking when visual-required evidence is missing", () => {
    const decision = buildValidationDecision({
      projectRoot,
      changedPaths: ["src/features/reader-chat.js"],
      e2e: {
        present: false,
        status: "missing",
      },
    });

    assert.equal(decision.level, "visual-required");
    assert.equal(decision.blocking, true);
    assert.equal(typeof decision.issue, "string");
  });

  it("should ignore non-surface-local visual warnings once surface-local evidence already passed", () => {
    const decision = buildValidationDecision({
      projectRoot,
      changedPaths: ["src/features/reader.js"],
      e2e: {
        present: true,
        status: "passed",
        visualEvidenceObserved: true,
        visualEvidenceItemCount: 4,
        visualEvidenceFailingItemCount: 4,
        visualEvidenceItems: [
          {
            kind: "library",
            scope: "window-stage",
          },
          {
            kind: "reader",
            scope: "window-stage",
          },
        ],
      },
    });

    assert.equal(decision.level, "visual-recommended");
    assert.equal(decision.blocking, false);
    assert.equal(decision.issue, null);
  });

  it("should collect recent delegation changed paths and review summary", async () => {
    const tmpArtifacts = fs.mkdtempSync(path.join(os.tmpdir(), "agent-validation-context-"));
    const previousArtifacts = process.env.AGENT_ARTIFACTS_DIR;
    process.env.AGENT_ARTIFACTS_DIR = tmpArtifacts;
    try {
      const taskDir = path.join(tmpArtifacts, "agent-delegation", "READER-LOW-XYZ");
      fs.mkdirSync(taskDir, { recursive: true });
      fs.writeFileSync(path.join(taskDir, "review.json"), JSON.stringify({
        reviewedAt: new Date().toISOString(),
        reviewStatus: "reworked-by-codex",
        changedFiles: [{ path: "src/features/reader.js" }],
        acceptedFiles: ["scripts/agent-gate.mjs"],
      }, null, 2));

      const context = await collectValidationContext(projectRoot);
      assert.equal(context.reviewWindowCount, 1);
      assert.ok(context.changedPaths.includes("src/features/reader.js"));
      assert.ok(context.reviewChangedPaths.includes("src/features/reader.js"));
      assert.equal(context.reviewSummary.reworkedByCodex, 1);
    } finally {
      if (previousArtifacts === undefined) {
        delete process.env.AGENT_ARTIFACTS_DIR;
      } else {
        process.env.AGENT_ARTIFACTS_DIR = previousArtifacts;
      }
      fs.rmSync(tmpArtifacts, { recursive: true, force: true });
    }
  });

  it("should merge git diff and project mirror hints into validation context before falling back to unknown", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-validation-merged-context-"));
    try {
      execFileSync("git", ["init"], { cwd: tempRoot, stdio: "pipe" });
      execFileSync("git", ["config", "user.name", "Codex Test"], { cwd: tempRoot, stdio: "pipe" });
      execFileSync("git", ["config", "user.email", "codex@example.com"], { cwd: tempRoot, stdio: "pipe" });

      const { registry } = loadValidationDomainsRegistry(projectRoot);
      writeJSON(path.join(tempRoot, "config", "validation-domains.json"), {
        schemaVersion: registry.schemaVersion,
        summary: registry.summary,
        domains: registry.domains.map((entry) => ({
          id: entry.id,
          version: entry.version,
          summary: entry.summary,
          pathMatchers: entry.pathMatchers.map((matcher) => matcher.pattern),
          defaultDecision: entry.defaultDecision,
          requiredChecks: entry.requiredChecks,
          escalationSignals: entry.escalationSignals,
          nonGoals: entry.nonGoals,
        })),
      });
      writeJSON(path.join(tempRoot, "config", "project-validation-overrides.json"), {
        schemaVersion: 1,
        summary: "override hints",
        overrides: [
          {
            id: "runtime-settings-batch",
            summary: "settings-only batch",
            pathMatchers: ["^src/settings/ai-settings(?:/|\\.|$)"],
            decision: "visual-not-needed",
            requiredChecks: [],
            nonGoals: [],
          },
        ],
      });
      writeJSON(path.join(tempRoot, "config", "project-expansion-wave.json"), {
        schemaVersion: 1,
        status: "active",
        currentContractId: "generic-expansion-wave-v1",
        currentWaveName: "Wave Runtime",
        summary: "runtime-only wave",
        inScopeModules: ["src/services/ai-config.js"],
        outOfScopeModules: [],
        moduleArchetypes: [
          {
            module: "src/services/ai-config.js",
            archetype: "runtime-capability",
          },
        ],
        acceptanceTrack: "functional-first",
        explicitVisualUpgradeModules: [],
      });

      fs.mkdirSync(path.join(tempRoot, "src", "settings"), { recursive: true });
      fs.writeFileSync(path.join(tempRoot, "src", "settings", "ai-settings.js"), "export const x = 1;\n", "utf-8");

      const context = await collectValidationContext(tempRoot);
      assert.ok(context.gitChangedPaths.includes("src/settings/ai-settings.js"));
      assert.ok(context.expansionWavePaths.includes("src/services/ai-config.js"));
      assert.ok(context.projectOverridePaths.includes("src/settings/ai-settings"));

      const decision = buildValidationDecision({
        projectRoot: tempRoot,
        validationContext: context,
        e2e: {
          present: false,
          status: "missing",
        },
      });

      assert.equal(decision.decisionSource, "project-override");
      assert.equal(decision.level, "visual-not-needed");
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
