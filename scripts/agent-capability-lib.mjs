import { createCapabilityManifest } from "../src/app/capability-manifest.js";

function uniqueStrings(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean),
  ));
}

function buildScenarioResultMap(report) {
  const cycles = Array.isArray(report?.cycles) ? report.cycles : [];
  const map = new Map();

  cycles.forEach((cycle, cycleIndex) => {
    const results = Array.isArray(cycle?.scenarios?.results) ? cycle.scenarios.results : [];
    results.forEach((result) => {
      const name = String(result?.name || "").trim();
      if (!name) {
        return;
      }
      const current = map.get(name) || {
        name,
        total: 0,
        passed: 0,
        failed: 0,
        cycleIndexes: [],
      };
      current.total += 1;
      if (result?.status === "passed") {
        current.passed += 1;
      } else if (result?.status === "failed") {
        current.failed += 1;
      }
      current.cycleIndexes.push(Number.isFinite(cycle?.index) ? cycle.index : (cycleIndex + 1));
      map.set(name, current);
    });
  });

  return map;
}

export function summarizeCapabilityCoverage(report, options = {}) {
  const manifest = createCapabilityManifest({
    config: options.config,
  });
  const scenarioResultMap = buildScenarioResultMap(report);
  const observed = scenarioResultMap.size > 0;

  const capabilities = manifest.map((capability) => {
    const scenarioNames = uniqueStrings(capability.zoteroScenarios);
    const scenarioEntries = scenarioNames
      .map((name) => scenarioResultMap.get(name))
      .filter(Boolean);
    const observedScenarioCount = scenarioEntries.length;
    const totalRuns = scenarioEntries.reduce((sum, item) => sum + Number(item.total || 0), 0);
    const passedRuns = scenarioEntries.reduce((sum, item) => sum + Number(item.passed || 0), 0);
    const failedRuns = scenarioEntries.reduce((sum, item) => sum + Number(item.failed || 0), 0);
    const allScenarioNamesObserved = scenarioNames.length > 0 && observedScenarioCount === scenarioNames.length;

    let status = "informational";
    if (scenarioNames.length > 0) {
      if (totalRuns === 0) {
        status = "uncovered";
      } else if (failedRuns > 0) {
        status = "failed";
      } else if (!allScenarioNamesObserved) {
        status = "uncovered";
      } else {
        status = "passed";
      }
    }

    return {
      id: capability.id,
      label: capability.label,
      category: capability.category,
      description: capability.description,
      scenarioNames,
      ownedBy: uniqueStrings(capability.ownedBy),
      status,
      covered: scenarioNames.length === 0 ? false : allScenarioNamesObserved,
      observedScenarioCount,
      totalRuns,
      passedRuns,
      failedRuns,
      cycleIndexes: uniqueStrings(scenarioEntries.flatMap((item) => item.cycleIndexes || [])),
    };
  });

  const scenarioBoundCapabilities = capabilities.filter((item) => item.scenarioNames.length > 0);
  const passedCapabilities = scenarioBoundCapabilities.filter((item) => item.status === "passed");
  const failedCapabilities = scenarioBoundCapabilities.filter((item) => item.status === "failed");
  const uncoveredCapabilities = scenarioBoundCapabilities.filter((item) => item.status === "uncovered");
  const reportOnlyCapabilities = capabilities.filter((item) => item.scenarioNames.length === 0);

  return {
    observed,
    total: capabilities.length,
    scenarioBoundTotal: scenarioBoundCapabilities.length,
    reportOnlyTotal: reportOnlyCapabilities.length,
    coveredCount: passedCapabilities.length + failedCapabilities.length,
    passedCount: passedCapabilities.length,
    failedCount: failedCapabilities.length,
    uncoveredCount: uncoveredCapabilities.length,
    passedCapabilityIds: passedCapabilities.map((item) => item.id),
    failedCapabilityIds: failedCapabilities.map((item) => item.id),
    uncoveredCapabilityIds: uncoveredCapabilities.map((item) => item.id),
    capabilities,
  };
}
