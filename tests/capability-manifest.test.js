import { describe, it, assert } from "./test-framework.js";
import {
  createCapabilityManifest,
  findCapabilityById,
  getCapabilityManifestView,
  listCapabilityIds,
} from "../dev/agent-runtime/capability-manifest.js";

describe("Capability Manifest", () => {
  it("should expose stable capability ids and ownership metadata", () => {
    const manifest = createCapabilityManifest({
      config: {
        addonRef: "cleanroomtemplate",
      },
    });

    const capabilityIds = listCapabilityIds(manifest);
    assert.ok(capabilityIds.length >= 12);
    assert.includes(capabilityIds, "settings-governance");
    assert.includes(capabilityIds, "multi-window-mount");
    assert.includes(capabilityIds, "reader-annotation-roundtrip");
    assert.includes(capabilityIds, "reader-ui-state");
    assert.includes(capabilityIds, "reader-event-hooks");
    assert.includes(capabilityIds, "host-actions");

    const settingsCapability = findCapabilityById(manifest, "settings-governance");
    assert.equal(settingsCapability.agentScenario, "settings-snapshot");
    assert.includes(settingsCapability.ownedBy, "src/settings/schema.js");
    assert.includes(settingsCapability.zoteroScenarios, "preference pane control interaction");

    const windowCapability = findCapabilityById(manifest, "multi-window-mount");
    assert.includes(windowCapability.successSignals.join(" "), "样式");

    const annotationCapability = findCapabilityById(manifest, "reader-annotation-roundtrip");
    assert.equal(annotationCapability.agentScenario, "reader-current");
    assert.includes(annotationCapability.zoteroScenarios, "reader annotation roundtrip");

    const readerUICapability = findCapabilityById(manifest, "reader-ui-state");
    assert.equal(readerUICapability.agentScenario, "reader-current");
    assert.includes(readerUICapability.zoteroScenarios, "reader interaction diagnostics");

    const readerEventHooksCapability = findCapabilityById(manifest, "reader-event-hooks");
    assert.equal(readerEventHooksCapability.agentScenario, "reader-current");
    assert.includes(readerEventHooksCapability.zoteroScenarios, "reader event hook diagnostics");
    assert.includes(readerEventHooksCapability.zoteroScenarios, "reader fine-grained hook diagnostics");

    const hostActionsCapability = findCapabilityById(manifest, "host-actions");
    assert.equal(hostActionsCapability.agentScenario, "host-actions");
    assert.includes(hostActionsCapability.zoteroScenarios, "preference pane surface smoke");
    assert.includes(hostActionsCapability.zoteroScenarios, "preference pane control interaction");

    const view = getCapabilityManifestView();
    assert.equal(view.manifestVariant, "source");
    assert.equal(view.protectedView, false);
    assert.equal(view.detailLevel, "full");
    assert.equal(view.limitedMode, false);
  });
});
