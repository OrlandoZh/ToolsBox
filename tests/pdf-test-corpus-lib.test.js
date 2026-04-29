import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  createPdfFamilyKey,
  detectPdfVariantKind,
  parseFilenameDerivedMetadata,
  parsePdfInfoOutput,
  scanPdfTestCorpus,
} from "../scripts/pdf-test-corpus-lib.mjs";

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

function createHashForName(name) {
  return crypto.createHash("sha256").update(name).digest("hex");
}

describe("PDF Test Corpus Lib", () => {
  it("should classify translated variants into the same family", () => {
    assert.equal(
      detectPdfVariantKind("Doe - 2024 - Example Article.no_watermark.zh.dual.pdf"),
      "translated-dual",
    );
    assert.equal(
      createPdfFamilyKey("Doe - 2024 - Example Article.no_watermark.zh.dual.pdf"),
      "Doe - 2024 - Example Article",
    );
    assert.equal(
      createPdfFamilyKey("Yakushi et al_1997_Lethality_Suppr AI 翻译_zh-cn_dual.pdf"),
      "Yakushi et al_1997_Lethality",
    );
  });

  it("should derive filename metadata conservatively", () => {
    assert.deepEqual(
      parseFilenameDerivedMetadata("Doe - 2024 - Example Article.pdf"),
      {
        matched: true,
        authors: "Doe",
        year: 2024,
        title: "Example Article",
      },
    );
    assert.deepEqual(
      parseFilenameDerivedMetadata("扫描版pdf.pdf"),
      {
        matched: false,
        authors: null,
        year: null,
        title: null,
      },
    );
  });

  it("should parse pdfinfo output into structured metadata", () => {
    const parsed = parsePdfInfoOutput(`Title: Example Article
Author: Jane Doe
CreationDate: D:20240101000000Z
Pages: 12
Encrypted: yes (print:yes copy:yes change:no addNotes:yes algorithm:AES)
File size: 12345 bytes
`);

    assert.equal(parsed.title, "Example Article");
    assert.equal(parsed.author, "Jane Doe");
    assert.equal(parsed.creationDate, "D:20240101000000Z");
    assert.equal(parsed.pages, 12);
    assert.equal(parsed.encrypted, true);
    assert.equal(parsed.fileSizeBytes, 12345);
  });

  it("should build a corpus report with online metadata enrichment", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-test-corpus-lib-"));
    try {
      const files = [
        "Doe - 2024 - Example Article.pdf",
        "Doe - 2024 - Example Article.no_watermark.zh.dual.pdf",
        "扫描版pdf.pdf",
        "Encrypted Sample.pdf",
      ];
      files.forEach((fileName) => {
        writeText(path.join(root, fileName), `fixture:${fileName}\n`);
      });

      const pdfInfoByFileName = new Map([
        ["Doe - 2024 - Example Article.pdf", `Title:
Author:
CreationDate:
Pages: 7
Encrypted: no
File size: 111 bytes
`],
        ["Doe - 2024 - Example Article.no_watermark.zh.dual.pdf", `Title:
Author:
CreationDate:
Pages: 7
Encrypted: no
File size: 112 bytes
`],
        ["扫描版pdf.pdf", `Title:
Author:
CreationDate:
Pages: 8
Encrypted: no
File size: 113 bytes
`],
        ["Encrypted Sample.pdf", `Title:
Author:
CreationDate:
Pages: 9
Encrypted: yes (print:yes copy:yes change:no addNotes:yes algorithm:AES)
File size: 114 bytes
`],
      ]);

      const firstPageTextByFileName = new Map([
        ["Doe - 2024 - Example Article.pdf", "This is a text PDF\n"],
        ["Doe - 2024 - Example Article.no_watermark.zh.dual.pdf", "This is a translated text PDF\n"],
        ["扫描版pdf.pdf", ""],
        ["Encrypted Sample.pdf", "Encrypted but extractable\n"],
      ]);

      const report = await scanPdfTestCorpus({
        rootDir: root,
        enrichOnline: true,
        crossrefMailto: "codex@example.com",
        commandRunner: async (command, args) => {
          const filePath = args.length === 1 ? args[0] : args[args.length - 2];
          const fileName = path.basename(filePath);
          if (command === "pdfinfo") {
            return {
              stdout: pdfInfoByFileName.get(fileName) || "",
              stderr: "",
            };
          }
          if (command === "pdftotext") {
            return {
              stdout: firstPageTextByFileName.get(fileName) || "",
              stderr: "",
            };
          }
          throw new Error(`Unexpected command: ${command}`);
        },
        hashFile: async (filePath) => createHashForName(path.basename(filePath)),
        fetchImpl: async (url) => {
          const parsedURL = new URL(url);
          const query = parsedURL.searchParams.get("query.bibliographic") || "";
          const matched = query.includes("Example Article");
          return {
            ok: true,
            async json() {
              return {
                message: {
                  items: matched
                    ? [{
                        DOI: "10.1234/example-doi",
                        URL: "https://doi.org/10.1234/example-doi",
                        author: [{ given: "Jane", family: "Doe" }],
                        "container-title": ["Example Journal"],
                        issued: { "date-parts": [[2024, 4, 1]] },
                        publisher: "Example Publisher",
                        score: 88.2,
                        title: ["Example Article"],
                        type: "journal-article",
                      }]
                    : [],
                },
              };
            },
          };
        },
      });

      assert.equal(report.summary.totalEntries, 4);
      assert.equal(report.summary.duplicateFamilyCount, 1);
      assert.equal(report.summary.onlineMatchedCount, 2);
      assert.equal(report.summary.encryptedCount, 1);
      assert.equal(report.summary.textExtractableCount, 3);

      const originalEntry = report.entries.find((entry) => entry.fileName === "Doe - 2024 - Example Article.pdf");
      assert.equal(originalEntry.onlineEnrichment.status, "matched");
      assert.equal(originalEntry.resolvedMetadata.doi, "10.1234/example-doi");
      assert.includes(originalEntry.tags, "online-metadata-match");
      assert.equal(originalEntry.recommendedLane, "metadata-poor");

      const translatedEntry = report.entries.find((entry) => entry.fileName.endsWith(".zh.dual.pdf"));
      assert.includes(translatedEntry.tags, "translated-variant");

      const scannedEntry = report.entries.find((entry) => entry.fileName === "扫描版pdf.pdf");
      assert.equal(scannedEntry.recommendedLane, "scan-ocr");

      const encryptedEntry = report.entries.find((entry) => entry.fileName === "Encrypted Sample.pdf");
      assert.equal(encryptedEntry.recommendedLane, "permission-edge");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

