import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  inspectExpansionWaveScaffold,
  loadExpansionWaveContractsRegistry,
  renderExpansionWaveContractMarkdown,
  normalizeExpansionWaveContractsRegistry,
} from "../scripts/expansion-wave-contracts-lib.mjs";

const projectRoot = path.resolve(".");

function writeJSON(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function writeText(filePath, source) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, source, "utf-8");
}

function makeActiveMirror() {
  return {
    schemaVersion: 1,
    status: "active",
    currentContractId: "generic-expansion-wave-v1",
    currentWaveName: "Wave 2",
    summary: "Start the next host + visible module batch without inheriting old strict visual defaults.",
    inScopeModules: [
      "src/services/new-runtime-capability.js",
      "src/features/new-visible-surface.js",
    ],
    outOfScopeModules: [
      "src/features/future-surface.js",
    ],
    moduleArchetypes: [
      {
        module: "src/services/new-runtime-capability.js",
        archetype: "runtime-capability",
      },
      {
        module: "src/features/new-visible-surface.js",
        archetype: "visible-surface",
      },
    ],
    acceptanceTrack: "functional-first -> visible-surface visual acceptance",
    explicitVisualUpgradeModules: [
      "src/features/new-visible-surface.js",
    ],
  };
}

function createFixtureProject(registry, mode) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `expansion-wave-${mode}-`));
  writeJSON(path.join(root, "config", "expansion-wave-contracts.json"), registry);
  writeText(
    path.join(root, "docs", "EXPANSION_WAVE_CONTRACTS.md"),
    renderExpansionWaveContractMarkdown(registry),
  );

  const mirror = mode === "active"
    ? makeActiveMirror()
    : mode === "failed"
      ? {
        ...makeActiveMirror(),
        moduleArchetypes: [
          {
            module: "src/services/new-runtime-capability.js",
            archetype: "runtime-capability",
          },
        ],
      }
      : {
        schemaVersion: 1,
        status: "not-entered",
        currentContractId: "generic-expansion-wave-v1",
        currentWaveName: "",
        summary: "No expansion wave is active yet. Before a downstream project starts its next module expansion batch, replace this placeholder with the active wave declaration.",
        inScopeModules: [],
        outOfScopeModules: [],
        moduleArchetypes: [],
        acceptanceTrack: "",
        explicitVisualUpgradeModules: [],
      };

  writeJSON(path.join(root, "config", "project-expansion-wave.json"), mirror);
  return root;
}

describe("Expansion Wave Contracts Lib", () => {
  it("should load a valid registry with expected archetypes", () => {
    const { registry } = loadExpansionWaveContractsRegistry(projectRoot);

    assert.equal(registry.schemaVersion, 1);
    assert.ok(registry.contracts.some((contract) => contract.id === "generic-expansion-wave-v1"));
    assert.ok(registry.contracts[0].moduleArchetypes.some((entry) => entry.id === "runtime-capability"));
    assert.ok(registry.contracts[0].moduleArchetypes.some((entry) => entry.id === "workspace-integration"));
  });

  it("should reject invalid registry shape", () => {
    assert.throws(() => normalizeExpansionWaveContractsRegistry({
      schemaVersion: 1,
      summary: "broken",
      contracts: [
        {
          id: "broken",
          version: 1,
          summary: "broken",
          moduleArchetypes: [],
          defaultValidationProfile: "archetype-driven",
          requiredPlanningArtifacts: [],
          requiredGateSignals: [],
          nonGoals: [],
        },
      ],
    }));
  });

  it("should keep generated expansion wave markdown synchronized with the checked-in doc", () => {
    const { registry } = loadExpansionWaveContractsRegistry(projectRoot);
    const actual = fs.readFileSync(path.join(projectRoot, "docs", "EXPANSION_WAVE_CONTRACTS.md"), "utf-8");
    const expected = renderExpansionWaveContractMarkdown(registry);

    assert.equal(actual, expected);
  });

  it("should classify not-entered, active, and broken mirrors correctly", () => {
    const { registry } = loadExpansionWaveContractsRegistry(projectRoot);
    const notEnteredRoot = createFixtureProject(registry, "not-entered");
    const activeRoot = createFixtureProject(registry, "active");
    const failedRoot = createFixtureProject(registry, "failed");

    try {
      const notEntered = inspectExpansionWaveScaffold(notEnteredRoot);
      const active = inspectExpansionWaveScaffold(activeRoot);
      const failed = inspectExpansionWaveScaffold(failedRoot);

      assert.equal(notEntered.status, "passed");
      assert.equal(notEntered.projectMirror.status, "not-entered");
      assert.equal(active.status, "passed");
      assert.equal(active.projectMirror.status, "active");
      assert.equal(failed.status, "failed");
      assert.ok(failed.checks.some((entry) => entry.type === "projectWaveMirror" && String(entry.actual).includes("Missing moduleArchetypes entry")));
    } finally {
      fs.rmSync(notEnteredRoot, { recursive: true, force: true });
      fs.rmSync(activeRoot, { recursive: true, force: true });
      fs.rmSync(failedRoot, { recursive: true, force: true });
    }
  });
});
