import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  inspectZoteroHostSemanticIndex,
  loadZoteroHostSemanticIndexRegistry,
  renderZoteroHostSemanticIndexMarkdown,
  validateZoteroHostSemanticIndexRegistry,
} from "../scripts/zotero-host-semantic-index-lib.mjs";

const projectRoot = path.resolve(".");

function writeText(filePath, source = "") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, source, "utf-8");
}

function ensureFileContains(root, relativePath, snippets) {
  const filePath = path.join(root, relativePath);
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "";
  const missingSnippets = snippets.filter((snippet) => !existing.includes(snippet));
  if (missingSnippets.length === 0) {
    return;
  }
  writeText(filePath, `${existing}${existing && !existing.endsWith("\n") ? "\n" : ""}${missingSnippets.join("\n")}\n`);
}

function createFixtureProject(registry, mode) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `zotero-host-semantic-${mode}-`));
  const referenceRoot = path.join(root, "reference", "zotero-main");

  registry.domains.forEach((domain) => {
    domain.ownerFiles.forEach((relativePath) => {
      writeText(path.join(root, relativePath), "// owner file\n");
    });
    domain.requiredTypes.forEach((entry) => ensureFileContains(root, entry.file, entry.snippets));
    domain.requiredTests.forEach((testFile) => {
      writeText(path.join(root, "tests", testFile), "// fixture test\n");
    });
    if (mode !== "skipped-source") {
      domain.referenceSources.forEach((entry) => ensureFileContains(referenceRoot, entry.file, entry.requiredSnippets));
    }
  });

  writeText(
    path.join(root, "docs", "ZOTERO_HOST_SEMANTIC_INDEX.md"),
    renderZoteroHostSemanticIndexMarkdown(registry),
  );

  if (mode === "failed") {
    fs.rmSync(path.join(root, registry.domains[0].ownerFiles[0]), { force: true });
  }

  return root;
}

describe("Zotero Host Semantic Index Lib", () => {
  it("should load a valid registry with expected domains", () => {
    const { registry } = loadZoteroHostSemanticIndexRegistry(projectRoot);

    assert.equal(registry.schemaVersion, 1);
    assert.ok(registry.domains.some((domain) => domain.id === "menu-manager"));
    assert.ok(registry.domains.some((domain) => domain.id === "reader-events"));
  });

  it("should reject invalid registry shape", () => {
    assert.throws(() => validateZoteroHostSemanticIndexRegistry({
      schemaVersion: 1,
      governanceGoal: "x",
      domains: [
        {
          id: "broken",
          version: 1,
          summary: "broken",
          hostNamespace: "Broken",
          ownerFiles: [],
          referenceSources: [],
          canonicalTerms: [],
          enums: [],
          optionSchemas: [],
          surfaceSemantics: [],
          requiredTypes: [],
          requiredTests: [],
          nonGoals: [],
        },
      ],
    }));
  });

  it("should keep generated semantic index markdown synchronized with the checked-in doc", () => {
    const { registry } = loadZoteroHostSemanticIndexRegistry(projectRoot);
    const actual = fs.readFileSync(path.join(projectRoot, "docs", "ZOTERO_HOST_SEMANTIC_INDEX.md"), "utf-8");
    const expected = renderZoteroHostSemanticIndexMarkdown(registry);

    assert.equal(actual, expected);
  });

  it("should classify passed, failed, and skipped-source domain states", () => {
    const { registry } = loadZoteroHostSemanticIndexRegistry(projectRoot);
    const passedRoot = createFixtureProject(registry, "passed");
    const failedRoot = createFixtureProject(registry, "failed");
    const skippedRoot = createFixtureProject(registry, "skipped-source");

    try {
      const passed = inspectZoteroHostSemanticIndex(passedRoot, registry);
      const failed = inspectZoteroHostSemanticIndex(failedRoot, registry);
      const skipped = inspectZoteroHostSemanticIndex(skippedRoot, registry);

      assert.equal(passed.domains.every((domain) => domain.status === "passed"), true);
      assert.equal(passed.domains.every((domain) => domain.referenceCheckStatus === "passed"), true);
      assert.equal(failed.domains.some((domain) => domain.status === "failed"), true);
      assert.equal(skipped.domains.every((domain) => domain.status === "passed"), true);
      assert.equal(skipped.domains.every((domain) => domain.referenceCheckStatus === "skipped"), true);
    } finally {
      fs.rmSync(passedRoot, { recursive: true, force: true });
      fs.rmSync(failedRoot, { recursive: true, force: true });
      fs.rmSync(skippedRoot, { recursive: true, force: true });
    }
  });
});
