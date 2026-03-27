import { describe, it, assert } from "./test-framework.js";
import {
  createCapabilityManifest,
  findCapabilityById,
  listCapabilityIds,
} from "../src/app/capability-manifest.js";

describe("Capability Manifest", () => {
  it("should expose stable capability ids and ownership metadata", () => {
    const manifest = createCapabilityManifest({
      config: {
        addonRef: "cleanroomtemplate",
      },
    });

    const capabilityIds = listCapabilityIds(manifest);
    assert.ok(capabilityIds.length >= 11);
    assert.includes(capabilityIds, "settings-governance");
    assert.includes(capabilityIds, "multi-window-mount");
    assert.includes(capabilityIds, "reader-annotation-roundtrip");
    assert.includes(capabilityIds, "reader-ui-state");
    assert.includes(capabilityIds, "reader-event-hooks");

    const settingsCapability = findCapabilityById(manifest, "settings-governance");
    assert.equal(settingsCapability.agentScenario, "settings-snapshot");
    assert.includes(settingsCapability.ownedBy, "src/settings/schema.js");

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
  });
});
