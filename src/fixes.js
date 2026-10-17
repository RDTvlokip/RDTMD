'use strict';
/**
 * Correctifs rapides (Quick Fix) : logique pure, indépendante de VS Code.
 * fixesFor(diagnostic, lines) -> [{ title, edits: [edit] }]
 *   edit = { type: 'replace', line, start, end, text } | { type: 'insert', line, col, text }
 *        | { type: 'deleteLine', line } | { type: 'append', text }
 */

/** Remplace le mot capturé en groupe 2 (le groupe 1 est le préfixe qui le précède). */
const replaceWord = (lines, line, re, text) => {
  const src = lines[line];
  if (src === undefined) return null;
  const m = re.exec(src);
  if (!m) return null;
  const start = m.index + m[1].length;
  return { type: 'replace', line, start, end: start + m[2].length, text };
};

function fixesFor(d, lines) {
  const out = [];
  const data = d.data || {};
  const line = d.line;

  switch (d.code) {
    case 'unknown-kind': {
      if (!data.hint) break;
      const e = replaceWord(lines, line, /^(:{3,}\s*(?:chart|diagram)\s+)(\S+)/, data.hint);
      if (e) out.push({ title: `Remplacer par "${data.hint}"`, edits: [e] });
      break;
    }
    case 'unknown-directive': {
      if (!data.hint) break;
      const e = replaceWord(lines, line, /^(:{3,}\s*)([A-Za-z]+)/, data.hint);
      if (e) out.push({ title: `Remplacer par ":::${data.hint}"`, edits: [e] });
      break;
    }
    case 'unknown-option': {
      if (!data.hint) break;
      const e = replaceWord(lines, line, /^(\s*@)(\w+)/, data.hint);
      if (e) out.push({ title: `Remplacer par "@${data.hint}"`, edits: [e] });
      break;
    }
    case 'chart-length': {
      const src = lines[line];
      const m = src === undefined ? null : /^(\s*.+?\s*:\s*)(.*)$/.exec(src);
      if (!m) break;
      const parts = m[2].split(',').map((x) => x.trim()).filter((x) => x !== '');
      while (parts.length < data.expected) parts.push('0');
      parts.length = data.expected;
      out.push({
        title: `Ajuster à ${data.expected} valeur(s)`,
        edits: [{ type: 'replace', line, start: m[1].length, end: src.length, text: parts.join(', ') }],
      });
      break;
    }
    case 'unclosed': {
      out.push({ title: 'Ajouter ":::" de fermeture à la fin du document', edits: [{ type: 'append', text: ':'.repeat(Math.max(3, data.fence || 3)) }] });
      break;
    }
    case 'unclosed-group':
    case 'unclosed-block': {
      let close = -1;
      for (let i = line + 1; i < lines.length; i++) if (/^:{3,}\s*$/.test(lines[i])) { close = i; break; }
      if (close < 0) close = lines.length;
      const indent = /^\s*/.exec(lines[line] || '')[0];
      out.push({ title: 'Ajouter "end" avant la fin du diagramme', edits: [{ type: 'insert', line: close, col: 0, text: indent + 'end\n' }] });
      break;
    }
    case 'stray-end':
    case 'stray-else': {
      out.push({ title: 'Supprimer cette ligne', edits: [{ type: 'deleteLine', line }] });
      break;
    }
    case 'footnote-missing': {
      out.push({ title: `Ajouter la définition [^${data.id}]`, edits: [{ type: 'append', text: `[^${data.id}]: ` }] });
      break;
    }
    default:
  }
  return out;
}

/** Applique un correctif à un tableau de lignes (utilisé par les tests ; l'extension passe par WorkspaceEdit). */
function applyFix(lines, fix) {
  const out = lines.slice();
  const order = fix.edits.slice().sort((a, b) => (b.line === undefined ? Infinity : b.line) - (a.line === undefined ? Infinity : a.line));
  order.forEach((e) => {
    if (e.type === 'replace') out[e.line] = out[e.line].slice(0, e.start) + e.text + out[e.line].slice(e.end);
    else if (e.type === 'insert') out.splice(e.line, 0, ...(e.text.endsWith('\n') ? e.text.slice(0, -1) : e.text).split('\n'));
    else if (e.type === 'deleteLine') out.splice(e.line, 1);
    else if (e.type === 'append') {
      if (out.length && out[out.length - 1] === '') out.splice(out.length - 1, 0, e.text);
      else out.push(e.text);
    }
  });
  return out;
}

module.exports = { fixesFor, applyFix };
