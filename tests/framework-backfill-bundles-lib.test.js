import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  loadFrameworkBackfillBundleRegistry,
  inspectFrameworkBackfillBundleAdoption,
  renderFrameworkBackfillAuditMarkdown,
  renderFrameworkBackfillBundleMarkdown,
  validateFrameworkBackfillBundleRegistry,
} from "../scripts/framework-backfill-bundles-lib.mjs";

const projectRoot = path.resolve(".");
const PROJECT_FILE_FIXTURES = new Set([
  "config/expansion-wave-contracts.json",
  "config/project-expansion-wave.json",
  "config/validation-surfaces.json",
  "config/project-validation-surfaces.json",
  "config/zotero-host-semantic-index.json",
  "docs/EXPANSION_WAVE_CONTRACTS.md",
  "docs/VALIDATION_SURFACES.md",
  "docs/ZOTERO_HOST_SEMANTIC_INDEX.md",
]);

function writeText(filePath, source = "") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, source, "utf-8");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function renderFixtureAgentRuleLines(rule, variant = "default") {
  const matcher = rule.match || (rule.anyOf ? { anyOf: rule.anyOf } : {});
  const anyOf = Array.isArray(matcher.anyOf) ? matcher.anyOf : [];
  const allOf = Array.isArray(matcher.allOf) ? matcher.allOf : [];
  const lines = [];

  if (anyOf.length > 0) {
    lines.push(variant === "alternate" && anyOf.length > 1 ? anyOf[anyOf.length - 1] : anyOf[0]);
  }
  if (allOf.length > 0) {
    lines.push(...allOf);
  }
  if (lines.length === 0 && typeof rule.label === "string") {
    lines.push(rule.label);
  }
  return lines;
}

function createFixtureProject(registry, mode, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `framework-backfill-${mode}-`));
  const packageScripts = {};
  const agentRules = [];
  const importedTests = new Set();
  const retainGovernance = options.retainGovernance !== false;

  if (mode !== "missing") {
    registry.bundles.forEach((bundle) => {
      bundle.requiredFiles.forEach((relativePath) => {
        const fixturePath = path.join(projectRoot, relativePath);
        if (PROJECT_FILE_FIXTURES.has(relativePath) && fs.existsSync(fixturePath)) {
          writeText(path.join(root, relativePath), fs.readFileSync(fixturePath, "utf-8"));
          return;
        }
        writeText(path.join(root, relativePath), "// fixture\n");
      });
      bundle.requiredPackageScripts.forEach((rule) => {
        if (typeof rule.exact === "string") {
          packageScripts[rule.name] = rule.exact;
        } else {
          const existing = packageScripts[rule.name];
          const parts = new Set([
            ...(existing ? [existing] : []),
            ...rule.includes,
          ]);
          packageScripts[rule.name] = Array.from(parts).join(" && ");
        }
      });
      const agentRuleVariant = mode === "adopted-alternate-agent-rules" ? "alternate" : "default";
      bundle.requiredAgentRules.forEach((entry) => {
        renderFixtureAgentRuleLines(entry, agentRuleVariant).forEach((line) => {
          agentRules.push(`- ${line}`);
        });
      });
      bundle.requiredTests.forEach((testFile) => {
        writeText(path.join(root, "tests", testFile), "// fixture test\n");
        importedTests.add(testFile);
      });
    });
  }

  if (retainGovernance) {
    packageScripts["framework:governance:check"] = "node scripts/framework-governance-check.mjs";
    packageScripts["framework:bundle:audit"] = "node scripts/framework-bundle-audit.mjs";
    packageScripts["docs:sync-backfill-bundles"] = "node scripts/docs-sync-backfill-bundles.mjs";
  }

  if (mode === "partial") {
    delete packageScripts["agent:workspace:guard:strict"];
    const workspaceFile = path.join(root, "scripts", "agent-workspace-guard.mjs");
    if (fs.existsSync(workspaceFile)) {
      fs.rmSync(workspaceFile, { force: true });
    }
  }

  writeText(
    path.join(root, "package.json"),
    `${JSON.stringify({ name: "fixture-project", private: true, scripts: packageScripts }, null, 2)}\n`,
  );
  writeText(path.join(root, "AGENTS.md"), `${agentRules.join("\n")}\n`);
  writeText(
    path.join(root, "tests", "run-all.js"),
    `${Array.from(importedTests).sort().map((entry) => `import './${entry}';`).join("\n")}\n`,
  );

  if (mode !== "missing-local-registry" && mode !== "missing") {
    const localRegistry = clone(registry);
    if (mode === "drifted-mirror") {
      localRegistry.bundles[0].summary = `${localRegistry.bundles[0].summary} drifted`;
    }
    if (mode === "extra-local-only") {
      localRegistry.bundles.push({
        id: "local-extra-only-v1",
        version: 1,
        lifecycle: "active",
        summary: "local extra bundle",
        requiredFiles: ["scripts/local-extra.mjs"],
        requiredPackageScripts: [
          {
            name: "local:extra",
            exact: "node scripts/local-extra.mjs",
          },
        ],
        requiredAgentRules: [
          {
            label: "local extra rule",
            match: {
              anyOf: ["local extra rule"],
            },
          },
        ],
        requiredTests: ["local-extra.test.js"],
        nonGoals: ["local only"],
      });
    }
    writeText(
      path.join(root, "config", "framework-backfill-bundles.json"),
      `${JSON.stringify(localRegistry, null, 2)}\n`,
    );
  }

  if (mode === "partial-expansion-wave") {
    writeText(
      path.join(root, "config", "project-expansion-wave.json"),
      `${JSON.stringify({
        schemaVersion: 1,
        status: "active",
        currentContractId: "generic-expansion-wave-v1",
        currentWaveName: "Wave Broken",
        summary: "Broken expansion wave fixture.",
        inScopeModules: ["src/features/broken-surface.js"],
        outOfScopeModules: [],
        moduleArchetypes: [],
        acceptanceTrack: "",
        explicitVisualUpgradeModules: [],
      }, null, 2)}\n`,
    );
  }

  return root;
}

