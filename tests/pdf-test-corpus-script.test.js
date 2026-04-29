import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, assert } from "./test-framework.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function writeText(filePath, content, mode = undefined) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
  if (mode) {
    fs.chmodSync(filePath, mode);
  }
}

describe("PDF Test Corpus Script", () => {
  it("should write a manifest via the CLI entrypoint", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-test-corpus-script-"));
    const binDir = path.join(tempRoot, "bin");
    const corpusDir = path.join(tempRoot, "corpus");
    const outputPath = path.join(tempRoot, "dist", "manifest.json");

    try {
      writeText(path.join(corpusDir, "CLI Sample.pdf"), "fixture\n");
      writeText(path.join(binDir, "pdfinfo"), `#!/usr/bin/env node
process.stdout.write(\`Title: CLI Sample
Author: CLI Author
CreationDate: D:20240101000000Z
Pages: 3
Encrypted: no
File size: 12 bytes
\`);
`, 0o755);
      writeText(path.join(binDir, "pdftotext"), `#!/usr/bin/env node
process.stdout.write("sample text\\n");
`, 0o755);

      execFileSync("node", [
        "scripts/pdf-test-corpus.mjs",
        "--root",
        corpusDir,
        "--output",
        outputPath,
      ], {
        cwd: projectRoot,
        env: {
          ...process.env,
          PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
        },
        stdio: "pipe",
      });

      const manifest = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
      assert.equal(manifest.summary.totalEntries, 1);
      assert.equal(manifest.entries[0].metadata.title, "CLI Sample");
      assert.equal(manifest.entries[0].metadata.author, "CLI Author");
      assert.equal(manifest.entries[0].firstPageText.nonEmpty, true);
      assert.equal(manifest.onlineEnrichment.enabled, false);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
