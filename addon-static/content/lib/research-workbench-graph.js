(function () {
  "use strict";

  var bridgeKey = (document.documentElement.getAttribute("data-addon-ref") || "toolsbox")
    .replace(/-/g, "_");
  bridgeKey = "__" + bridgeKey + "_WorkbenchBridge__";

  var NODE_RADIUS = 22;
  var REPULSION = 8000;
  var ATTRACTION = 0.005;
  var CENTER_GRAVITY = 0.003;
  var DAMPING = 0.85;
  var MAX_VELOCITY = 8;
  var MIN_ENERGY = 0.5;

  var COLORS = {
    "journalArticle": "#4a90d9",
    "article": "#4a90d9",
    "book": "#7cb342",
    "bookSection": "#7cb342",
    "attachment": "#ff9800",
    "note": "#ff9800",
    "unknown": "#9c27b0",
    "root": "#e53935",
  };

  var state = {
    graph: { nodes: [], edges: [] },
    rootItemID: null,
    theme: "light",
    zoom: 1,
    panX: 0,
    panY: 0,
    canvasWidth: 800,
    canvasHeight: 600,
    dragNode: null,
    dragStartX: 0,
    dragStartY: 0,
    isDragging: false,
    isPanning: false,
    panStartX: 0,
    panStartY: 0,
    selectedNode: null,
    animating: false,
    rafId: null,
    energy: 0,
  };

  function $(sel) { return document.querySelector(sel); }

  function normGraph(nodes, edges) {
    return {
      nodes: (nodes || []).map(function (n, i) {
        return {
          id: n.id || ("n" + i),
          label: n.label || "",
          type: n.type || "unknown",
          x: n.x || (Math.random() * 300 + 200),
          y: n.y || (Math.random() * 300 + 150),
          vx: 0,
          vy: 0,
          fixed: false,
        };
      }),
      edges: (edges || []).map(function (e) {
        return {
          source: e.source || "",
          target: e.target || "",
          label: e.label || "related",
        };
      }),
    };
  }

  function hasGraphData() {
    return state.graph.nodes.length > 0;
  }

  function initPositions() {
    var cx = state.canvasWidth / 2;
    var cy = state.canvasHeight / 2;
    var nodes = state.graph.nodes;
    var count = nodes.length;
    if (count === 0) return;
    if (count === 1) {
      nodes[0].x = cx;
      nodes[0].y = cy;
      return;
    }
    var radius = Math.min(cx, cy) * 0.5;
    nodes.forEach(function (n, i) {
      var angle = (2 * Math.PI * i) / count - Math.PI / 2;
      n.x = cx + radius * Math.cos(angle);
      n.y = cy + radius * Math.sin(angle);
      n.vx = 0;
      n.vy = 0;
    });
  }

  function applyForces() {
    var nodes = state.graph.nodes;
    var edges = state.graph.edges;
    var n = nodes.length;
    if (n === 0) return 0;

    var nodeMap = {};
    nodes.forEach(function (nd) { nodeMap[nd.id] = nd; });

    // Coulomb repulsion between all pairs
    for (var i = 0; i < n; i++) {
      for (var j = i + 1; j < n; j++) {
        var a = nodes[i];
        var b = nodes[j];
        var dx = b.x - a.x;
        var dy = b.y - a.y;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        var force = REPULSION / (dist * dist);
        var fx = (dx / dist) * force;
        var fy = (dy / dist) * force;
        if (!a.fixed) { a.vx -= fx; a.vy -= fy; }
        if (!b.fixed) { b.vx += fx; b.vy += fy; }
      }
    }

    // Hooke attraction along edges
    for (var e = 0; e < edges.length; e++) {
      var edge = edges[e];
      var s = nodeMap[edge.source];
      var t = nodeMap[edge.target];
      if (!s || !t) continue;
      var dx = t.x - s.x;
      var dy = t.y - s.y;
      var dist = Math.sqrt(dx * dx + dy * dy) || 1;
      var force = ATTRACTION * (dist - 120);
      var fx = (dx / dist) * force;
      var fy = (dy / dist) * force;
      if (!s.fixed) { s.vx += fx; s.vy += fy; }
      if (!t.fixed) { t.vx -= fx; t.vy -= fy; }
    }

    // Center gravity
    var cx = state.canvasWidth / 2;
    var cy = state.canvasHeight / 2;
    var totalEnergy = 0;
    for (var k = 0; k < n; k++) {
      var node = nodes[k];
      if (node.fixed) continue;
      node.vx += (cx - node.x) * CENTER_GRAVITY;
      node.vy += (cy - node.y) * CENTER_GRAVITY;
      // Clamp velocity
      var speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
      if (speed > MAX_VELOCITY) {
        node.vx = (node.vx / speed) * MAX_VELOCITY;
        node.vy = (node.vy / speed) * MAX_VELOCITY;
      }
      node.x += node.vx;
      node.y += node.vy;
      node.vx *= DAMPING;
      node.vy *= DAMPING;
      totalEnergy += speed * speed;
    }
    return totalEnergy;
  }

  function drawGraph() {
    var canvas = $("#rg-canvas");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    var dpr = window.devicePixelRatio || 1;
    canvas.width = state.canvasWidth * dpr;
    canvas.height = state.canvasHeight * dpr;
    canvas.style.width = state.canvasWidth + "px";
    canvas.style.height = state.canvasHeight + "px";
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, state.canvasWidth, state.canvasHeight);

    // Apply transform
    ctx.save();
    ctx.translate(state.panX, state.panY);
    ctx.scale(state.zoom, state.zoom);

    // Draw edges
    var nodeMap = {};
    state.graph.nodes.forEach(function (n) { nodeMap[n.id] = n; });

    state.graph.edges.forEach(function (edge) {
      var s = nodeMap[edge.source];
      var t = nodeMap[edge.target];
      if (!s || !t) return;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.strokeStyle = state.theme === "dark" ? "#666" : "#bbb";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Arrowhead
      var dx = t.x - s.x;
      var dy = t.y - s.y;
      var dist = Math.sqrt(dx * dx + dy * dy) || 1;
      var ux = dx / dist;
      var uy = dy / dist;
      var arrowLen = 8;
      var arrowAngle = 0.5;
      var ax = t.x - ux * (NODE_RADIUS + 3);
      var ay = t.y - uy * (NODE_RADIUS + 3);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax - ux * arrowLen + uy * arrowLen * Math.sin(arrowAngle), ay - uy * arrowLen - ux * arrowLen * Math.sin(arrowAngle));
      ctx.lineTo(ax - ux * arrowLen - uy * arrowLen * Math.sin(arrowAngle), ay - uy * arrowLen + ux * arrowLen * Math.sin(arrowAngle));
      ctx.closePath();
      ctx.fillStyle = state.theme === "dark" ? "#888" : "#999";
      ctx.fill();

      // Edge label
      var mx = (s.x + t.x) / 2;
      var my = (s.y + t.y) / 2 - 8;
      ctx.fillStyle = state.theme === "dark" ? "#999" : "#888";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(edge.label, mx, my);
    });

    // Draw nodes
    state.graph.nodes.forEach(function (node) {
      var isRoot = node.id === state.rootItemID;
      var isSelected = state.selectedNode && state.selectedNode.id === node.id;
      var color = isRoot ? COLORS.root : (COLORS[node.type] || COLORS.unknown);

      // Shadow for selected
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, NODE_RADIUS + 4, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(74, 144, 217, 0.3)";
        ctx.fill();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, NODE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = isRoot ? COLORS.root : (node.fixed ? "#666" : color);
      ctx.fill();
      ctx.strokeStyle = state.theme === "dark" ? "#444" : "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      ctx.fillStyle = state.theme === "dark" ? "#e0e0e0" : "#1c1c1c";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      var label = String(node.label || node.id || "").slice(0, 20);
      ctx.fillText(label, node.x, node.y + NODE_RADIUS + 14);
    });

    ctx.restore();
  }

  function tick() {
    if (!state.animating) return;
    var energy = applyForces();
    drawGraph();
    if (state.selectedNode) {
      renderDetail(state.selectedNode);
    }
    if (energy < MIN_ENERGY) {
      stopAnimation();
      drawGraph();
      return;
    }
    state.rafId = requestAnimationFrame(tick);
  }

  function startAnimation() {
    if (state.animating) return;
    state.animating = true;
    state.rafId = requestAnimationFrame(tick);
  }

  function stopAnimation() {
    state.animating = false;
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }
  }

  function resizeCanvas() {
    var wrap = $("#rg-canvas-wrap");
    if (!wrap) return;
    state.canvasWidth = wrap.clientWidth;
    state.canvasHeight = wrap.clientHeight;
    drawGraph();
  }

  function screenToWorld(sx, sy) {
    var canvas = $("#rg-canvas");
    if (!canvas) return { x: sx, y: sy };
    var rect = canvas.getBoundingClientRect();
    return {
      x: (sx - rect.left - state.panX) / state.zoom,
      y: (sy - rect.top - state.panY) / state.zoom,
    };
  }

  function hitTest(wx, wy) {
    var nodes = state.graph.nodes;
    for (var i = nodes.length - 1; i >= 0; i--) {
      var node = nodes[i];
      var dx = wx - node.x;
      var dy = wy - node.y;
      if (dx * dx + dy * dy <= NODE_RADIUS * NODE_RADIUS) {
        return node;
      }
    }
    return null;
  }

  function renderDetail(node) {
    var content = $("#rg-detail-content");
    if (!content) return;
    if (!node) {
      content.innerHTML = "<p class=\"rg-detail-hint\">Click a node to view details.</p>";
      return;
    }
    var isRoot = node.id === state.rootItemID;
    content.innerHTML =
      "<div class=\"rg-detail-node\">"
      + "<h3>" + escapeHtml(String(node.label || "Node").slice(0, 60)) + "</h3>"
      + "<p class=\"rg-detail-meta\">Type: " + escapeHtml(node.type) + (isRoot ? " (root)" : "") + "</p>"
      + "<p class=\"rg-detail-meta\">ID: " + escapeHtml(node.id) + "</p>"
      + "</div>";
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setStats() {
    var stats = $("#rg-stats");
    if (!stats) return;
    stats.textContent = hasGraphData()
      ? state.graph.nodes.length + " items, " + state.graph.edges.length + " connections"
      : "No graph data";
  }

  function mount(payload) {
    var graphData = payload?.graph || { nodes: [], edges: [] };
    state.graph = normGraph(graphData.nodes, graphData.edges);
    state.rootItemID = payload?.rootItemID || null;
    state.theme = payload?.theme || "light";

    resizeCanvas();
    initPositions();
    setStats();
    var empty = $("#rg-empty");
    if (empty) empty.hidden = hasGraphData();
    drawGraph();
    if (hasGraphData()) {
      startAnimation();
    } else {
      stopAnimation();
      renderDetail(null);
    }
  }

  // ---- Event bindings ----
  $("#rg-canvas") && $("#rg-canvas").addEventListener("mousedown", function (evt) {
    var canvas = $("#rg-canvas");
    if (!canvas) return;
    var rect = canvas.getBoundingClientRect();
    var sx = evt.clientX - rect.left;
    var sy = evt.clientY - rect.top;
    var world = screenToWorld(sx, sy);

    // Right-click or ctrl+click = pan
    if (evt.button === 2 || evt.ctrlKey || evt.metaKey) {
      state.isPanning = true;
      state.panStartX = evt.clientX;
      state.panStartY = evt.clientY;
      return;
    }

    var hit = hitTest(world.x, world.y);
    if (hit) {
      state.dragNode = hit;
      state.isDragging = true;
      state.dragStartX = world.x - hit.x;
      state.dragStartY = world.y - hit.y;
      state.selectedNode = hit;
      hit.fixed = true;
      hit.vx = 0;
      hit.vy = 0;
      renderDetail(hit);
      drawGraph();
    } else {
      state.selectedNode = null;
      renderDetail(null);
      drawGraph();
      state.isPanning = true;
      state.panStartX = evt.clientX;
      state.panStartY = evt.clientY;
    }
  });

  window.addEventListener("mousemove", function (evt) {
    if (state.isDragging && state.dragNode) {
      var canvas = $("#rg-canvas");
      if (!canvas) return;
      var rect = canvas.getBoundingClientRect();
      var world = screenToWorld(evt.clientX - rect.left, evt.clientY - rect.top);
      state.dragNode.x = world.x - state.dragStartX;
      state.dragNode.y = world.y - state.dragStartY;
      drawGraph();
    } else if (state.isPanning) {
      state.panX += evt.clientX - state.panStartX;
      state.panY += evt.clientY - state.panStartY;
      state.panStartX = evt.clientX;
      state.panStartY = evt.clientY;
      drawGraph();
    }
  });

  window.addEventListener("mouseup", function () {
    if (state.dragNode) {
      state.dragNode.fixed = false;
      state.dragNode = null;
    }
    state.isDragging = false;
    state.isPanning = false;
  });

  $("#rg-canvas") && $("#rg-canvas").addEventListener("wheel", function (evt) {
    evt.preventDefault();
    var factor = evt.deltaY < 0 ? 1.1 : 0.9;
    var newZoom = Math.max(0.15, Math.min(3, state.zoom * factor));
    var canvas = $("#rg-canvas");
    if (!canvas) return;
    var rect = canvas.getBoundingClientRect();
    var mx = evt.clientX - rect.left;
    var my = evt.clientY - rect.top;
    state.panX = mx - (mx - state.panX) * (newZoom / state.zoom);
    state.panY = my - (my - state.panY) * (newZoom / state.zoom);
    state.zoom = newZoom;
    drawGraph();
  }, { passive: false });

  $("#rg-canvas") && $("#rg-canvas").addEventListener("contextmenu", function (evt) {
    evt.preventDefault();
  });

  $("#rg-btn-zoom-in") && $("#rg-btn-zoom-in").addEventListener("click", function () {
    state.zoom = Math.min(3, state.zoom * 1.25);
    drawGraph();
  });

  $("#rg-btn-zoom-out") && $("#rg-btn-zoom-out").addEventListener("click", function () {
    state.zoom = Math.max(0.15, state.zoom * 0.8);
    drawGraph();
  });

  $("#rg-btn-reset") && $("#rg-btn-reset").addEventListener("click", function () {
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
    state.selectedNode = null;
    initPositions();
    renderDetail(null);
    drawGraph();
    startAnimation();
  });

  window.addEventListener("resize", resizeCanvas);

  window[bridgeKey] = {
    mount: mount,
    unmount: function () {
      stopAnimation();
      state.graph = { nodes: [], edges: [] };
    },
  };
})();
