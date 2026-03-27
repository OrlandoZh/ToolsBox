# Build Details Checklist

## A. Configuration Layer
- [ ] Set plugin metadata in `config/addon.config.json`:
  - `addonName`, `addonId`, `addonRef`, `addonVersion`
  - `strictMinVersion`, `strictMaxVersion`
  - `prefsPrefix`, `instanceKey`
  - `icons` (optional)
  - `updateURL` (required for Zotero 7/8 installation)
- [ ] Define defaults under `defaultPrefs`.

## B. Static Runtime Layer
- [ ] `addon-static/bootstrap.js` handles addon lifecycle and script loading.
- [ ] `addon-static/content/preferences.xhtml` exists for settings surface.
- [ ] `addon-static/content/style/main.css` exists for main-window baseline styles.
- [ ] Icon files referenced by `config/addon.config.json > icons` exist under `addon-static/content/icons/`.
- [ ] Preferences placeholders (`__PREFS_PREFIX__`) are replaced during build.
- [ ] Baseline locale files exist in `addon-static/locale/en-US/main.ftl`, `addon-static/locale/zh-CN/main.ftl`, `addon-static/locale/zh-TW/main.ftl`.

## C. Source Architecture Layer
- [ ] Core services implemented in `src/core`.
- [ ] Feature modules isolated in `src/features`.
- [ ] Zotero API boundary only in `src/platform/zotero-host.js`.
- [ ] Composition logic only in `src/app/plugin.js`.
- [ ] Entrypoint exported in `src/main.js`.
- [ ] Runtime phase guard prevents duplicate startup/shutdown transitions.
- [ ] Existing Zotero windows are mounted at plugin startup.
- [ ] Pref changes (`enabled`, `menuLabel`, `logLevel`) are handled without restart.

## D. Build Execution Layer
- [ ] `npm run verify` passes and catches missing static runtime baselines (`bootstrap.js` / `preferences.xhtml` / `main.css` / locale `main.ftl` / configured icons).
- [ ] `npm run lint` passes.
- [ ] `npm run format:check` passes.
- [ ] `npm run typecheck` passes.
- [ ] `npm run check` passes.
- [ ] `npm run build` generates `build/<addonRef>/manifest.json`.
- [ ] `build/<addonRef>/manifest.json` contains non-empty `applications.zotero.update_url`.
- [ ] Bundled runtime generated at `build/<addonRef>/content/scripts/<addonRef>.js`.
- [ ] `build/<addonRef>/prefs.js` contains default prefs.
- [ ] `build/<addonRef>/content/preferences.xhtml` uses correct pref prefix.
- [ ] `build/<addonRef>/build-report.json` generated.

## E. Packaging Layer
- [ ] `npm run package` produces `dist/<addonRef>-<addonVersion>.xpi`.
- [ ] `npm run release:metadata` produces `dist/update.json` and `dist/release-manifest.json`.
- [ ] `npm run release:preflight` produces `dist/release-preflight.json` with integrity metadata.
- [ ] `npm run release:prepare` produces `dist/release-plan.json` and `dist/release-notes.md`.
- [ ] `npm run agent:monitor` produces `dist/agent-monitor.json` and `dist/agent-monitor.md`, including Zotero watch summary plus latest E2E/autofix validation state when available.
- [ ] `npm run agent:dashboard` produces `dist/agent-dashboard.html` with visible Zotero watch status and Zotero validation summary.
- [ ] `npm run agent:gate` produces `dist/agent-gate.json` and `dist/agent-gate.md`, and blocks dev gate on invalid Zotero watch status plus failed or stale Zotero E2E validation.
- [ ] `npm run agent:zotero:e2e` produces `dist/agent-zotero-e2e.json` and `dist/agent-zotero-e2e.md`.
- [ ] `npm run agent:zotero:autofix` produces `dist/agent-zotero-autofix.json` and `dist/agent-zotero-autofix.md`.
- [ ] `npm run zotero:scenario` validates `zotero-scenarios/*.scenario.js` in real Zotero.
- [ ] XPI includes `manifest.json`, `bootstrap.js`, `content/`, `prefs.js`.

## F. Risk-Control Layer
- [ ] `SPEC.md` updated before feature coding.
- [ ] `LEGAL_RISK_CHECKLIST.md` completed before distribution.
- [ ] Similarity checks executed and reviewed (`npm run sim`).
