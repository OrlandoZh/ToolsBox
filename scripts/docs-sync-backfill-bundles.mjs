import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_BUNDLE_DOC_RELATIVE_PATH,
  loadFrameworkBackfillBundleRegistry,
  renderFrameworkBackfillBundleMarkdown,
} from "./framework-backfill-bundles-lib.mjs";

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const checkOnly = process.argv.includes("--check");

const { registry } = loadFrameworkBackfillBundleRegistry(projectRoot);
const expected = renderFrameworkBackfillBundleMarkdown(registry);
const docPath = path.join(projectRoot, DEFAULT_BUNDLE_DOC_RELATIVE_PATH);
const actual = fs.existsSync(docPath) ? fs.readFileSync(docPath, "utf-8") : "";

if (actual !== expected) {
  if (checkOnly) {
    console.error("Framework backfill bundle doc drift detected:");
    console.error(`- ${DEFAULT_BUNDLE_DOC_RELATIVE_PATH}`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(docPath), { recursive: true });
  fs.writeFileSync(docPath, expected, "utf-8");
  console.log(`Framework backfill bundle doc updated: ${docPath}`);
  process.exit(0);
}

if (checkOnly) {
  console.log("Framework backfill bundle doc is in sync.");
} else {
  console.log("Framework backfill bundle doc already up to date.");
}
