export function createCopyFallbacks() {
  return Object.freeze({
    command: Object.freeze({
      label: "Open Cleanroom Action",
      description: "Run the default clean-room template action.",
      disabled: "Plugin is disabled. Re-enable it in preferences first.",
    }),
    shortcut: Object.freeze({
      description: "Show the clean-room shortcut demo toast.",
      toastTitle: "Cleanroom Shortcut",
    }),
    demo: Object.freeze({
      item: "Item",
      shortcut: "Shortcut",
      notifier: "Notifier",
      status: "Status",
      noSelection: "No item selected.",
      untitled: "Untitled item",
      notifierIdle: "No notifier event yet.",
      statusReady: "Baseline demos ready",
    }),
    reader: Object.freeze({
      menuLabel: "Show Reader Demo Summary",
      commandDescription: "Show the active reader summary.",
      selectionCommandLabel: "Show Reader Selection Snapshot",
      selectionCommandDescription: "Inspect the current reader selection.",
      toastTitle: "Cleanroom Reader",
      noActive: "No active reader tab.",
      selectionToastTitle: "Reader Selection",
      selectionToastEmpty: "No reader selection is currently available.",
    }),
    react: Object.freeze({
      demoCommandLabel: "Open Optional React UI Demo",
      demoCommandDescription: "Open the default-disabled React UI demo window.",
      surfaceTitle: "Optional React Host Surface",
      surfaceMessage: "This item pane section proves the optional React lane can mount inside a real Zotero host surface while the JS core keeps ownership of lifecycle and evidence.",
      surfaceStatus: "Mounted through the item pane section",
    }),
  });
}
