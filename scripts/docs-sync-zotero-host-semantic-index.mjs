import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_HOST_SEMANTIC_INDEX_DOC_RELATIVE_PATH,
  loadZoteroHostSemanticIndexRegistry,
  renderZoteroHostSemanticIndexMarkdown,
} from "./zotero-host-semantic-index-lib.mjs";

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const checkOnly = process.argv.includes("--check");

const { registry } = loadZoteroHostSemanticIndexRegistry(projectRoot);
const expected = renderZoteroHostSemanticIndexMarkdown(registry);
const docPath = path.join(projectRoot, DEFAULT_HOST_SEMANTIC_INDEX_DOC_RELATIVE_PATH);
const actual = fs.existsSync(docPath) ? fs.readFileSync(docPath, "utf-8") : "";

if (actual !== expected) {
  if (checkOnly) {
    console.error("Zotero host semantic index doc drift detected:");
    console.error(`- ${DEFAULT_HOST_SEMANTIC_INDEX_DOC_RELATIVE_PATH}`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(docPath), { recursive: true });
  fs.writeFileSync(docPath, expected, "utf-8");
  console.log(`Zotero host semantic index doc updated: ${docPath}`);
  process.exit(0);
}

if (checkOnly) {
  console.log("Zotero host semantic index doc is in sync.");
} else {
  console.log("Zotero host semantic index doc already up to date.");
}
