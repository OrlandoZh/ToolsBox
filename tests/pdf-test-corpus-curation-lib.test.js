import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  buildBalancedPdfCorpusSelection,
  renderPdfCorpusSelectionMarkdown,
  writePdfCorpusSelectionArtifacts,
} from "../scripts/pdf-test-corpus-curation-lib.mjs";

function createEntry(id, overrides = {}) {
  return {
    id,
    fileName: `${id}.pdf`,
    relativePath: `${id}.pdf`,
    familyKey: `${id}-family`,
    recommendedLane: "core-text",
    variantKind: "original",
    tags: [],
    filenameDerived: {
      matched: true,
      title: `${id} title`,
      authors: `${id} author`,
    },
    metadata: {
      title: `${id} title`,
      author: `${id} author`,
      pages: 10,
      encrypted: false,
    },
    resolvedMetadata: {
      title: `${id} title`,
      author: `${id} author`,
      doi: null,
      journal: null,
    },
    firstPageText: {
      nonEmpty: true,
    },
    onlineEnrichment: {
      status: "skipped",
    },
    ...overrides,
  };
}

describe("PDF Test Corpus Curation Lib", () => {
  it("should build a balanced curated selection from a manifest", () => {
    const manifest = {
      sourceRoot: "/tmp/corpus",
      entries: [
        createEntry("core-a"),
        createEntry("core-b"),
        createEntry("core-c"),
        createEntry("core-d", { metadata: { title: "标题", author: "作者", pages: 9, encrypted: false }, resolvedMetadata: { title: "标题", author: "作者" } }),
        createEntry("meta-online-a", {
          recommendedLane: "metadata-poor",
          metadata: { title: "", author: "", pages: 12, encrypted: false },
          resolvedMetadata: { title: "Online Match A", author: "Author A", doi: "10.1/a", journal: "J" },
          onlineEnrichment: { status: "matched" },
          familyKey: "meta-online-a",
        }),
        createEntry("meta-online-b", {
          recommendedLane: "metadata-poor",
          metadata: { title: "", author: "", pages: 11, encrypted: false },
          resolvedMetadata: { title: "Online Match B", author: "Author B", doi: "10.1/b", journal: "J" },
          onlineEnrichment: { status: "matched" },
          familyKey: "meta-online-b",
        }),
        createEntry("meta-local-a", {
          recommendedLane: "metadata-poor",
          metadata: { title: "", author: "CNKI", pages: 15, encrypted: false },
          resolvedMetadata: { title: "Local A", author: "CNKI", doi: null, journal: null },
          onlineEnrichment: { status: "error" },
          familyKey: "meta-local-a",
        }),
        createEntry("meta-local-b", {
          recommendedLane: "metadata-poor",
          metadata: { title: "", author: "CNKI", pages: 14, encrypted: false },
          resolvedMetadata: { title: "Local B", author: "CNKI", doi: null, journal: null },
          onlineEnrichment: { status: "empty" },
          familyKey: "meta-local-b",
        }),
        createEntry("scan-a", {
          recommendedLane: "scan-ocr",
          tags: ["scan-ocr-candidate"],
          firstPageText: { nonEmpty: false },
          metadata: { title: "", author: "", pages: 200, encrypted: false },
          resolvedMetadata: { title: null, author: null, doi: null, journal: null },
        }),
        createEntry("scan-b", {
          recommendedLane: "scan-ocr",
          tags: ["scan-ocr-candidate"],
          firstPageText: { nonEmpty: false },
          metadata: { title: "", author: "", pages: 6, encrypted: false },
          resolvedMetadata: { title: null, author: null, doi: null, journal: null },
        }),
        createEntry("perm-a", {
          recommendedLane: "permission-edge",
          tags: ["permission-edge"],
          metadata: { title: "Perm A", author: "Author", pages: 50, encrypted: true },
        }),
        createEntry("perm-b", {
          recommendedLane: "permission-edge",
          tags: ["permission-edge", "scan-ocr-candidate"],
          firstPageText: { nonEmpty: false },
          metadata: { title: "", author: "", pages: 350, encrypted: true },
          resolvedMetadata: { title: null, author: null, doi: null, journal: null },
        }),
        createEntry("trans-original", {
          recommendedLane: "metadata-poor",
          familyKey: "trans-rich",
          metadata: { title: "Trans Original", author: "", pages: 10, encrypted: false },
          resolvedMetadata: { title: "Trans Original", author: "", doi: null, journal: null },
        }),
        createEntry("trans-dual", {
          recommendedLane: "translated-variant",
          variantKind: "translated-dual",
          familyKey: "trans-rich",
          metadata: { title: "", author: "", pages: 10, encrypted: false },
          resolvedMetadata: { title: "Trans Rich", author: "TR", doi: "10.1/tr", journal: "JR" },
          onlineEnrichment: { status: "matched" },
        }),
        createEntry("trans-mono", {
          recommendedLane: "translated-variant",
          variantKind: "translated-mono",
          familyKey: "trans-rich",
          metadata: { title: "", author: "", pages: 10, encrypted: false },
          resolvedMetadata: { title: "Trans Rich", author: "", doi: null, journal: null },
        }),
        createEntry("pair-original", {
          recommendedLane: "metadata-poor",
          familyKey: "trans-pair",
          metadata: { title: "Pair Original", author: "", pages: 11, encrypted: false },
          resolvedMetadata: { title: "Pair Original", author: "", doi: null, journal: null },
        }),
        createEntry("pair-dual", {
          recommendedLane: "translated-variant",
          variantKind: "translated-dual",
          familyKey: "trans-pair",
          metadata: { title: "", author: "", pages: 11, encrypted: false },
          resolvedMetadata: { title: "Pair Dual", author: "PD", doi: "10.1/pd", journal: "JP" },
          onlineEnrichment: { status: "matched" },
        }),
        createEntry("trans-only-a", {
          recommendedLane: "translated-variant",
          variantKind: "translated-dual",
          familyKey: "trans-only",
          tags: ["translated-variant", "filename-unstructured"],
          metadata: { title: "", author: "", pages: 8, encrypted: false },
          resolvedMetadata: { title: null, author: null, doi: null, journal: null },
        }),
        createEntry("trans-only-b", {
          recommendedLane: "translated-variant",
          variantKind: "translated-mono",
          familyKey: "trans-only",
          tags: ["translated-variant", "filename-unstructured"],
          metadata: { title: "", author: "", pages: 8, encrypted: false },
          resolvedMetadata: { title: "Trans Only", author: null, doi: null, journal: null },
        }),
      ],
      families: [
        { familyKey: "trans-rich", familyKeyNormalized: "trans-rich", entryIds: ["trans-original", "trans-dual", "trans-mono"], variantKinds: ["original", "translated-dual", "translated-mono"], size: 3 },
        { familyKey: "trans-pair", familyKeyNormalized: "trans-pair", entryIds: ["pair-original", "pair-dual"], variantKinds: ["original", "translated-dual"], size: 2 },
        { familyKey: "trans-only", familyKeyNormalized: "trans-only", entryIds: ["trans-only-a", "trans-only-b"], variantKinds: ["translated-dual", "translated-mono"], size: 2 },
      ],
    };

    const selection = buildBalancedPdfCorpusSelection(manifest, {
      sourceManifestPath: "/tmp/manifest.json",
      now: "2026-04-28T00:00:00.000Z",
    });

    assert.equal(selection.profile, "balanced-v1");
    assert.equal(selection.groups.some((group) => group.id === "translation-bundle-rich"), true);
    assert.equal(selection.groups.some((group) => group.id === "translation-bundle-pair"), true);
    assert.equal(selection.groups.some((group) => group.id === "translation-bundle-unstructured"), true);
    assert.equal(selection.groups.some((group) => group.id === "core-text-smoke"), true);
    assert.equal(selection.groups.some((group) => group.id === "metadata-repair-online"), true);
    assert.equal(selection.groups.some((group) => group.id === "scan-ocr"), true);
    assert.equal(selection.groups.some((group) => group.id === "permission-edge"), true);
    assert.equal(selection.summary.selectedEntryCount > 0, true);

    const markdown = renderPdfCorpusSelectionMarkdown(selection);
    assert.equal(markdown.includes("Translation Bundle Rich Family"), true);
    assert.equal(markdown.includes("Core Text Smoke"), true);
  });

  it("should write json and markdown artifacts for the curated selection", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-test-corpus-curation-"));
    try {
      const selection = {
        profile: "balanced-v1",
        generatedAt: "2026-04-28T00:00:00.000Z",
        sourceManifestPath: "/tmp/manifest.json",
        summary: {
          selectedEntryCount: 1,
          selectedFamilyCount: 1,
          laneCounts: { "core-text": 1 },
          tagCounts: {},
        },
        groups: [
          {
            id: "group-1",
            label: "Group 1",
            reason: "reason",
            entries: [
              {
                id: "entry-1",
                fileName: "entry-1.pdf",
                relativePath: "entry-1.pdf",
                absolutePath: "/tmp/entry-1.pdf",
                familyKey: "family-1",
                recommendedLane: "core-text",
                variantKind: "original",
                pages: 1,
                encrypted: false,
                textExtractable: true,
                tags: [],
                onlineStatus: "skipped",
                resolvedMetadata: {
                  title: "Title",
                  author: "Author",
                  doi: null,
                  journal: null,
                },
              },
            ],
          },
        ],
      };
      const artifacts = await writePdfCorpusSelectionArtifacts(path.join(tempRoot, "selection"), selection);
      assert.equal(fs.existsSync(artifacts.jsonPath), true);
      assert.equal(fs.existsSync(artifacts.markdownPath), true);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

