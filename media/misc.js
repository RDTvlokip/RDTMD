/* RDTMD : mindmap (couleurs de branche, repli au clic) et quadrant. */
(function () {
  'use strict';
  const K = window.RDTKit;
  const { s, textW, palette, sizeSvg, rectsHit } = K;

  /* ====================================================================== */
  /* mindmap                                                                 */
  /* ====================================================================== */

  function renderMindmap(n) {
    if (!n.root) return null;
    const key = 'mm:' + n.line + ':' + (n.title || '');
    if (!K.ui.has(key)) K.ui.set(key, new Set());
    const collapsed = K.ui.get(key);
    const pal = palette(n);

    function build() {
      const root = n.root;
      const shown = (node, path) => (collapsed.has(path) ? [] : node.children || []);
      const leafCache = new Map();
      const leaves = (node, path) => {
        const kids = shown(node, path);
        if (!kids.length) return 1;
        let t = leafCache.get(path);
        if (t === undefined) { t = kids.reduce((a, c, i) => a + leaves(c, path + '.' + i), 0); leafCache.set(path, t); }
        return t;
      };

      const LEAF_H = 38, NODE_PX = 12.5, ROOT_PX = 13.5;
      const branches = root.children || [];
      let rightB = [], leftB = [];
      const items = branches.map((b, i) => ({ b, i, path: '0.' + i }));
      if (items.length <= 1) rightB = items;
      else {
        const sizes = [0, 0];
        items.forEach((it) => {
          const side = sizes[0] <= sizes[1] ? 0 : 1;
          sizes[side] += leaves(it.b, it.path);
          (side === 0 ? rightB : leftB).push(it);
        });
      }
      const sideLeaves = (list) => list.reduce((a, it) => a + leaves(it.b, it.path), 0);
      const totalH = Math.max(1, sideLeaves(rightB), sideLeaves(leftB)) * LEAF_H;
      const rootY = totalH / 2;
      const rootW = Math.max(90, Math.ceil(textW(root.text, ROOT_PX, 700) + 36)), rootH = 40;

      const nodes = [{ x: 0, y: rootY, w: rootW, h: rootH, text: root.text, isRoot: true, path: '0', kids: 0, hidden: 0 }];
      const edges = [];
      const countAll = (node) => (node.children || []).reduce((a, c) => a + 1 + countAll(c), 0);

      function place(node, path, level, startY, anchorX, anchorY, isRight, color) {
        const nH = leaves(node, path) * LEAF_H, y = startY + nH / 2;
        const w = Math.max(64, Math.ceil(textW(node.text, NODE_PX) + 26)), hh = level === 1 ? 32 : 28;
        const gapX = level === 1 ? 64 : 38;
        const x = isRight ? anchorX + gapX + w / 2 : anchorX - gapX - w / 2;
        const col = node.color || color;
        const kids = node.children || [];
        nodes.push({
          x, y, w, h: hh, text: node.text, isRoot: false, color: col, path, kids: kids.length, hidden: collapsed.has(path) ? countAll(node) : 0,
        });
        edges.push({ x1: anchorX, y1: anchorY, x2: isRight ? x - w / 2 : x + w / 2, y2: y, color: col });
        let childY = startY;
        shown(node, path).forEach((c, i) => {
          place(c, path + '.' + i, level + 1, childY, isRight ? x + w / 2 : x - w / 2, y, isRight, col);
          childY += leaves(c, path + '.' + i) * LEAF_H;
        });
      }
      function layoutSide(list, isRight) {
        const sideH = sideLeaves(list);
        let curY = rootY - sideH / 2;
        list.forEach((it) => {
          place(it.b, it.path, 1, curY, isRight ? rootW / 2 : -rootW / 2, rootY, isRight, it.b.color || pal[it.i % pal.length]);
          curY += leaves(it.b, it.path) * LEAF_H;
        });
      }
      layoutSide(rightB, true);
      layoutSide(leftB, false);

      let minX = -rootW / 2, maxX = rootW / 2, minY = rootY - rootH / 2, maxY = rootY + rootH / 2;
      nodes.forEach((nd) => {
        minX = Math.min(minX, nd.x - nd.w / 2); maxX = Math.max(maxX, nd.x + nd.w / 2 + (nd.hidden ? 26 : 0));
        minY = Math.min(minY, nd.y - nd.h / 2); maxY = Math.max(maxY, nd.y + nd.h / 2);
      });
      const pad = 24;
      const vbW = Math.ceil(maxX - minX + pad * 2), vbH = Math.ceil(maxY - minY + pad * 2);
      const svg = s('svg', { viewBox: [Math.floor(minX - pad), Math.floor(minY - pad), vbW, vbH].join(' '), class: 'diagram-svg', role: 'img' });
      sizeSvg(svg, vbW, vbH, 0.7, 1.15, n);

      edges.forEach((e) => {
        const dx = (e.x2 - e.x1) * 0.5;
        svg.append(s('path', {
          d: 'M ' + e.x1 + ' ' + e.y1 + ' C ' + (e.x1 + dx) + ' ' + e.y1 + ', ' + (e.x2 - dx) + ' ' + e.y2 + ', ' + e.x2 + ' ' + e.y2,
          class: 'mindmap-edge', stroke: e.color, fill: 'none', 'stroke-width': 2.2,
        }));
      });
      nodes.forEach((nd) => {
        const g = s('g', { class: 'mindmap-node' + (nd.isRoot ? ' root' : '') + (nd.kids ? ' has-kids' : ''), 'data-path': nd.kids ? nd.path : null });
        const rect = s('rect', {
          x: nd.x - nd.w / 2, y: nd.y - nd.h / 2, width: nd.w, height: nd.h, rx: nd.isRoot ? 10 : 6, class: 'mindmap-box' + (nd.isRoot ? ' root' : ''),
        });
        if (!nd.isRoot) rect.setAttribute('stroke', nd.color);
        g.append(rect);
        g.append(s('text', { x: nd.x, y: nd.y + 4.5, class: 'mindmap-text' + (nd.isRoot ? ' root' : ''), 'text-anchor': 'middle', text: nd.text }));
        if (nd.hidden) {
          const bx = nd.x + nd.w / 2 + (nd.x >= 0 ? 12 : -12);
          g.append(s('circle', { cx: bx, cy: nd.y, r: 10, fill: nd.color, 'fill-opacity': 0.9 }));
          g.append(s('text', { x: bx, y: nd.y + 4, class: 'mindmap-badge', 'text-anchor': 'middle', text: '+' + nd.hidden }));
        }
        g.append(s('title', { text: nd.text + (nd.kids ? ' (clic : ' + (nd.hidden ? 'déplier' : 'replier') + ')' : '') }));
        svg.append(g);
      });
      return svg;
    }

    function make() {
      const svg = build();
      svg.addEventListener('click', (ev) => {
        const g = ev.target.closest && ev.target.closest('.mindmap-node[data-path]');
        if (!g) return;
        const p = g.getAttribute('data-path');
        if (collapsed.has(p)) collapsed.delete(p); else collapsed.add(p);
        svg.replaceWith(make());
      });
      return svg;
    }
    return make();
  }

  /* ====================================================================== */
  /* quadrant                                                                */
  /* ====================================================================== */

  function renderQuadrant(n) {
    const pts = n.points || [];
    const pal = palette(n);
    const SIZE = 420, X0 = 78, Y0 = 34, W = X0 + SIZE + 30, H = Y0 + SIZE + 64;
    const svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'diagram-svg', role: 'img' });
    sizeSvg(svg, W, H, 0.7, 1.15, n);

    const qs = [[0, 0], [1, 0], [0, 1], [1, 1]]; // haut-gauche, haut-droite, bas-gauche, bas-droite
    qs.forEach(([cx, cy], i) => {
      svg.append(s('rect', { x: X0 + cx * SIZE / 2, y: Y0 + cy * SIZE / 2, width: SIZE / 2, height: SIZE / 2, fill: pal[i % pal.length], 'fill-opacity': 0.09, class: 'quad-cell' }));
      const name = (n.quadrants || [])[i];
      if (name) {
        const right = cx === 1, bottom = cy === 1;
        svg.append(s('text', {
          x: X0 + cx * SIZE / 2 + (right ? SIZE / 2 - 10 : 10), y: Y0 + cy * SIZE / 2 + (bottom ? SIZE / 2 - 12 : 22),
          class: 'quad-name', 'text-anchor': right ? 'end' : 'start', fill: pal[i % pal.length], text: name,
        }));
      }
    });
    svg.append(s('rect', { x: X0, y: Y0, width: SIZE, height: SIZE, class: 'quad-frame', fill: 'none' }));
    svg.append(s('line', { x1: X0 + SIZE / 2, x2: X0 + SIZE / 2, y1: Y0, y2: Y0 + SIZE, class: 'quad-mid' }));
    svg.append(s('line', { x1: X0, x2: X0 + SIZE, y1: Y0 + SIZE / 2, y2: Y0 + SIZE / 2, class: 'quad-mid' }));

    const xa = n.xAxis || {}, ya = n.yAxis || {};
    const by = Y0 + SIZE + 22;
    if (xa.low) svg.append(s('text', { x: X0, y: by, class: 'quad-axis-end', text: xa.low }));
    if (xa.high) svg.append(s('text', { x: X0 + SIZE, y: by, class: 'quad-axis-end', 'text-anchor': 'end', text: xa.high + ' →' }));
    if (xa.label) svg.append(s('text', { x: X0 + SIZE / 2, y: by + 22, class: 'quad-axis', 'text-anchor': 'middle', text: xa.label }));
    const rot = (x, y, t, cls, anchor) => svg.append(s('text', { x, y, class: cls, 'text-anchor': anchor, transform: 'rotate(-90 ' + x + ' ' + y + ')', text: t }));
    if (ya.low) rot(X0 - 14, Y0 + SIZE, ya.low, 'quad-axis-end', 'start');
    if (ya.high) rot(X0 - 14, Y0, ya.high + ' →', 'quad-axis-end', 'end');
    if (ya.label) rot(X0 - 36, Y0 + SIZE / 2, ya.label, 'quad-axis', 'middle');

    const placed = [];
    const FS = 12.5;
    pts.forEach((p) => {
      const px = X0 + p.x * SIZE, py = Y0 + (1 - p.y) * SIZE;
      const qi = (p.y > 0.5 ? 0 : 2) + (p.x > 0.5 ? 1 : 0);
      const col = pal[qi % pal.length];
      const w = Math.ceil(textW(p.name, FS)) + 8, hh = 18;
      const cands = [
        { x: px + 11, y: py - hh / 2, a: 'start' }, { x: px - 11 - w, y: py - hh / 2, a: 'end' },
        { x: px - w / 2, y: py - 11 - hh, a: 'middle' }, { x: px - w / 2, y: py + 11, a: 'middle' },
      ];
      let best = null;
      for (const c of cands) {
        const box = { x: c.x, y: c.y, w, h: hh };
        const out = box.x < X0 - 4 || box.x + w > X0 + SIZE + 4 || box.y < Y0 - 4 || box.y + hh > Y0 + SIZE + 4;
        if (!out && !placed.some((r) => rectsHit(box, r, 2))) { best = { c, box }; break; }
        if (!best && !out) best = { c, box };
      }
      if (!best) best = { c: cands[0], box: { x: cands[0].x, y: cands[0].y, w, h: hh } };
      placed.push(best.box, { x: px - 7, y: py - 7, w: 14, h: 14 });
      const g = s('g', { class: 'quad-point', 'data-id': p.name });
      g.append(s('circle', { cx: px, cy: py, r: 7, fill: col, class: 'quad-dot' }));
      const tx = best.c.a === 'start' ? best.box.x + 4 : best.c.a === 'end' ? best.box.x + w - 4 : best.box.x + w / 2;
      g.append(s('text', { x: tx, y: best.box.y + 13, class: 'quad-label', 'text-anchor': best.c.a, text: p.name }));
      g.append(s('title', { text: p.name + ' (' + p.x + ', ' + p.y + ')' }));
      svg.append(g);
    });
    return svg;
  }

  K.diagrams.mindmap = renderMindmap;
  K.diagrams.quadrant = renderQuadrant;
})();
