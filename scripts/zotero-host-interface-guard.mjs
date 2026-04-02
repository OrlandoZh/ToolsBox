import fs from "node:fs";
import path from "node:path";
import { writeJSONArtifact } from "./script-runtime-lib.mjs";
import {
  DEFAULT_HOST_INTERFACE_CONTRACT_DOC_RELATIVE_PATH,
  loadZoteroHostInterfaceContractRegistry,
  inspectZoteroHostInterfaceContracts,
  renderZoteroHostInterfaceContractMarkdown,
  renderZoteroHostInterfaceGuardMarkdown,
  resolveZoteroHostInterfaceReferenceRoot,
} from "./zotero-host-interface-contract-lib.mjs";

const defaultProjectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const projectRoot = path.resolve(options.projectRoot || defaultProjectRoot);
  const outputDir = path.resolve(options.outputDir || path.join(projectRoot, "dist"));
  const { registryPath, registry } = loadZoteroHostInterfaceContractRegistry(projectRoot, {
    registryPath: options.registryPath,
  });
  const expectedDoc = renderZoteroHostInterfaceContractMarkdown(registry);
  const docPath = path.join(projectRoot, DEFAULT_HOST_INTERFACE_CONTRACT_DOC_RELATIVE_PATH);
  const actualDoc = fs.existsSync(docPath) ? fs.readFileSync(docPath, "utf-8") : "";
  const inspection = inspectZoteroHostInterfaceContracts(projectRoot, registry, {
    referenceRoot: options.referenceRoot,
  });
  const referenceRoot = resolveZoteroHostInterfaceReferenceRoot(projectRoot, {
    referenceRoot: options.referenceRoot,
  });

  const blockers = [];
  const docSync = {
    ok: actualDoc === expectedDoc,
    expectedPath: DEFAULT_HOST_INTERFACE_CONTRACT_DOC_RELATIVE_PATH,
  };

  if (!docSync.ok) {
    blockers.push(`Contract doc drifted from registry: ${DEFAULT_HOST_INTERFACE_CONTRACT_DOC_RELATIVE_PATH}`);
  }

  inspection.contracts
    .filter((contract) => contract.status !== "passed")
    .forEach((contract) => {
      blockers.push(`Contract ${contract.id} is ${contract.status}.`);
      contract.missingChecks.forEach((item) => {
        blockers.push(`- ${contract.id}: [${item.type}] ${item.expected}`);
      });
      contract.referenceChecks
        .filter((item) => !item.ok && !item.skipped)
        .forEach((item) => {
          blockers.push(`- ${contract.id}: [referenceSource] ${item.expected}`);
        });
    });

  const report = {
    ...inspection,
    registryPath,
    referenceRoot,
    docSync,
    blockers,
    status: blockers.length === 0 ? "passed" : (options.strict ? "failed" : "warning"),
    mode: options.strict ? "strict" : "warn",
  };
  const markdown = renderZoteroHostInterfaceGuardMarkdown(report, { registryPath });

  fs.mkdirSync(outputDir, { recursive: true });
  await writeJSONArtifact(path.join(outputDir, "zotero-host-interface-guard.json"), report);
  fs.writeFileSync(path.join(outputDir, "zotero-host-interface-guard.md"), markdown, "utf-8");

  console.log(`Host interface guard (${report.mode}): ${report.status}`);
  console.log(`- Registry: ${registryPath}`);
  console.log(`- Reference Root: ${referenceRoot}`);
  console.log(`- Contracts: passed ${report.summary.passedContracts} / failed ${report.summary.failedContracts} / source-skipped ${report.summary.skippedSourceContracts}`);
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
