'use strict';
const { diag, splitList, toNum, stripQuotes, closest, commonOpt, withOpts } = require('./util');

const CHARTS = ['bar', 'line', 'pie', 'area', 'scatter', 'donut'];
const FLAGS = { stack: 'stack', horizontal: 'horizontal' };

const truthy = (v) => !/^(0|false|non|no|off)$/i.test(String(v || '').trim());

const POINT = /\(\s*(-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)\s*\)/gi;

function parsePoints(text, ln, diags) {
  const pts = [];
  let m;
  POINT.lastIndex = 0;
  while ((m = POINT.exec(text))) pts.push({ x: Number(m[1]), y: Number(m[2]) });
  const rest = text.replace(POINT, '').replace(/[\s,;]/g, '');
  if (rest) diags.push(diag(ln, 'error', 'Points invalides, attendu "(x, y) (x, y) ..."', 'bad-points'));
  if (!pts.length && !rest) diags.push(diag(ln, 'warning', 'Série sans point', 'empty-series'));
  return pts;
}

function parseChart(args, body, bodyBase, line, diags) {
  const am = /^(\S*)\s*(.*)$/.exec(args);
  let kind = am[1].toLowerCase();
  const title = stripQuotes(am[2]);
  if (!CHARTS.includes(kind)) {
    const hint = kind ? closest(kind, CHARTS) : null;
    diags.push(diag(line, 'error', kind
      ? `Type de graphique inconnu "${kind}" (${CHARTS.join(', ')})${hint ? ` — vouliez-vous dire "${hint}" ?` : ''}`
      : `Type de graphique manquant (${CHARTS.join(', ')})`, 'unknown-kind', { got: kind, choices: CHARTS, hint }));
    kind = 'bar';
  }

  let unit = '', unit2 = '', center = '', xlabel = '', ylabel = '';
  let stack = false, horizontal = false, y2 = [], categories = null;
  const opts = {};
  const raw = [];

  body.forEach((l, k) => {
    const ln = bodyBase + k, t = l.trim();
    if (!t || t.startsWith('//')) return;
    let m = /^@(\w+)\s*(.*)$/.exec(t);
    if (m) {
      const name = m[1].toLowerCase(), val = m[2];
      if (commonOpt(name, val, opts, ln, diags)) return;
      if (name === 'unit') unit = val;
      else if (name === 'unit2') unit2 = val;
      else if (name === 'center') center = val;
      else if (name === 'xlabel') xlabel = val;
      else if (name === 'ylabel') ylabel = val;
      else if (name === 'y2') y2 = splitList(val);
      else if (name === 'orient') horizontal = /^h/i.test(val);
      else if (FLAGS[name]) {
        const on = truthy(val);
        if (name === 'stack') stack = on; else horizontal = on;
      } else {
        const hint = closest(name, ['unit', 'unit2', 'stack', 'horizontal', 'y2', 'center', 'xlabel', 'ylabel', 'theme', 'width', 'align']);
        diags.push(diag(ln, 'warning', `Option inconnue "@${m[1]}"${hint ? ` — vouliez-vous dire "@${hint}" ?` : ''}`, 'unknown-option', { got: m[1], hint }));
      }
      return;
    }
    m = /^(.+?)\s*:\s*(.*)$/.exec(t);
    if (!m) { diags.push(diag(ln, 'error', 'Ligne invalide, attendu "nom: valeurs"', 'bad-line')); return; }
    if (kind !== 'scatter' && m[1].toLowerCase() === 'x') { categories = splitList(m[2]); return; }
    raw.push({ name: m[1], text: m[2], parts: splitList(m[2]), ln });
  });

  if (!raw.length) diags.push(diag(line, 'warning', 'Graphique sans données', 'empty-chart'));

  let series;
  if (kind === 'scatter') {
    categories = [];
    series = raw.map((r) => ({ name: r.name, values: [], points: parsePoints(r.text, r.ln, diags) }));
  } else if (categories) {
    series = raw.map((r) => {
      if (r.parts.length !== categories.length) {
        diags.push(diag(r.ln, 'error', `"${r.name}" : ${r.parts.length} valeur(s) pour ${categories.length} catégorie(s)`,
          'chart-length', { name: r.name, got: r.parts.length, expected: categories.length }));
      }
      return { name: r.name, values: categories.map((_, idx) => toNum(r.parts[idx], r.ln, diags)) };
    });
  } else {
    categories = raw.map((r) => r.name);
    raw.forEach((r) => {
      if (r.parts.length !== 1) {
        diags.push(diag(r.ln, 'error', `Une seule valeur attendue pour "${r.name}" (ou ajoute une ligne "x: ...")`, 'chart-single', { name: r.name, got: r.parts.length }));
      }
    });
    series = [{ name: 'valeur', values: raw.map((r) => toNum(r.parts[0], r.ln, diags)) }];
  }

  if (y2.length) {
    if (kind === 'pie' || kind === 'donut' || kind === 'scatter' || horizontal) {
      diags.push(diag(line, 'warning', '@y2 ne s\'applique qu\'aux graphiques bar, line et area verticaux', 'bad-option'));
    } else {
      y2.forEach((n) => {
        if (!series.some((s) => s.name === n)) diags.push(diag(line, 'warning', `@y2 : série inconnue "${n}"`, 'bad-option'));
      });
      series.forEach((s) => { s.axis = y2.includes(s.name) ? 'y2' : 'y'; });
    }
  }
  if (stack && !(kind === 'bar' || kind === 'area')) {
    diags.push(diag(line, 'warning', '@stack ne s\'applique qu\'aux graphiques bar et area', 'bad-option'));
    stack = false;
  }
  if (horizontal && kind !== 'bar') {
    diags.push(diag(line, 'warning', '@horizontal ne s\'applique qu\'aux graphiques bar', 'bad-option'));
    horizontal = false;
  }

  const node = { type: 'chart', kind, title, unit, unit2, categories, series, stack, horizontal, center, xlabel, ylabel, line };
  return withOpts(node, opts);
}

module.exports = { parseChart, CHARTS };
