(function () {
  "use strict";

  var bridgeKey = (document.documentElement.getAttribute("data-addon-ref") || "toolsbox")
    .replace(/-/g, "_");
  bridgeKey = "__" + bridgeKey + "_WorkbenchBridge__";

  var COLUMNS = [
    { key: "title", label: "Title", width: 280, defaultVisible: true },
    { key: "creators", label: "Authors", width: 180, defaultVisible: true },
    { key: "year", label: "Year", width: 70, defaultVisible: true },
    { key: "publication", label: "Publication", width: 180, defaultVisible: true },
    { key: "dateAdded", label: "Date Added", width: 120, defaultVisible: true },
    { key: "dateModified", label: "Date Modified", width: 130, defaultVisible: false },
  ];

  var state = {
    rows: [],
    visibleColumns: COLUMNS.filter(function (c) { return c.defaultVisible; }).map(function (c) { return c.key; }),
    sortKey: null,
    sortDir: "asc",
    search: "",
    theme: "light",
  };

  function $(sel) { return document.querySelector(sel); }

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
        return COLUMNS.some(function (c) {
          return String(r[c.key] || "").toLowerCase().indexOf(q) !== -1;
        });
      });
    }
    if (state.sortKey) {
      var dir = state.sortDir === "asc" ? 1 : -1;
      rows = rows.slice().sort(function (a, b) {
        var va = String(a[state.sortKey] || "").toLowerCase();
        var vb = String(b[state.sortKey] || "").toLowerCase();
        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
        return 0;
      });
    }
    return rows;
  }

  var visibleColMeta = function () {
    var vk = state.visibleColumns;
    return COLUMNS.filter(function (c) { return vk.indexOf(c.key) !== -1; });
  };

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
    if (stat) stat.textContent = rows.length + " papers" + (q() ? " (filtered from " + state.rows.length + ")" : "");
  }

  function renderColumnsPanel() {
    var panel = $("#pm-columns-toggles");
    if (!panel) return;
    panel.innerHTML = COLUMNS.map(function (c) {
      var checked = state.visibleColumns.indexOf(c.key) !== -1 ? " checked" : "";
      return "<label class=\"pm-col-toggle\"><input type=\"checkbox\" data-key=\"" + c.key + "\"" + checked + "> " + escapeHtml(c.label) + "</label>";
    }).join("");
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
    state.theme = payload?.theme || "light";
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

  $("#pm-btn-export") && $("#pm-btn-export").addEventListener("click", exportCSV);

  window[bridgeKey] = {
    mount: mount,
    unmount: function () {
      state.rows = [];
    },
  };
})();
