'use strict';
/** Tests de la grammaire 1.1.0 : nouveaux graphiques, diagrammes, notes, toc. */
const assert = require('assert');
const { parse } = require('./src/parser');

const one = (src) => {
  const r = parse(src);
  return { node: r.ast.children[0], diags: r.diagnostics, ast: r.ast };
};
const codes = (diags) => diags.map((d) => d.code).filter(Boolean);

/* ---------- graphiques ---------- */
{
  let { node, diags } = one(':::chart bar "Pile"\n@stack\n@horizontal\n@y2 B\nx: a, b, c\nA: 1, 2, 3\nB: 4, 5, 6\n:::');
  assert.deepStrictEqual(diags.filter((d) => d.severity === 'error'), []);
  assert.strictEqual(node.stack, true);
  assert.strictEqual(node.horizontal, true);
  assert.deepStrictEqual(codes(diags), ['bad-option'], '@y2 est refusé sur un bar horizontal');
  assert.strictEqual(node.series[1].axis, undefined);
}
{
  const { node, diags } = one(':::chart area "Aire"\n@stack\n@y2 B\n@unit2 ms\nx: a, b, c\nA: 1, 2, 3\nB: 4, 5, 6\n:::');
  assert.deepStrictEqual(diags, []);
  assert.strictEqual(node.kind, 'area');
  assert.strictEqual(node.stack, true);
  assert.strictEqual(node.unit2, 'ms');
  assert.deepStrictEqual(node.series.map((s) => s.axis), ['y', 'y2']);
}
{
  const { node, diags } = one(':::chart scatter "Nuage"\n@xlabel Taille\n@ylabel Poids\nA: (1, 2) (3.5, 4) (-1, 0)\nB: (2,2)\n:::');
  assert.deepStrictEqual(diags, []);
  assert.strictEqual(node.kind, 'scatter');
  assert.deepStrictEqual(node.series[0].points, [{ x: 1, y: 2 }, { x: 3.5, y: 4 }, { x: -1, y: 0 }]);
  assert.strictEqual(node.xlabel, 'Taille');
}
{
  const { node, diags } = one(':::chart donut "Part"\n@center 100 %\nA: 60\nB: 40\n:::');
  assert.deepStrictEqual(diags, []);
  assert.strictEqual(node.kind, 'donut');
  assert.strictEqual(node.center, '100 %');
  assert.deepStrictEqual(node.categories, ['A', 'B']);
}
{
  const { diags } = one(':::chart bar\nx: a, b\nA: 1, 2, 3\n:::');
  assert.deepStrictEqual(codes(diags), ['chart-length']);
  assert.deepStrictEqual(diags[0].data, { name: 'A', got: 3, expected: 2 });
}
{
  const { diags } = one(':::chart pii\nA: 1\n:::');
  assert.strictEqual(diags[0].code, 'unknown-kind');
  assert.strictEqual(diags[0].data.hint, 'pie');
}
{
  const { node } = one(':::chart bar\n@theme warm\n@width 500\n@align right\nA: 1\n:::');
  assert.deepStrictEqual(node.opts, { theme: 'warm', width: 500, align: 'right' });
}
{
  const { diags } = one(':::chart bar\n@theme nope\n@width 5\n@align middle\nA: 1\n:::');
  assert.strictEqual(diags.length, 3);
}

