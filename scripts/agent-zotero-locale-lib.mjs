import { promises as fs } from "node:fs";
import path from "node:path";

function createFTLSpec(value, attribute = null) {
  return Object.freeze({
    value,
    attribute,
  });
}

function normalizeFTLSpec(spec) {
  if (typeof spec === "string") {
    return {
      value: spec,
      attribute: null,
    };
  }
  if (!spec || typeof spec !== "object") {
    return null;
  }
  const value = typeof spec.value === "string" ? spec.value : null;
  if (!value) {
    return null;
  }
  const attribute = typeof spec.attribute === "string" && spec.attribute.trim()
    ? spec.attribute.trim()
    : null;
  return {
    value,
    attribute,
  };
}

function getBaselineFTLSpec(locale, key, registry = BASELINE_MAIN_FTL) {
  return normalizeFTLSpec(registry?.[locale]?.[key]);
}

export const BASELINE_ITEM_PANE_FTL = Object.freeze({
  "en-US": Object.freeze({
    "cleanroom-item-pane-info-row-label": createFTLSpec("Cleanroom Summary"),
    "cleanroom-item-pane-section-header": createFTLSpec("Cleanroom Demo", "label"),
    "cleanroom-item-pane-section-sidenav": createFTLSpec("Cleanroom Demo", "tooltiptext"),
  }),
  "zh-CN": Object.freeze({
    "cleanroom-item-pane-info-row-label": createFTLSpec("模板摘要"),
    "cleanroom-item-pane-section-header": createFTLSpec("模板示例", "label"),
    "cleanroom-item-pane-section-sidenav": createFTLSpec("模板示例", "tooltiptext"),
  }),
  "zh-TW": Object.freeze({
    "cleanroom-item-pane-info-row-label": createFTLSpec("範本摘要"),
    "cleanroom-item-pane-section-header": createFTLSpec("範本示例", "label"),
    "cleanroom-item-pane-section-sidenav": createFTLSpec("範本示例", "tooltiptext"),
  }),
});

