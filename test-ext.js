'use strict';
/** Tests des modules de l'extension indépendants de VS Code : export HTML, autocomplétion, correctifs rapides, assets. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { parse } = require('./src/parser');
const { buildHtml, findBrowser, safeJson } = require('./src/export');
const { completionsFor } = require('./src/completion');
const { fixesFor, applyFix } = require('./src/fixes');
const { SCRIPTS, STYLES } = require('./src/assets');

const mediaDir = path.join(__dirname, 'media');

/* ---------- assets : tous les fichiers listés existent ---------- */
SCRIPTS.concat(STYLES).forEach((f) => assert(fs.existsSync(path.join(mediaDir, f)), 'asset manquant : ' + f));
SCRIPTS.forEach((f) => {
  // chaque script doit au moins être de la syntaxe valide
  new Function(fs.readFileSync(path.join(mediaDir, f), 'utf8'));
});

/* ---------- export HTML ---------- */
{
  const src = '# Titre\n\nTexte <script>alert(1)</script> & "guillemets"\n\n:::diagram flow\nA -> B\n:::\n\n![x](nope.png)\n';
  const { ast } = parse(src);
  const html = buildHtml({ ast, title: 'Mon <titre>', theme: 'auto', mediaDir });
  assert(html.startsWith('<!doctype html>'));
  assert(html.includes('<title>Mon &lt;titre&gt;</title>'));
  // le texte hostile ne doit jamais apparaître brut dans le HTML
  assert(!html.includes('<script>alert(1)</script>'), 'script non échappé');
  assert(html.includes('\\u003cscript\\u003ealert(1)\\u003c/script\\u003e'));
  // une seule balise application/json et un nombre de </script> cohérent avec les balises ouvrantes
  const opens = (html.match(/<script/g) || []).length, closes = (html.match(/<\/script>/g) || []).length;
  assert.strictEqual(opens, closes, 'balises <script> déséquilibrées');
  assert(html.includes('id="rdt-data"'));
  assert(!/https?:\/\/(?!www\.w3\.org)[^"'\s)]*\.(js|css)/.test(html), 'ressource distante dans l\'export');
  const m = /<script type="application\/json" id="rdt-data">([\s\S]*?)<\/script>/.exec(html);
  const data = JSON.parse(m[1]);
  assert.strictEqual(data.type, 'ast');
  assert.strictEqual(data.theme, 'auto');
  assert.strictEqual(data.syncScroll, false);
  assert.strictEqual(data.ast.children[0].type, 'heading');
  const printed = buildHtml({ ast, mediaDir, print: true });
  assert(printed.includes('window.print()'));
}
{
  // images locales intégrées en data: URI
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'rdtmd-'));
  const png = path.join(dir, 'p.png');
  fs.writeFileSync(png, Buffer.from('89504e470d0a1a0a', 'hex'));
  const { ast } = parse('![alt](p.png)\n');
  ast.children[0].inline[0].src = png;
  const html = buildHtml({ ast, mediaDir });
  assert(html.includes('data:image/png;base64,iVBORw0KGgo='), 'image non intégrée');
  assert(!html.includes(png.replace(/\\/g, '\\\\')), 'chemin local resté dans l\'export');
}
assert.strictEqual(safeJson({ a: '</script>\u2028' }), '{"a":"\\u003c/script\\u003e\\u2028"}');
assert.strictEqual(findBrowser('Z:\\nope\\x.exe', { PATH: '' }, 'linux'), null);

