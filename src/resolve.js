'use strict';
const fs = require('fs');
const path = require('path');
const { parse } = require('./parser');
const { walk } = require('./ast');

const REMOTE = /^(https?:|data:)/i;
const MAX_DEPTH = 8;

function localizeImages(ast, dir) {
  walk(ast, (n) => {
    if (n.type === 'image' && n.src && !REMOTE.test(n.src)) n.src = path.resolve(dir, n.src);
  });
}

function expandBlocks(children, dir, seen, depth, diags, inline) {
  const out = [];
  for (const n of children) {
    if (n.type !== 'include') {
      if (n.children) n.children = expandBlocks(n.children, dir, seen, depth, diags, inline);
      if (n.items) n.items.forEach((it) => { if (it && it.children) it.children = expandBlocks(it.children, dir, seen, depth, diags, inline); });
      if (n.tabs) n.tabs.forEach((tab) => { if (tab && tab.children) tab.children = expandBlocks(tab.children, dir, seen, depth, diags, inline); });
      out.push(n);
      continue;
    }
    const fail = (message) => {
      diags.push({ line: n.line, severity: 'error', message });
      out.push({ type: 'error', message, line: n.line });
    };
    const file = path.resolve(dir, n.path);
    if (depth >= MAX_DEPTH) { fail('Profondeur maximale d\'include atteinte'); continue; }
    if (seen.has(file)) { fail(`Include circulaire : ${n.path}`); continue; }
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch (e) { fail(`Fichier introuvable : ${n.path}`); continue; }
    const sub = parse(text);
    sub.diagnostics.forEach((d) => diags.push({ line: n.line, severity: d.severity, message: `[${n.path}:${d.line + 1}] ${d.message}` }));
    const res = expand(sub.ast, path.dirname(file), new Set([...seen, file]), depth + 1, inline);
    res.diagnostics.forEach((d) => diags.push({ line: n.line, severity: d.severity, message: d.message }));
    out.push(inline
      ? { type: 'included', path: n.path, file, children: res.ast.children, line: n.line }
      : { type: 'includelink', path: n.path, file, line: n.line });
  }
  return out;
}

function expand(ast, dir, seen = new Set(), depth = 0, inline = true) {
  const diagnostics = [];
  localizeImages(ast, dir);
  ast.children = expandBlocks(ast.children, dir, seen, depth, diagnostics, inline);
  return { ast, diagnostics };
}

module.exports = { expand };