/* ---------- flow : formes, chaînes, groupes ---------- */
{
  const { node, diags } = one(':::diagram flow "F"\nIn -> Check{Valide ?} : oui\nCheck -> Out(Sortie)\nIn -> Db[(Base)] -> Out\nA((rond)) --> B{{hex}}\n:::');
  assert.deepStrictEqual(diags, []);
  assert.deepStrictEqual(node.nodes, ['In', 'Check', 'Out', 'Db', 'A', 'B']);
  assert.strictEqual(node.nodeInfo.Check.shape, 'diamond');
  assert.strictEqual(node.nodeInfo.Check.label, 'Valide ?');
  assert.strictEqual(node.nodeInfo.Out.shape, 'round');
  assert.strictEqual(node.nodeInfo.Db.shape, 'cylinder');
  assert.strictEqual(node.nodeInfo.A.shape, 'circle');
  assert.strictEqual(node.nodeInfo.B.shape, 'hexagon');
  assert.strictEqual(node.nodeInfo.In.shape, 'rect');
  assert.deepStrictEqual(node.edges.map((e) => [e.from, e.to, e.label]), [
    ['In', 'Check', 'oui'], ['Check', 'Out', ''], ['In', 'Db', ''], ['Db', 'Out', ''], ['A', 'B', ''],
  ]);
  assert.strictEqual(node.edges[4].style, 'dashed');
}
{
  // chaîne : l'étiquette ne va que sur la dernière flèche
  const { node } = one(':::diagram flow\nA -> B -> C : fin\n:::');
  assert.deepStrictEqual(node.edges.map((e) => e.label), ['', 'fin']);
}
{
  // texte avec espaces et parenthèses : pas une forme
  const { node, diags } = one(':::diagram flow\nCompter les paires (x) -> Fin\n:::');
  assert.deepStrictEqual(diags, []);
  assert.deepStrictEqual(node.nodes, ['Compter les paires (x)', 'Fin']);
  assert.strictEqual(node.nodeInfo['Fin'].shape, 'rect');
}
{
  const { node, diags } = one(':::diagram flow\ngroup Backend\nAPI -> DB\nend\nUI -> API\nSolo[Seul]\n:::');
  assert.deepStrictEqual(diags, []);
  assert.strictEqual(node.groups.length, 1);
  assert.strictEqual(node.groups[0].title, 'Backend');
  assert.strictEqual(node.nodeInfo.API.group, 'g0');
  assert.strictEqual(node.nodeInfo.DB.group, 'g0');
  assert.strictEqual(node.nodeInfo.UI.group, undefined);
  assert(node.nodes.includes('Solo'));
}
{
  const { diags } = one(':::diagram flow\ngroup X\nA -> B\n:::');
  assert.deepStrictEqual(codes(diags), ['unclosed-group']);
}
{
  const { diags } = one(':::diagram flow\nA -> B\nend\n:::');
  assert.deepStrictEqual(codes(diags), ['stray-end']);
}
{
  const { diags } = one(':::diagram flow\nSeul\n:::');
  assert.deepStrictEqual(codes(diags), ['bad-line']);
}

/* ---------- state ---------- */
{
  const { node, diags } = one(':::diagram state "S"\n[*] -> Idle\nIdle -> Run : go\nRun -> [*]\n:::');
  assert.deepStrictEqual(diags, []);
  assert.strictEqual(node.kind, 'state');
  assert.strictEqual(node.dir, 'TD');
  assert.strictEqual(node.nodeInfo.__start.shape, 'start');
  assert.strictEqual(node.nodeInfo.__end.shape, 'end');
  assert.strictEqual(node.edges.length, 3);
}

/* ---------- er ---------- */
{
  const { node, diags } = one(':::diagram er "Schéma"\nentity User\n  id: int PK\n  name: text\n  org_id: int FK\nentity Org\n  id: int PK\nUser 1..*--1 Org : appartient\nOrg 1--* Team\n:::');
  assert.deepStrictEqual(diags, []);
  assert.deepStrictEqual(node.entities.map((e) => e.name), ['User', 'Org', 'Team']);
  assert.deepStrictEqual(node.entities[0].attrs[0], { name: 'id', type: 'int', keys: ['PK'] });
  assert.deepStrictEqual(node.entities[0].attrs[2].keys, ['FK']);
  assert.strictEqual(node.relations.length, 2);
  assert.deepStrictEqual(
    [node.relations[0].from, node.relations[0].fromCard, node.relations[0].toCard, node.relations[0].to, node.relations[0].label],
    ['User', '1..*', '1', 'Org', 'appartient']
  );
}

