export const DEFAULT_SETTINGS_SCHEMA_VERSION = 1;
export const DEFAULT_VERSION_PREF_KEY = "__settingsSchemaVersion";

function normalizeVersion(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.floor(parsed));
}

function buildVersionPref(prefBranch, versionPrefKey) {
  return `${prefBranch}.${versionPrefKey}`;
}

function readStoredVersion({ prefBranch, versionPrefKey, services }) {
  const key = buildVersionPref(prefBranch, versionPrefKey);
  if (!services?.prefs?.prefHasUserValue || !services.prefs.prefHasUserValue(key)) {
    return null;
  }
  if (!services?.prefs?.getIntPref) {
    return null;
  }
  return normalizeVersion(services.prefs.getIntPref(key, 0), 0);
}

function writeStoredVersion({ prefBranch, versionPrefKey, services, version }) {
  const key = buildVersionPref(prefBranch, versionPrefKey);
  services.prefs.setIntPref(key, normalizeVersion(version, 0));
}

function selectNextMigration({ migrations, currentVersion, targetVersion }) {
  const candidates = migrations
    .filter((item) => normalizeVersion(item?.from, -1) === currentVersion)
    .filter((item) => normalizeVersion(item?.to, -1) > currentVersion)
    .filter((item) => normalizeVersion(item?.to, -1) <= targetVersion)
    .sort((left, right) => normalizeVersion(left.to, -1) - normalizeVersion(right.to, -1));

  return candidates[0] || null;
}

export function applySettingsMigrations({
  prefBranch,
  migrations = [],
  targetVersion = DEFAULT_SETTINGS_SCHEMA_VERSION,
  versionPrefKey = DEFAULT_VERSION_PREF_KEY,
  services = globalThis.Services,
  logger = null,
}) {
  const normalizedTarget = normalizeVersion(targetVersion, DEFAULT_SETTINGS_SCHEMA_VERSION);
  const summary = {
    fromVersion: null,
    toVersion: normalizedTarget,
    status: "noop",
    appliedMigrations: [],
    notes: [],
  };

  if (!services?.prefs || !prefBranch) {
    summary.status = "skipped";
    summary.notes.push("missing-services-or-pref-branch");
    return summary;
  }

  const storedVersion = readStoredVersion({
    prefBranch,
    versionPrefKey,
    services,
  });
  summary.fromVersion = storedVersion;

  if (storedVersion === null) {
    writeStoredVersion({
      prefBranch,
      versionPrefKey,
      services,
      version: normalizedTarget,
    });
    summary.status = "initialized";
    return summary;
  }

  if (storedVersion >= normalizedTarget) {
    summary.status = "up-to-date";
    summary.toVersion = storedVersion;
    return summary;
  }

  let currentVersion = storedVersion;
  while (currentVersion < normalizedTarget) {
    const migration = selectNextMigration({
      migrations,
      currentVersion,
      targetVersion: normalizedTarget,
    });

    if (!migration) {
      writeStoredVersion({
        prefBranch,
        versionPrefKey,
        services,
        version: normalizedTarget,
      });
      summary.status = "fast-forwarded";
      summary.notes.push(`missing-migration-${currentVersion}-to-${normalizedTarget}`);
      currentVersion = normalizedTarget;
      break;
    }

    migration.run({
      services,
      prefBranch,
      logger,
    });
    currentVersion = normalizeVersion(migration.to, currentVersion);
    writeStoredVersion({
      prefBranch,
      versionPrefKey,
      services,
      version: currentVersion,
    });
    summary.appliedMigrations.push(String(migration.id || `${migration.from}->${migration.to}`));
  }

  summary.toVersion = currentVersion;
  summary.status = summary.appliedMigrations.length > 0 ? "migrated" : summary.status;
  return summary;
}
