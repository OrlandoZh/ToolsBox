import fs from "node:fs";
import path from "node:path";
import {
  inspectFrameworkBackfillBundleAdoption,
  loadFrameworkBackfillBundleRegistry,
  renderFrameworkBackfillAuditMarkdown,
} from "./framework-backfill-bundles-lib.mjs";

const templateRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function parseArgs(argv) {
  const result = {
    projectRoot: process.cwd(),
    registryPath: null,
    outputDir: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--project-root") {
      result.projectRoot = argv[index + 1];
      index += 1;
    } else if (value === "--registry") {
      result.registryPath = argv[index + 1];
      index += 1;
    } else if (value === "--output-dir") {
      result.outputDir = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }

  return result;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const projectRoot = path.resolve(options.projectRoot || process.cwd());
  const outputDir = path.resolve(options.outputDir || path.join(projectRoot, "dist"));
  const { registryPath, registry } = loadFrameworkBackfillBundleRegistry(templateRoot, {
    registryPath: options.registryPath,
  });
  const audit = inspectFrameworkBackfillBundleAdoption(projectRoot, registry, { registryPath });
  const markdown = renderFrameworkBackfillAuditMarkdown(audit, { registryPath });

  fs.mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, "framework-bundle-audit.json");
  const markdownPath = path.join(outputDir, "framework-bundle-audit.md");
  fs.writeFileSync(jsonPath, `${JSON.stringify(audit, null, 2)}\n`, "utf-8");
  fs.writeFileSync(markdownPath, markdown, "utf-8");

  console.log(`Framework bundle audit generated: ${jsonPath}`);
  console.log(`Framework bundle audit generated: ${markdownPath}`);
  audit.bundles.forEach((bundle) => {
    console.log(`- ${bundle.id}: ${bundle.adoptionStatus}/${bundle.mirrorStatus} (${bundle.passedChecks}/${bundle.totalChecks})`);
    if (bundle.expansionWaveDetails) {
      console.log(
        `  expansion-wave: ${bundle.expansionWaveDetails.projectWaveStatus || "null"}`
        + ` / ${bundle.expansionWaveDetails.currentContractId || "null"}`
        + ` / ${bundle.expansionWaveDetails.currentWaveName || "-"}`
        + ` / ${bundle.expansionWaveDetails.acceptanceTrack || "-"}`,
      );
    }
  });
}

main();
