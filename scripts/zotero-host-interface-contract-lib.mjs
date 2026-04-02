import fs from "node:fs";
import path from "node:path";

export const DEFAULT_HOST_INTERFACE_CONTRACT_REGISTRY_RELATIVE_PATH = path.join("config", "zotero-host-interface-contracts.json");
export const DEFAULT_HOST_INTERFACE_CONTRACT_DOC_RELATIVE_PATH = path.join("docs", "ZOTERO_HOST_INTERFACE_CONTRACTS.md");
export const DEFAULT_HOST_INTERFACE_REFERENCE_ROOT_RELATIVE_PATH = path.join("reference", "zotero-main");
export const DEFAULT_RUN_ALL_RELATIVE_PATH = path.join("tests", "run-all.js");

function fail(message) {
  throw new Error(message);
}

function ensureArrayOfStrings(value, label) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || String(entry).trim() === "")) {
    fail(`${label} must be an array of non-empty strings.`);
  }
}

function validateSnippetBlock(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  if (typeof value.file !== "string" || String(value.file).trim() === "") {
    fail(`${label}.file must be a non-empty string.`);
  }
  ensureArrayOfStrings(value.snippets || value.requiredSnippets, `${label}.snippets`);
}

function safeReadText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function listImportedTestFiles(runAllSource) {
  return Array.from(String(runAllSource || "").matchAll(/import\s+['"]\.\/([^'"]+\.test\.js)['"];?/gu))
    .map((match) => String(match[1] || "").trim())
    .filter(Boolean);
}

function formatSnippetList(snippets) {
  return snippets.map((entry) => `\`${entry}\``).join(", ");
}

function findMissingSnippets(source, snippets) {
  return snippets.filter((entry) => !String(source || "").includes(entry));
}

function inspectSnippetBlock(projectRoot, block, type) {
  const filePath = path.join(projectRoot, block.file);
  const source = safeReadText(filePath);
  const snippets = block.snippets || block.requiredSnippets || [];
  const missingSnippets = source === null ? snippets : findMissingSnippets(source, snippets);

  return {
    type,
    file: block.file,
    label: block.label || block.file,
    ok: source !== null && missingSnippets.length === 0,
    expected: `${block.file} includes ${formatSnippetList(snippets)}`,
    actual: source === null ? "file missing" : (missingSnippets.length === 0 ? "all snippets present" : `missing ${formatSnippetList(missingSnippets)}`),
  };
}

export function resolveZoteroHostInterfaceContractRegistryPath(projectRoot, options = {}) {
  const customPath = String(options.registryPath || "").trim();
  return customPath
    ? path.resolve(customPath)
    : path.join(path.resolve(projectRoot), DEFAULT_HOST_INTERFACE_CONTRACT_REGISTRY_RELATIVE_PATH);
}

export function resolveZoteroHostInterfaceReferenceRoot(projectRoot, options = {}) {
  const customPath = String(options.referenceRoot || process.env.HOST_INTERFACE_REFERENCE_ROOT || "").trim();
  return customPath
    ? path.resolve(customPath)
    : path.join(path.resolve(projectRoot), DEFAULT_HOST_INTERFACE_REFERENCE_ROOT_RELATIVE_PATH);
}

export function loadZoteroHostInterfaceContractRegistry(projectRoot, options = {}) {
  const registryPath = resolveZoteroHostInterfaceContractRegistryPath(projectRoot, options);
  const source = fs.readFileSync(registryPath, "utf-8");
  const registry = JSON.parse(source);
  validateZoteroHostInterfaceContractRegistry(registry);
  return {
    registryPath,
    registry,
  };
}