/* ---------- autocomplétion ---------- */
{
  const labels = (r) => r.items.map((i) => i.label);
  let r = completionsFor(':::ch', null);
  assert(labels(r).includes('chart') && labels(r).includes('diagram'));
  assert.strictEqual(r.replace, 2);
  r = completionsFor(':::diagram ', null);
  assert.deepStrictEqual(labels(r).sort(), ['class', 'er', 'flow', 'gantt', 'mindmap', 'quadrant', 'sequence', 'state', 'timeline']);
  r = completionsFor(':::chart sc', null);
  assert(labels(r).includes('scatter'));
  r = completionsFor('@', { name: 'chart', kind: 'bar' });
  assert(labels(r).includes('@stack') && labels(r).includes('@theme') && labels(r).includes('@y2'));
  r = completionsFor('@', { name: 'diagram', kind: 'gantt' });
  assert(labels(r).includes('@today') && !labels(r).includes('@stack'));
  r = completionsFor('  al', { name: 'diagram', kind: 'sequence' });
  assert(labels(r).includes('alt') && labels(r).includes('note over'));
  r = completionsFor('gr', { name: 'diagram', kind: 'flow' });
  assert(labels(r).includes('group'));
  r = completionsFor('@', null);
  assert.deepStrictEqual(labels(r), ['@include', '@toc']);
  r = completionsFor('Tâche: ', { name: 'diagram', kind: 'gantt' });
  assert(labels(r).includes('milestone'));
  r = completionsFor('texte normal', { name: 'note', kind: '' });
  assert.deepStrictEqual(r.items, []);
}

/* ---------- correctifs rapides ---------- */
{
  const fixed = (src, pick) => {
    const lines = src.split('\n');
    const { diagnostics } = parse(src);
    const d = diagnostics.find(pick);
    assert(d, 'diagnostic introuvable');
    const fx = fixesFor(d, lines);
    assert(fx.length, 'aucun correctif pour ' + d.code);
    return applyFix(lines, fx[0]).join('\n');
  };
  assert.strictEqual(fixed(':::chart pii\nA: 1\n:::\n', (d) => d.code === 'unknown-kind'), ':::chart pie\nA: 1\n:::\n');
  assert.strictEqual(fixed(':::diagram gant\nA: 2026-10-01, 2d\n:::\n', (d) => d.code === 'unknown-kind'), ':::diagram gantt\nA: 2026-10-01, 2d\n:::\n');
  assert.strictEqual(fixed(':::chrt\nx\n:::\n', (d) => d.code === 'unknown-directive'), ':::chart\nx\n:::\n');
  assert.strictEqual(fixed(':::chart bar\n@unt ms\nA: 1\n:::\n', (d) => d.code === 'unknown-option'), ':::chart bar\n@unit ms\nA: 1\n:::\n');
  assert.strictEqual(fixed(':::chart bar\nx: a, b, c\nA: 1, 2\n:::\n', (d) => d.code === 'chart-length'), ':::chart bar\nx: a, b, c\nA: 1, 2, 0\n:::\n');
  assert.strictEqual(fixed(':::chart bar\nx: a, b\nA: 1, 2, 3, 4\n:::\n', (d) => d.code === 'chart-length'), ':::chart bar\nx: a, b\nA: 1, 2\n:::\n');
  assert.strictEqual(fixed(':::note Titre\ntexte\n', (d) => d.code === 'unclosed'), ':::note Titre\ntexte\n:::\n'.replace(/\n$/, '\n'), 'fermeture ajoutée');
  assert.strictEqual(fixed(':::diagram flow\ngroup X\nA -> B\n:::\n', (d) => d.code === 'unclosed-group'), ':::diagram flow\ngroup X\nA -> B\nend\n:::\n');
  assert.strictEqual(fixed(':::diagram sequence\nA -> B\nend\n:::\n', (d) => d.code === 'stray-end'), ':::diagram sequence\nA -> B\n:::\n');
  assert.strictEqual(fixed('Texte[^n].\n', (d) => d.code === 'footnote-missing'), 'Texte[^n].\n\n[^n]: \n');
  // la définition suit le paragraphe qui cite la note, pas la fin du document
  assert.strictEqual(fixed('Un[^a] texte\nsuite\n\n## Titre\n', (d) => d.code === 'footnote-missing'), 'Un[^a] texte\nsuite\n\n[^a]: \n\n## Titre\n');
  // fermeture d'un bloc non fermé : avant le bloc suivant
  assert.strictEqual(fixed(':::note A\nx\n:::note B\ny\n:::\n', (d) => d.code === 'unclosed' && d.line === 0), ':::note A\nx\n:::\n:::note B\ny\n:::\n');
}

console.log('TESTS EXTENSION : OK');
