import path from "node:path";
import {
  DEFAULT_BUNDLE_DOC_RELATIVE_PATH,
  loadFrameworkBackfillBundleRegistry,
  inspectFrameworkBackfillBundleAdoption,
  renderFrameworkBackfillBundleMarkdown,
} from "./framework-backfill-bundles-lib.mjs";
import fs from "node:fs";

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function main() {
  const { registryPath, registry } = loadFrameworkBackfillBundleRegistry(projectRoot);
  const expectedDoc = renderFrameworkBackfillBundleMarkdown(registry);
  const docPath = path.join(projectRoot, DEFAULT_BUNDLE_DOC_RELATIVE_PATH);
  const actualDoc = fs.existsSync(docPath) ? fs.readFileSync(docPath, "utf-8") : "";

  const issues = [];
  if (actualDoc !== expectedDoc) {
    issues.push(`Bundle doc drifted from registry: ${DEFAULT_BUNDLE_DOC_RELATIVE_PATH}`);
  }

  const audit = inspectFrameworkBackfillBundleAdoption(projectRoot, registry, { registryPath });
  audit.bundles
    .filter((bundle) => bundle.adoptionStatus !== "adopted")
    .forEach((bundle) => {
      issues.push(`Bundle ${bundle.id} adoption is ${bundle.adoptionStatus}.`);
      bundle.missingChecks.forEach((item) => {
        issues.push(`- ${bundle.id}: [${item.type}] ${item.expected}`);
      });
    });
  audit.bundles
    .filter((bundle) => bundle.mirrorStatus !== "current")
    .forEach((bundle) => {
      issues.push(`Bundle ${bundle.id} registry mirror is ${bundle.mirrorStatus}.`);
      bundle.mirrorComparison.reasons.forEach((reason) => {
        issues.push(`- ${bundle.id}: [mirror] ${reason}`);
      });
    });
  if (audit.localRegistry.extraLocalBundles.length > 0) {
    audit.localRegistry.extraLocalBundles.forEach((bundle) => {
      issues.push(`Extra local-only bundle present: ${bundle.id}.`);
    });
  }

  if (issues.length > 0) {
    console.error("Framework governance check failed:");
    console.error(`- Registry: ${registryPath}`);
    issues.forEach((entry) => console.error(entry.startsWith("-") ? entry : `- ${entry}`));
    process.exit(1);
  }

  console.log(`Framework governance check passed: ${registryPath}`);
  console.log(`All ${audit.summary.totalBundles} bundles are adopted in the current project and registry mirror is current.`);
}

main();
