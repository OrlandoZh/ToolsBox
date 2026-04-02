function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createCapabilityManifest({ config } = {}) {
  const addonRef = String(config?.addonRef || "cleanroomtemplate").trim() || "cleanroomtemplate";

  const capabilities = [
    {
      id: "baseline-registration",
      label: "基线注册",
      category: "baseline",
      description: "验证默认命令、菜单、偏好设置面板、ItemPane、ItemTree、Notifier 是否已完成挂载。",
      agentScenario: "baseline-registration",
      zoteroScenarios: ["baseline registration diagnostics"],
      entrypoints: [
        "plugin.api.agent.collectDiagnostics()",
      ],
      ownedBy: [
        "src/app/feature-composer.js",
        "src/app/plugin.js",
      ],
      successSignals: [
        "主命令 / 上下文菜单 / 偏好设置面板已注册",
        "ItemPane section/info row 已注册",
        "ItemTree column 已注册",
        "Notifier 观察器已注册",
      ],
    },
    {
      id: "item-presentation",
      label: "条目展示摘要",
      category: "feature",
      description: "验证 agent 能基于真实或示例条目读取标题、类型、摘要与列展示值。",
      agentScenario: "sample-item-pane",
      zoteroScenarios: ["real item selection diagnostics"],
      entrypoints: [
        "plugin.api.agent.inspectItem(itemID)",
      ],
      ownedBy: [
        "src/app/plugin-agent.js",
        "src/features/item-pane.js",
        "src/features/item-tree.js",
      ],
      successSignals: [
        "inspectItem 返回真实 item 详情",
        "摘要包含标题与类型",
      ],
    },
    {
      id: "notifier-sync",
      label: "通知器联动",
      category: "feature",
      description: "验证真实条目修改后，Notifier 事件能同步进入插件诊断视图。",
      agentScenario: "notifier-preview",
      zoteroScenarios: ["real notifier follows item updates"],
      entrypoints: [
        "plugin.api.agent.collectDiagnostics()",
        "plugin.api.agent.runScenario('notifier-preview')",
      ],
      ownedBy: [
        "src/core/notifier.js",
        "src/app/feature-composer.js",
        "src/app/plugin.js",
      ],
      successSignals: [
        "lastNotifierEvent 更新",
        "Notifier 活跃订阅数 > 0",
      ],
    },
    {
      id: "reader-summary",
      label: "Reader 摘要",
      category: "feature",
      description: "验证真实 PDF 附件可打开，并能返回 Reader 摘要、交互快照与匹配窗口状态。",
      agentScenario: "reader-current",
      zoteroScenarios: [
        "real reader summary on generated pdf",
        "reader interaction diagnostics",
      ],
      entrypoints: [
        "plugin.api.reader.openReader(...)",
        "plugin.api.agent.describeReader(itemID)",
        "plugin.api.agent.inspectReader(itemID)",
      ],
      ownedBy: [
        "src/features/reader.js",
        "src/app/plugin-agent.js",
      ],
      successSignals: [
        "canOpen(itemID) 为 true",
        "getReaderSummary(itemID) 返回 pdf 摘要",
        "getReaderInteractionSnapshot(itemID) 返回批注与窗口匹配快照",
        "getWindowStates() 可读取",
      ],
    },
    {
      id: "reader-annotation-roundtrip",
      label: "Reader 批注回环",
      category: "feature",
      description: "验证 agent 可通过公开 Reader API 创建、更新、删除批注，并从交互快照回读结果。",
      agentScenario: "reader-current",
      zoteroScenarios: ["reader annotation roundtrip"],
      entrypoints: [
        "plugin.api.reader.createAnnotation(itemID, annotationData)",
        "plugin.api.reader.updateAnnotation(annotationID, updates)",
        "plugin.api.reader.deleteAnnotation(annotationID)",
        "plugin.api.agent.inspectReader(itemID)",
      ],
      ownedBy: [
        "src/features/reader.js",
        "zotero-scenarios/reader-annotation-roundtrip.scenario.js",
      ],
      successSignals: [
        "createAnnotation() 成功写入批注",
        "inspectReader(itemID) 能回读新批注与更新后的 comment/color",
        "deleteAnnotation() 后批注从交互快照中消失",
      ],
    },
    {
      id: "reader-ui-state",
      label: "Reader UI 状态",
      category: "feature",
      description: "验证 agent 可稳定读取 Reader 的侧栏、工具模式、导航能力和文本选择注解模式等宿主层 UI 状态。",
      agentScenario: "reader-current",
      zoteroScenarios: ["reader interaction diagnostics"],
      entrypoints: [
        "plugin.api.reader.getReaderUIStateSnapshot(itemID)",
        "plugin.api.agent.inspectReader(itemID)",
      ],
      ownedBy: [
        "src/features/reader.js",
        "zotero-scenarios/reader-interaction.scenario.js",
      ],
      successSignals: [
        "getReaderUIStateSnapshot(itemID) 返回 sidebar/tool/navigation 状态",
        "inspectReader(itemID) 附带 uiState 快照",
      ],
    },
    {
      id: "reader-event-hooks",
      label: "Reader 事件桥",
      category: "feature",
      description: "验证 agent 可通过 Zotero Reader 官方事件 API 注册/注销事件监听器，并覆盖 `renderToolbar`、文本选择浮层与多类上下文菜单等宿主注入点。",
      agentScenario: "reader-current",
      zoteroScenarios: [
        "reader event hook diagnostics",
        "reader fine-grained hook diagnostics",
      ],
      entrypoints: [
        "plugin.api.reader.registerEventListener(type, handler)",
        "plugin.api.reader.unregisterEventListener(type, handler)",
        "plugin.api.reader.getRegisteredEventListeners()",
        "plugin.api.agent.runScenario('reader-current', ...)",
      ],
      ownedBy: [
        "src/features/reader.js",
        "src/app/plugin-agent.js",
        "zotero-scenarios/reader-event-hooks.scenario.js",
        "zotero-scenarios/reader-fine-grained-hooks.scenario.js",
      ],
      successSignals: [
        "registerEventListener() 成功接入 Zotero.Reader.registerEventListener",
        "reader-current 场景返回 eventListeners / eventListenerCount",
        "renderTextSelectionPopup 可通过宿主兼容 customEvent 探针回放",
        "renderSidebarAnnotationHeader 可通过宿主兼容 customEvent 探针回放",
        "createAnnotationContextMenu / createColorContextMenu / createViewContextMenu / createThumbnailContextMenu / createSelectorContextMenu 可通过宿主兼容 customEvent 探针回放",
        "unregisterAllEventListeners() 后监听器数量归零",
      ],
    },
    {
      id: "command-nonblocking",
      label: "无阻塞动作执行",
      category: "feature",
      description: "验证 agent 动作可以在不弹窗的情况下触发主命令路径。",
      agentScenario: "command-no-ui",
      zoteroScenarios: ["agent action runs without blocking UI"],
      entrypoints: [
        "plugin.api.runAgentAction()",
      ],
      ownedBy: [
        "src/features/menu-command.js",
        "src/app/plugin.js",
      ],
      successSignals: [
        "runAgentAction() 返回 true",
      ],
    },
    {
      id: "host-actions",
      label: "宿主动作编排",
      category: "feature",
      description: "验证 agent 可枚举稳定的 Host Actions，并以统一结果结构执行偏好设置、右侧栏、Reader 与 live menu 宿主动作。",
      agentScenario: "host-actions",
      zoteroScenarios: [
        "preference pane surface smoke",
        "library item pane surface smoke",
        "context pane surface smoke",
        "reader surface smoke",
        "live menu surface smoke",
      ],
      entrypoints: [
        "plugin.api.agent.listHostActions()",
        "plugin.api.agent.runHostAction(actionId, payload)",
      ],
      ownedBy: [
        "src/app/host-action-catalog.js",
        "src/app/host-actions.js",
        "src/app/plugin-agent.js",
        "src/app/plugin-api.js",
      ],
      successSignals: [
        "Host Action catalog returns source-driven descriptors",
        "runHostAction() returns preconditions / observedState / readiness / surfaceTarget / failureKind",
        "surface smoke scenarios reuse Host Actions instead of one-off DOM probes",
      ],
    },
    {
      id: "settings-governance",
      label: "设置治理",
      category: "governance",
      description: "验证 settings schema、校验与偏好设置面板暴露是否完整。",
      agentScenario: "settings-snapshot",
      zoteroScenarios: ["settings schema and preference pane diagnostics"],
      entrypoints: [
        "plugin.api.settings.listDefinitions()",
        "plugin.api.settings.validate(key, value)",
      ],
      ownedBy: [
        "src/settings/schema.js",
        "src/settings/store.js",
        "src/features/preference-panes.js",
      ],
      successSignals: [
        "定义数量 >= 默认 prefs 数量",
        "enabled/menuLabel/logLevel 的 schema 可读",
        "偏好设置面板已注册",
      ],
    },
    {
      id: "multi-window-mount",
      label: "多窗口挂载",
      category: "runtime",
      description: "验证打开第二个 Zotero 主窗口后，插件仍能自动挂载窗口级功能。",
      agentScenario: "window-snapshot",
      zoteroScenarios: ["multi-window mount diagnostics"],
      entrypoints: [
        "plugin.api.host.listMainWindows()",
        "plugin.api.agent.runScenario('window-snapshot')",
      ],
      ownedBy: [
        "src/platform/zotero-host.js",
        "src/features/window-manager.js",
        "src/app/kernel.js",
      ],
      successSignals: [
        "mainWindowCount 随第二窗口增加",
        `${addonRef} 样式与工具菜单项在新窗口中可见`,
      ],
    },
    {
      id: "runtime-bridge-report",
      label: "运行时桥接报告",
      category: "runtime",
      description: "验证 bootstrap 能力白名单报告可被 agent 与开发者读取。",
      agentScenario: "capability-manifest",
      zoteroScenarios: [],
      entrypoints: [
        "plugin.api.runtime.getCapabilitySummary()",
        "plugin.api.runtime.getCapabilityReport()",
      ],
      ownedBy: [
        "src/app/runtime-capabilities.js",
        "addon-static/bootstrap.js",
      ],
      successSignals: [
        "runtime status 为 healthy/degraded",
        "注入/跳过能力列表可读",
      ],
    },
  ];

  return capabilities.map((item) => clone(item));
}

export function listCapabilityIds(manifest = []) {
  return (Array.isArray(manifest) ? manifest : []).map((item) => item.id);
}

export function findCapabilityById(manifest = [], capabilityId) {
  const id = String(capabilityId || "").trim();
  if (!id) {
    return null;
  }
  const match = (Array.isArray(manifest) ? manifest : []).find((item) => item.id === id);
  return match ? clone(match) : null;
}
