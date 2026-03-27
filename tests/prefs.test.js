/**
 * Prefs 模块测试
 */
import { describe, it, beforeEach, assert } from './test-framework.js';
import { createPreferenceStore } from '../src/core/prefs.js';

let prefValues = new Map();
let observers = new Map();

function notify(branch, key) {
  const branchObservers = observers.get(branch) || [];
  for (const observer of branchObservers) {
    observer.observe(null, 'nsPref:changed', key);
  }
}

describe('PreferenceStore', () => {
  beforeEach(() => {
    prefValues = new Map();
    observers = new Map();

    globalThis.Services = {
      prefs: {
        prefHasUserValue(key) {
          return prefValues.has(key);
        },
        getBoolPref(key, fallback) {
          return prefValues.has(key) ? prefValues.get(key) : fallback;
        },
        getIntPref(key, fallback) {
          return prefValues.has(key) ? prefValues.get(key) : fallback;
        },
        getStringPref(key, fallback) {
          return prefValues.has(key) ? prefValues.get(key) : fallback;
        },
        setBoolPref(key, value) {
          prefValues.set(key, value);
          notify('test.', key);
        },
        setIntPref(key, value) {
          prefValues.set(key, value);
          notify('test.', key);
        },
        setStringPref(key, value) {
          prefValues.set(key, value);
          notify('test.', key);
        },
        clearUserPref(key) {
          prefValues.delete(key);
        },
        addObserver(branch, observer) {
          const branchObservers = observers.get(branch) || [];
          branchObservers.push(observer);
          observers.set(branch, branchObservers);
        },
        removeObserver(branch, observer) {
          const branchObservers = observers.get(branch) || [];
          observers.set(branch, branchObservers.filter((entry) => entry !== observer));
        },
      },
    };
  });

  it('should create store with defaults', () => {
    const prefs = createPreferenceStore({
      prefBranch: 'test',
      defaults: { enabled: true, count: 0 }
    });

    assert.equal(prefs.get('enabled'), true);
    assert.equal(prefs.get('count'), 0);
  });

  it('should set and get values', () => {
    const prefs = createPreferenceStore({
      prefBranch: 'test',
      defaults: { name: '' }
    });

    prefs.set('name', 'test');
    assert.equal(prefs.get('name'), 'test');
  });

  it('should clear values', () => {
    const prefs = createPreferenceStore({
      prefBranch: 'test',
      defaults: { enabled: true }
    });

    prefs.set('enabled', false);
    prefs.clear('enabled');
    assert.equal(prefs.get('enabled'), true);
  });

  it('should notify on change', () => {
    const prefs = createPreferenceStore({ prefBranch: 'test' });
    let changedKey = null;

    prefs.onChange((key) => {
      changedKey = key;
    });

    prefs.set('test', 'value');
    assert.equal(changedKey, 'test');
  });

  it('should support multiple observers', () => {
    const prefs = createPreferenceStore({ prefBranch: 'test' });
    const changes = [];

    prefs.onChange((key) => changes.push(`listener1:${key}`));
    prefs.onChange((key) => changes.push(`listener2:${key}`));

    prefs.set('test', 'value');
    assert.equal(changes.length, 2);
  });

  it('should support unsubscribe', () => {
    const prefs = createPreferenceStore({ prefBranch: 'test' });
    let callCount = 0;

    const unsubscribe = prefs.onChange(() => callCount++);

    prefs.set('a', 1);
    unsubscribe();
    prefs.set('b', 2);

    assert.equal(callCount, 1);
  });

  it('should ensure defaults without overriding existing values', () => {
    prefValues.set('test.enabled', false);

    const prefs = createPreferenceStore({
      prefBranch: 'test',
      defaults: { enabled: true, count: 3 }
    });

    prefs.ensureDefaults();

    assert.equal(prefValues.get('test.enabled'), false);
    assert.equal(prefValues.get('test.count'), 3);
  });
});

describe('PreferenceStore Types', () => {
  beforeEach(() => {
    prefValues = new Map();
    observers = new Map();

    globalThis.Services = {
      prefs: {
        prefHasUserValue(key) {
          return prefValues.has(key);
        },
        getBoolPref(key, fallback) {
          return prefValues.has(key) ? prefValues.get(key) : fallback;
        },
        getIntPref(key, fallback) {
          return prefValues.has(key) ? prefValues.get(key) : fallback;
        },
        getStringPref(key, fallback) {
          return prefValues.has(key) ? prefValues.get(key) : fallback;
        },
        setBoolPref(key, value) {
          prefValues.set(key, value);
        },
        setIntPref(key, value) {
          prefValues.set(key, value);
        },
        setStringPref(key, value) {
          prefValues.set(key, value);
        },
        clearUserPref(key) {
          prefValues.delete(key);
        },
        addObserver() {},
        removeObserver() {},
      },
    };
  });

  it('should handle boolean values', () => {
    const prefs = createPreferenceStore({ prefBranch: 'test', defaults: {} });
    prefs.set('bool', true);
    assert.typeOf(prefs.get('bool'), 'boolean');
  });

  it('should handle number values', () => {
    const prefs = createPreferenceStore({ prefBranch: 'test', defaults: {} });
    prefs.set('num', 42);
    assert.typeOf(prefs.get('num'), 'number');
  });

  it('should handle string values', () => {
    const prefs = createPreferenceStore({ prefBranch: 'test', defaults: {} });
    prefs.set('str', 'hello');
    assert.typeOf(prefs.get('str'), 'string');
  });
});
