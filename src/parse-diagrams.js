'use strict';
const { diag, indentOf, splitList, stripQuotes, closest, commonOpt, withOpts } = require('./util');

const DIAGRAMS = ['flow', 'state', 'sequence', 'mindmap', 'timeline', 'gantt', 'quadrant', 'er', 'class'];

const optHint = (name, known) => {
  const hint = closest(name, known);
  return hint ? ` — vouliez-vous dire "@${hint}" ?` : '';
};
const unknownOpt = (name, ln, diags, known) =>
  diags.push(diag(ln, 'warning', `Option inconnue "@${name}"${optHint(name.toLowerCase(), known)}`, 'unknown-option', { got: name }));

const COMMON = ['theme', 'width', 'align'];

/* ====================================================================== */
/* Flow / State                                                            */
/* ====================================================================== */

const SHAPES = [
  ['[(', ')]', 'cylinder'], ['((', '))', 'circle'], ['{{', '}}', 'hexagon'],
  ['[', ']', 'rect'], ['(', ')', 'round'], ['{', '}', 'diamond'],
];

/** "id[Libellé]", "id(Libellé)", "id{Libellé}", "id((Libellé))", "id[(Libellé)]", "id{{Libellé}}" ; sinon texte brut. */
function parseNodeExpr(text) {
  const t = text.trim();
  for (let i = 1; i < t.length; i++) {
    if (!'[({'.includes(t[i]) || /\s/.test(t[i - 1])) continue;
    for (const [o, c, shape] of SHAPES) {
      if (t.startsWith(o, i) && t.endsWith(c) && t.length >= i + o.length + c.length) {
        const id = t.slice(0, i).trim();
        if (!id) break;
        return { id, label: stripQuotes(t.slice(i + o.length, t.length - c.length)), shape, explicit: true };
      }
    }
    break;
  }
  return { id: t, label: t, shape: 'rect', explicit: false };
}

/** Découpe "A -> B --> C : étiquette" en dehors des crochets/guillemets. */
function splitChain(t) {
  const parts = [], arrows = [];
  let depth = 0, cur = '', label = null, i = 0;
  while (i < t.length) {
    const c = t[i];
    if (c === '"') {
      const e = t.indexOf('"', i + 1);
      if (e !== -1) { cur += t.slice(i, e + 1); i = e + 1; continue; }
    }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      if (t.startsWith('-->', i)) { parts.push(cur.trim()); arrows.push('-->'); cur = ''; i += 3; continue; }
      if (t.startsWith('->', i)) { parts.push(cur.trim()); arrows.push('->'); cur = ''; i += 2; continue; }
      if (c === ':') { label = t.slice(i + 1).trim(); break; }
    }
    cur += c;
    i++;
  }
  parts.push(cur.trim());
  return { parts, arrows, label };
}

