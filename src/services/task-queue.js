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

function toPositiveInteger(value, fallback) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 1) {
    return fallback;
  }
  return Math.floor(normalized);
}

export const TASK_QUEUE_STATUSES = Object.freeze({
  PENDING: "pending",
  RUNNING: "running",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
});

export function createTaskQueue(options = {}) {
  const {
    id,
    label,
    worker,
    logger,
    concurrency = 1,
    autoStart = true,
    defaultMaxAttempts = 1,
  } = options;

  const queueID = String(id || "").trim();
  if (!queueID) {
    throw new Error("task queue id is required");
  }
  if (typeof worker !== "function") {
    throw new Error("task queue worker() is required");
  }

  const queueLabel = String(label || queueID);
  const queueConcurrency = toPositiveInteger(concurrency, 1);
  const queueDefaultMaxAttempts = toPositiveInteger(defaultMaxAttempts, 1);
  let running = Boolean(autoStart);
  let nextOrderIndex = 0;
  let nextTaskSequence = 0;
  let activeWorkerCount = 0;

  const records = new Map();
  const pendingTaskIDs = [];
  const listeners = new Set();
  const idleWaiters = [];

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

  function emit(type, task, details = {}) {
    const event = {
      type,
      queueID,
      taskID: task?.id || null,
      status: task?.status || null,
      details: clone(details) || {},
    };

    Array.from(listeners).forEach((listener) => {
      try {
        listener(event);
      }
      catch (error) {
        warn("taskQueue.listener.failed", {
          queueID,
          taskID: event.taskID,
          message: toErrorMessage(error),
        });
      }
    });
  }

  function buildTaskSnapshot(task) {
    return {
      id: task.id,
      status: task.status,
      priority: task.priority,
      attemptCount: task.attemptCount,
      maxAttempts: task.maxAttempts,
      enqueuedAt: task.enqueuedAt,
      startedAt: task.startedAt,
      finishedAt: task.finishedAt,
      lastError: task.lastError,
      metadata: clone(task.metadata),
      lastProgress: clone(task.lastProgress),
    };
  }

  function getCounts() {
    const counts = {
      total: records.size,
      pending: 0,
      running: 0,
      succeeded: 0,
      failed: 0,
    };

    records.forEach((task) => {
      if (task.status === TASK_QUEUE_STATUSES.PENDING) {
        counts.pending += 1;
      } else if (task.status === TASK_QUEUE_STATUSES.RUNNING) {
        counts.running += 1;
      } else if (task.status === TASK_QUEUE_STATUSES.SUCCEEDED) {
        counts.succeeded += 1;
      } else if (task.status === TASK_QUEUE_STATUSES.FAILED) {
        counts.failed += 1;
      }
    });

    return counts;
  }

  function getSummary() {
    return {
      id: queueID,
      label: queueLabel,
      running,
      concurrency: queueConcurrency,
      activeWorkerCount,
      counts: getCounts(),
      tasks: Array.from(records.values())
        .sort((left, right) => left.orderIndex - right.orderIndex)
        .map((task) => buildTaskSnapshot(task)),
    };
  }

  function resolveIdleWaitersIfNeeded() {
    if (pendingTaskIDs.length > 0 || activeWorkerCount > 0) {
      return;
    }

    while (idleWaiters.length > 0) {
      const resolve = idleWaiters.shift();
      try {
        resolve(getSummary());
      }
      catch {}
    }
  }

  function sortPendingTasks() {
    pendingTaskIDs.sort((leftTaskID, rightTaskID) => {
      const left = records.get(leftTaskID);
      const right = records.get(rightTaskID);
      if (!left && !right) {
        return 0;
      }
      if (!left) {
        return 1;
      }
      if (!right) {
        return -1;
      }
      if (left.priority !== right.priority) {
        return right.priority - left.priority;
      }
      return left.orderIndex - right.orderIndex;
    });
  }

  function getNextPendingTask() {
    sortPendingTasks();

    while (pendingTaskIDs.length > 0) {
      const nextTaskID = pendingTaskIDs.shift();
      const task = records.get(nextTaskID);
      if (task && task.status === TASK_QUEUE_STATUSES.PENDING) {
        return task;
      }
    }

    return null;
  }

  function schedulePump() {
    Promise.resolve().then(() => {
      void pump();
    });
  }

  async function runTask(task) {
    task.status = TASK_QUEUE_STATUSES.RUNNING;
    task.attemptCount += 1;
    task.startedAt = new Date().toISOString();
    task.finishedAt = null;
    task.lastError = null;
    task.lastProgress = null;
    activeWorkerCount += 1;

    emit("task.started", task, {
      attempt: task.attemptCount,
      maxAttempts: task.maxAttempts,
    });

    try {
      await worker({
        queueID,
        taskID: task.id,
        payload: task.payload,
        attempt: task.attemptCount,
        maxAttempts: task.maxAttempts,
        metadata: task.metadata,
        report(details = {}) {
          task.lastProgress = clone(details);
          emit("task.progress", task, details);
        },
      });

      task.status = TASK_QUEUE_STATUSES.SUCCEEDED;
      task.finishedAt = new Date().toISOString();
      emit("task.succeeded", task, {
        attempt: task.attemptCount,
      });
    }
    catch (error) {
      task.lastError = toErrorMessage(error);
      if (task.attemptCount < task.maxAttempts) {
        task.status = TASK_QUEUE_STATUSES.PENDING;
        task.finishedAt = null;
        pendingTaskIDs.push(task.id);
        emit("task.retry", task, {
          attempt: task.attemptCount,
          maxAttempts: task.maxAttempts,
          message: task.lastError,
        });
      } else {
        task.status = TASK_QUEUE_STATUSES.FAILED;
        task.finishedAt = new Date().toISOString();
        emit("task.failed", task, {
          attempt: task.attemptCount,
          maxAttempts: task.maxAttempts,
          message: task.lastError,
        });
      }
    }
    finally {
      activeWorkerCount -= 1;
      resolveIdleWaitersIfNeeded();
      schedulePump();
    }
  }

  async function pump() {
    if (!running) {
      resolveIdleWaitersIfNeeded();
      return;
    }

    while (running && activeWorkerCount < queueConcurrency) {
      const task = getNextPendingTask();
      if (!task) {
        break;
      }
      void runTask(task);
    }

    resolveIdleWaitersIfNeeded();
  }

  function enqueue(payload, options = {}) {
    const requestedTaskID = typeof options.id === "string" && options.id.trim()
      ? options.id.trim()
      : null;

    if (requestedTaskID && records.has(requestedTaskID)) {
      const existing = records.get(requestedTaskID);
      return {
        taskID: requestedTaskID,
        accepted: false,
        duplicate: true,
        status: existing?.status || null,
      };
    }

    const taskID = requestedTaskID || `${queueID}:${++nextTaskSequence}`;
    const task = {
      id: taskID,
      payload,
      status: TASK_QUEUE_STATUSES.PENDING,
      priority: Number.isFinite(Number(options.priority)) ? Number(options.priority) : 0,
      attemptCount: 0,
      maxAttempts: toPositiveInteger(options.maxAttempts, queueDefaultMaxAttempts),
      metadata: options.metadata ?? null,
      orderIndex: ++nextOrderIndex,
      enqueuedAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      lastError: null,
      lastProgress: null,
    };

    records.set(taskID, task);
    pendingTaskIDs.push(taskID);

    emit("task.enqueued", task, {
      priority: task.priority,
      maxAttempts: task.maxAttempts,
    });

    debug("taskQueue.enqueued", {
      queueID,
      taskID,
      priority: task.priority,
    });

    if (running) {
      schedulePump();
    }

    return {
      taskID,
      accepted: true,
      duplicate: false,
      status: task.status,
    };
  }

  function start() {
    running = true;
    emit("queue.started", null, {});
    schedulePump();
    return getSummary();
  }

  function stop() {
    running = false;
    emit("queue.stopped", null, {});
    resolveIdleWaitersIfNeeded();
    return getSummary();
  }

  function clearFinished() {
    const removableIDs = [];
    records.forEach((task, taskID) => {
      if (task.status === TASK_QUEUE_STATUSES.SUCCEEDED || task.status === TASK_QUEUE_STATUSES.FAILED) {
        removableIDs.push(taskID);
      }
    });

    removableIDs.forEach((taskID) => {
      records.delete(taskID);
    });

    return removableIDs.length;
  }

  function flush() {
    if (pendingTaskIDs.length === 0 && activeWorkerCount === 0) {
      return Promise.resolve(getSummary());
    }
    return new Promise((resolve) => {
      idleWaiters.push(resolve);
    });
  }

  function getTask(taskID) {
    const task = records.get(taskID);
    return task ? buildTaskSnapshot(task) : null;
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

  return {
    enqueue,
    start,
    stop,
    flush,
    clearFinished,
    getTask,
    getSummary,
    onEvent,
    isRunning() {
      return running;
    },
    has(taskID) {
      return records.has(taskID);
    },
  };
}
