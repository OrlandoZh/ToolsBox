import { describe, it, assert } from "./test-framework.js";
import { createTaskRunner } from "../src/services/index.js";

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe("Task Runner", () => {
  it("should dispatch typed descriptors and retain task results", async () => {
    const events = [];
    const runner = createTaskRunner({
      id: "runner.demo",
      concurrency: 2,
      handlers: {
        summarize: async ({ input, report }) => {
          report({ phase: "summarize" });
          await delay(5);
          return {
            summary: String(input.text || "").toUpperCase(),
          };
        },
        translate: async ({ input }) => ({
          translated: `zh:${String(input.text || "")}`,
        }),
      },
    });

    runner.onEvent((event) => {
      events.push(event.type);
    });

    const first = runner.submit(
      {
        id: "summary.alpha",
        type: "summarize",
        input: { text: "alpha" },
      },
      {
        priority: 5,
        queueMetadata: { lane: "high" },
      },
    );
    const second = runner.submit({
      type: "translate",
      input: { text: "beta" },
    });

    const summary = await runner.flush();
    const task = runner.getTask(first.taskID);

    assert.equal(first.accepted, true);
    assert.equal(second.accepted, true);
    assert.equal(summary.counts.succeeded, 2);
    assert.deepEqual(task.result, { summary: "ALPHA" });
    assert.deepEqual(task.queueMetadata, { lane: "high" });
    assert.deepEqual(runner.listHandlers(), ["summarize", "translate"]);
    assert.includes(events, "task.progress");
  });

  it("should retry typed tasks and resolve run() with the terminal snapshot", async () => {
    let attempts = 0;
    const runner = createTaskRunner({
      id: "runner.retry",
    });

    runner.register("retryable", async ({ attempt }) => {
      attempts += 1;
      if (attempt < 2) {
        throw new Error("retry-me");
      }
      return { ok: true };
    });

    const result = await runner.run(
      {
        type: "retryable",
        input: { value: 1 },
      },
      {
        maxAttempts: 2,
      },
    );

    assert.equal(result.accepted, true);
    assert.equal(result.task.status, "succeeded");
    assert.equal(result.task.attemptCount, 2);
    assert.deepEqual(result.task.result, { ok: true });
    assert.equal(attempts, 2);
  });

  it("should reject missing handlers before enqueue and reject duplicate task ids", async () => {
    const runner = createTaskRunner({
      id: "runner.guard",
      handlers: {
        noop: async () => {},
      },
    });

    const missingHandler = runner.submit({
      id: "missing.task",
      type: "missing",
      input: {},
    });
    const first = runner.submit({
      id: "stable.task",
      type: "noop",
      input: {},
    });
    const duplicate = runner.submit({
      id: "stable.task",
      type: "noop",
      input: {},
    });

    await runner.flush();
    const removed = runner.clearFinished();

    assert.equal(missingHandler.accepted, false);
    assert.equal(missingHandler.reason, "missing-handler");
    assert.equal(first.accepted, true);
    assert.equal(duplicate.accepted, false);
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.reason, "duplicate");
    assert.equal(removed, 1);
    assert.equal(runner.has("stable.task"), false);
  });
});
