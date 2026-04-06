import { describe, it, assert } from "./test-framework.js";
import { createTaskQueue } from "../src/services/index.js";

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe("Task Queue", () => {
  it("should process queued tasks with priority and bounded concurrency", async () => {
    const started = [];
    const finished = [];
    let active = 0;
    let maxActive = 0;

    const queue = createTaskQueue({
      id: "queue.demo",
      concurrency: 2,
      async worker({ payload }) {
        active += 1;
        maxActive = Math.max(maxActive, active);
        started.push(payload.name);
        await delay(payload.delay);
        finished.push(payload.name);
        active -= 1;
      },
    });

    queue.enqueue({ name: "slow-low", delay: 25 }, { priority: 0 });
    queue.enqueue({ name: "fast-high", delay: 5 }, { priority: 10 });
    queue.enqueue({ name: "mid", delay: 10 }, { priority: 5 });

    const summary = await queue.flush();

    assert.equal(summary.counts.succeeded, 3);
    assert.equal(maxActive, 2);
    assert.equal(started[0], "fast-high");
    assert.equal(started[1], "mid");
    assert.includes(finished, "slow-low");
  });

  it("should retry a failed task until it succeeds within max attempts", async () => {
    let attempts = 0;
    const events = [];

    const queue = createTaskQueue({
      id: "queue.retry",
      async worker({ report }) {
        attempts += 1;
        report({ phase: `attempt-${attempts}` });
        if (attempts < 2) {
          throw new Error("retry-me");
        }
      },
    });

    queue.onEvent((event) => {
      events.push(event.type);
    });

    const enqueueResult = queue.enqueue(
      { name: "retry-task" },
      {
        id: "retry-task",
        maxAttempts: 2,
      },
    );

    const summary = await queue.flush();
    const task = queue.getTask(enqueueResult.taskID);

    assert.equal(summary.counts.succeeded, 1);
    assert.equal(summary.counts.failed, 0);
    assert.equal(task.status, "succeeded");
    assert.equal(task.attemptCount, 2);
    assert.includes(events, "task.retry");
    assert.includes(events, "task.progress");
  });

  it("should not process pending tasks while stopped and should resume after start", async () => {
    const processed = [];
    const queue = createTaskQueue({
      id: "queue.stop-start",
      autoStart: false,
      async worker({ payload }) {
        processed.push(payload.name);
      },
    });

    queue.enqueue({ name: "first" });
    await delay(20);

    assert.deepEqual(processed, []);
    assert.equal(queue.getSummary().counts.pending, 1);

    queue.start();
    const summary = await queue.flush();

    assert.deepEqual(processed, ["first"]);
    assert.equal(summary.counts.succeeded, 1);
  });

  it("should reject duplicate task ids and clear finished tasks", async () => {
    const queue = createTaskQueue({
      id: "queue.duplicate",
      async worker() {},
    });

    const first = queue.enqueue({ name: "a" }, { id: "stable-task" });
    const duplicate = queue.enqueue({ name: "b" }, { id: "stable-task" });

    await queue.flush();
    const removed = queue.clearFinished();

    assert.equal(first.accepted, true);
    assert.equal(duplicate.accepted, false);
    assert.equal(duplicate.duplicate, true);
    assert.equal(removed, 1);
    assert.equal(queue.has("stable-task"), false);
  });
});
