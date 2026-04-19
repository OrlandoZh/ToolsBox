import { describe, it, assert } from "./test-framework.js";
import {
  DEFAULT_REACT_SURFACE_GLOBAL_KEY,
  DEFAULT_REACT_SURFACE_SCRIPT_PATH,
  DEFAULT_REACT_SURFACE_STYLE_PATH,
  DEFAULT_REACT_SURFACE_STYLE_ID,
  ensureReactSurfaceRenderer,
  mountReactSurface,
  unmountReactSurface,
  updateReactSurface,
} from "../src/utils/react-surface-bridge.js";

function createFakeDocument(view = {}) {
  const elementsById = new Map();
  const parent = {
    children: [],
    appendChild(node) {
      this.children.push(node);
      node.parentNode = this;
      if (node?.id) {
        elementsById.set(node.id, node);
      }
      return node;
    },
  };

  return {
    defaultView: view,
    head: parent,
    documentElement: parent,
    body: parent,
    createElement(tagName) {
      return {
        tagName: String(tagName || "").toUpperCase(),
      };
    },
    getElementById(id) {
      return elementsById.get(id) || null;
    },
  };
}

describe("React Surface Bridge", () => {
  it("should inject the stylesheet once and load the renderer into the target view", () => {
    const renderer = {
      mount() {},
      update() {},
      unmount() {},
    };
    const view = {};
    const doc = createFakeDocument(view);
    let loadCount = 0;

    const services = {
      scriptloader: {
        loadSubScript(url, targetView) {
          loadCount += 1;
          assert.equal(url, `chrome://cleanroomtemplate/${DEFAULT_REACT_SURFACE_SCRIPT_PATH}`);
          targetView[DEFAULT_REACT_SURFACE_GLOBAL_KEY] = renderer;
        },
      },
    };

    const first = ensureReactSurfaceRenderer(doc, {
      rootURI: "chrome://cleanroomtemplate/",
      services,
    });
    const second = ensureReactSurfaceRenderer(doc, {
      rootURI: "chrome://cleanroomtemplate/",
      services,
    });

    assert.equal(first.success, true);
    assert.equal(first.styleLinked, true);
    assert.equal(first.loadAttempted, true);
    assert.equal(first.renderer, renderer);
    assert.equal(second.success, true);
    assert.equal(second.loadAttempted, false);
    assert.equal(loadCount, 1);
    assert.equal(doc.getElementById(DEFAULT_REACT_SURFACE_STYLE_ID)?.href, `chrome://cleanroomtemplate/${DEFAULT_REACT_SURFACE_STYLE_PATH}`);
    assert.equal(doc.head.children.length, 1);
  });

  it("should retry with force reload when the first script load does not expose the renderer global", () => {
    const renderer = {
      mount() {},
      unmount() {},
    };
    const view = {};
    const doc = createFakeDocument(view);
    let loadCount = 0;

    const result = ensureReactSurfaceRenderer(doc, {
      services: {
        scriptloader: {
          loadSubScript(url, targetView) {
            loadCount += 1;
            assert.ok(url.endsWith("react-ui-surface-bridge.js"));
            if (loadCount === 2) {
              targetView[DEFAULT_REACT_SURFACE_GLOBAL_KEY] = renderer;
            }
          },
        },
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.attemptedReload, true);
    assert.equal(result.renderer, renderer);
    assert.equal(loadCount, 2);
  });

  it("should mount, update, and unmount the loaded renderer", () => {
    const events = [];
    const renderer = {
      mount(container, props) {
        events.push(["mount", container, props]);
      },
      unmount(container) {
        events.push(["unmount", container]);
      },
    };
    const view = {};
    const doc = createFakeDocument(view);
    const container = { id: "surface-root" };

    const services = {
      scriptloader: {
        loadSubScript(url, targetView) {
          assert.ok(url.endsWith("react-ui-surface-bridge.js"));
          targetView.wrappedJSObject = {
            [DEFAULT_REACT_SURFACE_GLOBAL_KEY]: renderer,
          };
        },
      },
    };

    const mountResult = mountReactSurface({
      doc,
      container,
      props: { title: "Mounted" },
      services,
    });
    const updateResult = updateReactSurface({
      doc,
      container,
      props: { title: "Updated" },
      services,
    });
    const unmountResult = unmountReactSurface({
      doc,
      container,
      services,
    });

    assert.equal(mountResult.success, true);
    assert.equal(mountResult.operation, "mount");
    assert.equal(updateResult.success, true);
    assert.equal(updateResult.operation, "update");
    assert.equal(unmountResult.success, true);
    assert.equal(unmountResult.operation, "unmount");
    assert.deepEqual(events, [
      ["mount", container, { title: "Mounted" }],
      ["mount", container, { title: "Updated" }],
      ["unmount", container],
    ]);
  });
});