function parseFlow(kind, title, body, bodyBase, line, diags) {
  const isState = kind === 'state';
  let dir = isState ? 'TD' : 'LR';
  const opts = {};
  const nodes = [];
  const nodeInfo = {};
  const groups = [];
  const edges = [];
  const gstack = [];
  const known = ['dir', ...COMMON];

  const addNode = (expr) => {
    if (!expr.id) return null;
    const cur = nodeInfo[expr.id];
    if (!cur) {
      nodes.push(expr.id);
      nodeInfo[expr.id] = { label: expr.label, shape: expr.shape };
    } else if (expr.explicit) {
      cur.label = expr.label;
      cur.shape = expr.shape;
    }
    if (gstack.length && nodeInfo[expr.id].group === undefined) nodeInfo[expr.id].group = gstack[gstack.length - 1].id;
    return expr.id;
  };

  const stateExpr = (text, pos) => {
    if (isState && text.trim() === '[*]') {
      return pos === 0 ? { id: '__start', label: '', shape: 'start', explicit: true } : { id: '__end', label: '', shape: 'end', explicit: true };
    }
    return parseNodeExpr(text);
  };

  body.forEach((l, k) => {
    const ln = bodyBase + k, t = l.trim();
    if (!t || t.startsWith('//')) return;

    const opt = /^@(\w+)\s*(.*)$/.exec(t);
    if (opt) {
      const name = opt[1].toLowerCase();
      if (name === 'dir') {
        const d = opt[2].trim().toUpperCase();
        if (d === 'LR') dir = 'LR';
        else if (d === 'TD' || d === 'TB') dir = 'TD';
        else diags.push(diag(ln, 'warning', `Option @dir invalide "${opt[2]}" (LR ou TD attendu)`, 'bad-option'));
      } else if (!commonOpt(name, opt[2], opts, ln, diags)) unknownOpt(opt[1], ln, diags, known);
      return;
    }

    const gm = /^(?:group|subgraph)\s+(.+)$/i.exec(t);
    if (gm && !/(-->|->)/.test(t)) {
      const g = { id: 'g' + groups.length, title: stripQuotes(gm[1]), parent: gstack.length ? gstack[gstack.length - 1].id : null, ln };
      groups.push(g);
      gstack.push(g);
      return;
    }
    if (/^end$/i.test(t)) {
      if (gstack.length) gstack.pop();
      else diags.push(diag(ln, 'error', '"end" sans "group" ouvert', 'stray-end'));
      return;
    }

    let { parts, arrows, label } = splitChain(t);
    if (!arrows.length) {
      const em = /^\s*(.+?)\s*(-->|->)\s*(.+?)(?:\s*:\s*(.*))?$/.exec(t);
      if (em) { parts = [em[1], em[3]]; arrows = [em[2]]; label = (em[4] || '').trim() || null; }
    }

    if (!arrows.length) {
      const e = stateExpr(t, 0);
      if (e.explicit && e.id) { addNode(e); return; }
      diags.push(diag(ln, 'error', isState
        ? 'Ligne invalide, attendu "A -> B [: label]" (ou "[*] -> A")'
        : 'Ligne invalide, attendu "A -> B" ou "A --> B [: label]"', 'bad-line'));
      return;
    }
    if (parts.some((p) => !p)) {
      diags.push(diag(ln, 'error', 'Noeud manquant autour d\'une flèche', 'bad-line'));
      return;
    }

    const ids = parts.map((p, i) => addNode(stateExpr(p, i)));
    arrows.forEach((a, i) => {
      edges.push({
        from: ids[i], to: ids[i + 1], style: a === '-->' ? 'dashed' : 'solid',
        label: i === arrows.length - 1 ? (label || '') : '', ln,
      });
    });
  });

  gstack.forEach((g) => diags.push(diag(g.ln, 'error', `Groupe "${g.title}" non fermé ("end" manquant)`, 'unclosed-group')));

  const node = { type: 'diagram', kind, title, dir, nodes, nodeInfo, groups, edges, line };
  return withOpts(node, opts);
}

/* ====================================================================== */
/* ER                                                                      */
/* ====================================================================== */

const CARD = '(?:0\\.\\.1|1\\.\\.\\*|0\\.\\.\\*|1|\\*)';
const ER_REL = new RegExp(`^(.+?)\\s+(${CARD})\\s*--\\s*(${CARD})\\s+(.+?)(?:\\s*:\\s*(.*))?$`);

