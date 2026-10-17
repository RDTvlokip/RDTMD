'use strict';
/**
 * Correctifs rapides (Quick Fix) : logique pure, indépendante de VS Code.
 * fixesFor(diagnostic, lines) -> [{ title, edits: [edit] }]
 *   edit = { type: 'replace', line, start, end, text } | { type: 'insert', line, col, text }
 *        | { type: 'deleteLine', line } | { type: 'append', text }
 */

/** Blocs dont le contenu n'est pas du Markdown de blocs : une définition de note n'y serait pas reconnue. */
const TEXT_ONLY_BLOCKS = new Set(['chat', 'dialog', 'metrics', 'kpi', 'chart', 'diagram']);

/** Directive ouverte la plus proche au-dessus de la ligne (les fermetures rencontrées sont comptées). */
function enclosingBlock(lines, line) {
  let depth = 0;
  for (let i = Math.min(line, lines.length) - 1; i >= 0; i--) {
    const l = lines[i];
    if (/^:{3,}\s*$/.test(l)) { depth++; continue; }
    const m = /^(:{3,})\s*([A-Za-z]+)\b/.exec(l);
    if (!m) continue;
    if (depth === 0) return { name: m[2].toLowerCase(), fence: m[1].length, line: i };
    depth--;
  }
  return null;
}

/** Ligne de fermeture du bloc ouvert à `from`, ou -1. */
function closeOf(lines, from, fence) {
  const close = new RegExp('^:{' + fence + ',}\\s*$'), open = new RegExp('^:{' + fence + ',}\\s*[A-Za-z]');
  let depth = 1;
  for (let i = from + 1; i < lines.length; i++) {
    if (close.test(lines[i])) { if (--depth === 0) return i; } else if (open.test(lines[i])) depth++;
  }
  return -1;
}

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
      const fence = Math.max(3, data.fence || 3);
      /* le plus souvent la fermeture manque juste avant le bloc suivant, qui a été avalé comme bloc imbriqué */
      const opener = new RegExp('^:{' + fence + ',}\\s*[A-Za-z]');
      let at = -1;
      for (let i = line + 1; i < lines.length; i++) if (opener.test(lines[i])) { at = i; break; }
      if (at >= 0) out.push({ title: 'Ajouter ":::" de fermeture avant le bloc suivant', edits: [{ type: 'insert', line: at, col: 0, text: ':'.repeat(fence) + '\n' }] });
      else out.push({ title: 'Ajouter ":::" de fermeture à la fin du document', edits: [{ type: 'append', text: ':'.repeat(fence) }] });
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
      /* une note citée dans un message de chat ne peut pas être définie dans le bloc : on la place après sa fermeture */
      const enc = enclosingBlock(lines, line);
      if (enc && TEXT_ONLY_BLOCKS.has(enc.name)) {
        const close = closeOf(lines, enc.line, enc.fence);
        /* bloc non fermé : on ne propose rien ici, le correctif "fermer le bloc" doit passer d'abord */
        if (close >= 0) out.push({ title: `Ajouter la définition [^${data.id}]`, edits: [{ type: 'insert', line: close + 1, col: 0, text: `\n[^${data.id}]: \n` }] });
        break;
      }
      /* juste après le paragraphe qui cite la note : toujours dans le même bloc, donc toujours reconnue */
      let end = Math.min(line, lines.length - 1);
      const startsBlock = /^(:{3,}|\[\^|#{1,6}\s|`{3,}|~{3,}|@|>|\s*[-*+]\s|\s*\d+[.)]\s|\||\$\$)/;
      while (end + 1 < lines.length && lines[end + 1].trim() !== '' && !startsBlock.test(lines[end + 1])) end++;
      out.push({ title: `Ajouter la définition [^${data.id}]`, edits: [{ type: 'insert', line: end + 1, col: 0, text: `\n[^${data.id}]: \n` }] });
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
