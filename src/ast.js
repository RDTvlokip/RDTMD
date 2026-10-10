'use strict';

function walk(node, fn) {
  if (Array.isArray(node)) { node.forEach((n) => walk(n, fn)); return; }
  if (!node || typeof node !== 'object') return;
  fn(node);
  for (const k of ['children', 'inline', 'items', 'header', 'rows', 'root', 'tabs', 'messages']) {
    if (node[k]) walk(node[k], fn);
  }
}

function plainText(nodes) {
  let s = '';
  walk(nodes, (n) => {
    if (n.type === 'text' || n.type === 'code' || n.type === 'math') s += n.value;
    else if (n.type === 'image') s += n.alt;
    else if (n.type === 'softbreak') s += ' ';
    else if (n.type === 'metrics') {
      if (n.title) s += ' ' + n.title + '\n';
      for (const it of n.items || []) {
        s += it.label + ': ' + it.value + (it.diff ? ' (' + it.diff + ')' : '') + '\n';
      }
    }
    else if (n.type === 'details') {
      if (n.title) s += ' ' + n.title + '\n';
    }
    else if (n.title && typeof n.title === 'string' && !n.type) {
      s += ' ' + n.title + ' ';
    }
  });
  return s;
}

module.exports = { walk, plainText };
