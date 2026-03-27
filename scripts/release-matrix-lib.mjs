function toISODate(dateLike) {
  if (!dateLike) {
    return null;
  }
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function normalizeBoolean(value) {
  return value === true;
}

function normalizeString(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeRuntimeErrorClassEntries(entries = []) {
  return (Array.isArray(entries) ? entries : [])
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      id: normalizeString(item.id) || "runtime-error",
      label: normalizeString(item.label) || "运行时错误",
      classification: normalizeString(item.classification) || "blocking",
      category: normalizeString(item.category) || "unknown",
      count: Math.max(0, Number(item.count || 0)),
      messages: Array.isArray(item.messages)
        ? item.messages.map((message) => String(message || "").trim()).filter(Boolean).slice(0, 3)
        : [],
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => {
      const blockingDiff = Number(a.classification === "blocking") - Number(b.classification === "blocking");
      if (blockingDiff !== 0) {
        return -blockingDiff;
      }
      const countDiff = Number(b.count || 0) - Number(a.count || 0);
      if (countDiff !== 0) {
        return countDiff;
      }
      return String(a.label || a.id || "").localeCompare(String(b.label || b.id || ""));
    });
}

function summarizeRuntimeErrorClasses(entries = []) {
  const runtimeErrorClasses = normalizeRuntimeErrorClassEntries(entries);
  const blockingRuntimeErrors = runtimeErrorClasses.filter((item) => item.classification === "blocking");
  const hostNoiseRuntimeErrors = runtimeErrorClasses.filter((item) => item.classification === "host-noise");

  return {
    runtimeErrorClasses,
    blockingRuntimeErrorCount: blockingRuntimeErrors.reduce((sum, item) => sum + Number(item.count || 0), 0),
    hostNoiseErrorCount: hostNoiseRuntimeErrors.reduce((sum, item) => sum + Number(item.count || 0), 0),
    pluginRuntimeErrorCount: runtimeErrorClasses
      .filter((item) => item.category === "plugin")
      .reduce((sum, item) => sum + Number(item.count || 0), 0),
    resourceRuntimeErrorCount: runtimeErrorClasses
      .filter((item) => item.category === "resource")
      .reduce((sum, item) => sum + Number(item.count || 0), 0),
    blockingRuntimeErrors,
    hostNoiseRuntimeErrors,
  };
}

function mergeRuntimeErrorClassEntries(entries = []) {
  const classMap = new Map();

  (Array.isArray(entries) ? entries : [])
    .filter((item) => item && typeof item === "object")
    .forEach((item) => {
      const id = normalizeString(item.id) || "runtime-error";
      const label = normalizeString(item.label) || "运行时错误";
      const classification = normalizeString(item.classification) || "blocking";
      const category = normalizeString(item.category) || "unknown";
      const key = `${id}::${classification}::${category}`;

      if (!classMap.has(key)) {
        classMap.set(key, {
          id,
          label,
          classification,
          category,
          count: 0,
          messages: [],
        });
      }

      const target = classMap.get(key);
      target.count += Math.max(0, Number(item.count || 0));

      const messages = Array.isArray(item.messages)
        ? item.messages.map((message) => String(message || "").trim()).filter(Boolean)
        : [];
      messages.forEach((message) => {
        if (target.messages.length < 3 && !target.messages.includes(message)) {
          target.messages.push(message);
        }
      });
    });

  return summarizeRuntimeErrorClasses(Array.from(classMap.values()));
}

function matchHostNoiseRule(message) {
  const normalized = String(message || "").toLowerCase();
  if (normalized.includes("resource://services-settings/remote-settings.sys.mjs")) {
    return {
      id: "host-noise-remote-settings-resource",
      label: "宿主噪声：remote-settings 资源缺失",
      classification: "host-noise",
      category: "resource",
    };
  }
  if (normalized.includes("chrome://zotero/skin/16/white/loading.svg")) {
    return {
      id: "host-noise-loading-svg",
      label: "宿主噪声：loading.svg 资源缺失",
      classification: "host-noise",
      category: "resource",
    };
  }
  return null;
}

function classifyRuntimeErrorMessage(message) {
  const normalizedMessage = String(message || "").trim().toLowerCase();
  const hostNoiseRule = matchHostNoiseRule(normalizedMessage);
  if (hostNoiseRule) {
    return hostNoiseRule;
  }

  const looksResourceError = (
    normalizedMessage.includes("missing chrome or resource url")
    || normalizedMessage.includes("failed to load resource://")
    || normalizedMessage.includes("chrome://")
    || normalizedMessage.includes("resource://")
  );
  const looksPluginError = (
    normalizedMessage.includes("cleanroom")
    || normalizedMessage.includes("bootstrapplugin")
    || normalizedMessage.includes("instancekey")
    || normalizedMessage.includes("addon")
  );

  if (looksResourceError && looksPluginError) {
    return {
      id: "plugin-resource-runtime-error",
      label: "插件资源加载错误",
      classification: "blocking",
      category: "resource",
    };
  }

  if (looksResourceError) {
    return {
      id: "resource-runtime-error",
      label: "资源加载错误",
      classification: "blocking",
      category: "resource",
    };
  }

  if (looksPluginError) {
    return {
      id: "plugin-runtime-error",
      label: "插件运行时错误",
      classification: "blocking",
      category: "plugin",
    };
  }

  return {
    id: "unclassified-runtime-error",
    label: "未分类运行时错误",
    classification: "blocking",
    category: "unknown",
  };
}

function collectFallbackRuntimeErrorMessages(fallbackLines = []) {
  const messages = [];
  const seenKeys = new Set();

  (Array.isArray(fallbackLines) ? fallbackLines : [])
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .forEach((line) => {
      const cleaned = line.replace(/^\[(stderr|stdout)\]\s*/iu, "").trim();
      const normalized = cleaned.toLowerCase();
      const looksErrorLike = (
        normalized.includes("javascript error:")
        || normalized.includes("missing chrome or resource url")
        || normalized.includes("failed to load resource://")
        || normalized.includes("error:")
      );

      if (!looksErrorLike) {
        return;
      }

      const rule = classifyRuntimeErrorMessage(cleaned);
      const key = `${rule.id}::${rule.classification}::${rule.category}`;
      if (seenKeys.has(key)) {
        return;
      }

      seenKeys.add(key);
      messages.push(cleaned);
    });

  return messages;
}

export function classifyReleaseInstallSmokeRuntimeErrors(runtimeLogs = null, fallbackLines = []) {
  const recentErrors = Array.isArray(runtimeLogs?.recentErrors) ? runtimeLogs.recentErrors : [];
  const fallbackMessages = recentErrors.length === 0
    ? collectFallbackRuntimeErrorMessages(fallbackLines)
    : [];
  const errorEntries = recentErrors.length > 0
    ? recentErrors
    : fallbackMessages.map((message) => ({ message }));
  const usedFallbackMessages = recentErrors.length === 0 && fallbackMessages.length > 0;
  const classMap = new Map();

  const pushClassifiedError = ({ id, label, classification, category, message }) => {
    const key = `${id}::${classification}::${category}`;
    if (!classMap.has(key)) {
      classMap.set(key, {
        id,
        label,
        classification,
        category,
        count: 0,
        messages: [],
      });
    }
    const entry = classMap.get(key);
    entry.count += 1;
    if (message && entry.messages.length < 3 && !entry.messages.includes(message)) {
      entry.messages.push(message);
    }
  };

  errorEntries.forEach((entry) => {
    const message = String(entry?.message || "").trim();
    pushClassifiedError({
      ...classifyRuntimeErrorMessage(message),
      message,
    });
  });

  const recentErrorCount = errorEntries.length;
  const totalErrorCount = Math.max(0, Number(runtimeLogs?.errorCount || 0));
  if (totalErrorCount > recentErrorCount) {
    const remaining = Math.max(0, totalErrorCount - recentErrorCount);
    if (usedFallbackMessages && classMap.size > 0) {
      const [firstKey] = classMap.keys();
      const firstEntry = classMap.get(firstKey);
      if (firstEntry) {
        firstEntry.count += remaining;
      }
    } else {
      pushClassifiedError({
        id: "unclassified-runtime-error",
        label: "未展开的运行时错误",
        classification: "blocking",
        category: "unknown",
        message: null,
      });
      const pendingKey = "unclassified-runtime-error::blocking::unknown";
      const pending = classMap.get(pendingKey);
      if (pending) {
        pending.count += Math.max(0, remaining - 1);
      }
    }
  }

  return summarizeRuntimeErrorClasses(Array.from(classMap.values()));
}

export function formatReleaseRuntimeErrorPortrait(entries = [], fallback = "-") {
  const list = (Array.isArray(entries) ? entries : [])
    .filter((item) => item && typeof item === "object" && Number(item.count || 0) > 0)
    .slice(0, 3)
    .map((item) => `${item.label || item.id || "运行时错误"} x${Number(item.count || 0)}`);
  return list.length > 0 ? list.join("；") : fallback;
}

function createCheck(id, label, passed, detail = null) {
  return {
    id,
    label,
    passed: normalizeBoolean(passed),
    detail: normalizeString(detail),
  };
}

function pickFirstIssue(checks) {
  return (Array.isArray(checks) ? checks : [])
    .find((item) => item?.passed === false)?.detail || null;
}

function normalizeInstallSmokeRuns(report) {
  if (!report || typeof report !== "object") {
    return [];
  }

  const runs = Array.isArray(report.runs)
    ? report.runs
    : [report];

  return runs
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const channel = normalizeString(item.channel || item.profileId);
      const generatedAt = toISODate(item.generatedAt);
      const classifiedRuntimeErrors = Array.isArray(item.runtimeErrorClasses)
        ? summarizeRuntimeErrorClasses(item.runtimeErrorClasses)
        : classifyReleaseInstallSmokeRuntimeErrors(item.runtimeLogs, item.processLogTail);
      const blockingRuntimeErrorPortrait = formatReleaseRuntimeErrorPortrait(
        classifiedRuntimeErrors.blockingRuntimeErrors,
      );
      const hostNoiseRuntimeErrorPortrait = formatReleaseRuntimeErrorPortrait(
        classifiedRuntimeErrors.hostNoiseRuntimeErrors,
      );
      return {
        channel,
        generatedAt,
        passed: item.passed === true,
        status: normalizeString(item.status) || (item.passed === true ? "passed" : "failed"),
        statusLabel: normalizeString(item.statusLabel) || (item.passed === true ? "通过" : "失败"),
        durationMs: Number(item.durationMs || 0),
        readinessMode: normalizeString(item.readinessMode),
        installMethod: normalizeString(item.installMethod),
        zoteroChannel: normalizeString(item.zoteroChannel || item.channel),
        issues: Array.isArray(item.issues)
          ? item.issues.map((issue) => String(issue || "").trim()).filter(Boolean)
          : [],
        note: normalizeString(item.note),
        runtimeErrorClasses: classifiedRuntimeErrors.runtimeErrorClasses,
        blockingRuntimeErrorCount: classifiedRuntimeErrors.blockingRuntimeErrorCount,
        hostNoiseErrorCount: classifiedRuntimeErrors.hostNoiseErrorCount,
        pluginRuntimeErrorCount: classifiedRuntimeErrors.pluginRuntimeErrorCount,
        resourceRuntimeErrorCount: classifiedRuntimeErrors.resourceRuntimeErrorCount,
        blockingRuntimeErrors: classifiedRuntimeErrors.blockingRuntimeErrors,
        hostNoiseRuntimeErrors: classifiedRuntimeErrors.hostNoiseRuntimeErrors,
        blockingRuntimeErrorPortrait,
        hostNoiseRuntimeErrorPortrait,
      };
    })
    .sort((a, b) => String(b.generatedAt || "").localeCompare(String(a.generatedAt || "")));
}

