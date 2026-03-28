import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, assert } from "./test-framework.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testsRoot = __dirname;
const runAllPath = path.join(testsRoot, "run-all.js");

function listTestFiles() {
  return fs.readdirSync(testsRoot)
    .filter((file) => file.endsWith(".test.js"))
    .sort((left, right) => left.localeCompare(right, "en"));
}

function listImportedTestFiles(source) {
  return Array.from(source.matchAll(/import\s+['"]\.\/([^'"]+\.test\.js)['"];?/gu))
    .map((match) => String(match[1] || "").trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, "en"));
}

describe("Run All Completeness", () => {
  it("should import every tests/*.test.js file from run-all.js", () => {
    const runAllSource = fs.readFileSync(runAllPath, "utf-8");
    const importedFiles = listImportedTestFiles(runAllSource);
    const testFiles = listTestFiles();
    const missingFiles = testFiles.filter((file) => !importedFiles.includes(file));

    assert.deepEqual(missingFiles, [], `run-all.js is missing test imports: ${missingFiles.join(", ")}`);
  });
});
