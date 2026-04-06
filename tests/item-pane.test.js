import { describe, it, beforeEach, afterEach, assert } from "./test-framework.js";
import { createItemPane } from "../src/features/item-pane.js";

describe("ItemPane", () => {
  let errors;
  let registeredSectionIDs;
  let registeredRowIDs;
  let unregisteredSectionIDs;
  let unregisteredRowIDs;
  let itemPane;

  beforeEach(() => {
    errors = [];
    registeredSectionIDs = [];
    registeredRowIDs = [];
    unregisteredSectionIDs = [];
    unregisteredRowIDs = [];

    itemPane = createItemPane({
      pluginID: "cleanroom-template@example.com",
      logger: {
        debug() {},
        error(message, details) {
          errors.push({ message, details });
        },
      },
      zotero: {
        ItemPaneManager: {
          registerSection(options) {
            const id = `${options.pluginID}:${options.paneID}`;
            registeredSectionIDs.push(id);
            return id;
          },
          unregisterSection(id) {
            unregisteredSectionIDs.push(id);
          },
          registerInfoRow(options) {
            const id = `${options.pluginID}:${options.rowID}`;
            registeredRowIDs.push(id);
            return id;
          },
          unregisterInfoRow(id) {
            unregisteredRowIDs.push(id);
          },
          refreshInfoRow() {},
        },
      },
    });
  });

  afterEach(() => {
    errors = [];
    registeredSectionIDs = [];
    registeredRowIDs = [];
    unregisteredSectionIDs = [];
    unregisteredRowIDs = [];
  });

  it("should require l10n ids for helper factories", () => {
    assert.equal(
      itemPane.createSimpleSection({
        paneID: "demo-section",
        getContent: () => "demo",
      }),
      null,
    );
    assert.equal(
      itemPane.createFieldInfoRow({
        rowID: "demo-field-row",
        field: "title",
      }),
      null,
    );
    assert.equal(
      itemPane.createConditionalInfoRow({
        rowID: "demo-conditional-row",
        getData: () => "demo",
      }),
      null,
    );

    assert.equal(registeredSectionIDs.length, 0);
    assert.equal(registeredRowIDs.length, 0);
    assert.equal(errors.length, 3);
    assert.equal(errors[0].message, "itemPane.createSimpleSection.noL10nID");
    assert.equal(errors[1].message, "itemPane.createFieldInfoRow.noLabelL10nID");
    assert.equal(errors[2].message, "itemPane.createConditionalInfoRow.noLabelL10nID");
  });

  it("should require onRender when registering sections", () => {
    const registeredSectionID = itemPane.registerSection({
      paneID: "demo-section",
      header: { l10nID: "demo-section-header" },
      sidenav: { l10nID: "demo-section-sidenav" },
      onAsyncRender: async () => {},
    });

    assert.equal(registeredSectionID, null);
    assert.equal(registeredSectionIDs.length, 0);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].message, "itemPane.registerSection.noOnRender");
    assert.equal(errors[0].details?.paneID, "demo-section");
  });

  it("should track registered ids returned by Zotero managers", () => {
    const registeredSectionID = itemPane.registerSection({
      paneID: "demo-section",
      header: { l10nID: "demo-section-header" },
      sidenav: { l10nID: "demo-section-sidenav" },
      onRender() {},
    });
    const registeredRowID = itemPane.registerInfoRow({
      rowID: "demo-row",
      label: { l10nID: "demo-row-label" },
      onGetData: () => "demo",
    });

    assert.equal(registeredSectionID, "cleanroom-template@example.com:demo-section");
    assert.equal(registeredRowID, "cleanroom-template@example.com:demo-row");
    assert.ok(itemPane.hasSection("demo-section"));
    assert.ok(itemPane.hasSection(registeredSectionID));
    assert.ok(itemPane.hasInfoRow("demo-row"));
    assert.ok(itemPane.hasInfoRow(registeredRowID));
    assert.equal(
      itemPane.resolveSectionPaneID("demo-section"),
      "cleanroom-template@example.com:demo-section",
    );
    assert.equal(
      itemPane.resolveSectionPaneID(registeredSectionID),
      "cleanroom-template@example.com:demo-section",
    );
    assert.deepEqual(itemPane.getRegistrationSnapshot(), {
      sections: [{
        paneID: "demo-section",
        registeredPaneID: "cleanroom-template@example.com:demo-section",
        headerL10nID: "demo-section-header",
        sidenavL10nID: "demo-section-sidenav",
      }],
      infoRows: [{
        rowID: "demo-row",
        registeredRowID: "cleanroom-template@example.com:demo-row",
        labelL10nID: "demo-row-label",
      }],
    });

    assert.equal(itemPane.unregisterSection(registeredSectionID), true);
    assert.equal(itemPane.unregisterInfoRow(registeredRowID), true);
    assert.deepEqual(unregisteredSectionIDs, [registeredSectionID]);
    assert.deepEqual(unregisteredRowIDs, [registeredRowID]);
  });
});
