import { createTaskQueue, TASK_QUEUE_STATUSES } from "./task-queue.js";

function noop() {}

function toErrorMessage(error) {
  if (!error) {
    return "unknown";
  }
  if (typeof error === "string") {
    return error;
  }
  return String(error.message || error);
}

function clone(value) {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value !== "object") {
    return value;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  }
  catch {
    return null;
  }
}

function normalizeType(type, label) {
  const normalized = String(type || "").trim();
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

function normalizeDescriptor(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("task descriptor must be an object");
  }

  const descriptor = { ...input };
  descriptor.type = normalizeType(descriptor.type, "task descriptor type");
  if (typeof descriptor.id === "string") {
    descriptor.id = descriptor.id.trim();
  }
  return descriptor;
}

function isTerminalStatus(status) {
  return status === TASK_QUEUE_STATUSES.SUCCEEDED || status === TASK_QUEUE_STATUSES.FAILED;
}

export function createTaskRunner(options = {}) {
  const {
    id,
    label,
    handlers,
    logger,
    concurrency = 1,
    autoStart = true,
    defaultMaxAttempts = 1,
  } = options;

  const runnerID = normalizeType(id, "task runner id");
  const runnerLabel = String(label || runnerID);
  const handlerMap = new Map();
  const taskRecords = new Map();
  const listeners = new Set();
  const taskWaiters = new Map();

  function debug(message, details = {}) {
    if (logger && typeof logger.debug === "function") {
      logger.debug(message, details);
    }
  }

  function warn(message, details = {}) {
    if (logger && typeof logger.warn === "function") {
      logger.warn(message, details);
    }
  }

  function emit(type, {
    taskID = null,
    taskType = null,
    status = null,
    details = {},
  } = {}) {
    const event = {
      type,
      runnerID,
      taskID,
      taskType,
      status,
      details: clone(details) || {},
    };

    Array.from(listeners).forEach((listener) => {
      try {
        listener(event);
      }
      catch (error) {
        warn("taskRunner.listener.failed", {
          runnerID,
          taskID,
          taskType,
          message: toErrorMessage(error),
        });
      }
    });
  }

  function buildTaskSnapshot(taskID, queueTask = null) {
    const record = taskRecords.get(taskID);
    const queueSnapshot = queueTask || queue.getTask(taskID);
    if (!record && !queueSnapshot) {
      return null;
    }

    return {
      taskID,
      descriptorID: record?.descriptorID || null,
      type: record?.type || null,
      status: queueSnapshot?.status || record?.status || null,
      priority: queueSnapshot?.priority ?? record?.priority ?? 0,
      attemptCount: queueSnapshot?.attemptCount ?? record?.attemptCount ?? 0,
      maxAttempts: queueSnapshot?.maxAttempts ?? record?.maxAttempts ?? 1,
      enqueuedAt: queueSnapshot?.enqueuedAt || record?.enqueuedAt || null,
      startedAt: queueSnapshot?.startedAt || record?.startedAt || null,
      finishedAt: queueSnapshot?.finishedAt || record?.finishedAt || null,
      lastError: queueSnapshot?.lastError || record?.lastError || null,
      descriptor: clone(record?.descriptor),
      queueMetadata: clone(queueSnapshot?.metadata ?? record?.queueMetadata ?? null),
      lastProgress: clone(queueSnapshot?.lastProgress ?? record?.lastProgress ?? null),
      result: clone(record?.result),
    };
  }

  function resolveTaskWaiters(taskID) {
    const waiters = taskWaiters.get(taskID);
    if (!waiters || waiters.length === 0) {
      return;
    }
    const snapshot = buildTaskSnapshot(taskID);
    taskWaiters.delete(taskID);
    waiters.forEach((resolve) => {
      try {
        resolve(snapshot);
      }
      catch {}
    });
  }

  const queue = createTaskQueue({
    id: runnerID,
    label: runnerLabel,
    logger,
    concurrency,
    autoStart,
    defaultMaxAttempts,
    async worker({ taskID, payload, attempt, maxAttempts, report }) {
      const descriptor = normalizeDescriptor(payload);
      const handler = handlerMap.get(descriptor.type);
      if (typeof handler !== "function") {
        throw new Error(`task handler is not registered: ${descriptor.type}`);
      }

      const result = await handler({
        runnerID,
        taskID,
        descriptor,
        input: descriptor.input ?? null,
        metadata: descriptor.metadata ?? null,
        attempt,
        maxAttempts,
        report,
      });

      const record = taskRecords.get(taskID);
      if (record) {
        record.result = clone(result);
      }
    },
  });

  queue.onEvent((event) => {
    const taskID = event.taskID;
    const record = taskID ? taskRecords.get(taskID) : null;
    const snapshot = taskID ? queue.getTask(taskID) : null;

    if (record && snapshot) {
      record.status = snapshot.status;
      record.priority = snapshot.priority;
      record.attemptCount = snapshot.attemptCount;
      record.maxAttempts = snapshot.maxAttempts;
      record.enqueuedAt = snapshot.enqueuedAt;
      record.startedAt = snapshot.startedAt;
      record.finishedAt = snapshot.finishedAt;
      record.lastError = snapshot.lastError;
      record.lastProgress = snapshot.lastProgress;
      record.queueMetadata = snapshot.metadata;
    }

    emit(event.type, {
      taskID,
      taskType: record?.type || null,
      status: snapshot?.status || event.status,
      details: event.details,
    });

    if (taskID && snapshot && isTerminalStatus(snapshot.status)) {
      resolveTaskWaiters(taskID);
    }
  });

  function register(type, handler) {
    const taskType = normalizeType(type, "task handler type");
    if (typeof handler !== "function") {
      throw new Error(`task handler for ${taskType} must be a function`);
    }
    if (handlerMap.has(taskType)) {
      throw new Error(`duplicate task handler: ${taskType}`);
    }
    handlerMap.set(taskType, handler);
    debug("taskRunner.handler.registered", {
      runnerID,
      taskType,
    });
    emit("handler.registered", {
      taskType,
      details: {},
    });
    return taskType;
  }

  function unregister(type) {
    const taskType = normalizeType(type, "task handler type");
    const removed = handlerMap.delete(taskType);
    if (removed) {
      debug("taskRunner.handler.unregistered", {
        runnerID,
        taskType,
      });
      emit("handler.unregistered", {
        taskType,
        details: {},
      });
    }
    return removed;
  }

  function seedHandlers() {
    if (!handlers) {
      return;
    }
    if (Array.isArray(handlers)) {
      handlers.forEach((definition) => {
        register(definition?.type, definition?.handler || definition?.run);
      });
      return;
    }
    if (typeof handlers === "object") {
      Object.entries(handlers).forEach(([taskType, handler]) => {
        register(taskType, handler);
      });
      return;
    }
    throw new Error("task runner handlers must be an object or array");
  }

  function submit(descriptorInput, options = {}) {
    const descriptor = normalizeDescriptor(descriptorInput);
    const taskType = descriptor.type;
    const taskID = typeof options.id === "string" && options.id.trim()
      ? options.id.trim()
      : typeof descriptor.id === "string" && descriptor.id
        ? descriptor.id
        : null;

    if (!handlerMap.has(taskType)) {
      emit("task.rejected", {
        taskID,
        taskType,
        details: {
          reason: "missing-handler",
        },
      });
      return {
        taskID,
        accepted: false,
        duplicate: false,
        status: null,
        reason: "missing-handler",
      };
    }

    const priority = Number.isFinite(Number(options.priority))
      ? Number(options.priority)
      : Number.isFinite(Number(descriptor.priority))
        ? Number(descriptor.priority)
        : 0;
    const maxAttempts = Number.isFinite(Number(options.maxAttempts))
      ? Number(options.maxAttempts)
      : Number.isFinite(Number(descriptor.maxAttempts))
        ? Number(descriptor.maxAttempts)
        : undefined;
    const queueMetadata = options.queueMetadata ?? null;

    const enqueueResult = queue.enqueue(descriptor, {
      id: taskID || undefined,
      priority,
      maxAttempts,
      metadata: queueMetadata,
    });

    if (!enqueueResult.accepted) {
      return {
        ...enqueueResult,
        reason: enqueueResult.duplicate ? "duplicate" : "rejected",
      };
    }

    taskRecords.set(enqueueResult.taskID, {
      taskID: enqueueResult.taskID,
      descriptorID: typeof descriptor.id === "string" && descriptor.id ? descriptor.id : null,
      type: taskType,
      descriptor,
      priority,
      attemptCount: 0,
      maxAttempts: maxAttempts || defaultMaxAttempts,
      enqueuedAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      status: TASK_QUEUE_STATUSES.PENDING,
      lastError: null,
      lastProgress: null,
      queueMetadata,
      result: null,
    });

    return {
      ...enqueueResult,
      reason: null,
    };
  }

  function waitForTask(taskID) {
    const snapshot = buildTaskSnapshot(taskID);
    if (!snapshot || isTerminalStatus(snapshot.status)) {
      return Promise.resolve(snapshot);
    }
    return new Promise((resolve) => {
      const waiters = taskWaiters.get(taskID) || [];
      waiters.push(resolve);
      taskWaiters.set(taskID, waiters);
    });
  }

  function run(descriptor, options = {}) {
    const result = submit(descriptor, options);
    if (!result.accepted) {
      return Promise.resolve({
        ...result,
        task: result.taskID ? buildTaskSnapshot(result.taskID) : null,
      });
    }

    return waitForTask(result.taskID).then((task) => ({
      ...result,
      task,
    }));
  }

  function clearFinished() {
    const removed = queue.clearFinished();
    Array.from(taskRecords.keys()).forEach((taskID) => {
      if (!queue.has(taskID)) {
        taskRecords.delete(taskID);
        resolveTaskWaiters(taskID);
      }
    });
    return removed;
  }

  function getSummary() {
    const queueSummary = queue.getSummary();
    const tasks = queueSummary.tasks
      .map((queueTask) => buildTaskSnapshot(queueTask.id, queueTask))
      .filter(Boolean);

    return {
      id: runnerID,
      label: runnerLabel,
      running: queueSummary.running,
      concurrency: queueSummary.concurrency,
      activeWorkerCount: queueSummary.activeWorkerCount,
      handlerTypes: Array.from(handlerMap.keys()).sort(),
      counts: { ...queueSummary.counts },
      tasks,
    };
  }

  function onEvent(listener) {
    if (typeof listener !== "function") {
      return noop;
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  seedHandlers();

  return {
    register,
    unregister,
    submit,
    run,
    start() {
      queue.start();
      return getSummary();
    },
    stop() {
      queue.stop();
      return getSummary();
    },
    flush() {
      return queue.flush().then(() => getSummary());
    },
    clearFinished,
    getTask(taskID) {
      return buildTaskSnapshot(taskID);
    },
    getSummary,
    onEvent,
    isRunning() {
      return queue.isRunning();
    },
    has(taskID) {
      return taskRecords.has(taskID);
    },
    hasHandler(type) {
      return handlerMap.has(String(type || "").trim());
    },
    listHandlers() {
      return Array.from(handlerMap.keys()).sort();
    },
  };
}
