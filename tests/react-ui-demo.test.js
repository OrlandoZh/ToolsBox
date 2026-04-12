import { describe, it, assert } from "./test-framework.js";
import { createReactUIDemoLauncher } from "../src/features/react-ui-demo.js";

function createFakeDocument(view = {}) {
  const elementsById = new Map();

  function createParentNode() {
    const attributes = new Map();
    return {
      children: [],
      ownerDocument: null,
      appendChild(node) {
        this.children.push(node);
        node.parentNode = this;
        if (node?.id) {
          elementsById.set(node.id, node);
        }
        return node;
      },
      removeChild(node) {
        this.children = this.children.filter((entry) => entry !== node);
        if (node?.id) {
          elementsById.delete(node.id);
        }
        node.parentNode = null;
        return node;
      },
      setAttribute(name, value) {
        attributes.set(String(name), String(value));
      },
      getAttribute(name) {
        return attributes.get(String(name)) || null;
      },
    };
  }

  const head = createParentNode();
  const documentElement = createParentNode();
  const body = createParentNode();
  const doc = {
    defaultView: view,
    head,
    documentElement,
    body,
    readyState: "complete",
    createElement(tagName) {
      return {
        tagName: String(tagName || "").toUpperCase(),
        ownerDocument: doc,
        dataset: {},
        style: {},
        children: [],
        setAttribute(name, value) {
          this[name] = String(value);
        },
        appendChild(child) {
          this.children.push(child);
          child.parentNode = this;
          return child;
        },
      };
    },
    createElementNS(_ns, tagName) {
      return this.createElement(tagName);
    },
    getElementById(id) {
      return elementsById.get(id) || null;
    },
  };

  head.ownerDocument = doc;
  documentElement.ownerDocument = doc;
  body.ownerDocument = doc;
  return doc;
}

function createFakeWindow({ href = "chrome://cleanroomtemplate/content/react-ui/demo.xhtml" } = {}) {
  const window = {
    closed: false,
    focusCount: 0,
    location: {
      href,
    },
    addEventListener() {},
    removeEventListener() {},
    focus() {
      this.focusCount += 1;
    },
    close() {
      this.closed = true;
    },
  };
  const doc = createFakeDocument(window);
  const root = doc.createElement("div");
  root.id = "react-ui-demo-root";
  doc.body.appendChild(root);
  window.document = doc;
  return window;
}

