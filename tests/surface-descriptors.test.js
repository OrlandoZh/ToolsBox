import { describe, it, assert } from "./test-framework.js";
import { createSurfaceDescriptors as createDefaultSurfaceDescriptors } from "../src/app/surface-descriptors.js";
import { createSurfaceDescriptors as createProtectedSurfaceDescriptors } from "../src/app/surface-descriptors-protected.js";

describe("Surface Descriptors", () => {
  it("should preserve readable default ids for mainline builds", () => {
    const descriptors = createDefaultSurfaceDescriptors({
      addonRef: "cleanroomtemplate",
    });

    assert.equal(descriptors.preferencePaneID, "cleanroomtemplate-preferences");
    assert.equal(descriptors.primaryActionCommandID, "cleanroomtemplate-primary-action");
    assert.equal(descriptors.readerSummaryCommandID, "cleanroomtemplate-reader-summary");
    assert.equal(descriptors.readerSelectionCommandID, "cleanroomtemplate-reader-selection-snapshot");
    assert.equal(descriptors.contextMenuItemID, "cleanroomtemplate-context-action");
    assert.equal(descriptors.menuCommand.toolsMenuItemID, "cleanroom-template-menuitem");
    assert.equal(descriptors.demoInfoRowID, "cleanroomtemplate-selection-summary");
    assert.equal(descriptors.demoSectionID, "cleanroomtemplate-details");
    assert.equal(descriptors.demoColumnKey, "cleanroomtemplate-status");
    assert.equal(descriptors.demoNotifierID, "cleanroomtemplate-activity");
    assert.equal(descriptors.serviceIDs.runtimeCore, "cleanroomtemplate.runtime-core");
    assert.equal(descriptors.serviceLabels.runtimeCore, "Runtime Core");
    assert.equal(descriptors.serviceLabels.reactUIDemo, "Optional React UI Demo");
  });

  it("should derive deterministic protected ids without readable semantic suffixes", () => {
    const descriptors = createProtectedSurfaceDescriptors({
      addonId: "cleanroom-template@example.com",
      addonRef: "cleanroomtemplate",
    });

    assert.equal(descriptors.preferencePaneID.startsWith("cr"), true);
    assert.equal(descriptors.primaryActionCommandID.startsWith("cr"), true);
    assert.equal(descriptors.readerSummaryCommandID.startsWith("cr"), true);
    assert.equal(descriptors.menuCommand.toolsMenuItemID.startsWith("cr"), true);
    assert.equal(descriptors.serviceIDs.runtimeCore.startsWith("cr"), true);
    assert.equal(descriptors.preferencePaneID.includes("cleanroomtemplate"), false);
    assert.equal(descriptors.preferencePaneID.includes("preferences"), false);
    assert.equal(descriptors.readerSelectionCommandID.includes("reader-selection-snapshot"), false);
    assert.equal(descriptors.contextMenuItemID.includes("context-action"), false);
    assert.equal(descriptors.demoInfoRowID.includes("selection-summary"), false);
    assert.equal(descriptors.serviceIDs.runtimeCore.includes("runtime-core"), false);
    assert.equal(descriptors.serviceIDs.hostSignals.includes("host-signals"), false);
    assert.equal(descriptors.serviceLabels.runtimeCore, "Service 0");
    assert.equal(descriptors.serviceLabels.reactUIDemo, "Service 4");
  });

  it("should keep protected ids stable for the same addon identity", () => {
    const first = createProtectedSurfaceDescriptors({
      addonId: "cleanroom-template@example.com",
      addonRef: "cleanroomtemplate",
    });
    const second = createProtectedSurfaceDescriptors({
      addonId: "cleanroom-template@example.com",
      addonRef: "cleanroomtemplate",
    });

    assert.deepEqual(first, second);
  });
});
