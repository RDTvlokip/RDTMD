/* RDTMD : noyau partagé des rendus SVG (helpers DOM, palettes, mesure de texte, marqueurs). */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';

  function put(node, attrs, kids) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'text') node.textContent = v;
      else node.setAttribute(k, v);
    }
    for (const c of kids || []) node.append(c);
    return node;
  }
  const h = (tag, attrs, kids) => put(document.createElement(tag), attrs || {}, kids);
  const s = (tag, attrs, kids) => put(document.createElementNS(NS, tag), attrs || {}, kids);

  /* ---------- palettes ---------- */
  const PALETTES = {
    default: ['#4e9de6', '#e6794e', '#5cc08a', '#c77de0', '#e6c84e', '#e65c7a'],
    warm: ['#e6794e', '#e6c84e', '#e65c7a', '#d98c5f', '#c9a227', '#b5523b'],
    cool: ['#4e9de6', '#5cc08a', '#5fc7d9', '#7a8ce6', '#3d7ea6', '#6bd1a3'],
    mono: ['#9aa5b1', '#7b8794', '#cbd2d9', '#616e7c', '#e4e7eb', '#52606d'],
    pastel: ['#a3c4f3', '#f9c6aa', '#b5e2c4', '#d9bff0', '#f5e6a1', '#f4b6c2'],
    vivid: ['#1e88e5', '#fb8c00', '#00c853', '#aa00ff', '#ffd600', '#ff1744'],
  };
  let basePalette = PALETTES.default.slice();

  const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
  function setPalette(list) {
    const ok = Array.isArray(list) ? list.filter((c) => typeof c === 'string' && HEX.test(c.trim())).map((c) => c.trim()) : [];
    basePalette = ok.length >= 2 ? ok : PALETTES.default.slice();
  }
  /** Palette d'un bloc : @theme du bloc, sinon palette globale (réglage rdtmd.palette). */
  function palette(n) {
    const t = n && n.opts && n.opts.theme;
    return t && PALETTES[t] && t !== 'default' ? PALETTES[t] : basePalette;
  }

  /* ---------- identifiants uniques (marqueurs SVG propres à chaque figure) ---------- */
  let uidN = 0;
  const uid = (p) => p + '-' + (++uidN);

  /* ---------- mesure de texte (le SVG ne revient pas à la ligne tout seul) ---------- */
  const measureCtx = (() => {
    try { return document.createElement('canvas').getContext('2d'); } catch (e) { return null; }
  })();
  let fontFamily = null;

  function textW(str, px, weight) {
    str = String(str);
    if (measureCtx) {
      if (fontFamily === null) fontFamily = getComputedStyle(document.body).fontFamily || 'sans-serif';
      measureCtx.font = (weight || 400) + ' ' + px + 'px ' + fontFamily;
      return measureCtx.measureText(str).width;
    }
    return str.length * px * 0.6;
  }

  function wrapText(str, maxW, px, weight) {
    const lines = [];
    let cur = '';
    for (const w of String(str).split(/\s+/).filter(Boolean)) {
      const t = cur ? cur + ' ' + w : w;
      if (cur && textW(t, px, weight) > maxW) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  }

  /** Tronque avec "…" pour tenir dans maxW. */
  function ellipsize(str, maxW, px, weight) {
    if (textW(str, px, weight) <= maxW) return str;
    let lo = 0, hi = str.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (textW(str.slice(0, mid) + '…', px, weight) <= maxW) lo = mid; else hi = mid - 1;
    }
    /* ne jamais couper une paire de substitution (emoji) : une moitié seule fait planter certains moteurs de rendu de texte */
    const c = lo > 0 ? str.charCodeAt(lo - 1) : 0;
    if (c >= 0xd800 && c <= 0xdbff) lo--;
    return str.slice(0, lo) + '…';
  }

  /** Dimensionne un svg : largeur fluide bornée par minScale/maxScale (et @width du bloc). */
  function sizeSvg(svg, w, hgt, minScale, maxScale, node) {
    const cap = node && node.opts && node.opts.width;
    svg.setAttribute('width', w);
    svg.setAttribute('height', hgt);
    svg.style.width = '100%';
    svg.style.maxWidth = (cap || Math.round(w * maxScale)) + 'px';
    svg.style.minWidth = Math.round(Math.min(cap || Infinity, w * minScale)) + 'px';
    const al = node && node.opts && node.opts.align;
    if (al === 'left') svg.style.margin = '0 auto 0 0';
    else if (al === 'right') svg.style.margin = '0 0 0 auto';
  }

  /* ---------- géométrie ---------- */
  function bez(p, t) {
    const u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return [a * p[0][0] + b * p[1][0] + c * p[2][0] + d * p[3][0], a * p[0][1] + b * p[1][1] + c * p[2][1] + d * p[3][1]];
  }
  function bezTangent(p, t) {
    const u = 1 - t;
    const dx = 3 * u * u * (p[1][0] - p[0][0]) + 6 * u * t * (p[2][0] - p[1][0]) + 3 * t * t * (p[3][0] - p[2][0]);
    const dy = 3 * u * u * (p[1][1] - p[0][1]) + 6 * u * t * (p[2][1] - p[1][1]) + 3 * t * t * (p[3][1] - p[2][1]);
    const len = Math.hypot(dx, dy) || 1;
    return [dx / len, dy / len];
  }
  function rectsHit(a, b, m) {
    return a.x < b.x + b.w + m && a.x + a.w + m > b.x && a.y < b.y + b.h + m && a.y + a.h + m > b.y;
  }
  const pathOf = (p) => 'M ' + p[0].join(' ') + ' C ' + p[1].join(' ') + ', ' + p[2].join(' ') + ', ' + p[3].join(' ');

  /* ---------- marqueurs (ids uniques : un marqueur dans un onglet masqué ne s'affiche pas) ---------- */
  function addDefs(svg) {
    const ids = { arrow: uid('arr'), tri: uid('tri'), dia: uid('dia'), diaFill: uid('diaf'), open: uid('opn') };
    const defs = s('defs');
    const mk = (id, vb, w, hh, refX, kids) => {
      const m = s('marker', {
        id, viewBox: vb, refX, refY: 5, markerWidth: w, markerHeight: hh, markerUnits: 'userSpaceOnUse', orient: 'auto-start-reverse',
      }, kids);
      defs.append(m);
    };
    mk(ids.arrow, '0 0 10 10', 10, 10, 9, [s('path', { d: 'M 0 1.5 L 9 5 L 0 8.5 z', fill: 'currentColor' })]);
    mk(ids.tri, '0 0 12 10', 13, 11, 11.5, [s('path', { d: 'M 0.8 0.8 L 11.2 5 L 0.8 9.2 z', class: 'mk-hollow', 'stroke-width': 1.4 })]);
    mk(ids.dia, '0 0 14 10', 15, 11, 13.5, [s('path', { d: 'M 0.8 5 L 7 0.8 L 13.2 5 L 7 9.2 z', class: 'mk-hollow', 'stroke-width': 1.4 })]);
    mk(ids.diaFill, '0 0 14 10', 15, 11, 13.5, [s('path', { d: 'M 0.8 5 L 7 0.8 L 13.2 5 L 7 9.2 z', fill: 'currentColor', stroke: 'currentColor', 'stroke-width': 1 })]);
    mk(ids.open, '0 0 10 10', 11, 11, 9.5, [s('path', { d: 'M 0.8 1 L 9 5 L 0.8 9', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 })]);
    svg.append(defs);
    return ids;
  }

  /* ---------- registre des rendus et état d'interface persistant ---------- */
  const diagrams = {};
  const ui = new Map();

  let vscodeApi = null;
  const setVscode = (api) => { vscodeApi = api; };
  const post = (m) => { if (vscodeApi) vscodeApi.postMessage(m); };

  window.RDTKit = {
    NS, put, h, s, PALETTES, palette, setPalette, uid, textW, wrapText, ellipsize, sizeSvg,
    bez, bezTangent, rectsHit, pathOf, addDefs, diagrams, ui, setVscode, post,
  };
})();
