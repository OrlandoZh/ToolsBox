import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  DEFAULT_JSCONFUSER_VERSION,
  buildPackageProtectionJSConfuserBootstrapInstallArgs,
  bootstrapPackageProtectionJSConfuser,
  parsePackageProtectionJSConfuserBootstrapArgs,
  renderPackageProtectionJSConfuserBootstrapMarkdown,
  resolvePackageProtectionJSConfuserBootstrapPaths,
} from "../scripts/package-protection-jsconfuser-bootstrap.mjs";

function makeReadyJSConfuserInstall(installRoot, version = DEFAULT_JSCONFUSER_VERSION) {
  const toolRoot = path.join(installRoot, "node_modules", "js-confuser");
  fs.mkdirSync(path.join(toolRoot, "dist"), { recursive: true });
  fs.writeFileSync(path.join(toolRoot, "package.json"), `${JSON.stringify({
    name: "js-confuser",
    version,
    main: "dist/index.js",
  }, null, 2)}\n`, "utf-8");
  fs.writeFileSync(
    path.join(toolRoot, "dist", "index.js"),
    "exports.obfuscate = async function obfuscate(source) { return { code: String(source || '') }; };\n",
    "utf-8",
  );
  return toolRoot;
}

describe("Package Protection JS-Confuser Bootstrap", () => {
  it("should parse bootstrap args", () => {
    const options = parsePackageProtectionJSConfuserBootstrapArgs([
      "--dir",
      "/tmp/js-confuser-root",
      "--version",
      "2.0.1",
      "--force",
    ]);

    assert.equal(options.installDir, "/tmp/js-confuser-root");
    assert.equal(options.version, "2.0.1");
    assert.equal(options.force, true);
  });

  it("should resolve default bootstrap paths under dist artifacts", () => {
    const root = "/tmp/addontemplate-bootstrap-project";
    const paths = resolvePackageProtectionJSConfuserBootstrapPaths(root, {}, {});

    assert.equal(paths.installRoot, path.join(root, "dist", "package-protection-tools", "js-confuser"));
    assert.equal(paths.toolPath, path.join(root, "dist", "package-protection-tools", "js-confuser", "node_modules", "js-confuser"));
    assert.equal(paths.reportPath, path.join(root, "dist", "package-protection-jsconfuser-bootstrap.json"));
  });

  it("should build pinned npm install args", () => {
    assert.deepEqual(buildPackageProtectionJSConfuserBootstrapInstallArgs({
      installRoot: "/tmp/js-confuser-root",
      version: "2.0.1",
    }), [
      "install",
      "--prefix",
      "/tmp/js-confuser-root",
      "js-confuser@2.0.1",
      "--no-save",
      "--no-audit",
      "--no-fund",
      "--loglevel",
      "error",
    ]);
  });

  it("should reuse an existing ready install when version already matches", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "package-protection-jsconfuser-bootstrap-reuse-"));
    const installRoot = path.join(root, "bootstrap-root");
    makeReadyJSConfuserInstall(installRoot, "2.0.1");

    const report = await bootstrapPackageProtectionJSConfuser({
      projectRootPath: root,
      installDir: installRoot,
      version: "2.0.1",
      spawnSyncImpl() {
        throw new Error("spawn should not be called when reusing an existing install");
      },
    });

    assert.equal(report.status, "passed");
    assert.equal(report.installAction, "reused");
    assert.equal(report.resolvedVersion, "2.0.1");
    assert.equal(report.entryRelativePath, "dist/index.js");
  });

  it("should install into the requested root when the tool is missing", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "package-protection-jsconfuser-bootstrap-install-"));
    const installRoot = path.join(root, "bootstrap-root");

    const report = await bootstrapPackageProtectionJSConfuser({
      projectRootPath: root,
      installDir: installRoot,
      version: "2.0.1",
      spawnSyncImpl(command, args) {
        assert.equal(typeof command, "string");
        assert.deepEqual(args, [
          "install",
          "--prefix",
          installRoot,
          "js-confuser@2.0.1",
          "--no-save",
          "--no-audit",
          "--no-fund",
          "--loglevel",
          "error",
        ]);
        makeReadyJSConfuserInstall(installRoot, "2.0.1");
        return {
          status: 0,
          stdout: "installed",
          stderr: "",
        };
      },
    });

    assert.equal(report.status, "passed");
    assert.equal(report.installAction, "installed");
    assert.equal(report.installAttemptCount, 1);
    assert.equal(report.toolPath, path.join(installRoot, "node_modules", "js-confuser"));
    assert.equal(report.entryRelativePath, "dist/index.js");
  });

  it("should retry once when the first install attempt fails", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "package-protection-jsconfuser-bootstrap-retry-"));
    const installRoot = path.join(root, "bootstrap-root");
    let attemptCount = 0;

    const report = await bootstrapPackageProtectionJSConfuser({
      projectRootPath: root,
      installDir: installRoot,
      version: "2.0.1",
      spawnSyncImpl() {
        attemptCount += 1;
        if (attemptCount === 1) {
          return {
            status: 1,
            stdout: "",
            stderr: "transient failure",
          };
        }
        makeReadyJSConfuserInstall(installRoot, "2.0.1");
        return {
          status: 0,
          stdout: "installed",
          stderr: "",
        };
      },
    });

    assert.equal(report.status, "passed");
    assert.equal(report.installAction, "installed");
    assert.equal(report.installAttemptCount, 2);
    assert.equal(report.entryRelativePath, "dist/index.js");
  });

  it("should render a compact markdown report", () => {
    const markdown = renderPackageProtectionJSConfuserBootstrapMarkdown({
      status: "passed",
      installAction: "installed",
      requestedVersion: "2.0.1",
      resolvedVersion: "2.0.1",
      installRoot: "/tmp/js-confuser-root",
      toolPath: "/tmp/js-confuser-root/node_modules/js-confuser",
      entryRelativePath: "dist/index.js",
      npmCommand: "npm",
      force: false,
      summary: "done",
      installCommand: "npm install --prefix /tmp/js-confuser-root js-confuser@2.0.1 --no-save",
    });

    assert.ok(markdown.includes("Package Protection JS-Confuser Bootstrap"));
    assert.ok(markdown.includes("installAction: installed"));
    assert.ok(markdown.includes("dist/index.js"));
  });
});
