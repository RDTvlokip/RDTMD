/* RDTMD : diagrammes de graphes (flow, state, er, class) sur un moteur de placement commun. */
(function () {
  'use strict';
  const K = window.RDTKit;
  const { h, s, textW, wrapText, ellipsize, palette, sizeSvg, bez, bezTangent, rectsHit, pathOf, addDefs } = K;

  const NODE_PX = 13, LINE_H = 16, LBL_PX = 11.5, LBL_H = 20;
  const lblW = (e) => Math.ceil(textW(e.label, LBL_PX)) + 16;

  /* ====================================================================== */
  /* Moteur de placement                                                     */
  /* ====================================================================== */

  /**
   * cfg : { ids, size(id) -> {w,h}, edges[{from,to,label}], dir, groups[{id,parent}], groupOf(id) }
   * Retourne les positions, la géométrie de chaque arête (courbe de Bézier + boîte d'étiquette),
   * les rectangles de groupes et le cadre englobant.
   */
  function layoutGraph(cfg) {
    const ids = cfg.ids;
    const isLR = cfg.dir !== 'TD';
    const idSet = new Set(ids);
    const edges = cfg.edges.filter((e) => idSet.has(e.from) && idSet.has(e.to));
    const groups = cfg.groups || [];
    const groupOf = cfg.groupOf || (() => null);

    const adj = {}, inE = {};
    ids.forEach((u) => { adj[u] = []; inE[u] = []; });
    edges.forEach((e) => { adj[e.from].push(e); inE[e.to].push(e); });

    /* arêtes de retour (cycles) par parcours en profondeur itératif */
    const state = {}, back = new Set();
    ids.forEach((root) => {
      if (state[root]) return;
      state[root] = 1;
      const stack = [[root, 0]];
      while (stack.length) {
        const top = stack[stack.length - 1];
        const list = adj[top[0]];
        if (top[1] < list.length) {
          const e = list[top[1]++];
          if (state[e.to] === 1) back.add(e);
          else if (!state[e.to]) { state[e.to] = 1; stack.push([e.to, 0]); }
        } else { state[top[0]] = 2; stack.pop(); }
      }
    });

    /* rangs : plus long chemin, par tri topologique */
    const rank = {}, indeg = {};
    ids.forEach((u) => { rank[u] = 0; indeg[u] = 0; });
    edges.forEach((e) => { if (!back.has(e)) indeg[e.to]++; });
    const queue = ids.filter((u) => indeg[u] === 0);
    for (let qi = 0; qi < queue.length; qi++) {
      const u = queue[qi];
      adj[u].forEach((e) => {
        if (back.has(e)) return;
        rank[e.to] = Math.max(rank[e.to], rank[u] + 1);
        if (--indeg[e.to] === 0) queue.push(e.to);
      });
    }
    const maxRank = Math.max(0, ...ids.map((u) => rank[u]));
    const ranks = [];
    for (let r = 0; r <= maxRank; r++) ranks.push([]);
    ids.forEach((u) => ranks[rank[u]].push(u));

    /* ordre dans chaque rang : barycentres (descente, montée, descente), puis regroupement par groupe */
    const idxIn = (list) => new Map(list.map((u, i) => [u, i]));
    const sortBy = (list, score) => list.sort((a, b) => (score.get(a) || 0) - (score.get(b) || 0));
    const sweepDown = () => {
      for (let r = 1; r <= maxRank; r++) {
        const prev = idxIn(ranks[r - 1]), sc = new Map();
        ranks[r].forEach((u) => {
          const p = inE[u].filter((e) => !back.has(e) && rank[e.from] === r - 1).map((e) => prev.get(e.from));
          sc.set(u, p.length ? p.reduce((a, b) => a + b, 0) / p.length : (ranks[r].indexOf(u)));
        });
        sortBy(ranks[r], sc);
      }
    };
    const sweepUp = () => {
      for (let r = maxRank - 1; r >= 0; r--) {
        const next = idxIn(ranks[r + 1]), sc = new Map();
        ranks[r].forEach((u) => {
          const p = adj[u].filter((e) => !back.has(e) && rank[e.to] === r + 1).map((e) => next.get(e.to));
          sc.set(u, p.length ? p.reduce((a, b) => a + b, 0) / p.length : (ranks[r].indexOf(u)));
        });
        sortBy(ranks[r], sc);
      }
    };
    if (edges.length) { sweepDown(); sweepUp(); sweepDown(); }

    const gIndex = new Map(groups.map((g, i) => [g.id, i]));
    const gParent = new Map(groups.map((g) => [g.id, g.parent]));
    const gPath = (id) => {
      const path = [];
      let g = groupOf(id);
      while (g) { path.unshift(gIndex.get(g)); g = gParent.get(g); }
      return path;
    };
    if (groups.length) {
      const paths = new Map(ids.map((u) => [u, gPath(u)]));
      const cmp = (a, b) => {
        const pa = paths.get(a), pb = paths.get(b);
        if (!pa.length || !pb.length) return pa.length === pb.length ? 0 : pa.length ? -1 : 1;
        for (let i = 0; i < Math.min(pa.length, pb.length); i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
        return pa.length - pb.length;
      };
      ranks.forEach((list) => list.sort(cmp));
    }

    /* tailles et espacements */
    const sz = {};
    ids.forEach((u) => { sz[u] = cfg.size(u); });
    const hasGroups = groups.length > 0;
    const gap = [];
    for (let r = 0; r < maxRank; r++) {
      let need = 0, count = 0;
      edges.forEach((e) => {
        if (back.has(e) || rank[e.from] !== r || rank[e.to] !== r + 1) return;
        if (e.label) { count++; need = Math.max(need, isLR ? lblW(e) + 38 : 0); }
        if (e.decor) need = Math.max(need, isLR ? 70 : 0);
      });
      if (!isLR && count) need = count * (LBL_H + 8) + 28;
      gap.push(Math.max(isLR ? 56 : 48, need) + (hasGroups ? 22 : 0));
    }

    const pos = {};
    if (isLR) {
      const rowGap = 22 + (hasGroups ? 18 : 0);
      const colW = ranks.map((list) => Math.max(0, ...list.map((u) => sz[u].w)));
      let curX = 0;
      ranks.forEach((list, r) => {
        const total = list.reduce((a, u) => a + sz[u].h, 0) + Math.max(0, list.length - 1) * rowGap;
        let y = -total / 2;
        list.forEach((u) => {
          pos[u] = { x: curX + (colW[r] - sz[u].w) / 2, y, w: sz[u].w, h: sz[u].h };
          y += sz[u].h + rowGap;
        });
        curX += colW[r] + (gap[r] || 0);
      });
    } else {
      const colGap = 40 + (hasGroups ? 18 : 0);
      let curY = 0;
      ranks.forEach((list, r) => {
        const total = list.reduce((a, u) => a + sz[u].w, 0) + Math.max(0, list.length - 1) * colGap;
        const rowH = Math.max(0, ...list.map((u) => sz[u].h));
        let x = -total / 2;
        list.forEach((u) => {
          pos[u] = { x, y: curY + (rowH - sz[u].h) / 2, w: sz[u].w, h: sz[u].h };
          x += sz[u].w + colGap;
        });
        curY += rowH + (gap[r] || 0);
      });
    }

    /* ---------- géométrie des arêtes ---------- */
    const rankSpan = (a, b) => {
      const lo = Math.min(rank[a], rank[b]), hi = Math.max(rank[a], rank[b]);
      return ids.filter((u) => rank[u] >= lo && rank[u] <= hi);
    };
    const parallel = new Map();
    edges.forEach((e) => { if (!back.has(e)) { const k = e.from + '\u0001' + e.to; parallel.set(k, (parallel.get(k) || 0) + 1); } });
    const parSeen = new Map();
    const used = { top: 0, bottom: 0, left: 0, right: 0 };

    const geo = edges.map((e) => {
      const f = pos[e.from], t = pos[e.to];
      const g = { e, back: back.has(e), box: null, fixed: null, apex: null };
      if (!g.back) {
        const key = e.from + '\u0001' + e.to;
        const cnt = parallel.get(key), idx = parSeen.get(key) || 0;
        parSeen.set(key, idx + 1);
        const off = (idx - (cnt - 1) / 2) * 16;
        if (isLR) {
          const x1 = f.x + f.w, x2 = t.x;
          const y1 = f.y + Math.max(6, Math.min(f.h - 6, f.h / 2 + off)), y2 = t.y + Math.max(6, Math.min(t.h - 6, t.h / 2 + off));
          const dx = Math.max(25, (x2 - x1) * 0.5);
          g.p = [[x1, y1], [x1 + dx, y1], [x2 - dx, y2], [x2, y2]];
        } else {
          const y1 = f.y + f.h, y2 = t.y;
          const x1 = f.x + Math.max(8, Math.min(f.w - 8, f.w / 2 + off)), x2 = t.x + Math.max(8, Math.min(t.w - 8, t.w / 2 + off));
          const dy = Math.max(20, (y2 - y1) * 0.5);
          g.p = [[x1, y1], [x1, y1 + dy], [x2, y2 - dy], [x2, y2]];
        }
        return g;
      }
      if (isLR) {
        /* arc au-dessus des nœuds ; en dessous si les deux extrémités sont en bas de leur colonne et pas en haut */
        const self = e.from === e.to;
        const first = (u) => ranks[rank[u]][0] === u, lastIn = (u) => ranks[rank[u]][ranks[rank[u]].length - 1] === u;
        const below = !(first(e.from) && first(e.to)) && lastIn(e.from) && lastIn(e.to);
        const x1 = f.x + f.w / 2 + (self ? 16 : 0), x2 = t.x + t.w / 2 - (self ? 16 : 0);
        const span = rankSpan(e.from, e.to);
        let y1, y2, apex;
        if (below) {
          y1 = f.y + f.h; y2 = t.y + t.h;
          apex = Math.max(...span.map((u) => pos[u].y + pos[u].h)) + 30 + 24 * used.bottom++;
        } else {
          y1 = f.y; y2 = t.y;
          apex = Math.min(...span.map((u) => pos[u].y)) - 30 - 24 * used.top++;
        }
        const c = (apex - (y1 + y2) / 8) / 0.75;
        g.p = [[x1, y1], [x1, c], [x2, c], [x2, y2]];
        g.apex = [(x1 + x2) / 2, apex];
        return g;
      }
      const extreme = (u, side) => {
        const list = ranks[rank[u]];
        return side === 'R' ? list[list.length - 1] === u : list[0] === u;
      };
      const side = (extreme(e.from, 'R') && extreme(e.to, 'R')) || !(extreme(e.from, 'L') && extreme(e.to, 'L')) ? 'R' : 'L';
      const span = rankSpan(e.from, e.to);
      const edgeX = side === 'R' ? Math.max(...span.map((u) => pos[u].x + pos[u].w)) : Math.min(...span.map((u) => pos[u].x));
      /* les flèches de retour d'un même côté s'écartent d'une largeur cumulée (et non du multiple de la leur) */
      const wl = e.label ? lblW(e) : 0;
      const offSum = used[side === 'R' ? 'right' : 'left'];
      used[side === 'R' ? 'right' : 'left'] = offSum + wl + 14;
      const archX = side === 'R' ? edgeX + 34 + offSum : edgeX - 34 - offSum;
      const x1 = side === 'R' ? f.x + f.w : f.x, y1 = f.y + f.h / 2;
      const x2 = side === 'R' ? t.x + t.w : t.x, y2 = t.y + t.h / 2;
      const c = (archX - (x1 + x2) / 8) / 0.75;
      g.p = [[x1, y1], [c, y1], [c, y2], [x2, y2]];
      if (e.label) {
        const w = lblW(e);
        g.fixed = { x: side === 'R' ? archX + 8 : archX - 8 - w, y: (y1 + y2) / 2 - LBL_H / 2, w, h: LBL_H };
      }
      return g;
    });

    /* ---------- étiquettes sans collision ---------- */
    const nodeRects = ids.map((u) => pos[u]);
    /* index spatial (grille) : chaque candidat n'est comparé qu'aux rectangles voisins, pas à tout le graphe */
    const CELL = 96, grid = new Map();
    const cellsOf = (r) => {
      const keys = [];
      for (let cx = Math.floor((r.x - 4) / CELL); cx <= Math.floor((r.x + r.w + 4) / CELL); cx++) {
        for (let cy = Math.floor((r.y - 4) / CELL); cy <= Math.floor((r.y + r.h + 4) / CELL); cy++) keys.push(cx + ',' + cy);
      }
      return keys;
    };
    const addRect = (r) => cellsOf(r).forEach((k) => { let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(r); });
    /* arrêt dès `limit` collisions : sur des milliers d'étiquettes empilées au même endroit, inutile de toutes les compter */
    const countHits = (box, limit) => {
      const seen = new Set();
      for (const k of cellsOf(box)) {
        const a = grid.get(k);
        if (a) {
          for (const r of a) {
            if (!seen.has(r) && rectsHit(box, r, 3)) { seen.add(r); if (seen.size >= limit) return seen.size; }
          }
        }
      }
      return seen.size;
    };
    nodeRects.forEach(addRect);
    geo.filter((g) => g.fixed).forEach((g) => { g.box = g.fixed; addRect(g.box); });

    /* candidats : d'abord le long de l'arête, puis décalés de part et d'autre (normale à la courbe) */
    const ts = isLR ? [0.5, 0.38, 0.62, 0.28, 0.72, 0.2, 0.8, 0.14, 0.86] : [0.5, 0.35, 0.65, 0.25, 0.75, 0.15, 0.85, 0.1, 0.9];
    const cands = ts.map((t) => [t, 0]);
    [16, -16, 30, -30].forEach((off) => ts.forEach((t) => cands.push([t, off])));
    geo.filter((g) => g.e.label && !g.fixed).forEach((g) => {
      const w = lblW(g.e);
      let best = null, bestCost = Infinity;
      for (const [t, off] of cands) {
        const [x, y] = g.back && g.apex && t === 0.5 && !off ? g.apex : bez(g.p, t);
        let box;
        if (off) {
          const [tx, ty] = bezTangent(g.p, t);
          box = { x: x - ty * off - w / 2, y: y + tx * off - LBL_H / 2, w, h: LBL_H };
        } else {
          const side = !isLR && !g.back ? Math.sign(g.p[3][0] - g.p[0][0]) * (Math.abs(g.p[3][0] - g.p[0][0]) > 20 ? 1 : 0) : 0;
          box = { x: side > 0 ? x + 8 : side < 0 ? x - 8 - w : x - w / 2, y: y - LBL_H / 2, w, h: LBL_H };
        }
        const cost = countHits(box, 3);
        if (cost < bestCost) { best = box; bestCost = cost; }
        if (!cost) break;
      }
      g.box = best;
      addRect(best);
    });

    /* ---------- rectangles de groupes (du plus profond au plus englobant) ---------- */
    const depthOf = (g) => { let d = 0, p = g.parent; while (p) { d++; p = gParent.get(p); } return d; };
    const groupRects = new Map();
    const children = new Map();
    groups.forEach((g) => { if (g.parent) { if (!children.has(g.parent)) children.set(g.parent, []); children.get(g.parent).push(g.id); } });
    groups.slice().sort((a, b) => depthOf(b) - depthOf(a)).forEach((g) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      ids.forEach((u) => {
        if (groupOf(u) !== g.id) return;
        const r = pos[u];
        x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h);
      });
      (children.get(g.id) || []).forEach((cid) => {
        const r = groupRects.get(cid);
        if (!r) return;
        x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h);
      });
      if (x0 === Infinity) return;
      groupRects.set(g.id, { x: x0 - 16, y: y0 - 30, w: x1 - x0 + 32, h: y1 - y0 + 46 });
    });

    /* ---------- cadre englobant ---------- */
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const grow = (x, y) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); };
    nodeRects.forEach((r) => { grow(r.x, r.y); grow(r.x + r.w, r.y + r.h); });
    geo.forEach((g) => { for (let i = 0; i <= 20; i++) { const q = bez(g.p, i / 20); grow(q[0], q[1]); } });
    geo.forEach((g) => { if (g.box) { grow(g.box.x, g.box.y); grow(g.box.x + g.box.w, g.box.y + g.box.h); } });
    groupRects.forEach((r) => { grow(r.x, r.y); grow(r.x + r.w, r.y + r.h); });
    if (minX === Infinity) { minX = minY = 0; maxX = maxY = 40; }

    return { pos, geo, groupRects, bounds: { minX, minY, maxX, maxY }, rank, back };
  }

  /** Crée le svg cadré sur la géométrie et pose les marqueurs. */
  function makeSvg(n, L, minScale, maxScale) {
    const PAD = 18;
    const b = L.bounds;
    const totalW = Math.ceil(b.maxX - b.minX + PAD * 2), totalH = Math.ceil(b.maxY - b.minY + PAD * 2);
    const svg = s('svg', { viewBox: [Math.floor(b.minX - PAD), Math.floor(b.minY - PAD), totalW, totalH].join(' '), class: 'diagram-svg', role: 'img' });
    sizeSvg(svg, totalW, totalH, minScale, maxScale, n);
    return svg;
  }

  function drawGroups(svg, groups, L, pal) {
    groups.forEach((g, i) => {
      const r = L.groupRects.get(g.id);
      if (!r) return;
      const col = pal[i % pal.length];
      svg.append(s('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: 10, fill: col, 'fill-opacity': 0.07, stroke: col, 'stroke-opacity': 0.55, class: 'diagram-group' }));
      svg.append(s('text', { x: r.x + 12, y: r.y + 18, class: 'diagram-group-title', fill: col, text: g.title }));
    });
  }

  function drawLabels(svg, geo) {
    geo.forEach((g) => {
      if (!g.box || !g.e.label) return;
      svg.append(s('rect', { x: g.box.x, y: g.box.y, width: g.box.w, height: g.box.h, rx: 4, class: 'diagram-edge-bg' }));
      svg.append(s('text', {
        x: g.box.x + g.box.w / 2, y: g.box.y + g.box.h / 2 + 4, class: 'diagram-edge-label', 'text-anchor': 'middle', text: g.e.label,
      }));
    });
  }

  /* ====================================================================== */
  /* flow / state                                                            */
  /* ====================================================================== */

  function nodeSize(label, shape) {
    const lines = wrapText(label, 230, NODE_PX);
    const tw = Math.max(0, ...lines.map((l) => textW(l, NODE_PX)));
    const lh = lines.length * LINE_H;
    let w, hgt;
    switch (shape) {
      case 'start': w = hgt = 18; break;
      case 'end': w = hgt = 24; break;
      case 'diamond': w = Math.max(100, Math.ceil(tw * 1.5 + 40)); hgt = Math.max(60, Math.ceil(lh * 1.7 + 22)); break;
      case 'circle': w = hgt = Math.max(62, Math.ceil(tw + 32), lh + 34); break;
      case 'hexagon': w = Math.max(100, Math.ceil(tw + 60)); hgt = Math.max(42, lh + 24); break;
      case 'cylinder': w = Math.max(84, Math.ceil(tw + 36)); hgt = Math.max(54, lh + 36); break;
      case 'round': w = Math.max(84, Math.ceil(tw + 44)); hgt = Math.max(38, lh + 22); break;
      default: w = Math.max(84, Math.ceil(tw + 36)); hgt = Math.max(38, lh + 22);
    }
    return { w, h: hgt, lines };
  }

  function drawShape(g, shape, x, y, w, hgt) {
    const cx = x + w / 2, cy = y + hgt / 2;
    switch (shape) {
      case 'round': g.append(s('rect', { x, y, width: w, height: hgt, rx: hgt / 2, class: 'diagram-node-box' })); break;
      case 'diamond':
        g.append(s('polygon', { points: [[cx, y], [x + w, cy], [cx, y + hgt], [x, cy]].map((p) => p.join(',')).join(' '), class: 'diagram-node-box' })); break;
      case 'circle': g.append(s('ellipse', { cx, cy, rx: w / 2, ry: hgt / 2, class: 'diagram-node-box' })); break;
      case 'hexagon': {
        const k = Math.min(18, w / 4);
        g.append(s('polygon', {
          points: [[x + k, y], [x + w - k, y], [x + w, cy], [x + w - k, y + hgt], [x + k, y + hgt], [x, cy]].map((p) => p.join(',')).join(' '),
          class: 'diagram-node-box',
        }));
        break;
      }
      case 'cylinder': {
        const ry = 7;
        g.append(s('path', {
          d: 'M ' + x + ' ' + (y + ry) + ' A ' + w / 2 + ' ' + ry + ' 0 0 1 ' + (x + w) + ' ' + (y + ry) + ' L ' + (x + w) + ' ' + (y + hgt - ry) +
            ' A ' + w / 2 + ' ' + ry + ' 0 0 1 ' + x + ' ' + (y + hgt - ry) + ' Z',
          class: 'diagram-node-box',
        }));
        g.append(s('path', { d: 'M ' + x + ' ' + (y + ry) + ' A ' + w / 2 + ' ' + ry + ' 0 0 0 ' + (x + w) + ' ' + (y + ry), class: 'diagram-node-box cyl-top' }));
        break;
      }
      case 'start': g.append(s('circle', { cx, cy, r: 9, class: 'state-dot' })); break;
      case 'end':
        g.append(s('circle', { cx, cy, r: 11, class: 'diagram-node-box' }));
        g.append(s('circle', { cx, cy, r: 6.5, class: 'state-dot' }));
        break;
      default: g.append(s('rect', { x, y, width: w, height: hgt, rx: 6, class: 'diagram-node-box' }));
    }
  }

  function renderFlow(n) {
    if (!n.nodes || !n.nodes.length) return null;
    const isState = n.kind === 'state';
    const info = n.nodeInfo || {};
    const groups = n.groups || [];
    const meta = {};
    n.nodes.forEach((u) => {
      const i = info[u] || { label: u, shape: 'rect' };
      const shape = isState && i.shape === 'rect' && !(i.explicit) ? 'round' : i.shape;
      meta[u] = { label: i.label === undefined ? u : i.label, shape, group: i.group, sz: nodeSize(i.label === undefined ? u : i.label, shape) };
    });
    const L = layoutGraph({
      ids: n.nodes,
      size: (u) => meta[u].sz,
      edges: n.edges,
      dir: (n.dir || (isState ? 'TD' : 'LR')).toUpperCase(),
      groups,
      groupOf: (u) => meta[u].group || null,
    });
    const pal = palette(n);
    const svg = makeSvg(n, L, 0.7, 1.15);
    const ids = addDefs(svg);

    drawGroups(svg, groups, L, pal);
    L.geo.forEach((g) => {
      svg.append(s('path', {
        d: pathOf(g.p),
        class: 'diagram-edge' + (g.e.style === 'dashed' ? ' dashed' : ''),
        'marker-end': 'url(#' + ids.arrow + ')',
        'data-from': g.e.from,
        'data-to': g.e.to,
      }));
    });
    n.nodes.forEach((u) => {
      const p = L.pos[u], m = meta[u];
      const g = s('g', { class: 'diagram-node shape-' + m.shape, 'data-id': u });
      drawShape(g, m.shape, p.x, p.y, p.w, p.h);
      const lines = m.sz.lines;
      if (m.shape !== 'start' && m.shape !== 'end') {
        const y0 = p.y + p.h / 2 - ((lines.length - 1) * LINE_H) / 2 + 4.5;
        lines.forEach((l, i) => {
          g.append(s('text', { x: p.x + p.w / 2, y: y0 + i * LINE_H, class: 'diagram-node-text', 'text-anchor': 'middle', text: l }));
        });
      }
      g.append(s('title', { text: m.label || (m.shape === 'start' ? 'Début' : 'Fin') }));
      svg.append(g);
    });
    drawLabels(svg, L.geo);
    return svg;
  }

  /* ====================================================================== */
  /* er                                                                      */
  /* ====================================================================== */

  /** Pied de corbeau, barre, cercle : cardinalité au bord d'une entité. P = point d'ancrage, d = direction sortant de l'entité. */
  function drawCard(svg, P, d, card) {
    const px = -d[1], py = d[0];
    const at = (t, o) => [P[0] + d[0] * t + px * o, P[1] + d[1] * t + py * o];
    const line = (a, b) => svg.append(s('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: 'er-card' }));
    const circle = (t) => { const c = at(t, 0); svg.append(s('circle', { cx: c[0], cy: c[1], r: 4.5, class: 'er-card er-card-zero' })); };
    const bar = (t) => line(at(t, -6), at(t, 6));
    const foot = () => { const apex = at(14, 0); line(apex, at(0, -7)); line(apex, at(0, 0)); line(apex, at(0, 7)); };
    switch (card) {
      case '1': bar(9); bar(15); break;
      case '0..1': bar(9); circle(19); break;
      case '1..*': foot(); bar(19); break;
      default: foot(); circle(23); // '*' et '0..*'
    }
  }

  function renderEr(n) {
    if (!n.entities || !n.entities.length) return null;
    const HEAD = 30, ROW = 21, PADX = 12;
    const meta = {};
    n.entities.forEach((e) => {
      const nameW = textW(e.name, 13, 700) + PADX * 2;
      let nw = 0, tw = 0, kw = 0;
      e.attrs.forEach((a) => {
        nw = Math.max(nw, textW(a.name, 12.5));
        tw = Math.max(tw, a.type ? textW(a.type, 12) : 0);
        kw = Math.max(kw, a.keys.length ? textW(a.keys.join(','), 10.5, 700) + 10 : 0);
      });
      const rowsW = e.attrs.length ? PADX * 2 + nw + (tw ? tw + 18 : 0) + (kw ? kw + 12 : 0) : 0;
      meta[e.name] = { nw, tw, kw, w: Math.max(110, Math.ceil(Math.max(nameW, rowsW))), h: HEAD + (e.attrs.length ? e.attrs.length * ROW + 8 : 6) };
    });
    const names = n.entities.map((e) => e.name);
    const L = layoutGraph({
      ids: names,
      size: (u) => ({ w: meta[u].w, h: meta[u].h }),
      edges: n.relations.map((r) => ({ ...r, decor: true })),
      dir: 'LR',
    });
    const pal = palette(n);
    const svg = makeSvg(n, L, 0.7, 1.15);

    L.geo.forEach((g) => {
      svg.append(s('path', { d: pathOf(g.p), class: 'diagram-edge', 'data-from': g.e.from, 'data-to': g.e.to }));
      const t0 = bezTangent(g.p, 0), t1 = bezTangent(g.p, 1);
      drawCard(svg, g.p[0], t0, g.e.fromCard);
      drawCard(svg, g.p[3], [-t1[0], -t1[1]], g.e.toCard);
    });
    n.entities.forEach((e, i) => {
      const p = L.pos[e.name], m = meta[e.name], col = pal[i % pal.length];
      const gr = s('g', { class: 'diagram-node er-entity', 'data-id': e.name });
      gr.append(s('rect', { x: p.x, y: p.y, width: p.w, height: p.h, rx: 6, class: 'diagram-node-box' }));
      gr.append(s('path', { d: 'M ' + p.x + ' ' + (p.y + HEAD) + ' L ' + p.x + ' ' + (p.y + 6) + ' Q ' + p.x + ' ' + p.y + ' ' + (p.x + 6) + ' ' + p.y +
        ' L ' + (p.x + p.w - 6) + ' ' + p.y + ' Q ' + (p.x + p.w) + ' ' + p.y + ' ' + (p.x + p.w) + ' ' + (p.y + 6) + ' L ' + (p.x + p.w) + ' ' + (p.y + HEAD) + ' Z',
      fill: col, 'fill-opacity': 0.22, class: 'er-head' }));
      gr.append(s('line', { x1: p.x, x2: p.x + p.w, y1: p.y + HEAD, y2: p.y + HEAD, class: 'er-sep' }));
      gr.append(s('text', { x: p.x + p.w / 2, y: p.y + 20, class: 'er-name', 'text-anchor': 'middle', text: e.name }));
      e.attrs.forEach((a, k) => {
        const yy = p.y + HEAD + 8 + k * ROW + 13;
        gr.append(s('text', { x: p.x + PADX, y: yy, class: 'er-attr' + (a.keys.includes('PK') ? ' er-pk' : ''), text: a.name }));
        if (a.type) gr.append(s('text', { x: p.x + PADX + m.nw + 14, y: yy, class: 'er-type', text: a.type }));
        if (a.keys.length) gr.append(s('text', { x: p.x + p.w - PADX, y: yy, class: 'er-key', 'text-anchor': 'end', text: a.keys.join(',') }));
      });
      gr.append(s('title', { text: e.name }));
      svg.append(gr);
    });
    drawLabels(svg, L.geo);
    return svg;
  }

  /* ====================================================================== */
  /* class                                                                   */
  /* ====================================================================== */

  function renderClass(n) {
    if (!n.classes || !n.classes.length) return null;
    const ROW = 19, PADX = 12;
    const meta = {};
    n.classes.forEach((c) => {
      const headLines = (c.stereotype ? 1 : 0) + 1;
      const head = headLines * 18 + 12;
      const rows = c.fields.concat(c.methods);
      let w = Math.max(textW(c.name, 13, 700), c.stereotype ? textW('«' + c.stereotype + '»', 11) : 0) + PADX * 2;
      rows.forEach((r) => { w = Math.max(w, textW(r, 12) + PADX * 2); });
      const secF = c.fields.length ? c.fields.length * ROW + 8 : 8, secM = c.methods.length ? c.methods.length * ROW + 8 : 8;
      meta[c.name] = { head, secF, secM, w: Math.max(110, Math.ceil(w)), h: head + secF + secM };
    });
    const names = n.classes.map((c) => c.name);
    /* héritage, réalisation, composition, agrégation : le parent / le tout se place au-dessus, repère au bout "from" */
    const REV = new Set(['inherit', 'realize', 'compose', 'aggregate']);
    const L = layoutGraph({
      ids: names,
      size: (u) => ({ w: meta[u].w, h: meta[u].h }),
      edges: n.relations.map((r) => (REV.has(r.type) ? { ...r, from: r.to, to: r.from, rev: true, decor: true } : { ...r, decor: true })),
      dir: 'TD',
    });
    const pal = palette(n);
    const svg = makeSvg(n, L, 0.7, 1.15);
    const ids = addDefs(svg);
    const markerFor = (t) => ({ inherit: ids.tri, realize: ids.tri, compose: ids.diaFill, aggregate: ids.dia, assoc: ids.open, depend: ids.open }[t] || null);

    L.geo.forEach((g) => {
      const t = g.e.type;
      const mk = markerFor(t);
      svg.append(s('path', {
        d: pathOf(g.p),
        class: 'diagram-edge' + (t === 'realize' || t === 'depend' || t === 'dlink' ? ' dashed' : ''),
        'marker-end': mk && !g.e.rev ? 'url(#' + mk + ')' : null,
        'marker-start': mk && g.e.rev ? 'url(#' + mk + ')' : null,
        'data-from': g.e.from,
        'data-to': g.e.to,
      }));
    });
    n.classes.forEach((c, i) => {
      const p = L.pos[c.name], m = meta[c.name], col = pal[i % pal.length];
      const gr = s('g', { class: 'diagram-node cls-box', 'data-id': c.name });
      gr.append(s('rect', { x: p.x, y: p.y, width: p.w, height: p.h, rx: 6, class: 'diagram-node-box' }));
      gr.append(s('path', { d: 'M ' + p.x + ' ' + (p.y + m.head) + ' L ' + p.x + ' ' + (p.y + 6) + ' Q ' + p.x + ' ' + p.y + ' ' + (p.x + 6) + ' ' + p.y +
        ' L ' + (p.x + p.w - 6) + ' ' + p.y + ' Q ' + (p.x + p.w) + ' ' + p.y + ' ' + (p.x + p.w) + ' ' + (p.y + 6) + ' L ' + (p.x + p.w) + ' ' + (p.y + m.head) + ' Z',
      fill: col, 'fill-opacity': 0.22, class: 'er-head' }));
      let ty = p.y + 20;
      if (c.stereotype) { gr.append(s('text', { x: p.x + p.w / 2, y: ty, class: 'cls-stereo', 'text-anchor': 'middle', text: '«' + c.stereotype + '»' })); ty += 18; }
      gr.append(s('text', { x: p.x + p.w / 2, y: ty, class: 'er-name', 'text-anchor': 'middle', text: c.name }));
      gr.append(s('line', { x1: p.x, x2: p.x + p.w, y1: p.y + m.head, y2: p.y + m.head, class: 'er-sep' }));
      c.fields.forEach((f, k) => gr.append(s('text', { x: p.x + PADX, y: p.y + m.head + 8 + k * ROW + 13, class: 'er-attr', text: f })));
      const my = p.y + m.head + m.secF;
      gr.append(s('line', { x1: p.x, x2: p.x + p.w, y1: my, y2: my, class: 'er-sep' }));
      c.methods.forEach((f, k) => gr.append(s('text', { x: p.x + PADX, y: my + 8 + k * ROW + 13, class: 'er-attr', text: f })));
      gr.append(s('title', { text: c.name }));
      svg.append(gr);
    });
    drawLabels(svg, L.geo);
    return svg;
  }

  K.diagrams.flow = renderFlow;
  K.diagrams.state = renderFlow;
  K.diagrams.er = renderEr;
  K.diagrams.class = renderClass;
})();
