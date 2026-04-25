import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  buildComputerUseValidationPlan,
  inspectComputerUseValidationContracts,
  loadComputerUseValidationConfig,
  normalizeComputerUseValidationConfig,
  recordComputerUseValidationResult,
  startComputerUseValidation,
} from "../scripts/agent-computer-use-validation-lib.mjs";

const projectRoot = path.resolve(".");

describe("Agent Computer Use Validation Lib", () => {
  it("should load the default-disabled Computer Use validation contract", () => {
    const { config } = loadComputerUseValidationConfig(projectRoot);

    assert.equal(config.laneId, "codex-computer-use-real-machine-validation");
    assert.equal(config.enabledByDefault, false);
    assert.equal(config.gateEffect, "non-blocking");
    assert.equal(config.activationPolicy.requiresExplicitUserRequest, true);
    assert.equal(config.entrypoint.scriptName, "agent:computer-use:validate");
  });

  it("should reject contracts that enable the lane by default", () => {
    assert.throws(() => normalizeComputerUseValidationConfig({
      schemaVersion: 1,
      laneId: "broken",
      summary: "broken",
      enabledByDefault: true,
      gateEffect: "non-blocking",
      activationPolicy: {
        requiresExplicitUserRequest: true,
        acceptedActivationSignals: ["manual"],
        forbiddenDefaultEntrypoints: ["check"],
      },
      entrypoint: {
        scriptName: "agent:computer-use:validate",
        command: "npm run agent:computer-use:validate -- --user-requested",
        planCommand: "npm run agent:computer-use:plan",
      },
      artifacts: {
        json: "dist/agent-computer-use-validation.json",
        markdown: "dist/agent-computer-use-validation.md",
      },
      workflow: [
        {
          id: "manual",
          kind: "codex-computer-use",
          summary: "manual",
        },
      ],
      recording: {
        allowedVerdicts: ["pass"],
        requiredFields: ["verdict"],
      },
      nonGoals: ["default"],
    }));
  });

  it("should build an activation-required plan without writing artifacts", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-computer-use-plan-"));
    try {
      fs.mkdirSync(path.join(root, "config"), { recursive: true });
      fs.copyFileSync(
        path.join(projectRoot, "config", "codex-computer-use-validation.json"),
        path.join(root, "config", "codex-computer-use-validation.json"),
      );
      const plan = buildComputerUseValidationPlan(root, {
        target: "reader renderToolbar visible check",
      });

      assert.equal(plan.status, "activation-required");
      assert.equal(plan.activation.userRequested, false);
      assert.equal(plan.activation.target, "reader renderToolbar visible check");
      assert.equal(fs.existsSync(path.join(root, "dist", "agent-computer-use-validation.json")), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("should reject starting the lane without an explicit user request", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-computer-use-reject-"));
    try {
      fs.mkdirSync(path.join(root, "config"), { recursive: true });
      fs.copyFileSync(
        path.join(projectRoot, "config", "codex-computer-use-validation.json"),
        path.join(root, "config", "codex-computer-use-validation.json"),
      );

      let caught = null;
      try {
        await startComputerUseValidation(root, {
          target: "menu item visible check",
        });
      } catch (error) {
        caught = error;
      }

      assert.equal(caught?.scriptErrorCategory, "args");
      assert.equal(caught?.failedStage, "computer-use-validation:activation");
      assert.equal(fs.existsSync(path.join(root, "dist", "agent-computer-use-validation.json")), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("should start and record a manual Computer Use validation artifact", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-computer-use-start-"));
    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-computer-use-artifacts-"));
    const previousArtifactsDir = process.env.AGENT_ARTIFACTS_DIR;
    try {
      process.env.AGENT_ARTIFACTS_DIR = artifactsDir;
      fs.mkdirSync(path.join(root, "config"), { recursive: true });
      fs.copyFileSync(
        path.join(projectRoot, "config", "codex-computer-use-validation.json"),
        path.join(root, "config", "codex-computer-use-validation.json"),
      );

      const started = await startComputerUseValidation(root, {
        userRequested: true,
        target: "preference pane visible check",
        workflowContext: {
          workflowId: "surface-local:cleanroom-preferences-pane",
          workflowKind: "conditional-surface",
          surfaceId: "cleanroom-preferences-pane",
          triggerReasons: ["manual-surface-selection:cleanroom-preferences-pane"],
          triggerRoute: {
            policy: "host-visible-only",
            summary: "Use the preference pane as a real host-visible route.",
          },
          launchCommand: "npm run zotero:dev",
          launchRuntime: {
            mode: "dev",
            isolation: "project-isolated",
            freshness: "reused-project-runtime",
            summary: "Uses the project-managed .zotero-runtime/dev profile and dataDir.",
            desktopInstanceMatchRequired: true,
            desktopInstanceMatchSummary: "Record pass only when the observed Zotero window is confirmed to match this project runtime.",
          },
          preflightCommands: [
            "npm run zotero:scenario -- --scenario 'preference pane surface smoke'",
          ],
          observationSteps: [
            "Open the target preference pane and confirm the selected pane root is visible.",
          ],
          acceptanceCriteria: [
            "The preference pane opens on the requested pane.",
          ],
          proofContract: {
            defaultKind: "surface-local-visible-smoke",
            allowedKinds: ["surface-local-visible-smoke"],
            summary: "Confirms only that the target host-visible surface became visible in the local desktop/runtime.",
            nonClaims: [
              "Does not prove unrelated host-visible surfaces or full-window layout correctness.",
            ],
          },
        },
      });

      assert.equal(started.status, "pending-computer-use");
      assert.equal(started.defaultEnabled, false);
      assert.equal(started.gateEffect, "non-blocking");
      assert.ok(started.controllerPrompt.includes("explicitly requested"));
      assert.equal(started.targetContext.workflowId, "surface-local:cleanroom-preferences-pane");
      assert.equal(started.targetContext.triggerRoute.policy, "host-visible-only");
      assert.equal(started.targetContext.launchRuntime.mode, "dev");
      assert.equal(started.targetContext.launchRuntime.desktopInstanceMatchRequired, true);
      assert.equal(started.targetContext.proofContract.defaultKind, "surface-local-visible-smoke");
      assert.ok(started.controllerPrompt.includes("Trigger route: Use the preference pane as a real host-visible route."));
      assert.ok(started.controllerPrompt.includes("Runtime binding: Record pass only when the observed Zotero window is confirmed to match this project runtime."));
      assert.ok(started.controllerPrompt.includes("Proof scope: Confirms only that the target host-visible surface became visible in the local desktop/runtime."));
      assert.ok(started.controllerPrompt.includes("Allowed proof kinds: surface-local-visible-smoke"));
      assert.ok(started.controllerPrompt.includes("Default non-claims: Does not prove unrelated host-visible surfaces or full-window layout correctness."));
      assert.ok(fs.existsSync(path.join(artifactsDir, "agent-computer-use-validation.json")));

      const recorded = await recordComputerUseValidationResult(root, {
        verdict: "partial",
        summary: "Desktop opened, but target pane was not inspected.",
        evidence: "Computer Use session stopped before pane selection.",
        nextAction: "rerun after Zotero is foregrounded",
      });

      assert.equal(recorded.status, "completed-partial");
      assert.equal(recorded.result.verdict, "partial");
      assert.equal(recorded.result.proof.kind, "surface-local-visible-smoke");
      assert.ok(recorded.result.proof.nonClaims.includes("Does not prove unrelated host-visible surfaces or full-window layout correctness."));
      assert.equal(recorded.result.proof.hostVisibleEntryObserved, null);
      assert.equal(recorded.result.proof.runtimeInstanceMatch, "unknown");
      assert.equal(recorded.targetContext.workflowId, "surface-local:cleanroom-preferences-pane");
      const markdown = fs.readFileSync(path.join(artifactsDir, "agent-computer-use-validation.md"), "utf-8");
      assert.ok(markdown.includes("## Target Context"));
      assert.ok(markdown.includes("Proof kind: `surface-local-visible-smoke`"));
      assert.ok(markdown.includes("Non-claims: Does not prove unrelated host-visible surfaces or full-window layout correctness."));
      assert.ok(markdown.includes("Runtime instance match: `unknown`"));
    } finally {
      if (previousArtifactsDir === undefined) {
        delete process.env.AGENT_ARTIFACTS_DIR;
      } else {
        process.env.AGENT_ARTIFACTS_DIR = previousArtifactsDir;
      }
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(artifactsDir, { recursive: true, force: true });
    }
  });

  it("should reject proof kinds that are outside the workflow proof contract", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-computer-use-proof-guard-"));
    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-computer-use-proof-guard-artifacts-"));
    const previousArtifactsDir = process.env.AGENT_ARTIFACTS_DIR;
    try {
      process.env.AGENT_ARTIFACTS_DIR = artifactsDir;
      fs.mkdirSync(path.join(root, "config"), { recursive: true });
      fs.copyFileSync(
        path.join(projectRoot, "config", "codex-computer-use-validation.json"),
        path.join(root, "config", "codex-computer-use-validation.json"),
      );

      await startComputerUseValidation(root, {
        userRequested: true,
        target: "review workbench standalone window visible smoke",
        workflowContext: {
          workflowId: "review-workbench-visible-smoke",
          workflowKind: "mandatory",
          proofContract: {
            defaultKind: "internal-trigger-window-lifecycle",
            allowedKinds: [
              "internal-trigger-window-lifecycle",
              "host-visible-entry-window-lifecycle",
            ],
            summary: "Default to internal trigger proof unless a real host-visible entry was directly observed.",
          },
        },
      });

      let caught = null;
      try {
        await recordComputerUseValidationResult(root, {
          verdict: "pass",
          summary: "Window lifecycle looked correct.",
          proofKind: "surface-local-visible-smoke",
        });
      } catch (error) {
        caught = error;
      }

      assert.equal(caught?.scriptErrorCategory, "args");
      assert.equal(caught?.failedStage, "computer-use-validation:record");
    } finally {
      if (previousArtifactsDir === undefined) {
        delete process.env.AGENT_ARTIFACTS_DIR;
      } else {
        process.env.AGENT_ARTIFACTS_DIR = previousArtifactsDir;
      }
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(artifactsDir, { recursive: true, force: true });
    }
  });

  it("should require an observed route when recording host-visible entry proof", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-computer-use-host-visible-proof-guard-"));
    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-computer-use-host-visible-proof-artifacts-"));
    const previousArtifactsDir = process.env.AGENT_ARTIFACTS_DIR;
    try {
      process.env.AGENT_ARTIFACTS_DIR = artifactsDir;
      fs.mkdirSync(path.join(root, "config"), { recursive: true });
      fs.copyFileSync(
        path.join(projectRoot, "config", "codex-computer-use-validation.json"),
        path.join(root, "config", "codex-computer-use-validation.json"),
      );

      await startComputerUseValidation(root, {
        userRequested: true,
        target: "review workbench standalone window visible smoke",
        workflowContext: {
          workflowId: "review-workbench-visible-smoke",
          workflowKind: "mandatory",
          proofContract: {
            defaultKind: "internal-trigger-window-lifecycle",
            allowedKinds: [
              "internal-trigger-window-lifecycle",
              "host-visible-entry-window-lifecycle",
            ],
            summary: "Default to internal trigger proof unless a real host-visible entry was directly observed.",
          },
        },
      });

      let caught = null;
      try {
        await recordComputerUseValidationResult(root, {
          verdict: "pass",
          summary: "Window lifecycle looked correct through a visible entry.",
          proofKind: "host-visible-entry-window-lifecycle",
          hostVisibleEntryObserved: true,
        });
      } catch (error) {
        caught = error;
      }

      assert.equal(caught?.scriptErrorCategory, "args");
      assert.equal(caught?.failedStage, "computer-use-validation:record");
    } finally {
      if (previousArtifactsDir === undefined) {
        delete process.env.AGENT_ARTIFACTS_DIR;
      } else {
        process.env.AGENT_ARTIFACTS_DIR = previousArtifactsDir;
      }
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(artifactsDir, { recursive: true, force: true });
    }
  });

  it("should reject pass when the workflow requires a matched runtime instance but none was recorded", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-computer-use-runtime-match-required-"));
    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-computer-use-runtime-match-required-artifacts-"));
    const previousArtifactsDir = process.env.AGENT_ARTIFACTS_DIR;
    try {
      process.env.AGENT_ARTIFACTS_DIR = artifactsDir;
      fs.mkdirSync(path.join(root, "config"), { recursive: true });
      fs.copyFileSync(
        path.join(projectRoot, "config", "codex-computer-use-validation.json"),
        path.join(root, "config", "codex-computer-use-validation.json"),
      );

      await startComputerUseValidation(root, {
        userRequested: true,
        target: "local install visible smoke: stable",
        workflowContext: {
          workflowId: "release-install-local",
          workflowKind: "conditional-release-install",
          launchRuntime: {
            mode: "release-install-stable",
            binaryPath: "/Applications/Zotero.app/Contents/MacOS/zotero",
            profilePath: "/tmp/fake/profile",
            dataDir: "/tmp/fake/data",
            isolation: "project-isolated-disposable",
            freshness: "disposable-install-runtime",
            summary: "Uses a disposable project-managed release-install profile and dataDir for local install confirmation.",
            desktopInstanceMatchRequired: true,
            desktopInstanceMatchSummary: "Record pass only when the observed Zotero window is confirmed to match the launched release-install runtime.",
          },
          proofContract: {
            defaultKind: "local-install-visible-surface",
            allowedKinds: ["local-install-visible-surface"],
            summary: "Confirms only local install state plus at least one visible surface in the disposable install runtime.",
          },
        },
      });

      let caught = null;
      try {
        await recordComputerUseValidationResult(root, {
          verdict: "pass",
          summary: "Add-on looked installed and a surface was visible.",
          proofKind: "local-install-visible-surface",
        });
      } catch (error) {
        caught = error;
      }

      assert.equal(caught?.scriptErrorCategory, "args");
      assert.equal(caught?.failedStage, "computer-use-validation:record");
    } finally {
      if (previousArtifactsDir === undefined) {
        delete process.env.AGENT_ARTIFACTS_DIR;
      } else {
        process.env.AGENT_ARTIFACTS_DIR = previousArtifactsDir;
      }
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(artifactsDir, { recursive: true, force: true });
    }
  });

  it("should record matched runtime evidence when a pass is allowed", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-computer-use-runtime-match-pass-"));
    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-computer-use-runtime-match-pass-artifacts-"));
    const previousArtifactsDir = process.env.AGENT_ARTIFACTS_DIR;
    try {
      process.env.AGENT_ARTIFACTS_DIR = artifactsDir;
      fs.mkdirSync(path.join(root, "config"), { recursive: true });
      fs.copyFileSync(
        path.join(projectRoot, "config", "codex-computer-use-validation.json"),
        path.join(root, "config", "codex-computer-use-validation.json"),
      );

      await startComputerUseValidation(root, {
        userRequested: true,
        target: "review workbench standalone window visible smoke",
        workflowContext: {
          workflowId: "review-workbench-visible-smoke",
          workflowKind: "mandatory",
          launchRuntime: {
            mode: "dev",
            profilePath: "/tmp/fake/dev-profile",
            dataDir: "/tmp/fake/dev-data",
            isolation: "project-isolated",
            freshness: "reused-project-runtime",
            summary: "Uses the project-managed .zotero-runtime/dev profile and dataDir.",
            desktopInstanceMatchRequired: true,
            desktopInstanceMatchSummary: "Record pass only when the observed Zotero window is confirmed to match this project runtime.",
          },
          proofContract: {
            defaultKind: "internal-trigger-window-lifecycle",
            allowedKinds: ["internal-trigger-window-lifecycle"],
            summary: "Confirms only standalone window lifecycle after an internal trigger.",
          },
        },
      });

      const recorded = await recordComputerUseValidationResult(root, {
        verdict: "pass",
        summary: "The standalone window opened, reused, and closed in the expected project runtime.",
        proofKind: "internal-trigger-window-lifecycle",
        entryRouteObserved: "plugin.api.commandPalette.executeCommand('agent.reviewWorkbench.open')",
        runtimeInstanceMatch: "matched",
        runtimeInstanceEvidence: "Only the project dev runtime was running and the observed window matched the expected .zotero-runtime/dev profile session.",
        evidence: "Computer Use observed the standalone window lifecycle in the expected runtime.",
        nextAction: "No follow-up required.",
      });

      assert.equal(recorded.status, "completed-pass");
      assert.equal(recorded.result.proof.runtimeInstanceMatch, "matched");
      assert.ok(recorded.result.proof.runtimeInstanceEvidence.includes(".zotero-runtime/dev"));
    } finally {
      if (previousArtifactsDir === undefined) {
        delete process.env.AGENT_ARTIFACTS_DIR;
      } else {
        process.env.AGENT_ARTIFACTS_DIR = previousArtifactsDir;
      }
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(artifactsDir, { recursive: true, force: true });
    }
  });

  it("should fall back to project dist upstream artifacts when AGENT_ARTIFACTS_DIR is isolated", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-computer-use-fallback-"));
    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-computer-use-fallback-artifacts-"));
    const previousArtifactsDir = process.env.AGENT_ARTIFACTS_DIR;
    try {
      process.env.AGENT_ARTIFACTS_DIR = artifactsDir;
      fs.mkdirSync(path.join(root, "config"), { recursive: true });
      fs.mkdirSync(path.join(root, "dist"), { recursive: true });
      fs.copyFileSync(
        path.join(projectRoot, "config", "codex-computer-use-validation.json"),
        path.join(root, "config", "codex-computer-use-validation.json"),
      );
      fs.writeFileSync(path.join(root, "dist", "agent-gate.json"), JSON.stringify({
        generatedAt: "2026-04-24T01:00:00.000Z",
        gatePassed: true,
      }), "utf-8");
      fs.writeFileSync(path.join(root, "dist", "agent-monitor.json"), JSON.stringify({
        generatedAt: "2026-04-24T01:00:01.000Z",
        status: "stable",
      }), "utf-8");
      fs.writeFileSync(path.join(root, "dist", "agent-zotero-e2e.json"), JSON.stringify({
        generatedAt: "2026-04-24T01:00:02.000Z",
        status: "passed",
      }), "utf-8");

      const plan = buildComputerUseValidationPlan(root, {
        userRequested: true,
        target: "zotero main window visible smoke",
      });

      assert.equal(plan.artifactPaths.json, path.join(artifactsDir, "agent-computer-use-validation.json"));
      assert.equal(plan.upstreamArtifacts[0].present, true);
      assert.equal(plan.upstreamArtifacts[0].path, "dist/agent-gate.json");
      assert.equal(plan.upstreamArtifacts[0].status, "true");
      assert.equal(plan.upstreamArtifacts[1].path, "dist/agent-monitor.json");
      assert.equal(plan.upstreamArtifacts[1].status, "stable");
      assert.equal(plan.upstreamArtifacts[2].path, "dist/agent-zotero-e2e.json");
      assert.equal(plan.upstreamArtifacts[2].status, "passed");
    } finally {
      if (previousArtifactsDir === undefined) {
        delete process.env.AGENT_ARTIFACTS_DIR;
      } else {
        process.env.AGENT_ARTIFACTS_DIR = previousArtifactsDir;
      }
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(artifactsDir, { recursive: true, force: true });
    }
  });

  it("should keep the checked-in lane out of default validation entrypoints", () => {
    const report = inspectComputerUseValidationContracts(projectRoot);

    assert.equal(report.ok, true);
    assert.deepEqual(report.issues, []);
    assert.equal(report.enabledByDefault, false);
    assert.equal(report.requiresExplicitUserRequest, true);
  });
});
