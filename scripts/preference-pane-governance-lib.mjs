import { promises as fs } from "node:fs";
import path from "node:path";

export const DEFAULT_PREFERENCE_PANE_CONTROLLER_FILES = Object.freeze({
  controller: "addon-static/content/preferences.js",
  composer: "src/app/feature-composer.js",
  template: "addon-static/content/preferences.xhtml",
});

const REQUIRED_CONTROLLER_FRAGMENTS = Object.freeze([
  Object.freeze({
    label: "bridge-key",
    fragment: 'const WINDOW_BRIDGE_KEY = "__CLEANROOM_PREFERENCE_BRIDGE__";',
  }),
  Object.freeze({
    label: "bridge-read",
    fragment: "const bridge = window[WINDOW_BRIDGE_KEY];",
  }),
  Object.freeze({
    label: "controller-export",
    fragment: "window.initCleanroomPreferences = initCleanroomPreferences;",
  }),
  Object.freeze({
    label: "bridge localization",
    fragment: "const bridgeLocalization = applyBridgeLocalization({",
  }),
  Object.freeze({
    label: "fluent translation request",
    fragment: "const fluentTranslationRequested = requestFluentTranslation(root);",
  }),
]);

const FORBIDDEN_CONTROLLER_PATTERNS = Object.freeze([
  Object.freeze({
    label: "globalThis.Zotero scan",
    pattern: /globalThis\.Zotero/u,
  }),
  Object.freeze({
    label: "window.Zotero scan",
    pattern: /window\.Zotero/u,
  }),
  Object.freeze({
    label: "direct Zotero instance scan",
    pattern: /(?:^|[^\w.])Zotero\s*\[/u,
  }),
]);

const REQUIRED_COMPOSER_FRAGMENTS = Object.freeze([
  Object.freeze({
    label: "onPreferenceLoad hook",
    fragment: "onPreferenceLoad({ window, paneID, pluginID, resolveURI }) {",
  }),
  Object.freeze({
    label: "window bridge write",
    fragment: "window.__CLEANROOM_PREFERENCE_BRIDGE__ = bridge;",
  }),
  Object.freeze({
    label: "bridge locale",
    fragment: "locale: i18n.locale,",
  }),
  Object.freeze({
    label: "bridge strings",
    fragment: 'strings: typeof i18n.getBundle === "function" ? i18n.getBundle() : null,',
  }),
  Object.freeze({
    label: "preference pane ftl insert",
    fragment: 'window.MozXULElement.insertFTLIfNeeded("main.ftl");',
  }),
  Object.freeze({
    label: "theme script load",
    fragment: 'scriptLoader.loadSubScript(resolveURI("content/theme.js"), window);',
  }),
  Object.freeze({
    label: "controller script load",
    fragment: 'scriptLoader.loadSubScript(resolveURI("content/preferences.js"), window);',
  }),
  Object.freeze({
    label: "controller init guard",
    fragment: 'if (typeof window.initCleanroomPreferences !== "function") {',
  }),
  Object.freeze({
    label: "controller init call",
    fragment: "return window.initCleanroomPreferences({",
  }),
]);

const REQUIRED_TEMPLATE_FRAGMENTS = Object.freeze([
  Object.freeze({
    label: "preference root id",
    fragment: 'id="cleanroomtemplate-preferences-root"',
  }),
  Object.freeze({
    label: "preference root marker",
    fragment: 'data-pref-root="true"',
  }),
  Object.freeze({
    label: "preference root layout state",
    fragment: 'data-pref-layout="inline"',
  }),
  Object.freeze({
    label: "caption l10n id",
    fragment: 'data-l10n-id="cleanroom-pref-caption"',
  }),
  Object.freeze({
    label: "enabled l10n id",
    fragment: 'data-l10n-id="cleanroom-pref-enabled"',
  }),
  Object.freeze({
    label: "menu section l10n id",
    fragment: 'data-l10n-id="cleanroom-pref-menu-section"',
  }),
  Object.freeze({
    label: "logging section l10n id",
    fragment: 'data-l10n-id="cleanroom-pref-logging-section"',
  }),
  Object.freeze({
    label: "theme section l10n id",
    fragment: 'data-l10n-id="cleanroom-pref-theme-section"',
  }),
  Object.freeze({
    label: "theme follow host l10n id",
    fragment: 'data-l10n-id="cleanroom-pref-theme-follow-host"',
  }),
  Object.freeze({
    label: "field row class",
    fragment: 'class="cleanroom-pref-field-row"',
  }),
  Object.freeze({
    label: "control wrap class",
    fragment: 'class="cleanroom-pref-control-wrap"',
  }),
]);

const FORBIDDEN_TEMPLATE_PATTERNS = Object.freeze([
  Object.freeze({
    label: "legacy hardcoded preference caption",
    pattern: /label="Cleanroom Template Preferences"/u,
  }),
  Object.freeze({
    label: "legacy hardcoded theme hint",
    pattern: /Apply only to plugin-owned UI surfaces/u,
  }),
]);

async function readSource(projectRoot, relativeFile) {
  const absoluteFile = path.join(projectRoot, relativeFile);
  try {
    return await fs.readFile(absoluteFile, "utf-8");
  }
  catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function buildMissingFileIssue(file) {
  return {
    file,
    reason: "file-missing",
    label: "file missing",
    message: `${file} is missing.`,
  };
}

function collectFragmentIssues(source, file, fragments) {
  return fragments
    .filter((entry) => !source.includes(entry.fragment))
    .map((entry) => {
      return {
        file,
        reason: "required-fragment-missing",
        label: entry.label,
        fragment: entry.fragment,
        message: `${file} is missing required fragment '${entry.label}'.`,
      };
    });
}

function collectForbiddenPatternIssues(source, file, entries) {
  return entries
    .filter((entry) => entry.pattern.test(source))
    .map((entry) => {
      return {
        file,
        reason: "forbidden-fragment-found",
        label: entry.label,
        pattern: String(entry.pattern),
        message: `${file} contains forbidden pattern '${entry.label}'.`,
      };
    });
}

export async function inspectDefaultPreferencePaneBridge(projectRoot) {
  const controllerFile = DEFAULT_PREFERENCE_PANE_CONTROLLER_FILES.controller;
  const composerFile = DEFAULT_PREFERENCE_PANE_CONTROLLER_FILES.composer;
  const templateFile = DEFAULT_PREFERENCE_PANE_CONTROLLER_FILES.template;
  const issues = [];

  const controllerSource = await readSource(projectRoot, controllerFile);
  if (controllerSource === null) {
    issues.push(buildMissingFileIssue(controllerFile));
  }
  else {
    issues.push(
      ...collectFragmentIssues(controllerSource, controllerFile, REQUIRED_CONTROLLER_FRAGMENTS),
      ...collectForbiddenPatternIssues(controllerSource, controllerFile, FORBIDDEN_CONTROLLER_PATTERNS),
    );
  }

  const composerSource = await readSource(projectRoot, composerFile);
  if (composerSource === null) {
    issues.push(buildMissingFileIssue(composerFile));
  }
  else {
    issues.push(...collectFragmentIssues(composerSource, composerFile, REQUIRED_COMPOSER_FRAGMENTS));
  }

  const templateSource = await readSource(projectRoot, templateFile);
  if (templateSource === null) {
    issues.push(buildMissingFileIssue(templateFile));
  }
  else {
    issues.push(
      ...collectFragmentIssues(templateSource, templateFile, REQUIRED_TEMPLATE_FRAGMENTS),
      ...collectForbiddenPatternIssues(templateSource, templateFile, FORBIDDEN_TEMPLATE_PATTERNS),
    );
  }

  return {
    ok: issues.length === 0,
    issues,
    checkedFiles: [
      controllerFile,
      composerFile,
      templateFile,
    ],
  };
}
