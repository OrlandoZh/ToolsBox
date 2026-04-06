import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, assert } from "./test-framework.js";
import { inspectDefaultPreferencePaneBridge } from "../scripts/preference-pane-governance-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

describe("Preference Pane Governance Lib", () => {
  it("should accept the current template preference pane bridge contract", async () => {
    const result = await inspectDefaultPreferencePaneBridge(projectRoot);

    assert.equal(result.ok, true);
    assert.deepEqual(result.issues, []);
    assert.equal(result.checkedFiles.includes("addon-static/content/preferences.js"), true);
    assert.equal(result.checkedFiles.includes("src/app/feature-composer.js"), true);
    assert.equal(result.checkedFiles.includes("addon-static/content/preferences.xhtml"), true);
  });

  it("should reject preference controllers that scan Zotero globals", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-pref-guard-"));
    fs.mkdirSync(path.join(tempRoot, "addon-static", "content"), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, "src", "app"), { recursive: true });

    fs.writeFileSync(path.join(tempRoot, "addon-static", "content", "preferences.js"), `
const WINDOW_BRIDGE_KEY = "__CLEANROOM_PREFERENCE_BRIDGE__";
const bridge = window[WINDOW_BRIDGE_KEY];
const zotero = window.Zotero;
window.initCleanroomPreferences = function initCleanroomPreferences() {
  return { bridge, zotero };
};
`, "utf-8");
    fs.writeFileSync(path.join(tempRoot, "src", "app", "feature-composer.js"), `
export function registerPane(scriptLoader, resolveURI, window, bridge) {
  window.__CLEANROOM_PREFERENCE_BRIDGE__ = bridge;
  scriptLoader.loadSubScript(resolveURI("content/theme.js"), window);
  scriptLoader.loadSubScript(resolveURI("content/preferences.js"), window);
  if (typeof window.initCleanroomPreferences !== "function") {
    throw new Error("missing init");
  }
  return window.initCleanroomPreferences({
    bridge,
  });
}
`, "utf-8");

    const result = await inspectDefaultPreferencePaneBridge(tempRoot);

    assert.equal(result.ok, false);
    assert.equal(result.issues.some((issue) => issue.file === "addon-static/content/preferences.js" && issue.reason === "forbidden-fragment-found"), true);

    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("should reject feature composers that skip the bridge handoff", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-pref-guard-composer-"));
    fs.mkdirSync(path.join(tempRoot, "addon-static", "content"), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, "src", "app"), { recursive: true });

    fs.writeFileSync(path.join(tempRoot, "addon-static", "content", "preferences.js"), `
const WINDOW_BRIDGE_KEY = "__CLEANROOM_PREFERENCE_BRIDGE__";
function getBridge() {
  const bridge = window[WINDOW_BRIDGE_KEY];
  return bridge;
}
window.initCleanroomPreferences = function initCleanroomPreferences() {
  return { bridge: getBridge() };
};
`, "utf-8");
    fs.writeFileSync(path.join(tempRoot, "src", "app", "feature-composer.js"), `
export function registerPane(scriptLoader, resolveURI, window, bridge) {
  scriptLoader.loadSubScript(resolveURI("content/theme.js"), window);
  scriptLoader.loadSubScript(resolveURI("content/preferences.js"), window);
  if (typeof window.initCleanroomPreferences !== "function") {
    throw new Error("missing init");
  }
  return window.initCleanroomPreferences({
    bridge,
  });
}
`, "utf-8");

    const result = await inspectDefaultPreferencePaneBridge(tempRoot);

    assert.equal(result.ok, false);
    assert.equal(result.issues.some((issue) => issue.file === "src/app/feature-composer.js" && issue.label === "window bridge write"), true);

    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("should reject preference pane templates that keep hardcoded english strings", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-pref-guard-template-"));
    fs.mkdirSync(path.join(tempRoot, "addon-static", "content"), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, "src", "app"), { recursive: true });

    fs.writeFileSync(path.join(tempRoot, "addon-static", "content", "preferences.js"), `
const WINDOW_BRIDGE_KEY = "__CLEANROOM_PREFERENCE_BRIDGE__";
const bridge = window[WINDOW_BRIDGE_KEY];
function applyBridgeLocalization() {
  return { bridge };
}
function requestFluentTranslation() {
  return true;
}
function initCleanroomPreferences() {
  const bridgeLocalization = applyBridgeLocalization({
    bridge,
  });
  const fluentTranslationRequested = requestFluentTranslation(root);
  return { bridgeLocalization, fluentTranslationRequested };
}
window.initCleanroomPreferences = initCleanroomPreferences;
`, "utf-8");
    fs.writeFileSync(path.join(tempRoot, "src", "app", "feature-composer.js"), `
export function registerPane(scriptLoader, resolveURI, window, bridge, i18n) {
  const payload = {
    addonRef: "cleanroomtemplate",
    locale: i18n.locale,
    pluginID: "cleanroom-template@example.com",
    instanceKey: "CleanroomTemplate",
    strings: typeof i18n.getBundle === "function" ? i18n.getBundle() : null,
  };
  window.__CLEANROOM_PREFERENCE_BRIDGE__ = payload;
  if (typeof window?.MozXULElement?.insertFTLIfNeeded === "function") {
    window.MozXULElement.insertFTLIfNeeded("main.ftl");
  }
  scriptLoader.loadSubScript(resolveURI("content/theme.js"), window);
  scriptLoader.loadSubScript(resolveURI("content/preferences.js"), window);
  if (typeof window.initCleanroomPreferences !== "function") {
    throw new Error("missing init");
  }
  return window.initCleanroomPreferences({
    bridge: payload,
  });
}
`, "utf-8");
    fs.writeFileSync(path.join(tempRoot, "addon-static", "content", "preferences.xhtml"), `
<vbox>
  <groupbox>
    <caption label="Cleanroom Template Preferences" />
  </groupbox>
</vbox>
`, "utf-8");

    const result = await inspectDefaultPreferencePaneBridge(tempRoot);

    assert.equal(result.ok, false);
    assert.equal(result.issues.some((issue) => issue.file === "addon-static/content/preferences.xhtml" && issue.reason === "required-fragment-missing"), true);

    fs.rmSync(tempRoot, { recursive: true, force: true });
  });
});
