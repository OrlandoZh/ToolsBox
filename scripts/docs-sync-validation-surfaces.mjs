import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_VALIDATION_SURFACES_DOC_RELATIVE_PATH,
  loadValidationSurfacesRegistry,
  renderValidationSurfacesMarkdown,
} from "./validation-surfaces-lib.mjs";

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const checkOnly = process.argv.includes("--check");

const { registry } = loadValidationSurfacesRegistry(projectRoot);
const expected = renderValidationSurfacesMarkdown(registry);
const docPath = path.join(projectRoot, DEFAULT_VALIDATION_SURFACES_DOC_RELATIVE_PATH);
const actual = fs.existsSync(docPath) ? fs.readFileSync(docPath, "utf-8") : "";

if (actual !== expected) {
  if (checkOnly) {
    console.error("Validation surfaces doc drift detected:");
    console.error(`- ${DEFAULT_VALIDATION_SURFACES_DOC_RELATIVE_PATH}`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(docPath), { recursive: true });
  fs.writeFileSync(docPath, expected, "utf-8");
  console.log(`Validation surfaces doc updated: ${docPath}`);
  process.exit(0);
}

if (checkOnly) {
  console.log("Validation surfaces doc is in sync.");
} else {
  console.log("Validation surfaces doc already up to date.");
}
