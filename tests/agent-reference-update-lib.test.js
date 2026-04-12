import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  listManagedReferenceProjects,
  updateManagedReferenceProjects,
} from "../scripts/agent-reference-update-lib.mjs";

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

function writeJSON(filePath, payload) {
  writeText(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function initGitRepo(rootDir, branch = "main") {
  execFileSync("git", ["init"], { cwd: rootDir, stdio: "pipe" });
  execFileSync("git", ["config", "user.name", "Codex Test"], { cwd: rootDir, stdio: "pipe" });
  execFileSync("git", ["config", "user.email", "codex@example.com"], { cwd: rootDir, stdio: "pipe" });
  execFileSync("git", ["checkout", "-b", branch], { cwd: rootDir, stdio: "pipe" });
}

function commitAll(rootDir, message) {
  execFileSync("git", ["add", "."], { cwd: rootDir, stdio: "pipe" });
  execFileSync("git", ["commit", "-m", message], { cwd: rootDir, stdio: "pipe" });
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: rootDir,
    encoding: "utf-8",
    stdio: "pipe",
  }).trim();
}

function createManagedReferenceFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-reference-update-root-"));
  const origin = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-reference-update-origin-"));
  const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-reference-update-artifacts-"));
  const previousArtifactsDir = process.env.AGENT_ARTIFACTS_DIR;

  process.env.AGENT_ARTIFACTS_DIR = artifactsDir;
  initGitRepo(origin);
  writeText(path.join(origin, "README.md"), "# demo reference\n");
  const firstCommit = commitAll(origin, "init");

  writeJSON(path.join(root, "config", "reference-projects.json"), {
    version: 1,
    projects: [
      {
        id: "demo-origin",
        label: "Demo Origin",
        enabled: true,
        targetPath: "reference/plugin/demo-origin",
        source: {
          type: "git",
          url: origin,
          ref: "main",
          refType: "branch",
        },
      },
    ],
  });

  return {
    root,
    origin,
    artifactsDir,
    previousArtifactsDir,
    firstCommit,
    cleanup() {
      if (previousArtifactsDir === undefined) {
        delete process.env.AGENT_ARTIFACTS_DIR;
      } else {
        process.env.AGENT_ARTIFACTS_DIR = previousArtifactsDir;
      }
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(origin, { recursive: true, force: true });
      fs.rmSync(artifactsDir, { recursive: true, force: true });
    },
  };
}

describe("Agent Reference Update Lib", () => {
  it("should list managed reference projects with local snapshot state", async () => {
    const fixture = createManagedReferenceFixture();
    try {
      const result = await listManagedReferenceProjects(fixture.root);
      assert.equal(result.projectCount, 1);
      assert.equal(result.projects[0].id, "demo-origin");
      assert.equal(result.projects[0].localState.exists, false);
      assert.equal(result.projects[0].localState.kind, "missing");
    } finally {
      fixture.cleanup();
    }
  });

  it("should clone a missing managed reference project and write the latest artifact", async () => {
    const fixture = createManagedReferenceFixture();
    try {
      const result = await updateManagedReferenceProjects(fixture.root, {
        projectIds: ["demo-origin"],
      });
      const targetDir = path.join(fixture.root, "reference", "plugin", "demo-origin");
      const currentCommit = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: targetDir,
        encoding: "utf-8",
        stdio: "pipe",
      }).trim();

      assert.equal(result.ok, true);
      assert.equal(result.clonedCount, 1);
      assert.equal(result.results[0].status, "cloned");
      assert.equal(currentCommit, fixture.firstCommit);
      assert.equal(fs.existsSync(path.join(fixture.artifactsDir, "agent-reference-update", "latest.json")), true);
    } finally {
      fixture.cleanup();
    }
  });

  it("should refresh an existing git-backed managed reference project to the latest commit", async () => {
    const fixture = createManagedReferenceFixture();
    try {
      await updateManagedReferenceProjects(fixture.root, {
        projectIds: ["demo-origin"],
      });

      writeText(path.join(fixture.origin, "README.md"), "# demo reference\n\nupdated\n");
      const latestCommit = commitAll(fixture.origin, "update");

      const result = await updateManagedReferenceProjects(fixture.root, {
        projectIds: ["demo-origin"],
      });
      const targetDir = path.join(fixture.root, "reference", "plugin", "demo-origin");
      const currentCommit = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: targetDir,
        encoding: "utf-8",
        stdio: "pipe",
      }).trim();

      assert.equal(result.ok, true);
      assert.equal(result.updatedCount, 1);
      assert.equal(result.results[0].status, "updated");
      assert.equal(currentCommit, latestCommit);
    } finally {
      fixture.cleanup();
    }
  });

  it("should block dirty managed reference targets until the operator chooses allow-dirty or replace-existing", async () => {
    const fixture = createManagedReferenceFixture();
    try {
      await updateManagedReferenceProjects(fixture.root, {
        projectIds: ["demo-origin"],
      });
      writeText(path.join(fixture.root, "reference", "plugin", "demo-origin", "README.md"), "# locally modified\n");

      const result = await updateManagedReferenceProjects(fixture.root, {
        projectIds: ["demo-origin"],
      });

      assert.equal(result.ok, false);
      assert.equal(result.blockedCount, 1);
      assert.equal(result.results[0].status, "blocked");
      assert.equal(result.results[0].reason, "dirty-worktree");
    } finally {
      fixture.cleanup();
    }
  });

  it("should treat a plain subdirectory inside the current project repo as non-git until it is replaced by a dedicated clone", async () => {
    const fixture = createManagedReferenceFixture();
    try {
      initGitRepo(fixture.root);
      writeText(path.join(fixture.root, "README.md"), "# current project repo\n");
      commitAll(fixture.root, "init project repo");
      writeText(path.join(fixture.root, "reference", "plugin", "demo-origin", "README.md"), "# plain snapshot\n");

      const result = await listManagedReferenceProjects(fixture.root);

      assert.equal(result.projectCount, 1);
      assert.equal(result.projects[0].localState.exists, true);
      assert.equal(result.projects[0].localState.kind, "non-git");
      assert.equal(result.projects[0].localState.gitWorktree, false);
    } finally {
      fixture.cleanup();
    }
  });
});