function parseEr(title, body, bodyBase, line, diags) {
  const opts = {};
  const entities = [];
  const byName = {};
  const relations = [];
  let cur = null;
  const ensure = (name, ln) => {
    if (!byName[name]) { byName[name] = { name, attrs: [], ln }; entities.push(byName[name]); }
    return byName[name];
  };
  const known = [...COMMON];

  body.forEach((l, k) => {
    const ln = bodyBase + k, t = l.trim();
    if (!t || t.startsWith('//')) return;
    const opt = /^@(\w+)\s*(.*)$/.exec(t);
    if (opt) {
      if (!commonOpt(opt[1].toLowerCase(), opt[2], opts, ln, diags)) unknownOpt(opt[1], ln, diags, known);
      return;
    }
    const em = /^entity\s+(.+)$/i.exec(t);
    if (em && indentOf(l) === 0) { cur = ensure(stripQuotes(em[1]), ln); return; }
    if (indentOf(l) > 0 && cur) {
      const am = /^(.+?)(?:\s*:\s*(.+?))?((?:\s+(?:PK|FK|UK))+)?$/i.exec(t);
      const keys = am[3] ? am[3].trim().split(/\s+/).map((x) => x.toUpperCase()) : [];
      cur.attrs.push({ name: am[1].trim(), type: (am[2] || '').trim(), keys });
      return;
    }
    const rm = ER_REL.exec(t);
    if (rm) {
      cur = null;
      const a = rm[1].trim(), b = rm[4].trim();
      ensure(a, ln); ensure(b, ln);
      relations.push({ from: a, to: b, fromCard: rm[2], toCard: rm[3], label: (rm[5] || '').trim(), ln });
      return;
    }
    diags.push(diag(ln, 'error', 'Ligne invalide, attendu "entity Nom" (puis attributs indentés) ou "A 1--* B : libellé"', 'bad-line'));
  });

  return withOpts({ type: 'diagram', kind: 'er', title, entities, relations, line }, opts);
}

/* ====================================================================== */
/* Class                                                                   */
/* ====================================================================== */

const CLASS_OPS = [
  ['--|>', 'inherit', false], ['<|--', 'inherit', true], ['..|>', 'realize', false], ['<|..', 'realize', true],
  ['*--', 'compose', true], ['--*', 'compose', false], ['o--', 'aggregate', true], ['--o', 'aggregate', false],
  ['<--', 'assoc', true], ['-->', 'assoc', false], ['<..', 'depend', true], ['..>', 'depend', false],
  ['--', 'link', false], ['..', 'dlink', false],
];

function parseClass(title, body, bodyBase, line, diags) {
  const opts = {};
  const classes = [];
  const byName = {};
  const relations = [];
  let cur = null;
  const ensure = (name, ln) => {
    if (!byName[name]) { byName[name] = { name, stereotype: '', fields: [], methods: [], ln }; classes.push(byName[name]); }
    return byName[name];
  };
  const known = [...COMMON];

  body.forEach((l, k) => {
    const ln = bodyBase + k, t = l.trim();
    if (!t || t.startsWith('//')) return;
    const opt = /^@(\w+)\s*(.*)$/.exec(t);
    if (opt) {
      if (!commonOpt(opt[1].toLowerCase(), opt[2], opts, ln, diags)) unknownOpt(opt[1], ln, diags, known);
      return;
    }
    const cm = /^class\s+([^<]+?)(?:\s*<<\s*(.+?)\s*>>)?\s*$/i.exec(t);
    if (cm && indentOf(l) === 0) {
      cur = ensure(stripQuotes(cm[1]), ln);
      if (cm[2]) cur.stereotype = cm[2];
      return;
    }
    if (indentOf(l) > 0 && cur) {
      (t.includes('(') ? cur.methods : cur.fields).push(t);
      return;
    }
    for (const [op, type, reversed] of CLASS_OPS) {
      const i = t.indexOf(' ' + op + ' ');
      if (i < 1) continue;
      const a = t.slice(0, i).trim();
      const rest = t.slice(i + op.length + 2);
      const lm = /^(.+?)(?:\s*:\s*(.*))?$/.exec(rest);
      const b = lm[1].trim();
      if (!a || !b) break;
      cur = null;
      ensure(a, ln); ensure(b, ln);
      relations.push({ from: reversed ? b : a, to: reversed ? a : b, type, label: (lm[2] || '').trim(), ln });
      return;
    }
    diags.push(diag(ln, 'error', 'Ligne invalide, attendu "class Nom" (puis membres indentés) ou "A --|> B : libellé"', 'bad-line'));
  });

  return withOpts({ type: 'diagram', kind: 'class', title, classes, relations, line }, opts);
}

/* ====================================================================== */
/* Sequence                                                                */
/* ====================================================================== */

const BLOCKS = { alt: 'else', opt: null, loop: null, par: 'and' };

