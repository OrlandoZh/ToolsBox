(function () {
  "use strict";

  var bridgeKey = (document.documentElement.getAttribute("data-addon-ref") || "toolsbox")
    .replace(/-/g, "_");
  bridgeKey = "__" + bridgeKey + "_WorkbenchBridge__";
  var state = {
    entries: [],
    filter: "all",
    search: "",
    selectedIds: {},
    activeId: null,
    busy: false,
  };

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return Array.from(document.querySelectorAll(sel)); }

  var el = {
    root: $("#notes-manager-root"),
    statSummary: $("#nm-stat-summary"),
    filterTabs: $("#nm-filter-tabs"),
    search: $("#nm-search"),
    list: $("#nm-list"),
    batchBar: $("#nm-batch-bar"),
    batchCount: $("#nm-batch-count"),
    detail: $("#nm-detail"),
    emptyHint: $("#nm-empty-hint"),
    detailContent: $("#nm-detail-content"),
    detailType: $("#nm-detail-type"),
    detailParent: $("#nm-detail-parent"),
    detailMeta: $("#nm-detail-meta"),
    detailText: $("#nm-detail-text"),
  };

  function setStatSummary() {
    if (!el.statSummary) return;
    var total = state.entries.length;
    var notes = state.entries.filter(function (e) { return e.kind === "note"; }).length;
    var annotations = total - notes;
    el.statSummary.textContent = total + " entries (" + notes + " notes, " + annotations + " annotations)";
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function truncate(str, max) {
    var s = String(str || "");
    return s.length > max ? s.slice(0, max) + "..." : s;
  }

  function filteredEntries() {
    var f = state.filter;
    var q = state.search.toLowerCase().trim();
    return state.entries.filter(function (e) {
      if (f === "notes" && e.kind !== "note") return false;
      if (f === "annotations" && e.kind !== "annotation") return false;
      if (q && e.text.toLowerCase().indexOf(q) === -1 && e.parentTitle.toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }

  function renderList() {
    if (!el.list) return;
    var entries = filteredEntries();
    el.list.innerHTML = entries.length === 0
      ? "<p class=\"nm-list-empty\">No entries match the current filter.</p>"
      : entries.map(function (e) {
          var sel = state.selectedIds[e.id] ? " selected" : "";
          var active = state.activeId === e.id ? " active" : "";
          var kindLabel = e.kind === "note" ? "Note" : "Annotation";
          var preview = truncate(e.text.replace(/\s+/g, " "), 100);
          return "<div class=\"nm-list-item" + sel + active + "\" data-id=\"" + escapeHtml(e.id) + "\">"
            + "<span class=\"nm-list-kind\">" + kindLabel + "</span>"
            + "<span class=\"nm-list-parent\">" + escapeHtml(truncate(e.parentTitle, 40)) + "</span>"
            + "<span class=\"nm-list-preview\">" + escapeHtml(preview) + "</span>"
            + "</div>";
        }).join("");
  }

  function renderDetail() {
    if (!el.detailContent || !el.emptyHint) return;
    if (!state.activeId) {
      el.detailContent.hidden = true;
      el.emptyHint.hidden = false;
      return;
    }
    var e = state.entries.find(function (x) { return x.id === state.activeId; });
    if (!e) {
      el.detailContent.hidden = true;
      el.emptyHint.hidden = false;
      return;
    }
    el.emptyHint.hidden = true;
    el.detailContent.hidden = false;
    el.detailType.textContent = e.kind === "note" ? "Note" : (e.kind === "annotation" ? "Annotation" : "Entry");
    el.detailParent.textContent = e.parentTitle || "";
    el.detailMeta.innerHTML = e.dateAdded ? "<span>Added: " + escapeHtml(e.dateAdded) + "</span>" : "";
    if (e.pageLabel) {
      el.detailMeta.innerHTML += "<span>Page: " + escapeHtml(e.pageLabel) + "</span>";
    }
    if (e.color) {
      el.detailMeta.innerHTML += "<span>Color: " + escapeHtml(e.color) + "</span>";
    }
    if (e.tags && e.tags.length) {
      el.detailMeta.innerHTML += "<span>Tags: " + escapeHtml(e.tags.join(", ")) + "</span>";
    }
    el.detailText.textContent = e.text || "";
    var detailParentItem = $("#nm-detail-parent");
    if (detailParentItem) {
      detailParentItem.title = "Parent Item ID: " + (e.parentItemID || "");
    }
  }

  function updateBatchBar() {
    var count = Object.keys(state.selectedIds).length;
    if (!el.batchBar || !el.batchCount) return;
    el.batchBar.hidden = count === 0;
    el.batchCount.textContent = count + " selected";
  }

  function setFilter(filter) {
    state.filter = filter;
    state.activeId = null;
    state.selectedIds = {};
    $$(".nm-filter-tab").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.filter === filter);
    });
    renderList();
    renderDetail();
    updateBatchBar();
  }

  function mountPayload(payload) {
    state.entries = Array.isArray(payload?.entries) ? payload.entries : [];
    state.filter = "all";
    state.search = "";
    state.selectedIds = {};
    state.activeId = null;
    if (el.search) {
      el.search.value = "";
    }
    setStatSummary();
    renderList();
    renderDetail();
    updateBatchBar();
  }

  // Event bindings
  el.filterTabs && el.filterTabs.addEventListener("click", function (evt) {
    var btn = evt.target.closest(".nm-filter-tab");
    if (!btn) return;
    setFilter(btn.dataset.filter);
  });

  el.search && el.search.addEventListener("input", function () {
    state.search = el.search.value;
    renderList();
  });

  el.list && el.list.addEventListener("click", function (evt) {
    var item = evt.target.closest(".nm-list-item");
    if (!item) return;
    if (evt.ctrlKey || evt.metaKey) {
      var id = item.dataset.id;
      if (state.selectedIds[id]) {
        delete state.selectedIds[id];
      } else {
        state.selectedIds[id] = true;
      }
      renderList();
      updateBatchBar();
    } else {
      state.activeId = item.dataset.id;
      renderList();
      renderDetail();
    }
  });

  $("#nm-batch-delete") && $("#nm-batch-delete").addEventListener("click", function () {
    var ids = Object.keys(state.selectedIds);
    if (ids.length === 0 || !confirm("Delete " + ids.length + " selected entries?")) return;
    state.entries = state.entries.filter(function (e) { return !state.selectedIds[e.id]; });
    state.selectedIds = {};
    state.activeId = null;
    setStatSummary();
    renderList();
    renderDetail();
    updateBatchBar();
  });

  $("#nm-batch-tag") && $("#nm-batch-tag").addEventListener("click", function () {
    var tag = prompt("Enter tag name to add to " + Object.keys(state.selectedIds).length + " entries:");
    if (!tag) return;
    for (var id in state.selectedIds) {
      var entry = state.entries.find(function (e) { return e.id === id; });
      if (entry && entry.tags.indexOf(tag) === -1) {
        entry.tags.push(tag);
      }
    }
    state.selectedIds = {};
    renderList();
    renderDetail();
    updateBatchBar();
  });

  $("#nm-batch-export") && $("#nm-batch-export").addEventListener("click", function () {
    var ids = Object.keys(state.selectedIds);
    var entries = state.entries.filter(function (e) { return ids.indexOf(e.id) !== -1; });
    if (entries.length === 0) return;
    var md = entries.map(function (e) {
      var kind = e.kind === "note" ? "Note" : "Annotation";
      return "## " + kind + " from " + (e.parentTitle || "unknown") + "\n\n"
        + (e.pageLabel ? "_Page " + e.pageLabel + "_  \n" : "")
        + (e.dateAdded ? "_" + e.dateAdded + "_  \n" : "")
        + "\n" + e.text + "\n\n---\n";
    }).join("\n");
    var blob = new Blob(["﻿" + md], { type: "text/markdown;charset=UTF-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "toolsbox-export-" + new Date().toISOString().slice(0, 10) + ".md";
    a.click();
    URL.revokeObjectURL(url);
  });

  $("#nm-detail-delete") && $("#nm-detail-delete").addEventListener("click", function () {
    if (!state.activeId || !confirm("Delete this entry?")) return;
    state.entries = state.entries.filter(function (e) { return e.id !== state.activeId; });
    state.activeId = null;
    setStatSummary();
    renderList();
    renderDetail();
  });

  window[bridgeKey] = {
    mount: function (payload) {
      mountPayload(payload);
    },
    unmount: function () {
      state.entries = [];
      state.selectedIds = {};
      state.activeId = null;
    },
  };
})();
