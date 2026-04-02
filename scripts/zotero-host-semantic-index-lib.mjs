import fs from "node:fs";
import path from "node:path";

export const DEFAULT_HOST_SEMANTIC_INDEX_RELATIVE_PATH = path.join("config", "zotero-host-semantic-index.json");
export const DEFAULT_HOST_SEMANTIC_INDEX_DOC_RELATIVE_PATH = path.join("docs", "ZOTERO_HOST_SEMANTIC_INDEX.md");
export const DEFAULT_HOST_SEMANTIC_REFERENCE_ROOT_RELATIVE_PATH = path.join("reference", "zotero-main");

function fail(message) {
  throw new Error(message);
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

function ensureNonEmptyString(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    fail(`${label} must be a non-empty string.`);
  }
  return normalized;
}

function ensureArrayOfStrings(value, label, { allowEmpty = false } = {}) {
  if (!Array.isArray(value)) {
    fail(`${label} must be an array.`);
  }
  const normalized = value.map((entry) => String(entry || "").trim());
  if (normalized.some((entry) => entry === "")) {
    fail(`${label} must contain only non-empty strings.`);
  }
  if (!allowEmpty && normalized.length === 0) {
    fail(`${label} must contain at least one string.`);
  }
  return normalized;
}

function formatSnippetList(snippets) {
  return snippets.map((entry) => `\`${entry}\``).join(", ");
}

function validateSnippetBlock(value, label, key = "snippets") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return {
    ...value,
    file: ensureNonEmptyString(value.file, `${label}.file`),
    [key]: ensureArrayOfStrings(value[key], `${label}.${key}`),
  };
}

function normalizeCanonicalTerm(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return {
    term: ensureNonEmptyString(value.term, `${label}.term`),
    preferredChinese: ensureNonEmptyString(value.preferredChinese, `${label}.preferredChinese`),
    useFor: ensureArrayOfStrings(value.useFor, `${label}.useFor`),
    avoid: ensureArrayOfStrings(value.avoid || [], `${label}.avoid`, { allowEmpty: true }),
  };
}

function normalizeEnum(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return {
    name: ensureNonEmptyString(value.name, `${label}.name`),
    values: ensureArrayOfStrings(value.values, `${label}.values`),
    extensible: value.extensible === true,
    notes: ensureNonEmptyString(value.notes, `${label}.notes`),
  };
}

function normalizeOptionSchema(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return {
    name: ensureNonEmptyString(value.name, `${label}.name`),
    requiredFields: ensureArrayOfStrings(value.requiredFields, `${label}.requiredFields`),
    optionalFields: ensureArrayOfStrings(value.optionalFields || [], `${label}.optionalFields`, { allowEmpty: true }),
    notes: ensureNonEmptyString(value.notes, `${label}.notes`),
  };
}

function normalizeSurfaceSemantic(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return {
    id: ensureNonEmptyString(value.id, `${label}.id`),
    kind: ensureNonEmptyString(value.kind, `${label}.kind`),
    hostEvents: ensureArrayOfStrings(value.hostEvents || [], `${label}.hostEvents`, { allowEmpty: true }),
    surfaceTerms: ensureArrayOfStrings(value.surfaceTerms, `${label}.surfaceTerms`),
    notes: ensureArrayOfStrings(value.notes, `${label}.notes`),
  };
}

