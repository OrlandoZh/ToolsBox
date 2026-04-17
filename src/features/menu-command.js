import { createSurfaceDescriptors } from "../app/surface-descriptors.js";

export function createMenuCommand({ host, logger, prefs, i18n, surfaceDescriptors = null }) {
  const descriptors = surfaceDescriptors && typeof surfaceDescriptors === "object"
    ? surfaceDescriptors
    : createSurfaceDescriptors();

  function execute(window = null, options = {}) {
    const location = typeof options.location === "string" && options.location
      ? options.location
      : "tools-menu";
    const showAlert = options.showAlert !== false;

    logger.info("command.execute", { location, showAlert });

    const title = i18n.t("cleanroom-dialog-title");
    const body = i18n.t("cleanroom-dialog-body");
    if (showAlert) {
      host.showAlert(window, title, body);
    }

    return {
      executed: true,
      location,
      showAlert,
    };
  }

  function mount(window) {
    const override = String(prefs.get("menuLabel") || "").trim();
    const label = override || i18n.t("cleanroom-menu-label");

    const remove = host.addToolsMenuItem(window, {
      id: descriptors.menuCommand.toolsMenuItemID,
      label,
      onCommand: () => execute(window),
    });

    return remove;
  }

  return {
    mount,
    execute,
  };
}
