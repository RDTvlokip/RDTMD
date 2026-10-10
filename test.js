'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { parse } = require('./src/parser');
const { expand } = require('./src/resolve');

// 1. Démo complète
const demo = path.join(__dirname, 'example', 'demo.rdtmd');
const { ast, diagnostics } = parse(fs.readFileSync(demo, 'utf8'));
assert.deepStrictEqual(diagnostics, []);
const types = ast.children.map((n) => n.type);
for (const t of ['heading', 'paragraph', 'list', 'quote', 'table', 'math', 'chart', 'diagram', 'callout', 'code', 'include', 'tabs', 'metrics', 'chat', 'details']) {
  assert(types.includes(t), 'manque le type de bloc : ' + t);
}

// 2. Graphiques
const charts = ast.children.filter((n) => n.type === 'chart');
assert.strictEqual(charts.length, 3);
assert.strictEqual(charts[0].unit, '€');
assert.strictEqual(charts[0].categories.length, 12);
assert.deepStrictEqual(charts[0].series[1].values.slice(0, 4), [15, 21, 14, 30]);
assert.strictEqual(charts[1].unit, 'tokens/s');
assert.deepStrictEqual(charts[2].categories, ['Python', 'Rust', 'JS']);

// 3. Diagrammes
const diagrams = ast.children.filter((n) => n.type === 'diagram');
assert.strictEqual(diagrams.length, 4);

// Flow
const flow = diagrams.find((d) => d.kind === 'flow');
assert(flow);
assert.strictEqual(flow.title, 'Architecture IA');
assert.strictEqual(flow.dir, 'LR');
assert.deepStrictEqual(flow.nodes, ['Input', 'Tokenizer', 'Embedding', 'Transformer', 'LMHead', 'Output']);
assert.strictEqual(flow.edges.length, 5);
assert.strictEqual(flow.edges[0].from, 'Input');
assert.strictEqual(flow.edges[0].to, 'Tokenizer');

// Sequence
const seq = diagrams.find((d) => d.kind === 'sequence');
assert(seq);
assert.strictEqual(seq.title, 'Requête API');
assert.deepStrictEqual(seq.participants, ['Client', 'Serveur', 'DB']);
assert.strictEqual(seq.messages.length, 4);
assert.strictEqual(seq.messages[0].label, 'GET /data');
assert.strictEqual(seq.messages[2].style, 'dashed');

// Mindmap
const mm = diagrams.find((d) => d.kind === 'mindmap');
assert(mm);
assert.strictEqual(mm.title, 'RDTMD');
assert.strictEqual(mm.root.text, 'RDTMD');
assert.strictEqual(mm.root.children.length, 3);
assert.strictEqual(mm.root.children[0].text, 'Syntaxe');
assert.strictEqual(mm.root.children[0].children.length, 2);

// Timeline
const tl = diagrams.find((d) => d.kind === 'timeline');
assert(tl);
assert.strictEqual(tl.title, 'Mes projets');
assert.strictEqual(tl.items.length, 3);
assert.strictEqual(tl.items[0].period, '2024');
assert.deepStrictEqual(tl.items[0].events, ['AG-BPE publié', 'Premier crawler']);

// 3.5 Nouvelles extensions natives (tabs, metrics, chat, details)
// Tabs
const tbNode = ast.children.find((n) => n.type === 'tabs');
assert(tbNode, 'Bloc tabs manquant');
assert.strictEqual(tbNode.tabs.length, 3);
assert.strictEqual(tbNode.tabs[0].title, 'Python');
assert.strictEqual(tbNode.tabs[1].title, 'JavaScript');
assert.strictEqual(tbNode.tabs[2].title, 'Rust');
assert.strictEqual(tbNode.tabs[0].children[0].type, 'code');
assert.strictEqual(tbNode.tabs[0].children[0].lang, 'python');

// Metrics (Règle 3 : données sans ambiguïté)
const metNode = ast.children.find((n) => n.type === 'metrics');
assert(metNode, 'Bloc metrics manquant');
assert.strictEqual(metNode.title, 'Indicateurs du modèle');
assert.strictEqual(metNode.items.length, 4);
assert.strictEqual(metNode.items[0].label, 'Perte validation');
assert.strictEqual(metNode.items[0].value, '0.24');
assert.strictEqual(metNode.items[0].diff, '-12%');
assert.strictEqual(metNode.items[0].diffType, 'pos', '-12% avec "good" doit être positif/vert');
assert.strictEqual(metNode.items[1].label, 'Latence');
assert.strictEqual(metNode.items[1].value, '42 ms');
assert.strictEqual(metNode.items[1].diff, '+5 ms');
assert.strictEqual(metNode.items[1].diffType, 'neg', '+5 ms avec "bad" doit être négatif/rouge');
assert.strictEqual(metNode.items[2].label, 'Précision');
assert.strictEqual(metNode.items[2].diffType, 'pos', '+1.4% par défaut est pos');
assert.strictEqual(metNode.items[3].label, 'Paramètres');
assert.strictEqual(metNode.items[3].diffType, 'neutral', 'neutral doit être neutre');

