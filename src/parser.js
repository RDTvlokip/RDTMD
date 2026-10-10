'use strict';
/**
 * RDTMD : noyau de parsing from scratch.
 * Entrée : texte. Sortie : { ast, diagnostics }. Aucun HTML, aucune dépendance.
 */

const RE = {
  blank: /^\s*$/,
  fence: /^\s{0,3}(`{3,})\s*(.*)$/,
  mathFence: /^\s{0,3}\$\$\s*$/,
  mathOne: /^\s{0,3}\$\$(.+)\$\$\s*$/,
  heading: /^\s{0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/,
  hr: /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/,
  quote: /^\s{0,3}>\s?(.*)$/,
  list: /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/,
  tableSep: /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/,
  open: /^:{3,}\s*([A-Za-z]+)\b\s*(.*)$/,
  close: /^:{3,}\s*$/,
  include: /^@include\s+(.+?)\s*$/,
};
const CALLOUTS = new Set(['note', 'tip', 'warn', 'danger']);
const CHARTS = new Set(['bar', 'line', 'pie']);
const DIAGRAMS = new Set(['flow', 'sequence', 'mindmap', 'timeline']);

const diag = (line, severity, message) => ({ line, severity, message });

function indentOf(l) {
  let n = 0;
  for (const c of l) {
    if (c === ' ') n++;
    else if (c === '\t') n += 4;
    else break;
  }
  return n;
}

function dedent(l, n) {
  let col = 0, k = 0;
  while (k < l.length && col < n && (l[k] === ' ' || l[k] === '\t')) {
    col += l[k] === '\t' ? 4 : 1;
    k++;
  }
  return l.slice(k);
}

/* ------------------------------ Blocs ------------------------------ */

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells = [];
  let cur = '', inCode = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && s[i + 1] === '|') { cur += '|'; i++; continue; }
    if (c === '`') inCode = !inCode;
    if (c === '|' && !inCode) { cells.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

function isTableStart(lines, i) {
  const a = lines[i], b = lines[i + 1];
  if (b === undefined || !a.includes('|') || !b.includes('|') || !RE.tableSep.test(b)) return false;
  return splitRow(a).length === splitRow(b).length;
}

function isBlockStart(lines, i, inPara) {
  const l = lines[i];
  if (RE.fence.test(l) || RE.mathFence.test(l) || RE.mathOne.test(l) || RE.heading.test(l) ||
      RE.hr.test(l) || RE.quote.test(l) || RE.open.test(l) || RE.include.test(l)) return true;
  const m = RE.list.exec(l);
  if (m) {
    if (inPara && /^\d/.test(m[2]) && parseInt(m[2], 10) !== 1) return false;
    return true;
  }
  return isTableStart(lines, i);
}

function splitList(s) {
  return s.split(',').map((x) => x.trim()).filter((x) => x !== '');
}

function toNum(s, ln, diags) {
  if (s === undefined) return 0;
  const v = Number(s);
  if (Number.isNaN(v)) { diags.push(diag(ln, 'error', `Nombre invalide : "${s}"`)); return 0; }
  return v;
}

function parseChart(args, body, bodyBase, line, diags) {
  const am = /^(\S*)\s*(.*)$/.exec(args);
  let kind = am[1].toLowerCase();
  const title = am[2].trim().replace(/^"(.*)"$/, '$1');
  if (!CHARTS.has(kind)) {
    diags.push(diag(line, 'error', kind
      ? `Type de graphique inconnu "${kind}" (bar, line, pie)`
      : 'Type de graphique manquant (bar, line, pie)'));
    kind = 'bar';
  }
  let unit = '', categories = null;
  const raw = [];
  body.forEach((l, k) => {
    const ln = bodyBase + k, t = l.trim();
    if (!t || t.startsWith('//')) return;
    let m = /^@(\w+)\s*(.*)$/.exec(t);
    if (m) {
      if (m[1] === 'unit') unit = m[2];
      else diags.push(diag(ln, 'warning', `Option inconnue "@${m[1]}"`));
      return;
    }
    m = /^(.+?)\s*:\s*(.*)$/.exec(t);
    if (!m) { diags.push(diag(ln, 'error', 'Ligne invalide, attendu "nom: valeurs"')); return; }
    if (m[1].toLowerCase() === 'x') { categories = splitList(m[2]); return; }
    raw.push({ name: m[1], parts: splitList(m[2]), ln });
  });
  if (!raw.length) diags.push(diag(line, 'warning', 'Graphique sans données'));
  let series;
  if (categories) {
    series = raw.map((r) => {
      if (r.parts.length !== categories.length) {
        diags.push(diag(r.ln, 'error', `"${r.name}" : ${r.parts.length} valeur(s) pour ${categories.length} catégorie(s)`));
      }
      return { name: r.name, values: categories.map((_, idx) => toNum(r.parts[idx], r.ln, diags)) };
    });
  } else {
    categories = raw.map((r) => r.name);
    raw.forEach((r) => {
      if (r.parts.length !== 1) diags.push(diag(r.ln, 'error', `Une seule valeur attendue pour "${r.name}" (ou ajoute une ligne "x: ...")`));
    });
    series = [{ name: 'valeur', values: raw.map((r) => toNum(r.parts[0], r.ln, diags)) }];
  }
  return { type: 'chart', kind, title, unit, categories, series, line };
}

function parseFlow(title, body, bodyBase, line, diags) {
  let dir = 'LR';
  const nodes = [];
  const nodeSet = new Set();
  const edges = [];
  const addNode = (name) => {
    if (!name) return;
    if (!nodeSet.has(name)) {
      nodeSet.add(name);
      nodes.push(name);
    }
  };

  body.forEach((l, k) => {
    const ln = bodyBase + k, t = l.trim();
    if (!t || t.startsWith('//')) return;
    const opt = /^@(\w+)\s*(.*)$/.exec(t);
    if (opt) {
      if (opt[1].toLowerCase() === 'dir') {
        const d = opt[2].trim().toUpperCase();
        if (d === 'LR' || d === 'TD') {
          dir = d;
        } else {
          diags.push(diag(ln, 'warning', `Option @dir invalide "${opt[2]}" (LR ou TD attendu)`));
        }
      } else {
        diags.push(diag(ln, 'warning', `Option inconnue "@${opt[1]}"`));
      }
      return;
    }

    const em = /^\s*(.+?)\s*(-->|->)\s*(.+?)(?:\s*:\s*(.*))?$/.exec(t);
    if (!em) {
      diags.push(diag(ln, 'error', 'Ligne invalide, attendu "A -> B" ou "A --> B [: label]"'));
      return;
    }
    const from = em[1].trim();
    const to = em[3].trim();
    const style = em[2] === '-->' ? 'dashed' : 'solid';
    const label = (em[4] || '').trim();
    addNode(from);
    addNode(to);
    edges.push({ from, to, style, label, ln });
  });

  return { type: 'diagram', kind: 'flow', title, dir, nodes, edges, line };
}

function parseSequence(title, body, bodyBase, line, diags) {
  const participants = [];
  const partSet = new Set();
  const messages = [];
  const addPart = (name) => {
    if (!name) return;
    if (!partSet.has(name)) {
      partSet.add(name);
      participants.push(name);
    }
  };

  body.forEach((l, k) => {
    const ln = bodyBase + k, t = l.trim();
    if (!t || t.startsWith('//')) return;
    const opt = /^@(\w+)\s*(.*)$/.exec(t);
    if (opt) {
      diags.push(diag(ln, 'warning', `Option inconnue "@${opt[1]}"`));
      return;
    }
    const em = /^\s*(.+?)\s*(-->|->)\s*(.+?)(?:\s*:\s*(.*))?$/.exec(t);
    if (!em) {
      diags.push(diag(ln, 'error', 'Ligne invalide, attendu "A -> B : message"'));
      return;
    }
    const from = em[1].trim();
    const to = em[3].trim();
    const style = em[2] === '-->' ? 'dashed' : 'solid';
    const label = (em[4] || '').trim();
    addPart(from);
    addPart(to);
    messages.push({ from, to, style, label, ln });
  });

  return { type: 'diagram', kind: 'sequence', title, participants, messages, line };
}

function parseMindmap(title, body, bodyBase, line, diags) {
  let root = null;
  const stack = [];

  body.forEach((l, k) => {
    const ln = bodyBase + k;
    if (RE.blank.test(l) || l.trim().startsWith('//')) return;
    const depth = Math.floor(indentOf(l) / 2);
    const text = l.trim();
    const node = { text, children: [] };

    if (!root) {
      root = node;
      stack.push({ depth, node });
      return;
    }

    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }

    if (stack.length > 0) {
      stack[stack.length - 1].node.children.push(node);
    } else {
      root.children.push(node);
    }
    stack.push({ depth, node });
  });

  if (!root) {
    root = { text: title || 'Mindmap', children: [] };
  }

  return { type: 'diagram', kind: 'mindmap', title, root, line };
}

function parseTimeline(title, body, bodyBase, line, diags) {
  const items = [];

  body.forEach((l, k) => {
    const ln = bodyBase + k, t = l.trim();
    if (!t || t.startsWith('//')) return;
    const m = /^(.+?)\s*:\s*(.*)$/.exec(t);
    if (!m) {
      diags.push(diag(ln, 'error', 'Ligne invalide, attendu "période: événement"'));
      return;
    }
    const period = m[1].trim();
    const events = m[2].split('|').map((s) => s.trim()).filter(Boolean);
    if (!events.length) {
      diags.push(diag(ln, 'warning', `Aucun événement pour la période "${period}"`));
    }
    items.push({ period, events, ln });
  });

  return { type: 'diagram', kind: 'timeline', title, items, line };
}

function parseDiagram(args, body, bodyBase, line, diags) {
  const am = /^(\S*)\s*(.*)$/.exec(args);
  let kind = am[1].toLowerCase();
  const title = am[2].trim().replace(/^"(.*)"$/, '$1');
  if (!DIAGRAMS.has(kind)) {
    diags.push(diag(line, 'error', kind
      ? `Type de diagramme inconnu "${kind}" (flow, sequence, mindmap, timeline)`
      : 'Type de diagramme manquant (flow, sequence, mindmap, timeline)'));
    kind = 'flow';
  }

  const activeLines = body.filter((l) => l.trim() && !l.trim().startsWith('//'));
  if (!activeLines.length) {
    diags.push(diag(line, 'warning', 'Diagramme sans données'));
  }

  switch (kind) {
    case 'flow':
      return parseFlow(title, body, bodyBase, line, diags);
    case 'sequence':
      return parseSequence(title, body, bodyBase, line, diags);
    case 'mindmap':
      return parseMindmap(title, body, bodyBase, line, diags);
    case 'timeline':
      return parseTimeline(title, body, bodyBase, line, diags);
    default:
      return { type: 'diagram', kind, title, line };
  }
}

function parseTabs(args, body, bodyBase, line, diags) {
  const tabs = [];
  let curTitle = null;
  let curLines = [];
  let curBase = bodyBase;
  let inCode = false, codeChar = '', codeLen = 0;

  const flush = () => {
    if (curTitle !== null) {
      tabs.push({
        title: curTitle,
        children: parseBlocks(curLines, curBase, diags),
      });
      curLines = [];
    }
  };

  body.forEach((l, idx) => {
    const fMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(l);
    if (!inCode && fMatch) {
      inCode = true;
      codeChar = fMatch[1][0];
      codeLen = fMatch[1].length;
    } else if (inCode) {
      const cMatch = new RegExp(`^\\s{0,3}${codeChar}{${codeLen},}\\s*$`).test(l);
      if (cMatch) inCode = false;
    }

    const tm = !inCode ? /^===\s*(.+)$/.exec(l) : null;
    if (tm) {
      flush();
      curTitle = tm[1].trim();
      curBase = bodyBase + idx + 1;
    } else {
      if (curTitle === null) {
        if (l.trim()) {
          curTitle = 'Onglet 1';
          curBase = bodyBase + idx;
          curLines.push(l);
        }
      } else {
        curLines.push(l);
      }
    }
  });
  flush();

  if (!tabs.length) {
    diags.push(diag(line, 'warning', 'Bloc tabs vide (utilise "=== Titre" pour définir un onglet)'));
  }

  return { type: 'tabs', tabs, line };
}

function parseMetrics(args, body, bodyBase, line, diags) {
  const title = (args || '').trim().replace(/^"(.*)"$/, '$1');
  const items = [];

  body.forEach((l, idx) => {
    const ln = bodyBase + idx;
    const t = l.trim();
    if (!t || t.startsWith('//')) return;

    const m = /^([^:]+):\s*(.+)$/.exec(t);
    if (!m) {
      diags.push(diag(ln, 'error', 'Ligne métrique invalide, attendu "Libellé: Valeur [(variation)]"'));
      return;
    }
    const label = m[1].trim();
    let valPart = m[2].trim();
    let diff = '', diffType = 'neutral';

    const dm = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(valPart);
    if (dm) {
      valPart = dm[1].trim();
      let rawDiff = dm[2].trim();
      let explicitType = null;

      // Détection préfixe : (good: -15%) / (bad: +2.1%) / (neutral: +1)
      const prefixMatch = /^(good|pos|amelioration|bad|neg|regression|neutral|neutre)\s*:\s*(.*)$/i.exec(rawDiff);
      if (prefixMatch) {
        const mod = prefixMatch[1].toLowerCase();
        if (['good', 'pos', 'amelioration'].includes(mod)) explicitType = 'pos';
        else if (['bad', 'neg', 'regression'].includes(mod)) explicitType = 'neg';
        else explicitType = 'neutral';
        rawDiff = prefixMatch[2].trim();
      } else {
        // Détection suffixe : (+2.1%, bad) / (-12%, good) / (+10, neutral)
        const suffixMatch = /^(.*?)\s*,\s*(good|pos|amelioration|bad|neg|regression|neutral|neutre)\s*$/i.exec(rawDiff);
        if (suffixMatch) {
          const mod = suffixMatch[2].toLowerCase();
          if (['good', 'pos', 'amelioration'].includes(mod)) explicitType = 'pos';
          else if (['bad', 'neg', 'regression'].includes(mod)) explicitType = 'neg';
          else explicitType = 'neutral';
          rawDiff = suffixMatch[1].trim();
        }
      }

      diff = rawDiff;
      if (explicitType !== null) {
        diffType = explicitType;
      } else if (/^[+]/.test(diff) || /^\u2191/.test(diff)) {
        diffType = 'pos';
      } else if (/^[-]/.test(diff) || /^\u2193/.test(diff)) {
        diffType = 'neg';
      } else {
        diffType = 'neutral';
      }
    }

    items.push({ label, value: valPart, diff, diffType, line: ln });
  });

  if (!items.length) {
    diags.push(diag(line, 'warning', 'Bloc metrics sans données'));
  }

  return { type: 'metrics', title, items, line };
}

function parseChat(args, body, bodyBase, line, diags) {
  const title = (args || '').trim().replace(/^"(.*)"$/, '$1');
  const messages = [];
  let curRole = null, curSender = null, curLines = [], curLn = bodyBase;

  const roleMap = {
    user: 'user', utilisateur: 'user', humain: 'user', human: 'user', me: 'user', moi: 'user',
    ia: 'assistant', ai: 'assistant', assistant: 'assistant', bot: 'assistant', model: 'assistant', modele: 'assistant',
    system: 'system', systeme: 'system'
  };

  const flush = () => {
    if (curSender !== null && curLines.length) {
      const fullText = curLines.join('\n');
      messages.push({
        role: curRole,
        sender: curSender,
        inline: parseInline(fullText, curLn, diags),
        raw: fullText,
        line: curLn,
      });
      curLines = [];
    }
  };

  body.forEach((l, idx) => {
    const ln = bodyBase + idx;
    const m = /^([A-Za-zÀ-ÿ0-9_.\s-]+?):\s*(.*)$/.exec(l);
    if (m && m[1].trim()) {
      const rawSender = m[1].trim();
      const norm = rawSender.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const role = roleMap[norm] || 'custom';
      flush();
      curRole = role;
      curSender = rawSender;
      curLn = ln;
      if (m[2]) curLines.push(m[2]);
    } else {
      if (curSender !== null) {
        curLines.push(l);
      } else if (l.trim()) {
        curRole = 'user';
        curSender = 'User';
        curLn = ln;
        curLines.push(l);
      }
    }
  });
  flush();

  if (!messages.length) {
    diags.push(diag(line, 'warning', 'Bloc chat vide'));
  }

  return { type: 'chat', title, messages, line };
}

function parseDetails(args, body, bodyBase, line, diags) {
  let open = false;
  let titleStr = (args || '').trim();
  if (/@open\b/i.test(titleStr)) {
    open = true;
    titleStr = titleStr.replace(/@open\b/ig, '').trim();
  }
  const title = titleStr.replace(/^"(.*)"$/, '$1').trim() || 'Détails';
  const children = parseBlocks(body, bodyBase, diags);

  return { type: 'details', title, open, children, line };
}

function parseDirective(lines, i, base, diags, out) {
  const m = /^(:{3,})\s*([A-Za-z]+)\b\s*(.*)$/.exec(lines[i]);
  const fence = m[1];
  const name = m[2].toLowerCase(), args = m[3].trim();
  const start = i;
  let depth = 1;
  i++;
  const body = [];
  let inCode = false, codeFenceChar = '', codeFenceLen = 0;

  while (i < lines.length) {
    const cur = lines[i];
    // Ne pas interpréter les ::: à l'intérieur d'un bloc de code fencé
    const fMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(cur);
    if (!inCode && fMatch) {
      inCode = true;
      codeFenceChar = fMatch[1][0];
      codeFenceLen = fMatch[1].length;
      body.push(cur);
      i++;
      continue;
    } else if (inCode) {
      const cMatch = new RegExp(`^\\s{0,3}${codeFenceChar}{${codeFenceLen},}\\s*$`).test(cur);
      if (cMatch) inCode = false;
      body.push(cur);
      i++;
      continue;
    }

    const closeMatch = new RegExp(`^:{${fence.length},}\\s*$`).test(cur);
    const openMatch = new RegExp(`^:{${fence.length},}\\s*([A-Za-z]+)\\b`).test(cur);

    if (closeMatch) {
      depth--;
      if (depth === 0) break;
    } else if (openMatch) {
      depth++;
    }
    body.push(cur);
    i++;
  }
  if (i >= lines.length) diags.push(diag(base + start, 'error', `Bloc ":::${name}" non fermé (":::" manquant)`));
  else i++;
  const bodyBase = base + start + 1;
  if (name === 'chart') {
    out.push(parseChart(args, body, bodyBase, base + start, diags));
  } else if (name === 'diagram') {
    out.push(parseDiagram(args, body, bodyBase, base + start, diags));
  } else if (name === 'tabs') {
    out.push(parseTabs(args, body, bodyBase, base + start, diags));
  } else if (name === 'metrics' || name === 'kpi') {
    out.push(parseMetrics(args, body, bodyBase, base + start, diags));
  } else if (name === 'chat' || name === 'dialog') {
    out.push(parseChat(args, body, bodyBase, base + start, diags));
  } else if (name === 'details' || name === 'accordion') {
    out.push(parseDetails(args, body, bodyBase, base + start, diags));
  } else if (CALLOUTS.has(name)) {
    out.push({ type: 'callout', kind: name, title: args, children: parseBlocks(body, bodyBase, diags), line: base + start });
  } else {
    diags.push(diag(base + start, 'warning', `Directive inconnue ":::${name}"`));
    out.push(...parseBlocks(body, bodyBase, diags));
  }
  return i;
}

function parseList(lines, i, base, diags) {
  const first = RE.list.exec(lines[i]);
  const indent = indentOf(first[1]);
  const ordered = /^\d/.test(first[2]);
  const node = { type: 'list', ordered, start: ordered ? parseInt(first[2], 10) : null, items: [], line: base + i };
  while (i < lines.length) {
    const m = RE.list.exec(lines[i]);
    if (!m || indentOf(m[1]) !== indent || /^\d/.test(m[2]) !== ordered) break;
    const itemStart = i;
    const contentCol = indent + m[2].length + 1;
    const content = [m[3]];
    i++;
    while (i < lines.length) {
      const l = lines[i];
      if (RE.blank.test(l)) {
        let j = i;
        while (j < lines.length && RE.blank.test(lines[j])) j++;
        if (j < lines.length && indentOf(lines[j]) > indent) {
          for (; i < j; i++) content.push('');
          continue;
        }
        break;
      }
      if (indentOf(l) > indent) { content.push(dedent(l, contentCol)); i++; continue; }
      break;
    }
    let checked = null;
    const tm = /^\[( |x|X)\]\s+(.*)$/.exec(content[0]);
    if (tm) { checked = tm[1] !== ' '; content[0] = tm[2]; }
    node.items.push({ checked, children: parseBlocks(content, base + itemStart, diags) });
    let j = i;
    while (j < lines.length && RE.blank.test(lines[j])) j++;
    if (j > i && j < lines.length) {
      const nm = RE.list.exec(lines[j]);
      if (nm && indentOf(nm[1]) === indent && /^\d/.test(nm[2]) === ordered) i = j;
    }
  }
  return { node, next: i };
}

function parseCodeFenceMeta(metaStr) {
  let s = (metaStr || '').trim();
  let lang = '', title = '', lines = false;
  const highlights = [];

  const colonMatch = /^([\w+#.-]+):(\S+)(.*)$/.exec(s);
  if (colonMatch) {
    lang = colonMatch[1];
    title = colonMatch[2];
    s = colonMatch[3].trim();
  } else {
    const firstWord = /^([\w+#.-]+)(.*)$/.exec(s);
    if (firstWord) {
      lang = firstWord[1];
      s = firstWord[2].trim();
    }
  }

  const titleMatch = /title=(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(s);
  if (titleMatch) {
    title = titleMatch[1] || titleMatch[2] || titleMatch[3] || '';
  }

  if (/\b(?:lines|lineNumbers|num)\b/i.test(s)) {
    lines = true;
  }

  const hlMatch = /(?:hl=(?:"([^"]*)"|'([^']*)')|\{([0-9,\s-]+)\})/.exec(s);
  if (hlMatch) {
    const hlStr = hlMatch[1] || hlMatch[2] || hlMatch[3] || '';
    hlStr.split(',').forEach((part) => {
      const p = part.trim();
      if (p.includes('-')) {
        const [st, en] = p.split('-').map(Number);
        if (!isNaN(st) && !isNaN(en)) {
          for (let k = st; k <= en; k++) highlights.push(k);
        }
      } else {
        const num = Number(p);
        if (!isNaN(num)) highlights.push(num);
      }
    });
  }

  return { lang, title, lines, highlights };
}

function parseBlocks(lines, base, diags) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (RE.blank.test(line)) { i++; continue; }
    let m;

    if ((m = RE.fence.exec(line))) {
      const close = new RegExp('^\\s{0,3}`{' + m[1].length + ',}\\s*$');
      const start = i;
      i++;
      const body = [];
      while (i < lines.length && !close.test(lines[i])) body.push(lines[i++]);
      if (i >= lines.length) diags.push(diag(base + start, 'error', 'Bloc de code non fermé'));
      else i++;
      const meta = parseCodeFenceMeta(m[2]);
      out.push({
        type: 'code',
        lang: meta.lang,
        title: meta.title,
        lines: meta.lines,
        highlights: meta.highlights,
        text: body.join('\n'),
        line: base + start,
      });
      continue;
    }
    if ((m = RE.mathOne.exec(line))) {
      out.push({ type: 'math', text: m[1].trim(), line: base + i });
      i++;
      continue;
    }
    if (RE.mathFence.test(line)) {
      const start = i;
      i++;
      const body = [];
      while (i < lines.length && !RE.mathFence.test(lines[i])) body.push(lines[i++]);
      if (i >= lines.length) diags.push(diag(base + start, 'error', 'Bloc math "$$" non fermé'));
      else i++;
      out.push({ type: 'math', text: body.join('\n').trim(), line: base + start });
      continue;
    }
    if ((m = RE.heading.exec(line))) {
      out.push({ type: 'heading', level: m[1].length, inline: parseInline(m[2]), line: base + i });
      i++;
      continue;
    }
    if (RE.hr.test(line)) { out.push({ type: 'hr', line: base + i }); i++; continue; }
    if ((m = RE.include.exec(line))) {
      out.push({ type: 'include', path: m[1], line: base + i });
      i++;
      continue;
    }
    if (RE.open.test(line)) { i = parseDirective(lines, i, base, diags, out); continue; }
    if (RE.quote.test(line)) {
      const start = i, inner = [];
      while (i < lines.length && (m = RE.quote.exec(lines[i]))) { inner.push(m[1]); i++; }
      out.push({ type: 'quote', children: parseBlocks(inner, base + start, diags), line: base + start });
      continue;
    }
    if (RE.list.test(line)) {
      const r = parseList(lines, i, base, diags);
      out.push(r.node);
      i = r.next;
      continue;
    }
    if (isTableStart(lines, i)) {
      const header = splitRow(line);
      const align = splitRow(lines[i + 1]).map((c) => {
        const l = c.startsWith(':'), r = c.endsWith(':');
        return l && r ? 'center' : r ? 'right' : l ? 'left' : null;
      });
      const start = i;
      i += 2;
      const rows = [];
      while (i < lines.length && !RE.blank.test(lines[i]) && lines[i].includes('|')) {
        const cells = splitRow(lines[i]);
        while (cells.length < header.length) cells.push('');
        rows.push(cells.slice(0, header.length).map((c) => parseInline(c)));
        i++;
      }
      out.push({ type: 'table', align, header: header.map((c) => parseInline(c)), rows, line: base + start });
      continue;
    }

    // Paragraphe
    const start = i, buf = [line];
    i++;
    while (i < lines.length && !RE.blank.test(lines[i]) && !isBlockStart(lines, i, true)) buf.push(lines[i++]);
    const text = buf
      .map((l, k) => (k < buf.length - 1 && / {2,}$/.test(l) ? l.trimEnd() + '\\' : l.trimEnd()))
      .map((l, k) => (k === 0 ? l.trimStart() : l.trimStart()))
      .join('\n');
    out.push({ type: 'paragraph', inline: parseInline(text), line: base + start });
  }
  return out;
}

/* ------------------------------ Inline ------------------------------ */

const ESCAPABLE = /[\\`*_{}[\]()#+\-.!|~$>:@]/;

function findClose(text, from, delim) {
  for (let j = from; j < text.length; j++) {
    const c = text[j];
    if (c === '\\') { j++; continue; }
    if (c === '`') {
      const e = text.indexOf('`', j + 1);
      if (e !== -1) { j = e; continue; }
    }
    if (text.startsWith(delim, j)) {
      if (delim.length === 1 && text[j + 1] === delim) {
        while (text[j + 1] === delim) j++;
        continue;
      }
      if (j === from) continue;
      if (/\s/.test(text[j - 1])) continue;
      if (delim === '_' && /\w/.test(text[j + 1] || '')) continue;
      return j;
    }
  }
  return -1;
}

function parseLinkAt(text, i) {
  let depth = 0, j = i;
  for (; j < text.length; j++) {
    const c = text[j];
    if (c === '\\') { j++; continue; }
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) break; }
  }
  if (j >= text.length || text[j + 1] !== '(') return null;
  let k = j + 2, paren = 1;
  while (k < text.length) {
    const c = text[k];
    if (c === '\\') { k += 2; continue; }
    if (c === '(') paren++;
    else if (c === ')') { paren--; if (paren === 0) break; }
    k++;
  }
  if (k >= text.length) return null;
  const tm = /^(\S*)(?:\s+"([^"]*)")?$/.exec(text.slice(j + 2, k).trim());
  if (!tm) return null;
  return { label: text.slice(i + 1, j), href: tm[1], title: tm[2] || '', end: k + 1 };
}