/* ---------- class ---------- */
{
  const { node, diags } = one(':::diagram class "C"\nclass Animal <<abstract>>\n  +name: string\n  +speak()\nclass Dog\nDog --|> Animal\nAnimal *-- Leg : a\nOwner --> Dog\nCat <|-- Kitten\n:::');
  assert.deepStrictEqual(diags, []);
  assert.strictEqual(node.classes[0].stereotype, 'abstract');
  assert.deepStrictEqual(node.classes[0].fields, ['+name: string']);
  assert.deepStrictEqual(node.classes[0].methods, ['+speak()']);
  const rel = (i) => [node.relations[i].from, node.relations[i].to, node.relations[i].type];
  assert.deepStrictEqual(rel(0), ['Dog', 'Animal', 'inherit']);
  assert.deepStrictEqual(rel(1), ['Leg', 'Animal', 'compose']);
  assert.deepStrictEqual(rel(2), ['Owner', 'Dog', 'assoc']);
  assert.deepStrictEqual(rel(3), ['Kitten', 'Cat', 'inherit']);
}

/* ---------- sequence ---------- */
{
  const src = ':::diagram sequence "S"\n@autonumber\nparticipant API as Passerelle\nactor Client\nClient -> API : GET\nactivate API\nnote over Client,API : même contexte\nalt succès\nAPI --> Client : 200\nelse échec\nAPI --> Client : 500\nend\nloop chaque minute\nAPI -> API : ping\nend\ndeactivate API\nnote right of API : fin\n:::';
  const { node, diags } = one(src);
  assert.deepStrictEqual(diags, []);
  assert.deepStrictEqual(node.participants, ['API', 'Client']);
  assert.strictEqual(node.labels.API, 'Passerelle');
  assert.strictEqual(node.autonumber, true);
  assert.strictEqual(node.messages.length, 4);
  assert.deepStrictEqual(node.events.map((e) => e.type), [
    'msg', 'activate', 'note', 'block', 'msg', 'else', 'msg', 'end', 'block', 'msg', 'end', 'deactivate', 'note',
  ]);
  const note = node.events[2];
  assert.deepStrictEqual([note.side, note.who, note.text], ['over', ['Client', 'API'], 'même contexte']);
  assert.strictEqual(node.events[12].side, 'right');
}
{
  const { diags } = one(':::diagram sequence\nA -> B\nend\n:::');
  assert.deepStrictEqual(codes(diags), ['stray-end']);
}
{
  const { diags } = one(':::diagram sequence\nalt x\nA -> B\n:::');
  assert.deepStrictEqual(codes(diags), ['unclosed-block']);
}
{
  const { diags } = one(':::diagram sequence\nloop x\nA -> B\nelse y\nend\n:::');
  assert.deepStrictEqual(codes(diags), ['stray-else']);
}

/* ---------- timeline ---------- */
{
  const { node, diags } = one(':::diagram timeline "T"\n@orient vertical\nsection Phase 1\n2024: a | b\nsection Phase 2\n2025: c\n:::');
  assert.deepStrictEqual(diags, []);
  assert.strictEqual(node.orient, 'vertical');
  assert.deepStrictEqual(node.sections, ['Phase 1', 'Phase 2']);
  assert.strictEqual(node.items[0].section, 'Phase 1');
  assert.strictEqual(node.items[1].section, 'Phase 2');
}

/* ---------- mindmap ---------- */
{
  const { node, diags } = one(':::diagram mindmap\n@theme cool\nRacine\n  Rouge {red}\n    Fils\n  Bleu {#4e9de6}\n:::');
  assert.deepStrictEqual(diags, []);
  assert.strictEqual(node.root.children[0].text, 'Rouge');
  assert.strictEqual(node.root.children[0].color, 'red');
  assert.strictEqual(node.root.children[1].color, '#4e9de6');
  assert.strictEqual(node.opts.theme, 'cool');
}

