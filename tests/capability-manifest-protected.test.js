import { describe, it, assert } from "./test-framework.js";
import {
  createCapabilityManifest,
  findCapabilityById,
  getCapabilityManifestView,
} from "../src/app/capability-manifest-protected.js";

describe("Protected Capability Manifest", () => {
  it("should default to limited protected baseline without richer overlay", () => {
    const view = getCapabilityManifestView();
    const manifest = createCapabilityManifest();
    const baseline = findCapabilityById(manifest, "baseline-registration");

    assert.equal(view.manifestVariant, "protected");
    assert.equal(view.protectedView, true);
    assert.equal(view.detailLevel, "limited");
    assert.equal(view.limitedMode, true);
    assert.equal(view.overlayAvailable, false);
    assert.equal(view.overlayApplied, false);
    assert.equal(view.activationSatisfied, false);
    assert.includes(view.activationMissing, "profileHash");
    assert.includes(view.activationMissing, "dbAvailable");
    assert.includes(view.activationMissing, "noncePresent");

    assert.equal(
      baseline.description,
      "受保护导出不附带该能力的详细说明。",
    );
    assert.equal(Object.prototype.hasOwnProperty.call(baseline, "entrypoints"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(baseline, "ownedBy"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(baseline, "successSignals"), false);
  });

  it("should keep limited baseline when host binding is incomplete even if overlay is present", () => {
    const descriptorOverlay = [{
      id: "host-actions",
      description: "overlay description",
      entrypoints: ["plugin.api.agent.runHostAction(actionId, payload)"],
      ownedBy: ["src/app/host-actions.js"],
      successSignals: ["Host actions return readiness details"],
    }];
    const view = getCapabilityManifestView({
      descriptorOverlay,
      protectionSummary: {
        hostBinding: {
          profileHash: "sha256:profile",
          dbAvailable: true,
          noncePresent: false,
        },
      },
    });
    const manifest = createCapabilityManifest({
      descriptorOverlay,
      protectionSummary: {
        hostBinding: {
          profileHash: "sha256:profile",
          dbAvailable: true,
          noncePresent: false,
        },
      },
    });
    const hostActions = findCapabilityById(manifest, "host-actions");

    assert.equal(view.overlayAvailable, true);
    assert.equal(view.overlayApplied, false);
    assert.equal(view.detailLevel, "limited");
    assert.includes(view.activationMissing, "noncePresent");
    assert.equal(
      hostActions.description,
      "受保护导出不附带该能力的详细说明。",
    );
    assert.equal(Object.prototype.hasOwnProperty.call(hostActions, "entrypoints"), false);
  });

  it("should merge richer overlay fields only when host binding requirements are satisfied", () => {
    const descriptorOverlay = [{
      id: "host-actions",
      description: "验证 host action overlay 已按宿主弱绑定解锁。",
      entrypoints: ["plugin.api.agent.runHostAction(actionId, payload)"],
      ownedBy: ["src/app/host-actions.js", "src/app/plugin-agent.js"],
      successSignals: ["Host actions return readiness details"],
      ignoredField: "should-not-pass-through",
    }];
    const protectionSummary = {
      hostBinding: {
        profileHash: "sha256:profile",
        dbAvailable: true,
        noncePresent: true,
      },
    };

    const view = getCapabilityManifestView({ descriptorOverlay, protectionSummary });
    const manifest = createCapabilityManifest({ descriptorOverlay, protectionSummary });
    const hostActions = findCapabilityById(manifest, "host-actions");

    assert.equal(view.detailLevel, "full");
    assert.equal(view.limitedMode, false);
    assert.equal(view.overlayAvailable, true);
    assert.equal(view.overlayApplied, true);
    assert.equal(view.activationSatisfied, true);
    assert.deepEqual(view.activationMissing, []);

    assert.equal(hostActions.description, descriptorOverlay[0].description);
    assert.deepEqual(hostActions.entrypoints, descriptorOverlay[0].entrypoints);
    assert.deepEqual(hostActions.ownedBy, descriptorOverlay[0].ownedBy);
    assert.deepEqual(hostActions.successSignals, descriptorOverlay[0].successSignals);
    assert.equal(Object.prototype.hasOwnProperty.call(hostActions, "ignoredField"), false);
  });
});
