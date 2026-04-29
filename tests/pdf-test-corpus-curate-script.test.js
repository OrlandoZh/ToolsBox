import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, assert } from "./test-framework.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function writeJSON(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

describe("PDF Test Corpus Curate Script", () => {
  it("should write curated selection artifacts via the CLI entrypoint", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-test-corpus-curate-script-"));
    const manifestPath = path.join(tempRoot, "manifest.json");
    const outputPath = path.join(tempRoot, "out", "selection.json");

    try {
      writeJSON(manifestPath, {
        sourceRoot: "/tmp/corpus",
        entries: [
          {
            id: "core-1",
            fileName: "core-1.pdf",
            relativePath: "core-1.pdf",
            familyKey: "core-1",
            filenameDerived: { matched: true, title: "Core 1", authors: "Author 1" },
            recommendedLane: "core-text",
            variantKind: "original",
            tags: [],
            metadata: { title: "Core 1", author: "Author 1", pages: 8, encrypted: false },
            resolvedMetadata: { title: "Core 1", author: "Author 1", doi: null, journal: null },
            firstPageText: { nonEmpty: true },
            onlineEnrichment: { status: "skipped" },
          },
          {
            id: "meta-1",
            fileName: "meta-1.pdf",
            relativePath: "meta-1.pdf",
            familyKey: "meta-1",
            filenameDerived: { matched: true, title: "Meta 1", authors: "Author 1" },
            recommendedLane: "metadata-poor",
            variantKind: "original",
            tags: ["metadata-poor"],
            metadata: { title: "", author: "", pages: 8, encrypted: false },
            resolvedMetadata: { title: "Meta 1", author: "Author 1", doi: null, journal: null },
            firstPageText: { nonEmpty: true },
            onlineEnrichment: { status: "matched" },
          },
          {
            id: "scan-1",
            fileName: "scan-1.pdf",
            relativePath: "scan-1.pdf",
            familyKey: "scan-1",
            filenameDerived: { matched: false, title: null, authors: null },
            recommendedLane: "scan-ocr",
            variantKind: "original",
            tags: ["scan-ocr-candidate"],
            metadata: { title: "", author: "", pages: 100, encrypted: false },
            resolvedMetadata: { title: null, author: null, doi: null, journal: null },
            firstPageText: { nonEmpty: false },
            onlineEnrichment: { status: "error" },
          },
          {
            id: "perm-1",
            fileName: "perm-1.pdf",
            relativePath: "perm-1.pdf",
            familyKey: "perm-1",
            filenameDerived: { matched: true, title: "Perm 1", authors: "Author P" },
            recommendedLane: "permission-edge",
            variantKind: "original",
            tags: ["permission-edge"],
            metadata: { title: "Perm 1", author: "Author P", pages: 50, encrypted: true },
            resolvedMetadata: { title: "Perm 1", author: "Author P", doi: null, journal: null },
            firstPageText: { nonEmpty: true },
            onlineEnrichment: { status: "empty" },
          },
          {
            id: "pair-orig",
            fileName: "pair-orig.pdf",
            relativePath: "pair-orig.pdf",
            familyKey: "pair-family",
            filenameDerived: { matched: true, title: "Pair Orig", authors: "Author Pair" },
            recommendedLane: "metadata-poor",
            variantKind: "original",
            tags: ["metadata-poor"],
            metadata: { title: "", author: "", pages: 12, encrypted: false },
            resolvedMetadata: { title: "Pair Orig", author: "Author Pair", doi: null, journal: null },
            firstPageText: { nonEmpty: true },
            onlineEnrichment: { status: "empty" },
          },
          {
            id: "pair-dual",
            fileName: "pair-dual.pdf",
            relativePath: "pair-dual.pdf",
            familyKey: "pair-family",
            filenameDerived: { matched: true, title: "Pair Dual", authors: "Author Pair" },
            recommendedLane: "translated-variant",
            variantKind: "translated-dual",
            tags: ["translated-variant"],
            metadata: { title: "", author: "", pages: 12, encrypted: false },
            resolvedMetadata: { title: "Pair Dual", author: "Author Pair", doi: "10.1/pair", journal: "J" },
            firstPageText: { nonEmpty: true },
            onlineEnrichment: { status: "matched" },
          },
        ],
        families: [
          {
            familyKey: "pair-family",
            familyKeyNormalized: "pair-family",
            entryIds: ["pair-orig", "pair-dual"],
            variantKinds: ["original", "translated-dual"],
            size: 2,
          },
        ],
      });

      execFileSync("node", [
        "scripts/pdf-test-corpus-curate.mjs",
        "--manifest",
        manifestPath,
        "--output",
        outputPath,
      ], {
        cwd: projectRoot,
        stdio: "pipe",
      });

      const jsonSelection = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
      assert.equal(jsonSelection.profile, "balanced-v1");
      assert.equal(fs.existsSync(outputPath.replace(/\.json$/u, ".md")), true);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