export function validateZoteroHostInterfaceContractRegistry(registry) {
  if (!registry || typeof registry !== "object" || Array.isArray(registry)) {
    fail("Zotero host interface contract registry must be an object.");
  }
  if (!Number.isInteger(registry.schemaVersion) || registry.schemaVersion <= 0) {
    fail("Zotero host interface contract registry must declare a positive integer schemaVersion.");
  }
  if (typeof registry.governanceGoal !== "string" || String(registry.governanceGoal).trim() === "") {
    fail("Zotero host interface contract registry must declare a non-empty governanceGoal.");
  }
  if (!Array.isArray(registry.contracts) || registry.contracts.length === 0) {
    fail("Zotero host interface contract registry must declare at least one contract.");
  }

  const seenIds = new Set();
  registry.contracts.forEach((contract, index) => {
    const prefix = `contracts[${index}]`;
    if (!contract || typeof contract !== "object" || Array.isArray(contract)) {
      fail(`${prefix} must be an object.`);
    }
    if (typeof contract.id !== "string" || String(contract.id).trim() === "") {
      fail(`${prefix}.id must be a non-empty string.`);
    }
    if (seenIds.has(contract.id)) {
      fail(`Duplicate contract id: ${contract.id}`);
    }
    seenIds.add(contract.id);
    if (!Number.isInteger(contract.version) || contract.version <= 0) {
      fail(`${prefix}.version must be a positive integer.`);
    }
    if (typeof contract.summary !== "string" || String(contract.summary).trim() === "") {
      fail(`${prefix}.summary must be a non-empty string.`);
    }
    ensureArrayOfStrings(contract.ownerFiles, `${prefix}.ownerFiles`);
    ensureArrayOfStrings(contract.requiredTests, `${prefix}.requiredTests`);
    ensureArrayOfStrings(contract.nonGoals, `${prefix}.nonGoals`);
    if (!Array.isArray(contract.referenceSources) || contract.referenceSources.length === 0) {
      fail(`${prefix}.referenceSources must be a non-empty array.`);
    }
    contract.referenceSources.forEach((item, itemIndex) => validateSnippetBlock(item, `${prefix}.referenceSources[${itemIndex}]`));
    if (!Array.isArray(contract.exportedSurface) || contract.exportedSurface.length === 0) {
      fail(`${prefix}.exportedSurface must be a non-empty array.`);
    }
    contract.exportedSurface.forEach((item, itemIndex) => {
      if (typeof item.label !== "string" || String(item.label).trim() === "") {
        fail(`${prefix}.exportedSurface[${itemIndex}].label must be a non-empty string.`);
      }
      validateSnippetBlock(item, `${prefix}.exportedSurface[${itemIndex}]`);
    });
    if (!Array.isArray(contract.requiredTypes) || contract.requiredTypes.length === 0) {
      fail(`${prefix}.requiredTypes must be a non-empty array.`);
    }
    contract.requiredTypes.forEach((item, itemIndex) => validateSnippetBlock(item, `${prefix}.requiredTypes[${itemIndex}]`));
  });
}

export function renderZoteroHostInterfaceContractMarkdown(registry) {
  validateZoteroHostInterfaceContractRegistry(registry);
  const lines = [
    "# Zotero Host Interface Contracts",
    "",
    "> Generated from `config/zotero-host-interface-contracts.json`. Edit the registry and run `npm run docs:sync-zotero-host-interface-contracts`.",
    "",
    "## Governance Goal",
    "",
    `- ${registry.governanceGoal}`,
    "",
    "## Contracts",
    "",
  ];

  registry.contracts.forEach((contract, index) => {
    if (index > 0) {
      lines.push("");
    }
    lines.push(`### \`${contract.id}\``);
    lines.push("");
    lines.push(`- Version: \`${contract.version}\``);
    lines.push(`- Summary: ${contract.summary}`);
    lines.push("- Owner Files:");
    contract.ownerFiles.forEach((entry) => lines.push(`  - \`${entry}\``));
    lines.push("- Reference Sources:");
    contract.referenceSources.forEach((entry) => lines.push(`  - \`${entry.file}\` includes ${formatSnippetList(entry.requiredSnippets)}`));
    lines.push("- Exported Surface:");
    contract.exportedSurface.forEach((entry) => lines.push(`  - ${entry.label}: \`${entry.file}\` includes ${formatSnippetList(entry.snippets)}`));
    lines.push("- Required Types:");
    contract.requiredTypes.forEach((entry) => lines.push(`  - \`${entry.file}\` includes ${formatSnippetList(entry.snippets)}`));
    lines.push("- Required Tests:");
    contract.requiredTests.forEach((entry) => lines.push(`  - \`${entry}\``));
    lines.push("- Non-Goals:");
    contract.nonGoals.forEach((entry) => lines.push(`  - ${entry}`));
  });

  return `${lines.join("\n")}\n`;
}