function pickInstallSmokeRun(runs, profileId) {
  const normalizedProfileId = normalizeString(profileId);
  if (!normalizedProfileId) {
    return null;
  }

  return (Array.isArray(runs) ? runs : []).find((item) => item.channel === normalizedProfileId) || null;
}

function buildDefaultProfiles() {
  return [
    {
      id: "stable",
      label: "稳定版",
      zoteroChannel: "stable",
    },
    {
      id: "beta",
      label: "Beta 版",
      zoteroChannel: "beta",
    },
  ];
}

function buildArtifactChecks({
  config,
  buildReport,
  releaseManifest,
  updateManifest,
  preflightReport,
  xpiName,
  xpiPath,
  xpiExists,
  xpiSHA256Actual,
  xpiSizeBytesActual,
}) {
  const updateEntry = updateManifest?.addons?.[config.addonId]?.updates?.[0] || null;
  return [
    createCheck(
      "build-report-present",
      "构建报告存在",
      Boolean(buildReport),
      buildReport ? "已发现 build-report.json" : "缺少 build-report.json",
    ),
    createCheck(
      "release-manifest-present",
      "发布清单存在",
      Boolean(releaseManifest),
      releaseManifest ? "已发现 release-manifest.json" : "缺少 release-manifest.json",
    ),
    createCheck(
      "update-manifest-present",
      "更新清单存在",
      Boolean(updateManifest),
      updateManifest ? "已发现 update.json" : "缺少 update.json",
    ),
    createCheck(
      "release-preflight-present",
      "预检报告存在",
      Boolean(preflightReport),
      preflightReport ? "已发现 release-preflight.json" : "缺少 release-preflight.json",
    ),
    createCheck(
      "xpi-present",
      "XPI 包存在",
      xpiExists,
      xpiExists ? `已发现 ${xpiName}` : `缺少 ${xpiName}`,
    ),
    createCheck(
      "build-version-match",
      "构建报告版本一致",
      buildReport?.addonVersion === config.addonVersion,
      `build-report 版本 ${buildReport?.addonVersion || "-"} / 配置版本 ${config.addonVersion}`,
    ),
    createCheck(
      "manifest-addon-match",
      "发布清单 Add-on 信息一致",
      releaseManifest?.addonId === config.addonId
        && releaseManifest?.addonRef === config.addonRef
        && releaseManifest?.addonVersion === config.addonVersion,
      `manifest: ${releaseManifest?.addonId || "-"} / ${releaseManifest?.addonRef || "-"} / ${releaseManifest?.addonVersion || "-"}`,
    ),
    createCheck(
      "manifest-xpi-match",
      "发布清单 XPI 指向一致",
      releaseManifest?.xpiName === xpiName
        && normalizeString(releaseManifest?.xpiPath) === normalizeString(xpiPath),
      `manifest xpi: ${releaseManifest?.xpiName || "-"} / ${releaseManifest?.xpiPath || "-"}`,
    ),
    createCheck(
      "update-entry-present",
      "update.json 含首条更新记录",
      Boolean(updateEntry),
      updateEntry ? `已发现 ${config.addonId} 更新记录` : `缺少 ${config.addonId} 更新记录`,
    ),
    createCheck(
      "update-version-match",
      "update.json 版本一致",
      updateEntry?.version === config.addonVersion,
      `update.json 版本 ${updateEntry?.version || "-"} / 配置版本 ${config.addonVersion}`,
    ),
    createCheck(
      "update-link-match",
      "update_link 与 release-manifest 一致",
      updateEntry?.update_link === releaseManifest?.updateLink,
      `update_link ${updateEntry?.update_link || "-"} / manifest ${releaseManifest?.updateLink || "-"}`,
    ),
    createCheck(
      "update-compatibility-match",
      "兼容版本范围一致",
      updateEntry?.applications?.zotero?.strict_min_version === config.strictMinVersion
        && updateEntry?.applications?.zotero?.strict_max_version === config.strictMaxVersion,
      `update.json 兼容范围 ${updateEntry?.applications?.zotero?.strict_min_version || "-"} ~ ${updateEntry?.applications?.zotero?.strict_max_version || "-"}`,
    ),
    createCheck(
      "preflight-version-match",
      "预检报告版本一致",
      preflightReport?.addonVersion === config.addonVersion
        && preflightReport?.addonId === config.addonId,
      `preflight: ${preflightReport?.addonId || "-"} / ${preflightReport?.addonVersion || "-"}`,
    ),
    createCheck(
      "xpi-hash-match",
      "XPI SHA 与预检一致",
      Boolean(preflightReport?.xpiSHA256) && preflightReport?.xpiSHA256 === xpiSHA256Actual,
      `preflight SHA ${preflightReport?.xpiSHA256 || "-"} / 实际 SHA ${xpiSHA256Actual || "-"}`,
    ),
    createCheck(
      "xpi-size-match",
      "XPI 大小与预检一致",
      Number(preflightReport?.xpiSizeBytes || 0) > 0
        && Number(preflightReport?.xpiSizeBytes || 0) === Number(xpiSizeBytesActual || 0),
      `preflight 大小 ${preflightReport?.xpiSizeBytes || 0} / 实际大小 ${xpiSizeBytesActual || 0}`,
    ),
  ];
}

