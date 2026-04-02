import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_EXPANSION_WAVE_CONTRACT_DOC_RELATIVE_PATH,
  loadExpansionWaveContractsRegistry,
  renderExpansionWaveContractMarkdown,
} from "./expansion-wave-contracts-lib.mjs";

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const checkOnly = process.argv.includes("--check");

const { registry } = loadExpansionWaveContractsRegistry(projectRoot);
const expected = renderExpansionWaveContractMarkdown(registry);
const docPath = path.join(projectRoot, DEFAULT_EXPANSION_WAVE_CONTRACT_DOC_RELATIVE_PATH);
const actual = fs.existsSync(docPath) ? fs.readFileSync(docPath, "utf-8") : "";

if (actual !== expected) {
  if (checkOnly) {
    console.error("Expansion wave contract doc drift detected:");
    console.error(`- ${DEFAULT_EXPANSION_WAVE_CONTRACT_DOC_RELATIVE_PATH}`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(docPath), { recursive: true });
  fs.writeFileSync(docPath, expected, "utf-8");
  console.log(`Expansion wave contract doc updated: ${docPath}`);
  process.exit(0);
}

if (checkOnly) {
  console.log("Expansion wave contract doc is in sync.");
} else {
  console.log("Expansion wave contract doc already up to date.");
}
