const REMOTE_RELEASE_STATUS_LABELS = Object.freeze({
  unconfigured: "未配置",
  pending: "待远端验证",
  passed: "通过",
  failed: "失败",
});

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

function normalizeString(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return Object.hasOwn(REMOTE_RELEASE_STATUS_LABELS, normalized)
    ? normalized
    : null;
}

function normalizeURLString(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }
  try {
    return new URL(normalized).toString();
  } catch {
    return null;
  }
}

function isHTTPURL(url) {
  return typeof url === "string" && /^(https?:\/\/|data:)/iu.test(url);
}

function isPlaceholderReleaseURL(url) {
  const normalized = normalizeString(url);
  if (!normalized) {
    return false;
  }
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return String(parsed.hostname || "").toLowerCase().includes("example.com");
    }
    return false;
  } catch {
    return normalized.toLowerCase().includes("example.com");
  }
}

function createCheck(id, label, passed, detail = null) {
  return {
    id,
    label,
    passed: passed === true,
    detail: normalizeString(detail),
  };
}

function createSkippedCheck(id, label, reason) {
  return createCheck(id, label, false, reason);
}

function collectCheckIssues(checks = []) {
  return (Array.isArray(checks) ? checks : [])
    .filter((item) => item?.passed === false)
    .map((item) => item.detail || item.label || item.id)
    .filter(Boolean);
}

function pickStatusLabel(status) {
  return REMOTE_RELEASE_STATUS_LABELS[normalizeStatus(status)] || "未知";
}

function buildUnconfiguredSummary({ configuredUpdateURL, effectiveUpdateURL, expectedUpdateLink }) {
  if (!configuredUpdateURL) {
    return "addon.config.json 缺少有效的远端 updateURL，尚未配置远端发布验证。";
  }
  if (!isHTTPURL(effectiveUpdateURL || configuredUpdateURL)) {
    return "远端 updateURL 不是有效的可访问 URL，尚未配置远端发布验证。";
  }
  if (isPlaceholderReleaseURL(configuredUpdateURL) || isPlaceholderReleaseURL(effectiveUpdateURL)) {
    return "updateURL 仍指向 example.com placeholder，尚未配置自定义发布端验证。";
  }
  if (!expectedUpdateLink) {
    return "本地 release-manifest 尚未生成期望的 update_link，无法执行远端验证。";
  }
  if (!isHTTPURL(expectedUpdateLink)) {
    return "本地 release-manifest 的 update_link 不是有效的可访问 URL，无法执行远端验证。";
  }
  if (isPlaceholderReleaseURL(expectedUpdateLink)) {
    return "本地 release-manifest 的 update_link 仍是 placeholder，尚未配置远端发布验证。";
  }
  return "远端发布验证尚未配置完成。";
}

function buildPendingSummary() {
  return "远端 update.json 与 update_link 尚未验证；上传到自定义发布端后再执行远端验证。";
}

function createBaseChecks({ configuredUpdateURL, effectiveUpdateURL, expectedUpdateLink, configured }) {
  return [
    createCheck(
      "remote-update-url-configured",
      "远端 update.json URL 已配置",
      configured,
      configured
        ? `update.json URL: ${effectiveUpdateURL || configuredUpdateURL}`
        : buildUnconfiguredSummary({ configuredUpdateURL, effectiveUpdateURL, expectedUpdateLink }),
    ),
    createCheck(
      "expected-update-link-present",
      "本地 update_link 已生成",
      Boolean(expectedUpdateLink),
      expectedUpdateLink
        ? `期望 update_link: ${expectedUpdateLink}`
        : "本地 release-manifest 未生成有效 update_link",
    ),
  ];
}