// Chat
const chatNode = ast.children.find((n) => n.type === 'chat');
assert(chatNode, 'Bloc chat manquant');
assert.strictEqual(chatNode.title, 'Discussion ML');
assert.strictEqual(chatNode.messages.length, 3);
assert.strictEqual(chatNode.messages[0].role, 'user');
assert.strictEqual(chatNode.messages[1].role, 'assistant');
assert.strictEqual(chatNode.messages[2].role, 'system');

// Details
const detNode = ast.children.find((n) => n.type === 'details');
assert(detNode, 'Bloc details manquant');
assert.strictEqual(detNode.title, 'Détails de configuration');
assert.strictEqual(detNode.open, true);
assert(detNode.children.length > 0);

// Tests de règles fondamentales :
// Règle 1 : Syntaxe prévisible et imbrication sécurisée
const nestedDirectives = parse(`
::::tabs
=== Onglet 1
:::note
Note interne
:::
=== Onglet 2
\`\`\`bash
=== pas un onglet
::: pas une fermeture
\`\`\`
::::
`);
assert.deepStrictEqual(nestedDirectives.diagnostics, []);
const nTabs = nestedDirectives.ast.children[0];
assert.strictEqual(nTabs.type, 'tabs');
assert.strictEqual(nTabs.tabs.length, 2);
assert.strictEqual(nTabs.tabs[0].children[0].type, 'callout');
assert.strictEqual(nTabs.tabs[1].children[0].type, 'code');
assert(nTabs.tabs[1].children[0].text.includes('=== pas un onglet'));

// Règle 2 : Contenu de secours lisible en texte brut (plainText)
const { plainText } = require('./src/ast');
const fallbackText = plainText(ast);
assert(fallbackText.includes('Perte validation'), 'Le texte brut doit contenir les libellés de métriques');
assert(fallbackText.includes('Python'), 'Le texte brut doit contenir les noms d\'onglets');

// Règle 3 : Polarité explicite sous forme de préfixes et suffixes
const pMetrics = parse(`
:::metrics "Test Polarités"
Latence: 10 ms (bad: +2.5 ms)
Perte: 0.15 (good: -0.05)
Mémoire: 16 GB (+0 GB, neutral)
Taux: 99% (+1.2%, pos)
Bruit: 12% (+3%, regression)
:::
`).ast.children[0];
assert.strictEqual(pMetrics.items[0].diffType, 'neg');
assert.strictEqual(pMetrics.items[0].diff, '+2.5 ms');
assert.strictEqual(pMetrics.items[1].diffType, 'pos');
assert.strictEqual(pMetrics.items[1].diff, '-0.05');
assert.strictEqual(pMetrics.items[2].diffType, 'neutral');
assert.strictEqual(pMetrics.items[3].diffType, 'pos');
assert.strictEqual(pMetrics.items[4].diffType, 'neg');

// 4. Tableaux & Listes
const tbl = ast.children.find((n) => n.type === 'table');
assert.deepStrictEqual(tbl.align, ['left', 'center', 'right']);
const lst = ast.children.find((n) => n.type === 'list');
assert.strictEqual(lst.items[1].children.some((c) => c.type === 'list'), true);
assert.strictEqual(lst.items[2].checked, true);

// 5. Résolution d'include
const res = expand(ast, path.dirname(demo));
assert.deepStrictEqual(res.diagnostics, []);
const inc = res.ast.children.find((n) => n.type === 'included');
assert(inc && path.isAbsolute(inc.file));

// 6. Diagnostics d'erreurs (tolérant, pas de crash)
const bad = parse(':::chart bar\nx: a, b\nS: 1\n:::\n\n:::diagram inconnu\nA -> B\n:::\n\n:::diagram flow\n@dir INVALID\nLigneInvalide\n:::\n\n:::diagram timeline\nSansDeuxPoints\n:::\n\n:::note\nouvert\n\n```js\nx');
assert(bad.diagnostics.length >= 5, JSON.stringify(bad.diagnostics));

// Test de cycle dans flow (doit parser sans crasher)
const flowCycle = parse(':::diagram flow "Cycle"\nA -> B\nB -> C\nC -> A\n:::').ast.children[0];
assert.strictEqual(flowCycle.nodes.length, 3);
assert.strictEqual(flowCycle.edges.length, 3);

// 7. Inline et Mathématiques
const p = parse('a **b *c* d** e_f_g `x` $1 + 1$ et $5 et $6').ast.children[0].inline;
assert.strictEqual(p[1].type, 'strong');
assert(p.some((n) => n.type === 'math' && n.value === '1 + 1'));
assert(!p.some((n) => n.type === 'em' && n.children[0].value === 'f'));

