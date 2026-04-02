import { describe, it, assert } from "./test-framework.js";
import { createHostActionRunner } from "../src/app/host-actions.js";
import {
  getHostActionDescriptor,
  listHostActionDescriptors,
} from "../src/app/host-action-catalog.js";

function createSurfaceTarget(surfaceId, captureKind) {
  return {
    surfaceId,
    captureKind,
    label: captureKind,
    scope: "surface-local",
    rect: {
      x: 10,
      y: 10,
      width: 320,
      height: 180,
    },
    windowBounds: null,
    details: {},
  };
}

describe("Host Actions", () => {
  it("should expose a stable source-driven host action catalog", () => {
    const actions = listHostActionDescriptors();
    assert.ok(actions.length >= 9);
    assert.equal(getHostActionDescriptor("preferences.openPane")?.status, "ready");
    assert.equal(getHostActionDescriptor("menu.trigger")?.executable, true);
    assert.equal(getHostActionDescriptor("preferences.helpLink")?.status, "manual-only");
  });

  it("should run preference pane host actions with readiness and surface evidence", async () => {
    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: {
        async preparePreferencePane() {
          return {
            window: {
              focus() {},
            },
            paneElement: {
              querySelectorAll() {
                return [{}, {}];
              },
            },
            selectedPaneID: "cleanroomtemplate-preferences",
          };
        },
        listPreferenceWindows() {
          return [{}];
        },
        buildSurfaceTarget() {
          return createSurfaceTarget("preference-pane", "surface-preference-cleanroomtemplate-preferences");
        },
      },
      reader: {},
      menuManager: {},
    });

    const result = await runner.runHostAction("preferences.openPane", {
      paneID: "cleanroomtemplate-preferences",
    });

    assert.equal(result.ok, true);
    assert.equal(result.actionId, "preferences.openPane");
    assert.equal(result.readiness.ok, true);
    assert.equal(result.observedState.selectedPaneID, "cleanroomtemplate-preferences");
    assert.equal(result.surfaceTarget.surfaceId, "preference-pane");
  });

  it("should drive live menu actions and classify unknown actions", async () => {
    let clickCount = 0;
    class FakeMouseEvent {
      constructor(type) {
        this.type = type;
      }
    }
    class FakeEvent {
      constructor(type) {
        this.type = type;
      }
    }
    const menuElem = {
      dispatchEvent() {
        clickCount += 1;
      },
      ownerGlobal: {
        focus() {},
        MouseEvent: FakeMouseEvent,
        Event: FakeEvent,
      },
      ownerDocument: {
        defaultView: {
          focus() {},
          MouseEvent: FakeMouseEvent,
          Event: FakeEvent,
        },
      },
    };
    const runner = createHostActionRunner({
      config: {
        addonRef: "cleanroomtemplate",
      },
      host: {
        async resolveMenuPopup() {
          return {
            async open() {
              return {
                ownerGlobal: {
                  focus() {},
                },
                ownerDocument: {
                  defaultView: {
                    focus() {},
                  },
                },
              };
            },
          };
        },
        async waitFor(callback) {
          return await callback();
        },
        buildSurfaceTarget() {
          return createSurfaceTarget("menu-item", "surface-menu-reader-view-cleanroomtemplate-reader-summary");
        },
      },
      reader: {},
      menuManager: {
        getMenuRegistrationSnapshot() {
          return {
            target: "reader/menubar/view",
            menuPaths: ["0"],
          };
        },
        getLiveMenuState() {
          return {
            menuElem,
            menuPath: "0",
            itemCount: 1,
            phase: "onShowing",
            tabID: "reader-tab-1",
            tabType: "reader",
          };
        },
      },
    });

    const triggerResult = await runner.runHostAction("menu.trigger", {
      menuID: "cleanroomtemplate-reader-summary",
      target: "reader/menubar/view",
    });
    const unknownResult = await runner.runHostAction("missing.action");

    assert.equal(triggerResult.ok, true);
    assert.equal(triggerResult.readiness.ok, true);
    assert.equal(triggerResult.observedState.commandDispatched, true);
    assert.ok(clickCount >= 2);
    assert.equal(unknownResult.ok, false);
    assert.equal(unknownResult.failureKind, "unknown-action");
  });
});
