import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, it, beforeEach, afterEach, assert } from "./test-framework.js";
import {
  createAgentReviewWorkbench,
  createEmptyWorkbenchState,
  createReviewWorkbenchStateStore,
} from "../src/features/agent-review-workbench.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createIOUtils() {
  return {
    async exists(targetPath) {
      return fs.existsSync(targetPath);
    },
    async makeDirectory(targetPath) {
      fs.mkdirSync(targetPath, { recursive: true });
    },
    async readUTF8(targetPath) {
      return fs.readFileSync(targetPath, "utf-8");
    },
    async writeUTF8(targetPath, source) {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, source, "utf-8");
    },
  };
}

function createGlobalScope(rootDir) {
  return {
    Zotero: {
      DataDirectory: {
        dir: rootDir,
      },
    },
    PathUtils: {
      join: (...parts) => path.join(...parts),
    },
    IOUtils: createIOUtils(),
  };
}

function createMemoryStore(initialState = null) {
  let state = initialState ? clone(initialState) : null;
  return {
    async init() {
      if (state === null) {
        state = createEmptyWorkbenchState(() => new Date("2026-04-22T00:00:00.000Z"));
      }
      return clone(state);
    },
    async setState(nextState) {
      state = clone(nextState);
      return clone(state);
    },
    async flush() {
      return clone(state);
    },
    async dispose() {
      state = null;
      return true;
    },
    getState() {
      return state === null ? null : clone(state);
    },
    getStatus() {
      return {
        lastError: null,
      };
    },
  };
}

