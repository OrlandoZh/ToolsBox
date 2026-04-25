import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it, assert } from "./test-framework.js";

const projectRoot = path.resolve(".");

function createWorkflowFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-computer-use-workflow-script-"));
  fs.mkdirSync(path.join(root, "config"), { recursive: true });
  fs.mkdirSync(path.join(root, "dist"), { recursive: true });
  fs.copyFileSync(
    path.join(projectRoot, "config", "codex-computer-use-validation.json"),
    path.join(root, "config", "codex-computer-use-validation.json"),
  );
  fs.copyFileSync(
    path.join(projectRoot, "config", "project-validation-surfaces.json"),
    path.join(root, "config", "project-validation-surfaces.json"),
  );
  return root;
}

function runWorkflowScript(args, root) {
  return spawnSync("node", [
    "scripts/agent-computer-use-workflows.mjs",
    "list",
    "--project-root",
    root,
    ...args,
  ], {
    cwd: projectRoot,
    stdio: "pipe",
    encoding: "utf-8",
    env: {
      ...process.env,
      ZOTERO_PLUGIN_ZOTERO_BIN_PATH: process.env.ZOTERO_PLUGIN_ZOTERO_BIN_PATH || "/Applications/Zotero.app/Contents/MacOS/zotero",
    },
  });
}

describe("Agent Computer Use Workflows Script", () => {
  it("should truncate plain-text surface output by default and show rerun hints", () => {
    const root = createWorkflowFixture();
    try {
      const result = runWorkflowScript([
        "--changed-path",
        "src/app/host-actions.js",
      ], root);

      assert.equal(result.status, 0);
      assert.match(result.stdout, /surface-local \| conditional-surface \| truncated \| 5 more surfaces hidden/u);
      assert.match(result.stdout, /focus-one: npm run agent:computer-use:list -- --surface <surface-id>/u);
      assert.match(result.stdout, /surface-local:cleanroom-preferences-pane/u);
      assert.notOk(result.stdout.includes("surface-local:cleanroom-live-menu-submenu"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("should focus plain-text surface output when --surface is provided", () => {
    const root = createWorkflowFixture();
    try {
      const result = runWorkflowScript([
        "--changed-path",
        "src/app/host-actions.js",
        "--surface",
        "cleanroom-preferences-pane",
      ], root);

      assert.equal(result.status, 0);
      assert.match(result.stdout, /surface-local:cleanroom-preferences-pane/u);
      assert.match(result.stdout, /manual-surface-selection:cleanroom-preferences-pane/u);
      assert.notOk(result.stdout.includes("surface-local:cleanroom-reader-toolbar-surface"));
      assert.notOk(result.stdout.includes("truncated"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
