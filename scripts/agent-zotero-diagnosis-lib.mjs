const SEVERITY_RANK = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const LEGACY_DIAGNOSIS_FINGERPRINT_ALIASES = Object.freeze({
  "reader-entry:reader-summary-command-missing": "reader-entry:declarative-reader-mapping-drift",
  "reader-entry:reader-summary-menu-missing": "reader-entry:declarative-reader-mapping-drift",
  "reader-event:listener-registration-mismatch": "reader-event:toolbar-bridge-registration-drift",
  "reader-event:synthetic-fallback-mapping-missing": "reader-event:fine-grained-hook-declaration-drift",
  "reader-event:probe-compatible-type-missing": "reader-event:fine-grained-hook-declaration-drift",
});

export function normalizeDiagnosisFingerprint(fingerprint) {
  const normalized = String(fingerprint || "").trim();
  if (!normalized) {
    return "";
  }
  return LEGACY_DIAGNOSIS_FINGERPRINT_ALIASES[normalized] || normalized;
}

export function isLegacyDiagnosisFingerprint(fingerprint) {
  const normalized = String(fingerprint || "").trim();
  return Boolean(normalized) && Object.prototype.hasOwnProperty.call(
    LEGACY_DIAGNOSIS_FINGERPRINT_ALIASES,
    normalized,
  );
}

