export function createWindowRuntime({ windows }) {
  let phase = "idle";

  function isRunning() {
    return phase === "running";
  }

  function canStart() {
    return phase !== "running" && phase !== "starting";
  }

  function canStop() {
    return phase !== "idle" && phase !== "stopping";
  }

  function markStarting() {
    phase = "starting";
  }

  function markRunning() {
    phase = "running";
  }

  function markStopping() {
    phase = "stopping";
  }

  function markIdle() {
    phase = "idle";
  }

  function onWindowLoad(window) {
    if (!isRunning()) {
      return;
    }
    windows.onLoad(window);
  }

  function onWindowUnload(window) {
    windows.onUnload(window);
  }

  function resetWindows() {
    windows.reset();
  }

  return {
    canStart,
    canStop,
    markStarting,
    markRunning,
    markStopping,
    markIdle,
    isRunning,
    onWindowLoad,
    onWindowUnload,
    resetWindows,
    getPhase() {
      return phase;
    },
  };
}
