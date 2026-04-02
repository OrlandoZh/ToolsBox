import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_HOST_INTERFACE_CONTRACT_DOC_RELATIVE_PATH,
  loadZoteroHostInterfaceContractRegistry,
  renderZoteroHostInterfaceContractMarkdown,
} from "./zotero-host-interface-contract-lib.mjs";

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const checkOnly = process.argv.includes("--check");

const { registry } = loadZoteroHostInterfaceContractRegistry(projectRoot);
const expected = renderZoteroHostInterfaceContractMarkdown(registry);
const docPath = path.join(projectRoot, DEFAULT_HOST_INTERFACE_CONTRACT_DOC_RELATIVE_PATH);
const actual = fs.existsSync(docPath) ? fs.readFileSync(docPath, "utf-8") : "";

if (actual !== expected) {
  if (checkOnly) {
    console.error("Zotero host interface contract doc drift detected:");
    console.error(`- ${DEFAULT_HOST_INTERFACE_CONTRACT_DOC_RELATIVE_PATH}`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(docPath), { recursive: true });
  fs.writeFileSync(docPath, expected, "utf-8");
  console.log(`Zotero host interface contract doc updated: ${docPath}`);
  process.exit(0);
}

if (checkOnly) {
  console.log("Zotero host interface contract doc is in sync.");
} else {
  console.log("Zotero host interface contract doc already up to date.");
}