/* ---------- gantt ---------- */
{
  const src = ':::diagram gantt "Plan"\n@today\nsection Conception\nSpéc: 2026-10-01, 5d\nMaquettes: after Spéc, 4d\nsection Dev\nParser: done, 2026-10-08, 2w\nTests: crit, 2026-10-20, 2026-10-30\nRelease: milestone, after Tests\nDocs: 3d\n:::';
  const { node, diags } = one(src);
  assert.deepStrictEqual(diags, []);
  assert.strictEqual(node.today, true);
  const t = Object.fromEntries(node.tasks.map((x) => [x.name, x]));
  assert.strictEqual(t['Spéc'].start, '2026-10-01');
  assert.strictEqual(t['Spéc'].end, '2026-10-06');
  assert.strictEqual(t['Maquettes'].start, '2026-10-06');
  assert.strictEqual(t['Maquettes'].end, '2026-10-10');
  assert.strictEqual(t['Parser'].status, 'done');
  assert.strictEqual(t['Parser'].end, '2026-10-22');
  assert.strictEqual(t['Tests'].end, '2026-10-31');
  assert.strictEqual(t['Tests'].status, 'crit');
  assert.strictEqual(t['Release'].milestone, true);
  assert.strictEqual(t['Release'].start, '2026-10-31');
  assert.strictEqual(t['Docs'].start, '2026-10-31', 'sans début : enchaîné après la tâche précédente');
  assert.deepStrictEqual(node.sections, ['Conception', 'Dev']);
  assert.strictEqual(t['Parser'].section, 'Dev');
}
{
  const { diags } = one(':::diagram gantt\nA: after Inconnue, 2d\n:::');
  assert.deepStrictEqual(codes(diags), ['gantt-after', 'empty-chart']);
}
{
  const { diags } = one(':::diagram gantt\nA: 2026-13-45, 2d\n:::');
  assert(codes(diags).includes('bad-date'));
}
{
  const { diags } = one(':::diagram gantt\nA: 2d\n:::');
  assert(codes(diags).includes('gantt-start'));
}

/* ---------- quadrant ---------- */
{
  const src = ':::diagram quadrant "Priorités"\n@x Effort: Faible -> Élevé\n@y Impact: Faible -> Élevé\n@quadrants Quick wins | Projets | Plus tard | À éviter\nA: 0.2, 0.9\nB: 0.8, 0.7\nC: 1.5, 0.1\n:::';
  const { node, diags } = one(src);
  assert.deepStrictEqual(codes(diags), ['range']);
  assert.deepStrictEqual(node.xAxis, { label: 'Effort', low: 'Faible', high: 'Élevé' });
  assert.deepStrictEqual(node.quadrants, ['Quick wins', 'Projets', 'Plus tard', 'À éviter']);
  assert.strictEqual(node.points.length, 3);
  assert.strictEqual(node.points[2].x, 1, 'valeur bornée à 1');
}

/* ---------- type de diagramme inconnu ---------- */
{
  const { diags } = one(':::diagram gant\nA: 1\n:::');
  assert.strictEqual(diags[0].code, 'unknown-kind');
  assert.strictEqual(diags[0].data.hint, 'gantt');
}

/* ---------- toc, notes de bas de page, ids de titres ---------- */
{
  const src = '# Titre {#top}\n\n@toc 2\n\n## Suite\n\nTexte avec note[^a] et [^b].\n\n[^a]: Première note\n  sur deux lignes.\n[^c]: Orpheline\n';
  const { ast, diags } = one(src);
  const types = ast.children.map((n) => n.type);
  assert.deepStrictEqual(types, ['heading', 'toc', 'heading', 'paragraph', 'footnote', 'footnote']);
  assert.strictEqual(ast.children[0].id, 'top');
  assert.strictEqual(ast.children[1].depth, 2);
  assert.strictEqual(ast.children[4].id, 'a');
  assert(JSON.stringify(ast.children[4].inline).includes('sur deux lignes'));
  assert(JSON.stringify(ast.children[3].inline).includes('"footref"'));
  assert.deepStrictEqual(codes(diags).sort(), ['footnote-missing', 'footnote-unused']);
}

/* ---------- directives : suggestions ---------- */
{
  const { diags } = one(':::chrt\nx\n:::');
  assert.strictEqual(diags[0].code, 'unknown-directive');
  assert.strictEqual(diags[0].data.hint, 'chart');
}
{
  const { diags } = one(':::note\ntexte');
  assert.strictEqual(diags[0].code, 'unclosed');
}

console.log('TESTS 1.1.0 : OK');
