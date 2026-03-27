import { promises as fs } from "node:fs";
import path from "node:path";

export const BASELINE_ITEM_PANE_FTL = Object.freeze({
  "en-US": Object.freeze({
    "cleanroom-item-pane-info-row-label": "Cleanroom Summary",
    "cleanroom-item-pane-section-header": "Cleanroom Demo",
    "cleanroom-item-pane-section-sidenav": "Cleanroom Demo",
  }),
  "zh-CN": Object.freeze({
    "cleanroom-item-pane-info-row-label": "模板摘要",
    "cleanroom-item-pane-section-header": "模板示例",
    "cleanroom-item-pane-section-sidenav": "模板示例",
  }),
  "zh-TW": Object.freeze({
    "cleanroom-item-pane-info-row-label": "範本摘要",
    "cleanroom-item-pane-section-header": "範本示例",
    "cleanroom-item-pane-section-sidenav": "範本示例",
  }),
});

export const BASELINE_MAIN_FTL = Object.freeze({
  "en-US": Object.freeze({
    "cleanroom-menu-label": "Open Cleanroom Action",
    "cleanroom-dialog-title": "Cleanroom Template",
    "cleanroom-dialog-body": "Plugin command executed successfully.",
    ...BASELINE_ITEM_PANE_FTL["en-US"],
  }),
  "zh-CN": Object.freeze({
    "cleanroom-menu-label": "打开模板动作",
    "cleanroom-dialog-title": "模板插件",
    "cleanroom-dialog-body": "插件命令执行成功。",
    ...BASELINE_ITEM_PANE_FTL["zh-CN"],
  }),
  "zh-TW": Object.freeze({
    "cleanroom-menu-label": "開啟範本動作",
    "cleanroom-dialog-title": "範本外掛",
    "cleanroom-dialog-body": "外掛命令已成功執行。",
    ...BASELINE_ITEM_PANE_FTL["zh-TW"],
  }),
});

export function resolveLocaleMainFTLPath(locale) {
  return `addon-static/locale/${locale}/main.ftl`;
}

export function buildExpectedFTLLine(locale, key) {
  const value = BASELINE_ITEM_PANE_FTL?.[locale]?.[key];
  if (!value) {
    return null;
  }
  return `${key} = ${value}`;
}

export function buildBaselineLocaleMainFTLSource(locale) {
  const messages = BASELINE_MAIN_FTL?.[locale];
  if (!messages) {
    return null;
  }

  return `${Object.entries(messages)
    .map(([key, value]) => `${key} = ${value}`)
    .join("\n")}\n`;
}

export function parseFTLMessages(source) {
  const messages = new Map();
  String(source || "")
    .split(/\r?\n/u)
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return;
      }

      const match = trimmed.match(/^([A-Za-z0-9._-]+)\s*=\s*(.*)$/u);
      if (!match) {
        return;
      }
      messages.set(match[1], match[2]);
    });
  return messages;
}

export async function inspectBaselineItemPaneLocaleFiles(projectRoot) {
  const missingEntries = [];
  const driftEntries = [];

  for (const [locale, expectedMessages] of Object.entries(BASELINE_ITEM_PANE_FTL)) {
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
      if (messages.has(key)) {
        const actualValue = messages.get(key);
        const expectedValue = expectedMessages[key];
        if (actualValue !== expectedValue) {
          driftEntries.push({
            locale,
            key,
            file: relativeFile,
            expectedValue,
            actualValue,
            expectedLine: buildExpectedFTLLine(locale, key),
            actualLine: `${key} = ${actualValue}`,
            reason: "value-drift",
          });
        }
        continue;
      }

      missingEntries.push({
        locale,
        key,
        file: relativeFile,
        expectedValue: expectedMessages[key],
        expectedLine: buildExpectedFTLLine(locale, key),
        reason: fileMissing ? "file-missing" : "key-missing",
      });
    }
  }

  return {
    ok: missingEntries.length === 0 && driftEntries.length === 0,
    missingCount: missingEntries.length,
    missingEntries,
    driftCount: driftEntries.length,
    driftEntries,
    checkedFiles: Object.keys(BASELINE_ITEM_PANE_FTL).map((locale) => resolveLocaleMainFTLPath(locale)),
  };
}
