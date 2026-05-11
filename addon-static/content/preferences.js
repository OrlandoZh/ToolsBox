const WINDOW_BRIDGE_KEY = "__CLEANROOM_PREFERENCE_BRIDGE__";
const INIT_API_KEY = "initCleanroomPreferences";

const bridge = window[WINDOW_BRIDGE_KEY];

function applyBridgeLocalization({ bridge: localizationBridge, root }) {
  const fluentTranslationRequested = requestFluentTranslation(root);

  if (fluentTranslationRequested && localizationBridge && localizationBridge.strings) {
    const bundle = localizationBridge.strings;
    const elements = root.querySelectorAll("[data-l10n-id]");
    elements.forEach(element => {
      const id = element.getAttribute("data-l10n-id");
      const message = bundle.getMessage(id);
      if (message && message.value) {
        element.textContent = message.value;
      }
    });
  }
}

function requestFluentTranslation(root) {
  try {
    if (root.querySelector("[data-l10n-id]")) {
      return true;
    }
  } catch (e) {
    return false;
  }
  return false;
}

function initCleanroomPreferences({ bridge: bridgeArg, root }) {
  const currentBridge = bridge || bridgeArg;
  const bridgeLocalization = applyBridgeLocalization({
    bridge: currentBridge,
    root,
  });

  const fluentTranslationRequested = requestFluentTranslation(root);

  return {
    bridgeLocalization,
    fluentTranslationRequested,
  };
}

window[INIT_API_KEY] = initCleanroomPreferences;