function normalizeDomain(domain, index) {
  const prefix = `domains[${index}]`;
  if (!domain || typeof domain !== "object" || Array.isArray(domain)) {
    fail(`${prefix} must be an object.`);
  }
  if (!Number.isInteger(domain.version) || domain.version <= 0) {
    fail(`${prefix}.version must be a positive integer.`);
  }

  return {
    id: ensureNonEmptyString(domain.id, `${prefix}.id`),
    version: domain.version,
    summary: ensureNonEmptyString(domain.summary, `${prefix}.summary`),
    hostNamespace: ensureNonEmptyString(domain.hostNamespace, `${prefix}.hostNamespace`),
    ownerFiles: ensureArrayOfStrings(domain.ownerFiles, `${prefix}.ownerFiles`),
    referenceSources: (Array.isArray(domain.referenceSources) ? domain.referenceSources : fail(`${prefix}.referenceSources must be an array.`))
      .map((entry, entryIndex) => validateSnippetBlock(entry, `${prefix}.referenceSources[${entryIndex}]`, "requiredSnippets")),
    canonicalTerms: (Array.isArray(domain.canonicalTerms) ? domain.canonicalTerms : fail(`${prefix}.canonicalTerms must be an array.`))
      .map((entry, entryIndex) => normalizeCanonicalTerm(entry, `${prefix}.canonicalTerms[${entryIndex}]`)),
    enums: (Array.isArray(domain.enums) ? domain.enums : fail(`${prefix}.enums must be an array.`))
      .map((entry, entryIndex) => normalizeEnum(entry, `${prefix}.enums[${entryIndex}]`)),
    optionSchemas: (Array.isArray(domain.optionSchemas) ? domain.optionSchemas : fail(`${prefix}.optionSchemas must be an array.`))
      .map((entry, entryIndex) => normalizeOptionSchema(entry, `${prefix}.optionSchemas[${entryIndex}]`)),
    surfaceSemantics: (Array.isArray(domain.surfaceSemantics) ? domain.surfaceSemantics : fail(`${prefix}.surfaceSemantics must be an array.`))
      .map((entry, entryIndex) => normalizeSurfaceSemantic(entry, `${prefix}.surfaceSemantics[${entryIndex}]`)),
    requiredTypes: (Array.isArray(domain.requiredTypes) ? domain.requiredTypes : fail(`${prefix}.requiredTypes must be an array.`))
      .map((entry, entryIndex) => validateSnippetBlock(entry, `${prefix}.requiredTypes[${entryIndex}]`)),
    requiredTests: ensureArrayOfStrings(domain.requiredTests, `${prefix}.requiredTests`),
    nonGoals: ensureArrayOfStrings(domain.nonGoals, `${prefix}.nonGoals`),
  };
}

function findMissingSnippets(source, snippets) {
  return snippets.filter((entry) => !String(source || "").includes(entry));
}

function inspectSnippetBlock(projectRoot, block, type, key = "snippets") {
  const filePath = path.join(projectRoot, block.file);
  const source = safeReadText(filePath);
  const snippets = block[key] || [];
  const missingSnippets = source === null ? snippets : findMissingSnippets(source, snippets);

  return {
    type,
    file: block.file,
    label: block.file,
    ok: source !== null && missingSnippets.length === 0,
    expected: `\`${block.file}\` includes ${formatSnippetList(snippets)}`,
    actual: source === null ? "file missing" : (missingSnippets.length === 0 ? "all snippets present" : `missing ${formatSnippetList(missingSnippets)}`),
  };
}

export function resolveZoteroHostSemanticIndexPath(projectRoot, options = {}) {
  const customPath = String(options.registryPath || "").trim();
  return customPath
    ? path.resolve(customPath)
    : path.join(path.resolve(projectRoot), DEFAULT_HOST_SEMANTIC_INDEX_RELATIVE_PATH);
}

export function resolveZoteroHostSemanticReferenceRoot(projectRoot, options = {}) {
  const customPath = String(options.referenceRoot || process.env.HOST_SEMANTIC_REFERENCE_ROOT || "").trim();
  return customPath
    ? path.resolve(customPath)
    : path.join(path.resolve(projectRoot), DEFAULT_HOST_SEMANTIC_REFERENCE_ROOT_RELATIVE_PATH);
}

