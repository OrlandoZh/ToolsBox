(function () {
  "use strict";

  var bridgeKey = (document.documentElement.getAttribute("data-addon-ref") || "toolsbox")
    .replace(/-/g, "_");
  bridgeKey = "__" + bridgeKey + "_WorkbenchBridge__";

  var BASE_COLUMNS = [
    { key: "title", label: "Title", width: 280, defaultVisible: true },
    { key: "creators", label: "Authors", width: 180, defaultVisible: true },
    { key: "year", label: "Year", width: 70, defaultVisible: true },
    { key: "publication", label: "Publication", width: 180, defaultVisible: true },
    { key: "dateAdded", label: "Date Added", width: 120, defaultVisible: true },
    { key: "dateModified", label: "Date Modified", width: 130, defaultVisible: false },
  ];
  var ENHANCED_COLUMNS = BASE_COLUMNS.concat([
    { key: "itemType", label: "Type", width: 120, defaultVisible: true },
    { key: "workflowStatus", label: "Status", width: 110, defaultVisible: true },
    { key: "attachmentCount", label: "Attachments", width: 100, defaultVisible: true, type: "number" },
    { key: "doi", label: "DOI", width: 170, defaultVisible: false },
    { key: "tagList", label: "Tags", width: 200, defaultVisible: false },
    { key: "hasAttachmentLabel", label: "Has Attachment", width: 120, defaultVisible: false },
  ]);

  var state = {
    rows: [],
    enhanced: false,
    visibleColumns: BASE_COLUMNS.filter(function (c) { return c.defaultVisible; }).map(function (c) { return c.key; }),
    sortKey: null,
    sortDir: "asc",
    search: "",
    theme: "light",
    filters: {
      itemType: "",
      tag: "",
      workflowStatus: "",
      yearFrom: "",
      yearTo: "",
      hasAttachment: "",
    },
  };

  function $(sel) { return document.querySelector(sel); }
  function columns() { return state.enhanced ? ENHANCED_COLUMNS : BASE_COLUMNS; }
  function defaultVisibleColumns() {
    return columns().filter(function (c) { return c.defaultVisible; }).map(function (c) { return c.key; });
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function filteredRows() {
    var q = state.search.toLowerCase().trim();
    var rows = state.rows;
    if (q) {
      rows = rows.filter(function (r) {
        return columns().some(function (c) {
          return String(r[c.key] || "").toLowerCase().indexOf(q) !== -1;
        });
      });
    }
    if (state.enhanced) {
      rows = rows.filter(function (r) {
        var itemType = String(state.filters.itemType || "").toLowerCase();
        var tag = String(state.filters.tag || "").toLowerCase();
        var status = String(state.filters.workflowStatus || "").toLowerCase();
        var yearFrom = Number(state.filters.yearFrom);
        var yearTo = Number(state.filters.yearTo);
        var hasAttachment = String(state.filters.hasAttachment || "");
        var rowTags = Array.isArray(r.tags) ? r.tags : [];
        var rowYear = Number(r.yearNumber || r.year);
        if (itemType && String(r.itemType || "").toLowerCase() !== itemType) return false;
        if (tag && rowTags.map(function (entry) { return String(entry).toLowerCase(); }).indexOf(tag) === -1) return false;
        if (status && String(r.workflowStatus || "").toLowerCase() !== status) return false;
        if (state.filters.yearFrom && (!Number.isFinite(rowYear) || rowYear < yearFrom)) return false;
        if (state.filters.yearTo && (!Number.isFinite(rowYear) || rowYear > yearTo)) return false;
        if (hasAttachment === "yes" && !r.hasAttachment) return false;
        if (hasAttachment === "no" && r.hasAttachment) return false;
        return true;
      });
    }
    if (state.sortKey) {
      var dir = state.sortDir === "asc" ? 1 : -1;
      rows = rows.slice().sort(function (a, b) {
        var col = columns().filter(function (c) { return c.key === state.sortKey; })[0] || {};
        var va = col.type === "number" ? Number(a[state.sortKey] || 0) : String(a[state.sortKey] || "").toLowerCase();
        var vb = col.type === "number" ? Number(b[state.sortKey] || 0) : String(b[state.sortKey] || "").toLowerCase();
        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
        if (Number(a.itemID || 0) < Number(b.itemID || 0)) return -1;
        if (Number(a.itemID || 0) > Number(b.itemID || 0)) return 1;
        return 0;
      });
    }
    return rows;
  }

  var visibleColMeta = function () {
    var vk = state.visibleColumns;
    return columns().filter(function (c) { return vk.indexOf(c.key) !== -1; });
  };

  function uniqueValues(rows, getter) {
    var seen = [];
    rows.forEach(function (row) {
      var value = getter(row);
      if (Array.isArray(value)) {
        value.forEach(function (entry) {
          var text = String(entry || "").trim();
          if (text && seen.indexOf(text) === -1) seen.push(text);
        });
      } else {
        var text = String(value || "").trim();
        if (text && seen.indexOf(text) === -1) seen.push(text);
      }
    });
    return seen.sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }); });
  }

  function renderSelectOptions(select, label, values, selected) {
    if (!select) return;
    select.innerHTML = "<option value=\"\">" + escapeHtml(label) + "</option>" + values.map(function (value) {
      var isSelected = selected === value ? " selected=\"selected\"" : "";
      return "<option value=\"" + escapeHtml(value) + "\"" + isSelected + ">" + escapeHtml(value) + "</option>";
    }).join("");
  }

  function renderFilters() {
    var filters = $("#pm-filters");
    if (!filters) return;
    filters.hidden = !state.enhanced;
    if (!state.enhanced) return;
    renderSelectOptions($("#pm-filter-type"), "All types", uniqueValues(state.rows, function (r) { return r.itemType; }), state.filters.itemType);
    renderSelectOptions($("#pm-filter-tag"), "All tags", uniqueValues(state.rows, function (r) { return r.tags; }), state.filters.tag);
    renderSelectOptions($("#pm-filter-status"), "All statuses", uniqueValues(state.rows, function (r) { return r.workflowStatus; }), state.filters.workflowStatus);
    if ($("#pm-filter-year-from")) $("#pm-filter-year-from").value = state.filters.yearFrom;
    if ($("#pm-filter-year-to")) $("#pm-filter-year-to").value = state.filters.yearTo;
    if ($("#pm-filter-attachment")) $("#pm-filter-attachment").value = state.filters.hasAttachment;
  }

  function renderTable() {
    var thead = $("#pm-thead");
    var tbody = $("#pm-tbody");
    var empty = $("#pm-empty");
    if (!thead || !tbody) return;

    var cols = visibleColMeta();
    thead.innerHTML = "<tr>" + cols.map(function (c) {
      var arrow = state.sortKey === c.key ? (state.sortDir === "asc" ? " ▲" : " ▼") : "";
      return "<th data-key=\"" + c.key + "\" style=\"width:" + c.width + "px\">" + escapeHtml(c.label) + arrow + "</th>";
    }).join("") + "</tr>";

    var rows = filteredRows();
    tbody.innerHTML = rows.length === 0
      ? ""
      : rows.map(function (r) {
          return "<tr data-item-id=\"" + escapeHtml(r.itemID) + "\">" + cols.map(function (c) {
            return "<td>" + escapeHtml(String(r[c.key] || "")) + "</td>";
          }).join("") + "</tr>";
        }).join("");

    if (empty) empty.hidden = rows.length > 0 || state.rows.length > 0;

    var stat = $("#pm-stat-summary");
    if (stat) {
      var filtered = rows.length !== state.rows.length || q();
      stat.textContent = rows.length + " papers" + (filtered ? " (filtered from " + state.rows.length + ")" : "");
    }
  }

  function renderColumnsPanel() {
    var panel = $("#pm-columns-toggles");
    if (!panel) return;
    panel.textContent = "";
    columns().forEach(function (c) {
      var label = document.createElement("label");
      var input = document.createElement("input");
      label.className = "pm-col-toggle";
      input.type = "checkbox";
      input.dataset.key = c.key;
      input.checked = state.visibleColumns.indexOf(c.key) !== -1;
      label.appendChild(input);
      label.appendChild(document.createTextNode(" " + c.label));
      panel.appendChild(label);
    });
  }

  function q() { return state.search.toLowerCase().trim(); }

  function exportCSV() {
    var cols = visibleColMeta();
    var rows = filteredRows();
    if (rows.length === 0) return;
    var header = cols.map(function (c) { return c.label; }).join(",");
    var body = rows.map(function (r) {
      return cols.map(function (c) {
        var v = String(r[c.key] || "").replace(/"/g, "\"\"");
        return v.indexOf(",") !== -1 || v.indexOf("\"") !== -1 ? "\"" + v + "\"" : v;
      }).join(",");
    }).join("\n");
    var csv = "﻿" + header + "\n" + body;
    var blob = new Blob([csv], { type: "text/csv;charset=UTF-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "toolsbox-matrix-" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function mount(payload) {
    state.rows = payload?.rows || [];
    state.enhanced = payload?.enhanced === true;
    state.theme = payload?.theme || "light";
    state.search = "";
    state.sortKey = null;
    state.sortDir = "asc";
    state.filters = {
      itemType: "",
      tag: "",
      workflowStatus: "",
      yearFrom: "",
      yearTo: "",
      hasAttachment: "",
    };
    state.visibleColumns = defaultVisibleColumns();
    document.documentElement.setAttribute("data-paper-matrix-enhanced", state.enhanced ? "true" : "false");
    if ($("#pm-search")) $("#pm-search").value = "";
    renderFilters();
    renderColumnsPanel();
    renderTable();
  }

  // Event bindings
  $("#pm-thead") && $("#pm-thead").addEventListener("click", function (evt) {
    var th = evt.target.closest("th");
    if (!th) return;
    var key = th.dataset.key;
    if (state.sortKey === key) {
      state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
    } else {
      state.sortKey = key;
      state.sortDir = "asc";
    }
    renderTable();
  });

  $("#pm-search") && $("#pm-search").addEventListener("input", function () {
    state.search = $("#pm-search").value;
    renderTable();
  });

  $("#pm-btn-columns") && $("#pm-btn-columns").addEventListener("click", function () {
    var panel = $("#pm-columns-panel");
    if (panel) panel.hidden = !panel.hidden;
  });

  $("#pm-columns-toggles") && $("#pm-columns-toggles").addEventListener("change", function (evt) {
    if (evt.target.type !== "checkbox") return;
    var key = evt.target.dataset.key;
    var idx = state.visibleColumns.indexOf(key);
    if (evt.target.checked && idx === -1) {
      state.visibleColumns.push(key);
    } else if (!evt.target.checked && idx !== -1) {
      state.visibleColumns.splice(idx, 1);
    }
    renderTable();
  });

  function bindFilter(selector, key) {
    $(selector) && $(selector).addEventListener("input", function (evt) {
      state.filters[key] = evt.target.value;
      renderTable();
    });
    $(selector) && $(selector).addEventListener("change", function (evt) {
      state.filters[key] = evt.target.value;
      renderTable();
    });
  }

  bindFilter("#pm-filter-type", "itemType");
  bindFilter("#pm-filter-tag", "tag");
  bindFilter("#pm-filter-status", "workflowStatus");
  bindFilter("#pm-filter-year-from", "yearFrom");
  bindFilter("#pm-filter-year-to", "yearTo");
  bindFilter("#pm-filter-attachment", "hasAttachment");

  $("#pm-btn-clear-filters") && $("#pm-btn-clear-filters").addEventListener("click", function () {
    state.filters = {
      itemType: "",
      tag: "",
      workflowStatus: "",
      yearFrom: "",
      yearTo: "",
      hasAttachment: "",
    };
    renderFilters();
    renderTable();
  });

  $("#pm-btn-export") && $("#pm-btn-export").addEventListener("click", exportCSV);

  window[bridgeKey] = {
    mount: mount,
    unmount: function () {
      state.rows = [];
      state.enhanced = false;
      state.filters = {
        itemType: "",
        tag: "",
        workflowStatus: "",
        yearFrom: "",
        yearTo: "",
        hasAttachment: "",
      };
      state.visibleColumns = defaultVisibleColumns();
      renderFilters();
      renderColumnsPanel();
      renderTable();
    },
    getSnapshot: function () {
      return {
        enhanced: state.enhanced,
        rowCount: state.rows.length,
        filteredRowCount: filteredRows().length,
        visibleColumns: state.visibleColumns.slice(),
        filters: Object.assign({}, state.filters),
      };
    },
  };
})();
