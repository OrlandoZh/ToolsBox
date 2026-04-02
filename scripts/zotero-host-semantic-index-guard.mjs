import fs from "node:fs";
import path from "node:path";
import { writeJSONArtifact } from "./script-runtime-lib.mjs";
import { loadValidationSurfacesRegistry } from "./validation-surfaces-lib.mjs";
import {
  DEFAULT_HOST_SEMANTIC_INDEX_DOC_RELATIVE_PATH,
  DEFAULT_HOST_SEMANTIC_INDEX_RELATIVE_PATH,
  inspectZoteroHostSemanticIndex,
  loadZoteroHostSemanticIndexRegistry,
  renderZoteroHostSemanticGuardMarkdown,
  renderZoteroHostSemanticIndexMarkdown,
  resolveZoteroHostSemanticReferenceRoot,
} from "./zotero-host-semantic-index-lib.mjs";

const defaultProjectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const TERMINOLOGY_SCAN_DOCS = [
  "AGENTS.md",
  "config/validation-surfaces.json",
  "docs/VALIDATION_SURFACES.md",
  "docs/ZOTERO_HOST_INTERFACE_CONTRACTS.md",
  "docs/ARCHITECTURE.md",
];

function parseArgs(argv) {
  const options = {
    strict: false,
    projectRoot: defaultProjectRoot,
    registryPath: null,
    referenceRoot: null,
    outputDir: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--strict") {
      options.strict = true;
    } else if (value === "--project-root") {
      options.projectRoot = path.resolve(String(argv[index + 1] || "").trim());
      index += 1;
    } else if (value === "--registry") {
      options.registryPath = path.resolve(String(argv[index + 1] || "").trim());
      index += 1;
    } else if (value === "--reference-root") {
      options.referenceRoot = path.resolve(String(argv[index + 1] || "").trim());
      index += 1;
    } else if (value === "--output-dir") {
      options.outputDir = path.resolve(String(argv[index + 1] || "").trim());
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }

  return options;
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

function buildTerminologyDriftChecks(projectRoot, registry) {
  const scopeFiles = new Set(TERMINOLOGY_SCAN_DOCS);
  registry.domains.forEach((domain) => {
    domain.ownerFiles.forEach((entry) => scopeFiles.add(entry));
    domain.requiredTypes.forEach((entry) => scopeFiles.add(entry.file));
  });

  const loweredSources = Array.from(scopeFiles).map((relativePath) => {
    const absolutePath = path.join(projectRoot, relativePath);
    const source = safeReadText(absolutePath);
    return {
      relativePath,
      absolutePath,
      exists: source !== null,
      source,
      loweredSource: String(source || "").toLowerCase(),
    };
  });

  return registry.domains.flatMap((domain) => domain.canonicalTerms.flatMap((termEntry) => termEntry.avoid.map((avoidTerm) => {
    const loweredAvoid = avoidTerm.toLowerCase();
    const hits = loweredSources
      .filter((entry) => entry.exists && entry.loweredSource.includes(loweredAvoid))
      .map((entry) => entry.relativePath);
    return {
      type: "terminologyDrift",
      domainId: domain.id,
      term: avoidTerm,
      ok: hits.length === 0,
      scopeLabel: `semantic scope for ${domain.id}`,
      actual: hits.length === 0 ? "not present" : `present in ${hits.join(", ")}`,
      hits,
    };
  })));
}

function buildValidationSurfaceSync(projectRoot, registry) {
  try {
    const { registry: surfaceRegistry } = loadValidationSurfacesRegistry(projectRoot);
    const semanticDomainIds = new Set(registry.domains.map((entry) => entry.id));
    const checks = surfaceRegistry.surfaces.map((surface) => {
      const missing = surface.hostSemanticDomains.filter((entry) => !semanticDomainIds.has(entry));
      return {
        type: "validationSurfaceSemanticLink",
        surfaceId: surface.id,
        ok: missing.length === 0,
        expected: `surface ${surface.id} references known host semantic domains`,
        actual: missing.length === 0 ? surface.hostSemanticDomains.join(", ") : `unknown domains: ${missing.join(", ")}`,
      };
    });
    return {
      ok: checks.every((entry) => entry.ok),
      checks,
    };
  } catch (error) {
    return {
      ok: false,
      checks: [
        {
          type: "validationSurfaceSemanticLink",
          surfaceId: null,
          ok: false,
          expected: "validation surfaces registry loads and references known host semantic domains",
          actual: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const projectRoot = path.resolve(options.projectRoot || defaultProjectRoot);
  const outputDir = path.resolve(options.outputDir || path.join(projectRoot, "dist"));
  const { registryPath, registry } = loadZoteroHostSemanticIndexRegistry(projectRoot, {
    registryPath: options.registryPath,
  });
  const expectedDoc = renderZoteroHostSemanticIndexMarkdown(registry);
  const docPath = path.join(projectRoot, DEFAULT_HOST_SEMANTIC_INDEX_DOC_RELATIVE_PATH);
  const actualDoc = safeReadText(docPath) || "";
  const inspection = inspectZoteroHostSemanticIndex(projectRoot, registry, {
    referenceRoot: options.referenceRoot,
  });
  const referenceRoot = resolveZoteroHostSemanticReferenceRoot(projectRoot, {
    referenceRoot: options.referenceRoot,
  });
  const terminologyDriftChecks = buildTerminologyDriftChecks(projectRoot, registry);
  const validationSurfaceSync = buildValidationSurfaceSync(projectRoot, registry);

  const blockers = [];
  const docSync = {
    ok: actualDoc === expectedDoc,
    expectedPath: DEFAULT_HOST_SEMANTIC_INDEX_DOC_RELATIVE_PATH,
  };
  if (!docSync.ok) {
    blockers.push(`Semantic index doc drifted from registry: ${DEFAULT_HOST_SEMANTIC_INDEX_DOC_RELATIVE_PATH}`);
  }

  inspection.domains
    .filter((domain) => domain.status !== "passed")
    .forEach((domain) => {
      blockers.push(`Semantic domain ${domain.id} is ${domain.status}.`);
      domain.missingChecks.forEach((entry) => blockers.push(`- ${domain.id}: [${entry.type}] ${entry.expected}`));
      domain.referenceChecks
        .filter((entry) => !entry.ok && !entry.skipped)
        .forEach((entry) => blockers.push(`- ${domain.id}: [referenceSource] ${entry.expected}`));
    });

  terminologyDriftChecks
    .filter((entry) => !entry.ok)
    .forEach((entry) => blockers.push(`Forbidden term ${entry.term} drifted into ${entry.hits.join(", ")}.`));

  validationSurfaceSync.checks
    .filter((entry) => !entry.ok)
    .forEach((entry) => blockers.push(`Validation surface semantic link failed: ${entry.expected}`));

  const report = {
    ...inspection,
    registryPath,
    referenceRoot,
    docSync,
    terminologyDriftChecks,
    validationSurfaceSync,
    blockers,
    status: blockers.length === 0 ? "passed" : (options.strict ? "failed" : "warning"),
    mode: options.strict ? "strict" : "warn",
  };
  const markdown = renderZoteroHostSemanticGuardMarkdown(report, {
    registryPath: registryPath || DEFAULT_HOST_SEMANTIC_INDEX_RELATIVE_PATH,
  });

  fs.mkdirSync(outputDir, { recursive: true });
  await writeJSONArtifact(path.join(outputDir, "zotero-host-semantic-index-guard.json"), report);
  fs.writeFileSync(path.join(outputDir, "zotero-host-semantic-index-guard.md"), markdown, "utf-8");

  console.log(`Host semantic guard (${report.mode}): ${report.status}`);
  console.log(`- Registry: ${registryPath}`);
  console.log(`- Reference Root: ${referenceRoot}`);
  console.log(`- Domains: passed ${report.summary.passedDomains} / failed ${report.summary.failedDomains} / source-skipped ${report.summary.skippedSourceDomains}`);
  if (!report.referenceRootPresent) {
    console.log("- Reference source check skipped because reference root is not mounted locally.");
  }
  if (blockers.length > 0) {
    blockers.forEach((entry) => console.log(entry.startsWith("-") ? entry : `- ${entry}`));
  }

  if (options.strict && blockers.length > 0) {
    process.exit(2);
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
