/* RDTMD : timeline (horizontale ou verticale, avec sections) et gantt. */
(function () {
  'use strict';
  const K = window.RDTKit;
  const { s, textW, wrapText, ellipsize, palette, sizeSvg, addDefs } = K;

  const lang = () => (typeof navigator !== 'undefined' && navigator.language) || 'fr';

  /* ====================================================================== */
  /* timeline                                                                */
  /* ====================================================================== */

  function renderTimeline(n) {
    if (!n.items || !n.items.length) return null;
    return n.orient === 'vertical' ? timelineVertical(n) : timelineHorizontal(n);
  }

  function measureCards(n, maxText) {
    const PERIOD_PX = 14, EV_PX = 13, LH = 18, PADX = 13, BULLET = 13;
    const cards = n.items.map((it) => {
      const multi = it.events.length > 1;
      const evLines = it.events.map((ev) => wrapText(ev, maxText - (multi ? BULLET : 0), EV_PX));
      let tw = textW(it.period, PERIOD_PX, 700);
      evLines.forEach((ls) => ls.forEach((l) => { tw = Math.max(tw, textW(l, EV_PX) + (multi ? BULLET : 0)); }));
      const nLines = evLines.reduce((a, ls) => a + ls.length, 0);
      return {
        it, multi, evLines, w: Math.max(120, Math.ceil(tw + PADX * 2)),
        h: nLines ? 40 + (nLines - 1) * LH + (it.events.length - 1) * 5 + 12 : 32,
      };
    });
    return { cards, PADX, BULLET, LH };
  }

  /** Couleur d'un item : par section si le diagramme en a, sinon par rang. */
  function colorsFor(n, pal) {
    const secs = n.sections || [];
    return n.items.map((it, i) => (secs.length && it.section ? pal[secs.indexOf(it.section) % pal.length] : pal[i % pal.length]));
  }

  function drawCard(g, c, left, top, color, M) {
    g.append(s('rect', { x: left, y: top, width: c.w, height: c.h, rx: 7, class: 'timeline-card' }));
    g.append(s('text', { x: left + M.PADX, y: top + 20, class: 'timeline-period', fill: color, text: c.it.period }));
    let y = top + 42;
    c.evLines.forEach((lines) => {
      lines.forEach((l, k) => {
        if (c.multi && k === 0) g.append(s('text', { x: left + M.PADX, y, class: 'timeline-event', text: '•' }));
        g.append(s('text', { x: left + M.PADX + (c.multi ? M.BULLET : 0), y, class: 'timeline-event', text: l }));
        y += M.LH;
      });
      y += 5;
    });
    g.append(s('title', { text: c.it.period + ' : ' + c.it.events.join(' | ') }));
  }

  function sectionLegend(svg, n, pal, x, y) {
    let cx = x;
    (n.sections || []).forEach((name, i) => {
      svg.append(s('circle', { cx: cx + 5, cy: y, r: 5, fill: pal[i % pal.length] }));
      const t = s('text', { x: cx + 15, y: y + 4, class: 'timeline-section', text: name });
      svg.append(t);
      cx += 15 + textW(name, 12.5, 600) + 22;
    });
    return cx;
  }

  function timelineHorizontal(n) {
    const pal = palette(n);
    const STEM = 34, GAP = 14, MIN_DOT = 64, PAD = 20;
    const M = measureCards(n, 220);
    const cards = M.cards;
    const colors = colorsFor(n, pal);

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
    const legendH = (n.sections || []).length ? 34 : 0;
    const legendW = (n.sections || []).reduce((a, name) => a + 15 + textW(name, 12.5, 600) + 22, 0);
    const totalW = Math.ceil(Math.max(maxRight + off + PAD, legendW + PAD * 2));

    const topH = Math.max(0, ...cards.filter((_, i) => i % 2 === 0).map((c) => c.h));
    const botH = Math.max(0, ...cards.filter((_, i) => i % 2 === 1).map((c) => c.h));
    const cy = PAD + (topH ? topH + STEM : 24);
    const totalH = Math.ceil(cy + (botH ? STEM + botH : 24) + PAD + legendH);

    const svg = s('svg', { viewBox: '0 0 ' + totalW + ' ' + totalH, class: 'diagram-svg', role: 'img' });
    sizeSvg(svg, totalW, totalH, 0.9, 1.3, n);
    const mk = addDefs(svg);
    svg.append(s('line', { x1: 6, y1: cy, x2: totalW - 6, y2: cy, class: 'timeline-axis', 'marker-end': 'url(#' + mk.arrow + ')' }));

    cards.forEach((c, i) => {
      const x = xs[i] + off, isTop = i % 2 === 0, color = colors[i];
      const cardY = isTop ? cy - STEM - c.h : cy + STEM;
      svg.append(s('line', { x1: x, y1: isTop ? cy - 7 : cy + 7, x2: x, y2: isTop ? cy - STEM : cy + STEM, class: 'timeline-stem', stroke: color, 'stroke-width': 1.8 }));
      svg.append(s('circle', { cx: x, cy, r: 7, class: 'timeline-dot', fill: color }));
      const g = s('g', { class: 'timeline-item' });
      drawCard(g, c, x - c.w / 2, cardY, color, M);
      svg.append(g);
    });
    if (legendH) sectionLegend(svg, n, pal, PAD, totalH - PAD - 4);
    return svg;
  }

  function timelineVertical(n) {
    const pal = palette(n);
    const M = measureCards(n, 320);
    const cards = M.cards;
    const colors = colorsFor(n, pal);
    const AX = 26, CARD_X = AX + 32, GAP = 14, PAD = 20, SEC_H = 30;
    const cardW = Math.max(...cards.map((c) => c.w));

    let y = PAD;
    const rows = [];
    let sec = null;
    cards.forEach((c, i) => {
      if (n.sections.length && c.it.section !== sec) {
        sec = c.it.section;
        if (sec) { rows.push({ section: sec, y }); y += SEC_H; }
      }
      rows.push({ c, i, y });
      y += c.h + GAP;
    });
    const totalW = Math.ceil(CARD_X + cardW + PAD), totalH = Math.ceil(y - GAP + PAD + 6);

    const svg = s('svg', { viewBox: '0 0 ' + totalW + ' ' + totalH, class: 'diagram-svg', role: 'img' });
    sizeSvg(svg, totalW, totalH, 0.8, 1.3, n);
    const mk = addDefs(svg);
    svg.append(s('line', { x1: AX, y1: 6, x2: AX, y2: totalH - 6, class: 'timeline-axis', 'marker-end': 'url(#' + mk.arrow + ')' }));

    rows.forEach((r) => {
      if (r.section) {
        const si = n.sections.indexOf(r.section);
        svg.append(s('text', { x: CARD_X, y: r.y + 16, class: 'timeline-section', fill: pal[si % pal.length], text: r.section }));
        return;
      }
      const color = colors[r.i], dotY = r.y + 20;
      svg.append(s('line', { x1: AX + 7, y1: dotY, x2: CARD_X, y2: dotY, class: 'timeline-stem', stroke: color, 'stroke-width': 1.8 }));
      svg.append(s('circle', { cx: AX, cy: dotY, r: 7, class: 'timeline-dot', fill: color }));
      const g = s('g', { class: 'timeline-item' });
      drawCard(g, { ...r.c, w: cardW }, CARD_X, r.y, color, M);
      svg.append(g);
    });
    return svg;
  }

  /* ====================================================================== */
  /* gantt                                                                   */
  /* ====================================================================== */

  const lum = (hex) => {
    const m = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex);
    if (!m) return 0;
    let v = m[1];
    if (v.length === 3) v = v.split('').map((c) => c + c).join('');
    const r = parseInt(v.slice(0, 2), 16), g = parseInt(v.slice(2, 4), 16), b = parseInt(v.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  };
  const fmtDay = (day, opts) => new Date(day * 86400000).toLocaleDateString(lang(), { ...opts, timeZone: 'UTC' });
  const dow = (day) => (new Date(day * 86400000).getUTCDay() + 6) % 7;

  function renderGantt(n) {
    const tasks = n.tasks || [];
    if (!tasks.length) return null;
    const pal = palette(n);
    const CRIT = '#e65c7a';
    let minD = Math.min(...tasks.map((t) => t.startDay)), maxD = Math.max(...tasks.map((t) => Math.max(t.endDay, t.startDay + 1)));
    if (maxD - minD < 7) maxD = minD + 7;
    const days = maxD - minD;

    const sectionNames = n.sections && n.sections.length ? n.sections : [];
    const NAME_PX = 12.5;
    const nameW = Math.min(210, Math.ceil(Math.max(...tasks.map((t) => textW(t.name, NAME_PX)), ...sectionNames.map((x) => textW(x, 12.5, 700) + 14))) + 14);
    const leftW = Math.max(110, nameW + 8);
    const chartW = Math.max(460, Math.min(720, days * 22));
    const dayW = chartW / days;
    const HEAD = 44, ROW = 30, SEC = 28, PAD = 14;
    const X = (d) => leftW + (d - minD) * dayW;

    /* lignes : tâches sans section d'abord, puis chaque section */
    const rows = [];
    const bySec = (name) => tasks.filter((t) => (t.section || '') === name);
    const order = [''].concat(sectionNames);
    order.forEach((name) => {
      const list = bySec(name);
      if (!list.length) return;
      if (name) rows.push({ section: name });
      list.forEach((t) => rows.push({ t }));
    });
    let y = HEAD;
    rows.forEach((r) => { r.y = y; r.h = r.section ? SEC : ROW; y += r.h; });
    const totalW = Math.ceil(leftW + chartW + PAD), totalH = Math.ceil(y + PAD);

    const svg = s('svg', { viewBox: '0 0 ' + totalW + ' ' + totalH, class: 'diagram-svg', role: 'img' });
    sizeSvg(svg, totalW, totalH, 0.7, 1.15, n);
    addDefs(svg);

    /* bandes de lignes et grille */
    let band = 0;
    rows.forEach((r) => {
      if (r.section) { svg.append(s('rect', { x: 0, y: r.y, width: totalW - PAD / 2, height: r.h, class: 'gantt-sec-bg' })); return; }
      if (band++ % 2) svg.append(s('rect', { x: 0, y: r.y, width: totalW - PAD / 2, height: r.h, class: 'gantt-band' }));
    });

    const ticks = [];
    if (dayW >= 16) {
      for (let d = minD; d <= maxD; d++) ticks.push({ d, label: fmtDay(d, { day: 'numeric' }), major: dow(d) === 0 });
    } else if (days <= 150) {
      for (let d = minD; d <= maxD; d++) if (dow(d) === 0) ticks.push({ d, label: fmtDay(d, { day: 'numeric', month: 'short' }), major: true });
    } else {
      for (let d = minD; d <= maxD; d++) {
        if (new Date(d * 86400000).getUTCDate() === 1) ticks.push({ d, label: fmtDay(d, { month: 'short', year: '2-digit' }), major: true });
      }
    }
    ticks.forEach((t) => {
      svg.append(s('line', { x1: X(t.d), x2: X(t.d), y1: HEAD - 6, y2: totalH - PAD, class: 'gantt-grid' + (t.major ? ' major' : '') }));
      svg.append(s('text', { x: X(t.d) + (dayW >= 16 ? dayW / 2 : 3), y: HEAD - 12, class: 'gantt-tick', 'text-anchor': dayW >= 16 ? 'middle' : 'start', text: t.label }));
    });
    if (dayW >= 16) {
      let m = -1;
      for (let d = minD; d <= maxD; d++) {
        const dt = new Date(d * 86400000);
        if (dt.getUTCMonth() !== m) {
          m = dt.getUTCMonth();
          svg.append(s('text', { x: X(d) + 2, y: 14, class: 'gantt-month', text: fmtDay(d, { month: 'long', year: 'numeric' }) }));
        }
      }
    }
    svg.append(s('line', { x1: 0, x2: totalW - PAD / 2, y1: HEAD - 6, y2: HEAD - 6, class: 'gantt-axis' }));

    /* aujourd'hui */
    if (n.today) {
      const today = Math.floor(Date.now() / 86400000);
      if (today >= minD && today <= maxD) {
        svg.append(s('line', { x1: X(today) + dayW / 2, x2: X(today) + dayW / 2, y1: HEAD - 6, y2: totalH - PAD, class: 'gantt-today' }));
        svg.append(s('text', { x: X(today) + dayW / 2, y: totalH - 3, class: 'gantt-today-label', 'text-anchor': 'middle', text: 'Aujourd\'hui' }));
      }
    }

    /* barres */
    rows.forEach((r) => {
      if (r.section) {
        const si = sectionNames.indexOf(r.section);
        svg.append(s('circle', { cx: 12, cy: r.y + r.h / 2, r: 4.5, fill: pal[si % pal.length] }));
        svg.append(s('text', { x: 24, y: r.y + r.h / 2 + 4.5, class: 'gantt-sec', text: r.section }));
        return;
      }
      const t = r.t;
      const si = sectionNames.indexOf(t.section || '');
      const base = pal[(si < 0 ? 0 : si) % pal.length];
      const col = t.status === 'crit' ? CRIT : base;
      const g = s('g', { class: 'gantt-task' + (t.status ? ' ' + t.status : ''), 'data-id': t.name });
      const nm = ellipsize(t.name, nameW - 4, NAME_PX);
      g.append(s('text', { x: 12, y: r.y + r.h / 2 + 4.5, class: 'gantt-name', text: nm }));
      const cy = r.y + r.h / 2;
      const range = fmtDay(t.startDay, { day: 'numeric', month: 'short' }) + (t.milestone ? '' : ' → ' + fmtDay(t.endDay - 1, { day: 'numeric', month: 'short' }));
      if (t.milestone) {
        const x = X(t.startDay), d = 9;
        g.append(s('polygon', { points: [[x, cy - d], [x + d, cy], [x, cy + d], [x - d, cy]].map((p) => p.join(',')).join(' '), fill: col, class: 'gantt-milestone' }));
      } else {
        const x = X(t.startDay), w = Math.max(5, (t.endDay - t.startDay) * dayW);
        g.append(s('rect', {
          x, y: cy - 9, width: w, height: 18, rx: 4, fill: col, class: 'gantt-bar', 'fill-opacity': t.status === 'done' ? 0.5 : 1,
        }));
        if (t.status === 'active') g.append(s('rect', { x, y: cy - 9, width: w, height: 18, rx: 4, class: 'gantt-active-ring' }));
        const dur = t.endDay - t.startDay;
        const label = (t.status === 'done' ? '✓ ' : '') + dur + 'j';
        if (textW(label, 11, 600) + 10 < w) {
          g.append(s('text', { x: x + w / 2, y: cy + 4, class: 'gantt-bar-text', 'text-anchor': 'middle', fill: lum(col) > 0.62 ? '#14181c' : '#ffffff', text: label }));
        }
      }
      g.append(s('title', { text: t.name + ' : ' + range + (t.status ? ' (' + t.status + ')' : '') }));
      svg.append(g);
    });
    return svg;
  }

  K.diagrams.timeline = renderTimeline;
  K.diagrams.gantt = renderGantt;
})();