export function normalizeZoteroHostSemanticIndexRegistry(registry) {
  if (!registry || typeof registry !== "object" || Array.isArray(registry)) {
    fail("Zotero host semantic index registry must be an object.");
  }
  if (!Number.isInteger(registry.schemaVersion) || registry.schemaVersion <= 0) {
    fail("Zotero host semantic index registry must declare a positive integer schemaVersion.");
  }

  const governanceGoal = ensureNonEmptyString(registry.governanceGoal, "governanceGoal");
  if (!Array.isArray(registry.domains) || registry.domains.length === 0) {
    fail("Zotero host semantic index registry must declare at least one domain.");
  }
  const domains = registry.domains.map((entry, index) => normalizeDomain(entry, index));
  const seenIds = new Set();
  domains.forEach((entry) => {
    if (seenIds.has(entry.id)) {
      fail(`Duplicate semantic domain id: ${entry.id}`);
    }
    seenIds.add(entry.id);
  });

  return {
    schemaVersion: registry.schemaVersion,
    governanceGoal,
    domains,
  };
}

export function validateZoteroHostSemanticIndexRegistry(registry) {
  normalizeZoteroHostSemanticIndexRegistry(registry);
}

export function loadZoteroHostSemanticIndexRegistry(projectRoot, options = {}) {
  const registryPath = resolveZoteroHostSemanticIndexPath(projectRoot, options);
  return {
    registryPath,
    registry: normalizeZoteroHostSemanticIndexRegistry(JSON.parse(fs.readFileSync(registryPath, "utf-8"))),
  };
}

export function renderZoteroHostSemanticIndexMarkdown(registry) {
  const normalized = normalizeZoteroHostSemanticIndexRegistry(registry);
  const lines = [
    "# Zotero Host Semantic Index",
    "",
    "> Generated from `config/zotero-host-semantic-index.json`. Edit the registry and run `npm run docs:sync-zotero-host-semantic-index`.",
    "",
    "## Governance Goal",
    "",
    `- ${normalized.governanceGoal}`,
    "",
    "## Semantic Domains",
    "",
  ];

  normalized.domains.forEach((domain, index) => {
    if (index > 0) {
      lines.push("");
    }
    lines.push(`### \`${domain.id}\``);
    lines.push("");
    lines.push(`- Version: \`${domain.version}\``);
    lines.push(`- Host Namespace: \`${domain.hostNamespace}\``);
    lines.push(`- Summary: ${domain.summary}`);
    lines.push("- Owner Files:");
    domain.ownerFiles.forEach((entry) => lines.push(`  - \`${entry}\``));
    lines.push("- Reference Sources:");
    domain.referenceSources.forEach((entry) => lines.push(`  - \`${entry.file}\` includes ${formatSnippetList(entry.requiredSnippets)}`));
    lines.push("- Canonical Terms:");
    domain.canonicalTerms.forEach((entry) => {
      lines.push(`  - \`${entry.term}\` / ${entry.preferredChinese}`);
      lines.push(`    - Use For: ${entry.useFor.join("；")}`);
      lines.push(`    - Avoid: ${entry.avoid.length > 0 ? entry.avoid.map((item) => `\`${item}\``).join(", ") : "-"}`);
    });
    lines.push("- Enums:");
    if (domain.enums.length === 0) {
      lines.push("  - none");
    } else {
      domain.enums.forEach((entry) => {
        lines.push(`  - \`${entry.name}\`: ${entry.values.map((item) => `\`${item}\``).join(", ")}`);
        lines.push(`    - Extensible: \`${entry.extensible}\``);
        lines.push(`    - Notes: ${entry.notes}`);
      });
    }
    lines.push("- Option Schemas:");
    domain.optionSchemas.forEach((entry) => {
      lines.push(`  - \`${entry.name}\``);
      lines.push(`    - Required: ${entry.requiredFields.map((item) => `\`${item}\``).join(", ")}`);
      lines.push(`    - Optional: ${entry.optionalFields.length > 0 ? entry.optionalFields.map((item) => `\`${item}\``).join(", ") : "-"}`);
      lines.push(`    - Notes: ${entry.notes}`);
    });
    lines.push("- Surface Semantics:");
    domain.surfaceSemantics.forEach((entry) => {
      lines.push(`  - \`${entry.id}\` / \`${entry.kind}\``);
      lines.push(`    - Host Events: ${entry.hostEvents.length > 0 ? entry.hostEvents.map((item) => `\`${item}\``).join(", ") : "-"}`);
      lines.push(`    - Surface Terms: ${entry.surfaceTerms.map((item) => `\`${item}\``).join(", ")}`);
      lines.push(`    - Notes: ${entry.notes.join("；")}`);
    });
    lines.push("- Required Types:");
    domain.requiredTypes.forEach((entry) => lines.push(`  - \`${entry.file}\` includes ${formatSnippetList(entry.snippets)}`));
    lines.push("- Required Tests:");
    domain.requiredTests.forEach((entry) => lines.push(`  - \`${entry}\``));
    lines.push("- Non-Goals:");
    domain.nonGoals.forEach((entry) => lines.push(`  - ${entry}`));
  });

  return `${lines.join("\n")}\n`;
}