function parseSequence(title, body, bodyBase, line, diags) {
  const opts = {};
  const participants = [];
  const partSet = new Set();
  const labels = {};
  const messages = [];
  const events = [];
  const bstack = [];
  let autonumber = false;
  const known = ['autonumber', ...COMMON];

  const addPart = (name) => {
    if (!name) return;
    if (!partSet.has(name)) { partSet.add(name); participants.push(name); }
  };

  body.forEach((l, k) => {
    const ln = bodyBase + k, t = l.trim();
    if (!t || t.startsWith('//')) return;

    const opt = /^@(\w+)\s*(.*)$/.exec(t);
    if (opt) {
      const name = opt[1].toLowerCase();
      if (name === 'autonumber') autonumber = !/^(0|false|non|no|off)$/i.test(opt[2].trim());
      else if (!commonOpt(name, opt[2], opts, ln, diags)) unknownOpt(opt[1], ln, diags, known);
      return;
    }

    let m = /^(?:participant|actor)\s+(.+?)(?:\s+as\s+(.+))?$/i.exec(t);
    if (m && !/(-->|->)/.test(t)) {
      const id = stripQuotes(m[1]);
      addPart(id);
      if (m[2]) labels[id] = stripQuotes(m[2]);
      return;
    }
    m = /^(activate|deactivate)\s+(.+)$/i.exec(t);
    if (m && !/(-->|->)/.test(t)) {
      const who = m[2].trim();
      addPart(who);
      events.push({ type: m[1].toLowerCase(), who, ln });
      return;
    }
    m = /^note\s+(over|left\s+of|right\s+of)\s+(.+?)\s*:\s*(.*)$/i.exec(t);
    if (m) {
      const side = m[1].toLowerCase().replace(/\s+/g, ' ');
      const who = splitList(m[2]);
      who.forEach(addPart);
      events.push({ type: 'note', side: side === 'over' ? 'over' : side.startsWith('left') ? 'left' : 'right', who, text: m[3].trim(), ln });
      return;
    }
    m = /^(alt|opt|loop|par)\b\s*(.*)$/i.exec(t);
    if (m && !/(-->|->)/.test(m[2])) {
      const kind = m[1].toLowerCase();
      bstack.push({ kind, ln });
      events.push({ type: 'block', kind, label: m[2].trim(), ln });
      return;
    }
    m = /^(else|and)\b\s*(.*)$/i.exec(t);
    if (m && !/(-->|->)/.test(m[2])) {
      const top = bstack[bstack.length - 1];
      const want = top ? BLOCKS[top.kind] : null;
      if (!top || want !== m[1].toLowerCase()) {
        diags.push(diag(ln, 'error', `"${m[1].toLowerCase()}" en dehors d'un bloc ${m[1].toLowerCase() === 'else' ? 'alt' : 'par'}`, 'stray-else'));
      } else {
        events.push({ type: 'else', kind: m[1].toLowerCase(), label: m[2].trim(), ln });
      }
      return;
    }
    if (/^end$/i.test(t)) {
      if (bstack.length) { bstack.pop(); events.push({ type: 'end', ln }); }
      else diags.push(diag(ln, 'error', '"end" sans bloc ouvert (alt, opt, loop, par)', 'stray-end'));
      return;
    }

    const em = /^\s*(.+?)\s*(-->|->)\s*(.+?)(?:\s*:\s*(.*))?$/.exec(t);
    if (!em) {
      diags.push(diag(ln, 'error', 'Ligne invalide, attendu "A -> B : message", "note over A : texte", "alt ... end", "activate A"', 'bad-line'));
      return;
    }
    const from = em[1].trim(), to = em[3].trim();
    const style = em[2] === '-->' ? 'dashed' : 'solid';
    const label = (em[4] || '').trim();
    addPart(from);
    addPart(to);
    const msg = { from, to, style, label, ln };
    messages.push(msg);
    events.push({ type: 'msg', ...msg });
  });

  bstack.forEach((b) => diags.push(diag(b.ln, 'error', `Bloc "${b.kind}" non fermé ("end" manquant)`, 'unclosed-block')));

  return withOpts({ type: 'diagram', kind: 'sequence', title, participants, labels, messages, events, autonumber, line }, opts);
}

