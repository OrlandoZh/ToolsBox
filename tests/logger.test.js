/**
 * Logger 模块测试
 */
import { describe, it, beforeEach, assert } from './test-framework.js';
import { createLogger } from '../src/core/logger.js';

let logEntries = [];

function mockHostLog(message, details) {
  logEntries.push({ message, details });
}

describe('Logger', () => {
  beforeEach(() => {
    logEntries = [];
  });

  it('should create logger with default level', () => {
    const logger = createLogger({ hostLog: mockHostLog });
    assert.equal(logger.getLevel(), 'info');
  });

  it('should create logger with custom level', () => {
    const logger = createLogger({ hostLog: mockHostLog, level: 'debug' });
    assert.equal(logger.getLevel(), 'debug');
  });

  it('should change level dynamically', () => {
    const logger = createLogger({ hostLog: mockHostLog, level: 'info' });
    const changed = logger.setLevel('warn');
    assert.equal(changed, true);
    assert.equal(logger.getLevel(), 'warn');
  });

  it('should log at appropriate level', () => {
    const logger = createLogger({ hostLog: mockHostLog, level: 'warn' });

    logger.debug('debug msg');
    logger.info('info msg');
    logger.warn('warn msg');
    logger.error('error msg');

    assert.equal(logEntries.length, 2);
    assert.includes(logEntries[0].message, '[cleanroom:warn]');
    assert.includes(logEntries[1].message, '[cleanroom:error]');
  });

  it('should not log below current level', () => {
    const logger = createLogger({ hostLog: mockHostLog, level: 'error' });

    logger.debug('debug');
    logger.info('info');
    logger.warn('warn');
    logger.error('error');

    assert.equal(logEntries.length, 1);
  });

  it('should keep current level when setting invalid level', () => {
    const logger = createLogger({ hostLog: mockHostLog, level: 'warn' });
    const changed = logger.setLevel('invalid');

    assert.equal(changed, false);
    assert.equal(logger.getLevel(), 'warn');
  });

  it('should default details to empty object', () => {
    const logger = createLogger({ hostLog: mockHostLog, level: 'debug' });

    logger.info('message without details');

    assert.equal(logEntries.length, 1);
    assert.deepEqual(logEntries[0].details, {});
  });
});

describe('Logger Levels', () => {
  beforeEach(() => {
    logEntries = [];
  });

  it('should respect debug level', () => {
    const logger = createLogger({ hostLog: mockHostLog, level: 'debug' });

    logger.debug('test');
    assert.equal(logEntries.length, 1);
  });

  it('should respect error level', () => {
    const logger = createLogger({ hostLog: mockHostLog, level: 'error' });

    logger.warn('test');
    logger.error('test');

    assert.equal(logEntries.length, 1);
  });
});
