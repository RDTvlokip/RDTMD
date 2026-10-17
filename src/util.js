'use strict';
/** Utilitaires partagés par les parseurs de blocs. */

const THEMES = ['default', 'warm', 'cool', 'mono', 'pastel', 'vivid'];
const ALIGNS = ['left', 'center', 'right'];

const diag = (line, severity, message, code, data) => {
  const d = { line, severity, message };
  if (code) d.code = code;
  if (data) d.data = data;
  return d;
};

function indentOf(l) {
  let n = 0;
  for (const c of l) {
    if (c === ' ') n++;
    else if (c === '\t') n += 4;
    else break;
  }
  return n;
}

function splitList(s) {
  return s.split(',').map((x) => x.trim()).filter((x) => x !== '');
}

function toNum(s, ln, diags) {
  if (s === undefined) return 0;
  const v = Number(s);
  if (s === '' || Number.isNaN(v)) { diags.push(diag(ln, 'error', `Nombre invalide : "${s}"`, 'bad-number')); return 0; }
  return v;
}

const stripQuotes = (s) => String(s || '').trim().replace(/^"(.*)"$/, '$1');

/** Distance d'édition, pour proposer "vouliez-vous dire ...". */
function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

function closest(word, choices) {
  let best = null, bd = Infinity;
  for (const c of choices) {
    const d = lev(word.toLowerCase(), c);
    if (d < bd) { bd = d; best = c; }
  }
  return bd <= Math.max(2, Math.floor(word.length / 2)) ? best : null;
}

/**
 * Options communes à tous les diagrammes et graphiques :
 *   @theme <nom>   @width <px>   @align left|center|right
 * Retourne true si la ligne a été consommée.
 */
function commonOpt(name, value, opts, ln, diags) {
  const v = String(value || '').trim();
  switch (name) {
    case 'theme':
      if (THEMES.includes(v.toLowerCase())) opts.theme = v.toLowerCase();
      else diags.push(diag(ln, 'warning', `Thème inconnu "${v}" (${THEMES.join(', ')})`, 'bad-option'));
      return true;
    case 'width': {
      const n = Number(v.replace(/px$/i, ''));
      if (Number.isFinite(n) && n >= 120 && n <= 4000) opts.width = Math.round(n);
      else diags.push(diag(ln, 'warning', `@width invalide "${v}" (nombre de pixels entre 120 et 4000)`, 'bad-option'));
      return true;
    }
    case 'align':
      if (ALIGNS.includes(v.toLowerCase())) opts.align = v.toLowerCase();
      else diags.push(diag(ln, 'warning', `@align invalide "${v}" (left, center ou right)`, 'bad-option'));
      return true;
    default:
      return false;
  }
}

/** Ajoute `opts` au noeud seulement s'il n'est pas vide. */
function withOpts(node, opts) {
  if (Object.keys(opts).length) node.opts = opts;
  return node;
}

module.exports = { THEMES, ALIGNS, diag, indentOf, splitList, toNum, stripQuotes, lev, closest, commonOpt, withOpts };
