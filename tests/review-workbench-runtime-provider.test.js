import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, it, beforeEach, afterEach, assert } from "./test-framework.js";
import {
  createReviewWorkbenchRuntimeProvider,
  isReviewWorkbenchDevRuntime,
} from "../src/app/review-workbench-runtime-provider.js";

function createIOUtils() {
  return {
    async exists(targetPath) {
      return fs.existsSync(targetPath);
    },
    async readUTF8(targetPath) {
      return fs.readFileSync(targetPath, "utf-8");
    },
  };
}

function createGlobalScope() {
  return {
    PathUtils: {
      join: (...parts) => path.join(...parts),
    },
    IOUtils: createIOUtils(),
  };
}

function writeJSON(root, relativePath, payload) {
  const targetPath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2), "utf-8");
}

describe("Review Workbench Runtime Provider", () => {
  let tempRoot = "";

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cleanroom-review-provider-"));
    fs.mkdirSync(path.join(tempRoot, "build", "cleanroomtemplate"), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, "dist"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("should detect unpacked dev runtimes and reject jar-packaged runtimes", () => {
    assert.equal(isReviewWorkbenchDevRuntime({
      rootURI: "file:///tmp/addon/build/cleanroomtemplate/",
    }), true);
    assert.equal(isReviewWorkbenchDevRuntime({
      rootURI: "chrome://cleanroomtemplate/",
    }), true);
    assert.equal(isReviewWorkbenchDevRuntime({
      rootURI: "jar:file:///tmp/cleanroomtemplate.xpi!/",
    }), false);
  });

  it("should normalize runtime compact, monitor, gate, and host action summaries", async () => {
    writeJSON(tempRoot, "dist/agent-context.json", {
      runtimeCompact: {
        truthRef: {
          activeBatchId: "release-remote-updateurl-distribution",
          validationLevel: "需要视觉验证",
        },
        alignmentRef: {
          status: "aligned",
        },
        artifactRefs: {
          currentTruth: "docs/CURRENT_BACKLOG.md",
          monitor: "dist/agent-monitor.json",
        },
        evidenceRefs: ["dist/agent-monitor.json", "dist/agent-gate.json"],
      },
    });
    writeJSON(tempRoot, "dist/agent-monitor.json", {
      generatedAt: "2026-04-22T08:00:00.000Z",
      frontpageSummary: {
        status: "blocked",
        headline: "watch stale and visual drift remain",
        nextAction: "npm run agent:zotero:e2e",
      },
      zoteroValidation: {
        e2e: {
          generatedAt: "2026-04-22T07:50:00.000Z",
          status: "failed",
          summaryNote: "Reader visual drift remains",
          visualDriftCount: 2,
          primaryDiagnosis: {
            category: "visual-drift",
          },
        },
        autofix: {
          status: "unrecovered",
          patchPlanStatus: "review-ready",
          patchDraftCount: 2,
          patchArchiveRunId: "plan-42",
          patchVerificationSummary: "Patch still needs visual verification.",
        },
      },
    });
    writeJSON(tempRoot, "dist/agent-gate.json", {
      generatedAt: "2026-04-22T08:05:00.000Z",
      frontpageSummary: {
        status: "blocked",
        headline: "gate held by existing watch stale blocker",
        nextAction: "npm run agent:gate",
        primaryBlockers: ["watch stale", "visual drift"],
      },
      validationDecision: {
        level: "visual-recommended",
      },
    });

    const provider = createReviewWorkbenchRuntimeProvider({
      config: {
        addonRef: "cleanroomtemplate",
      },
      globalScope: createGlobalScope(),
      runtime: {
        rootURI: `file://${path.join(tempRoot, "build", "cleanroomtemplate")}/`,
      },
      runtimeInfo: {
        rootURI: `file://${path.join(tempRoot, "build", "cleanroomtemplate")}/`,
      },
      getPrefsEnabled: () => true,
      listHostActions: () => [{
        id: "preferences.openPane",
        label: "Open Preference Pane",
        category: "preferences",
        status: "ready",
        executable: true,
        summary: "Open a preference pane.",
      }],
      getHostActionExecutions: () => [{
        actionId: "preferences.openPane",
        ok: false,
        failureKind: "action-failed",
        executedAt: "2026-04-22T08:10:00.000Z",
        surfaceTarget: "preference-pane",
        readiness: {
          ok: false,
          total: 3,
          passed: 2,
          failed: 1,
        },
        observedState: {
          paneID: "cleanroomtemplate-preferences",
          filePath: "/tmp/private-path",
          selectedPaneID: "cleanroomtemplate-preferences",
          privateNote: "do not leak this free text",
          visualDriftCount: 2,
          issues: ["overflow"],
        },
      }],
    });

    const [scope, route, evidence, patchPlan, gate, hostAction] = await Promise.all([
      provider.getScopeSnapshot(),
      provider.getRouteSnapshot(),
      provider.getEvidenceSummary(),
      provider.getPatchPlanSummary(),
      provider.getGateSummary(),
      provider.getHostActionStageSummary(),
    ]);

    assert.equal(provider.isAvailable(), true);
    assert.equal(scope.available, true);
    assert.equal(scope.truthRef.activeBatchId, "release-remote-updateurl-distribution");
    assert.equal(scope.validationLevel, "visual-recommended");
    assert.equal(scope.validationLevelLabel, "需要视觉验证");
    assert.equal(route.validationLevel, "visual-recommended");
    assert.equal(route.commandAvailability.workbenchReady, true);
    assert.equal(evidence.available, true);
    assert.equal(evidence.status, "blocked");
    assert.equal(evidence.primaryDiagnosis.category, "visual-drift");
    assert.equal(patchPlan.available, true);
    assert.equal(patchPlan.patchPlanStatus, "review-ready");
    assert.equal(patchPlan.latestPlanId, "plan-42");
    assert.equal(gate.available, true);
    assert.equal(gate.blockerCount, 2);
    assert.equal(hostAction.available, true);
    assert.equal(hostAction.catalog.total, 1);
    assert.equal(hostAction.recentExecutions.length, 1);
    assert.equal(hostAction.recentExecutions[0].surfaceTarget, "preference-pane");
    const observedSummary = hostAction.recentExecutions[0].observedStateSummary;
    assert.equal(observedSummary.statusFields.selectedPaneID, "cleanroomtemplate-preferences");
    assert.equal(observedSummary.statusFields.filePath, undefined);
    assert.equal(observedSummary.statusFields.privateNote, undefined);
    assert.equal(observedSummary.numberMetrics.visualDriftCount, 2);
    assert.equal(observedSummary.arrayMetrics[0].count, 1);
    assert.equal(Object.prototype.hasOwnProperty.call(observedSummary, "scalarFields"), false);
  });

  it("should keep other stages available when a single artifact source is missing", async () => {
    writeJSON(tempRoot, "dist/agent-zotero-e2e.json", {
      generatedAt: "2026-04-22T07:50:00.000Z",
      summary: {
        status: "failed",
        summaryNote: "Standalone window smoke failed previously.",
      },
    });

    const provider = createReviewWorkbenchRuntimeProvider({
      config: {
        addonRef: "cleanroomtemplate",
      },
      globalScope: createGlobalScope(),
      runtime: {
        rootURI: `file://${path.join(tempRoot, "build", "cleanroomtemplate")}/`,
      },
      runtimeInfo: {
        rootURI: `file://${path.join(tempRoot, "build", "cleanroomtemplate")}/`,
      },
      getPrefsEnabled: () => false,
    });

    const [scope, route, evidence, patchPlan, gate] = await Promise.all([
      provider.getScopeSnapshot(),
      provider.getRouteSnapshot(),
      provider.getEvidenceSummary(),
      provider.getPatchPlanSummary(),
      provider.getGateSummary(),
    ]);

    assert.equal(scope.available, false);
    assert.equal(route.available, true);
    assert.equal(route.commandAvailability.workbenchReady, false);
    assert.equal(evidence.available, true);
    assert.equal(evidence.source, "agent-zotero-e2e");
    assert.equal(patchPlan.available, false);
    assert.equal(gate.available, false);
  });
});
