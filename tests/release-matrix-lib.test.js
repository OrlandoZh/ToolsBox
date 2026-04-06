import { describe, it, assert } from "./test-framework.js";
import {
  buildReleaseMatrixSummary,
  classifyReleaseInstallSmokeRuntimeErrors,
  renderReleaseMatrixMarkdown,
} from "../scripts/release-matrix-lib.mjs";

const CONFIG = {
  addonId: "cleanroom-template@example.com",
  addonRef: "cleanroomtemplate",
  addonVersion: "0.1.0",
  strictMinVersion: "7.0",
  strictMaxVersion: "8.0.*",
  updateURL: "https://example.com/update.json",
};

function createConsistentMatrixPayload() {
  const xpiName = `${CONFIG.addonRef}-${CONFIG.addonVersion}.xpi`;
  const xpiPath = `/tmp/${xpiName}`;
  const releaseManifest = {
    addonId: CONFIG.addonId,
    addonRef: CONFIG.addonRef,
    addonVersion: CONFIG.addonVersion,
    xpiName,
    xpiPath,
    updateLink: `https://example.com/releases/${xpiName}`,
    updateURL: CONFIG.updateURL,
  };

  return {
    config: CONFIG,
    buildReport: {
      addonRef: CONFIG.addonRef,
      addonVersion: CONFIG.addonVersion,
    },
    releaseManifest,
    updateManifest: {
      addons: {
        [CONFIG.addonId]: {
          updates: [
            {
              version: CONFIG.addonVersion,
              update_link: releaseManifest.updateLink,
              applications: {
                zotero: {
                  strict_min_version: CONFIG.strictMinVersion,
                  strict_max_version: CONFIG.strictMaxVersion,
                },
              },
            },
          ],
        },
      },
    },
    preflightReport: {
      addonId: CONFIG.addonId,
      addonVersion: CONFIG.addonVersion,
      xpiSHA256: "abc123",
      xpiSizeBytes: 1024,
    },
    xpiName,
    xpiPath,
    xpiExists: true,
    xpiSHA256Actual: "abc123",
    xpiSizeBytesActual: 1024,
    durationMs: 12,
    now: "2026-03-23T12:00:00.000Z",
  };
}

function createPassedInstallSmokeReport() {
  return {
    runs: [
      {
        channel: "stable",
        generatedAt: "2026-03-23T11:50:00.000Z",
        passed: true,
        status: "passed",
        statusLabel: "通过",
        durationMs: 1000,
        readinessMode: "native",
        installMethod: "addon-manager-file",
        issues: [],
        note: "稳定版安装态 smoke 通过。",
        runtimeLogs: {
          errorCount: 0,
          recentErrors: [],
        },
      },
      {
        channel: "beta",
        generatedAt: "2026-03-23T11:51:00.000Z",
        passed: true,
        status: "passed",
        statusLabel: "通过",
        durationMs: 980,
        readinessMode: "native",
        installMethod: "addon-manager-file",
        issues: [],
        note: "Beta 安装态 smoke 通过。",
        runtimeLogs: {
          errorCount: 0,
          recentErrors: [],
        },
      },
    ],
  };
}

