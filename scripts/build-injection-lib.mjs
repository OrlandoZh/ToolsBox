import { promises as fs } from "node:fs";
import process from "node:process";

function normalizeMode(value) {
  return String(value || "").trim().toLowerCase();
}

export async function readBuildInjectionMode(env = process.env) {
  const controlFile = String(env.ZOTERO_PLUGIN_BUILD_INJECT_FILE || "").trim();
  if (!controlFile) {
    return {
      controlFile: null,
      mode: "none",
    };
  }

  try {
    const raw = await fs.readFile(controlFile, "utf-8");
    return {
      controlFile,
      mode: normalizeMode(raw) || "none",
    };
  }
  catch (error) {
    if (error && error.code === "ENOENT") {
      return {
        controlFile,
        mode: "none",
      };
    }
    throw error;
  }
}

export async function applyBuildInjection(env = process.env) {
  const injection = await readBuildInjectionMode(env);
  if (!injection.controlFile || injection.mode === "none") {
    return {
      active: false,
      mode: "none",
      controlFile: injection.controlFile,
      consumed: false,
    };
  }

  if (injection.mode === "fail-once") {
    await fs.rm(injection.controlFile, { force: true });
    throw new Error(`Injected build failure (${injection.mode})`);
  }

  if (injection.mode === "fail-always") {
    throw new Error(`Injected build failure (${injection.mode})`);
  }

  return {
    active: false,
    mode: injection.mode,
    controlFile: injection.controlFile,
    consumed: false,
  };
}