const DIAGNOSIS_RULES = [
  {
    feature: "bootstrap",
    featureLabel: "启动与挂载",
    candidateFiles: [
      "addon-static/bootstrap.js",
      "src/main.js",
      "src/app/plugin.js",
      "src/core/lifecycle.js",
      "scripts/zotero-agent-runtime-lib.mjs",
      "scripts/zotero.mjs",
    ],
    recommendedActions: [
      "先检查 bootstrap 生命周期是否完整执行，以及 `Zotero[instanceKey].api` 是否已挂载。",
      "核对 `config/addon.config.json` 的 `addonId`、`addonRef`、`instanceKey` 与构建产物是否一致。",
      "若静态运行时体检已报告 `addon-static/bootstrap.js` 缺失，优先恢复模板 bootstrap 基线文件，再继续排查挂载链。",
    ],
    signatures: [
      {
        key: "bootstrap-file-missing",
        severity: "critical",
        confidence: 0.99,
        summary: "bootstrap 启动脚本缺失，导致插件无法进入原生生命周期。",
        patterns: [
          "静态运行时基线缺失：addon-static/bootstrap.js",
          "bootstrap 启动脚本",
        ],
      },
      {
        key: "bootstrap-file-drift",
        severity: "critical",
        confidence: 0.99,
        summary: "bootstrap 启动脚本已存在，但内容偏离 clean-room 基线。",
        patterns: [
          "静态运行时基线漂移：addon-static/bootstrap.js",
          "bootstrap 启动脚本",
        ],
      },
      {
        key: "plugin-not-mounted",
        severity: "critical",
        confidence: 0.98,
        summary: "插件实例未稳定挂载到 Zotero 运行时。",
        patterns: [
          "插件实例未挂载",
          "插件 api 未挂载",
          "timed out waiting for plugin readiness",
          "missing-bootstrap-plugin",
          "addons.init",
        ],
      },
    ],
  },
  {
    feature: "config",
    featureLabel: "默认配置修正",
    candidateFiles: [
      "config/addon.config.json",
      "src/app/plugin.js",
      "src/settings/store.js",
    ],
    recommendedActions: [
      "先用 fresh profile 复验，区分当前问题是模板默认配置漂移，还是当前开发 profile 中的临时偏好值。",
      "若 fresh profile 仍处于 disabled 状态，优先检查 `config/addon.config.json` 中 `defaultPrefs.enabled` 是否被误设为 false。",
    ],
    signatures: [
      {
        key: "default-enabled-disabled",
        severity: "high",
        confidence: 0.96,
        summary: "模板默认配置可能把插件默认启用状态设为了 false。",
        patterns: [
          "插件当前为 disabled 状态",
          "插件当前已禁用",
          "defaultprefs.enabled",
        ],
      },
    ],
  },
  {
    feature: "lifecycle",
    featureLabel: "生命周期与基线注册",
    candidateFiles: [
      "src/app/kernel.js",
      "src/app/feature-composer.js",
      "src/app/plugin.js",
    ],
    recommendedActions: [
      "检查 `kernel.start()` 是否仍在 `startServices()` 之后调用 `registerBaselineFeatures()`，并且位于 `windows.loadAll()` 之前。",
      "若只是启动链组合遗漏，优先恢复基线注册调用，不要重写各 feature 内部实现。",
    ],
    signatures: [
      {
        key: "baseline-registration-missing",
        severity: "high",
        confidence: 0.97,
        summary: "插件已挂载，但基线注册链未完整执行。",
        patterns: [
          "itempane section 未注册",
          "itempane inforow 未注册",
          "itemtree 自定义列未注册",
          "notifier 未激活",
        ],
      },
    ],
  },
  {
    feature: "menu-action",
    featureLabel: "主命令与菜单动作",
    candidateFiles: [
      "src/features/menu-command.js",
      "src/features/menu-manager.js",
      "src/app/plugin.js",
      "src/app/feature-composer.js",
    ],
    recommendedActions: [
      "确认主窗口 Tools 菜单入口仍可访问，并检查 `runPrimaryAction` 的返回值。",
      "确认插件 `enabled` 偏好为 true，且窗口挂载后菜单命令已经注册。",
    ],
    signatures: [
      {
        key: "primary-command-missing",
        severity: "medium",
        confidence: 0.94,
        summary: "主命令未注册到命令面板。",
        patterns: [
          "主命令未注册到命令面板",
        ],
      },
      {
        key: "context-menu-missing",
        severity: "medium",
        confidence: 0.93,
        summary: "主窗口上下文菜单项未注册。",
        patterns: [
          "主窗口上下文菜单项未注册",
        ],
      },
      {
        key: "primary-action-failed",
        severity: "high",
        confidence: 0.93,
        summary: "主命令动作未按预期执行。",
        patterns: [
          "runprimaryaction",
          "tools 菜单",
          "主窗口 tools 菜单",
        ],
      },
    ],
  },
  {
    feature: "preferences",
    featureLabel: "偏好设置面板",
    candidateFiles: [
      "src/app/feature-composer.js",
      "src/features/preference-panes.js",
      "addon-static/content/preferences.xhtml",
    ],
    recommendedActions: [
      "确认 `registerBaselineFeatures()` 中的 `preferencePanes.registerPane(...)` 仍在 baseline 注册阶段执行。",
      "若只是注册遗漏，优先恢复既有面板注册块，不要改写设置 schema 或偏好持久化逻辑。",
      "若 recent error 指向 `content/preferences.xhtml` 资源缺失或加载失败，优先恢复模板最小 `addon-static/content/preferences.xhtml`，不要只盯 `registerPane(...)` 调用。",
    ],
    signatures: [
      {
        key: "preference-pane-missing",
        severity: "medium",
        confidence: 0.92,
        summary: "偏好设置面板未注册。",
        patterns: [
          "偏好设置面板未注册",
        ],
      },
      {
        key: "preference-pane-resource-missing",
        severity: "medium",
        confidence: 0.95,
        summary: "偏好设置面板资源文件缺失或无法加载。",
        patterns: [
          "静态运行时基线缺失：addon-static/content/preferences.xhtml",
          "偏好设置面板未注册",
          "missing chrome or resource url",
          "failed to load resource://",
          "偏好设置面板资源",
        ],
      },
      {
        key: "preference-pane-resource-drift",
        severity: "medium",
        confidence: 0.96,
        summary: "偏好设置面板资源文件已存在，但内容偏离 clean-room 基线。",
        patterns: [
          "静态运行时基线漂移：addon-static/content/preferences.xhtml",
          "偏好设置面板资源",
        ],
      },
    ],
  },
  {
    feature: "assets",
    featureLabel: "静态资源与图标",
    candidateFiles: [
      "config/addon.config.json",
      "addon-static/content/icons/icon-48.png",
      "addon-static/content/icons/icon-96.png",
    ],
    recommendedActions: [
      "先核对 `config/addon.config.json > icons` 声明是否仍指向模板仓库内的实际文件。",
      "若只是静态文件缺失，优先补回 `addon-static/content/icons/*` 中对应 icon 资源，不要顺带改动菜单或面板注册逻辑。",
    ],
    signatures: [
      {
        key: "icon-resource-missing",
        severity: "medium",
        confidence: 0.93,
        summary: "配置声明的 icon 资源文件缺失。",
        patterns: [
          "静态运行时基线缺失：addon-static/content/icons/",
        ],
      },
      {
        key: "icon-resource-drift",
        severity: "medium",
        confidence: 0.93,
        summary: "配置声明的 icon 资源文件内容偏离 clean-room 基线。",
        patterns: [
          "静态运行时基线漂移：addon-static/content/icons/",
          "配置声明的 icon 资源",
        ],
      },
    ],
  },
  {
    feature: "agent-action",
    featureLabel: "Agent 动作入口",
    candidateFiles: [
      "src/app/plugin.js",
      "src/features/prompt.js",
      "src/features/menu-command.js",
    ],
    recommendedActions: [
      "确认 `runAgentAction` 暴露在 `Zotero[instanceKey].api` 上，且不依赖未就绪的 UI 状态。",
    ],
    signatures: [
      {
        key: "agent-action-failed",
        severity: "high",
        confidence: 0.91,
        summary: "Agent 动作入口未按预期返回成功结果。",
        patterns: [
          "runagentaction",
          "agent 动作",
        ],
      },
    ],
  },
  {
    feature: "reader-entry",
    featureLabel: "Reader 命令与菜单入口",
    candidateFiles: [
      "src/app/feature-composer.js",
      "src/features/menu-manager.js",
      "src/app/plugin.js",
    ],
    recommendedActions: [
      "确认 `registerBaselineFeatures()` 中的 Reader 摘要命令仍注册到 command palette。",
      "若官方菜单 API 可用，确认 Reader View 菜单项仍通过 `menuManager.registerReaderMenubarViewMenuItem(...)` 注册。",
    ],
    signatures: [
      {
        key: "declarative-reader-mapping-drift",
        severity: "medium",
        confidence: 0.91,
        summary: "Reader 声明式命令/菜单映射存在缺口。",
        patterns: [
          "reader 摘要命令未注册",
          "reader view 菜单项未注册",
          "reader 声明式入口映射缺口",
        ],
      },
    ],
  },
  {
    feature: "reader-event",
    featureLabel: "Reader 事件桥",
    candidateFiles: [
      "src/features/reader.js",
      "dev/agent-runtime/plugin-agent.js",
      "zotero-scenarios/reader-event-hooks.scenario.js",
      "zotero-scenarios/reader-fine-grained-hooks.scenario.js",
    ],
    recommendedActions: [
      "优先检查 `src/features/reader.js` 中官方 listener 桥接、knownTypes/probeCompatibleTypes 声明，以及 synthetic-fallback 映射是否仍完整。",
      "若真机场景已表明 Hook 失败，优先恢复 Reader 事件桥的声明式基线，不要顺带改写 Reader UI 或宿主逻辑。",
    ],
    signatures: [
      {
        key: "toolbar-bridge-registration-drift",
        severity: "high",
        confidence: 0.93,
        summary: "Reader renderToolbar / 官方 listener 桥接存在漂移。",
        patterns: [
          "reader 官方事件监听注册异常",
          "reader renderToolbar 宿主桥接未恢复",
          "reader renderToolbar 宿主点未观测",
        ],
      },
      {
        key: "fine-grained-hook-declaration-drift",
        severity: "medium",
        confidence: 0.95,
        summary: "Reader 细粒度 Hook 声明式类型清单存在漂移。",
        patterns: [
          "reader 事件桥缺少 synthetic-fallback 映射",
          "reader 事件桥已知类型声明缺口",
          "reader 事件桥 probe 声明缺口",
        ],
      },
    ],
  },
  {
    feature: "localization",
    featureLabel: "本地化引用修正",
    candidateFiles: [
      "src/app/feature-composer.js",
      "addon-static/locale/en-US/main.ftl",
      "addon-static/locale/zh-CN/main.ftl",
      "addon-static/locale/zh-TW/main.ftl",
    ],
    recommendedActions: [
      "先核对 `src/app/feature-composer.js` 中 ItemPane 基线注册的 `l10nID` 是否仍为模板约定键。",
      "若只是引用 typo，优先在 `feature-composer` 中做单点替换，不要顺带改写整份文案或 locale 文件结构。",
    ],
    signatures: [
      {
        key: "item-pane-info-row-l10n-id-drift",
        severity: "medium",
        confidence: 0.93,
        summary: "ItemPane InfoRow 的本地化引用发生漂移。",
        patterns: [
          "itempane inforow l10nid 漂移",
        ],
      },
      {
        key: "item-pane-section-header-l10n-id-drift",
        severity: "medium",
        confidence: 0.93,
        summary: "ItemPane Section Header 的本地化引用发生漂移。",
        patterns: [
          "itempane section header l10nid 漂移",
        ],
      },
      {
        key: "item-pane-section-sidenav-l10n-id-drift",
        severity: "medium",
        confidence: 0.93,
        summary: "ItemPane Section Sidenav 的本地化引用发生漂移。",
        patterns: [
          "itempane section sidenav l10nid 漂移",
        ],
      },
      {
        key: "item-pane-info-row-ftl-key-missing",
        severity: "medium",
        confidence: 0.92,
        summary: "ItemPane InfoRow 的 FTL key 缺失。",
        patterns: [
          "缺少 ftl key cleanroom-item-pane-info-row-label",
        ],
      },
      {
        key: "item-pane-section-header-ftl-key-missing",
        severity: "medium",
        confidence: 0.92,
        summary: "ItemPane Section Header 的 FTL key 缺失。",
        patterns: [
          "缺少 ftl key cleanroom-item-pane-section-header",
        ],
      },
      {
        key: "item-pane-section-sidenav-ftl-key-missing",
        severity: "medium",
        confidence: 0.92,
        summary: "ItemPane Section Sidenav 的 FTL key 缺失。",
        patterns: [
          "缺少 ftl key cleanroom-item-pane-section-sidenav",
        ],
      },
      {
        key: "item-pane-info-row-ftl-structure-drift",
        severity: "medium",
        confidence: 0.92,
        summary: "ItemPane InfoRow 的 FTL 结构发生漂移。",
        patterns: [
          "ftl key cleanroom-item-pane-info-row-label 结构漂移",
        ],
      },
      {
        key: "item-pane-section-header-ftl-structure-drift",
        severity: "medium",
        confidence: 0.92,
        summary: "ItemPane Section Header 的 FTL 结构发生漂移。",
        patterns: [
          "ftl key cleanroom-item-pane-section-header 结构漂移",
        ],
      },
      {
        key: "item-pane-section-sidenav-ftl-structure-drift",
        severity: "medium",
        confidence: 0.92,
        summary: "ItemPane Section Sidenav 的 FTL 结构发生漂移。",
        patterns: [
          "ftl key cleanroom-item-pane-section-sidenav 结构漂移",
        ],
      },
      {
        key: "item-pane-info-row-ftl-value-drift",
        severity: "medium",
        confidence: 0.91,
        summary: "ItemPane InfoRow 的 FTL value 发生漂移。",
        patterns: [
          "ftl key cleanroom-item-pane-info-row-label 值漂移",
        ],
      },
      {
        key: "item-pane-section-header-ftl-value-drift",
        severity: "medium",
        confidence: 0.91,
        summary: "ItemPane Section Header 的 FTL value 发生漂移。",
        patterns: [
          "ftl key cleanroom-item-pane-section-header 值漂移",
        ],
      },
      {
        key: "item-pane-section-sidenav-ftl-value-drift",
        severity: "medium",
        confidence: 0.91,
        summary: "ItemPane Section Sidenav 的 FTL value 发生漂移。",
        patterns: [
          "ftl key cleanroom-item-pane-section-sidenav 值漂移",
        ],
      },
    ],
  },
  {
    feature: "item-pane",
    featureLabel: "ItemPane 注册",
    candidateFiles: [
      "src/features/item-pane.js",
      "src/app/plugin.js",
      "src/app/feature-composer.js",
    ],
    recommendedActions: [
      "检查 ItemPane Section / InfoRow 是否在窗口挂载后完成注册，并确认本地化 ID 有效。",
    ],
    signatures: [
      {
        key: "item-pane-section-missing",
        severity: "high",
        confidence: 0.95,
        summary: "ItemPane Section 未注册到宿主。",
        patterns: [
          "itempane section 未注册",
        ],
      },
      {
        key: "item-pane-info-row-missing",
        severity: "high",
        confidence: 0.95,
        summary: "ItemPane InfoRow 未注册到宿主。",
        patterns: [
          "itempane inforow 未注册",
        ],
      },
    ],
  },
  {
    feature: "item-tree",
    featureLabel: "ItemTree 自定义列",
    candidateFiles: [
      "src/features/item-tree.js",
      "src/app/plugin.js",
      "src/app/feature-composer.js",
    ],
    recommendedActions: [
      "检查 ItemTree 列注册的 `dataKey` 与 Zotero namespaced key 是否一致。",
    ],
    signatures: [
      {
        key: "item-tree-column-missing",
        severity: "high",
        confidence: 0.94,
        summary: "ItemTree 自定义列未注册到宿主。",
        patterns: [
          "itemtree 自定义列未注册",
        ],
      },
    ],
  },
  {
    feature: "notifier",
    featureLabel: "Notifier 事件订阅",
    candidateFiles: [
      "src/core/notifier.js",
      "src/app/plugin.js",
      "src/app/feature-composer.js",
    ],
    recommendedActions: [
      "检查 Notifier 是否在启动阶段完成订阅，并确认回调不会在热重载后丢失。",
    ],
    signatures: [
      {
        key: "notifier-inactive",
        severity: "high",
        confidence: 0.93,
        summary: "Notifier 未处于激活状态。",
        patterns: [
          "notifier 未激活",
        ],
      },
    ],
  },
  {
    feature: "reader-ui",
    featureLabel: "Reader 与视觉回归",
    candidateFiles: [
      "src/features/reader.js",
      "zotero-scenarios/baseline.scenario.js",
      "tests/visual-baselines/agent-zotero-e2e/hot-reload-reader.png",
      "tests/visual-baselines/agent-zotero-e2e/restart-reader.png",
    ],
    recommendedActions: [
      "先确认 Reader 真实打开流程仍然通过，再判断视觉差异是否为预期 UI 变更。",
      "如果界面变化是预期行为，刷新视觉基线后重新复验。",
    ],
    signatures: [
      {
        key: "reader-visual-drift",
        severity: "medium",
        confidence: 0.88,
        summary: "Reader 相关视觉基线发生漂移或缺失。",
        patterns: [
          "reader",
          "像素漂移",
          "平均通道差异",
          "缺少 reader 截图",
        ],
      },
    ],
  },
  {
    feature: "tests",
    featureLabel: "Zotero 集成测试",
    candidateFiles: [
      "zotero-tests/startup.test.js",
      "scripts/zotero-test-runtime.js",
    ],
    recommendedActions: [
      "先单独执行 `npm run zotero:test`，确认失败的是测试用例本身还是运行时挂载链路。",
    ],
    signatures: [
      {
        key: "tests-failed",
        severity: "medium",
        confidence: 0.86,
        summary: "Zotero 集成测试存在失败项。",
        patterns: [
          "zotero 集成测试失败",
        ],
      },
    ],
  },
  {
    feature: "scenarios",
    featureLabel: "Zotero 场景脚本",
    candidateFiles: [
      "zotero-scenarios/baseline.scenario.js",
      "scripts/zotero-scenario-runtime.js",
    ],
    recommendedActions: [
      "先单独执行 `npm run zotero:scenario`，缩小到具体失败场景后再回到 E2E 复验。",
    ],
    signatures: [
      {
        key: "scenarios-failed",
        severity: "medium",
        confidence: 0.86,
        summary: "Zotero 场景脚本存在失败项。",
        patterns: [
          "zotero 场景脚本失败",
        ],
      },
    ],
  },
  {
    feature: "runtime-logs",
    featureLabel: "运行时日志与资源加载",
    candidateFiles: [
      "src/app/plugin.js",
      "addon-static/content/style/main.css",
      "src/core/logger.js",
      "scripts/zotero-agent-runtime-lib.mjs",
      "scripts/zotero.mjs",
    ],
    recommendedActions: [
      "查看最近 error 日志，确认是否为资源路径、脚本导出或运行时桥接问题。",
      "若日志明确指向 `content/style/main.css` 缺失或加载失败，优先恢复模板最小样式文件，而不是先改动窗口挂载逻辑。",
    ],
    signatures: [
      {
        key: "style-sheet-resource-missing",
        severity: "medium",
        confidence: 0.94,
        summary: "主窗口样式资源文件缺失或无法加载。",
        patterns: [
          "静态运行时基线缺失：addon-static/content/style/main.css",
          "error 级日志",
          "content/style/main.css",
          "missing chrome or resource url",
          "failed to load resource://",
        ],
      },
      {
        key: "style-sheet-resource-drift",
        severity: "medium",
        confidence: 0.96,
        summary: "主窗口样式资源文件已存在，但内容偏离 clean-room 基线。",
        patterns: [
          "静态运行时基线漂移：addon-static/content/style/main.css",
          "主窗口样式资源",
        ],
      },
      {
        key: "error-logs-present",
        severity: "medium",
        confidence: 0.72,
        summary: "本轮存在未归类的运行时 error 日志。",
        patterns: [
          "error 级日志",
          "javascript error:",
          "missing chrome or resource url",
          "failed to load resource://",
        ],
      },
    ],
  },
];

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function uniqueStrings(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean),
  ));
}

