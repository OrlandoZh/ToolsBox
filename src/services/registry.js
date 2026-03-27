function toErrorMessage(error) {
  if (!error) {
    return "unknown";
  }
  if (typeof error === "string") {
    return error;
  }
  return String(error.message || error);
}

function normalizeHealth(input) {
  if (typeof input === "boolean") {
    return {
      ok: input,
      status: input ? "healthy" : "unhealthy",
      details: null,
      checkedAt: new Date().toISOString(),
    };
  }
  if (!input || typeof input !== "object") {
    return {
      ok: true,
      status: "unknown",
      details: null,
      checkedAt: new Date().toISOString(),
    };
  }
  const ok = input.ok !== false;
  return {
    ok,
    status: String(input.status || (ok ? "healthy" : "unhealthy")),
    details: input.details || input.message || null,
    checkedAt: input.checkedAt || new Date().toISOString(),
  };
}

function createServiceRecord(definition) {
  const id = String(definition.id || "").trim();
  if (!id) {
    throw new Error("service id is required");
  }
  return {
    id,
    label: String(definition.label || id),
    definition,
    enabled: true,
    running: false,
    status: "registered",
    startCount: 0,
    lastStartedAt: null,
    lastStoppedAt: null,
    lastError: null,
    health: normalizeHealth({
      ok: true,
      status: "unknown",
    }),
  };
}

export function createServiceRegistry({ logger } = {}) {
  const records = [];
  const recordMap = new Map();

  function register(definition) {
    const record = createServiceRecord(definition);
    if (recordMap.has(record.id)) {
      throw new Error(`duplicate service id: ${record.id}`);
    }
    records.push(record);
    recordMap.set(record.id, record);
    return record.id;
  }

  async function startOne(record, context) {
    const enabledResult = typeof record.definition.enabledWhen === "function"
      ? record.definition.enabledWhen(context)
      : true;
    record.enabled = enabledResult !== false;
    if (!record.enabled) {
      record.running = false;
      record.status = "disabled";
      record.health = normalizeHealth({
        ok: true,
        status: "disabled",
      });
      return;
    }

    try {
      if (typeof record.definition.start === "function") {
        await record.definition.start(context);
      }
      record.running = true;
      record.status = "running";
      record.startCount += 1;
      record.lastStartedAt = new Date().toISOString();
      record.lastError = null;
    } catch (error) {
      record.running = false;
      record.status = "error";
      record.lastError = toErrorMessage(error);
      record.health = normalizeHealth({
        ok: false,
        status: "error",
        details: record.lastError,
      });
      if (logger && typeof logger.error === "function") {
        logger.error("service.start.failed", {
          serviceID: record.id,
          message: record.lastError,
        });
      }
      return;
    }

    await refreshOneHealth(record, context);
  }

  async function refreshOneHealth(record, context) {
    if (!record.enabled) {
      record.health = normalizeHealth({
        ok: true,
        status: "disabled",
      });
      return;
    }
    try {
      const result = typeof record.definition.healthCheck === "function"
        ? await record.definition.healthCheck(context)
        : { ok: record.running, status: record.running ? "healthy" : "stopped" };
      record.health = normalizeHealth(result);
      if (!record.health.ok && record.status === "running") {
        record.status = "degraded";
      }
    } catch (error) {
      record.health = normalizeHealth({
        ok: false,
        status: "error",
        details: toErrorMessage(error),
      });
      record.status = "degraded";
      record.lastError = toErrorMessage(error);
    }
  }

  async function startAll(context = {}) {
    for (const record of records) {
      await startOne(record, context);
    }
    return getSummary();
  }

  async function stopAll(context = {}) {
    const reversed = records.slice().reverse();
    for (const record of reversed) {
      try {
        if (record.running && typeof record.definition.stop === "function") {
          await record.definition.stop(context);
        }
      } catch (error) {
        record.lastError = toErrorMessage(error);
        if (logger && typeof logger.warn === "function") {
          logger.warn("service.stop.failed", {
            serviceID: record.id,
            message: record.lastError,
          });
        }
      }
      record.running = false;
      record.lastStoppedAt = new Date().toISOString();
      if (record.enabled) {
        record.status = "stopped";
        record.health = normalizeHealth({
          ok: true,
          status: "stopped",
        });
      }
    }
    return getSummary();
  }

  async function refreshHealth(context = {}) {
    for (const record of records) {
      await refreshOneHealth(record, context);
    }
    return getSummary();
  }

  function getServiceSnapshot(record) {
    return {
      id: record.id,
      label: record.label,
      enabled: Boolean(record.enabled),
      running: Boolean(record.running),
      status: record.status,
      startCount: record.startCount,
      lastStartedAt: record.lastStartedAt,
      lastStoppedAt: record.lastStoppedAt,
      lastError: record.lastError,
      health: { ...record.health },
    };
  }

  function getSummary() {
    const services = records.map((record) => getServiceSnapshot(record));
    const total = services.length;
    const enabled = services.filter((item) => item.enabled).length;
    const running = services.filter((item) => item.running).length;
    const healthy = services.filter((item) => item.enabled && item.health.ok).length;
    const unhealthy = services.filter((item) => item.enabled && !item.health.ok).length;
    let status = "idle";
    if (enabled === 0 && total > 0) {
      status = "disabled";
    } else if (unhealthy > 0) {
      status = "degraded";
    } else if (running > 0) {
      status = "healthy";
    }

    return {
      total,
      enabled,
      running,
      healthy,
      unhealthy,
      healthOK: unhealthy === 0,
      status,
      services,
    };
  }

  return {
    register,
    startAll,
    stopAll,
    refreshHealth,
    getSummary,
  };
}