export const BASELINE_PREFERENCE_PANE_FTL = Object.freeze({
  "en-US": Object.freeze({
    "cleanroom-pref-caption": createFTLSpec("Cleanroom Template Preferences", "label"),
    "cleanroom-pref-enabled": createFTLSpec("Enable plugin", "label"),
    "cleanroom-pref-menu-section": createFTLSpec("Menu", "label"),
    "cleanroom-pref-menu-label": createFTLSpec("Menu label", "value"),
    "cleanroom-pref-menu-hint": createFTLSpec("Leave empty to use localized default."),
    "cleanroom-pref-logging-section": createFTLSpec("Logging", "label"),
    "cleanroom-pref-log-level": createFTLSpec("Log level", "value"),
    "cleanroom-pref-theme-section": createFTLSpec("Theme", "label"),
    "cleanroom-pref-theme-mode": createFTLSpec("Theme mode", "value"),
    "cleanroom-pref-theme-follow-host": createFTLSpec("Follow Zotero", "label"),
    "cleanroom-pref-theme-light": createFTLSpec("Light", "label"),
    "cleanroom-pref-theme-dark": createFTLSpec("Dark", "label"),
    "cleanroom-pref-theme-hint": createFTLSpec("Apply only to plugin-owned UI surfaces, including this preference pane, without changing Zotero's global Appearance."),
  }),
  "zh-CN": Object.freeze({
    "cleanroom-pref-caption": createFTLSpec("Cleanroom 模板首选项", "label"),
    "cleanroom-pref-enabled": createFTLSpec("启用插件", "label"),
    "cleanroom-pref-menu-section": createFTLSpec("菜单", "label"),
    "cleanroom-pref-menu-label": createFTLSpec("菜单标签", "value"),
    "cleanroom-pref-menu-hint": createFTLSpec("留空使用默认本地化文案。"),
    "cleanroom-pref-logging-section": createFTLSpec("日志", "label"),
    "cleanroom-pref-log-level": createFTLSpec("日志等级", "value"),
    "cleanroom-pref-theme-section": createFTLSpec("主题", "label"),
    "cleanroom-pref-theme-mode": createFTLSpec("主题模式", "value"),
    "cleanroom-pref-theme-follow-host": createFTLSpec("跟随 Zotero", "label"),
    "cleanroom-pref-theme-light": createFTLSpec("浅色", "label"),
    "cleanroom-pref-theme-dark": createFTLSpec("深色", "label"),
    "cleanroom-pref-theme-hint": createFTLSpec("仅作用于插件拥有的界面，包括当前偏好设置面板，不会改变 Zotero 的全局外观。"),
  }),
  "zh-TW": Object.freeze({
    "cleanroom-pref-caption": createFTLSpec("Cleanroom 範本偏好設定", "label"),
    "cleanroom-pref-enabled": createFTLSpec("啟用外掛", "label"),
    "cleanroom-pref-menu-section": createFTLSpec("選單", "label"),
    "cleanroom-pref-menu-label": createFTLSpec("選單標籤", "value"),
    "cleanroom-pref-menu-hint": createFTLSpec("留空時使用預設本地化文案。"),
    "cleanroom-pref-logging-section": createFTLSpec("日誌", "label"),
    "cleanroom-pref-log-level": createFTLSpec("日誌等級", "value"),
    "cleanroom-pref-theme-section": createFTLSpec("主題", "label"),
    "cleanroom-pref-theme-mode": createFTLSpec("主題模式", "value"),
    "cleanroom-pref-theme-follow-host": createFTLSpec("跟隨 Zotero", "label"),
    "cleanroom-pref-theme-light": createFTLSpec("淺色", "label"),
    "cleanroom-pref-theme-dark": createFTLSpec("深色", "label"),
    "cleanroom-pref-theme-hint": createFTLSpec("僅作用於外掛擁有的介面，包括目前偏好設定面板，不會改變 Zotero 的全域外觀。"),
  }),
});

export const BASELINE_MENU_FTL = Object.freeze({
  "en-US": Object.freeze({
    "cleanroom-menu-label": createFTLSpec("Open Cleanroom Action"),
    "cleanroom-reader-menu-label": createFTLSpec("Show Reader Demo Summary"),
    "cleanroom-dialog-title": createFTLSpec("Cleanroom Template"),
    "cleanroom-dialog-body": createFTLSpec("Plugin command executed successfully."),
  }),
  "zh-CN": Object.freeze({
    "cleanroom-menu-label": createFTLSpec("打开模板动作"),
    "cleanroom-reader-menu-label": createFTLSpec("显示 Reader 示例摘要"),
    "cleanroom-dialog-title": createFTLSpec("模板插件"),
    "cleanroom-dialog-body": createFTLSpec("插件命令执行成功。"),
  }),
  "zh-TW": Object.freeze({
    "cleanroom-menu-label": createFTLSpec("開啟範本動作"),
    "cleanroom-reader-menu-label": createFTLSpec("顯示 Reader 示例摘要"),
    "cleanroom-dialog-title": createFTLSpec("範本外掛"),
    "cleanroom-dialog-body": createFTLSpec("外掛命令已成功執行。"),
  }),
});

export const BASELINE_MAIN_FTL = Object.freeze({
  "en-US": Object.freeze({
    ...BASELINE_MENU_FTL["en-US"],
    ...BASELINE_PREFERENCE_PANE_FTL["en-US"],
    ...BASELINE_ITEM_PANE_FTL["en-US"],
  }),
  "zh-CN": Object.freeze({
    ...BASELINE_MENU_FTL["zh-CN"],
    ...BASELINE_PREFERENCE_PANE_FTL["zh-CN"],
    ...BASELINE_ITEM_PANE_FTL["zh-CN"],
  }),
  "zh-TW": Object.freeze({
    ...BASELINE_MENU_FTL["zh-TW"],
    ...BASELINE_PREFERENCE_PANE_FTL["zh-TW"],
    ...BASELINE_ITEM_PANE_FTL["zh-TW"],
  }),
});