export function inspectZoteroHostInterfaceContracts(projectRoot, registry, options = {}) {
  validateZoteroHostInterfaceContractRegistry(registry);
  const absoluteProjectRoot = path.resolve(projectRoot);
  const referenceRoot = resolveZoteroHostInterfaceReferenceRoot(absoluteProjectRoot, options);
  const referenceRootPresent = fs.existsSync(referenceRoot);
  const runAllSource = safeReadText(path.join(absoluteProjectRoot, DEFAULT_RUN_ALL_RELATIVE_PATH)) || "";
  const importedTests = new Set(listImportedTestFiles(runAllSource));

  const contracts = registry.contracts.map((contract) => {
    const checks = [];

    contract.ownerFiles.forEach((relativePath) => {
      checks.push({
        type: "ownerFile",
        file: relativePath,
        label: relativePath,
        ok: fs.existsSync(path.join(absoluteProjectRoot, relativePath)),
        expected: `\`${relativePath}\` exists`,
        actual: fs.existsSync(path.join(absoluteProjectRoot, relativePath)) ? "present" : "missing",
      });
    });

    contract.exportedSurface.forEach((entry) => {
      checks.push(inspectSnippetBlock(absoluteProjectRoot, entry, "exportedSurface"));
    });

    contract.requiredTypes.forEach((entry) => {
      checks.push(inspectSnippetBlock(absoluteProjectRoot, entry, "requiredType"));
    });

    contract.requiredTests.forEach((testFile) => {
      const fileExists = fs.existsSync(path.join(absoluteProjectRoot, "tests", testFile));
      const imported = importedTests.has(testFile);
      checks.push({
        type: "test",
        file: path.join("tests", testFile),
        label: testFile,
        ok: fileExists && imported,
        expected: `\`${testFile}\` exists and is imported by tests/run-all.js`,
        actual: `fileExists=${fileExists}; imported=${imported}`,
      });
    });

    const referenceChecks = contract.referenceSources.map((entry) => {
      if (!referenceRootPresent) {
        return {
          type: "referenceSource",
          file: entry.file,
          label: entry.file,
          ok: true,
          skipped: true,
          expected: `\`${entry.file}\` includes ${formatSnippetList(entry.requiredSnippets)}`,
          actual: "reference root missing; source check skipped",
        };
      }
      return inspectSnippetBlock(referenceRoot, entry, "referenceSource");
    });

    const passedChecks = checks.filter((item) => item.ok).length;
    const totalChecks = checks.length;
    const sourceCheckStatus = referenceRootPresent
      ? (referenceChecks.every((item) => item.ok) ? "passed" : "failed")
      : "skipped";
    const status = passedChecks === totalChecks && sourceCheckStatus !== "failed"
      ? "passed"
      : "failed";

    return {
      id: contract.id,
      version: contract.version,
      summary: contract.summary,
      status,
      passedChecks,
      totalChecks,
      checks,
      missingChecks: checks.filter((item) => !item.ok),
      referenceCheckStatus: sourceCheckStatus,
      referenceChecks,
      nonGoals: contract.nonGoals,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    projectRoot: absoluteProjectRoot,
    referenceRoot,
    referenceRootPresent,
    summary: {
      totalContracts: contracts.length,
      passedContracts: contracts.filter((item) => item.status === "passed").length,
      failedContracts: contracts.filter((item) => item.status === "failed").length,
      skippedSourceContracts: contracts.filter((item) => item.referenceCheckStatus === "skipped").length,
    },
    contracts,
  };
}

export function renderZoteroHostInterfaceGuardMarkdown(report, options = {}) {
  const registryPath = options.registryPath ? path.resolve(options.registryPath) : DEFAULT_HOST_INTERFACE_CONTRACT_REGISTRY_RELATIVE_PATH;
  const lines = [
    "# Zotero Host Interface Guard",
    "",
    `- Generated At: \`${report.generatedAt}\``,
    `- Project Root: \`${report.projectRoot}\``,
    `- Registry: \`${registryPath}\``,
    `- Status: \`${report.status}\``,
    `- Reference Root: \`${report.referenceRoot}\``,
    `- Reference Present: \`${report.referenceRootPresent ? "yes" : "no"}\``,
    `- Summary: passed ${report.summary.passedContracts} / failed ${report.summary.failedContracts} / source-skipped ${report.summary.skippedSourceContracts}`,
    "",
    "## Contract Status",
    "",
    "| Contract | Status | Checks | Source Check |",
    "| --- | --- | --- | --- |",
    ...report.contracts.map((contract) => `| \`${contract.id}\` | \`${contract.status}\` | ${contract.passedChecks}/${contract.totalChecks} | \`${contract.referenceCheckStatus}\` |`),
  ];

  if (report.docSync) {
    lines.push("");
    lines.push("## Doc Sync", "");
    lines.push(`- Status: \`${report.docSync.ok ? "passed" : "failed"}\``);
    lines.push(`- Expected Doc: \`${DEFAULT_HOST_INTERFACE_CONTRACT_DOC_RELATIVE_PATH}\``);
  }

  report.contracts.forEach((contract) => {
    lines.push("");
    lines.push(`### \`${contract.id}\``);
    lines.push("");
    lines.push(`- Status: \`${contract.status}\``);
    lines.push(`- Checks: ${contract.passedChecks}/${contract.totalChecks}`);
    lines.push(`- Source Check: \`${contract.referenceCheckStatus}\``);
    if (contract.missingChecks.length === 0) {
      lines.push("- Missing Checks: none");
    } else {
      lines.push("- Missing Checks:");
      contract.missingChecks.forEach((item) => {
        lines.push(`  - [${item.type}] ${item.expected} (actual: \`${item.actual}\`)`);
      });
    }
    if (contract.referenceChecks.length === 0) {
      lines.push("- Reference Checks: none");
    } else {
      lines.push("- Reference Checks:");
      contract.referenceChecks.forEach((item) => {
        lines.push(`  - [${item.skipped ? "skipped" : item.ok ? "passed" : "failed"}] ${item.expected} (actual: \`${item.actual}\`)`);
      });
    }
    lines.push("- Non-Goals:");
    contract.nonGoals.forEach((entry) => lines.push(`  - ${entry}`));
  });

  if (Array.isArray(report.blockers) && report.blockers.length > 0) {
    lines.push("");
    lines.push("## Blockers", "");
    report.blockers.forEach((entry) => lines.push(`- ${entry}`));
  }

  return `${lines.join("\n")}\n`;
}