const { parseMath } = require('./media/math.js');
const f = parseMath('\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}');
assert.strictEqual(f[0].t, 'ss');
assert.strictEqual(f[0].base.t, 'big');
assert(f.some((n) => n.t === 'frac'));
for (const s of ['\\frac{a', 'a}', '^2', '', '\\left( x', '\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}', '\\unknown', '\\sqrt[3]{x}', '\\begin{cases} a & b']) parseMath(s);
const mx = parseMath('\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}')[0];
assert.strictEqual(mx.rows.length, 2);
assert.strictEqual(mx.rows[0].length, 2);

// Test \mid, \tos, \top, \bot, \softmax
const mMid = parseMath('P(A \\mid B)');
assert(mMid.some((n) => n.t === 'op' && n.v === '∣'));

const mTos = parseMath('A \\tos B');
assert(mTos.some((n) => n.t === 'op' && n.v === '→'));

const mTop = parseMath('W^{\\top} x + b');
assert.strictEqual(mTop[0].t, 'ss');

const mSoftmax = parseMath('\\softmax(z)');
assert(mSoftmax.some((n) => n.t === 'fn' && n.v === 'softmax'));

// Test options de bloc de code (title, lines, hl)
const codeNode = ast.children.find((n) => n.type === 'code' && n.lang === 'python');
assert(codeNode);
assert.strictEqual(codeNode.title, 'train.py');
assert.strictEqual(codeNode.lines, true);
assert.deepStrictEqual(codeNode.highlights, [3, 4]);

// 8. Coloration syntaxique RDTHighlight
const { tokenize } = require('./media/highlight.js');

// Test de base Python
const tk = tokenize('def f(x):\n    return "a" + 42  # fin', 'python');
const has = (c, s) => tk.some((x) => x[0] === c && x[1] === s);
assert(has('kw', 'def') && has('fd', 'f') && has('st', '"a"') && has('nu', '42') && has('cm', '# fin'));

// Test JSON
assert(tokenize('{"a": [1, true]}', 'json').some((x) => x[0] === 'pr' && x[1] === '"a"'));

// Langage inconnu reste null
assert.strictEqual(tokenize('x', 'inconnu')[0][0], null);

// Nouvelles catégories de jetons
// Définition de fonction vs appel vs constante vs propriété
const jsCode = 'class MaClasse {\n  foo(x) {\n    const VAL = 10u32;\n    return this.bar(x) + "str\\n\\t${val}";\n  }\n}';
const tkJs = tokenize(jsCode, 'javascript');
assert(tkJs.some((x) => x[0] === 'ty' && x[1] === 'MaClasse'));
assert(tkJs.some((x) => x[0] === 'co' && x[1] === 'VAL'));
assert(tkJs.some((x) => x[0] === 'es' && x[1].includes('\\n')));
assert(tkJs.some((x) => x[0] === 'it' && x[1] === '${val}'));

// Rust (lifetime, attribute, num suffix)
const rsCode = "#[derive(Debug)]\nfn test<'a>(x: &'a str) -> u32 {\n    let val = 42u32;\n    val\n}";
const tkRs = tokenize(rsCode, 'rust');
assert(tkRs.some((x) => x[0] === 'de' && x[1].startsWith('#[')));
assert(tkRs.some((x) => x[0] === 'fd' && x[1] === 'test'));
assert(tkRs.some((x) => x[0] === 'lt' && x[1] === "'a"));
assert(tkRs.some((x) => x[0] === 'nu' && x[1] === '42u32'));

// Shell (variable, flag)
const shCode = 'echo $URL; curl -s -L --force "$URL/api" -o out.json';
const tkSh = tokenize(shCode, 'bash');
assert(tkSh.some((x) => x[0] === 'fl' && (x[1] === '-s' || x[1] === '--force')));
assert(tkSh.some((x) => x[0] === 'va' && x[1] === '$URL'));

// Diff
const diffCode = '--- a.txt\n+++ b.txt\n@@ -1,3 +1,3 @@\n-ancien\n+nouveau';
const tkDiff = tokenize(diffCode, 'diff');
assert(tkDiff.some((x) => x[0] === 'df-hdr' && x[1] === '--- a.txt'));
assert(tkDiff.some((x) => x[0] === 'df-hunk' && x[1].startsWith('@@')));
assert(tkDiff.some((x) => x[0] === 'df-del' && x[1] === '-ancien'));
assert(tkDiff.some((x) => x[0] === 'df-add' && x[1] === '+nouveau'));

