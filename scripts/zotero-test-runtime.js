async function runTestCase(test, context) {
  const startedAt = Date.now();
  try {
    await test.run(context);
    return {
      name: test.name,
      status: "passed",
      durationMs: Date.now() - startedAt,
    };
  }
  catch (error) {
    return {
      name: test.name,
      status: "failed",
      durationMs: Date.now() - startedAt,
      error: {
        message: error && error.message ? String(error.message) : String(error),
        stack: error && error.stack ? String(error.stack) : "",
      },
    };
  }
}

function createAssert() {
  return {
    equal(actual, expected, message) {
      if (actual !== expected) {
        throw new Error(message || `Expected ${expected}, got ${actual}`);
      }
    },
    ok(value, message) {
      if (!value) {
        throw new Error(message || "Expected truthy value");
      }
    },
    notOk(value, message) {
      if (value) {
        throw new Error(message || "Expected falsy value");
      }
    },
    includes(haystack, needle, message) {
      const contains = typeof haystack === "string"
        ? haystack.includes(needle)
        : Array.isArray(haystack)
          ? haystack.includes(needle)
          : haystack && needle in haystack;
      if (!contains) {
        throw new Error(message || `Expected ${JSON.stringify(haystack)} to include ${JSON.stringify(needle)}`);
      }
    },
    deepEqual(actual, expected, message) {
      const actualText = JSON.stringify(actual);
      const expectedText = JSON.stringify(expected);
      if (actualText !== expectedText) {
        throw new Error(message || `Expected ${expectedText}, got ${actualText}`);
      }
    },
  };
}

this.runCleanroomZoteroTests = async function runCleanroomZoteroTests(options) {
  const tests = [];
  const registerZoteroTest = function registerZoteroTest(name, run) {
    if (typeof name !== "string" || !name) {
      throw new Error("registerZoteroTest(name, run) requires a non-empty name");
    }
    if (typeof run !== "function") {
      throw new Error(`Test '${name}' must provide a function`);
    }
    tests.push({ name, run });
  };

  const scope = {
    Zotero,
    Services,
    ChromeUtils,
    console,
    addonConfig: options.addonConfig,
    registerZoteroTest,
  };

  for (const fileHref of options.fileHrefs) {
    Services.scriptloader.loadSubScript(fileHref, scope);
  }

  const context = {
    assert: createAssert(),
    Zotero,
    Services,
    ChromeUtils,
    addonConfig: options.addonConfig,
    plugin: Zotero[options.addonConfig.instanceKey],
  };

  const results = [];
  for (const test of tests) {
    results.push(await runTestCase(test, context));
  }

  const summary = {
    total: results.length,
    passed: results.filter((result) => result.status === "passed").length,
    failed: results.filter((result) => result.status === "failed").length,
  };

  return JSON.stringify({
    summary,
    results,
  });
};
