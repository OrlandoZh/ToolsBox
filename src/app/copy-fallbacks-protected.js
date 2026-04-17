export function createCopyFallbacks() {
  return Object.freeze({
    command: Object.freeze({
      label: "Open Tool",
      description: "Run the default action.",
      disabled: "This tool is disabled. Re-enable it in preferences first.",
    }),
    shortcut: Object.freeze({
      description: "Show the shortcut status toast.",
      toastTitle: "Shortcut",
    }),
    demo: Object.freeze({
      item: "Entry",
      shortcut: "Shortcut",
      notifier: "Activity",
      status: "Status",
      noSelection: "No selection.",
      untitled: "Untitled",
      notifierIdle: "No recent event.",
      statusReady: "Ready",
    }),
    reader: Object.freeze({
      menuLabel: "Open Current View",
      commandDescription: "Open the current view summary.",
      selectionCommandLabel: "Open Current Snapshot",
      selectionCommandDescription: "Inspect the current selection.",
      toastTitle: "Current View",
      noActive: "No active view.",
      selectionToastTitle: "Current Snapshot",
      selectionToastEmpty: "No current selection is available.",
    }),
    react: Object.freeze({
      demoCommandLabel: "Open Optional Panel",
      demoCommandDescription: "Open the optional panel window.",
      surfaceTitle: "Optional Host Panel",
      surfaceMessage: "This panel confirms the optional lane can mount inside the host surface.",
      surfaceStatus: "Mounted in host section",
    }),
  });
}