// Test du rendu DOM des diffs (coins extérieurs uniquement)
global.document = {
  createTextNode: (t) => ({ nodeType: 3, textContent: t }),
  createElement: () => ({ nodeType: 1, className: '', textContent: '' })
};
const { render: renderHl } = require('./media/highlight');
const renderedDiff = renderHl('@@ -1,4 +1,5 @@\n-const version = "0.5.1";\n+const version = "0.6.0";\n+// Ajout des diagrammes natifs', 'diff');
const changeSpans = renderedDiff.filter((n) => n.nodeType === 1 && (n.className.includes('tk-df-add') || n.className.includes('tk-df-del')));
assert.strictEqual(changeSpans.length, 3);
assert(changeSpans[0].className.includes('tk-df-top') && !changeSpans[0].className.includes('tk-df-bot'), 'Le haut du bloc diff doit être arrondi');
assert(!changeSpans[1].className.includes('tk-df-top') && !changeSpans[1].className.includes('tk-df-bot'), 'La jonction intérieure ne doit pas être arrondie');
assert(!changeSpans[2].className.includes('tk-df-top') && changeSpans[2].className.includes('tk-df-bot'), 'Le bas du bloc diff doit être arrondi');

// Test de chaque langage ajouté
const newLangs = [
  ['php', '<?php function test($x) { echo "val: $x"; } ?>'],
  ['ruby', 'def saluer(nom)\n  puts "Bonjour #{nom}"\nend'],
  ['kotlin', 'fun main() {\n    val nom = "Kotlin"\n    println("Hello $nom")\n}'],
  ['swift', 'func bonjour(nom: String) -> String {\n    return "Salut \\(nom)"\n}'],
  ['lua', 'local function addition(a, b)\n  return a + b\nend'],
  ['powershell', 'function Test-Cmdlet {\n    param($Path)\n    Get-ChildItem -Path $Path\n}'],
  ['batch', 'echo off\nset VAR=42\nif exist file.txt goto fin'],
  ['dockerfile', 'FROM node:18-alpine\nWORKDIR /app\nCOPY . .\nRUN npm install\nCMD ["node", "server.js"]'],
  ['makefile', 'all: build\nbuild:\n\tgcc -o app main.c'],
  ['markdown', '# Titre\n**Gras** et *italique*'],
  ['diff', '@@ -1 +1 @@\n-a\n+b'],
  ['latex', '\\documentclass{article}\n\\begin{document}\n$E=mc^2$\n\\end{document}'],
  ['r', 'calculer <- function(x) {\n  res <- summary(x)\n  return(res)\n}'],
  ['perl', 'my $var = "hello";\nsub faire_quelque_chose {\n    print $var;\n}'],
  ['toml', '[package]\nname = "rdtmd"\nversion = "0.6.0"'],
  ['ini', '[database]\nhost = 127.0.0.1\nport = 5432'],
  ['regex', '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'],
  ['nginx', 'server {\n    listen 80;\n    server_name example.com;\n    location / {\n        proxy_pass http://localhost:3000;\n    }\n}'],
  ['graphql', 'query GetUser($id: ID!) {\n  user(id: $id) {\n    name\n    email\n  }\n}']
];

for (const [lang, code] of newLangs) {
  const tokens = tokenize(code, lang);
  assert(tokens.length > 0, `Échec tokenisation de ${lang}`);
  // Test "aucun caractère perdu"
  const rebuilt = tokens.map((t) => t[1]).join('');
  assert.strictEqual(rebuilt, code, `Caractères perdus pour le langage ${lang}`);
}

// Test d'alias
assert(tokenize('const a = 1;', 'js').some((x) => x[0] === 'kw' && x[1] === 'const'));
assert(tokenize('let x: number = 42;', 'ts').some((x) => x[0] === 'kw' && x[1] === 'let'));
assert(tokenize('fn main() {}', 'rs').some((x) => x[0] === 'kw' && x[1] === 'fn'));
assert(tokenize('echo $HOME', 'sh').some((x) => x[0] === 'bi' && x[1] === 'echo'));
assert(tokenize('def f(): pass', 'py').some((x) => x[0] === 'kw' && x[1] === 'def'));
assert(tokenize('Write-Host "test"', 'ps1').some((x) => x[0] === 'bi' && x[1] === 'Write-Host'));
assert(tokenize('def foo; end', 'rb').some((x) => x[0] === 'kw' && x[1] === 'def'));
assert(tokenize('fun bar() {}', 'kt').some((x) => x[0] === 'kw' && x[1] === 'fun'));

// Vérification include link
const lnk = expand(parse(fs.readFileSync(demo, 'utf8')).ast, path.dirname(demo), new Set(), 0, false);
assert(lnk.ast.children.some((n) => n.type === 'includelink' && path.isAbsolute(n.file)));
assert(!lnk.ast.children.some((n) => n.type === 'included'));

console.log('TOUS LES TESTS PASSENT AVEC SUCCES (0 erreur) !');
