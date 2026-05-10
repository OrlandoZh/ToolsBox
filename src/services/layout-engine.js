/**
 * Layout Engine for Graph View
 * Supports force, tree, and circular layouts
 */

export function createLayoutEngine(options) {
  const { logger } = options;

  const SVG_NS = 'http://www.w3.org/2000/svg';

  function applyForceLayout(nodes, edges) {
    if (nodes.length === 0) return;
    
    const centerX = 400;
    const centerY = 300;
    const spread = 200;
    
    if (nodes.length === 1) {
      nodes[0].x = centerX;
      nodes[0].y = centerY;
      return;
    }

    nodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / nodes.length;
      const radius = spread * (0.5 + Math.random() * 0.5);
      node.x = centerX + radius * Math.cos(angle);
      node.y = centerY + radius * Math.sin(angle);
    });

    const iterations = 50;
    for (let iter = 0; iter < iterations; iter++) {
      nodes.forEach(node => {
        let vx = 0;
        let vy = 0;

        nodes.forEach(other => {
          if (node.id === other.id) return;
          
          const dx = node.x - other.x;
          const dy = node.y - other.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          
          const repulsion = 50 / dist;
          vx += (dx / dist) * repulsion;
          vy += (dy / dist) * repulsion;
        });

        edges.forEach(edge => {
          if (edge.source === node.id || edge.target === node.id) {
            const otherId = edge.source === node.id ? edge.target : edge.source;
            const other = nodes.find(n => n.id === otherId);
            if (other) {
              const dx = other.x - node.x;
              const dy = other.y - node.y;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              const attraction = dist * 0.01;
              vx += (dx / dist) * attraction;
              vy += (dy / dist) * attraction;
            }
          }
        });

        node.vx = vx * 0.1;
        node.vy = vy * 0.1;
      });

      nodes.forEach(node => {
        node.x += node.vx || 0;
        node.y += node.vy || 0;
        
        node.x = Math.max(50, Math.min(750, node.x));
        node.y = Math.max(50, Math.min(550, node.y));
      });
    }

    logger?.debug?.('layoutEngine.force.applied', { nodes: nodes.length, iterations });
  }

  function applyTreeLayout(nodes, edges) {
    if (nodes.length === 0) return;

    const centerX = 400;
    const startY = 50;
    const levelHeight = 100;
    const nodeSpacing = 150;

    const levels = {};
    nodes.forEach(node => {
      const level = node.level || 0;
      if (!levels[level]) levels[level] = [];
      levels[level].push(node);
    });

    const maxLevel = Math.max(...Object.keys(levels).map(Number), 0);

    for (let level = 0; level <= maxLevel; level++) {
      const levelNodes = levels[level] || [];
      const count = levelNodes.length;
      
      levelNodes.forEach((node, i) => {
        const offsetX = (count - 1) * nodeSpacing / 2;
        node.x = centerX - offsetX + i * nodeSpacing;
        node.y = startY + level * levelHeight;
      });
    }

    logger?.debug?.('layoutEngine.tree.applied', { nodes: nodes.length, levels: maxLevel + 1 });
  }

  function applyCircularLayout(nodes, edges) {
    if (nodes.length === 0) return;

    const centerX = 400;
    const centerY = 300;
    const radius = 200;

    const angleStep = (2 * Math.PI) / nodes.length;

    nodes.forEach((node, i) => {
      node.x = centerX + radius * Math.cos(i * angleStep);
      node.y = centerY + radius * Math.sin(i * angleStep);
    });

    logger?.debug?.('layoutEngine.circular.applied', { nodes: nodes.length, radius });
  }

  function applyLayout(layoutName, nodes, edges) {
    const layoutMap = {
      force: applyForceLayout,
      tree: applyTreeLayout,
      circular: applyCircularLayout
    };

    const layoutFn = layoutMap[layoutName];
    if (!layoutFn) {
      logger?.error?.('layoutEngine.invalid', { layout: layoutName });
      return false;
    }

    layoutFn(nodes, edges);
    logger?.debug?.('layoutEngine.applied', { layout: layoutName, nodes: nodes.length });
    return true;
  }

  function getAvailableLayouts() {
    return ['force', 'tree', 'circular'];
  }

  return {
    applyLayout,
    getAvailableLayouts
  };
}