export function resolveLocaleMainFTLPath(locale) {
  return `addon-static/locale/${locale}/main.ftl`;
}

export function buildFTLMessageBlock(locale, key, valueOverride = null, registry = BASELINE_MAIN_FTL) {
  const spec = getBaselineFTLSpec(locale, key, registry);
  if (!spec) {
    return null;
  }
  const value = valueOverride === null ? spec.value : String(valueOverride);
  if (spec.attribute) {
    return `${key} =\n    .${spec.attribute} = ${value}`;
  }
  return `${key} = ${value}`;
}

export function buildExpectedFTLLine(locale, key) {
  return buildFTLMessageBlock(locale, key, null, BASELINE_ITEM_PANE_FTL);
}

export function buildExpectedMainFTLLine(locale, key) {
  return buildFTLMessageBlock(locale, key, null, BASELINE_MAIN_FTL);
}

export function buildBaselineLocaleMainFTLSource(locale) {
  const messages = BASELINE_MAIN_FTL?.[locale];
  if (!messages) {
    return null;
  }

  return `${Object.keys(messages)
    .map((key) => buildFTLMessageBlock(locale, key))
    .join("\n")}\n`;
}

export function parseFTLMessages(source) {
  const messages = new Map();
  let currentKey = null;
  String(source || "")
    .split(/\r?\n/u)
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return;
      }

      const match = line.match(/^([A-Za-z0-9._-]+)\s*=\s*(.*)$/u);
      if (!match) {
        const attributeMatch = currentKey
          ? line.match(/^\s+\.([A-Za-z0-9_-]+)\s*=\s*(.*)$/u)
          : null;
        if (attributeMatch && messages.has(currentKey)) {
          const entry = messages.get(currentKey);
          entry.attributes[attributeMatch[1]] = attributeMatch[2];
        }
        return;
      }
      currentKey = match[1];
      messages.set(match[1], {
        value: match[2] || null,
        attributes: {},
      });
    });
  return messages;
}

function readParsedFTLValue(entry) {
  if (!entry) {
    return null;
  }

  if (typeof entry.value === "string") {
    return entry.value;
  }

  return null;
}

function buildFTLMessageBlockFromParsedEntry(key, entry) {
  if (!key || !entry) {
    return null;
  }

  const lines = [];
  const directValue = typeof entry.value === "string" && entry.value.length > 0
    ? entry.value
    : null;
  const attributes = entry.attributes && typeof entry.attributes === "object"
    ? entry.attributes
    : {};
  const attributeEntries = Object.entries(attributes)
    .filter(([name, value]) => {
      return typeof name === "string"
        && name.trim()
        && typeof value === "string"
        && value.length > 0;
    });

  if (directValue !== null) {
    lines.push(`${key} = ${directValue}`);
  }
  else if (attributeEntries.length > 0) {
    lines.push(`${key} =`);
  }
  else {
    lines.push(`${key} =`);
  }

  attributeEntries.forEach(([name, value]) => {
    lines.push(`    .${name} = ${value}`);
  });

  return lines.join("\n");
}