export function buildPendingRemoteReleaseVerification({
  config = null,
  releaseManifest = null,
  remoteUpdateURL = null,
  expectedUpdateLink = null,
  requested = false,
  now = new Date(),
} = {}) {
  const configuredUpdateURL = normalizeURLString(config?.updateURL);
  const effectiveUpdateURL = normalizeURLString(remoteUpdateURL) || configuredUpdateURL;
  const normalizedExpectedUpdateLink = normalizeURLString(expectedUpdateLink)
    || normalizeURLString(releaseManifest?.updateLink);
  const configured = Boolean(
    effectiveUpdateURL
    && normalizedExpectedUpdateLink
    && isHTTPURL(effectiveUpdateURL)
    && isHTTPURL(normalizedExpectedUpdateLink)
    && !isPlaceholderReleaseURL(effectiveUpdateURL)
    && !isPlaceholderReleaseURL(normalizedExpectedUpdateLink)
  );
  const status = configured ? "pending" : "unconfigured";
  const checks = createBaseChecks({
    configuredUpdateURL,
    effectiveUpdateURL,
    expectedUpdateLink: normalizedExpectedUpdateLink,
    configured,
  });
  const issues = status === "pending"
    ? ["尚未执行远端 update.json / update_link 验证。"]
    : collectCheckIssues(checks);

  return {
    generatedAt: toISODate(now) || new Date().toISOString(),
    requested: requested === true,
    configured,
    status,
    statusLabel: pickStatusLabel(status),
    summary: status === "pending"
      ? buildPendingSummary()
      : buildUnconfiguredSummary({
        configuredUpdateURL,
        effectiveUpdateURL,
        expectedUpdateLink: normalizedExpectedUpdateLink,
      }),
    configuredUpdateURL,
    effectiveUpdateURL,
    expectedUpdateLink: normalizedExpectedUpdateLink,
    expectedVersion: normalizeString(releaseManifest?.addonVersion || config?.addonVersion),
    expectedStrictMinVersion: normalizeString(config?.strictMinVersion),
    expectedStrictMaxVersion: normalizeString(config?.strictMaxVersion),
    observedUpdateLink: null,
    observedVersion: null,
    observedStrictMinVersion: null,
    observedStrictMaxVersion: null,
    updateURLHTTPStatus: null,
    updateLinkHTTPStatus: null,
    checks,
    issues,
    durationMs: 0,
  };
}

function buildFetchErrorMessage(url, error) {
  const message = normalizeString(error?.message || error || "fetch failed") || "fetch failed";
  return `请求 ${url} 失败：${message}`;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") {
    throw new Error("global fetch is unavailable");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);

  try {
    return await fetchImpl(url, {
      redirect: "follow",
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJSON(url, timeoutMs, fetchImpl) {
  try {
    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        accept: "application/json, text/plain;q=0.9, */*;q=0.8",
      },
    }, timeoutMs, fetchImpl);

    const text = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        json: null,
        errorMessage: `GET ${url} -> ${response.status}`,
      };
    }

    try {
      return {
        ok: true,
        status: response.status,
        json: JSON.parse(text),
        errorMessage: null,
      };
    } catch (error) {
      return {
        ok: false,
        status: response.status,
        json: null,
        errorMessage: `远端 update.json 不是有效 JSON：${error?.message || error}`,
      };
    }
  } catch (error) {
    return {
      ok: false,
      status: null,
      json: null,
      errorMessage: buildFetchErrorMessage(url, error),
    };
  }
}

async function probeReachable(url, timeoutMs, fetchImpl) {
  const probeMethods = ["HEAD", "GET"];
  let lastFailure = null;

  for (const method of probeMethods) {
    try {
      const response = await fetchWithTimeout(url, { method }, timeoutMs, fetchImpl);
      if (response.ok) {
        return {
          ok: true,
          status: response.status,
          errorMessage: null,
        };
      }
      if (method === "HEAD" && (response.status === 405 || response.status === 501)) {
        lastFailure = {
          ok: false,
          status: response.status,
          errorMessage: `${method} ${url} -> ${response.status}`,
        };
        continue;
      }
      return {
        ok: false,
        status: response.status,
        errorMessage: `${method} ${url} -> ${response.status}`,
      };
    } catch (error) {
      lastFailure = {
        ok: false,
        status: null,
        errorMessage: buildFetchErrorMessage(url, error),
      };
    }
  }

  return lastFailure || {
    ok: false,
    status: null,
    errorMessage: `无法探测 ${url}`,
  };
}

