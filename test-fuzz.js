'use strict';
/**
 * Fuzzing déterministe (graine fixe) : documents aléatoires et mutations du démo.
 * Jamais d'exception ni de blocage ; diagnostics bien formés ; chaque correctif rapide s'applique proprement.
 * Rapide (quelques secondes) : fait partie de `npm test`. Les campagnes longues vivent dans "Stress Test".
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { parse } = require('./src/parser');
const { plainText } = require('./src/ast');
const { fixesFor, applyFix } = require('./src/fixes');
const { completionsFor } = require('./src/completion');

let seed = 20261017;
const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));

const TOKENS = [
  ':::chart bar "T"', ':::chart scatter', ':::chart donut', ':::diagram flow', ':::diagram state', ':::diagram sequence', ':::diagram mindmap', ':::diagram timeline',
  ':::diagram gantt', ':::diagram quadrant', ':::diagram er', ':::diagram class', ':::tabs', '::::tabs', ':::metrics', ':::chat', ':::details "D"', ':::note T', ':::', '::::',
  '=== Onglet', '@stack', '@y2 B', '@dir TD', '@theme warm', '@width 500', '@autonumber', '@today', '@orient vertical', '@toc', '@include x.rdtmd',
  'A -> B', 'A --> B : label', 'A -> B -> C : x', 'S((c)) -> D{e}', 'X[(db)] -> Y{{h}}', '[*] -> A', 'group G', 'end', 'else x', 'alt c', 'loop l', 'note over A,B : t',
  'participant P as Q', 'activate A', 'section S', 'entity E', '  id: int PK', 'A 1--* B : r', 'class C <<s>>', '  +f()', 'Dog --|> Animal',
  'T: 2026-10-01, 5d', 'U: after T, 2w', 'V: done, 2026-13-45, 3d', 'x: a, b, c', 'S1: 1, 2, 3', 'A: (1,2) (3,4)', 'Q: 0.5, 0.5', '2024: a | b', 'Root', '  Child {#e6794e}',
  '# Titre {#id}', '## T', '[^1]', '[^1]: note', 'texte avec[^1] note', '- item', '  - sub', '- [x] tâche', '1. un', '> quote', '| a | b |', '|---|---|', '```js', '```', '$$',
  '$a$', '**gras**', '*it*', '`code`', '[lien](http://x.y "t")', '![img](a.png)', 'http://', 'http://x.y/z', '---', '<script>alert(1)</script>', '\t', '\\', '(((', '[[[', '{{{', '***', '___', '~~~',
];
const NOISE = 'abcxyz012 .,;:!?-_*#$|\\/<>[](){}"\'`~@%&+=^';
const line = () => {
  const r = rnd();
  if (r < 0.7) return pick(TOKENS) + (rnd() < 0.2 ? ' ' + pick(TOKENS) : '');
  if (r < 0.9) { let s = ''; for (let i = int(0, 30); i > 0; i--) s += NOISE[int(0, NOISE.length - 1)]; return s; }
  if (r < 0.95) return pick(TOKENS).repeat(int(2, 30));
  return '';
};
const randomDoc = () => Array.from({ length: int(1, 80) }, line).join(pick(['\n', '\r\n']));
const demo = fs.readFileSync(path.join(__dirname, 'example', 'demo.rdtmd'), 'utf8').split('\n');
const mutate = () => {
  const l = demo.slice();
  for (let k = int(1, 10); k > 0; k--) {
    const i = int(0, l.length - 1), r = rnd();
    if (r < 0.25) l.splice(i, 1);
    else if (r < 0.45) l.splice(i, 0, l[int(0, l.length - 1)]);
    else if (r < 0.65) l[i] = l[i].slice(0, int(0, l[i].length));
    else if (r < 0.85) { const p = int(0, l[i].length); l[i] = l[i].slice(0, p) + pick(TOKENS) + l[i].slice(p); }
    else l[i] = l[i].replace(/[:\-[\]()@|]/, () => NOISE[int(0, NOISE.length - 1)]);
  }
  return l.join('\n');
};

const N = 2500;
let fixes = 0, completions = 0, slowest = 0;
for (let i = 0; i < N; i++) {
  const doc = i % 2 ? mutate() : randomDoc();
  const t0 = Date.now();
  let res;
  assert.doesNotThrow(() => { res = parse(doc); }, 'parse a levé sur le document #' + i + '\n' + JSON.stringify(doc.slice(0, 400)));
  slowest = Math.max(slowest, Date.now() - t0);
  JSON.stringify(res.ast);
  plainText(res.ast);
  const lines = doc.replace(/\r\n?/g, '\n').split('\n');
  res.diagnostics.forEach((d) => {
    assert(d.line >= 0 && Number.isInteger(d.line), 'ligne de diagnostic invalide');
    assert(d.severity === 'error' || d.severity === 'warning');
    assert(typeof d.message === 'string' && d.message);
    fixesFor(d, lines).forEach((fx) => {
      fixes++;
      const out = applyFix(lines, fx);
      assert(Array.isArray(out) && out.every((x) => typeof x === 'string'), 'correctif invalide : ' + fx.title);
    });
  });
  for (let k = 0; k < 3; k++) {
    const l = pick(lines), prefix = l.slice(0, int(0, l.length));
    const r = completionsFor(prefix, rnd() < 0.7 ? { name: pick(['diagram', 'chart', 'note']), kind: pick(['flow', 'gantt', 'bar', '']) } : null);
    completions++;
    assert(r.replace >= 0 && r.replace <= prefix.length, 'replace hors limites pour "' + prefix + '"');
  }
}
assert(slowest < 1500, 'un document a pris ' + slowest + ' ms à parser');
console.log(`TESTS FUZZ : OK (${N} documents, ${fixes} correctifs appliqués, ${completions} complétions, parse le plus lent ${slowest} ms)`);
