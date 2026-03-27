export function createLifecycleManager({ logger }) {
  const cleanups = [];

  function trackCleanup(fn) {
    cleanups.push(fn);
  }

  function reset() {
    while (cleanups.length > 0) {
      const cleanup = cleanups.pop();
      try {
        cleanup();
      } catch (error) {
        logger.error("cleanup.failed", {
          message: String(error?.message || error),
        });
      }
    }
  }

  return {
    trackCleanup,
    reset,
  };
}