function summarizeProfile({
  profile,
  artifactChecks,
  installSmokeRun,
}) {
  const metadataChecks = artifactChecks.filter((item) => (
    item.id !== "xpi-hash-match"
    && item.id !== "xpi-size-match"
    && item.id !== "xpi-present"
  ));
  const packageChecks = artifactChecks.filter((item) => (
    item.id === "xpi-present"
    || item.id === "xpi-hash-match"
    || item.id === "xpi-size-match"
    || item.id === "manifest-xpi-match"
  ));

  const metadataConsistent = metadataChecks.every((item) => item.passed === true);
  const packageConsistent = packageChecks.every((item) => item.passed === true);
  const installSmokePresent = Boolean(installSmokeRun);
  const installSmokePassed = installSmokeRun?.passed === true;
  const blockingRuntimeErrorCount = Math.max(0, Number(installSmokeRun?.blockingRuntimeErrorCount || 0));
  const hostNoiseErrorCount = Math.max(0, Number(installSmokeRun?.hostNoiseErrorCount || 0));
  const pluginRuntimeErrorCount = Math.max(0, Number(installSmokeRun?.pluginRuntimeErrorCount || 0));
  const resourceRuntimeErrorCount = Math.max(0, Number(installSmokeRun?.resourceRuntimeErrorCount || 0));
  const blockingRuntimeErrors = Array.isArray(installSmokeRun?.blockingRuntimeErrors)
    ? installSmokeRun.blockingRuntimeErrors
    : [];
  const hostNoiseRuntimeErrors = Array.isArray(installSmokeRun?.hostNoiseRuntimeErrors)
    ? installSmokeRun.hostNoiseRuntimeErrors
    : [];
  const blockingRuntimeErrorPortrait = installSmokeRun?.blockingRuntimeErrorPortrait
    || formatReleaseRuntimeErrorPortrait(blockingRuntimeErrors);
  const hostNoiseRuntimeErrorPortrait = installSmokeRun?.hostNoiseRuntimeErrorPortrait
    || formatReleaseRuntimeErrorPortrait(hostNoiseRuntimeErrors);
  const checks = [
    createCheck(
      "metadata-consistent",
      "元数据一致",
      metadataConsistent,
      metadataConsistent ? "release-manifest / update.json / preflight 基线一致" : pickFirstIssue(metadataChecks),
    ),
    createCheck(
      "package-consistent",
      "XPI 完整性一致",
      packageConsistent,
      packageConsistent ? "XPI 名称、大小与 SHA 校验通过" : pickFirstIssue(packageChecks),
    ),
    createCheck(
      "install-smoke-present",
      "安装态 smoke 已执行",
      installSmokePresent,
      installSmokePresent ? `已存在 ${profile.label} 安装态 smoke` : `缺少 ${profile.label} 安装态 smoke`,
    ),
    createCheck(
      "install-smoke-passed",
      "安装态 smoke 通过",
      installSmokePresent && installSmokePassed,
      installSmokePresent
        ? (
          installSmokePassed
            ? (
              hostNoiseErrorCount > 0
                ? `${profile.label} 安装态 smoke 通过；${hostNoiseRuntimeErrorPortrait}`
                : `${profile.label} 安装态 smoke 通过`
            )
            : (
              blockingRuntimeErrorCount > 0
                ? `${profile.label} 存在阻断型运行时错误：${blockingRuntimeErrorPortrait}`
                : (installSmokeRun?.issues?.[0] || `${profile.label} 安装态 smoke 未通过`)
            )
        )
        : `${profile.label} 安装态 smoke 尚未执行`,
    ),
  ];

  let status = "passed";
  let statusLabel = "通过";
  let summary = "本地发布工件一致，且安装态 smoke 已通过。";
  if (!metadataConsistent || !packageConsistent) {
    status = "failed";
    statusLabel = "失败";
    summary = pickFirstIssue(checks) || "发布元数据或 XPI 完整性未通过。";
  } else if (!installSmokePresent) {
    status = "attention";
    statusLabel = "待补验证";
    summary = "本地元数据与 XPI 完整性已通过，但安装态 smoke 尚未执行。";
  } else if (!installSmokePassed) {
    status = "failed";
    statusLabel = "失败";
    summary = blockingRuntimeErrorCount > 0
      ? `${profile.label} 安装态 smoke 存在阻断型运行时错误：${blockingRuntimeErrorPortrait}`
      : (installSmokeRun?.issues?.[0] || "安装态 smoke 未通过。");
  } else if (hostNoiseErrorCount > 0) {
    summary = `${profile.label} 安装态 smoke 通过；宿主噪声已归类，不阻断发布：${hostNoiseRuntimeErrorPortrait}`;
  }

  return {
    id: profile.id,
    label: profile.label,
    zoteroChannel: profile.zoteroChannel,
    status,
    statusLabel,
    summary,
    checks,
    metadataConsistent,
    packageConsistent,
    installSmokePresent,
    installSmokePassed: installSmokePresent ? installSmokePassed : null,
    blockingRuntimeErrorCount,
    hostNoiseErrorCount,
    pluginRuntimeErrorCount,
    resourceRuntimeErrorCount,
    blockingRuntimeErrors,
    hostNoiseRuntimeErrors,
    blockingRuntimeErrorPortrait,
    hostNoiseRuntimeErrorPortrait,
    installSmoke: installSmokeRun
      ? {
        present: true,
        generatedAt: installSmokeRun.generatedAt,
        status: installSmokeRun.status,
        statusLabel: installSmokeRun.statusLabel,
        durationMs: Number(installSmokeRun.durationMs || 0),
        readinessMode: installSmokeRun.readinessMode,
        installMethod: installSmokeRun.installMethod,
        issues: installSmokeRun.issues,
        note: installSmokeRun.note,
        runtimeErrorClasses: installSmokeRun.runtimeErrorClasses,
        blockingRuntimeErrorCount,
        hostNoiseErrorCount,
        pluginRuntimeErrorCount,
        resourceRuntimeErrorCount,
        blockingRuntimeErrors,
        hostNoiseRuntimeErrors,
        blockingRuntimeErrorPortrait,
        hostNoiseRuntimeErrorPortrait,
      }
      : {
        present: false,
        generatedAt: null,
        status: "missing",
        statusLabel: "未验证",
        durationMs: 0,
        readinessMode: null,
        installMethod: null,
        issues: [],
        note: null,
        runtimeErrorClasses: [],
        blockingRuntimeErrorCount: 0,
        hostNoiseErrorCount: 0,
        pluginRuntimeErrorCount: 0,
        resourceRuntimeErrorCount: 0,
        blockingRuntimeErrors: [],
        hostNoiseRuntimeErrors: [],
        blockingRuntimeErrorPortrait: "-",
        hostNoiseRuntimeErrorPortrait: "-",
      },
  };
}

