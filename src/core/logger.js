const LEVEL_RANK = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export function createLogger({ hostLog, level }) {
  let currentLevel = LEVEL_RANK[level] ? level : "info";
  let threshold = LEVEL_RANK[currentLevel];

  function shouldLog(candidate) {
    const rank = LEVEL_RANK[candidate] ?? LEVEL_RANK.info;
    return rank >= threshold;
  }

  function emit(candidate, message, details = {}) {
    if (!shouldLog(candidate)) {
      return;
    }

    hostLog(`[cleanroom:${candidate}] ${message}`, details);
  }

  return {
    setLevel(nextLevel) {
      if (!LEVEL_RANK[nextLevel]) {
        return false;
      }
      currentLevel = nextLevel;
      threshold = LEVEL_RANK[nextLevel];
      return true;
    },
    getLevel() {
      return currentLevel;
    },
    debug(message, details) {
      emit("debug", message, details);
    },
    info(message, details) {
      emit("info", message, details);
    },
    warn(message, details) {
      emit("warn", message, details);
    },
    error(message, details) {
      emit("error", message, details);
    },
  };
}