function findDollar(text, from) {
  for (let j = from; j < text.length; j++) {
    if (text[j] === '\\') { j++; continue; }
    if (text[j] === '$' && !/\s/.test(text[j - 1]) && !/\d/.test(text[j + 1] || '')) return j;
  }
  return -1;
}

function parseInline(text) {
  const out = [];
  let buf = '', i = 0;
  const flush = () => { if (buf) { out.push({ type: 'text', value: buf }); buf = ''; } };
  const wrap = (type, delimLen, end) => {
    flush();
    out.push({ type, children: parseInline(text.slice(i + delimLen, end)) });
    i = end + delimLen;
  };

  while (i < text.length) {
    const c = text[i];

    if (c === '\\' && i + 1 < text.length) {
      if (text[i + 1] === '\n') { flush(); out.push({ type: 'break' }); i += 2; continue; }
      if (ESCAPABLE.test(text[i + 1])) { buf += text[i + 1]; i += 2; continue; }
    }
    if (c === '`') {
      let n = 0;
      while (text[i + n] === '`') n++;
      const fence = '`'.repeat(n), end = text.indexOf(fence, i + n);
      if (end !== -1) { flush(); out.push({ type: 'code', value: text.slice(i + n, end).trim() }); i = end + n; continue; }
      buf += fence; i += n; continue;
    }
    if (c === '!' && text[i + 1] === '[') {
      const p = parseLinkAt(text, i + 1);
      if (p) { flush(); out.push({ type: 'image', alt: p.label, src: p.href, title: p.title }); i = p.end; continue; }
    }
    if (c === '[') {
      const p = parseLinkAt(text, i);
      if (p) { flush(); out.push({ type: 'link', href: p.href, title: p.title, children: parseInline(p.label) }); i = p.end; continue; }
    }
    if (c === '$') {
      if (text[i + 1] === '$') {
        const e = text.indexOf('$$', i + 2);
        if (e > i + 2) { flush(); out.push({ type: 'math', value: text.slice(i + 2, e).trim() }); i = e + 2; continue; }
      } else if (text[i + 1] && !/\s/.test(text[i + 1])) {
        const e = findDollar(text, i + 1);
        if (e !== -1) { flush(); out.push({ type: 'math', value: text.slice(i + 1, e) }); i = e + 1; continue; }
      }
    }
    if (c === 'h' && /^https?:\/\//.test(text.slice(i, i + 8)) && (i === 0 || !/\w/.test(text[i - 1]))) {
      const m = /^https?:\/\/[^\s<>]+/.exec(text.slice(i));
      let url = m[0].replace(/[.,;:!?]+$/, '');
      if (url.endsWith(')') && !url.includes('(')) url = url.slice(0, -1);
      flush();
      out.push({ type: 'link', href: url, title: '', children: [{ type: 'text', value: url }] });
      i += url.length;
      continue;
    }
    if (text.startsWith('**', i) && text[i + 2] && !/\s/.test(text[i + 2])) {
      const e = findClose(text, i + 2, '**');
      if (e !== -1) { wrap('strong', 2, e); continue; }
    }
    if (text.startsWith('~~', i) && text[i + 2] && !/\s/.test(text[i + 2])) {
      const e = findClose(text, i + 2, '~~');
      if (e !== -1) { wrap('strike', 2, e); continue; }
    }
    if ((c === '*' || c === '_') && text[i + 1] && !/\s/.test(text[i + 1]) && text[i + 1] !== c &&
        !(c === '_' && /\w/.test(text[i - 1] || ''))) {
      const e = findClose(text, i + 1, c);
      if (e !== -1) { wrap('em', 1, e); continue; }
    }
    if (c === '\n') { flush(); out.push({ type: 'softbreak' }); i++; continue; }
    buf += c;
    i++;
  }
  flush();
  return out;
}

function parse(src) {
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  const diagnostics = [];
  const children = parseBlocks(lines, 0, diagnostics);
  return { ast: { type: 'doc', children }, diagnostics };
}

module.exports = { parse, parseInline };