function inspectFTLStructureDrift(locale, key, entry, expectedSpec, relativeFile, registry = BASELINE_ITEM_PANE_FTL) {
  if (!entry || !expectedSpec) {
    return null;
  }

  const actualAttributes = Object.keys(entry.attributes || {});
  const actualLine = buildFTLMessageBlockFromParsedEntry(key, entry);

  if (expectedSpec.attribute) {
    const actualAttributeValue = entry.attributes?.[expectedSpec.attribute];
    if (typeof actualAttributeValue === "string") {
      return null;
    }

    const directValue = readParsedFTLValue(entry);
    let reason = "attribute-missing";
    if (typeof directValue === "string" && directValue.trim()) {
      reason = "direct-value-used";
    }
    else if (actualAttributes.length > 0) {
      reason = "wrong-attribute";
    }

    return {
      locale,
      key,
      file: relativeFile,
      reason,
      expectedAttribute: expectedSpec.attribute,
      actualAttributes,
      expectedValue: expectedSpec.value,
      expectedLine: buildFTLMessageBlock(locale, key, null, registry),
      actualLine,
    };
  }

  const directValue = readParsedFTLValue(entry);
  if (directValue !== null) {
    return null;
  }

  return {
    locale,
    key,
    file: relativeFile,
    reason: actualAttributes.length > 0 ? "direct-value-missing" : "value-missing",
    expectedAttribute: null,
    actualAttributes,
    expectedValue: expectedSpec.value,
    expectedLine: buildFTLMessageBlock(locale, key, null, registry),
    actualLine,
  };
}

async function inspectBaselineLocaleFiles(projectRoot, registry) {
  const missingEntries = [];
  const valueDriftEntries = [];
  const structureDriftEntries = [];

  for (const [locale, expectedMessages] of Object.entries(registry)) {
    const relativeFile = resolveLocaleMainFTLPath(locale);
    const absoluteFile = path.join(projectRoot, relativeFile);
    let messages = new Map();
    let fileMissing = false;

    try {
      const source = await fs.readFile(absoluteFile, "utf-8");
      messages = parseFTLMessages(source);
    }
    catch {
      fileMissing = true;
    }

    for (const key of Object.keys(expectedMessages)) {
      const expectedSpec = getBaselineFTLSpec(locale, key, registry);
      if (!expectedSpec) {
        continue;
      }

      if (messages.has(key)) {
        const entry = messages.get(key);
        const structureDrift = inspectFTLStructureDrift(locale, key, entry, expectedSpec, relativeFile, registry);
        if (structureDrift) {
          structureDriftEntries.push(structureDrift);
          continue;
        }

        const actualValue = expectedSpec.attribute
          ? entry.attributes[expectedSpec.attribute]
          : readParsedFTLValue(entry);
        const expectedValue = expectedSpec.value;
        if (actualValue !== expectedValue) {
          valueDriftEntries.push({
            locale,
            key,
            file: relativeFile,
            expectedValue,
            actualValue,
            expectedLine: buildFTLMessageBlock(locale, key, null, registry),
            actualLine: buildFTLMessageBlockFromParsedEntry(key, entry),
            reason: "value-drift",
          });
        }
        continue;
      }

      missingEntries.push({
        locale,
        key,
        file: relativeFile,
        expectedValue: expectedSpec.value,
        expectedLine: buildFTLMessageBlock(locale, key, null, registry),
        reason: fileMissing ? "file-missing" : "key-missing",
      });
    }
  }

  return {
    ok: missingEntries.length === 0 && valueDriftEntries.length === 0 && structureDriftEntries.length === 0,
    missingCount: missingEntries.length,
    missingEntries,
    valueDriftCount: valueDriftEntries.length,
    valueDriftEntries,
    structureDriftCount: structureDriftEntries.length,
    structureDriftEntries,
    driftCount: valueDriftEntries.length + structureDriftEntries.length,
    driftEntries: [
      ...valueDriftEntries,
      ...structureDriftEntries,
    ],
    checkedFiles: Object.keys(registry).map((locale) => resolveLocaleMainFTLPath(locale)),
  };
}

export async function inspectBaselineItemPaneLocaleFiles(projectRoot) {
  return inspectBaselineLocaleFiles(projectRoot, BASELINE_ITEM_PANE_FTL);
}

export async function inspectBaselineMainLocaleFiles(projectRoot) {
  return inspectBaselineLocaleFiles(projectRoot, BASELINE_MAIN_FTL);
}
