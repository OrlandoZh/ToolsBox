export function createPreferenceStore({ prefBranch, defaults }) {
  const observedBranch = `${prefBranch}.`;

  function prefKey(key) {
    return `${prefBranch}.${key}`;
  }

  function ensureDefaults() {
    Object.entries(defaults).forEach(([key, value]) => {
      const target = prefKey(key);
      if (!Services.prefs.prefHasUserValue(target)) {
        set(key, value);
      }
    });
  }

  function get(key) {
    const target = prefKey(key);
    const fallback = defaults[key];

    if (typeof fallback === "boolean") {
      return Services.prefs.getBoolPref(target, fallback);
    }

    if (typeof fallback === "number") {
      return Services.prefs.getIntPref(target, fallback);
    }

    return Services.prefs.getStringPref(target, String(fallback));
  }

  function set(key, value) {
    const target = prefKey(key);

    if (typeof value === "boolean") {
      Services.prefs.setBoolPref(target, value);
      return;
    }

    if (typeof value === "number") {
      Services.prefs.setIntPref(target, value);
      return;
    }

    Services.prefs.setStringPref(target, String(value));
  }

  function clear(key) {
    const target = prefKey(key);
    if (Services.prefs.prefHasUserValue(target)) {
      Services.prefs.clearUserPref(target);
    }
  }

  function toObservedKey(rawName) {
    if (!rawName) {
      return "";
    }

    if (rawName.startsWith(observedBranch)) {
      return rawName.slice(observedBranch.length);
    }

    return rawName;
  }

  function onChange(handler) {
    const observer = {
      observe(subject, topic, data) {
        if (topic !== "nsPref:changed") {
          return;
        }

        handler(toObservedKey(String(data || "")));
      },
    };

    Services.prefs.addObserver(observedBranch, observer);
    return () => {
      Services.prefs.removeObserver(observedBranch, observer);
    };
  }

  return {
    ensureDefaults,
    get,
    set,
    clear,
    onChange,
  };
}