function compareDiagnoses(a, b) {
  const severityDiff = (SEVERITY_RANK[b?.severity] || 0) - (SEVERITY_RANK[a?.severity] || 0);
  if (severityDiff !== 0) {
    return severityDiff;
  }
  const confidenceDiff = Number(b?.confidence || 0) - Number(a?.confidence || 0);
  if (confidenceDiff !== 0) {
    return confidenceDiff;
  }
  return String(a?.fingerprint || "").localeCompare(String(b?.fingerprint || ""));
}

function matchSignature(issueText, contextText) {
  let best = null;
  for (const rule of DIAGNOSIS_RULES) {
    for (const signature of rule.signatures) {
      const patterns = Array.isArray(signature.patterns) ? signature.patterns : [];
      const issueMatches = patterns.filter((pattern) => issueText.includes(normalizeText(pattern))).length;
      const contextMatches = patterns.filter((pattern) => contextText.includes(normalizeText(pattern))).length;
      const score = issueMatches * 3 + contextMatches;
      if (score <= 0) {
        continue;
      }
      if (!best || score > best.score) {
        best = {
          score,
          rule,
          signature,
        };
      }
    }
  }
  return best;
}

function buildDiagnosis({ match, issue, hints, logSummary, cycleIndex }) {
  const recentErrors = Array.isArray(logSummary?.recentErrors)
    ? logSummary.recentErrors.slice(0, 2).map((entry) => String(entry?.message || "").trim()).filter(Boolean)
    : [];
  return {
    fingerprint: `${match.rule.feature}:${match.signature.key}`,
    feature: match.rule.feature,
    featureLabel: match.rule.featureLabel,
    severity: match.signature.severity,
    confidence: match.signature.confidence,
    summary: match.signature.summary,
    issue,
    cycleIndex: Number.isFinite(cycleIndex) ? cycleIndex : null,
    candidateFiles: [...match.rule.candidateFiles],
    recommendedActions: [...match.rule.recommendedActions],
    evidence: {
      issues: uniqueStrings([issue]),
      hints: uniqueStrings((Array.isArray(hints) ? hints : []).slice(0, 2)),
      recentErrors,
    },
  };
}

