(function () {
  'use strict';
  const vscode = acquireVsCodeApi();
  const root = document.getElementById('root');
  const NS = 'http://www.w3.org/2000/svg';
  const COLORS = ['#4e9de6', '#e6794e', '#5cc08a', '#c77de0', '#e6c84e', '#e65c7a'];
  const LABELS = { note: 'Note', tip: 'Astuce', warn: 'Attention', danger: 'Danger' };

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

  let breaks = true;
  const safeHref = (u) => (/^\s*(javascript|vbscript|data):/i.test(u) ? null : u);

  /* ---------- inline ---------- */
  function inl(nodes) {
    const out = [];
    for (const n of nodes || []) {
      switch (n.type) {
        case 'text': out.push(n.value); break;
        case 'softbreak': out.push(breaks ? h('br') : ' '); break;
        case 'break': out.push(h('br')); break;
        case 'code': out.push(h('code', { text: n.value })); break;
        case 'math': out.push(window.RDTMath.render(n.value, false)); break;
        case 'strong': out.push(h('strong', {}, inl(n.children))); break;
        case 'em': out.push(h('em', {}, inl(n.children))); break;
        case 'strike': out.push(h('del', {}, inl(n.children))); break;
        case 'link': out.push(h('a', { href: safeHref(n.href), title: n.title || null }, inl(n.children))); break;
        case 'image': out.push(h('img', { src: n.src, alt: n.alt, title: n.title || null })); break;
      }
    }
    return out;
  }

  /* ---------- blocs ---------- */
  function blocks(nodes) { return (nodes || []).map(block).filter(Boolean); }

  function renderCode(n) {
    const wrap = h('div', { class: 'code-block' });
    const header = h('div', { class: 'code-header' });

    const left = h('div', { class: 'code-title-box' });
    if (n.title) {
      left.append(h('span', { class: 'code-file-name', text: n.title }));
    }
    header.append(left);

    const right = h('div', { class: 'code-actions' });
    if (n.lang) {
      right.append(h('span', { class: 'code-lang-tag', text: n.lang }));
    }
    const copyBtn = h('button', { class: 'code-copy-btn', type: 'button', text: 'Copy' });
    copyBtn.addEventListener('click', () => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(n.text).then(() => {
          copyBtn.textContent = 'Copied!';
          copyBtn.classList.add('copied');
          setTimeout(() => {
            copyBtn.textContent = 'Copy';
            copyBtn.classList.remove('copied');
          }, 2000);
        }).catch(() => {});
      }
    });
    right.append(copyBtn);
    header.append(right);
    wrap.append(header);

    const pre = h('pre');
    const codeEl = h('code');

    const showLines = !!n.lines;
    const hls = new Set(n.highlights || []);

    if (showLines || hls.size > 0) {
      pre.classList.add('has-lines');
      const lines = n.text.split('\n');
      const isDiff = n.lang === 'diff';
      const isChange = (idx) => idx >= 0 && idx < lines.length &&
        ((lines[idx].startsWith('+') && !lines[idx].startsWith('+++')) ||
         (lines[idx].startsWith('-') && !lines[idx].startsWith('---')));

      lines.forEach((l, idx) => {
        const lineNum = idx + 1;
        const lineRow = h('div', { class: 'code-line' + (hls.has(lineNum) ? ' hl' : '') });
        if (showLines) {
          lineRow.append(h('span', { class: 'code-num', text: String(lineNum) }));
        }
        const rendered = window.RDTHighlight.render(l, n.lang);
        if (isDiff && isChange(idx)) {
          const isTop = !isChange(idx - 1);
          const isBot = !isChange(idx + 1);
          rendered.forEach((node) => {
            if (node.nodeType === 1 && (node.classList.contains('tk-df-add') || node.classList.contains('tk-df-del'))) {
              if (isTop) node.classList.add('tk-df-top');
              if (isBot) node.classList.add('tk-df-bot');
            }
          });
        }
        const lineText = h('span', { class: 'code-content' }, rendered);
        lineRow.append(lineText);
        codeEl.append(lineRow);
      });
    } else {
      codeEl.append(...window.RDTHighlight.render(n.text, n.lang));
    }

    pre.append(codeEl);
    wrap.append(pre);
    return wrap;
  }

  function block(n) {
    switch (n.type) {
      case 'heading': return h('h' + n.level, {}, inl(n.inline));
      case 'paragraph': return h('p', {}, inl(n.inline));
      case 'hr': return h('hr');
      case 'quote': return h('blockquote', {}, blocks(n.children));
      case 'code': return renderCode(n);
      case 'math': return window.RDTMath.render(n.text, true);
      case 'includelink': {
        const a = h('a', { class: 'inc-link', href: '#', title: 'Ouvrir ' + n.path }, [h('span', { class: 'inc-ico', text: '↗' }), h('span', { text: n.path })]);
        a.addEventListener('click', (e) => { e.preventDefault(); vscode.postMessage({ type: 'open', file: n.file }); });
        return h('div', { class: 'inc-row' }, [a]);
      }
      case 'included': {
        const chip = h('a', { class: 'inc-chip', href: '#', title: 'Ouvrir ' + n.path, text: '↗ ' + n.path });
        chip.addEventListener('click', (e) => { e.preventDefault(); vscode.postMessage({ type: 'open', file: n.file }); });
        return h('div', { class: 'included' }, [chip].concat(blocks(n.children)));
      }
      case 'error': return h('div', { class: 'error', text: n.message });
      case 'callout':
        return h('div', { class: 'callout ' + n.kind }, [
          h('div', { class: 'callout-title', text: n.title || LABELS[n.kind] }),
        ].concat(blocks(n.children)));
      case 'list': {
        const l = h(n.ordered ? 'ol' : 'ul', { start: n.ordered && n.start !== 1 ? n.start : null });
        for (const it of n.items) {
          let li;
          if (it.checked === null) {
            li = h('li', {}, blocks(it.children));
          } else {
            const cb = h('span', { class: 'cb' + (it.checked ? ' on' : ''), role: 'checkbox', 'aria-checked': String(it.checked) });
            if (it.checked) {
              cb.append(s('svg', { viewBox: '0 0 16 16' }, [s('polyline', {
                points: '3.5,8.5 6.8,11.8 12.5,4.8', fill: 'none', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
              })]));
            }
            li = h('li', { class: 'task' + (it.checked ? ' done' : '') }, [cb, h('div', { class: 'task-body' }, blocks(it.children))]);
          }
          l.append(li);
        }
        return l;
      }
      case 'table': {
        const row = (cells, tag) => h('tr', {}, cells.map((c, i) => {
          const e = h(tag, {}, inl(c));
          if (n.align[i]) e.style.textAlign = n.align[i];
          return e;
        }));
        return h('table', {}, [
          h('thead', {}, [row(n.header, 'th')]),
          h('tbody', {}, n.rows.map((r) => row(r, 'td'))),
        ]);
      }
      case 'chart': return chart(n);
      case 'diagram': return diagram(n);
      case 'tabs': return renderTabs(n);
      case 'metrics': return renderMetrics(n);
      case 'chat': return renderChat(n);
      case 'details': return renderDetails(n);
      default: return null;
    }
  }

  /* ---------- extensions natives (tabs, metrics, chat, details) ---------- */
  function renderTabs(n) {
    const wrap = h('div', { class: 'tabs-block' });
    const nav = h('div', { class: 'tabs-nav', role: 'tablist' });
    const content = h('div', { class: 'tabs-content' });
    const tabBtns = [];
    const tabPanes = [];

    (n.tabs || []).forEach((t, i) => {
      const active = i === 0;
      const btn = h('button', {
        class: 'tab-btn' + (active ? ' active' : ''),
        type: 'button',
        role: 'tab',
        'aria-selected': active ? 'true' : 'false',
        text: t.title,
      });

      const pane = h('div', {
        class: 'tab-pane' + (active ? ' active' : ''),
        role: 'tabpanel',
        'aria-hidden': active ? 'false' : 'true',
      }, blocks(t.children));

      btn.addEventListener('click', () => {
        tabBtns.forEach((b, k) => {
          const isActive = k === i;
          b.classList.toggle('active', isActive);
          b.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        tabPanes.forEach((p, k) => {
          const isActive = k === i;
          p.classList.toggle('active', isActive);
          p.setAttribute('aria-hidden', isActive ? 'false' : 'true');
        });
      });

      tabBtns.push(btn);
      tabPanes.push(pane);
      nav.append(btn);
      content.append(pane);
    });

    wrap.append(nav, content);
    return wrap;
  }

  function renderMetrics(n) {
    const wrap = h('div', { class: 'metrics-block' });
    if (n.title) {
      wrap.append(h('div', { class: 'metrics-title', text: n.title }));
    }
    const grid = h('div', { class: 'metrics-grid' });
    (n.items || []).forEach((it) => {
      const card = h('div', { class: 'metric-card' });
      card.append(h('div', { class: 'metric-label', title: it.label, text: it.label }));
      const valRow = h('div', { class: 'metric-val-row' });
      valRow.append(h('span', { class: 'metric-val', text: it.value }));
      if (it.diff) {
        valRow.append(h('span', {
          class: 'metric-diff diff-' + (it.diffType || 'neutral'),
          title: 'Variation : ' + it.diff,
          text: it.diff,
        }));
      }
      card.append(valRow);
      grid.append(card);
    });
    wrap.append(grid);
    return wrap;
  }

  function renderChat(n) {
    const wrap = h('div', { class: 'chat-block' });
    if (n.title) {
      wrap.append(h('div', { class: 'chat-header', text: n.title }));
    }
    const list = h('div', { class: 'chat-messages' });
    (n.messages || []).forEach((m) => {
      const row = h('div', { class: 'chat-msg chat-' + (m.role || 'user') });
      const meta = h('div', { class: 'chat-meta' });
      const badge = h('span', {
        class: 'chat-badge ' + (m.role || 'user'),
        text: m.role === 'assistant' ? 'IA' : m.role === 'system' ? 'SYS' : 'U',
      });
      const sender = h('span', { class: 'chat-sender', text: m.sender });
      meta.append(badge, sender);

      const bubble = h('div', { class: 'chat-bubble' }, inl(m.inline));
      row.append(meta, bubble);
      list.append(row);
    });
    wrap.append(list);
    return wrap;
  }

  function renderDetails(n) {
    const el = h('details', { class: 'details-block' });
    if (n.open) el.open = true;

    const summary = h('summary', { class: 'details-summary' });
    const chev = s('svg', { class: 'details-chevron', viewBox: '0 0 16 16', width: 14, height: 14 }, [
      s('path', {
        d: 'M6 3.5l5 4.5-5 4.5',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 2,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      }),
    ]);
    const title = h('span', { class: 'details-title', text: n.title });
    summary.append(chev, title);

    const body = h('div', { class: 'details-body' }, blocks(n.children));
    el.append(summary, body);
    return el;
  }

  /* ---------- graphiques (SVG natif) ---------- */
  const W = 640, H = 320;

  function nice(v) {
    if (v <= 0) return 1;
    const e = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
  }
  const round = (v) => Math.round(v * 100) / 100;

  function chart(n) {
    const fig = h('figure', { class: 'chart' });
    if (n.title) fig.append(h('figcaption', { text: n.title }));
    if (!n.series.length || !n.categories.length) {
      fig.append(h('div', { class: 'error', text: 'Graphique vide' }));
      return fig;
    }
    const svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart-svg', role: 'img', width: W, height: H });
    svg.style.maxWidth = W + 'px';
    svg.style.width = '100%';
    if (n.kind === 'pie') pie(svg, n); else cartesian(svg, n);
    fig.append(svg);
    if (n.kind !== 'pie' && n.series.length > 1) {
      fig.append(h('div', { class: 'legend' }, n.series.map((se, i) => {
        const sw = h('span', { class: 'sw' });
        sw.style.background = COLORS[i % COLORS.length];
        return h('span', { class: 'legend-item' }, [sw, se.name]);
      })));
    }
    return fig;
  }

  function cartesian(svg, n) {
    const all = n.series.flatMap((x) => x.values);
    const mn = Math.min(0, ...all), mx = Math.max(0, ...all);
    const lo = mn < 0 ? -nice(-mn) : 0;
    const hi = mx > 0 ? nice(mx) : 0;
    const top = hi === lo ? lo + 1 : hi;

    // Calcul dynamique de la marge gauche L pour éviter la troncature des graduations
    const yVals = [];
    for (let i = 0; i <= 4; i++) yVals.push(String(round(lo + ((top - lo) * i) / 4)));
    const maxYLen = Math.max(...yVals.map((v) => v.length));
    const L = Math.max(56, Math.ceil(maxYLen * 8.5) + 16);
    const R = 18;

    // Marge haute T : assez de place pour le titre d'axe d'unité sans collision avec la graduation max
    const T = n.unit ? 34 : 20;

    // Analyse des catégories pour éviter les chevauchements sur l'axe X
    const pw = W - L - R;
    const band = pw / n.categories.length;
    const maxCatLen = Math.max(...n.categories.map((c) => String(c).length));
    const estCatW = maxCatLen * 7.5;
    const needsRotate = band < 52 || band < estCatW || (n.categories.length > 6 && maxCatLen >= 4);

    // Marge basse B : augmentée si rotation
    const B = needsRotate ? Math.min(88, Math.max(50, 24 + Math.round(estCatW * 0.7))) : 44;
    const ph = H - T - B;
    const y = (v) => T + ph * (1 - (v - lo) / (top - lo));
    const unit = n.unit ? ' ' + n.unit : '';

    // Graduations Y et grille
    for (let i = 0; i <= 4; i++) {
      const v = lo + ((top - lo) * i) / 4, yy = y(v);
      svg.append(s('line', { x1: L, x2: W - R, y1: yy, y2: yy, class: 'grid' }));
      svg.append(s('text', { x: L - 8, y: yy + 4, class: 'lbl', 'text-anchor': 'end', text: round(v) }));
    }

    // Affichage de l'unité comme petit titre d'axe en haut, sans collision avec la graduation max
    if (n.unit) {
      svg.append(s('text', {
        x: L,
        y: 15,
        class: 'lbl chart-unit',
        'text-anchor': 'start',
        text: n.unit,
      }));
    }

    // Labels X (avec rotation si nécessaire)
    n.categories.forEach((c, i) => {
      const cx = L + band * (i + 0.5);
      const cy = H - B + 18;
      if (needsRotate) {
        const lbl = s('text', {
          x: cx,
          y: cy,
          class: 'lbl',
          'text-anchor': 'end',
          transform: 'rotate(-40 ' + cx + ' ' + cy + ')',
          text: c,
        });
        if (band < 26) lbl.setAttribute('font-size', '10.5px');
        svg.append(lbl);
      } else {
        svg.append(s('text', {
          x: cx,
          y: cy,
          class: 'lbl',
          'text-anchor': 'middle',
          text: c,
        }));
      }
    });

    if (n.kind === 'bar') {
      const gw = band * 0.7, bw = gw / n.series.length;
      n.series.forEach((se, si) => se.values.forEach((v, i) => {
        const x = L + band * i + (band - gw) / 2 + bw * si;
        const y0 = y(0), y1 = y(v), top1 = Math.min(y0, y1);
        svg.append(s('rect', {
          x, y: top1, width: Math.max(bw - 1, 1), height: Math.abs(y0 - y1), fill: COLORS[si % COLORS.length], rx: 2,
        }, [s('title', { text: se.name + ' · ' + n.categories[i] + ' : ' + round(v) + unit })]));
        if (n.series.length === 1 && bw >= 22) {
          svg.append(s('text', { x: x + bw / 2, y: top1 - 5, class: 'lbl', 'text-anchor': 'middle', text: round(v) }));
        }
      }));
    } else {
      n.series.forEach((se, si) => {
        const col = COLORS[si % COLORS.length];
        const pts = se.values.map((v, i) => [L + band * (i + 0.5), y(v)]);
        svg.append(s('polyline', { points: pts.map((p) => p.join(',')).join(' '), fill: 'none', stroke: col, 'stroke-width': 2.5 }));
        pts.forEach((p, i) => svg.append(s('circle', { cx: p[0], cy: p[1], r: 4, fill: col }, [
          s('title', { text: se.name + ' · ' + n.categories[i] + ' : ' + round(se.values[i]) + unit }),
        ])));
      });
    }
    svg.append(s('line', { x1: L, x2: W - R, y1: y(0), y2: y(0), class: 'axis' }));
  }

  /* ---------- diagrammes (SVG natif) ---------- */

  function addArrowDefs(svg) {
    const defs = s('defs');
    const marker = s('marker', {
      id: 'rdt-arrow',
      viewBox: '0 0 10 10',
      refX: 9,
      refY: 5,
      markerWidth: 6,
      markerHeight: 6,
      orient: 'auto-start-reverse',
    });
    marker.append(s('path', { d: 'M 0 1.5 L 9 5 L 0 8.5 z', fill: 'currentColor' }));
    defs.append(marker);
    svg.append(defs);
  }

  function diagram(n) {
    const fig = h('figure', { class: 'diagram diagram-' + n.kind });
    if (n.title) fig.append(h('figcaption', { text: n.title }));
    let svg;
    switch (n.kind) {
      case 'flow': svg = renderFlow(n); break;
      case 'sequence': svg = renderSequence(n); break;
      case 'mindmap': svg = renderMindmap(n); break;
      case 'timeline': svg = renderTimeline(n); break;
      default:
        fig.append(h('div', { class: 'error', text: 'Type de diagramme inconnu : ' + n.kind }));
        return fig;
    }
    if (!svg) {
      fig.append(h('div', { class: 'error', text: 'Diagramme sans données' }));
      return fig;
    }
    fig.append(svg);
    return fig;
  }

  /* ---------- mesure et découpe du texte (le SVG ne revient pas à la ligne tout seul) ---------- */

  const measureCtx = (() => {
    try { return document.createElement('canvas').getContext('2d'); } catch (e) { return null; }
  })();
  let fontFamily = null;

  function textW(str, px, weight) {
    if (measureCtx) {
      if (fontFamily === null) fontFamily = getComputedStyle(document.body).fontFamily || 'sans-serif';
      measureCtx.font = (weight || 400) + ' ' + px + 'px ' + fontFamily;
      return measureCtx.measureText(str).width;
    }
    return String(str).length * px * 0.6;
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

  function sizeSvg(svg, w, hgt, minScale, maxScale) {
    svg.setAttribute('width', w);
    svg.setAttribute('height', hgt);
    svg.style.width = '100%';
    svg.style.maxWidth = Math.round(w * maxScale) + 'px';
    svg.style.minWidth = Math.round(w * minScale) + 'px';
  }

  function bez(p, t) {
    const u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return [a * p[0][0] + b * p[1][0] + c * p[2][0] + d * p[3][0], a * p[0][1] + b * p[1][1] + c * p[2][1] + d * p[3][1]];
  }

  function rectsHit(a, b, m) {
    return a.x < b.x + b.w + m && a.x + a.w + m > b.x && a.y < b.y + b.h + m && a.y + a.h + m > b.y;
  }

  function renderFlow(n) {
    if (!n.nodes || !n.nodes.length) return null;
    const dir = (n.dir || 'LR').toUpperCase();
    const isLR = dir === 'LR';

    const adj = {}, inEdges = {};
    n.nodes.forEach((u) => { adj[u] = []; inEdges[u] = []; });
    n.edges.forEach((e) => {
      if (adj[e.from]) adj[e.from].push(e);
      if (inEdges[e.to]) inEdges[e.to].push(e);
    });

    const state = {};
    const backEdges = new Set();
    function dfs(u) {
      state[u] = 1;
      for (const e of adj[u] || []) {
        if (state[e.to] === 1) backEdges.add(e);
        else if (!state[e.to]) dfs(e.to);
      }
      state[u] = 2;
    }
    n.nodes.forEach((u) => { if (!state[u]) dfs(u); });

    const rank = {};
    n.nodes.forEach((u) => { rank[u] = 0; });
    for (let iter = 0; iter < n.nodes.length; iter++) {
      let ch = false;
      for (const e of n.edges) {
        if (backEdges.has(e)) continue;
        if (rank[e.to] === undefined || rank[e.from] === undefined) continue;
        if (rank[e.to] < rank[e.from] + 1) {
          rank[e.to] = rank[e.from] + 1;
          ch = true;
        }
      }
      if (!ch) break;
    }

    const maxRank = Math.max(0, ...Object.values(rank));
    const ranks = [];
    for (let r = 0; r <= maxRank; r++) ranks.push([]);
    n.nodes.forEach((u) => { ranks[rank[u]].push(u); });

    for (let r = 1; r <= maxRank; r++) {
      const prevOrder = new Map(ranks[r - 1].map((u, i) => [u, i]));
      const score = new Map();
      ranks[r].forEach((u) => {
        const preds = (inEdges[u] || [])
          .filter((e) => !backEdges.has(e))
          .map((e) => prevOrder.get(e.from))
          .filter((idx) => idx !== undefined);
        const avg = preds.length ? preds.reduce((a, b) => a + b, 0) / preds.length : 0;
        score.set(u, avg);
      });
      ranks[r].sort((a, b) => (score.get(a) || 0) - (score.get(b) || 0));
    }

    /* Dimensions des noeuds : largeur mesurée, retour à la ligne au-delà de 230 px */
    const NODE_PX = 13, LINE_H = 16, LBL_PX = 11.5;
    const nodeW = {}, nodeH = {}, nodeLines = {};
    n.nodes.forEach((u) => {
      const lines = wrapText(u, 230, NODE_PX);
      nodeLines[u] = lines;
      nodeW[u] = Math.max(84, Math.ceil(Math.max(...lines.map((l) => textW(l, NODE_PX))) + 36));
      nodeH[u] = Math.max(38, lines.length * LINE_H + 22);
    });

    const edges = n.edges.filter((e) => nodeW[e.from] !== undefined && nodeW[e.to] !== undefined);
    const lblW = (e) => Math.ceil(textW(e.label, LBL_PX)) + 16;
    const LBL_H = 20;

    /* L'espace entre deux rangs s'adapte à la plus large étiquette qui le traverse */
    const gap = [];
    for (let r = 0; r < maxRank; r++) {
      let need = 0, count = 0;
      edges.forEach((e) => {
        if (backEdges.has(e) || !e.label) return;
        if (rank[e.from] === r && rank[e.to] === r + 1) {
          count++;
          need = Math.max(need, isLR ? lblW(e) + 38 : 0);
        }
      });
      /* en TD, chaque étiquette de la zone a besoin de sa propre hauteur */
      if (!isLR && count) need = count * (LBL_H + 8) + 28;
      gap.push(Math.max(isLR ? 54 : 46, need));
    }

    const nodeX = {}, nodeY = {};
    if (isLR) {
      const rowGap = 22;
      const rankW = ranks.map((list) => Math.max(...list.map((u) => nodeW[u])));
      let curX = 0;
      ranks.forEach((list, r) => {
        const hTotal = list.reduce((a, u) => a + nodeH[u], 0) + (list.length - 1) * rowGap;
        let y = -hTotal / 2;
        list.forEach((u) => {
          nodeX[u] = curX + (rankW[r] - nodeW[u]) / 2;
          nodeY[u] = y;
          y += nodeH[u] + rowGap;
        });
        curX += rankW[r] + (gap[r] || 0);
      });
    } else {
      const colGap = 40;
      let curY = 0;
      ranks.forEach((list, r) => {
        const wTotal = list.reduce((a, u) => a + nodeW[u], 0) + (list.length - 1) * colGap;
        const rowH = Math.max(...list.map((u) => nodeH[u]));
        let x = -wTotal / 2;
        list.forEach((u) => {
          nodeX[u] = x;
          nodeY[u] = curY + (rowH - nodeH[u]) / 2;
          x += nodeW[u] + colGap;
        });
        curY += rowH + (gap[r] || 0);
      });
    }

    const nodeRect = (u) => ({ x: nodeX[u], y: nodeY[u], w: nodeW[u], h: nodeH[u] });
    const nodeRects = n.nodes.map(nodeRect);

    /* ---------- géométrie des arêtes ---------- */
    const rankRange = (a, b) => {
      const lo = Math.min(rank[a], rank[b]), hi = Math.max(rank[a], rank[b]);
      return n.nodes.filter((u) => rank[u] >= lo && rank[u] <= hi);
    };
    const used = { top: 0, left: 0, right: 0 };
    const geo = edges.map((e) => {
      const from = e.from, to = e.to;
      const g = { e, fixed: null, back: backEdges.has(e) };
      if (!g.back) {
        let p;
        if (isLR) {
          const x1 = nodeX[from] + nodeW[from], y1 = nodeY[from] + nodeH[from] / 2;
          const x2 = nodeX[to], y2 = nodeY[to] + nodeH[to] / 2;
          const dx = Math.max(25, (x2 - x1) * 0.5);
          p = [[x1, y1], [x1 + dx, y1], [x2 - dx, y2], [x2, y2]];
        } else {
          const x1 = nodeX[from] + nodeW[from] / 2, y1 = nodeY[from] + nodeH[from];
          const x2 = nodeX[to] + nodeW[to] / 2, y2 = nodeY[to];
          const dy = Math.max(20, (y2 - y1) * 0.5);
          p = [[x1, y1], [x1, y1 + dy], [x2, y2 - dy], [x2, y2]];
        }
        g.p = p;
        return g;
      }

      if (isLR) {
        /* retour : arc au-dessus de tous les noeuds entre les deux rangs */
        const self = from === to;
        const x1 = nodeX[from] + nodeW[from] / 2 + (self ? 16 : 0), y1 = nodeY[from];
        const x2 = nodeX[to] + nodeW[to] / 2 - (self ? 16 : 0), y2 = nodeY[to];
        const top = Math.min(...rankRange(from, to).map((u) => nodeY[u]));
        const apex = top - 30 - 24 * used.top++;
        const c = (apex - (y1 + y2) / 8) / 0.75;
        g.p = [[x1, y1], [x1, c], [x2, c], [x2, y2]];
        g.apex = [(x1 + x2) / 2, apex];
        return g;
      }

      /* TD : retour par le côté libre (droite si possible, sinon gauche) */
      const extreme = (u, side) => {
        const list = ranks[rank[u]];
        return side === 'R' ? list[list.length - 1] === u : list[0] === u;
      };
      const side = (extreme(from, 'R') && extreme(to, 'R')) || !(extreme(from, 'L') && extreme(to, 'L')) ? 'R' : 'L';
      const span = rankRange(from, to);
      const edgeX = side === 'R'
        ? Math.max(...span.map((u) => nodeX[u] + nodeW[u]))
        : Math.min(...span.map((u) => nodeX[u]));
      const k = used[side === 'R' ? 'right' : 'left']++;
      const wl = e.label ? lblW(e) : 0;
      const archX = side === 'R' ? edgeX + 34 + (wl + 12) * k : edgeX - 34 - (wl + 12) * k;
      const x1 = side === 'R' ? nodeX[from] + nodeW[from] : nodeX[from], y1 = nodeY[from] + nodeH[from] / 2;
      const x2 = side === 'R' ? nodeX[to] + nodeW[to] : nodeX[to], y2 = nodeY[to] + nodeH[to] / 2;
      const c = (archX - (x1 + x2) / 8) / 0.75;
      g.p = [[x1, y1], [c, y1], [c, y2], [x2, y2]];
      if (e.label) {
        const w = lblW(e);
        g.fixed = { x: side === 'R' ? archX + 8 : archX - 8 - w, y: (y1 + y2) / 2 - LBL_H / 2, w, h: LBL_H };
      }
      return g;
    });

    /* ---------- placement des étiquettes sans collision ---------- */
    const placed = [];
    geo.filter((g) => g.fixed).forEach((g) => { g.box = g.fixed; placed.push(g.box); });
    const ts = isLR ? [0.5, 0.38, 0.62, 0.28, 0.72, 0.2, 0.8, 0.14, 0.86] : [0.5, 0.35, 0.65, 0.25, 0.75, 0.15, 0.85, 0.1, 0.9];
    geo.filter((g) => g.e.label && !g.fixed).forEach((g) => {
      const w = lblW(g.e);
      let best = null;
      for (const t of ts) {
        const [x, y] = g.back && g.apex && t === 0.5 ? g.apex : bez(g.p, t);
        /* en TD, une flèche oblique garde son tracé visible : l'étiquette se pose à côté */
        const side = !isLR && !g.back ? Math.sign(g.p[3][0] - g.p[0][0]) * (Math.abs(g.p[3][0] - g.p[0][0]) > 20) : 0;
        const bx = side > 0 ? x + 8 : side < 0 ? x - 8 - w : x - w / 2;
        const box = { x: bx, y: y - LBL_H / 2, w, h: LBL_H };
        const hit = nodeRects.some((r) => rectsHit(box, r, 2)) || placed.some((r) => rectsHit(box, r, 3));
        if (!hit) { best = box; break; }
        if (!best) best = box;
      }
      g.box = best;
      placed.push(best);
    });

    /* ---------- cadrage sur la géométrie réelle ---------- */
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const grow = (x, y) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); };
    nodeRects.forEach((r) => { grow(r.x, r.y); grow(r.x + r.w, r.y + r.h); });
    geo.forEach((g) => { for (let i = 0; i <= 20; i++) { const q = bez(g.p, i / 20); grow(q[0], q[1]); } });
    geo.forEach((g) => { if (g.box) { grow(g.box.x, g.box.y); grow(g.box.x + g.box.w, g.box.y + g.box.h); } });
    const PAD = 18;
    const totalW = Math.ceil(maxX - minX + PAD * 2), totalH = Math.ceil(maxY - minY + PAD * 2);

    const svg = s('svg', { viewBox: [minX - PAD, minY - PAD, totalW, totalH].join(' '), class: 'diagram-svg', role: 'img' });
    sizeSvg(svg, totalW, totalH, 0.7, 1.15);
    addArrowDefs(svg);

    geo.forEach((g) => {
      const p = g.p;
      const d = 'M ' + p[0].join(' ') + ' C ' + p[1].join(' ') + ', ' + p[2].join(' ') + ', ' + p[3].join(' ');
      svg.append(s('path', {
        d,
        class: 'diagram-edge' + (g.e.style === 'dashed' ? ' dashed' : ''),
        'marker-end': 'url(#rdt-arrow)',
      }));
    });

    n.nodes.forEach((u) => {
      const g = s('g', { class: 'diagram-node' });
      g.append(s('rect', { x: nodeX[u], y: nodeY[u], width: nodeW[u], height: nodeH[u], rx: 6, class: 'diagram-node-box' }));
      const lines = nodeLines[u];
      const y0 = nodeY[u] + nodeH[u] / 2 - ((lines.length - 1) * LINE_H) / 2 + 4.5;
      lines.forEach((l, i) => {
        g.append(s('text', {
          x: nodeX[u] + nodeW[u] / 2,
          y: y0 + i * LINE_H,
          class: 'diagram-node-text',
          'text-anchor': 'middle',
          text: l,
        }));
      });
      g.append(s('title', { text: u }));
      svg.append(g);
    });

    /* Étiquettes en dernier : jamais recouvertes par un noeud */
    geo.forEach((g) => {
      if (!g.box) return;
      svg.append(s('rect', { x: g.box.x, y: g.box.y, width: g.box.w, height: g.box.h, rx: 4, class: 'diagram-edge-bg' }));
      svg.append(s('text', {
        x: g.box.x + g.box.w / 2,
        y: g.box.y + g.box.h / 2 + 4,
        class: 'diagram-edge-label',
        'text-anchor': 'middle',
        text: g.e.label,
      }));
    });

    return svg;
  }

  function renderSequence(n) {
    if (!n.participants || !n.participants.length) return null;
    const parts = n.participants;
    const msgs = (n.messages || []).filter((m) => parts.includes(m.from) && parts.includes(m.to));

    const MSG_PX = 12.5, PART_PX = 13, LOOP_W = 34;
    const boxH = 34, topY = 20, stepH = 50;
    const idx = {};
    parts.forEach((p, i) => { idx[p] = i; });
    const boxW = parts.map((p) => Math.max(90, Math.ceil(textW(p, PART_PX, 600) + 28)));

    /* Écart entre lifelines : assez pour le plus long libellé qui les traverse */
    const gaps = parts.slice(1).map((_, i) => Math.max(120, (boxW[i] + boxW[i + 1]) / 2 + 24));
    const lblW = (m) => (m.label ? Math.ceil(textW(m.label, MSG_PX)) + 24 : 0);
    const spans = msgs
      .filter((m) => m.from !== m.to)
      .map((m) => ({ a: Math.min(idx[m.from], idx[m.to]), b: Math.max(idx[m.from], idx[m.to]), w: lblW(m) }))
      .sort((p, q) => (p.b - p.a) - (q.b - q.a));
    spans.forEach((sp) => {
      let have = 0;
      for (let i = sp.a; i < sp.b; i++) have += gaps[i];
      if (have < sp.w) gaps[sp.b - 1] += sp.w - have;
    });

    const partX = {};
    let cur = boxW[0] / 2;
    parts.forEach((p, i) => {
      if (i) cur += gaps[i - 1];
      partX[p] = cur;
    });
    /* libellé d'une boucle sur soi-même : place à droite de la lifeline */
    const loopRoom = Math.max(0, ...msgs.filter((m) => m.from === m.to).map((m) => {
      const room = LOOP_W + 8 + lblW(m);
      const i = idx[m.from];
      return i === parts.length - 1 ? room : room - gaps[i] + boxW[i + 1] / 2;
    }));
    const PAD = 24;
    const totalW = Math.ceil(partX[parts[parts.length - 1]] + boxW[parts.length - 1] / 2 + loopRoom + PAD * 2);
    const firstMsgY = topY + boxH + 34;
    const totalH = firstMsgY + msgs.length * stepH + 24;

    const svg = s('svg', { viewBox: [-PAD, 0, totalW, totalH].join(' '), class: 'diagram-svg', role: 'img' });
    sizeSvg(svg, totalW, totalH, 0.75, 1.2);
    addArrowDefs(svg);

    parts.forEach((p) => {
      svg.append(s('line', { x1: partX[p], y1: topY + boxH, x2: partX[p], y2: totalH - 12, class: 'seq-lifeline' }));
    });

    const labels = [];
    msgs.forEach((m, k) => {
      const y = firstMsgY + k * stepH;
      const x1 = partX[m.from], x2 = partX[m.to];
      const cls = 'diagram-edge' + (m.style === 'dashed' ? ' dashed' : '');

      if (x1 === x2) {
        const loopH = 24;
        const d = 'M ' + x1 + ' ' + y + ' L ' + (x1 + LOOP_W) + ' ' + y +
          ' L ' + (x1 + LOOP_W) + ' ' + (y + loopH) + ' L ' + (x1 + 3) + ' ' + (y + loopH);
        svg.append(s('path', { d, class: cls, 'marker-end': 'url(#rdt-arrow)' }));
        if (m.label) labels.push({ x: x1 + LOOP_W + 8, y: y + loopH / 2 + 4, anchor: 'start', text: m.label });
      } else {
        const targetX = x2 > x1 ? x2 - 1 : x2 + 1;
        svg.append(s('line', { x1, y1: y, x2: targetX, y2: y, class: cls, 'marker-end': 'url(#rdt-arrow)' }));
        if (m.label) labels.push({ x: (x1 + x2) / 2, y: y - 8, anchor: 'middle', text: m.label });
      }
    });

    /* Fond sous les libellés : une lifeline traversée ne raye plus le texte */
    labels.forEach((l) => {
      const w = Math.ceil(textW(l.text, MSG_PX)) + 10;
      svg.append(s('rect', {
        x: l.anchor === 'middle' ? l.x - w / 2 : l.x - 5,
        y: l.y - 13,
        width: w,
        height: 18,
        rx: 3,
        class: 'diagram-edge-bg seq-lbl-bg',
      }));
      svg.append(s('text', { x: l.x, y: l.y, class: 'seq-msg-text', 'text-anchor': l.anchor, text: l.text }));
    });

    parts.forEach((p, i) => {
      const cx = partX[p];
      const g = s('g', { class: 'seq-part' });
      g.append(s('rect', { x: cx - boxW[i] / 2, y: topY, width: boxW[i], height: boxH, rx: 5, class: 'seq-part-box' }));
      g.append(s('text', { x: cx, y: topY + boxH / 2 + 4.5, class: 'seq-part-text', 'text-anchor': 'middle', text: p }));
      g.append(s('title', { text: p }));
      svg.append(g);
    });

    return svg;
  }

  function renderMindmap(n) {
    if (!n.root) return null;
    const root = n.root;
    const branches = root.children || [];

    const leafCache = new Map();
    function countLeaves(node) {
      if (leafCache.has(node)) return leafCache.get(node);
      const v = !node.children || !node.children.length ? 1 : node.children.reduce((acc, c) => acc + countLeaves(c), 0);
      leafCache.set(node, v);
      return v;
    }

    const LEAF_H = 38, NODE_PX = 12.5, ROOT_PX = 13.5;
    let rightB = [], leftB = [];
    if (branches.length <= 1) {
      rightB = branches.map((b, i) => ({ b, color: COLORS[i % COLORS.length] }));
    } else {
      /* on équilibre les deux côtés selon le nombre de feuilles, pas selon la parité */
      const sizes = [0, 0];
      branches.forEach((b, i) => {
        const side = sizes[0] <= sizes[1] ? 0 : 1;
        sizes[side] += countLeaves(b);
        (side === 0 ? rightB : leftB).push({ b, color: COLORS[i % COLORS.length] });
      });
    }

    const rightLeaves = rightB.reduce((acc, x) => acc + countLeaves(x.b), 0);
    const leftLeaves = leftB.reduce((acc, x) => acc + countLeaves(x.b), 0);
    const totalH = Math.max(1, rightLeaves, leftLeaves) * LEAF_H;
    const rootY = totalH / 2;

    const rootW = Math.max(90, Math.ceil(textW(root.text, ROOT_PX, 700) + 36));
    const rootH = 40;

    const nodesToDraw = [{ x: 0, y: rootY, w: rootW, h: rootH, text: root.text, isRoot: true, color: COLORS[0] }];
    const edgesToDraw = [];

    /* Placement récursif, sans limite de profondeur */
    function place(node, level, startY, anchorX, anchorY, isRight, color) {
      const nH = countLeaves(node) * LEAF_H;
      const y = startY + nH / 2;
      const w = Math.max(64, Math.ceil(textW(node.text, NODE_PX) + 26));
      const h = level === 1 ? 32 : 28;
      const gapX = level === 1 ? 64 : 38;
      const x = isRight ? anchorX + gapX + w / 2 : anchorX - gapX - w / 2;
      nodesToDraw.push({ x, y, w, h, text: node.text, isRoot: false, color });
      edgesToDraw.push({ x1: anchorX, y1: anchorY, x2: isRight ? x - w / 2 : x + w / 2, y2: y, color });
      let childY = startY;
      (node.children || []).forEach((c) => {
        place(c, level + 1, childY, isRight ? x + w / 2 : x - w / 2, y, isRight, color);
        childY += countLeaves(c) * LEAF_H;
      });
    }

    function layoutSide(list, isRight) {
      const sideH = list.reduce((acc, x) => acc + countLeaves(x.b) * LEAF_H, 0);
      let curY = rootY - sideH / 2;
      list.forEach(({ b, color }) => {
        place(b, 1, curY, isRight ? rootW / 2 : -rootW / 2, rootY, isRight, color);
        curY += countLeaves(b) * LEAF_H;
      });
    }
    layoutSide(rightB, true);
    layoutSide(leftB, false);

    let minX = -rootW / 2, maxX = rootW / 2, minY = rootY - rootH / 2, maxY = rootY + rootH / 2;
    nodesToDraw.forEach((nd) => {
      minX = Math.min(minX, nd.x - nd.w / 2);
      maxX = Math.max(maxX, nd.x + nd.w / 2);
      minY = Math.min(minY, nd.y - nd.h / 2);
      maxY = Math.max(maxY, nd.y + nd.h / 2);
    });
    const pad = 24;
    const vbW = Math.ceil(maxX - minX + pad * 2);
    const vbH = Math.ceil(maxY - minY + pad * 2);

    const svg = s('svg', { viewBox: [Math.floor(minX - pad), Math.floor(minY - pad), vbW, vbH].join(' '), class: 'diagram-svg', role: 'img' });
    sizeSvg(svg, vbW, vbH, 0.7, 1.15);

    edgesToDraw.forEach((e) => {
      const dx = (e.x2 - e.x1) * 0.5;
      const d = 'M ' + e.x1 + ' ' + e.y1 + ' C ' + (e.x1 + dx) + ' ' + e.y1 + ', ' + (e.x2 - dx) + ' ' + e.y2 + ', ' + e.x2 + ' ' + e.y2;
      svg.append(s('path', { d, class: 'mindmap-edge', stroke: e.color, fill: 'none', 'stroke-width': 2.2 }));
    });

    nodesToDraw.forEach((nd) => {
      const g = s('g', { class: 'mindmap-node' + (nd.isRoot ? ' root' : '') });
      const rect = s('rect', {
        x: nd.x - nd.w / 2,
        y: nd.y - nd.h / 2,
        width: nd.w,
        height: nd.h,
        rx: nd.isRoot ? 10 : 6,
        class: 'mindmap-box' + (nd.isRoot ? ' root' : ''),
      });
      if (!nd.isRoot) rect.setAttribute('stroke', nd.color);
      g.append(rect);
      g.append(s('text', {
        x: nd.x,
        y: nd.y + 4.5,
        class: 'mindmap-text' + (nd.isRoot ? ' root' : ''),
        'text-anchor': 'middle',
        text: nd.text,
      }));
      g.append(s('title', { text: nd.text }));
      svg.append(g);
    });

    return svg;
  }

  function renderTimeline(n) {
    if (!n.items || !n.items.length) return null;

    const PERIOD_PX = 14, EV_PX = 13, LH = 18, PADX = 13, MAX_TEXT = 220, BULLET = 13;
    const STEM = 34, GAP = 14, MIN_DOT = 64, PAD = 20;

    /* Chaque carte : texte coupé à MAX_TEXT, largeur et hauteur mesurées */
    const cards = n.items.map((it) => {
      const multi = it.events.length > 1;
      const evLines = it.events.map((ev) => wrapText(ev, MAX_TEXT - (multi ? BULLET : 0), EV_PX));
      let tw = textW(it.period, PERIOD_PX, 700);
      evLines.forEach((ls) => ls.forEach((l) => { tw = Math.max(tw, textW(l, EV_PX) + (multi ? BULLET : 0)); }));
      const nLines = evLines.reduce((a, ls) => a + ls.length, 0);
      const w = Math.max(120, Math.ceil(tw + PADX * 2));
      const hgt = nLines ? 40 + (nLines - 1) * LH + (it.events.length - 1) * 5 + 12 : 32;
      return { it, multi, evLines, w, h: hgt };
    });

    /* Placement : les cartes alternent haut/bas, donc deux voisines de même côté se partagent la place */
    const xs = [];
    const lastRight = [-Infinity, -Infinity];
    cards.forEach((c, i) => {
      const side = i % 2;
      let x = i === 0 ? c.w / 2 : xs[i - 1] + MIN_DOT;
      x = Math.max(x, lastRight[side] + GAP + c.w / 2);
      xs.push(x);
      lastRight[side] = x + c.w / 2;
    });
    const minLeft = Math.min(...cards.map((c, i) => xs[i] - c.w / 2));
    const maxRight = Math.max(...cards.map((c, i) => xs[i] + c.w / 2));
    const off = PAD - minLeft;
    const totalW = Math.ceil(maxRight + off + PAD);

    const topH = Math.max(0, ...cards.filter((_, i) => i % 2 === 0).map((c) => c.h));
    const botH = Math.max(0, ...cards.filter((_, i) => i % 2 === 1).map((c) => c.h));
    const cy = PAD + (topH ? topH + STEM : 24);
    const totalH = Math.ceil(cy + (botH ? STEM + botH : 24) + PAD);

    const svg = s('svg', { viewBox: '0 0 ' + totalW + ' ' + totalH, class: 'diagram-svg', role: 'img' });
    sizeSvg(svg, totalW, totalH, 0.9, 1.3);
    addArrowDefs(svg);

    svg.append(s('line', {
      x1: 6,
      y1: cy,
      x2: totalW - 6,
      y2: cy,
      class: 'timeline-axis',
      'marker-end': 'url(#rdt-arrow)',
    }));

    cards.forEach((c, idx) => {
      const x = xs[idx] + off;
      const isTop = idx % 2 === 0;
      const color = COLORS[idx % COLORS.length];
      const cardY = isTop ? cy - STEM - c.h : cy + STEM;
      const left = x - c.w / 2;

      svg.append(s('line', {
        x1: x,
        y1: isTop ? cy - 7 : cy + 7,
        x2: x,
        y2: isTop ? cy - STEM : cy + STEM,
        class: 'timeline-stem',
        stroke: color,
        'stroke-width': 1.8,
      }));
      svg.append(s('circle', { cx: x, cy, r: 7, class: 'timeline-dot', fill: color }));

      const g = s('g', { class: 'timeline-item' });
      g.append(s('rect', { x: left, y: cardY, width: c.w, height: c.h, rx: 7, class: 'timeline-card' }));
      g.append(s('text', { x: left + PADX, y: cardY + 20, class: 'timeline-period', fill: color, text: c.it.period }));

      let y = cardY + 42;
      c.evLines.forEach((lines, j) => {
        lines.forEach((l, k) => {
          if (c.multi && k === 0) g.append(s('text', { x: left + PADX, y, class: 'timeline-event', text: '•' }));
          g.append(s('text', { x: left + PADX + (c.multi ? BULLET : 0), y, class: 'timeline-event', text: l }));
          y += LH;
        });
        y += 5;
      });

      g.append(s('title', { text: c.it.period + ' : ' + c.it.events.join(' | ') }));
      svg.append(g);
    });

    return svg;
  }

  function pie(svg, n) {
    const vals = n.series[0].values.map((v) => Math.max(0, v));
    const total = vals.reduce((a, b) => a + b, 0);
    if (!total) { svg.append(s('text', { x: 20, y: 40, class: 'lbl', text: 'Total nul' })); return; }
    const cx = 170, cy = 160, r = 120;
    let a0 = -Math.PI / 2;
    vals.forEach((v, i) => {
      if (!v) return;
      const frac = v / total, a1 = a0 + frac * 2 * Math.PI, col = COLORS[i % COLORS.length];
      const tip = s('title', { text: n.categories[i] + ' : ' + round(v) + (n.unit ? ' ' + n.unit : '') + ' (' + (frac * 100).toFixed(1) + ' %)' });
      if (frac > 0.9999) {
        svg.append(s('circle', { cx, cy, r, fill: col }, [tip]));
      } else {
        const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
        const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
        svg.append(s('path', {
          d: 'M' + cx + ' ' + cy + 'L' + x0 + ' ' + y0 + 'A' + r + ' ' + r + ' 0 ' + (frac > 0.5 ? 1 : 0) + ' 1 ' + x1 + ' ' + y1 + 'Z',
          fill: col, class: 'slice',
        }, [tip]));
      }
      a0 = a1;
    });
    n.categories.forEach((c, i) => {
      const yy = 40 + i * 22;
      svg.append(s('rect', { x: 340, y: yy - 10, width: 12, height: 12, fill: COLORS[i % COLORS.length], rx: 2 }));
      svg.append(s('text', { x: 358, y: yy, class: 'lbl', text: c + ' : ' + ((vals[i] / total) * 100).toFixed(1) + ' %' }));
    });
  }

  window.addEventListener('message', (e) => {
    const m = e.data;
    if (m && m.type === 'ast') breaks = m.breaks !== false;
    if (m && m.type === 'ast') root.replaceChildren(...blocks(m.ast.children));
  });
  vscode.postMessage({ type: 'ready' });
})();