export function buildReleaseMatrixSummary({
  config,
  buildReport = null,
  releaseManifest = null,
  updateManifest = null,
  preflightReport = null,
  installSmokeReport = null,
  xpiName,
  xpiPath,
  xpiExists = false,
  xpiSHA256Actual = null,
  xpiSizeBytesActual = 0,
  durationMs = 0,
  now = new Date(),
} = {}) {
  if (!config || typeof config !== "object") {
    throw new Error("config is required");
  }

  const generatedAt = toISODate(now) || new Date().toISOString();
  const installSmokeRuns = normalizeInstallSmokeRuns(installSmokeReport);
  const profiles = buildDefaultProfiles();
  const artifactChecks = buildArtifactChecks({
    config,
    buildReport,
    releaseManifest,
    updateManifest,
    preflightReport,
    xpiName,
    xpiPath,
    xpiExists,
    xpiSHA256Actual,
    xpiSizeBytesActual,
  });
  const artifactPassed = artifactChecks.every((item) => item.passed === true);
  const profileSummaries = profiles.map((profile) => summarizeProfile({
    profile,
    artifactChecks,
    installSmokeRun: pickInstallSmokeRun(installSmokeRuns, profile.id),
  }));
  const failedProfiles = profileSummaries.filter((item) => item.status === "failed");
  const attentionProfiles = profileSummaries.filter((item) => item.status === "attention");
  const passedProfiles = profileSummaries.filter((item) => item.status === "passed");
  const mergedRuntimeErrors = mergeRuntimeErrorClassEntries(
    profileSummaries.flatMap((profile) => ([
      ...(Array.isArray(profile.blockingRuntimeErrors) ? profile.blockingRuntimeErrors : []),
      ...(Array.isArray(profile.hostNoiseRuntimeErrors) ? profile.hostNoiseRuntimeErrors : []),
    ])),
  );
  const blockingRuntimeErrorCount = mergedRuntimeErrors.blockingRuntimeErrorCount;
  const hostNoiseErrorCount = mergedRuntimeErrors.hostNoiseErrorCount;
  const pluginRuntimeErrorCount = mergedRuntimeErrors.pluginRuntimeErrorCount;
  const resourceRuntimeErrorCount = mergedRuntimeErrors.resourceRuntimeErrorCount;
  const blockingRuntimeErrors = mergedRuntimeErrors.blockingRuntimeErrors;
  const hostNoiseRuntimeErrors = mergedRuntimeErrors.hostNoiseRuntimeErrors;
  const blockingRuntimeErrorPortrait = formatReleaseRuntimeErrorPortrait(blockingRuntimeErrors);
  const hostNoiseRuntimeErrorPortrait = formatReleaseRuntimeErrorPortrait(hostNoiseRuntimeErrors);

  let status = "passed";
  let statusLabel = "通过";
  let summary = "本地 stable/beta 发布矩阵已通过。";
  if (!artifactPassed || failedProfiles.length > 0) {
    status = "failed";
    statusLabel = "失败";
    summary = pickFirstIssue(artifactChecks)
      || failedProfiles[0]?.summary
      || "本地发布矩阵未通过。";
  } else if (attentionProfiles.length > 0) {
    status = "attention";
    statusLabel = "待补验证";
    summary = "本地元数据与 XPI 完整性已通过，但仍缺少安装态 smoke。";
  } else if (hostNoiseErrorCount > 0) {
    summary = `本地 stable/beta 发布矩阵已通过；共发现 ${hostNoiseErrorCount} 条宿主噪声，已归类为不阻断发布。`;
  }

  const blockingIssues = [];
  const attentionIssues = [];
  const hostNoiseIssues = [];
  if (!artifactPassed) {
    artifactChecks
      .filter((item) => item.passed === false)
      .forEach((item) => blockingIssues.push(item.detail || item.label));
  }
  failedProfiles.forEach((profile) => {
    blockingIssues.push(`${profile.label}: ${profile.summary}`);
  });
  attentionProfiles.forEach((profile) => {
    attentionIssues.push(`${profile.label}: ${profile.summary}`);
  });
  profileSummaries
    .filter((profile) => Number(profile.hostNoiseErrorCount || 0) > 0)
    .forEach((profile) => {
      hostNoiseIssues.push(`${profile.label}: ${profile.hostNoiseRuntimeErrorPortrait}`);
    });

  return {
    generatedAt,
    addonId: config.addonId,
    addonRef: config.addonRef,
    addonVersion: config.addonVersion,
    status,
    statusLabel,
    summary,
    artifactChecks,
    artifactPassed,
    profileCount: profileSummaries.length,
    passedProfileCount: passedProfiles.length,
    failedProfileCount: failedProfiles.length,
    attentionProfileCount: attentionProfiles.length,
    blockingRuntimeErrorCount,
    hostNoiseErrorCount,
    pluginRuntimeErrorCount,
    resourceRuntimeErrorCount,
    blockingRuntimeErrors,
    hostNoiseRuntimeErrors,
    blockingRuntimeErrorPortrait,
    hostNoiseRuntimeErrorPortrait,
    blockingIssues,
    attentionIssues,
    hostNoiseIssues,
    durationMs: Math.max(0, Number(durationMs || 0)),
    profiles: profileSummaries,
    artifacts: {
      xpiName,
      xpiPath,
      xpiExists,
      xpiSHA256Actual,
      xpiSizeBytesActual,
      buildReportPresent: Boolean(buildReport),
      releaseManifestPresent: Boolean(releaseManifest),
      updateManifestPresent: Boolean(updateManifest),
      preflightPresent: Boolean(preflightReport),
      installSmokePresent: installSmokeRuns.length > 0,
    },
  };
}

