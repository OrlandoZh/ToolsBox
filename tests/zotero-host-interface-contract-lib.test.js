import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  loadZoteroHostInterfaceContractRegistry,
  inspectZoteroHostInterfaceContracts,
  renderZoteroHostInterfaceContractMarkdown,
  validateZoteroHostInterfaceContractRegistry,
} from "../scripts/zotero-host-interface-contract-lib.mjs";

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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `zotero-host-contract-${mode}-`));
  const importedTests = new Set();
  const referenceRoot = path.join(root, "reference", "zotero-main");

  registry.contracts.forEach((contract) => {
    contract.ownerFiles.forEach((relativePath) => {
      writeText(path.join(root, relativePath), "// owner file\n");
    });
    contract.exportedSurface.forEach((entry) => ensureFileContains(root, entry.file, entry.snippets));
    contract.requiredTypes.forEach((entry) => ensureFileContains(root, entry.file, entry.snippets));
    contract.requiredTests.forEach((testFile) => {
      writeText(path.join(root, "tests", testFile), "// fixture test\n");
      importedTests.add(testFile);
    });
    if (mode !== "skipped-source") {
      contract.referenceSources.forEach((entry) => ensureFileContains(referenceRoot, entry.file, entry.requiredSnippets));
    }
  });

  writeText(
    path.join(root, "tests", "run-all.js"),
    `${Array.from(importedTests).sort().map((entry) => `import './${entry}';`).join("\n")}\n`,
  );

  writeText(
    path.join(root, "docs", "ZOTERO_HOST_INTERFACE_CONTRACTS.md"),
    renderZoteroHostInterfaceContractMarkdown(registry),
  );

  if (mode === "failed") {
    fs.rmSync(path.join(root, registry.contracts[0].ownerFiles[0]), { force: true });
  }

  return root;
}

describe("Zotero Host Interface Contract Lib", () => {
  it("should load a valid registry with expected contracts", () => {
    const { registry } = loadZoteroHostInterfaceContractRegistry(projectRoot);

    assert.equal(registry.schemaVersion, 1);
    assert.ok(registry.contracts.some((contract) => contract.id === "menu-manager"));
    assert.ok(registry.contracts.some((contract) => contract.id === "reader-events"));
  });

  it("should reject invalid registry shape", () => {
    assert.throws(() => validateZoteroHostInterfaceContractRegistry({
      schemaVersion: 1,
      governanceGoal: "x",
      contracts: [
        {
          id: "broken",
          version: 1,
          summary: "broken",
          ownerFiles: [],
          referenceSources: [],
          exportedSurface: [],
          requiredTypes: [],
          requiredTests: [],
          nonGoals: [],
        },
      ],
    }));
  });

  it("should keep generated host contract markdown synchronized with the checked-in doc", () => {
    const { registry } = loadZoteroHostInterfaceContractRegistry(projectRoot);
    const actual = fs.readFileSync(path.join(projectRoot, "docs", "ZOTERO_HOST_INTERFACE_CONTRACTS.md"), "utf-8");
    const expected = renderZoteroHostInterfaceContractMarkdown(registry);

    assert.equal(actual, expected);
  });

  it("should classify passed, failed, and skipped-source contract states", () => {
    const { registry } = loadZoteroHostInterfaceContractRegistry(projectRoot);
    const passedRoot = createFixtureProject(registry, "passed");
    const failedRoot = createFixtureProject(registry, "failed");
    const skippedRoot = createFixtureProject(registry, "skipped-source");

    try {
      const passed = inspectZoteroHostInterfaceContracts(passedRoot, registry);
      const failed = inspectZoteroHostInterfaceContracts(failedRoot, registry);
      const skipped = inspectZoteroHostInterfaceContracts(skippedRoot, registry);

      assert.equal(passed.contracts.every((contract) => contract.status === "passed"), true);
      assert.equal(passed.contracts.every((contract) => contract.referenceCheckStatus === "passed"), true);
      assert.equal(failed.contracts.some((contract) => contract.status === "failed"), true);
      assert.equal(skipped.contracts.every((contract) => contract.status === "passed"), true);
      assert.equal(skipped.contracts.every((contract) => contract.referenceCheckStatus === "skipped"), true);
    } finally {
      fs.rmSync(passedRoot, { recursive: true, force: true });
      fs.rmSync(failedRoot, { recursive: true, force: true });
      fs.rmSync(skippedRoot, { recursive: true, force: true });
    }
  });
});
