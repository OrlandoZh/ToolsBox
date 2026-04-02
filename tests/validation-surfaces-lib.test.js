import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  inspectSurfaceVerificationScaffold,
  loadProjectValidationSurfacesMirror,
  loadValidationSurfacesRegistry,
} from "../scripts/validation-surfaces-lib.mjs";

const projectRoot = path.resolve(".");

describe("Validation Surfaces Lib", () => {
  it("should load the template validation surface registry with Zotero-aligned host-visible terms", () => {
    const { registry } = loadValidationSurfacesRegistry(projectRoot);

    assert.equal(registry.schemaVersion, 1);
    assert.ok(registry.surfaces.some((entry) => entry.id === "preference-pane"));
    assert.ok(registry.surfaces.some((entry) => entry.id === "context-pane"));
    assert.ok(registry.surfaces.some((entry) => entry.id === "annotation-context-menu"));
    assert.ok(registry.surfaces.some((entry) => entry.id === "render-toolbar"));
    assert.ok(registry.surfaces.some((entry) => entry.id === "menu-item"));
    assert.ok(registry.surfaces.some((entry) => entry.id === "item-pane-sidenav"));
    assert.ok(registry.surfaces.some((entry) => entry.id === "reader-sidebar-view"));
    assert.deepEqual(registry.surfaces.find((entry) => entry.id === "preference-pane")?.hostSemanticDomains, ["preference-panes"]);
    assert.deepEqual(registry.surfaces.find((entry) => entry.id === "render-toolbar")?.hostSemanticDomains, ["reader-events"]);
  });

  it("should load the current project mirror in active state", () => {
    const { mirror, missing } = loadProjectValidationSurfacesMirror(projectRoot);

    assert.equal(missing, false);
    assert.equal(mirror.status, "active");
    assert.equal(Array.isArray(mirror.surfaces), true);
    assert.ok(mirror.surfaces.length >= 6);
    assert.ok(mirror.surfaces.some((entry) => entry.contractSurfaceId === "preference-pane"));
    assert.ok(mirror.surfaces.some((entry) => entry.contractSurfaceId === "reader-sidebar-view"));
  });

  it("should inspect the current project surface verification scaffold as passed", () => {
    const inspection = inspectSurfaceVerificationScaffold(projectRoot);

    assert.equal(inspection.status, "passed");
    assert.equal(inspection.projectMirror.status, "active");
    assert.equal(inspection.checks[0].ok, true);
  });
});
