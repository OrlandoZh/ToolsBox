function sortSnapshotValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sortSnapshotValue(item));
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .reduce((result, key) => {
        const normalized = sortSnapshotValue(value[key]);
        if (normalized !== undefined) {
          result[key] = normalized;
        }
        return result;
      }, {});
  }
  return value;
}

function normalizeString(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeNumber(value, fallback = null) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function normalizeBoolean(value) {
  return typeof value === "boolean" ? value : null;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(new Set(
    value
      .map((entry) => normalizeString(entry))
      .filter(Boolean),
  )).sort((left, right) => left.localeCompare(right));
}

function formatBooleanLabel(value) {
  if (value === true) {
    return "true";
  }
  if (value === false) {
    return "false";
  }
  return "-";
}

export function normalizeVisualStageSettleSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return null;
  }

  const stage = normalizeString(snapshot.stage) || "visual";
  if (stage === "library") {
    return {
      stage,
      itemID: normalizeNumber(snapshot.itemID),
      title: normalizeString(snapshot.title),
      summary: normalizeString(snapshot.summary),
      columnValue: normalizeString(snapshot.columnValue),
      selectedCount: Math.max(0, normalizeNumber(snapshot.selectedCount, 0)),
      selectedIDs: Array.isArray(snapshot.selectedIDs)
        ? snapshot.selectedIDs
          .map((item) => normalizeNumber(item))
          .filter((item) => item !== null)
        : [],
      visibleBannerIDs: normalizeStringArray(snapshot.visibleBannerIDs),
    };
  }

  if (stage === "reader") {
    return {
      stage,
      itemID: normalizeNumber(snapshot.itemID),
      tabID: normalizeString(snapshot.tabID),
      type: normalizeString(snapshot.type),
      annotationCount: Math.max(0, normalizeNumber(snapshot.annotationCount, 0)),
      selectedAnnotationCount: Math.max(0, normalizeNumber(snapshot.selectedAnnotationCount, 0)),
      annotationDetailCount: Math.max(0, normalizeNumber(snapshot.annotationDetailCount, 0)),
      active: normalizeBoolean(snapshot.active),
      hasMatchingWindowState: normalizeBoolean(snapshot.hasMatchingWindowState),
      matchingWindowStateCount: Math.max(0, normalizeNumber(snapshot.matchingWindowStateCount, 0)),
      sidebarView: normalizeString(snapshot.sidebarView),
      flowMode: normalizeString(snapshot.flowMode),
      splitType: normalizeString(snapshot.splitType),
      scrollMode: normalizeString(snapshot.scrollMode),
      spreadMode: normalizeString(snapshot.spreadMode),
      scale: normalizeString(snapshot.scale),
      contextPaneOpen: normalizeBoolean(snapshot.contextPaneOpen),
      hasSecondViewState: normalizeBoolean(snapshot.hasSecondViewState),
    };
  }

  return sortSnapshotValue(snapshot);
}

export function buildVisualStageSettleSnapshotKey(snapshot) {
  const normalized = normalizeVisualStageSettleSnapshot(snapshot);
  return normalized ? JSON.stringify(sortSnapshotValue(normalized)) : "";
}

export function summarizeVisualStageSettleSnapshot(snapshot) {
  const normalized = normalizeVisualStageSettleSnapshot(snapshot);
  if (!normalized) {
    return null;
  }

  if (normalized.stage === "library") {
    return [
      `item#${normalized.itemID ?? "-"}`,
      `selected ${normalized.selectedCount ?? 0}`,
      normalized.title || "-",
      `banners ${(normalized.visibleBannerIDs || []).join(",") || "-"}`,
    ].join(" / ");
  }

  if (normalized.stage === "reader") {
    return [
      `item#${normalized.itemID ?? "-"}`,
      `tab ${normalized.tabID || "-"}`,
      `ann ${normalized.annotationCount ?? 0}`,
      `active ${formatBooleanLabel(normalized.active)}`,
      `window ${formatBooleanLabel(normalized.hasMatchingWindowState)}`,
      `sidebar ${normalized.sidebarView || "-"}`,
    ].join(" / ");
  }

  return JSON.stringify(normalized);
}

export function isVisualStageSettleSnapshotReady(snapshot) {
  const normalized = normalizeVisualStageSettleSnapshot(snapshot);
  if (!normalized) {
    return false;
  }

  if (normalized.stage === "library") {
    return Number.isFinite(normalized.itemID)
      && normalized.selectedCount > 0
      && normalized.selectedIDs.length > 0;
  }

  if (normalized.stage === "reader") {
    return Number.isFinite(normalized.itemID)
      && Boolean(normalized.tabID)
      && normalized.active === true
      && normalized.hasMatchingWindowState === true;
  }

  return true;
}

export function buildVisualStageSettleSummary(result) {
  const stage = normalizeString(result?.stage) || "visual";
  const stableSampleTarget = Math.max(1, normalizeNumber(result?.stableSampleTarget, 1));
  const consecutiveStableSamples = Math.max(0, normalizeNumber(result?.consecutiveStableSamples, 0));
  const pollCount = Math.max(0, normalizeNumber(result?.pollCount, 0));
  const resetCount = Math.max(0, normalizeNumber(result?.resetCount, 0));
  const snapshotSummary = normalizeString(result?.snapshotSummary) || "-";
  const verificationMatched = normalizeBoolean(result?.verificationMatched);

  const status = result?.settled === true
    ? "达成"
    : (result?.timedOut === true ? "超时" : "待定");
  const parts = [
    `${stage} ${status}`,
    `${consecutiveStableSamples}/${stableSampleTarget}`,
    `轮询 ${pollCount} 次`,
  ];
  if (resetCount > 0) {
    parts.push(`重置 ${resetCount} 次`);
  }
  if (verificationMatched === true) {
    parts.push("最终复核一致");
  } else if (verificationMatched === false) {
    parts.push("最终复核变更");
  }
  if (result?.timedOut === true) {
    parts.push(`快照 ${snapshotSummary}`);
  }
  return parts.join("，");
}

