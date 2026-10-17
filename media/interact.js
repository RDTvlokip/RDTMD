/* RDTMD : interactions des figures (zoom, déplacement, export SVG/PNG, mise en évidence au survol). */
(function () {
  'use strict';
  const K = window.RDTKit;
  const { h } = K;

  const svgOf = (fig) => fig.querySelector('svg.diagram-svg, svg.chart-svg');

  const readVB = (svg) => {
    const a = (svg.getAttribute('viewBox') || '0 0 100 100').trim().split(/\s+/).map(Number);
    return { x: a[0], y: a[1], w: a[2], h: a[3] };
  };
  const writeVB = (svg, v) => svg.setAttribute('viewBox', [v.x, v.y, v.w, v.h].join(' '));
  const baseVB = (svg) => svg.__rdtBase || (svg.__rdtBase = readVB(svg));

  /* ---------- export ---------- */

  const STYLE_PROPS = [
    'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity',
    'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor',
  ];

  function inlineStyles(src, dst) {
    if (src.nodeType !== 1) return;
    const cs = getComputedStyle(src);
    const tag = src.tagName.toLowerCase();
    if (tag !== 'svg' && tag !== 'defs' && tag !== 'marker' && tag !== 'title') {
      STYLE_PROPS.forEach((p) => {
        const v = cs.getPropertyValue(p);
        if (v) dst.setAttribute(p, v);
      });
    }
    dst.removeAttribute('class');
    const a = src.children, b = dst.children;
    for (let i = 0; i < a.length; i++) if (b[i]) inlineStyles(a[i], b[i]);
  }

  function pageBackground() {
    const c = getComputedStyle(document.body).backgroundColor;
    if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c;
    const v = getComputedStyle(document.documentElement).getPropertyValue('--vscode-editor-background').trim();
    return v || '#1e1e1e';
  }

  function serialize(svg) {
    const base = baseVB(svg);
    const clone = svg.cloneNode(true);
    inlineStyles(svg, clone);
    clone.setAttribute('xmlns', K.NS);
    clone.setAttribute('viewBox', [base.x, base.y, base.w, base.h].join(' '));
    clone.setAttribute('width', Math.round(base.w));
    clone.setAttribute('height', Math.round(base.h));
    clone.removeAttribute('style');
    clone.removeAttribute('role');
    const bg = K.s('rect', { x: base.x, y: base.y, width: base.w, height: base.h, fill: pageBackground() });
    clone.insertBefore(bg, clone.firstChild);
    return { text: '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone), w: base.w, h: base.h };
  }

  function nameOf(fig) {
    const cap = fig.querySelector('figcaption');
    const t = (cap && cap.textContent) || 'diagram';
    return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'diagram';
  }

  function saveSvg(fig) {
    const svg = svgOf(fig);
    if (!svg) return;
    K.post({ type: 'save', name: nameOf(fig) + '.svg', mime: 'image/svg+xml', encoding: 'utf8', data: serialize(svg).text });
  }

  function savePng(fig) {
    const svg = svgOf(fig);
    if (!svg) return;
    const { text, w, h: hh } = serialize(svg);
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(hh * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL('image/png');
      K.post({ type: 'save', name: nameOf(fig) + '.png', mime: 'image/png', encoding: 'base64', data: url.slice(url.indexOf(',') + 1) });
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text);
  }

  /* ---------- zoom et déplacement ---------- */

  function zoomBy(svg, f, cx, cy) {
    const base = baseVB(svg), v = readVB(svg);
    const nw = Math.min(base.w, Math.max(base.w / 10, v.w / f));
    const k = nw / v.w;
    const nh = v.h * k;
    const px = cx === undefined ? v.x + v.w / 2 : cx, py = cy === undefined ? v.y + v.h / 2 : cy;
    const nx = px - (px - v.x) * k, ny = py - (py - v.y) * k;
    const out = nw >= base.w - 0.5;
    writeVB(svg, out ? base : { x: nx, y: ny, w: nw, h: nh });
    svg.classList.toggle('zoomed', !out);
  }

  const resetView = (svg) => { writeVB(svg, baseVB(svg)); svg.classList.remove('zoomed'); };

  function enableZoom(fig) {
    fig.addEventListener('wheel', (ev) => {
      if (!(ev.ctrlKey || ev.metaKey)) return;
      const svg = svgOf(fig);
      if (!svg || !svg.contains(ev.target)) return;
      ev.preventDefault();
      const r = svg.getBoundingClientRect(), v = readVB(svg);
      const cx = v.x + ((ev.clientX - r.left) / r.width) * v.w, cy = v.y + ((ev.clientY - r.top) / r.height) * v.h;
      zoomBy(svg, ev.deltaY < 0 ? 1.18 : 1 / 1.18, cx, cy);
    }, { passive: false });

    let drag = null;
    fig.addEventListener('pointerdown', (ev) => {
      const svg = svgOf(fig);
      if (!svg || !svg.classList.contains('zoomed') || !svg.contains(ev.target) || ev.button !== 0) return;
      drag = { x: ev.clientX, y: ev.clientY, v: readVB(svg), svg };
      svg.setPointerCapture(ev.pointerId);
      svg.classList.add('panning');
    });
    fig.addEventListener('pointermove', (ev) => {
      if (!drag) return;
      const r = drag.svg.getBoundingClientRect();
      const dx = ((ev.clientX - drag.x) / r.width) * drag.v.w, dy = ((ev.clientY - drag.y) / r.height) * drag.v.h;
      writeVB(drag.svg, { x: drag.v.x - dx, y: drag.v.y - dy, w: drag.v.w, h: drag.v.h });
    });
    const end = () => { if (drag) { drag.svg.classList.remove('panning'); drag = null; } };
    fig.addEventListener('pointerup', end);
    fig.addEventListener('pointercancel', end);
    fig.addEventListener('dblclick', (ev) => {
      const svg = svgOf(fig);
      if (svg && svg.classList.contains('zoomed') && svg.contains(ev.target)) resetView(svg);
    });
  }

  /* ---------- mise en évidence au survol ---------- */

  function enableHover(fig) {
    const clear = (svg) => {
      svg.classList.remove('hl');
      svg.querySelectorAll('.on').forEach((e) => e.classList.remove('on'));
    };
    fig.addEventListener('mouseover', (ev) => {
      const svg = svgOf(fig);
      if (!svg || !svg.contains(ev.target)) return;
      const el = ev.target.closest && ev.target.closest('[data-id], .diagram-edge[data-from]');
      if (!el || !svg.contains(el)) return;
      clear(svg);
      const id = el.getAttribute('data-id');
      const on = new Set();
      if (id !== null) {
        on.add(id);
        svg.querySelectorAll('[data-from]').forEach((e) => {
          if (e.getAttribute('data-from') === id || e.getAttribute('data-to') === id) {
            e.classList.add('on');
            on.add(e.getAttribute('data-from'));
            on.add(e.getAttribute('data-to'));
          }
        });
      } else {
        el.classList.add('on');
        on.add(el.getAttribute('data-from'));
        on.add(el.getAttribute('data-to'));
      }
      svg.querySelectorAll('[data-id]').forEach((e) => { if (on.has(e.getAttribute('data-id'))) e.classList.add('on'); });
      svg.classList.add('hl');
    });
    fig.addEventListener('mouseleave', () => { const svg = svgOf(fig); if (svg) clear(svg); });
  }

  /* ---------- barre d'outils ---------- */

  function attach(fig, opts) {
    const o = Object.assign({ zoom: true, hover: true }, opts);
    const svg = svgOf(fig);
    if (!svg) return fig;
    fig.classList.add('has-tools');
    const btn = (label, title, fn) => {
      const b = h('button', { type: 'button', class: 'fig-btn', title, 'aria-label': title, text: label });
      b.addEventListener('click', (ev) => { ev.stopPropagation(); fn(); });
      return b;
    };
    const cur = () => svgOf(fig);
    const kids = [];
    if (o.zoom) {
      kids.push(btn('+', 'Zoom in (Ctrl + wheel)', () => zoomBy(cur(), 1.35)));
      kids.push(btn('−', 'Zoom out', () => zoomBy(cur(), 1 / 1.35)));
      kids.push(btn('⟲', 'Reset view (double-click)', () => resetView(cur())));
    }
    kids.push(btn('SVG', 'Save as SVG', () => saveSvg(fig)));
    kids.push(btn('PNG', 'Save as PNG', () => savePng(fig)));
    fig.append(h('div', { class: 'fig-tools' }, kids));
    if (o.zoom) enableZoom(fig);
    if (o.hover && svg.querySelector('[data-id], [data-from]')) enableHover(fig);
    return fig;
  }

  window.RDTInteract = { attach, serialize, zoomBy, resetView };
})();