describe("React UI Demo", () => {
  it("should mount, update, and unmount the item pane React surface when the bundle is enabled", () => {
    const events = [];
    let themeMountCount = 0;
    let themeCleanupCount = 0;
    let scriptLoadCount = 0;
    const view = {};
    const doc = createFakeDocument(view);
    const itemPaneBody = {
      ownerDocument: doc,
      children: [],
      appendChild(child) {
        this.children.push(child);
        child.parentNode = this;
        return child;
      },
      removeChild(child) {
        this.children = this.children.filter((entry) => entry !== child);
        child.parentNode = null;
        return child;
      },
    };

    const renderer = {
      mount(container, props) {
        events.push(["mount", container, props.title]);
      },
      update(container, props) {
        events.push(["update", container, props.title]);
      },
      unmount(container) {
        events.push(["unmount", container]);
      },
    };

    const launcher = createReactUIDemoLauncher({
      config: {
        addonRef: "cleanroomtemplate",
        addonName: "Cleanroom Template",
      },
      optionalBundles: {
        isEnabled(bundleID) {
          return bundleID === "react-ui";
        },
      },
      themeManager: {
        mountElement() {
          themeMountCount += 1;
          return () => {
            themeCleanupCount += 1;
          };
        },
      },
      services: {
        scriptloader: {
          loadSubScript(url, targetView) {
            scriptLoadCount += 1;
            assert.equal(url, "chrome://cleanroomtemplate/content/scripts/react-ui-surface-bridge.js");
            targetView.__CleanroomTemplateReactSurface__ = renderer;
          },
        },
      },
      rootURI: "chrome://cleanroomtemplate/",
      logger: {
        debug() {},
        warn() {},
      },
    });

    const first = launcher.renderItemPaneSurface({
      doc,
      body: itemPaneBody,
      props: {
        title: "First Surface",
      },
    });
    const second = launcher.renderItemPaneSurface({
      doc,
      body: itemPaneBody,
      props: {
        title: "Updated Surface",
      },
    });
    const unmounted = launcher.unmountItemPaneSurface({
      body: itemPaneBody,
    });

    assert.equal(first.success, true);
    assert.equal(first.operation, "mount");
    assert.equal(first.presentation.effectiveWindowMode, "docked");
    assert.equal(second.success, true);
    assert.equal(second.operation, "update");
    assert.equal(first.container.dataset.windowMode, "docked");
    assert.equal(first.container.dataset.surfaceKind, "docked-panel");
    assert.equal(unmounted, true);
    assert.equal(scriptLoadCount, 1);
    assert.equal(themeMountCount, 1);
    assert.equal(themeCleanupCount, 1);
    assert.equal(launcher.getHostSurfaceCount(), 0);
    assert.equal(launcher.getSnapshot().lastPresentation.effectiveWindowMode, "docked");
    assert.equal(events.length, 3);
    assert.equal(events[0][0], "mount");
    assert.equal(events[0][1], first.container);
    assert.equal(events[0][2], "First Surface");
    assert.equal(events[1][0], "update");
    assert.equal(events[1][1], first.container);
    assert.equal(events[1][2], "Updated Surface");
    assert.equal(events[2][0], "unmount");
    assert.equal(events[2][1], first.container);
  });

  it("should no-op item pane rendering when the optional bundle is disabled", () => {
    const launcher = createReactUIDemoLauncher({
      optionalBundles: {
        isEnabled() {
          return false;
        },
      },
    });

    const result = launcher.renderItemPaneSurface({
      doc: createFakeDocument({}),
      body: {
        appendChild() {},
      },
      props: {
        title: "Disabled Surface",
      },
    });

    assert.equal(result.enabled, false);
    assert.equal(result.mounted, false);
    assert.equal(result.reason, "disabled");
  });

  it("should route default presentation through the docked item pane when a host body is available", async () => {
    const events = [];
    const view = {};
    const doc = createFakeDocument(view);
    const itemPaneBody = {
      ownerDocument: doc,
      children: [],
      appendChild(child) {
        this.children.push(child);
        child.parentNode = this;
        return child;
      },
      removeChild(child) {
        this.children = this.children.filter((entry) => entry !== child);
        child.parentNode = null;
        return child;
      },
    };

    const launcher = createReactUIDemoLauncher({
      config: {
        addonRef: "cleanroomtemplate",
        addonName: "Cleanroom Template",
      },
      optionalBundles: {
        isEnabled(bundleID) {
          return bundleID === "react-ui";
        },
      },
      services: {
        scriptloader: {
          loadSubScript(_url, targetView) {
            targetView.__CleanroomTemplateReactSurface__ = {
              mount(container, props) {
                events.push(["mount", container, props.surfaceWindowMode]);
              },
              update() {},
              unmount() {},
            };
          },
        },
      },
      rootURI: "chrome://cleanroomtemplate/",
      logger: {
        debug() {},
        warn() {},
      },
    });

    const result = await launcher.presentSurface({
      doc,
      body: itemPaneBody,
      preferredWindowMode: "default",
      props: {
        title: "Docked Presentation",
      },
    });

    assert.equal(result.operation, "mount");
    assert.equal(result.presentation.effectiveWindowMode, "docked");
    assert.equal(result.presentation.windowModeSource, "default-docked");
    assert.equal(events[0][2], "docked");
  });

  it("should fallback from docked presentation to a floating window shell when no host pane is available", async () => {
    const opened = [];
    const demoWindow = createFakeWindow();
    const launcher = createReactUIDemoLauncher({
      config: {
        addonRef: "cleanroomtemplate",
        addonName: "Cleanroom Template",
      },
      optionalBundles: {
        isEnabled(bundleID) {
          return bundleID === "react-ui";
        },
      },
      host: {
        getMainWindow() {
          return {
            openDialog(href, name, features) {
              opened.push({
                href,
                name,
                features,
              });
              demoWindow.location.href = href;
              return demoWindow;
            },
          };
        },
        resolveContentUrl(path) {
          return `chrome://cleanroomtemplate/${path}`;
        },
        buildSurfaceTarget(options) {
          return options;
        },
      },
      themeManager: {
        mountWindow() {
          return () => {};
        },
      },
      logger: {
        debug() {},
        warn() {},
      },
    });

    const result = await launcher.presentSurface({
      preferredWindowMode: "docked",
    });

    assert.equal(opened.length, 1);
    assert.equal(opened[0].href, "chrome://cleanroomtemplate/content/react-ui/demo.xhtml");
    assert.equal(opened[0].name, "cleanroomtemplate-react-ui-demo-floating");
    assert.equal(result.presentation.effectiveWindowMode, "floating");
    assert.equal(result.presentation.windowModeSource, "docked-fallback");
    assert.equal(result.presentation.surfaceKind, "floating-panel");
    assert.equal(result.surfaceTarget.details.presentation.effectiveWindowMode, "floating");
    assert.equal(result.window.document.documentElement.getAttribute("data-window-mode"), "floating");
    assert.equal(result.window.focusCount, 1);
  });

  it("should keep standalone requests on the window-shell lane", async () => {
    const opened = [];
    const demoWindow = createFakeWindow();
    const launcher = createReactUIDemoLauncher({
      config: {
        addonRef: "cleanroomtemplate",
        addonName: "Cleanroom Template",
      },
      optionalBundles: {
        isEnabled(bundleID) {
          return bundleID === "react-ui";
        },
      },
      host: {
        getMainWindow() {
          return {
            openDialog(href, name) {
              opened.push({
                href,
                name,
              });
              demoWindow.location.href = href;
              return demoWindow;
            },
          };
        },
        resolveContentUrl(path) {
          return `chrome://cleanroomtemplate/${path}`;
        },
        buildSurfaceTarget(options) {
          return options;
        },
      },
      themeManager: {
        mountWindow() {
          return () => {};
        },
      },
      logger: {
        debug() {},
        warn() {},
      },
    });

    const result = await launcher.openDemoWindow({
      preferredWindowMode: "standalone",
    });

    assert.equal(opened.length, 1);
    assert.equal(opened[0].name, "cleanroomtemplate-react-ui-demo-standalone");
    assert.equal(result.presentation.effectiveWindowMode, "standalone");
    assert.equal(result.presentation.surfaceKind, "standalone-window");
    assert.equal(result.surfaceTarget.details.presentation.surfaceKind, "standalone-window");
    assert.equal(result.window.document.documentElement.getAttribute("data-surface-kind"), "standalone-window");
  });
});