export async function waitForVisualStageSettled(options = {}) {
  const stage = normalizeString(options.stage) || "visual";
  const stableSampleTarget = Math.max(1, normalizeNumber(options.stableSampleTarget, 2));
  const maxPolls = Math.max(stableSampleTarget, normalizeNumber(options.maxPolls, stableSampleTarget));
  const intervalMs = Math.max(0, normalizeNumber(options.intervalMs, 0));
  const sample = options.sample;
  const verify = typeof options.verify === "function" ? options.verify : null;
  const sleep = typeof options.sleep === "function"
    ? options.sleep
    : ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  if (typeof sample !== "function") {
    throw new Error("waitForVisualStageSettled requires a sample function");
  }

  let pollCount = 0;
  let resetCount = 0;
  let consecutiveStableSamples = 0;
  let lastSnapshotKey = "";
  let lastSnapshot = null;
  let lastState = null;
  let verificationMatched = null;

  while (pollCount < maxPolls) {
    const sampledState = await sample({
      stage,
      pollIndex: pollCount + 1,
      stableSampleTarget,
      consecutiveStableSamples,
    });
    pollCount += 1;

    const snapshot = normalizeVisualStageSettleSnapshot(sampledState?.settleSnapshot);
    const snapshotKey = buildVisualStageSettleSnapshotKey(snapshot);
    const snapshotReady = isVisualStageSettleSnapshotReady(snapshot);
    lastState = sampledState || null;
    lastSnapshot = snapshot;

    if (!snapshotKey || !snapshotReady) {
      if (lastSnapshotKey) {
        resetCount += 1;
      }
      consecutiveStableSamples = 0;
      lastSnapshotKey = "";
      if (pollCount < maxPolls && intervalMs > 0) {
        await sleep(intervalMs);
      }
      continue;
    }

    if (snapshotKey === lastSnapshotKey) {
      consecutiveStableSamples += 1;
    } else {
      if (lastSnapshotKey) {
        resetCount += 1;
      }
      lastSnapshotKey = snapshotKey;
      consecutiveStableSamples = 1;
    }

    if (consecutiveStableSamples >= stableSampleTarget) {
      if (verify) {
        const verifiedState = await verify({
          stage,
          pollCount,
          state: lastState,
          snapshot,
          snapshotKey,
          stableSampleTarget,
          consecutiveStableSamples,
        });
        pollCount += 1;

        const verifiedSnapshot = normalizeVisualStageSettleSnapshot(verifiedState?.settleSnapshot);
        const verifiedSnapshotKey = buildVisualStageSettleSnapshotKey(verifiedSnapshot);
        lastState = verifiedState || null;
        lastSnapshot = verifiedSnapshot;

        if (verifiedSnapshotKey && verifiedSnapshotKey === snapshotKey) {
          verificationMatched = true;
          return {
            stage,
            settled: true,
            timedOut: false,
            pollCount,
            resetCount,
            stableSampleTarget,
            consecutiveStableSamples,
            verificationMatched,
            snapshot: lastSnapshot,
            snapshotSummary: summarizeVisualStageSettleSnapshot(lastSnapshot),
            state: lastState,
            summary: buildVisualStageSettleSummary({
              stage,
              settled: true,
              timedOut: false,
              pollCount,
              resetCount,
              stableSampleTarget,
              consecutiveStableSamples,
              verificationMatched,
              snapshotSummary: summarizeVisualStageSettleSnapshot(lastSnapshot),
            }),
          };
        }

        verificationMatched = false;
        resetCount += 1;
        lastSnapshotKey = verifiedSnapshotKey;
        consecutiveStableSamples = verifiedSnapshotKey ? 1 : 0;

        if (pollCount >= maxPolls) {
          break;
        }
        if (intervalMs > 0) {
          await sleep(intervalMs);
        }
        continue;
      }

      verificationMatched = null;
      return {
        stage,
        settled: true,
        timedOut: false,
        pollCount,
        resetCount,
        stableSampleTarget,
        consecutiveStableSamples,
        verificationMatched,
        snapshot: lastSnapshot,
        snapshotSummary: summarizeVisualStageSettleSnapshot(lastSnapshot),
        state: lastState,
        summary: buildVisualStageSettleSummary({
          stage,
          settled: true,
          timedOut: false,
          pollCount,
          resetCount,
          stableSampleTarget,
          consecutiveStableSamples,
          verificationMatched,
          snapshotSummary: summarizeVisualStageSettleSnapshot(lastSnapshot),
        }),
      };
    }

    if (pollCount < maxPolls && intervalMs > 0) {
      await sleep(intervalMs);
    }
  }

  return {
    stage,
    settled: false,
    timedOut: true,
    pollCount,
    resetCount,
    stableSampleTarget,
    consecutiveStableSamples,
    verificationMatched,
    snapshot: lastSnapshot,
    snapshotSummary: summarizeVisualStageSettleSnapshot(lastSnapshot),
    state: lastState,
    summary: buildVisualStageSettleSummary({
      stage,
      settled: false,
      timedOut: true,
      pollCount,
      resetCount,
      stableSampleTarget,
      consecutiveStableSamples,
      verificationMatched,
      snapshotSummary: summarizeVisualStageSettleSnapshot(lastSnapshot),
    }),
  };
}
