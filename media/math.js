(function (root) {
  'use strict';
  /* RDTMath : sous-ensemble LaTeX -> arbre -> éléments DOM. Zéro dépendance. */

  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  const GREEK = {
    alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ',
    vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ',
    tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'ϕ', chi: 'χ', psi: 'ψ', omega: 'ω', Gamma: 'Γ', Delta: 'Δ',
    Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  };
  const SYM = {
    infty: '∞', partial: '∂', nabla: '∇', pm: '±', mp: '∓', times: '×', div: '÷', cdot: '⋅', ast: '∗', star: '⋆',
    circ: '∘', bullet: '•', leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', equiv: '≡',
    sim: '∼', simeq: '≃', cong: '≅', asymp: '≍', doteq: '≐', propto: '∝', ll: '≪', gg: '≫',
    to: '→', tos: '→', rightarrow: '→', leftarrow: '←', leftrightarrow: '↔',
    longrightarrow: '⟶', longleftarrow: '⟵', Rightarrow: '⇒', Leftarrow: '⇐', Leftrightarrow: '⇔',
    Longrightarrow: '⟹', Longleftarrow: '⟸', Longleftrightarrow: '⟺', iff: '⟺', implies: '⟹', impliedby: '⟸',
    mapsto: '↦', longmapsto: '⟼', hookrightarrow: '↪', hookleftarrow: '↩',
    uparrow: '↑', downarrow: '↓', nearrow: '↗', searrow: '↘', swarrow: '↙', nwarrow: '↖',
    in: '∈', notin: '∉', ni: '∋', subset: '⊂', supset: '⊃', subseteq: '⊆', supseteq: '⊇',
    sqsubset: '⊏', sqsupset: '⊐', sqsubseteq: '⊑', sqsupseteq: '⊒',
    cup: '∪', cap: '∩', setminus: '∖', emptyset: '∅', varnothing: '∅', forall: '∀', exists: '∃', nexists: '∄',
    neg: '¬', lnot: '¬', land: '∧', lor: '∨', wedge: '∧', vee: '∨',
    oplus: '⊕', otimes: '⊗', ominus: '⊖', odot: '⊙', oslash: '⊘',
    ldots: '…', dots: '…', cdots: '⋯', vdots: '⋮', ddots: '⋱',
    angle: '∠', perp: '⊥', bot: '⊥', top: '⊤', parallel: '∥', degree: '°', prime: '′',
    hbar: 'ℏ', ell: 'ℓ', Re: 'ℜ', Im: 'ℑ', wp: '℘', aleph: 'ℵ',
    langle: '⟨', rangle: '⟩', lbrace: '{', rbrace: '}', lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉',
    mid: '∣', vert: '|', Vert: '‖', '|': '‖',
    models: '⊨', vdash: '⊢', dashv: '⊣', prec: '≺', succ: '≻', preceq: '⪯', succeq: '⪰',
    coloneqq: '≔', eqqcolon: '≕', bowtie: '⋈', ltimes: '⋉', rtimes: '⋊',
    diamond: '⋄', triangle: '△', square: '□', dagger: '†', ddagger: '‡', smile: '⌣', frown: '⌢',
    ',': '\u2009', ';': '\u2005', ':': '\u2005', '!': '', quad: '\u2003', qquad: '\u2003\u2003',
    ' ': ' ', '{': '{', '}': '}', '%': '%', $: '$', '&': '&', '#': '#', _: '_',
  };
  const OPS = new Set([
    'pm', 'mp', 'times', 'div', 'cdot', 'ast', 'star', 'circ', 'bullet',
    'leq', 'le', 'geq', 'ge', 'neq', 'ne', 'approx', 'equiv', 'sim', 'simeq', 'cong', 'asymp', 'doteq', 'propto',
    'll', 'gg', 'to', 'tos', 'rightarrow', 'leftarrow', 'leftrightarrow',
    'longrightarrow', 'longleftarrow', 'Rightarrow', 'Leftarrow', 'Leftrightarrow',
    'Longrightarrow', 'Longleftarrow', 'Longleftrightarrow', 'iff', 'implies', 'impliedby',
    'mapsto', 'longmapsto', 'hookrightarrow', 'hookleftarrow',
    'in', 'notin', 'ni', 'subset', 'supset', 'subseteq', 'supseteq', 'sqsubset', 'sqsupset', 'sqsubseteq', 'sqsupseteq',
    'cup', 'cap', 'setminus', 'land', 'lor', 'wedge', 'vee',
    'oplus', 'otimes', 'ominus', 'odot', 'oslash',
    'mid', 'models', 'vdash', 'dashv', 'prec', 'succ', 'preceq', 'succeq', 'coloneqq', 'eqqcolon',
    'bowtie', 'top', 'bot', 'parallel', 'perp'
  ]);
  const BIG = {
    sum: '∑', prod: '∏', coprod: '∐', int: '∫', iint: '∬', iiint: '∭', oint: '∮', bigcup: '⋃', bigcap: '⋂',
    bigoplus: '⨁', bigotimes: '⨂', bigvee: '⋁', bigwedge: '⋀',
  };
  const NOLIMITS = new Set(['int', 'iint', 'iiint', 'oint']);
  const FUNCS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh',
    'tanh', 'log', 'ln', 'exp', 'lim', 'max', 'min', 'sup', 'inf', 'det', 'dim', 'ker', 'deg', 'gcd', 'arg', 'Pr',
    'argmax', 'argmin', 'mod', 'softmax', 'sigmoid', 'diag', 'tr', 'rank', 'cov', 'var', 'Var', 'bias', 'MSE',
    'sign', 'sgn', 'sinc']);
  const LIMFUNCS = new Set(['lim', 'max', 'min', 'sup', 'inf', 'argmax', 'argmin', 'det', 'gcd', 'Pr']);
  const ACCENTS = {
    hat: '^', bar: '¯', vec: '→', tilde: '~', dot: '˙', ddot: '¨', widehat: '^', widetilde: '~', overline: '¯',
    check: 'ˇ', acute: '´', grave: '`', breve: '˘',
  };
  const DOUBLE_EX = { C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ' };
  const CAL_EX = { B: 'ℬ', E: 'ℰ', F: 'ℱ', H: 'ℋ', I: 'ℐ', L: 'ℒ', M: 'ℳ', R: 'ℛ', e: 'ℯ', g: 'ℊ', o: 'ℴ' };

  function mapLetters(s, A, a, d, ex) {
    let out = '';
    for (const ch of s) {
      const c = ch.codePointAt(0);
      if (c >= 65 && c <= 90) out += ex[ch] || String.fromCodePoint(A + c - 65);
      else if (c >= 97 && c <= 122) out += ex[ch] || String.fromCodePoint(a + c - 97);
      else if (d && c >= 48 && c <= 57) out += String.fromCodePoint(d + c - 48);
      else out += ch;
    }
    return out;
  }

  /* ------------------------------ Parsing ------------------------------ */

  function tokenize(src) {
    const t = [];
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === '\\') {
        const m = /^\\([A-Za-z]+|[\s\S])/.exec(src.slice(i, i + 40));
        if (!m) { i++; continue; }
        t.push({ k: 'cmd', v: m[1] });
        i += m[0].length;
      } else if (/\s/.test(c)) { t.push({ k: 'sp', v: ' ' }); i++; }
      else if ('{}^_&'.includes(c)) { t.push({ k: c, v: c }); i++; }
      else { t.push({ k: 'ch', v: c }); i++; }
    }
    return t;
  }

  function charNode(c) {
    if (/[0-9.]/.test(c)) return { t: 'num', v: c };
    if (/\p{L}/u.test(c)) return { t: 'var', v: c };
    if ('+-=<>*/:'.includes(c)) return { t: 'op', v: c === '-' ? '−' : c === '*' ? '∗' : c };
    if (',;'.includes(c)) return { t: 'punct', v: c };
    if (c === "'") return { t: 'sym', v: '′' };
    return { t: 'sym', v: c };
  }

  function parseMath(src) {
    const toks = tokenize(String(src));
    let p = 0;
    const skipSp = () => { while (p < toks.length && toks[p].k === 'sp') p++; };
    const isCmd = (t, ...names) => !!t && t.k === 'cmd' && names.includes(t.v);

    function seq(stop) {
      const out = [];
      while (p < toks.length && !stop(toks[p])) {
        const a = scripted();
        if (a) out.push(a);
      }
      return out;
    }

    function group() {
      skipSp();
      const t = toks[p];
      if (!t || t.k === '}') return [];
      if (t.k === '{') { p++; const n = seq((x) => x.k === '}'); p++; return n; }
      const a = atom();
      return a ? [a] : [];
    }

    function scripted() {
      const base = atom();
      if (!base) return null;
      let sup = null, sub = null;
      for (;;) {
        const save = p;
        skipSp();
        const t = toks[p];
        if (t && (t.k === '^' || t.k === '_')) {
          p++;
          const g = group();
          if (t.k === '^') sup = g; else sub = g;
        } else { p = save; break; }
      }
      return sup || sub ? { t: 'ss', base, sup, sub } : base;
    }

    function atom() {
      const tk = toks[p];
      if (!tk) return null;
      if (tk.k === '^' || tk.k === '_') return { t: 'sym', v: '' };
      p++;
      switch (tk.k) {
        case 'sp': case '}': case '&': return null;
        case '{': { const c = seq((x) => x.k === '}'); p++; return { t: 'group', c }; }
        case 'ch': return charNode(tk.v);
        default: return command(tk.v);
      }
    }

    function raw() {
      skipSp();
      if (!toks[p] || toks[p].k !== '{') return '';
      p++;
      let depth = 1, s = '';
      while (p < toks.length) {
        const t = toks[p++];
        if (t.k === '{') { depth++; continue; }
        if (t.k === '}') { if (--depth === 0) break; continue; }
        if (t.k === 'cmd') s += has(GREEK, t.v) ? GREEK[t.v] : has(SYM, t.v) ? SYM[t.v] : '';
        else s += t.v;
      }
      return s;
    }

    function delimChar() {
      skipSp();
      const t = toks[p++];
      if (!t) return '';
      if (t.k === 'ch') return t.v === '.' ? '' : t.v;
      if (t.k === 'cmd') return has(SYM, t.v) ? SYM[t.v] : '';
      return '';
    }

    function env() {
      const name = raw();
      if (name === 'array') group();
      const rows = [];
      let row = [];
      const stop = (x) => x.k === '&' || isCmd(x, '\\', 'end');
      for (;;) {
        row.push(seq(stop));
        const t = toks[p];
        if (!t) break;
        p++;
        if (t.k === '&') continue;
        if (t.v === '\\') { rows.push(row); row = []; continue; }
        if (t.v === 'end') { raw(); break; }
      }
      const emptyTail = row.length === 1 && !row[0].length && rows.length > 0;
      if (!emptyTail) rows.push(row);
      return { t: 'env', name, rows };
    }

    function command(name) {
      if (has(GREEK, name)) return { t: 'var', v: GREEK[name] };
      if (has(BIG, name)) return { t: 'big', v: BIG[name], lim: !NOLIMITS.has(name) };
      if (FUNCS.has(name)) return { t: 'fn', v: name, lim: LIMFUNCS.has(name) };
      if (has(ACCENTS, name)) return { t: 'acc', ch: ACCENTS[name], c: group() };
      if (has(SYM, name)) return { t: OPS.has(name) ? 'op' : 'sym', v: SYM[name] };
      switch (name) {
        case 'frac': case 'dfrac': case 'tfrac': { const n = group(); const d = group(); return { t: 'frac', n, d }; }
        case 'binom': { const n = group(); const d = group(); return { t: 'binom', n, d }; }
        case 'sqrt': {
          let idx = null;
          const save = p;
          skipSp();
          if (toks[p] && toks[p].k === 'ch' && toks[p].v === '[') {
            p++;
            idx = [];
            while (p < toks.length && !(toks[p].k === 'ch' && toks[p].v === ']')) {
              const a = scripted();
              if (a) idx.push(a);
            }
            p++;
          } else p = save;
          return { t: 'sqrt', idx, c: group() };
        }
        case 'text': case 'textrm': case 'mathrm': case 'operatorname': case 'mbox': case 'mathsf': case 'mathtt':
          return { t: 'text', v: raw(), style: 'rm' };
        case 'mathbf': case 'boldsymbol': case 'bm': case 'textbf':
          return { t: 'text', v: raw(), style: 'b' };
        case 'mathit': case 'textit':
          return { t: 'text', v: raw(), style: 'it' };
        case 'mathbb':
          return { t: 'text', v: mapLetters(raw(), 0x1D538, 0x1D552, 0x1D7D8, DOUBLE_EX), style: 'rm' };
        case 'mathcal': case 'mathscr':
          return { t: 'text', v: mapLetters(raw(), 0x1D49C, 0x1D4B6, null, CAL_EX), style: 'rm' };
        case 'left': {
          const l = delimChar();
          const c = seq((x) => isCmd(x, 'right'));
          p++;
          const r = delimChar();
          return { t: 'delim', l, r, c };
        }
        case 'begin': return env();
        case 'end': raw(); return null;
        case 'right': case 'limits': case 'nolimits': case 'displaystyle': case 'textstyle': case 'scriptstyle':
        case 'big': case 'Big': case 'bigg': case 'Bigg': case '\\':
          return null;
        default: return { t: 'text', v: '\\' + name, style: 'err' };
      }
    }

    return seq(() => false);
  }

  /* ------------------------------ Rendu DOM ------------------------------ */

  function el(cls, kids, text) {
    const e = document.createElement('span');
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    for (const k of kids || []) e.append(k);
    return e;
  }

  const list = (nodes, d) => (nodes || []).map((n) => one(n, d)).filter(Boolean);

  function dEl(ch, side, k) {
    if (!ch) return null;
    const map = { '(': 'pl', ')': 'pr', '[': 'bl', ']': 'br', '|': side === 'l' ? 'vl' : 'vr', '‖': 'vv' };
    if (has(map, ch)) return el('m-d m-d-' + map[ch]);
    const e = el('m-d m-dt', null, ch);
    e.style.transform = 'scaleY(' + k + ')';
    return e;
  }

  function delim(l, r, kids, k) {
    return el('m-delim', [dEl(l, 'l', k || 1.6), el('m-dc', kids), dEl(r, 'r', k || 1.6)].filter(Boolean));
  }

  function scripts(n, d) {
    const b = n.base;
    const sup = n.sup ? list(n.sup, false) : null;
    const sub = n.sub ? list(n.sub, false) : null;
    if (d && (b.t === 'big' || b.t === 'fn') && b.lim) {
      const kids = [];
      if (sup) kids.push(el('m-lim-s', sup));
      kids.push(one(b, d));
      if (sub) kids.push(el('m-lim-s', sub));
      return el('m-lim', kids);
    }
    const base = one(b, d);
    if (sup && sub) return el('m-g', [base, el('m-ss', [el('', sup), el('m-ss-gap'), el('', sub)])]);
    if (sup) return el('m-g', [base, el('m-sup', sup)]);
    return el('m-g', [base, el('m-sub', sub)]);
  }

  function envEl(n, d) {
    const nc = Math.max(1, ...n.rows.map((r) => r.length));
    const kind = n.name.replace('*', '');
    const left = kind === 'cases';
    const aligned = /^(aligned|align|split|eqnarray|gathered)$/.test(kind);
    const grid = el('m-mat');
    grid.style.gridTemplateColumns = 'repeat(' + nc + ', auto)';
    if (aligned) grid.style.columnGap = '0.15em';
    n.rows.forEach((row) => {
      for (let c = 0; c < nc; c++) {
        const cell = el('m-cell', list(row[c] || [], false));
        cell.style.textAlign = left ? 'left' : aligned ? (c % 2 ? 'left' : 'right') : 'center';
        grid.append(cell);
      }
    });
    const D = { pmatrix: ['(', ')'], bmatrix: ['[', ']'], Bmatrix: ['{', '}'], vmatrix: ['|', '|'], Vmatrix: ['‖', '‖'], cases: ['{', ''] };
    const dl = has(D, kind) ? D[kind] : ['', ''];
    return delim(dl[0], dl[1], [grid], Math.max(1.3, n.rows.length * 1.15));
  }

  function one(n, d) {
    switch (n.t) {
      case 'num': return el('m-n', null, n.v);
      case 'var': return el(/^[A-Za-z\u03b1-\u03c9\u03d1\u03d5\u03f5]$/.test(n.v) ? 'm-v' : 'm-n', null, n.v);
      case 'op': return el('m-op', null, n.v);
      case 'sym': return el('m-s', null, n.v);
      case 'punct': return el('m-p', null, n.v);
      case 'fn': return el('m-rm m-fn', null, n.v);
      case 'big': return el('m-big' + (d ? ' m-bigd' : ''), null, n.v);
      case 'text': return el({ rm: 'm-rm', b: 'm-b', it: 'm-v', err: 'm-err' }[n.style], null, n.v);
      case 'group': return el('m-g', list(n.c, d));
      case 'frac': return el('m-frac', [el('m-num', list(n.n, false)), el('m-den', list(n.d, false))]);
      case 'binom': return delim('(', ')', [el('m-stack', [el('', list(n.n, false)), el('', list(n.d, false))])]);
      case 'sqrt':
        return el('m-sqrt', (n.idx ? [el('m-idx', list(n.idx, false))] : [])
          .concat([el('m-rad', null, '√'), el('m-rc', list(n.c, d))]));
      case 'acc': return el('m-acc', [el('m-accch', null, n.ch), el('m-accb', list(n.c, d))]);
      case 'delim': return delim(n.l, n.r, list(n.c, d));
      case 'env': return envEl(n, d);
      case 'ss': return scripts(n, d);
      default: return null;
    }
  }

  function render(src, display) {
    const box = el('m' + (display ? ' m-display' : ''));
    try {
      list(parseMath(src), !!display).forEach((x) => box.append(x));
    } catch (e) {
      box.className += ' m-err';
      box.textContent = src;
    }
    return box;
  }

  root.RDTMath = { render, parseMath };
  if (typeof module !== 'undefined' && module.exports) module.exports = { parseMath, render };
})(typeof window !== 'undefined' ? window : globalThis);