export function inspectZoteroHostSemanticIndex(projectRoot, registry, options = {}) {
  const normalized = normalizeZoteroHostSemanticIndexRegistry(registry);
  const absoluteProjectRoot = path.resolve(projectRoot);
  const referenceRoot = resolveZoteroHostSemanticReferenceRoot(absoluteProjectRoot, options);
  const referenceRootPresent = fs.existsSync(referenceRoot);

  const domains = normalized.domains.map((domain) => {
    const checks = [];

    domain.ownerFiles.forEach((relativePath) => {
      const exists = fs.existsSync(path.join(absoluteProjectRoot, relativePath));
      checks.push({
        type: "ownerFile",
        file: relativePath,
        label: relativePath,
        ok: exists,
        expected: `\`${relativePath}\` exists`,
        actual: exists ? "present" : "missing",
      });
    });

    domain.requiredTypes.forEach((entry) => {
      checks.push(inspectSnippetBlock(absoluteProjectRoot, entry, "requiredType"));
    });

    domain.requiredTests.forEach((testFile) => {
      const exists = fs.existsSync(path.join(absoluteProjectRoot, "tests", testFile));
      checks.push({
        type: "test",
        file: path.join("tests", testFile),
        label: testFile,
        ok: exists,
        expected: `\`tests/${testFile}\` exists`,
        actual: exists ? "present" : "missing",
      });
    });

    const referenceChecks = domain.referenceSources.map((entry) => {
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
      return inspectSnippetBlock(referenceRoot, entry, "referenceSource", "requiredSnippets");
    });

    const passedChecks = checks.filter((entry) => entry.ok).length;
    const totalChecks = checks.length;
    const referenceCheckStatus = referenceRootPresent
      ? (referenceChecks.every((entry) => entry.ok) ? "passed" : "failed")
      : "skipped";
    const status = passedChecks === totalChecks && referenceCheckStatus !== "failed"
      ? "passed"
      : "failed";

    return {
      id: domain.id,
      version: domain.version,
      summary: domain.summary,
      hostNamespace: domain.hostNamespace,
      status,
      passedChecks,
      totalChecks,
      checks,
      missingChecks: checks.filter((entry) => !entry.ok),
      referenceCheckStatus,
      referenceChecks,
      canonicalTerms: domain.canonicalTerms,
      nonGoals: domain.nonGoals,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    projectRoot: absoluteProjectRoot,
    referenceRoot,
    referenceRootPresent,
    summary: {
      totalDomains: domains.length,
      passedDomains: domains.filter((entry) => entry.status === "passed").length,
      failedDomains: domains.filter((entry) => entry.status === "failed").length,
      skippedSourceDomains: domains.filter((entry) => entry.referenceCheckStatus === "skipped").length,
    },
    domains,
  };
}

export function renderZoteroHostSemanticGuardMarkdown(report, options = {}) {
  const registryPath = options.registryPath ? path.resolve(options.registryPath) : DEFAULT_HOST_SEMANTIC_INDEX_RELATIVE_PATH;
  const lines = [
    "# Zotero Host Semantic Guard",
    "",
    `- Generated At: \`${report.generatedAt}\``,
    `- Project Root: \`${report.projectRoot}\``,
    `- Registry: \`${registryPath}\``,
    `- Status: \`${report.status}\``,
    `- Reference Root: \`${report.referenceRoot}\``,
    `- Reference Present: \`${report.referenceRootPresent ? "yes" : "no"}\``,
    `- Summary: passed ${report.summary.passedDomains} / failed ${report.summary.failedDomains} / source-skipped ${report.summary.skippedSourceDomains}`,
    "",
    "## Semantic Domain Status",
    "",
    "| Domain | Status | Checks | Source Check |",
    "| --- | --- | --- | --- |",
    ...report.domains.map((domain) => `| \`${domain.id}\` | \`${domain.status}\` | ${domain.passedChecks}/${domain.totalChecks} | \`${domain.referenceCheckStatus}\` |`),
  ];

  if (report.docSync) {
    lines.push("");
    lines.push("## Doc Sync", "");
    lines.push(`- Status: \`${report.docSync.ok ? "passed" : "failed"}\``);
    lines.push(`- Expected Doc: \`${DEFAULT_HOST_SEMANTIC_INDEX_DOC_RELATIVE_PATH}\``);
  }

  if (report.validationSurfaceSync) {
    lines.push("");
    lines.push("## Validation Surface Semantic Links", "");
    lines.push(`- Status: \`${report.validationSurfaceSync.ok ? "passed" : "failed"}\``);
    report.validationSurfaceSync.checks.forEach((entry) => {
      lines.push(`- ${entry.ok ? "[passed]" : "[failed]"} ${entry.expected} (actual: \`${entry.actual}\`)`);
    });
  }

  if (Array.isArray(report.terminologyDriftChecks) && report.terminologyDriftChecks.length > 0) {
    lines.push("");
    lines.push("## Terminology Drift", "");
    report.terminologyDriftChecks.forEach((entry) => {
      lines.push(`- ${entry.ok ? "[passed]" : "[failed]"} avoid \`${entry.term}\` in ${entry.scopeLabel} (actual: \`${entry.actual}\`)`);
    });
  }

  report.domains.forEach((domain) => {
    lines.push("");
    lines.push(`### \`${domain.id}\``);
    lines.push("");
    lines.push(`- Status: \`${domain.status}\``);
    lines.push(`- Checks: ${domain.passedChecks}/${domain.totalChecks}`);
    lines.push(`- Source Check: \`${domain.referenceCheckStatus}\``);
    if (domain.missingChecks.length === 0) {
      lines.push("- Missing Checks: none");
    } else {
      lines.push("- Missing Checks:");
      domain.missingChecks.forEach((entry) => {
        lines.push(`  - [${entry.type}] ${entry.expected} (actual: \`${entry.actual}\`)`);
      });
    }
    lines.push("- Reference Checks:");
    domain.referenceChecks.forEach((entry) => {
      lines.push(`  - [${entry.skipped ? "skipped" : entry.ok ? "passed" : "failed"}] ${entry.expected} (actual: \`${entry.actual}\`)`);
    });
    lines.push("- Canonical Terms:");
    domain.canonicalTerms.forEach((entry) => {
      lines.push(`  - \`${entry.term}\` / ${entry.preferredChinese}`);
    });
    lines.push("- Non-Goals:");
    domain.nonGoals.forEach((entry) => {
      lines.push(`  - ${entry}`);
    });
  });

  if (Array.isArray(report.blockers) && report.blockers.length > 0) {
    lines.push("");
    lines.push("## Blockers", "");
    report.blockers.forEach((entry) => lines.push(`- ${entry}`));
  }

  return `${lines.join("\n")}\n`;
}
