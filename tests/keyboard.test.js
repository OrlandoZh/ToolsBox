import { describe, it, assert } from "./test-framework.js";
import { createKeyboardManager } from "../src/core/keyboard.js";

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createFakeWindow() {
  const listeners = new Map();

  return {
    addEventListener(type, handler) {
      const next = listeners.get(type) || [];
      next.push(handler);
      listeners.set(type, next);
    },
    removeEventListener(type, handler) {
      const next = (listeners.get(type) || []).filter((item) => item !== handler);
      listeners.set(type, next);
    },
    getListenerCount(type = "keydown") {
      return (listeners.get(type) || []).length;
    },
    dispatchKeydown(overrides = {}) {
      const event = {
        key: "",
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        metaKey: false,
        defaultPrevented: false,
        propagationStopped: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
        stopPropagation() {
          this.propagationStopped = true;
        },
        ...overrides,
      };
      for (const handler of (listeners.get("keydown") || []).slice()) {
        handler(event);
      }
      return event;
    },
  };
}

function createKeyboardHarness() {
  return createKeyboardManager({
    logger: {
      debug() {},
      warn() {},
      error() {},
    },
    lifecycle: null,
    services: {
      appinfo: {
        OS: "Linux",
      },
    },
  });
}

describe("Keyboard Manager", () => {
  it("should register immediate shortcuts and expose active shortcut snapshots", () => {
    const keyboard = createKeyboardHarness();
    const targetWindow = createFakeWindow();
    let invocationCount = 0;

    const shortcutId = keyboard.registerShortcut({
      id: "main-shortcut",
      shortcut: "Ctrl+Shift+Y",
      description: "Main demo shortcut",
      window: targetWindow,
      handler() {
        invocationCount += 1;
      },
    });

    assert.equal(shortcutId, "main-shortcut");
    assert.equal(targetWindow.getListenerCount(), 1);

    const event = targetWindow.dispatchKeydown({
      key: "Y",
      ctrlKey: true,
      shiftKey: true,
    });

    assert.equal(invocationCount, 1);
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.propagationStopped, false);
    assert.deepEqual(keyboard.getShortcutState("main-shortcut"), {
      id: "main-shortcut",
      description: "Main demo shortcut",
      key: "Y",
      modifiers: {
        ctrl: true,
        alt: false,
        shift: true,
        meta: false,
      },
      state: "active",
      bindingMode: "immediate",
      windowBound: true,
      errorMessage: null,
    });
  });

  it("should bind deferred shortcuts only after the ready signal resolves", async () => {
    const keyboard = createKeyboardHarness();
    const ready = createDeferred();
    const targetWindow = createFakeWindow();
    let invocationCount = 0;

    const shortcutId = keyboard.registerDeferredShortcut({
      id: "reader-ready-shortcut",
      shortcut: "Ctrl+Shift+R",
      description: "Reader ready shortcut",
      ready: () => ready.promise,
      resolveWindow: () => targetWindow,
      handler() {
        invocationCount += 1;
      },
    });

    assert.equal(shortcutId, "reader-ready-shortcut");
    assert.equal(keyboard.getShortcutState(shortcutId).state, "pending");
    assert.equal(targetWindow.getListenerCount(), 0);

    ready.resolve();
    const bindingState = await keyboard.waitForShortcutBinding(shortcutId);

    assert.equal(bindingState.state, "active");
    assert.equal(bindingState.bindingMode, "deferred");
    assert.equal(targetWindow.getListenerCount(), 1);

    targetWindow.dispatchKeydown({
      key: "R",
      ctrlKey: true,
      shiftKey: true,
    });
    assert.equal(invocationCount, 1);
  });

  it("should cancel pending deferred shortcuts and report failed deferred bindings", async () => {
    const keyboard = createKeyboardHarness();
    const ready = createDeferred();
    const targetWindow = createFakeWindow();

    const cancelledId = keyboard.registerDeferredShortcut({
      id: "cancelled-shortcut",
      shortcut: "Ctrl+Shift+K",
      ready: () => ready.promise,
      resolveWindow: () => targetWindow,
      handler() {},
    });

    assert.equal(keyboard.unregister(cancelledId), true);
    ready.resolve();
    assert.equal(await keyboard.waitForShortcutBinding(cancelledId), null);
    assert.equal(targetWindow.getListenerCount(), 0);

    const failedId = keyboard.registerDeferredShortcut({
      id: "failed-shortcut",
      shortcut: "Ctrl+Shift+F",
      ready: Promise.resolve(),
      resolveWindow() {
        throw new Error("window missing");
      },
      handler() {},
    });

    const failedState = await keyboard.waitForShortcutBinding(failedId);
    assert.deepEqual(failedState, {
      id: "failed-shortcut",
      description: "",
      key: "F",
      modifiers: {
        ctrl: true,
        alt: false,
        shift: true,
        meta: false,
      },
      state: "failed",
      bindingMode: "deferred",
      windowBound: false,
      errorMessage: "window missing",
    });
  });
});
