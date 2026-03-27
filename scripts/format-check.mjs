import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const TEXT_DIRECTORIES = [
  "src",
  "scripts",
  "tests",
  "addon-static",
  "config",
  "types",
  "docs",
];

const TEXT_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".json",
  ".md",
  ".d.ts",
  ".css",
  ".xhtml",
  ".ftl",
]);

async function collectFiles(rootDir, files = []) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(fullPath, files);
      continue;
    }

    const ext = entry.name.endsWith(".d.ts") ? ".d.ts" : path.extname(entry.name);
    if (TEXT_EXTENSIONS.has(ext)) {
      files.push(fullPath);
    }
  }
  return files;
}

function findViolations(content) {
  const violations = [];
  const lines = content.split("\n");

  lines.forEach((line, index) => {
    if (/[ \t]+$/.test(line)) {
      violations.push(`line ${index + 1}: trailing whitespace`);
    }
    if (line.includes("\t")) {
      violations.push(`line ${index + 1}: tab character`);
    }
  });

  if (!content.endsWith("\n")) {
    violations.push("missing trailing newline");
  }

  return violations;
}

async function main() {
  const failures = [];

  for (const relativeDir of TEXT_DIRECTORIES) {
    const fullDir = path.join(projectRoot, relativeDir);
    const files = await collectFiles(fullDir);
    for (const filePath of files.sort()) {
      const content = await fs.readFile(filePath, "utf-8");
      const violations = findViolations(content);
      if (violations.length > 0) {
        failures.push(`${path.relative(projectRoot, filePath)}\n  - ${violations.join("\n  - ")}`);
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(`Format check failed:\n${failures.join("\n")}`);
  }

  console.log("Format check complete: whitespace rules passed");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
