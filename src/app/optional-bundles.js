function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeBundle(entry = {}) {
  return {
    id: String(entry.id || "").trim() || null,
    enabled: entry.enabled === true,
    lane: String(entry.lane || "").trim() || null,
    implementationStatus: String(entry.implementationStatus || "").trim() || null,
    summary: String(entry.summary || "").trim() || null,
  };
}

export function createOptionalBundleRuntime({ registry = null } = {}) {
  const bundles = Array.isArray(registry?.bundles)
    ? registry.bundles.map((entry) => normalizeBundle(entry)).filter((entry) => entry.id)
    : [];
  const bundleMap = new Map(bundles.map((entry) => [entry.id, entry]));

  function getBundle(bundleID) {
    const id = String(bundleID || "").trim();
    if (!id) {
      return null;
    }
    const matched = bundleMap.get(id) || null;
    return matched ? clone(matched) : null;
  }

  return {
    listBundles() {
      return bundles.map((entry) => clone(entry));
    },
    getBundle,
    isEnabled(bundleID) {
      return Boolean(getBundle(bundleID)?.enabled);
    },
  };
}

export function isOptionalBundleEnabled(bundleRuntime, bundleID) {
  if (bundleRuntime && typeof bundleRuntime.isEnabled === "function") {
    return bundleRuntime.isEnabled(bundleID);
  }

  if (bundleRuntime && typeof bundleRuntime.getBundle === "function") {
    return Boolean(bundleRuntime.getBundle(bundleID)?.enabled);
  }

  if (Array.isArray(bundleRuntime?.bundles)) {
    const matched = bundleRuntime.bundles.find((entry) => String(entry?.id || "").trim() === String(bundleID || "").trim());
    return matched?.enabled === true;
  }

  return false;
}
