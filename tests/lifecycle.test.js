/**
 * 生命周期模块测试
 */
import { describe, it, beforeEach, assert } from './test-framework.js';
import { createLifecycleManager } from '../src/core/lifecycle.js';

let errors = [];
let logger = null;

describe('LifecycleManager', () => {
  beforeEach(() => {
    errors = [];
    logger = {
      error(message, details) {
        errors.push({ message, details });
      },
    };
  });

  it('should run cleanup on reset', () => {
    const lifecycle = createLifecycleManager({ logger });
    let counter = 0;

    lifecycle.trackCleanup(() => counter++);
    lifecycle.trackCleanup(() => counter++);

    lifecycle.reset();
    assert.equal(counter, 2);
  });

  it('should execute cleanup functions in reverse registration order', () => {
    const lifecycle = createLifecycleManager({ logger });
    const order = [];

    lifecycle.trackCleanup(() => order.push(1));
    lifecycle.trackCleanup(() => order.push(2));
    lifecycle.trackCleanup(() => order.push(3));

    lifecycle.reset();
    assert.deepEqual(order, [3, 2, 1]);
  });

  it('should handle cleanup errors gracefully', () => {
    const lifecycle = createLifecycleManager({ logger });
    let secondCalled = false;

    lifecycle.trackCleanup(() => { throw new Error('test'); });
    lifecycle.trackCleanup(() => { secondCalled = true; });

    lifecycle.reset();
    assert.ok(secondCalled, 'Second cleanup should still run');
    assert.equal(errors.length, 1);
    assert.equal(errors[0].message, 'cleanup.failed');
    assert.equal(errors[0].details.message, 'test');
  });

  it('should empty the cleanup stack after reset', () => {
    const lifecycle = createLifecycleManager({ logger });
    let counter = 0;

    lifecycle.trackCleanup(() => counter++);
    lifecycle.reset();
    lifecycle.reset();

    assert.equal(counter, 1);
  });
});