/* ====================================================================== */
/* Mindmap                                                                 */
/* ====================================================================== */

const COLOR_SUFFIX = /\s*\{(#[0-9a-f]{3,8}|[a-z]{3,20})\}\s*$/i;

function parseMindmap(title, body, bodyBase, line, diags) {
  const opts = {};
  let root = null;
  const stack = [];

  body.forEach((l, k) => {
    const ln = bodyBase + k;
    const t = l.trim();
    if (!t || t.startsWith('//')) return;
    const om = /^@(theme|width|align)\s+(.*)$/i.exec(t);
    if (om) { commonOpt(om[1].toLowerCase(), om[2], opts, ln, diags); return; }

    const depth = Math.floor(indentOf(l) / 2);
    let text = t, color;
    const cm = COLOR_SUFFIX.exec(text);
    if (cm) { color = cm[1]; text = text.slice(0, cm.index).trim(); }
    const node = { text, children: [] };
    if (color) node.color = color;

    if (!root) { root = node; stack.push({ depth, node }); return; }
    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) stack.pop();
    if (stack.length > 0) stack[stack.length - 1].node.children.push(node);
    else root.children.push(node);
    stack.push({ depth, node });
  });

  if (!root) root = { text: title || 'Mindmap', children: [] };
  return withOpts({ type: 'diagram', kind: 'mindmap', title, root, line }, opts);
}

/* ====================================================================== */
/* Timeline                                                                */
/* ====================================================================== */

function parseTimeline(title, body, bodyBase, line, diags) {
  const opts = {};
  const items = [];
  const sections = [];
  let section = '', orient = 'horizontal';
  const known = ['orient', ...COMMON];

  body.forEach((l, k) => {
    const ln = bodyBase + k, t = l.trim();
    if (!t || t.startsWith('//')) return;
    const opt = /^@(\w+)\s*(.*)$/.exec(t);
    if (opt) {
      const name = opt[1].toLowerCase();
      if (name === 'orient') {
        if (/^v/i.test(opt[2].trim())) orient = 'vertical';
        else if (/^h/i.test(opt[2].trim())) orient = 'horizontal';
        else diags.push(diag(ln, 'warning', `@orient invalide "${opt[2]}" (horizontal ou vertical)`, 'bad-option'));
      } else if (!commonOpt(name, opt[2], opts, ln, diags)) unknownOpt(opt[1], ln, diags, known);
      return;
    }
    const sm = /^section\s+([^:]+)$/i.exec(t);
    if (sm) { section = stripQuotes(sm[1]); if (!sections.includes(section)) sections.push(section); return; }

    const m = /^(.+?)\s*:\s*(.*)$/.exec(t);
    if (!m) { diags.push(diag(ln, 'error', 'Ligne invalide, attendu "période: événement"', 'bad-line')); return; }
    const period = m[1].trim();
    const events = m[2].split('|').map((x) => x.trim()).filter(Boolean);
    if (!events.length) diags.push(diag(ln, 'warning', `Aucun événement pour la période "${period}"`, 'empty-event'));
    const item = { period, events, ln };
    if (section) item.section = section;
    items.push(item);
  });

  return withOpts({ type: 'diagram', kind: 'timeline', title, items, sections, orient, line }, opts);
}

/* ====================================================================== */
/* Gantt                                                                   */
/* ====================================================================== */

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const dayOf = (s) => {
  const m = ISO.exec(s);
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  if (d.getUTCMonth() !== +m[2] - 1) return null;
  return Math.round(t / 86400000);
};
const isoOf = (day) => new Date(day * 86400000).toISOString().slice(0, 10);
const DURATION = /^(\d+(?:\.\d+)?)\s*(d|j|w|s)$/i;
const STATUS = ['done', 'active', 'crit'];

function parseGantt(title, body, bodyBase, line, diags) {
  const opts = {};
  const tasks = [];
  const sections = [];
  let section = '', today = false;
  const known = ['today', ...COMMON];
  const byName = {};

  body.forEach((l, k) => {
    const ln = bodyBase + k, t = l.trim();
    if (!t || t.startsWith('//')) return;
    const opt = /^@(\w+)\s*(.*)$/.exec(t);
    if (opt) {
      const name = opt[1].toLowerCase();
      if (name === 'today') today = !/^(0|false|non|no|off)$/i.test(opt[2].trim());
      else if (!commonOpt(name, opt[2], opts, ln, diags)) unknownOpt(opt[1], ln, diags, known);
      return;
    }
    const sm = /^section\s+([^:]+)$/i.exec(t);
    if (sm) { section = stripQuotes(sm[1]); if (!sections.includes(section)) sections.push(section); return; }

    const m = /^(.+?)\s*:\s*(.+)$/.exec(t);
    if (!m) { diags.push(diag(ln, 'error', 'Ligne invalide, attendu "Tâche: début, durée" (ex. "Parser: 2026-10-08, 10d")', 'bad-line')); return; }
    const name = m[1].trim();
    const parts = splitList(m[2]);
    let milestone = false, status = '';
    while (parts.length && /^(milestone|done|active|crit)$/i.test(parts[0])) {
      const f = parts.shift().toLowerCase();
      if (f === 'milestone') milestone = true; else status = f;
    }
    const prev = tasks[tasks.length - 1];
    let start = null;
    const first = parts[0];
    if (first !== undefined) {
      const am = /^after\s+(.+)$/i.exec(first);
      if (am) {
        const dep = byName[am[1].trim()];
        if (!dep) {
          diags.push(diag(ln, 'error', `"after" : tâche inconnue "${am[1].trim()}" (elle doit être définie plus haut)`, 'gantt-after', { got: am[1].trim() }));
          return;
        }
        start = dep.endDay;
        parts.shift();
      } else if (dayOf(first) !== null) {
        start = dayOf(first);
        parts.shift();
      } else if (!DURATION.test(first)) {
        diags.push(diag(ln, 'error', `Début invalide "${first}" (date AAAA-MM-JJ ou "after Tâche")`, 'bad-date'));
        return;
      }
    }
    if (start === null) {
      if (!prev) { diags.push(diag(ln, 'error', 'La première tâche doit avoir une date de début', 'gantt-start')); return; }
      start = prev.endDay;
    }

    let end;
    if (milestone) {
      end = start;
    } else if (parts.length === 0) {
      end = start + 1;
    } else {
      const spec = parts[0];
      const dm = DURATION.exec(spec);
      if (dm) {
        const n = parseFloat(dm[1]) * (/^(w|s)$/i.test(dm[2]) ? 7 : 1);
        end = start + Math.max(1, Math.round(n));
      } else if (dayOf(spec) !== null) {
        end = dayOf(spec) + 1;
        if (end <= start) { diags.push(diag(ln, 'error', `La date de fin précède le début pour "${name}"`, 'bad-date')); return; }
      } else {
        diags.push(diag(ln, 'error', `Durée ou fin invalide "${spec}" (ex. "5d", "2w" ou une date)`, 'bad-date'));
        return;
      }
    }
    if (byName[name]) diags.push(diag(ln, 'warning', `Tâche en double "${name}"`, 'dup-task'));
    const task = { name, section, start: isoOf(start), end: isoOf(end), startDay: start, endDay: end, milestone, status, ln };
    byName[name] = task;
    tasks.push(task);
  });

  if (!tasks.length) diags.push(diag(line, 'warning', 'Gantt sans tâche valide', 'empty-chart'));
  return withOpts({ type: 'diagram', kind: 'gantt', title, tasks, sections, today, line }, opts);
}

/* ====================================================================== */
/* Quadrant                                                                */
/* ====================================================================== */

function parseAxis(text) {
  const m = /^(.*?)(?:\s*:\s*(.*?)\s*(?:->|→)\s*(.*))?$/.exec(text.trim());
  return { label: m[1].trim(), low: (m[2] || '').trim(), high: (m[3] || '').trim() };
}

function parseQuadrant(title, body, bodyBase, line, diags) {
  const opts = {};
  const points = [];
  let xAxis = { label: '', low: '', high: '' }, yAxis = { label: '', low: '', high: '' };
  let quadrants = ['', '', '', ''];
  const known = ['x', 'y', 'quadrants', ...COMMON];

  body.forEach((l, k) => {
    const ln = bodyBase + k, t = l.trim();
    if (!t || t.startsWith('//')) return;
    const opt = /^@(\w+)\s*(.*)$/.exec(t);
    if (opt) {
      const name = opt[1].toLowerCase();
      if (name === 'x') xAxis = parseAxis(opt[2]);
      else if (name === 'y') yAxis = parseAxis(opt[2]);
      else if (name === 'quadrants') {
        const q = opt[2].split('|').map((x) => x.trim());
        if (q.length !== 4) diags.push(diag(ln, 'warning', '@quadrants attend 4 noms séparés par "|" (haut-gauche | haut-droite | bas-gauche | bas-droite)', 'bad-option'));
        quadrants = [0, 1, 2, 3].map((i) => q[i] || '');
      } else if (!commonOpt(name, opt[2], opts, ln, diags)) unknownOpt(opt[1], ln, diags, known);
      return;
    }
    const m = /^(.+?)\s*:\s*(-?\d*\.?\d+)\s*[,;]\s*(-?\d*\.?\d+)$/.exec(t);
    if (!m) { diags.push(diag(ln, 'error', 'Ligne invalide, attendu "Nom: x, y" avec x et y entre 0 et 1', 'bad-line')); return; }
    let x = Number(m[2]), y = Number(m[3]);
    if (x < 0 || x > 1 || y < 0 || y > 1) {
      diags.push(diag(ln, 'warning', `"${m[1].trim()}" : x et y doivent être entre 0 et 1`, 'range'));
      x = Math.min(1, Math.max(0, x));
      y = Math.min(1, Math.max(0, y));
    }
    points.push({ name: m[1].trim(), x, y, ln });
  });

  return withOpts({ type: 'diagram', kind: 'quadrant', title, xAxis, yAxis, quadrants, points, line }, opts);
}

/* ====================================================================== */

function parseDiagram(args, body, bodyBase, line, diags) {
  const am = /^(\S*)\s*(.*)$/.exec(args);
  let kind = am[1].toLowerCase();
  const title = stripQuotes(am[2]);
  if (!DIAGRAMS.includes(kind)) {
    const hint = kind ? closest(kind, DIAGRAMS) : null;
    diags.push(diag(line, 'error', kind
      ? `Type de diagramme inconnu "${kind}" (${DIAGRAMS.join(', ')})${hint ? ` — vouliez-vous dire "${hint}" ?` : ''}`
      : `Type de diagramme manquant (${DIAGRAMS.join(', ')})`, 'unknown-kind', { got: kind, choices: DIAGRAMS, hint }));
    kind = 'flow';
  }

  if (!body.filter((l) => l.trim() && !l.trim().startsWith('//')).length) {
    diags.push(diag(line, 'warning', 'Diagramme sans données', 'empty-chart'));
  }

  switch (kind) {
    case 'flow': case 'state': return parseFlow(kind, title, body, bodyBase, line, diags);
    case 'sequence': return parseSequence(title, body, bodyBase, line, diags);
    case 'mindmap': return parseMindmap(title, body, bodyBase, line, diags);
    case 'timeline': return parseTimeline(title, body, bodyBase, line, diags);
    case 'gantt': return parseGantt(title, body, bodyBase, line, diags);
    case 'quadrant': return parseQuadrant(title, body, bodyBase, line, diags);
    case 'er': return parseEr(title, body, bodyBase, line, diags);
    case 'class': return parseClass(title, body, bodyBase, line, diags);
    default: return { type: 'diagram', kind, title, line };
  }
}

module.exports = { parseDiagram, DIAGRAMS, parseNodeExpr, splitChain };
