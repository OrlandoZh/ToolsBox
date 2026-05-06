export function createCopyFallbacks() {
  return Object.freeze({
    command: Object.freeze({
      label: "Open ToolsBox",
      description: "Open the local ToolsBox workflow action.",
      disabled: "Plugin is disabled. Re-enable it in preferences first.",
    }),
    shortcut: Object.freeze({
      description: "Show the ToolsBox shortcut status toast.",
      toastTitle: "ToolsBox Shortcut",
    }),
    demo: Object.freeze({
      item: "Item",
      shortcut: "Shortcut",
      notifier: "Notifier",
      status: "Status",
      noSelection: "No item selected.",
      untitled: "Untitled item",
      notifierIdle: "No notifier event yet.",
      statusReady: "Ready",
    }),
    reader: Object.freeze({
      menuLabel: "Open Current View",
      commandDescription: "Show the active reader summary.",
      selectionCommandLabel: "Show Reader Selection Snapshot",
      selectionCommandDescription: "Inspect the current reader selection.",
      toastTitle: "ToolsBox Reader",
      noActive: "No active reader tab.",
      selectionToastTitle: "Reader Selection",
      selectionToastEmpty: "No reader selection is currently available.",
    }),
    react: Object.freeze({
      demoCommandLabel: "Open Optional Panel",
      demoCommandDescription: "Open the default-disabled optional panel.",
      surfaceTitle: "Optional React Host Surface",
      surfaceMessage: "This item pane section proves the optional React lane can mount inside a real Zotero host surface while the JS core keeps ownership of lifecycle and evidence.",
      surfaceStatus: "Mounted through the item pane section",
    }),
  });
}