export async function verifyRemoteRelease({
  config = null,
  releaseManifest = null,
  addonId = null,
  remoteUpdateURL = null,
  expectedUpdateLink = null,
  timeoutMs = 8000,
  fetchImpl = globalThis.fetch,
  now = new Date(),
} = {}) {
  const startedAt = Date.now();
  const base = buildPendingRemoteReleaseVerification({
    config,
    releaseManifest,
    remoteUpdateURL,
    expectedUpdateLink,
    requested: true,
    now,
  });

  if (base.status === "unconfigured") {
    return {
      ...base,
      requested: true,
      durationMs: Math.max(0, Date.now() - startedAt),
    };
  }

  const effectiveAddonId = normalizeString(addonId || config?.addonId);
  const jsonProbe = await fetchJSON(base.effectiveUpdateURL, timeoutMs, fetchImpl);
  const remoteEntry = jsonProbe.json?.addons?.[effectiveAddonId]?.updates?.[0] || null;
  const observedUpdateLink = normalizeURLString(remoteEntry?.update_link);
  const observedVersion = normalizeString(remoteEntry?.version);
  const observedStrictMinVersion = normalizeString(remoteEntry?.applications?.zotero?.strict_min_version);
  const observedStrictMaxVersion = normalizeString(remoteEntry?.applications?.zotero?.strict_max_version);
  const updateLinkProbe = observedUpdateLink
    ? await probeReachable(observedUpdateLink, timeoutMs, fetchImpl)
    : null;

  const checks = [
    createCheck(
      "remote-update-manifest-reachable",
      "远端 update.json 可访问",
      jsonProbe.ok,
      jsonProbe.ok
        ? `GET ${base.effectiveUpdateURL} -> ${jsonProbe.status}`
        : (jsonProbe.errorMessage || `无法读取远端 update.json: ${base.effectiveUpdateURL}`),
    ),
    createCheck(
      "remote-update-entry-present",
      "远端 update.json 含首条更新记录",
      Boolean(remoteEntry),
      jsonProbe.ok
        ? (
          remoteEntry
            ? `已发现 ${effectiveAddonId} 更新记录`
            : `远端 update.json 未包含 ${effectiveAddonId} 首条更新记录`
        )
        : "未能读取远端 update.json，无法确认更新记录",
    ),
    createCheck(
      "remote-version-match",
      "远端版本与本地一致",
      Boolean(remoteEntry) && observedVersion === base.expectedVersion,
      remoteEntry
        ? `远端版本 ${observedVersion || "-"} / 本地版本 ${base.expectedVersion || "-"}`
        : "远端更新记录缺失，无法确认版本",
    ),
    createCheck(
      "remote-update-link-match",
      "远端 update_link 与本地一致",
      Boolean(remoteEntry) && observedUpdateLink === base.expectedUpdateLink,
      remoteEntry
        ? `远端 update_link ${observedUpdateLink || "-"} / 本地 update_link ${base.expectedUpdateLink || "-"}`
        : "远端更新记录缺失，无法确认 update_link",
    ),
    createCheck(
      "remote-compatibility-match",
      "远端兼容范围与本地一致",
      Boolean(remoteEntry)
        && observedStrictMinVersion === base.expectedStrictMinVersion
        && observedStrictMaxVersion === base.expectedStrictMaxVersion,
      remoteEntry
        ? `远端兼容范围 ${observedStrictMinVersion || "-"} ~ ${observedStrictMaxVersion || "-"} / 本地兼容范围 ${base.expectedStrictMinVersion || "-"} ~ ${base.expectedStrictMaxVersion || "-"}`
        : "远端更新记录缺失，无法确认兼容范围",
    ),
    observedUpdateLink
      ? createCheck(
        "remote-update-link-reachable",
        "远端 update_link 可访问",
        updateLinkProbe?.ok === true,
        updateLinkProbe?.ok === true
          ? `update_link -> ${updateLinkProbe.status}`
          : (updateLinkProbe?.errorMessage || `无法访问远端 update_link: ${observedUpdateLink}`),
      )
      : createSkippedCheck(
        "remote-update-link-reachable",
        "远端 update_link 可访问",
        "远端 update.json 未提供有效 update_link",
      ),
  ];

  const issues = collectCheckIssues(checks);
  const status = issues.length === 0 ? "passed" : "failed";
  const summary = status === "passed"
    ? "远端 update.json 与 update_link 已校验通过，版本、兼容范围与本地发布工件一致。"
    : (issues[0] || "远端发布验证未通过。");

  return {
    ...base,
    generatedAt: toISODate(now) || new Date().toISOString(),
    requested: true,
    status,
    statusLabel: pickStatusLabel(status),
    summary,
    observedUpdateLink,
    observedVersion,
    observedStrictMinVersion,
    observedStrictMaxVersion,
    updateURLHTTPStatus: jsonProbe.status,
    updateLinkHTTPStatus: updateLinkProbe?.status ?? null,
    checks,
    issues,
    durationMs: Math.max(0, Date.now() - startedAt),
  };
}

