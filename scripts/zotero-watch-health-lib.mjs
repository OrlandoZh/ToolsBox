const DEFAULT_WATCH_BASELINE_SETTLE_TIMEOUT_MS = 4000;
const DEFAULT_WATCH_BASELINE_SETTLE_POLL_INTERVAL_MS = 200;

const WATCH_BASELINE_REGISTRATION_ISSUES = Object.freeze([
  "偏好设置面板未注册。",
  "ItemPane Section 未注册。",
  "ItemPane InfoRow 未注册。",
  "ItemTree 自定义列未注册。",
]);

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeTrigger(trigger) {
  switch (String(trigger || "").trim()) {
    case "startup":
      return "启动完成";
    case "watch-change":
      return "热重载完成";
    case "runtime-recovery":
      return "runtime 恢复完成";
    case "session-restart-recovery":
      return "Zotero 会话重启恢复完成";
    default:
      return "当前流程完成";
  }
}

export function normalizeWatchBaselineSnapshot(source = {}) {
  const record = source && typeof source === "object" ? source : {};
  return {
    preferencePaneRegistered: Boolean(record.preferencePaneRegistered),
    itemPaneSections: toFiniteNumber(record.itemPaneSections),
    itemPaneInfoRows: toFiniteNumber(record.itemPaneInfoRows),
    itemTreeColumns: toFiniteNumber(record.itemTreeColumns),
    workflowContractVersion: toFiniteNumber(record.workflowContractVersion),
    workflowItemPaneSectionRegistered: Boolean(record.workflowItemPaneSectionRegistered),
  };
}

export function isWatchBaselineSettled(source = {}) {
  const snapshot = normalizeWatchBaselineSnapshot(source);
  if (snapshot.workflowContractVersion >= 1) {
    return (
      snapshot.preferencePaneRegistered
      && snapshot.itemPaneSections >= 1
      && snapshot.workflowItemPaneSectionRegistered
      && snapshot.itemTreeColumns >= 1
    );
  }
  return (
    snapshot.preferencePaneRegistered
    && snapshot.itemPaneSections >= 1
    && snapshot.itemPaneInfoRows >= 1
    && snapshot.itemTreeColumns >= 1
  );
}

export function hasWatchBaselineRegistrationIssues(issues) {
  const list = Array.isArray(issues) ? issues : [];
  return WATCH_BASELINE_REGISTRATION_ISSUES.some((issue) => list.includes(issue));
}

export async function readWatchBaselineSnapshot({ rdp, config }) {
  const raw = await rdp.evaluateInChrome(`(() => {
    const plugin = Zotero[${JSON.stringify(config.instanceKey)}];
    const selfCheck = typeof plugin?.api?.runAgentSelfCheck === "function"
      ? plugin.api.runAgentSelfCheck()
      : null;
    return JSON.stringify({
      preferencePaneRegistered: Boolean(selfCheck?.preferencePaneRegistered),
      itemPaneSections: Number(selfCheck?.itemPaneSections || 0),
      itemPaneInfoRows: Number(selfCheck?.itemPaneInfoRows || 0),
      itemTreeColumns: Number(selfCheck?.itemTreeColumns || 0),
      workflowContractVersion: Number(selfCheck?.workflowContractVersion || 0),
      workflowItemPaneSectionRegistered: Boolean(selfCheck?.workflowItemPaneSectionRegistered),
    });
  })()`);
  return normalizeWatchBaselineSnapshot(JSON.parse(raw));
}

export async function waitForWatchBaselineSettled({
  readSnapshot,
  timeoutMs = DEFAULT_WATCH_BASELINE_SETTLE_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_WATCH_BASELINE_SETTLE_POLL_INTERVAL_MS,
  now = () => Date.now(),
  sleepFn = sleep,
}) {
  if (typeof readSnapshot !== "function") {
    throw new TypeError("readSnapshot must be a function");
  }

  const safeTimeoutMs = Math.max(0, toFiniteNumber(timeoutMs));
  const safePollIntervalMs = Math.max(1, toFiniteNumber(pollIntervalMs) || DEFAULT_WATCH_BASELINE_SETTLE_POLL_INTERVAL_MS);
  const deadline = now() + safeTimeoutMs;
  let attemptCount = 0;
  let lastSnapshot = normalizeWatchBaselineSnapshot();

  while (true) {
    attemptCount += 1;
    lastSnapshot = normalizeWatchBaselineSnapshot(await readSnapshot());
    if (isWatchBaselineSettled(lastSnapshot)) {
      return {
        settled: true,
        timedOut: false,
        attemptCount,
        snapshot: lastSnapshot,
      };
    }

    if (now() >= deadline) {
      return {
        settled: false,
        timedOut: true,
        attemptCount,
        snapshot: lastSnapshot,
      };
    }

    await sleepFn(safePollIntervalMs);
  }
}

export function buildWatchHealthSummaryNote({
  trigger,
  passed,
  baselineSettled,
  baselineRegistrationBlocking = false,
  successSummaryNote = null,
}) {
  const completion = describeTrigger(trigger);
  if (passed) {
    return successSummaryNote || `${completion}并通过健康检查`;
  }
  if (baselineSettled === false && baselineRegistrationBlocking) {
    return `${completion}，但基线注册未在健康窗口内收敛`;
  }
  return `${completion}，但健康检查未通过`;
}

export {
  DEFAULT_WATCH_BASELINE_SETTLE_POLL_INTERVAL_MS,
  DEFAULT_WATCH_BASELINE_SETTLE_TIMEOUT_MS,
  WATCH_BASELINE_REGISTRATION_ISSUES,
};
