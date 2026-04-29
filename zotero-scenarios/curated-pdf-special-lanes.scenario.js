function assertCuratedCorpusAvailableOrReturn(assert, corpusStatus) {
  if (corpusStatus.available) {
    return null;
  }

  const isUnavailable = [
    "missing-manifest",
    "manifest-path-unresolved",
  ].includes(String(corpusStatus.errorKind || ""));

  if (!isUnavailable) {
    assert.equal(
      corpusStatus.available,
      true,
      corpusStatus.errorMessage || "Curated PDF corpus manifest is invalid",
    );
  }

  return {
    fixtureStatus: "unavailable",
    corpusStatus,
  };
}

registerZoteroScenario("curated pdf scan ocr smoke", async ({ assert, helpers, plugin }) => {
  const corpusStatus = await helpers.getCuratedPDFCorpusStatus();
  const unavailable = assertCuratedCorpusAvailableOrReturn(assert, corpusStatus);
  if (unavailable) {
    return unavailable;
  }

  const imported = await helpers.importCuratedPDF({
    groupID: "scan-ocr",
    selectionIndex: 1,
    createParentItem: true,
  });

  await helpers.openReader(imported.attachment.id);

  const summary = await helpers.waitFor(
    () => plugin.api.reader.getReaderSummary(imported.attachment.id),
    {
      timeoutMs: 8000,
      intervalMs: 100,
      message: `Timed out waiting for reader summary for scan-ocr item #${imported.attachment.id}`,
    },
  );

  assert.equal(imported.group.id, "scan-ocr");
  assert.equal(imported.entry.recommendedLane, "scan-ocr");
  assert.equal(imported.entry.textExtractable, false);
  assert.equal(imported.entry.encrypted, false);
  assert.equal(await plugin.api.reader.canOpen(imported.attachment.id), true);
  assert.equal(summary.itemID, imported.attachment.id);
  assert.equal(summary.type, "pdf");
  assert.ok(Boolean(imported.parentItem?.id), "parent item should be created for scan-ocr import");
  assert.equal(
    imported.parentItem?.getField?.("title") || "",
    imported.entry.fileName,
  );

  return {
    fixtureStatus: "imported",
    corpusStatus: imported.manifestStatus,
    groupID: imported.group.id,
    entryID: imported.entry.id,
    attachmentID: imported.attachment.id,
    parentItemID: imported.parentItem?.id || null,
    entryFlags: {
      encrypted: imported.entry.encrypted,
      textExtractable: imported.entry.textExtractable,
      pages: imported.entry.pages,
    },
    readerSummary: {
      itemID: summary.itemID,
      type: summary.type,
      annotationCount: summary.annotationCount,
    },
  };
});

registerZoteroScenario("curated pdf permission edge smoke", async ({ assert, helpers, plugin }) => {
  const corpusStatus = await helpers.getCuratedPDFCorpusStatus();
  const unavailable = assertCuratedCorpusAvailableOrReturn(assert, corpusStatus);
  if (unavailable) {
    return unavailable;
  }

  const imported = await helpers.importCuratedPDF({
    groupID: "permission-edge",
    selectionIndex: 1,
    createParentItem: true,
  });

  await helpers.openReader(imported.attachment.id);

  const summary = await helpers.waitFor(
    () => plugin.api.reader.getReaderSummary(imported.attachment.id),
    {
      timeoutMs: 8000,
      intervalMs: 100,
      message: `Timed out waiting for reader summary for permission-edge item #${imported.attachment.id}`,
    },
  );

  assert.equal(imported.group.id, "permission-edge");
  assert.equal(imported.entry.recommendedLane, "permission-edge");
  assert.equal(imported.entry.encrypted, true);
  assert.equal(await plugin.api.reader.canOpen(imported.attachment.id), true);
  assert.equal(summary.itemID, imported.attachment.id);
  assert.equal(summary.type, "pdf");
  assert.ok(Boolean(imported.parentItem?.id), "parent item should be created for permission-edge import");

  const resolvedTitle = imported.entry?.resolvedMetadata?.title || "";
  if (resolvedTitle) {
    assert.equal(imported.parentItem?.getField?.("title") || "", resolvedTitle);
  }

  return {
    fixtureStatus: "imported",
    corpusStatus: imported.manifestStatus,
    groupID: imported.group.id,
    entryID: imported.entry.id,
    attachmentID: imported.attachment.id,
    parentItemID: imported.parentItem?.id || null,
    entryFlags: {
      encrypted: imported.entry.encrypted,
      textExtractable: imported.entry.textExtractable,
      pages: imported.entry.pages,
    },
    resolvedMetadata: imported.entry.resolvedMetadata || null,
    readerSummary: {
      itemID: summary.itemID,
      type: summary.type,
      annotationCount: summary.annotationCount,
    },
  };
});
