/* RDTMD : graphiques SVG natifs (bar, line, area, scatter, pie, donut). */
(function () {
  'use strict';
  const K = window.RDTKit;
  const { h, s, textW, palette, sizeSvg, ellipsize } = K;

  const W = 640;
  const round = (v) => Math.round(v * 100) / 100;
  const clean = (v) => Number(v.toPrecision(12));
  const fmt = (v) => String(round(v));

  /* ---------- échelles ---------- */
  function niceScale(mn, mx, zero) {
    if (zero) { mn = Math.min(0, mn); mx = Math.max(0, mx); }
    if (mx === mn) { mx = mn + 1; if (!zero) mn -= 1; }
    const raw = (mx - mn) / 4;
    const e = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / e;
    const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
    const lo = clean(Math.floor(mn / step + 1e-9) * step);
    const hi = clean(Math.ceil(mx / step - 1e-9) * step);
    const ticks = [];
    for (let v = lo, i = 0; v <= hi + step * 1e-6 && i < 24; v += step, i++) ticks.push(clean(v));
    return { lo, hi, ticks };
  }

  /** min/max des valeurs d'un groupe de séries (empilées ou non). */
  function extents(series, count, stack) {
    let mn = 0, mx = 0;
    if (!series.length) return [0, 1];
    if (stack) {
      for (let i = 0; i < count; i++) {
        let pos = 0, neg = 0;
        series.forEach((se) => { const v = se.values[i] || 0; if (v >= 0) pos += v; else neg += v; });
        mx = Math.max(mx, pos);
        mn = Math.min(mn, neg);
      }
    } else {
      series.forEach((se) => se.values.forEach((v) => { mn = Math.min(mn, v); mx = Math.max(mx, v); }));
    }
    return [mn, mx];
  }

  /* ---------- figure ---------- */
  function render(n) {
    const fig = h('figure', { class: 'chart' });
    if (n.title) fig.append(h('figcaption', { text: n.title }));
    const pie = n.kind === 'pie' || n.kind === 'donut';
    if (!n.series.length || (!n.categories.length && n.kind !== 'scatter') || (n.kind === 'scatter' && !n.series.some((x) => x.points.length))) {
      fig.append(h('div', { class: 'error', text: 'Graphique vide' }));
      return fig;
    }
    const pal = palette(n);
    const svg = s('svg', { class: 'chart-svg', role: 'img' });
    let H = 320;
    if (pie) H = pieChart(svg, n, pal);
    else if (n.kind === 'scatter') H = scatter(svg, n, pal);
    else if (n.kind === 'bar' && n.horizontal) H = hbar(svg, n, pal);
    else H = cartesian(svg, n, pal);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    sizeSvg(svg, W, H, 0.6, 1, n);
    fig.append(svg);
    if (!pie && n.series.length > 1) {
      fig.append(h('div', { class: 'legend' }, n.series.map((se, i) => {
        const sw = h('span', { class: 'sw' });
        sw.style.background = pal[i % pal.length];
        return h('span', { class: 'legend-item' }, [sw, se.name + (se.axis === 'y2' ? ' (axe droit)' : '')]);
      })));
    }
    return fig;
  }

  const txt = (svg, x, y, text, anchor, cls) =>
    svg.append(s('text', { x, y, class: cls || 'lbl', 'text-anchor': anchor || 'start', text }));

  /* ---------- bar vertical, line, area (axe secondaire possible) ---------- */
  function cartesian(svg, n, pal) {
    const H = 320;
    const cats = n.categories;
    const isBar = n.kind === 'bar', isArea = n.kind === 'area';
    const stack = !!n.stack && (isBar || isArea);
    const indexOf = (se) => n.series.indexOf(se);
    const left = n.series.filter((se) => se.axis !== 'y2');
    const right = n.series.filter((se) => se.axis === 'y2');
    const bars = isBar ? left : [];
    const lines = isBar ? right : n.series;
    const [mn, mx] = isBar ? extents(bars, cats.length, stack) : extents(left, cats.length, stack);
    const yS = niceScale(mn, mx, true);
    const hasY2 = right.length > 0;
    const [mn2, mx2] = hasY2 ? extents(right, cats.length, false) : [0, 1];
    const y2S = hasY2 ? niceScale(mn2, mx2, true) : null;

    const maxLen = (ticks) => Math.max(...ticks.map((v) => fmt(v).length));
    const L = Math.max(56, Math.ceil(maxLen(yS.ticks) * 8.5) + 16) + (n.ylabel ? 16 : 0);
    const R = hasY2 ? Math.max(48, Math.ceil(maxLen(y2S.ticks) * 8.5) + 16) : 18;
    const T = n.unit || n.unit2 ? 34 : 20;

    const pw = W - L - R;
    const band = pw / cats.length;
    const maxCatLen = Math.max(...cats.map((c) => String(c).length));
    const estCatW = maxCatLen * 7.5;
    const rotate = band < 52 || band < estCatW || (cats.length > 6 && maxCatLen >= 4);
    const B = (rotate ? Math.min(88, Math.max(50, 24 + Math.round(estCatW * 0.7))) : 44) + (n.xlabel ? 18 : 0);
    const ph = H - T - B;
    const y = (v) => T + ph * (1 - (v - yS.lo) / (yS.hi - yS.lo));
    const yR = hasY2 ? (v) => T + ph * (1 - (v - y2S.lo) / (y2S.hi - y2S.lo)) : y;
    const unit = n.unit ? ' ' + n.unit : '', unit2 = n.unit2 ? ' ' + n.unit2 : '';

    yS.ticks.forEach((v) => {
      const yy = y(v);
      svg.append(s('line', { x1: L, x2: W - R, y1: yy, y2: yy, class: 'grid' }));
      txt(svg, L - 8, yy + 4, fmt(v), 'end');
    });
    if (hasY2) y2S.ticks.forEach((v) => txt(svg, W - R + 8, yR(v) + 4, fmt(v), 'start'));
    if (n.unit) txt(svg, L, 15, n.unit, 'start', 'lbl chart-unit');
    if (n.unit2 && hasY2) txt(svg, W - R, 15, n.unit2, 'end', 'lbl chart-unit');
    if (n.xlabel) txt(svg, L + pw / 2, H - 6, n.xlabel, 'middle', 'lbl chart-unit');
    if (n.ylabel) {
      svg.append(s('text', { x: 12, y: T + ph / 2, class: 'lbl chart-unit', 'text-anchor': 'middle', transform: 'rotate(-90 12 ' + (T + ph / 2) + ')', text: n.ylabel }));
    }

    cats.forEach((c, i) => {
      const cx = L + band * (i + 0.5), cy = H - B + 18;
      if (rotate) {
        const lbl = s('text', { x: cx, y: cy, class: 'lbl', 'text-anchor': 'end', transform: 'rotate(-40 ' + cx + ' ' + cy + ')', text: c });
        if (band < 26) lbl.setAttribute('font-size', '10.5px');
        svg.append(lbl);
      } else {
        txt(svg, cx, cy, c, 'middle');
      }
    });

    if (isBar) {
      const gw = band * 0.7;
      if (stack) {
        cats.forEach((_, i) => {
          let pos = 0, neg = 0;
          bars.forEach((se) => {
            const v = se.values[i] || 0;
            const from = v >= 0 ? pos : neg, to = from + v;
            if (v >= 0) pos = to; else neg = to;
            svg.append(s('rect', {
              x: L + band * i + (band - gw) / 2, y: Math.min(y(from), y(to)), width: Math.max(gw - 1, 1), height: Math.abs(y(from) - y(to)),
              fill: pal[indexOf(se) % pal.length], rx: 2,
            }, [s('title', { text: se.name + ' · ' + cats[i] + ' : ' + fmt(v) + unit })]));
          });
        });
      } else {
        const bw = gw / Math.max(1, bars.length);
        bars.forEach((se, si) => se.values.forEach((v, i) => {
          const x = L + band * i + (band - gw) / 2 + bw * si;
          const y0 = y(0), y1 = y(v), top = Math.min(y0, y1);
          svg.append(s('rect', {
            x, y: top, width: Math.max(bw - 1, 1), height: Math.abs(y0 - y1), fill: pal[indexOf(se) % pal.length], rx: 2,
          }, [s('title', { text: se.name + ' · ' + cats[i] + ' : ' + fmt(v) + unit })]));
          if (bars.length === 1 && right.length === 0 && bw >= 22) txt(svg, x + bw / 2, top - 5, fmt(v), 'middle');
        }));
      }
    } else if (isArea) {
      const cum = cats.map(() => 0);
      lines.forEach((se, si) => {
        const col = pal[indexOf(se) % pal.length];
        const scale = se.axis === 'y2' ? yR : y;
        const top = se.values.map((v, i) => [L + band * (i + 0.5), scale((stack ? cum[i] : 0) + v)]);
        const base = se.values.map((_, i) => [L + band * (i + 0.5), scale(stack ? cum[i] : 0)]);
        const poly = top.concat(base.slice().reverse()).map((p) => p.join(',')).join(' ');
        svg.append(s('polygon', { points: poly, fill: col, 'fill-opacity': 0.28 }));
        svg.append(s('polyline', { points: top.map((p) => p.join(',')).join(' '), fill: 'none', stroke: col, 'stroke-width': 2.2 }));
        top.forEach((p, i) => svg.append(s('circle', { cx: p[0], cy: p[1], r: 3.5, fill: col }, [
          s('title', { text: se.name + ' · ' + cats[i] + ' : ' + fmt(se.values[i]) + (se.axis === 'y2' ? unit2 : unit) }),
        ])));
        if (stack) se.values.forEach((v, i) => { cum[i] += v; });
        void si;
      });
    }

    if (!isArea) {
      lines.forEach((se) => {
        const col = pal[indexOf(se) % pal.length];
        const scale = se.axis === 'y2' ? yR : y;
        const pts = se.values.map((v, i) => [L + band * (i + 0.5), scale(v)]);
        svg.append(s('polyline', { points: pts.map((p) => p.join(',')).join(' '), fill: 'none', stroke: col, 'stroke-width': 2.5 }));
        pts.forEach((p, i) => svg.append(s('circle', { cx: p[0], cy: p[1], r: 4, fill: col }, [
          s('title', { text: se.name + ' · ' + cats[i] + ' : ' + fmt(se.values[i]) + (se.axis === 'y2' ? unit2 : unit) }),
        ])));
      });
    }
    svg.append(s('line', { x1: L, x2: W - R, y1: y(0), y2: y(0), class: 'axis' }));
    if (hasY2) svg.append(s('line', { x1: W - R, x2: W - R, y1: T, y2: T + ph, class: 'axis' }));
    return H;
  }

  /* ---------- bar horizontal ---------- */
  function hbar(svg, n, pal) {
    const cats = n.categories;
    const stack = !!n.stack;
    const [mn, mx] = extents(n.series, cats.length, stack);
    const S = niceScale(mn, mx, true);
    const labW = Math.min(170, Math.ceil(Math.max(...cats.map((c) => textW(String(c), 12)))) + 14);
    const L = labW + 8, R = 44, T = n.unit ? 30 : 16, B = 32 + (n.xlabel ? 16 : 0);
    const rowH = Math.max(22, n.series.length * 15 + 12);
    const H = Math.max(180, T + B + cats.length * (stack ? 30 : rowH));
    const pw = W - L - R, ph = H - T - B;
    const band = ph / cats.length;
    const x = (v) => L + pw * ((v - S.lo) / (S.hi - S.lo));
    const unit = n.unit ? ' ' + n.unit : '';

    S.ticks.forEach((v) => {
      svg.append(s('line', { x1: x(v), x2: x(v), y1: T, y2: T + ph, class: 'grid' }));
      txt(svg, x(v), H - B + 16, fmt(v), 'middle');
    });
    if (n.unit) txt(svg, L, 15, n.unit, 'start', 'lbl chart-unit');
    if (n.xlabel) txt(svg, L + pw / 2, H - 6, n.xlabel, 'middle', 'lbl chart-unit');
    cats.forEach((c, i) => {
      const lbl = ellipsize(String(c), labW, 12);
      const t = s('text', { x: L - 8, y: T + band * (i + 0.5) + 4, class: 'lbl', 'text-anchor': 'end', text: lbl });
      if (lbl !== String(c)) t.append(s('title', { text: String(c) }));
      svg.append(t);
    });

    const gh = band * 0.72;
    cats.forEach((_, i) => {
      if (stack) {
        let pos = 0, neg = 0;
        n.series.forEach((se, si) => {
          const v = se.values[i] || 0;
          const from = v >= 0 ? pos : neg, to = from + v;
          if (v >= 0) pos = to; else neg = to;
          svg.append(s('rect', {
            x: Math.min(x(from), x(to)), y: T + band * i + (band - gh) / 2, width: Math.abs(x(to) - x(from)), height: gh, rx: 2, fill: pal[si % pal.length],
          }, [s('title', { text: se.name + ' · ' + cats[i] + ' : ' + fmt(v) + unit })]));
        });
      } else {
        const bh = gh / n.series.length;
        n.series.forEach((se, si) => {
          const v = se.values[i] || 0;
          const yy = T + band * i + (band - gh) / 2 + bh * si;
          svg.append(s('rect', {
            x: Math.min(x(0), x(v)), y: yy, width: Math.abs(x(v) - x(0)), height: Math.max(bh - 1, 1), rx: 2, fill: pal[si % pal.length],
          }, [s('title', { text: se.name + ' · ' + cats[i] + ' : ' + fmt(v) + unit })]));
          if (n.series.length === 1) txt(svg, (v >= 0 ? x(v) + 5 : x(v) - 5), yy + bh / 2 + 4, fmt(v), v >= 0 ? 'start' : 'end');
        });
      }
    });
    svg.append(s('line', { x1: x(0), x2: x(0), y1: T, y2: T + ph, class: 'axis' }));
    return H;
  }

  /* ---------- nuage de points ---------- */
  function scatter(svg, n, pal) {
    const H = 340;
    const xs = [], ys = [];
    n.series.forEach((se) => se.points.forEach((p) => { xs.push(p.x); ys.push(p.y); }));
    const xS = niceScale(Math.min(...xs), Math.max(...xs), false);
    const yS = niceScale(Math.min(...ys), Math.max(...ys), false);
    const L = Math.max(56, Math.ceil(Math.max(...yS.ticks.map((v) => fmt(v).length)) * 8.5) + 16) + (n.ylabel ? 16 : 0);
    const R = 24, T = n.unit ? 34 : 20, B = 40 + (n.xlabel ? 18 : 0);
    const pw = W - L - R, ph = H - T - B;
    const px = (v) => L + pw * ((v - xS.lo) / (xS.hi - xS.lo));
    const py = (v) => T + ph * (1 - (v - yS.lo) / (yS.hi - yS.lo));
    const unit = n.unit ? ' ' + n.unit : '';

    yS.ticks.forEach((v) => {
      svg.append(s('line', { x1: L, x2: W - R, y1: py(v), y2: py(v), class: 'grid' }));
      txt(svg, L - 8, py(v) + 4, fmt(v), 'end');
    });
    xS.ticks.forEach((v) => {
      svg.append(s('line', { x1: px(v), x2: px(v), y1: T, y2: T + ph, class: 'grid' }));
      txt(svg, px(v), H - B + 16, fmt(v), 'middle');
    });
    if (n.unit) txt(svg, L, 15, n.unit, 'start', 'lbl chart-unit');
    if (n.xlabel) txt(svg, L + pw / 2, H - 6, n.xlabel, 'middle', 'lbl chart-unit');
    if (n.ylabel) {
      svg.append(s('text', { x: 12, y: T + ph / 2, class: 'lbl chart-unit', 'text-anchor': 'middle', transform: 'rotate(-90 12 ' + (T + ph / 2) + ')', text: n.ylabel }));
    }
    svg.append(s('line', { x1: L, x2: L, y1: T, y2: T + ph, class: 'axis' }));
    svg.append(s('line', { x1: L, x2: W - R, y1: T + ph, y2: T + ph, class: 'axis' }));

    n.series.forEach((se, si) => {
      const col = pal[si % pal.length];
      se.points.forEach((p) => svg.append(s('circle', {
        cx: px(p.x), cy: py(p.y), r: 5.5, fill: col, 'fill-opacity': 0.82, class: 'scatter-pt',
      }, [s('title', { text: se.name + ' : (' + fmt(p.x) + ', ' + fmt(p.y) + ')' + unit })])));
    });
    return H;
  }

  /* ---------- pie et donut ---------- */
  function pieChart(svg, n, pal) {
    const vals = n.series[0].values.map((v) => Math.max(0, v));
    const total = vals.reduce((a, b) => a + b, 0);
    const H = Math.max(320, 40 + n.categories.length * 22 + 20);
    if (!total) { txt(svg, 20, 40, 'Total nul'); return H; }
    const donut = n.kind === 'donut';
    const cx = 170, cy = Math.max(160, H / 2), r = 120, ri = donut ? 70 : 0;
    let a0 = -Math.PI / 2;
    vals.forEach((v, i) => {
      if (!v) return;
      const frac = v / total, a1 = a0 + frac * 2 * Math.PI, col = pal[i % pal.length];
      const tip = s('title', { text: n.categories[i] + ' : ' + fmt(v) + (n.unit ? ' ' + n.unit : '') + ' (' + (frac * 100).toFixed(1) + ' %)' });
      if (frac > 0.9999) {
        svg.append(donut
          ? s('circle', { cx, cy, r: (r + ri) / 2, fill: 'none', stroke: col, 'stroke-width': r - ri, class: 'slice' }, [tip])
          : s('circle', { cx, cy, r, fill: col }, [tip]));
      } else {
        const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0), x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
        const big = frac > 0.5 ? 1 : 0;
        let d;
        if (donut) {
          const xi1 = cx + ri * Math.cos(a1), yi1 = cy + ri * Math.sin(a1), xi0 = cx + ri * Math.cos(a0), yi0 = cy + ri * Math.sin(a0);
          d = 'M' + x0 + ' ' + y0 + 'A' + r + ' ' + r + ' 0 ' + big + ' 1 ' + x1 + ' ' + y1 +
            'L' + xi1 + ' ' + yi1 + 'A' + ri + ' ' + ri + ' 0 ' + big + ' 0 ' + xi0 + ' ' + yi0 + 'Z';
        } else {
          d = 'M' + cx + ' ' + cy + 'L' + x0 + ' ' + y0 + 'A' + r + ' ' + r + ' 0 ' + big + ' 1 ' + x1 + ' ' + y1 + 'Z';
        }
        svg.append(s('path', { d, fill: col, class: 'slice' }, [tip]));
      }
      a0 = a1;
    });
    if (donut && n.center) {
      const lines = String(n.center).split(/\\n|\|/);
      lines.forEach((l, k) => txt(svg, cx, cy + 6 + (k - (lines.length - 1) / 2) * 22, l.trim(), 'middle', 'lbl chart-center'));
    }
    n.categories.forEach((c, i) => {
      const yy = 40 + i * 22;
      svg.append(s('rect', { x: 340, y: yy - 10, width: 12, height: 12, fill: pal[i % pal.length], rx: 2 }));
      txt(svg, 358, yy, c + ' : ' + ((vals[i] / total) * 100).toFixed(1) + ' %');
    });
    return H;
  }

  window.RDTCharts = { render };
})();
