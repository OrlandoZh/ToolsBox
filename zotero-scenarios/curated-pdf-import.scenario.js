registerZoteroScenario("curated pdf corpus import smoke", async ({ assert, helpers, plugin }) => {
  const corpusStatus = await helpers.getCuratedPDFCorpusStatus();
  if (!corpusStatus.available) {
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

  const imported = await helpers.importCuratedPDF({
    groupID: "core-text-smoke",
    selectionIndex: 0,
    createParentItem: true,
  });

  await helpers.openReader(imported.attachment.id);

  const summary = await helpers.waitFor(
    () => plugin.api.reader.getReaderSummary(imported.attachment.id),
    {
      timeoutMs: 8000,
      intervalMs: 100,
      message: `Timed out waiting for reader summary for curated pdf item #${imported.attachment.id}`,
    },
  );

  assert.equal(await plugin.api.reader.canOpen(imported.attachment.id), true);
  assert.equal(summary.itemID, imported.attachment.id);
  assert.equal(summary.type, "pdf");
  assert.equal(imported.group.id, "core-text-smoke");
  assert.ok(Boolean(imported.parentItem?.id), "parent item should be created for curated corpus import");

  const parentTitle = imported.parentItem?.getField?.("title") || "";
  const resolvedTitle = imported.entry?.resolvedMetadata?.title || "";
  if (resolvedTitle) {
    assert.equal(parentTitle, resolvedTitle);
  }

  return {
    fixtureStatus: "imported",
    corpusStatus: imported.manifestStatus,
    groupID: imported.group.id,
    entryID: imported.entry.id,
    attachmentID: imported.attachment.id,
    parentItemID: imported.parentItem?.id || null,
    resolvedMetadata: imported.entry.resolvedMetadata || null,
    readerSummary: {
      itemID: summary.itemID,
      type: summary.type,
    },
  };
});
