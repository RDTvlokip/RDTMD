/* RDTMD : diagrammes de séquence (messages, notes, blocs alt/opt/loop/par, activations, numérotation). */
(function () {
  'use strict';
  const K = window.RDTKit;
  const { s, textW, wrapText, palette, sizeSvg, addDefs } = K;

  const MSG_PX = 12.5, PART_PX = 13, NOTE_PX = 12, LOOP_W = 34, BOX_H = 34, TOP_Y = 20, ACT_W = 10;

  function renderSequence(n) {
    if (!n.participants || !n.participants.length) return null;
    const parts = n.participants;
    const labels = n.labels || {};
    const idx = {};
    parts.forEach((p, i) => { idx[p] = i; });
    const events = (n.events || n.messages.map((m) => ({ type: 'msg', ...m }))).filter((e) =>
      e.type === 'msg' ? idx[e.from] !== undefined && idx[e.to] !== undefined : true);
    const disp = (p) => labels[p] || p;
    const boxW = parts.map((p) => Math.max(90, Math.ceil(textW(disp(p), PART_PX, 600) + 28)));

    /* numérotation */
    let counter = 0;
    const labelOf = (e) => (n.autonumber ? ++counter + '.' + (e.label ? ' ' + e.label : '') : e.label);
    counter = 0;
    const msgText = new Map();
    events.forEach((e) => { if (e.type === 'msg') msgText.set(e, labelOf(e)); });

    const noteLines = new Map();
    events.forEach((e) => {
      if (e.type === 'note') {
        const lines = wrapText(e.text, 190, NOTE_PX);
        noteLines.set(e, { lines, w: Math.ceil(Math.max(...lines.map((l) => textW(l, NOTE_PX)))) + 22 });
      }
    });

    /* ---------- écarts entre lifelines ---------- */
    const gaps = parts.slice(1).map((_, i) => Math.max(120, (boxW[i] + boxW[i + 1]) / 2 + 24));
    let leftPad = 0, rightPad = 0;
    const need = (a, b, w) => {
      let have = 0;
      for (let i = a; i < b; i++) have += gaps[i];
      if (have < w) gaps[b - 1] += w - have;
    };
    const last = parts.length - 1;
    const spans = [];
    events.forEach((e) => {
      if (e.type === 'msg') {
        const t = msgText.get(e);
        const w = t ? Math.ceil(textW(t, MSG_PX)) + 28 : 0;
        const a = idx[e.from], b = idx[e.to];
        if (a !== b) spans.push({ a: Math.min(a, b), b: Math.max(a, b), w });
        else if (t) {
          const room = LOOP_W + 12 + Math.ceil(textW(t, MSG_PX));
          if (a === last) rightPad = Math.max(rightPad, room - boxW[last] / 2);
          else spans.push({ a, b: a + 1, w: room + boxW[a + 1] / 2 });
        }
      } else if (e.type === 'note') {
        const nw = noteLines.get(e).w;
        const ids = e.who.map((w) => idx[w]).filter((i) => i !== undefined);
        if (!ids.length) return;
        if (e.side === 'over') {
          const a = Math.min(...ids), b = Math.max(...ids);
          if (a !== b) spans.push({ a, b, w: nw + 24 });
          else if (a === 0) leftPad = Math.max(leftPad, nw / 2 - boxW[0] / 2);
          else if (a === last) rightPad = Math.max(rightPad, nw / 2 - boxW[last] / 2);
        } else if (e.side === 'left') {
          const a = ids[0];
          if (a === 0) leftPad = Math.max(leftPad, nw + 14 - boxW[0] / 2);
          else spans.push({ a: a - 1, b: a, w: nw + 36 });
        } else {
          const a = ids[0];
          if (a === last) rightPad = Math.max(rightPad, nw + 14 - boxW[last] / 2);
          else spans.push({ a, b: a + 1, w: nw + 36 });
        }
      }
    });
    spans.sort((p, q) => (p.b - p.a) - (q.b - q.a)).forEach((sp) => need(sp.a, sp.b, sp.w));

    const px = [];
    let cur = boxW[0] / 2 + Math.max(0, leftPad);
    parts.forEach((_, i) => { if (i) cur += gaps[i - 1]; px.push(cur); });
    const X = (p) => px[idx[p]];

    /* ---------- placement vertical ---------- */
    let y = TOP_Y + BOX_H + 30;
    const laid = [];
    const stack = [];
    const frames = [];
    const act = {}, intervals = [];
    parts.forEach((p) => { act[p] = []; });
    let lastY = y;
    const touch = (xs) => stack.forEach((b) => xs.forEach((x) => { b.xmin = Math.min(b.xmin, x); b.xmax = Math.max(b.xmax, x); }));

    events.forEach((e) => {
      switch (e.type) {
        case 'msg': {
          const self = e.from === e.to;
          y += 24;
          laid.push({ e, y });
          lastY = y;
          touch([X(e.from), X(e.to)].concat(self ? [X(e.from) + LOOP_W + (msgText.get(e) ? textW(msgText.get(e), MSG_PX) + 16 : 0)] : []));
          y += self ? 40 : 22;
          break;
        }
        case 'note': {
          const nl = noteLines.get(e);
          const hh = nl.lines.length * 15 + 12;
          const ids = e.who.map((w) => idx[w]).filter((i) => i !== undefined);
          if (!ids.length) break;
          let x0, x1;
          if (e.side === 'over') {
            const a = Math.min(...ids), b = Math.max(...ids);
            const mid = (px[a] + px[b]) / 2;
            const w = Math.max(nl.w, px[b] - px[a] + 24);
            x0 = mid - w / 2; x1 = mid + w / 2;
          } else if (e.side === 'left') {
            x1 = px[ids[0]] - 10; x0 = x1 - nl.w;
          } else {
            x0 = px[ids[0]] + 10; x1 = x0 + nl.w;
          }
          y += 6;
          laid.push({ e, y, x0, x1, hh, lines: nl.lines });
          touch([x0, x1]);
          lastY = y + hh / 2;
          y += hh + 12;
          break;
        }
        case 'block': {
          y += 8;
          const b = { kind: e.kind, label: e.label, y0: y, xmin: Infinity, xmax: -Infinity, depth: 0, dividers: [] };
          stack.push(b);
          y += 28;
          break;
        }
        case 'else': {
          const b = stack[stack.length - 1];
          if (!b) break;
          y += 6;
          b.dividers.push({ y, label: e.label, kind: e.kind });
          y += 24;
          break;
        }
        case 'end': {
          const b = stack.pop();
          if (!b) break;
          b.y1 = y + 2;
          frames.push(b);
          if (stack.length) {
            const par = stack[stack.length - 1];
            par.depth = Math.max(par.depth, b.depth + 1);
            par.xmin = Math.min(par.xmin, b.xmin - 12);
            par.xmax = Math.max(par.xmax, b.xmax + 12);
          }
          y += 14;
          break;
        }
        case 'activate': {
          if (idx[e.who] === undefined) break;
          act[e.who].push(lastY - 8);
          break;
        }
        case 'deactivate': {
          if (idx[e.who] === undefined) break;
          const y0 = act[e.who].pop();
          if (y0 !== undefined) intervals.push({ p: e.who, y0, y1: lastY + 8, level: act[e.who].length });
          break;
        }
        default:
      }
    });
    const endY = y + 18;
    parts.forEach((p) => { act[p].forEach((y0, lv) => intervals.push({ p, y0, y1: endY - 18, level: lv })); });
    const depthAt = (p, yy) => intervals.filter((it) => it.p === p && yy >= it.y0 && yy <= it.y1).length;

    /* ---------- cadre ---------- */
    const allX = px.map((x, i) => [x - boxW[i] / 2, x + boxW[i] / 2]).flat();
    laid.forEach((l) => { if (l.x0 !== undefined) allX.push(l.x0, l.x1); });
    frames.forEach((f) => { if (f.xmin !== Infinity) allX.push(f.xmin - (12 + 9 * f.depth), f.xmax + 12 + 9 * f.depth); });
    const rightExtra = rightPad > 0 ? rightPad + boxW[last] / 2 : 0;
    allX.push(px[last] + boxW[last] / 2 + rightExtra);
    const PAD = 22;
    const minX = Math.min(...allX) - PAD, maxX = Math.max(...allX) + PAD;
    const totalW = Math.ceil(maxX - minX), totalH = Math.ceil(endY);

    const pal = palette(n);
    const svg = s('svg', { viewBox: [Math.floor(minX), 0, totalW, totalH].join(' '), class: 'diagram-svg', role: 'img' });
    sizeSvg(svg, totalW, totalH, 0.75, 1.2, n);
    const mk = addDefs(svg);

    /* lifelines */
    parts.forEach((p) => {
      svg.append(s('line', { x1: X(p), y1: TOP_Y + BOX_H, x2: X(p), y2: endY - 12, class: 'seq-lifeline', 'data-id': p }));
    });

    /* blocs (derrière les messages) */
    frames.forEach((f) => {
      if (f.xmin === Infinity) { f.xmin = px[0]; f.xmax = px[last]; }
      const pad = 12 + 9 * f.depth;
      const x0 = f.xmin - pad, w = f.xmax - f.xmin + pad * 2;
      svg.append(s('rect', { x: x0, y: f.y0, width: w, height: f.y1 - f.y0, rx: 4, class: 'seq-frame' }));
      const tabW = textW(f.kind, 11.5, 700) + 16;
      svg.append(s('path', { d: 'M ' + x0 + ' ' + f.y0 + ' h ' + tabW + ' v 14 l -6 6 h ' + (-tabW + 6) + ' z', class: 'seq-frame-tab' }));
      svg.append(s('text', { x: x0 + 8, y: f.y0 + 14, class: 'seq-frame-kind', text: f.kind }));
      if (f.label) svg.append(s('text', { x: x0 + tabW + 8, y: f.y0 + 15, class: 'seq-frame-label', text: '[' + f.label + ']' }));
      f.dividers.forEach((d) => {
        svg.append(s('line', { x1: x0, x2: x0 + w, y1: d.y, y2: d.y, class: 'seq-frame-else' }));
        if (d.label) svg.append(s('text', { x: x0 + 8, y: d.y + 15, class: 'seq-frame-label', text: '[' + d.label + ']' }));
      });
    });

    /* activations */
    intervals.forEach((it) => {
      svg.append(s('rect', { x: X(it.p) - ACT_W / 2 + it.level * 5, y: it.y0, width: ACT_W, height: Math.max(8, it.y1 - it.y0), rx: 2, class: 'seq-activation' }));
    });

    /* messages et notes */
    const bgs = [];
    laid.forEach((l) => {
      const e = l.e;
      if (e.type === 'msg') {
        const cls = 'diagram-edge' + (e.style === 'dashed' ? ' dashed' : '');
        const text = msgText.get(e);
        if (e.from === e.to) {
          const x1 = X(e.from) + (depthAt(e.from, l.y) ? ACT_W / 2 : 0);
          const d = 'M ' + x1 + ' ' + l.y + ' L ' + (x1 + LOOP_W) + ' ' + l.y + ' L ' + (x1 + LOOP_W) + ' ' + (l.y + 22) + ' L ' + (x1 + 2) + ' ' + (l.y + 22);
          svg.append(s('path', { d, class: cls, 'marker-end': 'url(#' + mk.arrow + ')', 'data-from': e.from, 'data-to': e.to }));
          if (text) bgs.push({ x: x1 + LOOP_W + 8, y: l.y + 15, anchor: 'start', text });
        } else {
          const dir = X(e.to) > X(e.from) ? 1 : -1;
          const x1 = X(e.from) + (depthAt(e.from, l.y) ? dir * ACT_W / 2 : 0);
          const x2 = X(e.to) - dir * (depthAt(e.to, l.y) ? ACT_W / 2 + 1 : 1);
          svg.append(s('line', { x1, y1: l.y, x2, y2: l.y, class: cls, 'marker-end': 'url(#' + mk.arrow + ')', 'data-from': e.from, 'data-to': e.to }));
          if (text) bgs.push({ x: (x1 + x2) / 2, y: l.y - 7, anchor: 'middle', text });
        }
      } else if (e.type === 'note') {
        const nd = 'M ' + l.x0 + ' ' + l.y + ' H ' + (l.x1 - 8) + ' L ' + l.x1 + ' ' + (l.y + 8) + ' V ' + (l.y + l.hh) + ' H ' + l.x0 + ' Z';
        svg.append(s('path', { d: nd, class: 'seq-note-bg' }));
        svg.append(s('path', { d: nd, class: 'seq-note' }));
        l.lines.forEach((t, k) => svg.append(s('text', { x: l.x0 + 10, y: l.y + 17 + k * 15, class: 'seq-note-text', text: t })));
      }
    });
    bgs.forEach((b) => {
      const w = Math.ceil(textW(b.text, MSG_PX)) + 10;
      svg.append(s('rect', { x: b.anchor === 'middle' ? b.x - w / 2 : b.x - 5, y: b.y - 13, width: w, height: 18, rx: 3, class: 'diagram-edge-bg seq-lbl-bg' }));
      svg.append(s('text', { x: b.x, y: b.y, class: 'seq-msg-text', 'text-anchor': b.anchor, text: b.text }));
    });

    /* participants */
    parts.forEach((p, i) => {
      const g = s('g', { class: 'seq-part', 'data-id': p });
      g.append(s('rect', { x: px[i] - boxW[i] / 2, y: TOP_Y, width: boxW[i], height: BOX_H, rx: 5, class: 'seq-part-box' }));
      g.append(s('text', { x: px[i], y: TOP_Y + BOX_H / 2 + 4.5, class: 'seq-part-text', 'text-anchor': 'middle', text: disp(p) }));
      g.append(s('title', { text: disp(p) }));
      svg.append(g);
    });
    void pal;
    return svg;
  }

  K.diagrams.sequence = renderSequence;
})();
