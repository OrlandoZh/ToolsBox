function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildProtectedCapabilityManifest() {
  const redactedDescription = "受保护导出不附带该能力的详细说明。";

  return [
    {
      id: "baseline-registration",
      label: "基线注册",
      category: "baseline",
      description: redactedDescription,
      agentScenario: "baseline-registration",
      zoteroScenarios: ["baseline registration diagnostics"],
    },
    {
      id: "item-presentation",
      label: "条目展示摘要",
      category: "feature",
      description: redactedDescription,
      agentScenario: "sample-item-pane",
      zoteroScenarios: ["real item selection diagnostics"],
    },
    {
      id: "notifier-sync",
      label: "通知器联动",
      category: "feature",
      description: redactedDescription,
      agentScenario: "notifier-preview",
      zoteroScenarios: ["real notifier follows item updates"],
    },
    {
      id: "reader-summary",
      label: "Reader 摘要",
      category: "feature",
      description: redactedDescription,
      agentScenario: "reader-current",
      zoteroScenarios: [
        "real reader summary on generated pdf",
        "reader interaction diagnostics",
      ],
    },
    {
      id: "reader-annotation-roundtrip",
      label: "Reader 批注回环",
      category: "feature",
      description: redactedDescription,
      agentScenario: "reader-current",
      zoteroScenarios: ["reader annotation roundtrip"],
    },
    {
      id: "reader-ui-state",
      label: "Reader UI 状态",
      category: "feature",
      description: redactedDescription,
      agentScenario: "reader-current",
      zoteroScenarios: ["reader interaction diagnostics"],
    },
    {
      id: "reader-event-hooks",
      label: "Reader 事件桥",
      category: "feature",
      description: redactedDescription,
      agentScenario: "reader-current",
      zoteroScenarios: [
        "reader event hook diagnostics",
        "reader fine-grained hook diagnostics",
      ],
    },
    {
      id: "command-nonblocking",
      label: "无阻塞动作执行",
      category: "feature",
      description: redactedDescription,
      agentScenario: "command-no-ui",
      zoteroScenarios: ["agent action runs without blocking UI"],
    },
    {
      id: "host-actions",
      label: "宿主动作编排",
      category: "feature",
      description: redactedDescription,
      agentScenario: "host-actions",
      zoteroScenarios: [
        "preference pane surface smoke",
        "preference pane control interaction",
        "library item pane surface smoke",
        "context pane surface smoke",
        "reader surface smoke",
        "live menu surface smoke",
      ],
    },
    {
      id: "settings-governance",
      label: "设置治理",
      category: "governance",
      description: redactedDescription,
      agentScenario: "settings-snapshot",
      zoteroScenarios: [
        "settings schema and preference pane diagnostics",
        "preference pane control interaction",
      ],
    },
    {
      id: "multi-window-mount",
      label: "多窗口挂载",
      category: "runtime",
      description: redactedDescription,
      agentScenario: "window-snapshot",
      zoteroScenarios: ["multi-window mount diagnostics"],
    },
    {
      id: "runtime-bridge-report",
      label: "运行时桥接报告",
      category: "runtime",
      description: redactedDescription,
      agentScenario: "capability-manifest",
      zoteroScenarios: [],
    },
  ];
}

export function createCapabilityManifest() {
  return buildProtectedCapabilityManifest().map((item) => clone(item));
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