export function mergeDiagnoses(...groups) {
  const merged = new Map();
  for (const group of groups) {
    const list = Array.isArray(group) ? group : [];
    for (const diagnosis of list) {
      if (!diagnosis || typeof diagnosis !== "object" || !diagnosis.fingerprint) {
        continue;
      }
      const existing = merged.get(diagnosis.fingerprint);
      if (!existing) {
        merged.set(diagnosis.fingerprint, {
          ...diagnosis,
          candidateFiles: uniqueStrings(diagnosis.candidateFiles),
          recommendedActions: uniqueStrings(diagnosis.recommendedActions),
          evidence: {
            issues: uniqueStrings(diagnosis?.evidence?.issues),
            hints: uniqueStrings(diagnosis?.evidence?.hints),
            recentErrors: uniqueStrings(diagnosis?.evidence?.recentErrors),
          },
        });
        continue;
      }
      existing.confidence = Math.max(Number(existing.confidence || 0), Number(diagnosis.confidence || 0));
      if ((SEVERITY_RANK[diagnosis.severity] || 0) > (SEVERITY_RANK[existing.severity] || 0)) {
        existing.severity = diagnosis.severity;
        existing.summary = diagnosis.summary;
      }
      if (existing.cycleIndex === null && Number.isFinite(diagnosis.cycleIndex)) {
        existing.cycleIndex = diagnosis.cycleIndex;
      }
      existing.candidateFiles = uniqueStrings([
        ...existing.candidateFiles,
        ...(Array.isArray(diagnosis.candidateFiles) ? diagnosis.candidateFiles : []),
      ]);
      existing.recommendedActions = uniqueStrings([
        ...existing.recommendedActions,
        ...(Array.isArray(diagnosis.recommendedActions) ? diagnosis.recommendedActions : []),
      ]);
      existing.evidence = {
        issues: uniqueStrings([
          ...(existing?.evidence?.issues || []),
          ...(diagnosis?.evidence?.issues || []),
        ]),
        hints: uniqueStrings([
          ...(existing?.evidence?.hints || []),
          ...(diagnosis?.evidence?.hints || []),
        ]),
        recentErrors: uniqueStrings([
          ...(existing?.evidence?.recentErrors || []),
          ...(diagnosis?.evidence?.recentErrors || []),
        ]),
      };
    }
  }
  return Array.from(merged.values()).sort(compareDiagnoses);
}

export function deriveCycleDiagnoses({ cycle, issues = [], hints = [], logSummary = null }) {
  const issueList = Array.isArray(issues) ? issues : [];
  if (issueList.length === 0) {
    return [];
  }
  const contextText = normalizeText([
    ...issueList,
    ...(Array.isArray(hints) ? hints : []),
    ...((logSummary?.recentErrors || []).map((entry) => entry?.message || "")),
    ...((logSummary?.recentWarnings || []).map((entry) => entry?.message || "")),
  ].join("\n"));

  const rawDiagnoses = [];
  for (const issue of issueList) {
    const issueText = normalizeText(issue);
    const match = matchSignature(issueText, contextText);
    if (!match) {
      continue;
    }
    rawDiagnoses.push(buildDiagnosis({
      match,
      issue,
      hints,
      logSummary,
      cycleIndex: cycle?.index,
    }));
  }

  return mergeDiagnoses(rawDiagnoses);
}

export function pickPrimaryDiagnosis(diagnoses = []) {
  const list = Array.isArray(diagnoses) ? diagnoses.slice().sort(compareDiagnoses) : [];
  return list[0] || null;
}
