import { promises as fs } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const JS_DIRECTORIES = [
  "src",
  "scripts",
  "tests",
  "addon-static",
];

const JSON_FILES = [
  "config/addon.config.json",
  "package.json",
];

async function collectFiles(rootDir, extensions, files = []) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(fullPath, extensions, files);
      continue;
    }

    if (extensions.includes(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function runNodeCheck(filePath) {
  const result = spawnSync(process.execPath, ["--check", filePath], {
    cwd: projectRoot,
    encoding: "utf-8",
  });

  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`Syntax check failed for ${path.relative(projectRoot, filePath)}\n${details}`);
  }
}

async function validateJSON(filePath) {
  const content = await fs.readFile(filePath, "utf-8");
  JSON.parse(content);
}

async function main() {
  for (const relativeDir of JS_DIRECTORIES) {
    const fullDir = path.join(projectRoot, relativeDir);
    const files = await collectFiles(fullDir, [".js", ".mjs"]);
    files.sort().forEach(runNodeCheck);
  }

  for (const relativePath of JSON_FILES) {
    await validateJSON(path.join(projectRoot, relativePath));
  }

  console.log("Lint complete: syntax and JSON checks passed");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
