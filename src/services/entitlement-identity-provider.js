function normalizeString(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function createResult(patch = {}) {
  return {
    ok: patch.ok === true,
    kind: normalizeString(patch.kind) || "zotero-user-id",
    value: normalizeString(patch.value),
    failureKind: normalizeString(patch.failureKind),
  };
}

export function createEntitlementIdentityProvider({
  kind = "zotero-user-id",
  zotero = null,
  resolver = null,
} = {}) {
  const identityKind = normalizeString(kind) || "zotero-user-id";

  async function resolve() {
    if (typeof resolver === "function") {
      const result = await resolver({ kind: identityKind, zotero });
      return createResult({
        kind: result?.kind || identityKind,
        ok: result?.ok === true,
        value: result?.value,
        failureKind: result?.failureKind,
      });
    }

    if (identityKind !== "zotero-user-id") {
      return createResult({
        kind: identityKind,
        failureKind: "unsupported-identity-kind",
      });
    }

    const userID = Number(zotero?.Users?.getCurrentUserID?.());
    if (!Number.isFinite(userID) || userID <= 0) {
      return createResult({
        kind: identityKind,
        failureKind: "identity-unavailable",
      });
    }

    return createResult({
      ok: true,
      kind: identityKind,
      value: String(userID),
      failureKind: null,
    });
  }

  return {
    kind: identityKind,
    resolve,
  };
}
