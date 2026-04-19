import { CAPABILITY_IDS } from "./capability-ids.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildToken(parts) {
  return parts.join("");
}

const OVERLAY_FIELD_KEYS = Object.freeze([
  "label",
  "category",
  "description",
  buildToken(["entry", "points"]),
  buildToken(["owned", "By"]),
  buildToken(["success", "Signals"]),
]);

const HOST_BINDING_REQUIREMENTS = Object.freeze([
  "profileHash",
  "dbAvailable",
  "noncePresent",
]);

const PROTECTED_CAPABILITY_CATEGORY = buildToken(["protected"]);

function buildProtectedCapabilityLabel(index) {
  return buildToken([
    "C",
    "-",
    String(Math.max(1, Number(index) + 1)).padStart(2, "0"),
  ]);
}

function buildProtectedCapabilityManifest() {
  const redactedDescription = "受保护导出不附带该能力的详细说明。";
  const capabilityOrder = [
    CAPABILITY_IDS.baselineRegistration,
    CAPABILITY_IDS.itemPresentation,
    CAPABILITY_IDS.notifierSync,
    CAPABILITY_IDS.readerSummary,
    CAPABILITY_IDS.readerAnnotationRoundtrip,
    CAPABILITY_IDS.readerUIState,
    CAPABILITY_IDS.readerEventHooks,
    CAPABILITY_IDS.commandNonblocking,
    CAPABILITY_IDS.hostActions,
    CAPABILITY_IDS.settingsGovernance,
    CAPABILITY_IDS.multiWindowMount,
    CAPABILITY_IDS.runtimeBridgeReport,
  ];

  return capabilityOrder.map((id, index) => ({
    id,
    label: buildProtectedCapabilityLabel(index),
    category: PROTECTED_CAPABILITY_CATEGORY,
    description: redactedDescription,
  }));
}

function normalizeStringArray(input) {
  return (Array.isArray(input) ? input : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function normalizeOverlayItem(item) {
  const id = String(item?.id || "").trim();
  if (!id) {
    return null;
  }

  const normalized = { id };
  if (typeof item?.label === "string" && item.label.trim()) {
    normalized.label = item.label.trim();
  }
  if (typeof item?.category === "string" && item.category.trim()) {
    normalized.category = item.category.trim();
  }
  if (typeof item?.description === "string" && item.description.trim()) {
    normalized.description = item.description.trim();
  }

  for (const key of OVERLAY_FIELD_KEYS.slice(1)) {
    const values = normalizeStringArray(item?.[key]);
    if (values.length > 0) {
      normalized[key] = values;
    }
  }

  return Object.keys(normalized).length > 1 ? normalized : null;
}

function normalizeDescriptorOverlay(overlay) {
  return (Array.isArray(overlay) ? overlay : [])
    .map((item) => normalizeOverlayItem(item))
    .filter(Boolean);
}

function getHostBinding(protectionSummary = null) {
  return protectionSummary?.hostBinding && typeof protectionSummary.hostBinding === "object"
    ? protectionSummary.hostBinding
    : null;
}

function resolveOverlayActivation(protectionSummary = null) {
  const hostBinding = getHostBinding(protectionSummary);
  const missing = [];

  if (!(typeof hostBinding?.profileHash === "string" && hostBinding.profileHash.trim())) {
    missing.push("profileHash");
  }
  if (!hostBinding?.dbAvailable) {
    missing.push("dbAvailable");
  }
  if (!hostBinding?.noncePresent) {
    missing.push("noncePresent");
  }

  return {
    requirements: HOST_BINDING_REQUIREMENTS.slice(),
    missing,
    satisfied: missing.length === 0,
  };
}

function mergeDescriptorOverlay(baselineManifest, overlayItems) {
  const overlayById = new Map(
    normalizeDescriptorOverlay(overlayItems).map((item) => [item.id, item]),
  );

  return baselineManifest.map((entry) => {
    const overlay = overlayById.get(entry.id);
    if (!overlay) {
      return clone(entry);
    }

    const merged = clone(entry);
    for (const key of OVERLAY_FIELD_KEYS) {
      if (Object.prototype.hasOwnProperty.call(overlay, key)) {
        merged[key] = clone(overlay[key]);
      }
    }
    return merged;
  });
}

export function getCapabilityManifestView({ descriptorOverlay = null, protectionSummary = null } = {}) {
  const activation = resolveOverlayActivation(protectionSummary);
  const normalizedOverlay = normalizeDescriptorOverlay(descriptorOverlay);
  const overlayAvailable = normalizedOverlay.length > 0;
  const overlayApplied = overlayAvailable && activation.satisfied;

  return {
    manifestVariant: "protected",
    protectedView: true,
    detailLevel: overlayApplied ? "full" : "limited",
    limitedMode: !overlayApplied,
    overlayAvailable,
    overlayApplied,
    activationSatisfied: activation.satisfied,
    activationMissing: activation.missing,
    activationRequirements: activation.requirements,
  };
}

export function createCapabilityManifest({ descriptorOverlay = null, protectionSummary = null } = {}) {
  const baselineManifest = buildProtectedCapabilityManifest().map((item) => clone(item));
  const view = getCapabilityManifestView({ descriptorOverlay, protectionSummary });
  if (!view.overlayApplied) {
    return baselineManifest;
  }

  return mergeDescriptorOverlay(baselineManifest, descriptorOverlay);
}

export function listCapabilityIds(manifest = []) {
  return (Array.isArray(manifest) ? manifest : []).map((item) => item.id);
}

export function findCapabilityById(manifest = [], capabilityId) {
  const id = String(capabilityId || "").trim();
  if (!id) {
    return null;
  }
  const match = (Array.isArray(manifest) ? manifest : []).find((item) => item.id === id);
  return match ? clone(match) : null;
}
