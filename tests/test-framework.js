/**
 * 简易测试框架
 * 无外部依赖，自包含测试运行器
 */

/**
 * 测试结果
 */
const results = {
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: []
};

const testQueue = [];

/**
 * 当前测试套件
 */
let currentSuite = null;
let currentHooks = null;

/**
 * 定义测试套件
 * @param {string} name - 套件名称
 * @param {Function} fn - 测试函数
 */
export function describe(name, fn) {
  const previousSuite = currentSuite;
  const previousHooks = currentHooks;
  currentSuite = name;
  currentHooks = {
    beforeEach: [],
    afterEach: [],
  };
  console.log(`\n📦 ${name}`);
  try {
    fn();
  } finally {
    currentSuite = previousSuite;
    currentHooks = previousHooks;
  }
}

/**
 * 定义测试用例
 * @param {string} name - 测试名称
 * @param {Function} fn - 测试函数
 */
export function it(name, fn) {
  const fullName = currentSuite ? `${currentSuite} > ${name}` : name;

  testQueue.push({
    name,
    fullName,
    fn,
    hooks: currentHooks
      ? {
          beforeEach: [...currentHooks.beforeEach],
          afterEach: [...currentHooks.afterEach],
        }
      : { beforeEach: [], afterEach: [] },
  });
}

/**
 * 跳过测试
 * @param {string} name - 测试名称
 * @param {Function} fn - 测试函数
 */
export function itSkip(name, fn) {
  const fullName = currentSuite ? `${currentSuite} > ${name}` : name;
  results.skipped++;
  results.tests.push({ name: fullName, status: 'skipped' });
  console.log(`  ⏭️ ${name} (skipped)`);
}

/**
 * 断言函数
 */
export const assert = {
  /**
   * 断言相等
   */
  equal(actual, expected, message = '') {
    if (actual !== expected) {
      throw new Error(`${message}\nExpected: ${expected}\nActual: ${actual}`);
    }
  },

  /**
   * 断言深度相等
   */
  deepEqual(actual, expected, message = '') {
    const actualStr = JSON.stringify(actual);
    const expectedStr = JSON.stringify(expected);
    if (actualStr !== expectedStr) {
      throw new Error(`${message}\nExpected: ${expectedStr}\nActual: ${actualStr}`);
    }
  },

  /**
   * 断言为真
   */
  ok(value, message = 'Expected truthy value') {
    if (!value) {
      throw new Error(message);
    }
  },

  /**
   * 断言为假
   */
  notOk(value, message = 'Expected falsy value') {
    if (value) {
      throw new Error(message);
    }
  },

  /**
   * 断言抛出错误
   */
  throws(fn, message = 'Expected function to throw') {
    let threw = false;
    try {
      fn();
    } catch (e) {
      threw = true;
    }
    if (!threw) {
      throw new Error(message);
    }
  },

  /**
   * 断言不抛出错误
   */
  doesNotThrow(fn, message = 'Expected function not to throw') {
    try {
      fn();
    } catch (e) {
      throw new Error(`${message}: ${e.message}`);
    }
  },

  /**
   * 断言类型
   */
  typeOf(value, expectedType, message = '') {
    const actualType = typeof value;
    if (actualType !== expectedType) {
      throw new Error(`${message}\nExpected type: ${expectedType}\nActual type: ${actualType}`);
    }
  },

  /**
   * 断言包含
   */
  includes(haystack, needle, message = '') {
    const contains = typeof haystack === 'string'
      ? haystack.includes(needle)
      : Array.isArray(haystack)
        ? haystack.includes(needle)
        : needle in haystack;

    if (!contains) {
      throw new Error(`${message}\nExpected ${JSON.stringify(haystack)} to include ${JSON.stringify(needle)}`);
    }
  },

  /**
   * 断言匹配正则
   */
  match(actual, pattern, message = '') {
    if (!(pattern instanceof RegExp)) {
      throw new Error('assert.match expects a RegExp pattern');
    }
    if (!pattern.test(String(actual))) {
      throw new Error(`${message}\nExpected ${JSON.stringify(actual)} to match ${String(pattern)}`);
    }
  },

  /**
   * 断言大于
   */
  greaterThan(actual, expected, message = '') {
    if (!(actual > expected)) {
      throw new Error(`${message}\nExpected ${actual} > ${expected}`);
    }
  },

  /**
   * 断言小于
   */
  lessThan(actual, expected, message = '') {
    if (!(actual < expected)) {
      throw new Error(`${message}\nExpected ${actual} < ${expected}`);
    }
  }
};

/**
 * 测试前钩子
 */
export function beforeEach(fn) {
  if (typeof fn !== 'function') {
    throw new Error('beforeEach hook must be a function');
  }
  if (!currentHooks) {
    throw new Error('beforeEach must be used inside describe');
  }
  currentHooks.beforeEach.push(fn);
}

/**
 * 测试后钩子
 */
export function afterEach(fn) {
  if (typeof fn !== 'function') {
    throw new Error('afterEach hook must be a function');
  }
  if (!currentHooks) {
    throw new Error('afterEach must be used inside describe');
  }
  currentHooks.afterEach.push(fn);
}

/**
 * 运行测试并输出结果
 */
export async function runTests() {
  for (const test of testQueue) {
    try {
      for (const hook of test.hooks.beforeEach) {
        await hook();
      }
      await test.fn();
      for (const hook of test.hooks.afterEach) {
        await hook();
      }

      results.passed++;
      results.tests.push({ name: test.fullName, status: 'passed' });
      console.log(`  ✅ ${test.name}`);
    } catch (error) {
      results.failed++;
      results.tests.push({ name: test.fullName, status: 'failed', error: error.message });
      console.log(`  ❌ ${test.name}`);
      console.log(`     Error: ${error.message}`);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('测试结果');
  console.log('='.repeat(50));
  console.log(`✅ 通过: ${results.passed}`);
  console.log(`❌ 失败: ${results.failed}`);
  console.log(`⏭️ 跳过: ${results.skipped}`);
  console.log('='.repeat(50));

  if (results.failed > 0) {
    console.log('\n失败的测试:');
    results.tests
      .filter(t => t.status === 'failed')
      .forEach(t => {
        console.log(`  - ${t.name}`);
        console.log(`    ${t.error}`);
      });
    process.exit(1);
  } else {
    console.log('\n🎉 所有测试通过！');
    process.exit(0);
  }
}

/**
 * 重置测试结果
 */
export function resetTests() {
  results.passed = 0;
  results.failed = 0;
  results.skipped = 0;
  results.tests = [];
  testQueue.length = 0;
}

/**
 * 获取测试结果
 */
export function getResults() {
  return { ...results };
}