describe("Release Matrix Lib", () => {
  it("should classify known Zotero runtime noise as host-noise", () => {
    const summary = classifyReleaseInstallSmokeRuntimeErrors({
      errorCount: 2,
      recentErrors: [
        {
          message: "Missing chrome or resource URL: resource://services-settings/remote-settings.sys.mjs",
        },
        {
          message: "Failed to load chrome://zotero/skin/16/white/loading.svg",
        },
      ],
    });

    assert.equal(summary.blockingRuntimeErrorCount, 0);
    assert.equal(summary.hostNoiseErrorCount, 2);
    assert.equal(summary.resourceRuntimeErrorCount, 2);
    assert.equal(summary.runtimeErrorClasses.length, 2);
    assert.equal(summary.runtimeErrorClasses.every((item) => item.classification === "host-noise"), true);
  });

  it("should fallback to stderr tail when runtime recentErrors are unavailable", () => {
    const summary = classifyReleaseInstallSmokeRuntimeErrors({
      errorCount: 2,
      recentErrors: {
        type: "object",
        preview: {
          kind: "ArrayLike",
          length: 2,
        },
      },
    }, [
      "[stderr] JavaScript error: resource://gre/modules/EssentialDomainsRemoteSettings.sys.mjs, line 41: Error: Failed to load resource://services-settings/remote-settings.sys.mjs",
      "[stderr] Missing chrome or resource URL: chrome://zotero/skin/16/white/loading.svg",
    ]);

    assert.equal(summary.blockingRuntimeErrorCount, 0);
    assert.equal(summary.hostNoiseErrorCount, 2);
    assert.ok(summary.runtimeErrorClasses.some((item) => item.id === "host-noise-remote-settings-resource"));
    assert.ok(summary.runtimeErrorClasses.some((item) => item.id === "host-noise-loading-svg"));
  });

  it("should keep host-noise-only install smoke as passed in release matrix", () => {
    const summary = buildReleaseMatrixSummary({
      ...createConsistentMatrixPayload(),
      installSmokeReport: {
        runs: [
          {
            channel: "stable",
            generatedAt: "2026-03-23T11:50:00.000Z",
            passed: true,
            status: "passed",
            statusLabel: "通过",
            durationMs: 1000,
            readinessMode: "native",
            installMethod: "addon-manager-file",
            issues: [],
            note: "稳定版安装态 smoke 通过。",
            runtimeLogs: {
              errorCount: 2,
              recentErrors: [
                {
                  message: "Missing chrome or resource URL: resource://services-settings/remote-settings.sys.mjs",
                },
                {
                  message: "Failed to load chrome://zotero/skin/16/white/loading.svg",
                },
              ],
            },
          },
          {
            channel: "beta",
            generatedAt: "2026-03-23T11:51:00.000Z",
            passed: true,
            status: "passed",
            statusLabel: "通过",
            durationMs: 980,
            readinessMode: "native",
            installMethod: "addon-manager-file",
            issues: [],
            note: "Beta 安装态 smoke 通过。",
            runtimeLogs: {
              errorCount: 0,
              recentErrors: [],
            },
          },
        ],
      },
    });

    const markdown = renderReleaseMatrixMarkdown(summary);

    assert.equal(summary.status, "passed");
    assert.equal(summary.failedProfileCount, 0);
    assert.equal(summary.blockingRuntimeErrorCount, 0);
    assert.equal(summary.hostNoiseErrorCount, 2);
    assert.equal(summary.hostNoiseIssues.length, 1);
    assert.ok(String(summary.summary).includes("宿主噪声"));
    assert.equal(summary.profiles[0].status, "passed");
    assert.ok(String(summary.profiles[0].summary).includes("不阻断发布"));
    assert.ok(markdown.includes("## 宿主噪声"));
    assert.ok(markdown.includes("宿主噪声：remote-settings 资源缺失"));
  });

  it("should keep blocking runtime errors as release blockers", () => {
    const summary = buildReleaseMatrixSummary({
      ...createConsistentMatrixPayload(),
      installSmokeReport: {
        runs: [
          {
            channel: "stable",
            generatedAt: "2026-03-23T11:50:00.000Z",
            passed: false,
            status: "failed",
            statusLabel: "失败",
            durationMs: 1000,
            readinessMode: "native",
            installMethod: "addon-manager-file",
            issues: [
              "运行时日志存在 1 条阻断型 error。",
            ],
            note: "稳定版安装态 smoke 未通过。",
            runtimeLogs: {
              errorCount: 1,
              recentErrors: [
                {
                  message: "Cleanroom bootstrapplugin crashed during addon startup",
                },
              ],
            },
          },
          {
            channel: "beta",
            generatedAt: "2026-03-23T11:51:00.000Z",
            passed: true,
            status: "passed",
            statusLabel: "通过",
            durationMs: 980,
            readinessMode: "native",
            installMethod: "addon-manager-file",
            issues: [],
            note: "Beta 安装态 smoke 通过。",
            runtimeLogs: {
              errorCount: 0,
              recentErrors: [],
            },
          },
        ],
      },
    });

    assert.equal(summary.status, "failed");
    assert.equal(summary.blockingRuntimeErrorCount, 1);
    assert.equal(summary.hostNoiseErrorCount, 0);
    assert.equal(summary.failedProfileCount, 1);
    assert.ok(summary.blockingIssues.some((item) => String(item).includes("阻断型运行时错误")));
    assert.ok(String(summary.blockingRuntimeErrorPortrait).includes("插件运行时错误"));
  });

  it("should keep remote verification pending as release attention", () => {
    const summary = buildReleaseMatrixSummary({
      ...createConsistentMatrixPayload(),
      installSmokeReport: createPassedInstallSmokeReport(),
      remoteVerification: {
        status: "pending",
        statusLabel: "待远端验证",
        summary: "远端 update.json 与 update_link 尚未验证；上传到自定义发布端后再执行远端验证。",
        effectiveUpdateURL: "https://downloads.example.net/cleanroomtemplate/update.json",
        expectedUpdateLink: "https://downloads.example.net/cleanroomtemplate/cleanroomtemplate-0.1.0.xpi",
        checks: [
          {
            id: "remote-update-url-configured",
            label: "远端 update.json URL 已配置",
            passed: true,
            detail: "update.json URL: https://downloads.example.net/cleanroomtemplate/update.json",
          },
        ],
        issues: [
          "尚未执行远端 update.json / update_link 验证。",
        ],
      },
    });

    const markdown = renderReleaseMatrixMarkdown(summary);

    assert.equal(summary.status, "attention");
    assert.ok(summary.attentionIssues.some((item) => String(item).includes("远端发布验证")));
    assert.equal(summary.remoteVerification?.status, "pending");
    assert.ok(markdown.includes("## 远端发布验证"));
    assert.ok(markdown.includes("待远端验证"));
  });

  it("should keep synthetic remote verification as release attention", () => {
    const summary = buildReleaseMatrixSummary({
      ...createConsistentMatrixPayload(),
      installSmokeReport: createPassedInstallSmokeReport(),
      remoteVerification: {
        status: "passed",
        statusLabel: "通过",
        summary: "远端 update.json 与 update_link 已校验通过，版本、兼容范围与本地发布工件一致。",
        effectiveUpdateURL: "data:application/json,%7B%22addons%22%3A%7B%7D%7D",
        expectedUpdateLink: "data:application/x-xpinstall;base64,ZmFrZS14cGk=",
        observedUpdateLink: "data:application/x-xpinstall;base64,ZmFrZS14cGk=",
        checks: [
          {
            id: "remote-update-link-match",
            label: "远端 update_link 与本地一致",
            passed: true,
            detail: "远端 update_link 与本地 release-manifest 一致。",
          },
        ],
        issues: [],
      },
    });

    const markdown = renderReleaseMatrixMarkdown(summary);

    assert.equal(summary.status, "attention");
    assert.equal(summary.remoteVerification?.status, "passed");
    assert.equal(summary.remoteVerification?.evidenceMode, "synthetic");
    assert.equal(summary.remoteVerification?.releaseReady, false);
    assert.ok(String(summary.remoteVerification?.summary || "").includes("data: 内联 URL"));
    assert.ok(summary.attentionIssues.some((item) => String(item).includes("远端发布验证")));
    assert.ok(markdown.includes("证据模式"));
    assert.ok(markdown.includes("测试型"));
    assert.ok(markdown.includes("发布就绪: `否`"));
  });

  it("should keep remote verification failures as release blockers", () => {
    const summary = buildReleaseMatrixSummary({
      ...createConsistentMatrixPayload(),
      installSmokeReport: createPassedInstallSmokeReport(),
      remoteVerification: {
        status: "failed",
        statusLabel: "失败",
        summary: "远端 update_link https://downloads.example.net/outdated.xpi / 本地 update_link https://downloads.example.net/cleanroomtemplate-0.1.0.xpi",
        effectiveUpdateURL: "https://downloads.example.net/cleanroomtemplate/update.json",
        expectedUpdateLink: "https://downloads.example.net/cleanroomtemplate/cleanroomtemplate-0.1.0.xpi",
        observedUpdateLink: "https://downloads.example.net/outdated.xpi",
        checks: [
          {
            id: "remote-update-link-match",
            label: "远端 update_link 与本地一致",
            passed: false,
            detail: "远端 update_link https://downloads.example.net/outdated.xpi / 本地 update_link https://downloads.example.net/cleanroomtemplate-0.1.0.xpi",
          },
        ],
        issues: [
          "远端 update_link https://downloads.example.net/outdated.xpi / 本地 update_link https://downloads.example.net/cleanroomtemplate-0.1.0.xpi",
        ],
      },
    });

    assert.equal(summary.status, "failed");
    assert.ok(summary.blockingIssues.some((item) => String(item).includes("远端发布验证")));
    assert.equal(summary.remoteVerification?.status, "failed");
  });

  it("should include error fields in summary when config is missing", () => {
    assert.throws(
      () => buildReleaseMatrixSummary({}),
      /config is required/,
    );
  });

  it("should include error fields when durationMs is provided", () => {
    const summary = buildReleaseMatrixSummary({
      ...createConsistentMatrixPayload(),
      durationMs: 123,
    });

    assert.equal(summary.durationMs, 123);
    assert.equal(summary.errorCategory, undefined);
    assert.equal(summary.errorCategoryLabel, undefined);
    assert.equal(summary.errorMessage, undefined);
    assert.equal(summary.failedStage, undefined);
  });

  it("should render error fields in markdown when present", () => {
    const summaryWithErrors = {
      generatedAt: "2026-03-24T12:00:00.000Z",
      addonId: "cleanroom-template@example.com",
      addonRef: "cleanroomtemplate",
      addonVersion: "0.1.0",
      status: "failed",
      statusLabel: "失败",
      summary: "发布矩阵执行异常",
      durationMs: 50,
      errorCategory: "validation",
      errorCategoryLabel: "验证错误",
      errorMessage: "XPI hash mismatch",
      failedStage: "artifact-check",
      artifactChecks: [],
      artifactPassed: false,
      profiles: [],
      passedProfileCount: 0,
      failedProfileCount: 0,
      attentionProfileCount: 0,
      blockingRuntimeErrorCount: 0,
      hostNoiseErrorCount: 0,
      blockingRuntimeErrorPortrait: "-",
      hostNoiseRuntimeErrorPortrait: "-",
      blockingIssues: [],
      attentionIssues: [],
      hostNoiseIssues: [],
      artifacts: {
        xpiName: "cleanroomtemplate-0.1.0.xpi",
        xpiSHA256Actual: "abc123",
        xpiSizeBytesActual: 12345,
      },
    };

    const markdown = renderReleaseMatrixMarkdown(summaryWithErrors);

    assert.ok(markdown.includes("分类: `验证错误`"));
    assert.ok(markdown.includes("阶段: `artifact-check`"));
    assert.ok(markdown.includes("XPI hash mismatch"));
  });
});
