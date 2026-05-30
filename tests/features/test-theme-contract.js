/**
 * Tests for Theme Contract feature
 * Theme mode constants, normalization, and element application
 */

import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import {
  THEME_MODES,
  THEME_MODE_VALUES,
  FORCED_THEME_TOKENS,
  normalizeThemeMode,
  detectHostTheme,
  resolveEffectiveTheme,
  applyThemeToElement,
  clearThemeFromElement,
  attachMediaQueryListener,
  observeThemeOnElement,
} from "../../src/features/theme-contract.js";

function createMockElement() {
  const style = {};
  const dataset = {};
  const attributes = {};
  return {
    style,
    dataset,
    attributes,
    setAttribute(name, value) {
      attributes[name] = value;
    },
    getAttribute(name) {
      return attributes[name];
    },
    removeAttribute(name) {
      delete attributes[name];
    },
  };
}

function createMockMediaQueryList(matches = false) {
  let listener = null;
  return {
    matches,
    addEventListener(type, handler) {
      if (type === "change") listener = handler;
    },
    removeEventListener(type, handler) {
      if (listener === handler) listener = null;
    },
    simulateChange() {
      if (listener) listener({ matches: !matches });
    },
  };
}

describe("ThemeContract", () => {
  it("should export THEME_MODES with expected values", () => {
    assert.equal(THEME_MODES.FOLLOW_HOST, "follow-host", "FOLLOW_HOST should be 'follow-host'");
    assert.equal(THEME_MODES.LIGHT, "light", "LIGHT should be 'light'");
    assert.equal(THEME_MODES.DARK, "dark", "DARK should be 'dark'");
  });

  it("should export THEME_MODE_VALUES as frozen array of valid modes", () => {
    assert.ok(Array.isArray(THEME_MODE_VALUES), "THEME_MODE_VALUES should be an array");
    assert.equal(THEME_MODE_VALUES.length, 3, "should have 3 modes");
    assert.ok(THEME_MODE_VALUES.includes("follow-host"), "should include follow-host");
    assert.ok(THEME_MODE_VALUES.includes("light"), "should include light");
    assert.ok(THEME_MODE_VALUES.includes("dark"), "should include dark");
  });

  it("should export FORCED_THEME_TOKENS with light and dark variants", () => {
    assert.ok(FORCED_THEME_TOKENS.light, "should have light tokens");
    assert.ok(FORCED_THEME_TOKENS.dark, "should have dark tokens");
    const lightKeys = Object.keys(FORCED_THEME_TOKENS.light);
    const darkKeys = Object.keys(FORCED_THEME_TOKENS.dark);
    assert.equal(lightKeys.length, darkKeys.length, "light and dark should have same keys");
    assert.ok(lightKeys.includes("--cleanroom-theme-background"), "should have background token");
    assert.ok(lightKeys.includes("--cleanroom-theme-accent"), "should have accent token");
  });

  it("normalizeThemeMode should return valid mode or fallback", () => {
    assert.equal(normalizeThemeMode("light"), "light", "should accept light");
    assert.equal(normalizeThemeMode("dark"), "dark", "should accept dark");
    assert.equal(normalizeThemeMode("follow-host"), "follow-host", "should accept follow-host");
    assert.equal(normalizeThemeMode("auto"), "follow-host", "should map auto to follow-host");
    assert.equal(normalizeThemeMode("invalid"), "follow-host", "should fallback for invalid");
    assert.equal(normalizeThemeMode("", "dark"), "dark", "should use explicit fallback");
    assert.equal(normalizeThemeMode(null), "follow-host", "should fallback for null");
  });

  it("detectHostTheme should return light or dark based on media query", () => {
    const darkQuery = createMockMediaQueryList(true);
    const lightQuery = createMockMediaQueryList(false);
    assert.equal(detectHostTheme(null, darkQuery), "dark", "should detect dark");
    assert.equal(detectHostTheme(null, lightQuery), "light", "should detect light");
    assert.equal(detectHostTheme(null, null), "light", "should fallback to light without query");
  });

  it("resolveEffectiveTheme should resolve follow-host to detected theme", () => {
    const darkQuery = createMockMediaQueryList(true);
    assert.equal(resolveEffectiveTheme("light"), "light", "light stays light");
    assert.equal(resolveEffectiveTheme("dark"), "dark", "dark stays dark");
    assert.equal(resolveEffectiveTheme("follow-host", null, darkQuery), "dark", "follow-host resolves to dark");
  });

  it("applyThemeToElement should set data attributes and styles", () => {
    const el = createMockElement();
    const result = applyThemeToElement(el, { mode: "dark" });
    assert.equal(result.mode, "dark", "should return dark mode");
    assert.equal(result.effectiveTheme, "dark", "should return dark effective theme");
    assert.equal(result.applied, true, "should indicate applied");
    assert.equal(el.dataset.cleanroomThemeMode, "dark", "should set data attribute");
    assert.equal(el.dataset.cleanroomTheme, "dark", "should set theme data attribute");
    assert.ok(el.style["color-scheme"], "should set color-scheme");
  });

  it("applyThemeToElement should return not applied for null target", () => {
    const result = applyThemeToElement(null, { mode: "light" });
    assert.equal(result.applied, false, "should not apply to null");
    assert.equal(result.effectiveTheme, "light", "should still resolve effective theme");
  });

  it("clearThemeFromElement should remove data attributes and styles", () => {
    const el = createMockElement();
    applyThemeToElement(el, { mode: "dark" });
    const cleared = clearThemeFromElement(el);
    assert.equal(cleared, true, "should return true");
    assert.notOk(el.dataset.cleanroomThemeMode, "should remove mode attribute");
    assert.notOk(el.dataset.cleanroomTheme, "should remove theme attribute");
  });

  it("clearThemeFromElement should return false for null target", () => {
    assert.equal(clearThemeFromElement(null), false, "should return false for null");
  });

  it("attachMediaQueryListener should return cleanup function", () => {
    const query = createMockMediaQueryList();
    const handler = () => {};
    const cleanup = attachMediaQueryListener(query, handler);
    assert.typeOf(cleanup, "function", "should return a function");
    assert.doesNotThrow(() => cleanup(), "cleanup should not throw");
  });

  it("attachMediaQueryListener should return noop for invalid inputs", () => {
    const noop = attachMediaQueryListener(null, () => {});
    assert.typeOf(noop, "function", "should return function for null query");
    const noop2 = attachMediaQueryListener(createMockMediaQueryList(), null);
    assert.typeOf(noop2, "function", "should return function for null handler");
  });

  it("observeThemeOnElement should return refresh, dispose, and getState", () => {
    const el = createMockElement();
    const observer = observeThemeOnElement(el, { mode: "light" });
    assert.typeOf(observer.refresh, "function", "should have refresh");
    assert.typeOf(observer.dispose, "function", "should have dispose");
    assert.typeOf(observer.getState, "function", "should have getState");
    const state = observer.getState();
    assert.equal(state.mode, "light", "state should reflect mode");
    assert.equal(state.applied, true, "state should indicate applied");
    observer.dispose();
  });

  it("observeThemeOnElement dispose should clear theme", () => {
    const el = createMockElement();
    const observer = observeThemeOnElement(el, { mode: "dark", clearOnDispose: true });
    observer.dispose();
    assert.notOk(el.dataset.cleanroomTheme, "should clear theme on dispose");
  });
});

await runTestsIfMain(import.meta.url);
