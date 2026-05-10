import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  DEFAULT_COMPUTER_USE_SESSION_ROOT,
  DEFAULT_RELEASE_CHANNEL,
  REVIEW_WORKBENCH_TARGET,
  buildComputerUseSessionArtifactsDir,
  formatComputerUseSessionTimestamp,
  listComputerUseWorkflowCatalog,
  parseGitStatusChangedPaths,
  prepareComputerUseWorkflowSessions,
} from "../scripts/agent-computer-use-workflows-lib.mjs";

const projectRoot = path.resolve(".");

function createWorkflowFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-computer-use-workflow-"));
  fs.mkdirSync(path.join(root, "config"), { recursive: true });
  fs.mkdirSync(path.join(root, "dist"), { recursive: true });
  fs.copyFileSync(
    path.join(projectRoot, "config", "codex-computer-use-validation.json"),
    path.join(root, "config", "codex-computer-use-validation.json"),
  );
  fs.copyFileSync(
    path.join(projectRoot, "config", "project-validation-surfaces.json"),
    path.join(root, "config", "project-validation-surfaces.json"),
  );
  return root;
}

describe("Agent Computer Use Workflows Lib", () => {
  it("should default session roots to /tmp/codex-cu on posix hosts", () => {
    assert.equal(DEFAULT_COMPUTER_USE_SESSION_ROOT.startsWith("/tmp/codex-cu"), true);
  });

  it("should build the review workbench session path from timestamp and slug", () => {
    const sessionDir = buildComputerUseSessionArtifactsDir(REVIEW_WORKBENCH_TARGET, {
      now: new Date("2026-04-24T10:28:38"),
      sessionRoot: "/tmp/codex-cu",
    });

    assert.equal(formatComputerUseSessionTimestamp(new Date("2026-04-24T10:28:38")), "20260424-102838");
    assert.equal(sessionDir, "/tmp/codex-cu/20260424-102838-review-workbench-standalone-window-visible-smoke");
  });

  it("should parse git status paths without dropping the first character", () => {
    const changedPaths = parseGitStatusChangedPaths([
      " M docs/CODEX_COMPUTER_USE_VALIDATION.md",
      "M  scripts/agent-computer-use-workflows-lib.mjs",
      "R  old/path.js -> new/path.js",
    ].join("\n"));

    assert.deepEqual(changedPaths, [
      "docs/CODEX_COMPUTER_USE_VALIDATION.md",
      "scripts/agent-computer-use-workflows-lib.mjs",
      "new/path.js",
    ]);
  });

  it("should prepare the mandatory review workbench session in an isolated artifacts dir", async () => {
    const root = createWorkflowFixture();
    const sessionRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-computer-use-session-root-"));
    try {
      const result = await prepareComputerUseWorkflowSessions(root, {
        sessionRoot,
        now: new Date("2026-04-24T10:28:38"),
        env: {
          ...process.env,
          ZOTERO_PLUGIN_ZOTERO_BIN_PATH: "/Applications/Zotero.app/Contents/MacOS/zotero",
        },
        psOutput: "",
      });

      assert.equal(result.prepared.length, 1);
      assert.equal(result.prepared[0].target, REVIEW_WORKBENCH_TARGET);
      assert.equal(result.prepared[0].triggerStatus, "always");
      assert.equal(result.prepared[0].ready, true);
      assert.equal(result.prepared[0].preflightCommands[0], "npm run check");
      assert.equal(result.prepared[0].preflightCommands[1], "npm run zotero:scenario -- --scenario 'agent review workbench window lifecycle'");
      assert.equal(result.prepared[0].launchCommand, "npm run zotero:dev");
      assert.equal(result.prepared[0].launchRuntime.mode, "dev");
      assert.equal(result.prepared[0].launchRuntime.binaryPath, "/Applications/Zotero.app/Contents/MacOS/zotero");
      assert.equal(result.prepared[0].launchRuntime.isolation, "project-isolated");
      assert.equal(result.prepared[0].launchRuntime.freshness, "reused-project-runtime");
      assert.equal(result.prepared[0].launchRuntime.desktopInstanceMatchRequired, true);
      assert.equal(result.prepared[0].launchRuntime.desktopInstancePreflightStatus, "target-runtime-not-running");
      assert.equal(result.prepared[0].triggerRoute.policy, "host-visible-when-available-otherwise-internal");
      assert.equal(result.prepared[0].proofContract.defaultKind, "internal-trigger-window-lifecycle");
      assert.equal(result.prepared[0].claimBoundary.defaultProofKind, "internal-trigger-window-lifecycle");
      assert.ok(result.prepared[0].claimBoundary.defaultNonClaims.includes(
        "Does not prove a real human-visible Prompt, menu, or shortcut entry.",
      ));
      assert.ok(result.prepared[0].proofContract.allowedKinds.includes("host-visible-entry-window-lifecycle"));
      assert.ok(result.prepared[0].observationSteps[0].includes("real host-visible entry"));
      assert.ok(result.prepared[0].acceptanceCriteria.includes(
        "Fallback command registration alone is not treated as proof of a human-visible host entry.",
      ));
      assert.ok(result.prepared[0].launchRuntime.profilePath.includes("-zotero-runtime-"));
      assert.ok(result.prepared[0].launchRuntime.profilePath.endsWith("/dev/profile"));
      assert.ok(result.prepared[0].launchRuntime.dataDir.includes("-zotero-runtime-"));
      assert.ok(result.prepared[0].launchRuntime.dataDir.endsWith("/dev/data"));
      assert.equal(result.prepared[0].activation.status, "pending-computer-use");
      assert.equal(
        result.prepared[0].artifactsDir,
        path.join(sessionRoot, "20260424-102838-review-workbench-standalone-window-visible-smoke"),
      );
      assert.equal(
        fs.existsSync(path.join(result.prepared[0].artifactsDir, "agent-computer-use-validation.json")),
        true,
      );
      const preparedArtifact = JSON.parse(fs.readFileSync(
        path.join(result.prepared[0].artifactsDir, "agent-computer-use-validation.json"),
        "utf-8",
      ));
      assert.equal(preparedArtifact.targetContext.workflowId, "review-workbench-visible-smoke");
      assert.equal(preparedArtifact.targetContext.triggerRoute.policy, "host-visible-when-available-otherwise-internal");
      assert.equal(preparedArtifact.targetContext.launchRuntime.mode, "dev");
      assert.equal(preparedArtifact.targetContext.launchRuntime.desktopInstanceMatchRequired, true);
      assert.equal(preparedArtifact.targetContext.launchRuntime.desktopInstancePreflightStatus, "target-runtime-not-running");
      assert.equal(preparedArtifact.targetContext.proofContract.defaultKind, "internal-trigger-window-lifecycle");
      assert.ok(preparedArtifact.targetContext.proofContract.nonClaims.includes(
        "Does not prove whole-window visual correctness beyond the observed standalone window lifecycle.",
      ));
      assert.ok(preparedArtifact.targetContext.observationSteps[0].includes("real host-visible entry"));
      assert.ok(result.prepared[0].recordCommand.includes("--proof-kind internal-trigger-window-lifecycle"));
      assert.equal(result.prepared[0].recordGuidance.defaultProofKind, "internal-trigger-window-lifecycle");
      assert.ok(result.prepared[0].recordGuidance.defaultCommand.includes("--entry-route-observed"));
      assert.ok(result.prepared[0].recordGuidance.defaultCommand.includes("--runtime-instance-match matched"));
      assert.ok(result.prepared[0].recordGuidance.defaultNonClaims.includes(
        "Does not prove a real human-visible Prompt, menu, or shortcut entry.",
      ));
      assert.ok(result.prepared[0].recordGuidance.alternateCommands.some((entry) => {
        return entry.proofKind === "host-visible-entry-window-lifecycle"
          && entry.command.includes("--host-visible-entry-observed");
      }));
      assert.ok(result.prepared[0].recordGuidance.alternateCommands.some((entry) => {
        return entry.proofKind === "host-visible-entry-window-lifecycle"
          && entry.nonClaims.includes("Does not prove unrelated host-visible surfaces or release/install state.");
      }));
      assert.ok(result.prepared[0].recordGuidance.cautions.some((entry) => entry.includes("Do not upgrade")));
      assert.ok(result.prepared[0].recordGuidance.cautions.some((entry) => entry.includes("Record pass only when the observed Zotero window is confirmed to match this project runtime.")));
      assert.ok(result.prepared[0].recordGuidance.cautions.some((entry) => entry.includes("Preflight does not currently see a target runtime process")));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(sessionRoot, { recursive: true, force: true });
    }
  });

  it("should block the mandatory review workbench session when another same-bundle Zotero process is already running", async () => {
    const root = createWorkflowFixture();
    const sessionRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-computer-use-session-root-"));
    try {
      const result = await prepareComputerUseWorkflowSessions(root, {
        sessionRoot,
        now: new Date("2026-04-24T10:28:38"),
        env: {
          ...process.env,
          ZOTERO_PLUGIN_ZOTERO_BIN_PATH: "/Applications/Zotero.app/Contents/MacOS/zotero",
        },
        psOutput: [
          "555 /Applications/Zotero.app/Contents/MacOS/zotero --purgecaches -no-remote -profile /tmp/other/profile --dataDir /tmp/other/data -start-debugger-server 5000",
        ].join("\n"),
      });

      assert.equal(result.prepared.length, 1);
      assert.equal(result.prepared[0].triggerStatus, "blocked");
      assert.equal(result.prepared[0].ready, false);
      assert.ok(result.prepared[0].blockers.includes(
        "desktop-runtime-binding-conflict:other-same-bundle-processes-running",
      ));
      assert.equal(result.prepared[0].launchRuntime.desktopInstancePreflightStatus, "other-same-bundle-processes-running");
      assert.equal(result.prepared[0].activation.status, "skipped");
      assert.equal(
        fs.existsSync(path.join(result.prepared[0].artifactsDir, "agent-computer-use-validation.json")),
        false,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(sessionRoot, { recursive: true, force: true });
    }
  });

  it("should trigger the local release install workflow when the stable install smoke artifact is missing", async () => {
    const root = createWorkflowFixture();
    try {
      const result = await listComputerUseWorkflowCatalog(root, {
        env: {
          ...process.env,
          ZOTERO_PLUGIN_ZOTERO_BIN_PATH: "/Applications/Zotero.app/Contents/MacOS/zotero",
        },
        psOutput: [
          "777 /Applications/Zotero.app/Contents/MacOS/zotero --purgecaches -no-remote -profile /tmp/other/profile --dataDir /tmp/other/data -start-debugger-server 5000",
        ].join("\n"),
      });

      assert.equal(result.conditional.releaseInstall.workflowId, "release-install-local");
      assert.equal(result.conditional.releaseInstall.channel, DEFAULT_RELEASE_CHANNEL);
      assert.equal(result.conditional.releaseInstall.triggerStatus, "blocked");
      assert.ok(result.conditional.releaseInstall.triggerReasons.includes("release-install-smoke-stable:missing"));
      assert.ok(result.conditional.releaseInstall.blockers.includes(
        "desktop-runtime-binding-conflict:other-same-bundle-processes-running",
      ));
      assert.equal(result.conditional.releaseInstall.launchCommand, "npm run release:install-smoke:stable -- --keep-open");
      assert.equal(result.conditional.releaseInstall.preflightCommands[0], "npm run release:install-smoke:stable");
      assert.equal(result.conditional.releaseInstall.launchRuntime.mode, "release-install-stable");
      assert.equal(result.conditional.releaseInstall.launchRuntime.desktopInstanceMatchRequired, true);
      assert.equal(result.conditional.releaseInstall.launchRuntime.freshness, "disposable-install-runtime");
      assert.equal(result.conditional.releaseInstall.launchRuntime.desktopInstancePreflightStatus, "other-same-bundle-processes-running");
      assert.equal(result.conditional.releaseInstall.proofContract.defaultKind, "local-install-visible-surface");
      assert.equal(result.conditional.releaseInstall.claimBoundary.defaultProofKind, "local-install-visible-surface");
      assert.ok(result.conditional.releaseInstall.claimBoundary.defaultNonClaims.includes(
        "Does not prove remote updateURL or update_link verification.",
      ));
      assert.ok(result.conditional.releaseInstall.proofContract.nonClaims.includes(
        "Does not prove remote updateURL or update_link verification.",
      ));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("should block the local release install workflow when the profile is not disposable", async () => {
    const root = createWorkflowFixture();
    try {
      const result = await listComputerUseWorkflowCatalog(root, {
        env: {
          ...process.env,
          ZOTERO_PLUGIN_ZOTERO_BIN_PATH: "/Applications/Zotero.app/Contents/MacOS/zotero",
          ZOTERO_PLUGIN_PROFILE_PATH: "/Users/example/non-disposable-profile",
          ZOTERO_PLUGIN_DATA_DIR: "/Users/example/non-disposable-data",
        },
        releaseHandoff: true,
      });

      assert.equal(result.conditional.releaseInstall.triggerStatus, "blocked");
      assert.ok(result.conditional.releaseInstall.blockers.includes("disposable-profile-unavailable"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("should trigger a surface-local workflow from owner path hits and a failed fresh scenario", async () => {
    const root = createWorkflowFixture();
    try {
      fs.writeFileSync(path.join(root, "dist", "zotero-scenario-last-run.json"), JSON.stringify({
        generatedAt: "2026-04-24T01:00:00.000Z",
        incomplete: false,
        results: [
          {
            name: "preference pane surface smoke",
            status: "failed",
          },
        ],
        selectedScenarios: [
          {
            name: "preference pane surface smoke",
            sourceFile: "zotero-scenarios/preferences-surface-smoke.scenario.js",
          },
        ],
        registeredScenarios: [
          {
            name: "preference pane surface smoke",
            sourceFile: "zotero-scenarios/preferences-surface-smoke.scenario.js",
          },
        ],
      }, null, 2), "utf-8");
      fs.writeFileSync(path.join(root, "dist", "agent-zotero-e2e.json"), JSON.stringify({
        generatedAt: "2026-04-24T01:00:01.000Z",
        status: "failed",
      }, null, 2), "utf-8");

      const result = await listComputerUseWorkflowCatalog(root, {
        changedPaths: ["src/features/preference-panes.js"],
        env: {
          ...process.env,
          ZOTERO_PLUGIN_ZOTERO_BIN_PATH: "/Applications/Zotero.app/Contents/MacOS/zotero",
        },
        psOutput: "",
      });
      const surfaceWorkflow = result.conditional.surfaces.find((entry) => entry.surfaceId === "cleanroom-preferences-pane");

      assert.ok(surfaceWorkflow);
      assert.equal(surfaceWorkflow.target, "surface-local visible smoke: cleanroom-preferences-pane");
      assert.equal(surfaceWorkflow.preflightCommands[0], "npm run zotero:scenario -- --scenario 'preference pane surface smoke'");
      assert.equal(surfaceWorkflow.launchRuntime.mode, "dev");
      assert.equal(surfaceWorkflow.launchRuntime.isolation, "project-isolated");
      assert.equal(surfaceWorkflow.launchRuntime.freshness, "reused-project-runtime");
      assert.equal(surfaceWorkflow.launchRuntime.desktopInstanceMatchRequired, true);
      assert.equal(surfaceWorkflow.triggerStatus, "triggered");
      assert.equal(surfaceWorkflow.ready, true);
      assert.equal(surfaceWorkflow.proofContract.defaultKind, "surface-local-visible-smoke");
      assert.equal(surfaceWorkflow.claimBoundary.defaultProofKind, "surface-local-visible-smoke");
      assert.ok(surfaceWorkflow.claimBoundary.defaultNonClaims.includes(
        "Does not prove fresh-profile, first-run, or disposable-runtime state.",
      ));
      assert.ok(surfaceWorkflow.proofContract.nonClaims.includes(
        "Does not prove fresh-profile, first-run, or disposable-runtime state.",
      ));
      assert.ok(surfaceWorkflow.triggerReasons.includes("owner-path-hit:src/features/preference-panes.js"));
      assert.ok(surfaceWorkflow.triggerReasons.includes("fresh-scenario:failed"));
      assert.ok(surfaceWorkflow.triggerReasons.includes("fresh-e2e:failed"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("should focus the surface catalog to explicitly selected surfaces", async () => {
    const root = createWorkflowFixture();
    try {
      const result = await listComputerUseWorkflowCatalog(root, {
        changedPaths: ["dev/agent-runtime/host-actions.js"],
        surfaceIds: ["cleanroom-preferences-pane"],
        env: {
          ...process.env,
          ZOTERO_PLUGIN_ZOTERO_BIN_PATH: "/Applications/Zotero.app/Contents/MacOS/zotero",
        },
      });

      assert.equal(result.conditional.surfaces.length, 1);
      assert.equal(result.conditional.surfaces[0].surfaceId, "cleanroom-preferences-pane");
      assert.ok(result.conditional.surfaces[0].triggerReasons.includes(
        "manual-surface-selection:cleanroom-preferences-pane",
      ));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("should allow manual surface selection even without owner-path hits", async () => {
    const root = createWorkflowFixture();
    try {
      const result = await listComputerUseWorkflowCatalog(root, {
        changedPaths: [],
        surfaceIds: ["cleanroom-preferences-pane"],
        env: {
          ...process.env,
          ZOTERO_PLUGIN_ZOTERO_BIN_PATH: "/Applications/Zotero.app/Contents/MacOS/zotero",
        },
      });

      assert.equal(result.conditional.surfaces.length, 1);
      assert.deepEqual(result.changedPaths, []);
      assert.deepEqual(result.conditional.surfaces[0].triggerReasons, [
        "manual-surface-selection:cleanroom-preferences-pane",
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