export function renderReleaseMatrixMarkdown(summary) {
  const lines = [
    "# 本地发布矩阵",
    "",
    `- 生成时间: \`${summary?.generatedAt || "-"}\``,
    `- Add-on ID: \`${summary?.addonId || "-"}\``,
    `- 当前版本: \`${summary?.addonVersion || "-"}\``,
    `- 矩阵状态: \`${summary?.statusLabel || "缺失"}\``,
    `- 生成耗时: \`${summary?.durationMs ?? 0}\` ms`,
    `- 摘要: ${summary?.summary || "-"}`,
    `- XPI: \`${summary?.artifacts?.xpiName || "-"}\``,
    `- SHA256: \`${summary?.artifacts?.xpiSHA256Actual || "-"}\``,
    `- 大小: \`${summary?.artifacts?.xpiSizeBytesActual ?? 0}\` bytes`,
    "",
  ];

  if (summary?.errorCategoryLabel || summary?.failedStage) {
    lines.push("## 脚本失败画像", "");
    lines.push(`- 分类: \`${summary.errorCategoryLabel || summary.errorCategory || "-"}\``);
    lines.push(`- 阶段: \`${summary.failedStage || "-"}\``);
    lines.push(`- 信息: ${summary.errorMessage || "-"}`, "");
  }

  lines.push(
    "## 总体检查",
    "",
    "| 检查 | 结果 | 说明 |",
    "|---|---|---|",
  );

  const artifactChecks = Array.isArray(summary?.artifactChecks) ? summary.artifactChecks : [];
  if (artifactChecks.length === 0) {
    lines.push("| - | - | - |");
  } else {
    artifactChecks.forEach((item) => {
      lines.push(`| ${item.label || item.id || "-"} | ${item.passed ? "通过" : "失败"} | ${item.detail || "-"} |`);
    });
  }

  lines.push(
    "",
    "## 渠道矩阵",
    "",
    "| 渠道 | 状态 | 元数据 | XPI 完整性 | 安装态 smoke | smoke 耗时(ms) | readiness | 阻断错误 | 宿主噪声 | 摘要 |",
    "|---|---|---|---|---|---:|---|---|---|---|",
  );

  const profiles = Array.isArray(summary?.profiles) ? summary.profiles : [];
  if (profiles.length === 0) {
    lines.push("| - | - | - | - | - | - | - | - | - | - |");
  } else {
    profiles.forEach((profile) => {
      lines.push(
        `| ${profile.label || profile.id || "-"} | ${profile.statusLabel || "-"} | ${profile.metadataConsistent ? "通过" : "失败"} | ${profile.packageConsistent ? "通过" : "失败"} | ${profile.installSmokePresent ? (profile.installSmokePassed ? "通过" : "失败") : "未验证"} | ${profile.installSmoke?.durationMs ?? 0} | ${profile.installSmoke?.readinessMode || "-"} | ${profile.blockingRuntimeErrorPortrait || "-"} | ${profile.hostNoiseRuntimeErrorPortrait || "-"} | ${profile.summary || "-"} |`,
      );
    });
  }

  lines.push(
    "",
    "## 运行时错误画像",
    "",
    `- 阻断型错误: \`${summary?.blockingRuntimeErrorCount ?? 0}\` / ${summary?.blockingRuntimeErrorPortrait || "-"}`,
    `- 宿主噪声: \`${summary?.hostNoiseErrorCount ?? 0}\` / ${summary?.hostNoiseRuntimeErrorPortrait || "-"}`,
    `- 插件错误数: \`${summary?.pluginRuntimeErrorCount ?? 0}\``,
    `- 资源错误数: \`${summary?.resourceRuntimeErrorCount ?? 0}\``,
    "",
  );

  if (Array.isArray(summary?.blockingIssues) && summary.blockingIssues.length > 0) {
    lines.push("## 阻断项", "");
    summary.blockingIssues.forEach((item) => lines.push(`- ${item}`));
    lines.push("");
  }

  if (Array.isArray(summary?.attentionIssues) && summary.attentionIssues.length > 0) {
    lines.push("## 待补验证", "");
    summary.attentionIssues.forEach((item) => lines.push(`- ${item}`));
    lines.push("");
  }

  if (Array.isArray(summary?.hostNoiseIssues) && summary.hostNoiseIssues.length > 0) {
    lines.push("## 宿主噪声", "");
    summary.hostNoiseIssues.forEach((item) => lines.push(`- ${item}`));
    lines.push("");
  }

  return lines.join("\n");
}
