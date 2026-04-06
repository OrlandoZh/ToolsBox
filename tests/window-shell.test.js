import { describe, it, assert } from "./test-framework.js";
import {
  createWindowShellManager,
  waitForWindowShellReady,
} from "../src/utils/window-shell.js";

function createEventTarget() {
  const listeners = new Map();

  return {
    addEventListener(type, listener) {
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent(type, event = {}) {
      const currentListeners = Array.from(listeners.get(type) || []);
      currentListeners.forEach((listener) => listener({
        type,
        target: this,
        currentTarget: this,
        ...event,
      }));
    },
  };
}

function createMockWindow({ href = "chrome://cleanroom/content/dialog.xhtml", readyState = "loading" } = {}) {
  const windowEvents = createEventTarget();
  const documentEvents = createEventTarget();

  const doc = {
    readyState,
    addEventListener: documentEvents.addEventListener,
    removeEventListener: documentEvents.removeEventListener,
    dispatchEvent(type, event = {}) {
      documentEvents.dispatchEvent(type, event);
    },
  };

  return {
    document: doc,
    location: { href },
    closed: false,
    focusCount: 0,
    closeCount: 0,
    addEventListener: windowEvents.addEventListener,
    removeEventListener: windowEvents.removeEventListener,
    dispatchEvent(type, event = {}) {
      windowEvents.dispatchEvent(type, event);
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
}

describe("Window Shell", () => {
  it("should wait for window readiness via readystatechange", async () => {
    const window = createMockWindow({
      readyState: "loading",
    });

    const readyPromise = waitForWindowShellReady(window);
    window.document.readyState = "complete";
    window.document.dispatchEvent("readystatechange");

    const resolvedWindow = await readyPromise;
    assert.equal(resolvedWindow, window);
  });

  it("should wait for explicit ready promise before mounting window content", async () => {
    const calls = [];
    const window = createMockWindow({
      readyState: "loading",
    });

    let resolveReady;
    const readyPromise = new Promise((resolve) => {
      resolveReady = resolve;
    });

    const manager = createWindowShellManager({
      openWindow() {
        return {
          window,
          readyPromise,
        };
      },
      async mountWindow({ reused }) {
        calls.push(`mount:${reused ? "reused" : "fresh"}`);
        return () => {
          calls.push("cleanup");
        };
      },
    });

    const opening = manager.open();
    assert.equal(manager.getSnapshot().hasPendingOpen, true);
    assert.deepEqual(calls, []);

    resolveReady();
    const result = await opening;

    assert.equal(result.window, window);
    assert.equal(result.reused, false);
    assert.equal(result.ready, true);
    assert.deepEqual(calls, ["mount:fresh"]);
  });

  it("should reuse and focus an already-open window shell", async () => {
    const window = createMockWindow({
      readyState: "complete",
    });

    let openCount = 0;
    const manager = createWindowShellManager({
      openWindow() {
        openCount += 1;
        return window;
      },
    });

    await manager.open();
    const reused = await manager.open();

    assert.equal(openCount, 1);
    assert.equal(reused.reused, true);
    assert.equal(manager.isOpen(), true);
    assert.ok(window.focusCount >= 2, "window focus should run on first open and reuse");
  });

  it("should refresh mounted content with cleanup when reusing a window", async () => {
    const calls = [];
    const window = createMockWindow({
      readyState: "complete",
    });

    const manager = createWindowShellManager({
      openWindow() {
        return window;
      },
      mountWindow({ reused, context }) {
        calls.push(`mount:${reused ? "reused" : "fresh"}:${context.mode}`);
        return () => {
          calls.push("cleanup");
        };
      },
    });

    await manager.open({ mode: "first" });
    await manager.refresh({ mode: "second" });

    assert.deepEqual(calls, [
      "mount:fresh:first",
      "cleanup",
      "mount:reused:second",
    ]);
  });

  it("should cleanup and close the active window shell", async () => {
    const calls = [];
    const window = createMockWindow({
      readyState: "complete",
    });

    const manager = createWindowShellManager({
      openWindow() {
        return window;
      },
      mountWindow() {
        calls.push("mount");
        return () => {
          calls.push("cleanup");
        };
      },
    });

    await manager.open();
    const closed = manager.close();

    assert.equal(closed, true);
    assert.equal(window.closeCount, 1);
    assert.equal(manager.isOpen(), false);
    assert.deepEqual(calls, ["mount", "cleanup"]);
  });
});
