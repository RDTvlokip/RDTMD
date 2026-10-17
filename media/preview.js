(function () {
  'use strict';
  const vscode = acquireVsCodeApi();
  const K = window.RDTKit;
  K.setVscode(vscode);
  const { h, s } = K;
  const root = document.getElementById('root');
  const LABELS = { note: 'Note', tip: 'Astuce', warn: 'Attention', danger: 'Danger' };

  let breaks = true;
  const safeHref = (u) => (/^\s*(javascript|vbscript|data):/i.test(u) ? null : u);

  /* ---------- état du document en cours de rendu (notes, titres) ---------- */
  let footnotes = new Map(); // id -> { n, inline, refs }
  let headings = [];

  const slugify = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';

  function textOf(nodes) {
    let out = '';
    (nodes || []).forEach((n) => {
      if (n.type === 'text' || n.type === 'code' || n.type === 'math') out += n.value;
      else if (n.children) out += textOf(n.children);
      else if (n.type === 'softbreak') out += ' ';
    });
    return out;
  }

  /** Parcourt tous les blocs (y compris onglets, listes, includes) dans l'ordre du document. */
  function visit(nodes, fn) {
    (nodes || []).forEach((n) => {
      if (!n || typeof n !== 'object') return;
      fn(n);
      if (n.children && n.type !== 'heading') visit(n.children, fn);
      if (n.items && n.type === 'list') n.items.forEach((it) => visit(it.children, fn));
      if (n.tabs) n.tabs.forEach((t) => visit(t.children, fn));
    });
  }

  function inlineRefs(nodes, fn) {
    (nodes || []).forEach((n) => {
      if (n.type === 'footref') fn(n.id);
      if (n.children) inlineRefs(n.children, fn);
    });
  }

  function prepare(ast) {
    footnotes = new Map();
    headings = [];
    const defs = new Map();
    const used = new Set();
    const seen = new Map();
    visit(ast.children, (n) => {
      if (n.type === 'footnote') defs.set(n.id, n.inline);
      if (n.type === 'heading') {
        let id = n.id || slugify(textOf(n.inline));
        const c = seen.get(id) || 0;
        seen.set(id, c + 1);
        if (c) id += '-' + (c + 1);
        n._slug = id;
        headings.push({ level: n.level, id, text: textOf(n.inline) });
      }
      const cite = (id) => {
        if (!defs.has(id) && !used.has(id)) { /* définition éventuellement plus bas : résolue après */ }
        used.add(id);
        if (!footnotes.has(id)) footnotes.set(id, { n: footnotes.size + 1, inline: null, refs: 0 });
      };
      if (n.inline) inlineRefs(n.inline, cite);
      if (n.header) n.header.forEach((c) => inlineRefs(c, cite));
      if (n.rows) n.rows.forEach((r) => r.forEach((c) => inlineRefs(c, cite)));
      if (n.messages) n.messages.forEach((m) => inlineRefs(m.inline, cite));
    });
    footnotes.forEach((f, id) => { f.inline = defs.get(id) || null; });
  }

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
        case 'footref': {
          const f = footnotes.get(n.id);
          if (!f || !f.inline) { out.push('[^' + n.id + ']'); break; }
          f.refs++;
          out.push(h('sup', { class: 'fn-ref' }, [h('a', { href: '#fn-' + n.id, id: f.refs === 1 ? 'fnref-' + n.id : null, title: textOf(f.inline), text: String(f.n) })]));
          break;
        }
        default:
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

  function renderToc(n) {
    const list = headings.filter((x) => x.level <= n.depth);
    const nav = h('nav', { class: 'toc', 'aria-label': 'Table of contents' });
    if (!list.length) { nav.append(h('div', { class: 'toc-empty', text: /^fr/i.test(navigator.language || '') ? 'Aucun titre' : 'No headings' })); return nav; }
    const base = Math.min(...list.map((x) => x.level));
    const rootUl = h('ul');
    const stack = [{ level: base - 1, ul: rootUl }];
    list.forEach((x) => {
      while (stack.length > 1 && stack[stack.length - 1].level >= x.level) stack.pop();
      let top = stack[stack.length - 1];
      while (top.level < x.level - 1) {
        const li = h('li'), ul = h('ul');
        li.append(ul);
        top.ul.append(li);
        top = { level: top.level + 1, ul };
        stack.push(top);
      }
      const li = h('li', {}, [h('a', { href: '#' + x.id, text: x.text })]);
      top.ul.append(li);
      const sub = h('ul');
      li.append(sub);
      stack.push({ level: x.level, ul: sub });
    });
    nav.querySelectorAll('ul').forEach((u) => { if (!u.children.length) u.remove(); });
    nav.append(rootUl);
    rootUl.querySelectorAll('ul').forEach((u) => { if (!u.children.length) u.remove(); });
    return nav;
  }

  function block(n) {
    switch (n.type) {
      case 'heading': return h('h' + n.level, { id: n._slug || null }, inl(n.inline));
      case 'paragraph': return h('p', {}, inl(n.inline));
      case 'hr': return h('hr');
      case 'quote': return h('blockquote', {}, blocks(n.children));
      case 'code': return renderCode(n);
      case 'math': return window.RDTMath.render(n.text, true);
      case 'toc': return renderToc(n);
      case 'footnote': return null;
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

  /* ---------- graphiques et diagrammes (modules dédiés) ---------- */
  function applyAlign(fig, n) {
    const al = n.opts && n.opts.align;
    if (al) fig.style.textAlign = al;
    return fig;
  }

  function chart(n) {
    const fig = window.RDTCharts.render(n);
    applyAlign(fig, n);
    return window.RDTInteract.attach(fig, { zoom: false, hover: false });
  }

  function diagram(n) {
    const fig = h('figure', { class: 'diagram diagram-' + n.kind });
    if (n.title) fig.append(h('figcaption', { text: n.title }));
    const fn = K.diagrams[n.kind];
    if (!fn) {
      fig.append(h('div', { class: 'error', text: 'Type de diagramme inconnu : ' + n.kind }));
      return fig;
    }
    let svg = null;
    try { svg = fn(n); } catch (e) {
      fig.append(h('div', { class: 'error', text: 'Erreur de rendu (' + n.kind + ') : ' + (e && e.message ? e.message : e) }));
      return fig;
    }
    if (!svg) {
      fig.append(h('div', { class: 'error', text: 'Diagramme sans données' }));
      return fig;
    }
    fig.append(svg);
    applyAlign(fig, n);
    return window.RDTInteract.attach(fig, { zoom: true, hover: true });
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

  /* ---------- notes de bas de page ---------- */
  function renderFootnotes() {
    const list = [...footnotes.entries()].filter(([, f]) => f.inline).sort((a, b) => a[1].n - b[1].n);
    if (!list.length) return null;
    const ol = h('ol');
    list.forEach(([id, f]) => {
      const li = h('li', { id: 'fn-' + id }, inl(f.inline));
      li.append(' ', h('a', { class: 'fn-back', href: '#fnref-' + id, title: 'Back to the text', text: '↩' }));
      ol.append(li);
    });
    return h('section', { class: 'footnotes' }, [h('hr'), ol]);
  }

  /* ---------- rendu du document ---------- */
  function renderDoc(ast) {
    prepare(ast);
    const els = [];
    (ast.children || []).forEach((n) => {
      const el = block(n);
      if (!el) return;
      if (typeof n.line === 'number' && n.type !== 'included' && n.type !== 'includelink' && el.setAttribute) el.setAttribute('data-line', String(n.line));
      els.push(el);
    });
    const fn = renderFootnotes();
    if (fn) els.push(fn);
    const y = window.scrollY;
    root.replaceChildren(...els);
    window.scrollTo(0, y);
  }

  /* ---------- liens internes (#ancre) ---------- */
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = decodeURIComponent(a.getAttribute('href').slice(1));
    if (!id) return;
    const el = document.getElementById(id);
    if (el) { e.preventDefault(); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });

  /* ---------- synchronisation du défilement ---------- */
  let syncOn = true, syncLock = 0, raf = 0;

  function lineEls() { return [...root.querySelectorAll(':scope > [data-line]')]; }

  function scrollToLine(line) {
    const els = lineEls();
    if (!els.length) return;
    let target = els[0];
    for (const el of els) { if (Number(el.getAttribute('data-line')) <= line) target = el; else break; }
    const next = els[els.indexOf(target) + 1];
    const l0 = Number(target.getAttribute('data-line')), l1 = next ? Number(next.getAttribute('data-line')) : l0 + 1;
    const frac = l1 > l0 ? Math.min(1, Math.max(0, (line - l0) / (l1 - l0))) : 0;
    const top = target.getBoundingClientRect().top + window.scrollY;
    const span = next ? next.getBoundingClientRect().top + window.scrollY - top : target.offsetHeight;
    syncLock = Date.now() + 220;
    window.scrollTo(0, Math.max(0, top + span * frac - 8));
  }

  window.addEventListener('scroll', () => {
    if (!syncOn || Date.now() < syncLock || raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const els = lineEls();
      if (!els.length) return;
      let cur = els[0];
      for (const el of els) { if (el.getBoundingClientRect().top <= 6) cur = el; else break; }
      vscode.postMessage({ type: 'revealLine', line: Number(cur.getAttribute('data-line')) });
    });
  }, { passive: true });

  /* ---------- thème : l'aperçu peut forcer clair/sombre, y compris la coloration du code ---------- */
  let savedClasses = null;
  function applyTheme(theme) {
    const t = theme || 'auto';
    const cl = document.body.classList;
    document.body.setAttribute('data-rdt-theme', t);
    if (t === 'auto') {
      if (savedClasses) { cl.toggle('vscode-light', savedClasses.light); cl.toggle('vscode-dark', savedClasses.dark); savedClasses = null; }
      return;
    }
    if (!savedClasses) savedClasses = { light: cl.contains('vscode-light'), dark: cl.contains('vscode-dark') };
    const light = t === 'light' || t === 'paper';
    cl.toggle('vscode-light', light);
    cl.toggle('vscode-dark', !light);
  }

  /* ---------- messages de l'extension ---------- */
  window.addEventListener('message', (e) => {
    const m = e.data;
    if (!m) return;
    if (m.type === 'ast') {
      breaks = m.breaks !== false;
      syncOn = m.syncScroll !== false;
      applyTheme(m.theme);
      K.setPalette(m.palette);
      renderDoc(m.ast);
    } else if (m.type === 'scrollTo' && syncOn) {
      scrollToLine(m.line);
    }
  });
  vscode.postMessage({ type: 'ready' });
})();