describe("Framework Backfill Bundles Lib", () => {
  it("should load a valid schema v2 registry with required fields", () => {
    const { registry } = loadFrameworkBackfillBundleRegistry(projectRoot);

    assert.equal(registry.schemaVersion, 2);
    assert.equal(Array.isArray(registry.bundles), true);
    assert.ok(registry.bundles.every((bundle) => typeof bundle.lifecycle === "string"));
    assert.ok(registry.bundles.some((bundle) => bundle.id === "workspace-init-guard-v1"));
    assert.ok(registry.bundles.some((bundle) => bundle.id === "validation-decision-v1"));
    assert.ok(registry.bundles.some((bundle) => bundle.id === "validation-decision-v2"));
    assert.ok(registry.bundles.some((bundle) => bundle.id === "expansion-wave-scaffold-v1"));
    assert.ok(registry.bundles.some((bundle) => bundle.id === "host-interface-contract-v1"));
    assert.ok(registry.bundles.some((bundle) => bundle.id === "host-semantic-index-v1"));
    assert.ok(registry.bundles.some((bundle) => bundle.id === "surface-verification-v1"));
  });

  it("should accept legacy agent rule shapes while validating old mirrors", () => {
    assert.doesNotThrow(() => validateFrameworkBackfillBundleRegistry({
      schemaVersion: 1,
      governanceGoal: "x",
      bundleCreationCriteria: ["a"],
      bundles: [
        {
          id: "legacy",
          version: 1,
          summary: "legacy bundle",
          requiredFiles: ["scripts/legacy.mjs"],
          requiredPackageScripts: [
            {
              name: "legacy",
              exact: "node scripts/legacy.mjs",
            },
          ],
          requiredAgentRules: [
            "legacy exact rule",
            {
              label: "legacy anyOf rule",
              anyOf: ["legacy anyOf rule"],
            },
          ],
          requiredTests: ["legacy.test.js"],
          nonGoals: ["legacy"],
        },
      ],
    }));
  });

  it("should reject invalid registry shape", () => {
    assert.throws(() => validateFrameworkBackfillBundleRegistry({
      schemaVersion: 2,
      governanceGoal: "x",
      bundleCreationCriteria: ["a"],
      bundles: [
        {
          id: "broken",
          version: 1,
          summary: "broken",
          requiredFiles: [],
          requiredPackageScripts: [
            {
              name: "broken",
              exact: "echo broken",
            },
          ],
          requiredAgentRules: [
            {
              label: "broken matcher",
              match: {},
            },
          ],
          requiredTests: [],
          nonGoals: [],
        },
      ],
    }));
  });

  it("should keep generated bundle markdown synchronized with the checked-in doc", () => {
    const { registry } = loadFrameworkBackfillBundleRegistry(projectRoot);
    const actual = fs.readFileSync(path.join(projectRoot, "docs", "FRAMEWORK_BACKFILL_BUNDLES.md"), "utf-8");
    const expected = renderFrameworkBackfillBundleMarkdown(registry);

    assert.equal(actual, expected);
  });

  it("should classify adopted, partial, and missing adoption states", () => {
    const { registry } = loadFrameworkBackfillBundleRegistry(projectRoot);
    const adoptedRoot = createFixtureProject(registry, "adopted");
    const partialRoot = createFixtureProject(registry, "partial");
    const missingRoot = createFixtureProject(registry, "missing");

    try {
      const adopted = inspectFrameworkBackfillBundleAdoption(adoptedRoot, registry);
      const partial = inspectFrameworkBackfillBundleAdoption(partialRoot, registry);
      const missing = inspectFrameworkBackfillBundleAdoption(missingRoot, registry);
      const expansionWaveBundle = adopted.bundles.find((bundle) => bundle.id === "expansion-wave-scaffold-v1");

      assert.equal(adopted.bundles.every((bundle) => bundle.adoptionStatus === "adopted"), true);
      assert.equal(adopted.mirrorStatus, "current");
      assert.ok(expansionWaveBundle);
      assert.equal(expansionWaveBundle.expansionWaveDetails.projectWaveStatus, "active");
      assert.equal(partial.bundles.some((bundle) => bundle.adoptionStatus === "partial"), true);
      assert.equal(missing.bundles.every((bundle) => bundle.adoptionStatus === "missing"), true);
      assert.equal(missing.mirrorStatus, "missing-local-registry");
    } finally {
      fs.rmSync(adoptedRoot, { recursive: true, force: true });
      fs.rmSync(partialRoot, { recursive: true, force: true });
      fs.rmSync(missingRoot, { recursive: true, force: true });
    }
  });

  it("should accept semantically equivalent AGENTS wording and record matched variants", () => {
    const { registry } = loadFrameworkBackfillBundleRegistry(projectRoot);
    const alternateRoot = createFixtureProject(registry, "adopted-alternate-agent-rules");

    try {
      const report = inspectFrameworkBackfillBundleAdoption(alternateRoot, registry);
      const hostInterfaceBundle = report.bundles.find((bundle) => bundle.id === "host-interface-contract-v1");

      assert.ok(hostInterfaceBundle);
      assert.equal(hostInterfaceBundle.adoptionStatus, "adopted");
      assert.equal(hostInterfaceBundle.mirrorStatus, "current");
      assert.ok(hostInterfaceBundle.matchedAgentRuleVariant.some((entry) => entry.anyOf));
    } finally {
      fs.rmSync(alternateRoot, { recursive: true, force: true });
    }
  });

  it("should flag mirror drift without downgrading adoption when local registry content diverges", () => {
    const { registry } = loadFrameworkBackfillBundleRegistry(projectRoot);
    const driftedRoot = createFixtureProject(registry, "drifted-mirror");

    try {
      const report = inspectFrameworkBackfillBundleAdoption(driftedRoot, registry);

      assert.equal(report.bundles.every((bundle) => bundle.adoptionStatus === "adopted"), true);
      assert.equal(report.mirrorStatus, "drifted");
      assert.equal(report.bundles.some((bundle) => bundle.mirrorStatus === "drifted"), true);
      assert.ok(report.bundles[0].mirrorComparison.reasons.some((reason) => reason.includes("summary drift")));
    } finally {
      fs.rmSync(driftedRoot, { recursive: true, force: true });
    }
  });

  it("should report missing local registry mirror when governance scripts are retained", () => {
    const { registry } = loadFrameworkBackfillBundleRegistry(projectRoot);
    const missingMirrorRoot = createFixtureProject(registry, "missing-local-registry");

    try {
      const report = inspectFrameworkBackfillBundleAdoption(missingMirrorRoot, registry);

      assert.equal(report.bundles.every((bundle) => bundle.adoptionStatus === "adopted"), true);
      assert.equal(report.mirrorStatus, "missing-local-registry");
      assert.equal(report.bundles.every((bundle) => bundle.mirrorStatus === "missing-local-registry"), true);
    } finally {
      fs.rmSync(missingMirrorRoot, { recursive: true, force: true });
    }
  });

  it("should report extra local bundles separately from adopted template bundles", () => {
    const { registry } = loadFrameworkBackfillBundleRegistry(projectRoot);
    const extraLocalRoot = createFixtureProject(registry, "extra-local-only");

    try {
      const report = inspectFrameworkBackfillBundleAdoption(extraLocalRoot, registry);

      assert.equal(report.bundles.every((bundle) => bundle.adoptionStatus === "adopted"), true);
      assert.equal(report.bundles.every((bundle) => bundle.mirrorStatus === "current"), true);
      assert.equal(report.mirrorStatus, "extra-local-only");
      assert.equal(report.localRegistry.extraLocalBundles.length, 1);
    } finally {
      fs.rmSync(extraLocalRoot, { recursive: true, force: true });
    }
  });

  it("should downgrade expansion wave scaffold adoption when the project mirror is semantically incomplete", () => {
    const { registry } = loadFrameworkBackfillBundleRegistry(projectRoot);
    const partialWaveRoot = createFixtureProject(registry, "partial-expansion-wave");

    try {
      const report = inspectFrameworkBackfillBundleAdoption(partialWaveRoot, registry);
      const expansionWaveBundle = report.bundles.find((bundle) => bundle.id === "expansion-wave-scaffold-v1");

      assert.ok(expansionWaveBundle);
      assert.equal(expansionWaveBundle.adoptionStatus, "partial");
      assert.equal(expansionWaveBundle.expansionWaveDetails.status, "failed");
      assert.equal(expansionWaveBundle.expansionWaveDetails.projectWaveStatus, null);
      assert.ok(expansionWaveBundle.missingChecks.some((entry) => entry.type === "expansionWave:projectWaveMirror"));
    } finally {
      fs.rmSync(partialWaveRoot, { recursive: true, force: true });
    }
  });

  it("should render expansion wave overview in audit markdown for adopted projects", () => {
    const { registry } = loadFrameworkBackfillBundleRegistry(projectRoot);
    const adoptedRoot = createFixtureProject(registry, "adopted");

    try {
      const report = inspectFrameworkBackfillBundleAdoption(adoptedRoot, registry);
      const markdown = renderFrameworkBackfillAuditMarkdown(report);

      assert.ok(markdown.includes("## Expansion Wave Overview"));
      assert.ok(markdown.includes("Project Wave Status: `active`"));
      assert.ok(markdown.includes("| Bundle | Adoption | Mirror | Wave | Checks |"));
      assert.ok(markdown.includes("projectWaveStatus=`active`"));
    } finally {
      fs.rmSync(adoptedRoot, { recursive: true, force: true });
    }
  });
});
