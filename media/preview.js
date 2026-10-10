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

    const nodeW = {}, nodeH = {};
    const boxH = 38;
    n.nodes.forEach((u) => {
      nodeW[u] = Math.max(80, Math.min(220, Math.round(u.length * 8.5 + 24)));
      nodeH[u] = boxH;
    });

    const nodeX = {}, nodeY = {};
    const pad = 24;
    let totalW = 0, totalH = 0;

    if (isLR) {
      const colGap = 50, rowGap = 20;
      const rankW = ranks.map((list) => Math.max(...list.map((u) => nodeW[u])));
      const colX = [];
      let curX = pad;
      rankW.forEach((w) => {
        colX.push(curX);
        curX += w + colGap;
      });
      totalW = curX - colGap + pad;

      const maxColH = Math.max(...ranks.map((list) => list.length * boxH + (list.length - 1) * rowGap));
      totalH = Math.max(boxH + pad * 2, maxColH + pad * 2);

      ranks.forEach((list, r) => {
        const hTotal = list.length * boxH + (list.length - 1) * rowGap;
        let startY = (totalH - hTotal) / 2;
        list.forEach((u) => {
          nodeX[u] = colX[r] + (rankW[r] - nodeW[u]) / 2;
          nodeY[u] = startY;
          startY += boxH + rowGap;
        });
      });
    } else {
      const rowGap = 45, colGap = 24;
      const rankH = ranks.map(() => boxH);
      const rowY = [];
      let curY = pad;
      rankH.forEach((h) => {
        rowY.push(curY);
        curY += h + rowGap;
      });
      totalH = curY - rowGap + pad;

      const maxRowW = Math.max(...ranks.map((list) => list.reduce((acc, u) => acc + nodeW[u], 0) + (list.length - 1) * colGap));
      totalW = Math.max(160, maxRowW + pad * 2);

      ranks.forEach((list, r) => {
        const wTotal = list.reduce((acc, u) => acc + nodeW[u], 0) + (list.length - 1) * colGap;
        let startX = (totalW - wTotal) / 2;
        list.forEach((u) => {
          nodeX[u] = startX;
          nodeY[u] = rowY[r];
          startX += nodeW[u] + colGap;
        });
      });
    }

    const svg = s('svg', { viewBox: '0 0 ' + totalW + ' ' + totalH, class: 'diagram-svg', role: 'img', width: totalW, height: totalH });
    svg.style.maxWidth = totalW + 'px';
    svg.style.width = '100%';
    addArrowDefs(svg);

    n.edges.forEach((e) => {
      const from = e.from, to = e.to;
      if (nodeX[from] === undefined || nodeX[to] === undefined) return;
      let x1, y1, x2, y2, d, midX, midY;
      const isBack = backEdges.has(e) || (isLR ? nodeX[to] <= nodeX[from] : nodeY[to] <= nodeY[from]);

      if (isLR) {
        if (!isBack) {
          x1 = nodeX[from] + nodeW[from];
          y1 = nodeY[from] + boxH / 2;
          x2 = nodeX[to];
          y2 = nodeY[to] + boxH / 2;
          const dx = Math.max(25, (x2 - x1) * 0.5);
          d = 'M ' + x1 + ' ' + y1 + ' C ' + (x1 + dx) + ' ' + y1 + ', ' + (x2 - dx) + ' ' + y2 + ', ' + x2 + ' ' + y2;
          midX = (x1 + x2) / 2;
          midY = (y1 + y2) / 2;
        } else {
          x1 = nodeX[from] + nodeW[from] / 2;
          y1 = nodeY[from];
          x2 = nodeX[to] + nodeW[to] / 2;
          y2 = nodeY[to];
          const archY = Math.max(10, Math.min(y1, y2) - 30);
          d = 'M ' + x1 + ' ' + y1 + ' C ' + x1 + ' ' + archY + ', ' + x2 + ' ' + archY + ', ' + x2 + ' ' + y2;
          midX = (x1 + x2) / 2;
          midY = archY;
        }
      } else {
        if (!isBack) {
          x1 = nodeX[from] + nodeW[from] / 2;
          y1 = nodeY[from] + boxH;
          x2 = nodeX[to] + nodeW[to] / 2;
          y2 = nodeY[to];
          const dy = Math.max(20, (y2 - y1) * 0.5);
          d = 'M ' + x1 + ' ' + y1 + ' C ' + x1 + ' ' + (y1 + dy) + ', ' + x2 + ' ' + (y2 - dy) + ', ' + x2 + ' ' + y2;
          midX = (x1 + x2) / 2;
          midY = (y1 + y2) / 2;
        } else {
          x1 = nodeX[from] + nodeW[from];
          y1 = nodeY[from] + boxH / 2;
          x2 = nodeX[to] + nodeW[to];
          y2 = nodeY[to] + boxH / 2;
          const archX = Math.max(x1, x2) + 35;
          d = 'M ' + x1 + ' ' + y1 + ' C ' + archX + ' ' + y1 + ', ' + archX + ' ' + y2 + ', ' + x2 + ' ' + y2;
          midX = archX;
          midY = (y1 + y2) / 2;
        }
      }

      svg.append(s('path', {
        d,
        class: 'diagram-edge' + (e.style === 'dashed' ? ' dashed' : ''),
        'marker-end': 'url(#rdt-arrow)',
      }));

      if (e.label) {
        const lw = Math.round(e.label.length * 6.5 + 12);
        svg.append(s('rect', {
          x: midX - lw / 2,
          y: midY - 9,
          width: lw,
          height: 18,
          rx: 3,
          class: 'diagram-edge-bg',
        }));
        svg.append(s('text', {
          x: midX,
          y: midY + 4,
          class: 'diagram-edge-label',
          'text-anchor': 'middle',
          text: e.label,
        }));
      }
    });

    n.nodes.forEach((u) => {
      const g = s('g', { class: 'diagram-node' });
      g.append(s('rect', {
        x: nodeX[u],
        y: nodeY[u],
        width: nodeW[u],
        height: boxH,
        rx: 6,
        class: 'diagram-node-box',
      }));
      g.append(s('text', {
        x: nodeX[u] + nodeW[u] / 2,
        y: nodeY[u] + boxH / 2 + 4,
        class: 'diagram-node-text',
        'text-anchor': 'middle',
        text: u,
      }));
      g.append(s('title', { text: u }));
      svg.append(g);
    });

    return svg;
  }

  function renderSequence(n) {
    if (!n.participants || !n.participants.length) return null;
    const parts = n.participants;
    const msgs = n.messages || [];

    const maxLblLen = Math.max(...msgs.map((m) => (m.label || '').length), 4);
    const colW = Math.max(140, Math.min(240, Math.round(maxLblLen * 7.5 + 40)));
    const padX = 30;
    const boxW = Math.min(130, colW - 20), boxH = 34;
    const stepH = 46;
    const totalW = padX * 2 + (parts.length - 1) * colW + boxW;
    const topY = 20, firstMsgY = topY + boxH + 30;
    const totalH = firstMsgY + msgs.length * stepH + 40;

    const partX = {};
    parts.forEach((p, i) => {
      partX[p] = padX + boxW / 2 + i * colW;
    });

    const svg = s('svg', { viewBox: '0 0 ' + totalW + ' ' + totalH, class: 'diagram-svg', role: 'img', width: totalW, height: totalH });
    svg.style.maxWidth = totalW + 'px';
    svg.style.width = '100%';
    addArrowDefs(svg);

    parts.forEach((p) => {
      const cx = partX[p];
      svg.append(s('line', {
        x1: cx,
        y1: topY + boxH,
        x2: cx,
        y2: totalH - 20,
        class: 'seq-lifeline',
      }));
    });

    msgs.forEach((m, idx) => {
      const y = firstMsgY + idx * stepH;
      const x1 = partX[m.from], x2 = partX[m.to];
      if (x1 === undefined || x2 === undefined) return;

      if (x1 === x2) {
        const loopW = 32, loopH = 22;
        const d = 'M ' + x1 + ' ' + y + ' L ' + (x1 + loopW) + ' ' + y +
          ' L ' + (x1 + loopW) + ' ' + (y + loopH) + ' L ' + (x1 + 4) + ' ' + (y + loopH);
        svg.append(s('path', {
          d,
          class: 'diagram-edge' + (m.style === 'dashed' ? ' dashed' : ''),
          'marker-end': 'url(#rdt-arrow)',
        }));
        if (m.label) {
          svg.append(s('text', {
            x: x1 + loopW + 6,
            y: y + 14,
            class: 'seq-msg-text',
            'text-anchor': 'start',
            text: m.label,
          }));
        }
      } else {
        const toRight = x2 > x1;
        const targetX = toRight ? x2 - 2 : x2 + 2;
        svg.append(s('line', {
          x1,
          y1: y,
          x2: targetX,
          y2: y,
          class: 'diagram-edge' + (m.style === 'dashed' ? ' dashed' : ''),
          'marker-end': 'url(#rdt-arrow)',
        }));
        if (m.label) {
          svg.append(s('text', {
            x: (x1 + x2) / 2,
            y: y - 6,
            class: 'seq-msg-text',
            'text-anchor': 'middle',
            text: m.label,
          }));
        }
      }
    });

    parts.forEach((p) => {
      const cx = partX[p];
      const g = s('g', { class: 'seq-part' });
      g.append(s('rect', {
        x: cx - boxW / 2,
        y: topY,
        width: boxW,
        height: boxH,
        rx: 5,
        class: 'seq-part-box',
      }));
      g.append(s('text', {
        x: cx,
        y: topY + boxH / 2 + 4,
        class: 'seq-part-text',
        'text-anchor': 'middle',
        text: p,
      }));
      g.append(s('title', { text: p }));
      svg.append(g);
    });

    return svg;
  }

  function renderMindmap(n) {
    if (!n.root) return null;
    const root = n.root;
    const branches = root.children || [];

    function countLeaves(node) {
      if (!node.children || !node.children.length) return 1;
      return node.children.reduce((acc, c) => acc + countLeaves(c), 0);
    }

    const leafH = 36;
    let rightB = [], leftB = [];
    if (branches.length <= 1) {
      rightB = branches.map((b, i) => ({ b, color: COLORS[i % COLORS.length] }));
    } else {
      branches.forEach((b, i) => {
        const item = { b, color: COLORS[i % COLORS.length] };
        if (i % 2 === 0) rightB.push(item);
        else leftB.push(item);
      });
    }

    const rightLeaves = rightB.reduce((acc, x) => acc + countLeaves(x.b), 0);
    const leftLeaves = leftB.reduce((acc, x) => acc + countLeaves(x.b), 0);
    const maxLeaves = Math.max(1, rightLeaves, leftLeaves);
    const totalH = Math.max(220, maxLeaves * leafH + 60);
    const rootY = totalH / 2;

    const rootW = Math.max(90, Math.min(200, Math.round(root.text.length * 9 + 28)));
    const rootH = 38;

    const nodesToDraw = [];
    const edgesToDraw = [];

    nodesToDraw.push({
      x: 0,
      y: rootY,
      w: rootW,
      h: rootH,
      text: root.text,
      isRoot: true,
      color: COLORS[0],
    });

    function layoutSide(sideBranches, isRight) {
      const totalSideH = sideBranches.reduce((acc, x) => acc + countLeaves(x.b) * leafH, 0);
      let curY = rootY - totalSideH / 2;

      sideBranches.forEach(({ b, color }) => {
        function place(node, level, parentX, parentY) {
          const lCount = countLeaves(node);
          const nH = lCount * leafH;
          const y = curY + nH / 2;
          const w = Math.max(70, Math.min(180, Math.round(node.text.length * 8 + 20)));
          const h = 30;
          const x = isRight ? parentX + 130 + w / 2 : parentX - 130 - w / 2;

          nodesToDraw.push({ x, y, w, h, text: node.text, isRoot: false, color });
          edgesToDraw.push({ x1: parentX, y1: parentY, x2: x, y2: y, color });

          if (node.children && node.children.length) {
            let childY = curY;
            node.children.forEach((c) => {
              const chLeaves = countLeaves(c);
              const cy = childY + (chLeaves * leafH) / 2;
              const cw = Math.max(60, Math.min(160, Math.round(c.text.length * 7.5 + 18)));
              const cx = isRight ? x + w / 2 + 40 + cw / 2 : x - w / 2 - 40 - cw / 2;
              nodesToDraw.push({ x: cx, y: cy, w: cw, h: 26, text: c.text, isRoot: false, color });
              edgesToDraw.push({ x1: isRight ? x + w / 2 : x - w / 2, y1: y, x2: cx, y2: cy, color });
              childY += chLeaves * leafH;
            });
          }
          curY += nH;
        }
        place(b, 1, isRight ? rootW / 2 : -rootW / 2, rootY);
      });
    }

    layoutSide(rightB, true);
    if (leftB.length) layoutSide(leftB, false);

    let minX = -rootW / 2, maxX = rootW / 2, minY = rootY - rootH / 2, maxY = rootY + rootH / 2;
    nodesToDraw.forEach((nd) => {
      minX = Math.min(minX, nd.x - nd.w / 2);
      maxX = Math.max(maxX, nd.x + nd.w / 2);
      minY = Math.min(minY, nd.y - nd.h / 2);
      maxY = Math.max(maxY, nd.y + nd.h / 2);
    });
    const pad = 24;
    const vbW = Math.round(maxX - minX + pad * 2);
    const vbH = Math.round(maxY - minY + pad * 2);
    const vbX = Math.round(minX - pad);
    const vbY = Math.round(minY - pad);

    const svg = s('svg', { viewBox: vbX + ' ' + vbY + ' ' + vbW + ' ' + vbH, class: 'diagram-svg', role: 'img', width: vbW, height: vbH });
    svg.style.maxWidth = vbW + 'px';
    svg.style.width = '100%';

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
        y: nd.y + 4,
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
    const items = n.items;

    const maxEvLen = Math.max(...items.flatMap((it) => it.events.map((e) => e.length)), 6);
    const cardW = Math.max(160, Math.min(240, Math.round(maxEvLen * 7.5 + 24)));
    const stepW = cardW + 30;
    const padX = 40;
    const totalW = padX * 2 + items.length * stepW;
    const cy = 160;
    const totalH = 320;

    const svg = s('svg', { viewBox: '0 0 ' + totalW + ' ' + totalH, class: 'diagram-svg', role: 'img', width: totalW, height: totalH });
    svg.style.maxWidth = totalW + 'px';
    svg.style.width = '100%';
    addArrowDefs(svg);

    svg.append(s('line', {
      x1: 20,
      y1: cy,
      x2: totalW - 20,
      y2: cy,
      class: 'timeline-axis',
      'marker-end': 'url(#rdt-arrow)',
    }));

    items.forEach((it, idx) => {
      const x = padX + idx * stepW + stepW / 2;
      const isTop = idx % 2 === 0;
      const color = COLORS[idx % COLORS.length];

      svg.append(s('circle', { cx: x, cy, r: 6, class: 'timeline-dot', fill: color }));

      const cardH = 26 + it.events.length * 20;
      const cardY = isTop ? cy - 30 - cardH : cy + 30;

      svg.append(s('line', {
        x1: x,
        y1: isTop ? cy - 6 : cy + 6,
        x2: x,
        y2: isTop ? cy - 30 : cy + 30,
        class: 'timeline-stem',
        stroke: color,
        'stroke-width': 1.8,
      }));

      const g = s('g', { class: 'timeline-item' });
      g.append(s('rect', {
        x: x - cardW / 2,
        y: cardY,
        width: cardW,
        height: cardH,
        rx: 6,
        class: 'timeline-card',
      }));

      g.append(s('text', {
        x: x - cardW / 2 + 10,
        y: cardY + 16,
        class: 'timeline-period',
        fill: color,
        text: it.period,
      }));

      it.events.forEach((ev, j) => {
        g.append(s('text', {
          x: x - cardW / 2 + 12,
          y: cardY + 34 + j * 18,
          class: 'timeline-event',
          text: (it.events.length > 1 ? '• ' : '') + ev,
        }));
      });

      g.append(s('title', { text: it.period + ' : ' + it.events.join(' | ') }));
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