function createMockWorkbenchWindow({ readyState = "complete" } = {}) {
  const elements = new Map();
  const listeners = new Map();

  const doc = {
    readyState,
    documentElement: {
      attributes: {},
      setAttribute(name, value) {
        this.attributes[name] = String(value);
      },
    },
    getElementById(id) {
      return elements.get(id) || null;
    },
  };

  function registerElement(id) {
    const element = { id };
    elements.set(id, element);
    return element;
  }

  const window = {
    document: doc,
    location: {
      href: "chrome://cleanroomtemplate/content/lib/agent-review-workbench.xhtml",
    },
    closed: false,
    focusCount: 0,
    closeCount: 0,
    __CleanroomAgentReviewWorkbench__: {
      mount() {
        registerElement("review-workbench-root");
        registerElement("review-workbench-stepper");
        registerElement("review-workbench-annotations");
      },
      unmount() {},
    },
    addEventListener(type, listener) {
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent(type) {
      const current = Array.from(listeners.get(type) || []);
      current.forEach((listener) => listener({ type, target: window, currentTarget: window }));
    },
    focus() {
      this.focusCount += 1;
    },
    close() {
      this.closeCount += 1;
      this.closed = true;
      this.dispatchEvent("unload");
    },
  };

  return window;
}

describe("Agent Review Workbench", () => {
  let tempRoot = "";

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cleanroom-agent-review-workbench-"));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("should keep the standalone workbench shell localized for Chinese review usage", () => {
    const shellPath = path.resolve("addon-static", "content", "lib", "agent-review-workbench.xhtml");
    const scriptPath = path.resolve("addon-static", "content", "lib", "agent-review-workbench.js");
    const shellSource = fs.readFileSync(shellPath, "utf-8");
    const scriptSource = fs.readFileSync(scriptPath, "utf-8");

    assert.ok(shellSource.includes("<title>Agent 审查工作台</title>"));
    assert.ok(shellSource.includes("开发专用审查工作台"));
    assert.ok(shellSource.includes("生成修订计划"));
    assert.ok(shellSource.includes("结构化视图"));
    assert.ok(shellSource.includes("阶段批注"));
    assert.ok(shellSource.includes("验证导航"));
    assert.ok(scriptSource.includes("scope: \"范围\""));
    assert.ok(scriptSource.includes("hostAction: \"宿主动作\""));
    assert.ok(scriptSource.includes("\"draft-doc-update\": \"起草文档更新\""));
    assert.ok(scriptSource.includes("当前阶段没有打开状态的批注"));
    assert.equal(shellSource.includes("Generate Revision Plan"), false);
    assert.equal(shellSource.includes("Waiting for runtime bridge"), false);
  });

  it("should recover from corrupt persisted JSON and keep an error summary", async () => {
    const store = createReviewWorkbenchStateStore({
      globalScope: createGlobalScope(tempRoot),
      config: {
        addonRef: "cleanroomtemplate",
      },
    });

    fs.mkdirSync(path.dirname(store.resolveFilePath()), { recursive: true });
    fs.writeFileSync(store.resolveFilePath(), "{invalid json", "utf-8");

    const loaded = await store.init();
    await store.flush();
    const persisted = JSON.parse(fs.readFileSync(store.resolveFilePath(), "utf-8"));

    assert.equal(typeof loaded.session.id, "string");
    assert.equal(typeof loaded.meta.lastError, "string");
    assert.ok(loaded.meta.lastError.length > 0);
    assert.equal(persisted.schemaVersion, 1);
    assert.equal(typeof persisted.state.meta.lastError, "string");
  });

  it("should return disabled JSON snapshots when the workbench is unavailable", async () => {
    const workbench = createAgentReviewWorkbench({
      config: {
        addonRef: "cleanroomtemplate",
        addonName: "Cleanroom Template",
      },
      host: {
        getMainWindow() {
          return null;
        },
        resolveContentUrl(value) {
          return `chrome://cleanroomtemplate/${value}`;
        },
      },
      isAvailable() {
        return false;
      },
      getAvailability() {
        return {
          available: false,
          reason: "non-dev-runtime",
          summary: "Agent Review Workbench is only available in unpacked template dev runtimes.",
        };
      },
    });

    const snapshot = await workbench.getSnapshot();
    const plan = await workbench.generatePlan({
      stage: "scope",
      annotationIds: [],
    });

    assert.equal(snapshot.disabled, true);
    assert.equal(snapshot.diagnostics.enabled, false);
    assert.equal(snapshot.availability.reason, "non-dev-runtime");
    assert.equal(plan.ok, false);
    assert.equal(plan.reason, "non-dev-runtime");
  });

  it("should detect stale evidence snapshots and clear stale after refresh", async () => {
    let evidenceVersion = 1;
    const workbenchWindow = createMockWorkbenchWindow();
    const host = {
      getMainWindow() {
        return {
          openDialog() {
            return workbenchWindow;
          },
        };
      },
      resolveContentUrl(value) {
        return `chrome://cleanroomtemplate/${value}`;
      },
    };

    const workbench = createAgentReviewWorkbench({
      config: {
        addonRef: "cleanroomtemplate",
        addonName: "Cleanroom Template",
      },
      host,
      createStateStore() {
        return createMemoryStore();
      },
      listHostActions() {
        return [];
      },
      getEvidenceSummary() {
        return {
          available: true,
          status: "fresh",
          summary: `evidence-v${evidenceVersion}`,
          latestRuns: {
            e2e: `e2e-${evidenceVersion}`,
            monitor: `monitor-${evidenceVersion}`,
            gate: `gate-${evidenceVersion}`,
          },
          nextCommands: ["npm run agent:zotero:e2e"],
        };
      },
    });

    const first = await workbench.getSnapshot();
    assert.deepEqual(first.stale.stages, []);

    evidenceVersion = 2;
    const staleSnapshot = await workbench.getSnapshot();
    assert.ok(staleSnapshot.stale.stages.includes("evidence"));

    const refreshed = await workbench.refreshStep("evidence");
    assert.equal(refreshed.stale.stages.includes("evidence"), false);
  });

  it("should create annotations, map host actions deterministically, and fallback to manual investigation", async () => {
    const workbench = createAgentReviewWorkbench({
      config: {
        addonRef: "cleanroomtemplate",
        addonName: "Cleanroom Template",
      },
      host: {
        getMainWindow() {
          return {
            openDialog() {
              return createMockWorkbenchWindow();
            },
          };
        },
        resolveContentUrl(value) {
          return `chrome://cleanroomtemplate/${value}`;
        },
      },
      createStateStore() {
        return createMemoryStore();
      },
      listHostActions() {
        return [
          {
            id: "preferences.openPane",
            label: "Open Preference Pane",
            category: "preferences",
            executable: true,
            status: "ready",
            summary: "Open a preference pane.",
          },
        ];
      },
      collectAgentDiagnostics() {
        return {
          commandCount: 4,
          menuCount: 2,
          hostActionCount: 1,
          runtimeBridgeStatus: "healthy",
        };
      },
    });

    await workbench.getSnapshot();
    const withHostAnnotation = await workbench.createAnnotation({
      stage: "hostAction",
      targetPath: "catalog.actions[0]",
      content: "Re-run this host action after the next refresh.",
    });
    assert.equal(withHostAnnotation.annotations.length, 1);

    const hostPlan = await workbench.generatePlan({
      stage: "hostAction",
      annotationIds: [withHostAnnotation.annotations[0].id],
    });
    assert.equal(hostPlan.ok, true);
    assert.equal(hostPlan.plan.actions[0].action, "rerun-host-action");
    assert.ok(hostPlan.plan.validationCommands.includes("npm run agent:host:guard"));

    const manualAnnotation = await workbench.createAnnotation({
      stage: "route",
      targetPath: "misc.unknown-leaf",
      content: "This path is not mapped to a safe deterministic action.",
    });
    const openRouteAnnotation = manualAnnotation.annotations.find((entry) => {
      return entry.stage === "route" && entry.status === "open";
    });

    const manualPlan = await workbench.generatePlan({
      stage: "route",
      annotationIds: [openRouteAnnotation.id],
    });
    assert.equal(manualPlan.ok, true);
    assert.equal(manualPlan.plan.actions[0].action, "manual-investigation");

    const archived = await workbench.updateAnnotation(openRouteAnnotation.id, {
      status: "archived",
    });
    const archivedAnnotation = archived.annotations.find((entry) => entry.id === openRouteAnnotation.id);
    assert.equal(archivedAnnotation.status, "archived");

    const deleted = await workbench.updateAnnotation(openRouteAnnotation.id, {
      deleted: true,
    });
    assert.equal(deleted.annotations.some((entry) => entry.id === openRouteAnnotation.id), false);
  });

  it("should open a standalone window shell, reuse focus, and flush on close", async () => {
    const window = createMockWorkbenchWindow();
    let openCount = 0;
    let flushCount = 0;
    let openedHref = null;

    const workbench = createAgentReviewWorkbench({
      config: {
        addonRef: "cleanroomtemplate",
        addonName: "Cleanroom Template",
      },
      host: {
        getMainWindow() {
          return {
            openDialog(href) {
              openCount += 1;
              openedHref = href;
              return window;
            },
          };
        },
        resolveContentUrl(value) {
          return `file:///tmp/build/cleanroomtemplate/${value}`;
        },
      },
      createStateStore() {
        const store = createMemoryStore();
        return {
          ...store,
          async flush() {
            flushCount += 1;
            return await store.flush();
          },
        };
      },
      listHostActions() {
        return [];
      },
    });

    const first = await workbench.open();
    const second = await workbench.open();

    assert.equal(first.reused, false);
    assert.equal(second.reused, true);
    assert.equal(openCount, 1);
    assert.equal(openedHref, "chrome://cleanroomtemplate/content/lib/agent-review-workbench.xhtml");
    assert.ok(window.focusCount >= 2);

    workbench.close();
    assert.equal(window.closeCount, 1);
    assert.ok(flushCount >= 1);
  });

  it("should recover live window reuse and close after shell tracking is lost", async () => {
    const window = createMockWorkbenchWindow();
    let openCount = 0;
    let flushCount = 0;
    let disposeCount = 0;
    let windowExposed = false;
    const host = {
      getMainWindow() {
        return {
          openDialog() {
            openCount += 1;
            windowExposed = true;
            return window;
          },
        };
      },
      resolveContentUrl(value) {
        return `chrome://cleanroomtemplate/${value}`;
      },
      listWindowsByType() {
        return windowExposed && !window.closed ? [window] : [];
      },
    };

    const workbench = createAgentReviewWorkbench({
      config: {
        addonRef: "cleanroomtemplate",
        addonName: "Cleanroom Template",
      },
      host,
      createStateStore() {
        const store = createMemoryStore();
        return {
          ...store,
          async flush() {
            flushCount += 1;
            return await store.flush();
          },
          async dispose() {
            disposeCount += 1;
            return await store.dispose();
          },
        };
      },
      listHostActions() {
        return [];
      },
    });

    await workbench.open();
    window.dispatchEvent("unload");
    assert.equal(workbench.isOpen(), true);

    const recovered = await workbench.open();
    assert.equal(recovered.reused, true);
    assert.equal(openCount, 1);
    assert.ok(window.focusCount >= 2);

    window.dispatchEvent("unload");
    assert.equal(workbench.close(), true);
    assert.equal(window.closeCount, 1);
    assert.ok(flushCount >= 2);

    const shutdownWindow = createMockWorkbenchWindow();
    let shutdownWindowExposed = false;
    const shutdownHost = {
      ...host,
      getMainWindow() {
        return {
          openDialog() {
            shutdownWindowExposed = true;
            return shutdownWindow;
          },
        };
      },
      listWindowsByType() {
        return shutdownWindowExposed && !shutdownWindow.closed ? [shutdownWindow] : [];
      },
    };
    const shutdownWorkbench = createAgentReviewWorkbench({
      config: {
        addonRef: "cleanroomtemplate",
        addonName: "Cleanroom Template",
      },
      host: shutdownHost,
      createStateStore() {
        const store = createMemoryStore();
        return {
          ...store,
          async dispose() {
            disposeCount += 1;
            return await store.dispose();
          },
        };
      },
      listHostActions() {
        return [];
      },
    });
    await shutdownWorkbench.open();
    shutdownWindow.dispatchEvent("unload");
    await shutdownWorkbench.shutdown();
    assert.equal(shutdownWindow.closeCount, 1);
    assert.ok(disposeCount >= 1);
  });

  it("should return a non-throwing JSON result when the workbench window closes before ready", async () => {
    const window = createMockWorkbenchWindow({
      readyState: "loading",
    });
    const logs = [];
    const workbench = createAgentReviewWorkbench({
      config: {
        addonRef: "cleanroomtemplate",
        addonName: "Cleanroom Template",
      },
      logger: {
        debug(message, details) {
          logs.push({ level: "debug", message, details });
        },
        warn(message, details) {
          logs.push({ level: "warn", message, details });
        },
        error(message, details) {
          logs.push({ level: "error", message, details });
        },
      },
      host: {
        getMainWindow() {
          return {
            openDialog() {
              setTimeout(() => {
                window.close();
              }, 0);
              return window;
            },
          };
        },
        resolveContentUrl(value) {
          return `chrome://cleanroomtemplate/${value}`;
        },
      },
      createStateStore() {
        return createMemoryStore();
      },
      listHostActions() {
        return [];
      },
    });

    const result = await workbench.open();

    assert.equal(result.ok, false);
    assert.equal(result.reason, "window-closed-before-ready");
    assert.equal(result.ready, false);
    assert.equal(logs.some((entry) => entry.level === "error"), false);
  });
});