function normalizeCheck(record) {
  if (!record || typeof record !== "object") {
    return null;
  }
  const id = normalizeString(record.id);
  const label = normalizeString(record.label);
  if (!id && !label) {
    return null;
  }
  return createCheck(
    id || label,
    label || id,
    record.passed === true,
    record.detail,
  );
}

export function normalizeRemoteReleaseVerification(record, {
  config = null,
  releaseManifest = null,
  now = new Date(),
} = {}) {
  if (!record || typeof record !== "object") {
    return buildPendingRemoteReleaseVerification({
      config,
      releaseManifest,
      now,
    });
  }

  const fallback = buildPendingRemoteReleaseVerification({
    config,
    releaseManifest,
    remoteUpdateURL: record.effectiveUpdateURL || record.remoteUpdateURL || null,
    expectedUpdateLink: record.expectedUpdateLink || null,
    requested: record.requested === true,
    now: record.generatedAt || now,
  });
  const normalizedChecks = Array.isArray(record.checks)
    ? record.checks.map((item) => normalizeCheck(item)).filter(Boolean)
    : fallback.checks;
  const status = normalizeStatus(record.status) || fallback.status;
  const issues = Array.isArray(record.issues)
    ? record.issues.map((item) => String(item || "").trim()).filter(Boolean)
    : collectCheckIssues(normalizedChecks);

  return {
    ...fallback,
    generatedAt: toISODate(record.generatedAt || record.verifiedAt || fallback.generatedAt) || fallback.generatedAt,
    requested: record.requested === true || fallback.requested === true,
    configured: record.configured === true || (record.configured !== false && fallback.configured),
    status,
    statusLabel: normalizeString(record.statusLabel) || pickStatusLabel(status),
    summary: normalizeString(record.summary) || fallback.summary,
    configuredUpdateURL: normalizeURLString(record.configuredUpdateURL) || fallback.configuredUpdateURL,
    effectiveUpdateURL: normalizeURLString(record.effectiveUpdateURL) || fallback.effectiveUpdateURL,
    expectedUpdateLink: normalizeURLString(record.expectedUpdateLink) || fallback.expectedUpdateLink,
    expectedVersion: normalizeString(record.expectedVersion) || fallback.expectedVersion,
    expectedStrictMinVersion: normalizeString(record.expectedStrictMinVersion) || fallback.expectedStrictMinVersion,
    expectedStrictMaxVersion: normalizeString(record.expectedStrictMaxVersion) || fallback.expectedStrictMaxVersion,
    observedUpdateLink: normalizeURLString(record.observedUpdateLink),
    observedVersion: normalizeString(record.observedVersion),
    observedStrictMinVersion: normalizeString(record.observedStrictMinVersion),
    observedStrictMaxVersion: normalizeString(record.observedStrictMaxVersion),
    updateURLHTTPStatus: Number.isFinite(Number(record.updateURLHTTPStatus))
      ? Number(record.updateURLHTTPStatus)
      : null,
    updateLinkHTTPStatus: Number.isFinite(Number(record.updateLinkHTTPStatus))
      ? Number(record.updateLinkHTTPStatus)
      : null,
    checks: normalizedChecks,
    issues,
    durationMs: Math.max(0, Number(record.durationMs || fallback.durationMs || 0)),
  };
}

export function summarizeRemoteReleaseVerification(record, options = {}) {
  const normalized = normalizeRemoteReleaseVerification(record, options);
  if (!normalized) {
    return {
      status: "missing",
      statusLabel: "缺失",
      summary: "尚未生成远端发布验证信息。",
    };
  }
  return {
    status: normalized.status,
    statusLabel: normalized.statusLabel,
    summary: normalized.summary,
  };
}
