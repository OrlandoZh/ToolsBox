registerZoteroScenario("reader annotation roundtrip", async ({ assert, helpers, plugin }) => {
  const parentItem = await helpers.createItem({
    itemType: "report",
    fields: {
      title: "Reader Annotation Roundtrip Parent",
    },
  });

  const attachment = await helpers.createPDF({
    parentItemID: parentItem.id,
    title: "Reader Annotation Roundtrip PDF",
    text: "Reader annotation roundtrip validation",
  });

  await helpers.openReader(attachment.id);
  assert.equal(plugin.api.reader.isAnnotationsAvailable(), true);

  const created = await plugin.api.reader.createAnnotation(attachment.id, {
    type: "note",
    comment: "初始中文批注",
    pageIndex: 0,
    tags: ["agent", "reader-roundtrip"],
  });

  assert.ok(created && typeof created.id === "number", "Expected createAnnotation() to return a saved annotation");

  const createdSnapshot = await helpers.waitFor(
    () => {
      const snapshot = plugin.api.agent.inspectReader(attachment.id);
      const annotation = snapshot?.annotationDetails?.find((item) => item.id === created.id);
      return annotation ? { snapshot, annotation } : null;
    },
    {
      timeoutMs: 8000,
      intervalMs: 100,
      message: `Timed out waiting for annotation #${created?.id} to appear in reader snapshot`,
    },
  );

  assert.equal(createdSnapshot.snapshot.itemID, attachment.id);
  assert.equal(createdSnapshot.annotation.comment, "初始中文批注");

  const updated = await plugin.api.reader.updateAnnotation(created.id, {
    comment: "更新后的中文批注",
    color: "#00aa88",
  });
  assert.equal(updated, true);

  const updatedSnapshot = await helpers.waitFor(
    () => {
      const snapshot = plugin.api.agent.inspectReader(attachment.id);
      const annotation = snapshot?.annotationDetails?.find((item) => item.id === created.id);
      return annotation?.comment === "更新后的中文批注" && annotation?.color === "#00aa88"
        ? { snapshot, annotation }
        : null;
    },
    {
      timeoutMs: 8000,
      intervalMs: 100,
      message: `Timed out waiting for annotation #${created.id} update to appear in reader snapshot`,
    },
  );

  const deleted = await plugin.api.reader.deleteAnnotation(created.id);
  assert.equal(deleted, true);

  const deletedSnapshot = await helpers.waitFor(
    () => {
      const snapshot = plugin.api.agent.inspectReader(attachment.id);
      const exists = snapshot?.annotationDetails?.some((item) => item.id === created.id);
      return exists === false ? snapshot : null;
    },
    {
      timeoutMs: 8000,
      intervalMs: 100,
      message: `Timed out waiting for annotation #${created.id} to disappear from reader snapshot`,
    },
  );

  return {
    attachmentID: attachment.id,
    annotationID: created.id,
    createdComment: createdSnapshot.annotation.comment,
    updatedComment: updatedSnapshot.annotation.comment,
    deletedConfirmed: deletedSnapshot.annotationDetails.every((item) => item.id !== created.id),
    finalAnnotationDetailCount: deletedSnapshot.annotationDetailCount,
  };
});
