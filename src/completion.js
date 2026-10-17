'use strict';
/** Autocomplétion RDTMD : logique pure (sans VS Code). Retourne des suggestions { label, insert, detail, kind }. */

const DIRECTIVES = [
  ['chart', 'Graphique : bar, line, area, scatter, pie, donut', 'chart ${1|bar,line,area,scatter,pie,donut|} "${2:Titre}"\n$0\n:::'],
  ['diagram', 'Diagramme : flow, state, sequence, mindmap, timeline, gantt, quadrant, er, class', 'diagram ${1|flow,state,sequence,mindmap,timeline,gantt,quadrant,er,class|} "${2:Titre}"\n$0\n:::'],
  ['tabs', 'Onglets (=== Titre)', 'tabs\n=== ${1:Premier}\n$0\n=== ${2:Second}\n\n:::'],
  ['metrics', 'Cartes de métriques', 'metrics "${1:Titre}"\n${2:Libellé}: ${3:Valeur} (${4:+5%, good})\n:::'],
  ['chat', 'Conversation', 'chat "${1:Titre}"\nuser: $0\nassistant: \n:::'],
  ['details', 'Bloc repliable', 'details "${1:Titre}"\n$0\n:::'],
  ['note', 'Encadré note', 'note ${1:Titre}\n$0\n:::'],
  ['tip', 'Encadré astuce', 'tip ${1:Titre}\n$0\n:::'],
  ['warn', 'Encadré attention', 'warn ${1:Titre}\n$0\n:::'],
  ['danger', 'Encadré danger', 'danger ${1:Titre}\n$0\n:::'],
];

const DIAGRAM_KINDS = {
  flow: 'Organigramme (formes, groupes)', state: 'Machine à états', sequence: 'Diagramme de séquence', mindmap: 'Carte mentale',
  timeline: 'Chronologie', gantt: 'Planning de Gantt', quadrant: 'Matrice à quatre cadrans', er: 'Schéma entité-relation', class: 'Diagramme de classes',
};
const CHART_KINDS = { bar: 'Barres', line: 'Courbes', area: 'Aires', scatter: 'Nuage de points', pie: 'Camembert', donut: 'Anneau' };

const COMMON = [['theme', 'Palette du bloc : default, warm, cool, mono, pastel, vivid'], ['width', 'Largeur maximale en pixels'], ['align', 'left, center ou right']];
const OPTIONS = {
  chart: [['unit', 'Unité de l\'axe'], ['unit2', 'Unité de l\'axe droit'], ['stack', 'Empile les séries (bar, area)'], ['horizontal', 'Barres horizontales (bar)'],
    ['y2', 'Séries sur l\'axe droit (noms séparés par des virgules)'], ['center', 'Texte au centre d\'un donut'], ['xlabel', 'Titre de l\'axe X'], ['ylabel', 'Titre de l\'axe Y']],
  flow: [['dir', 'Direction : LR ou TD']],
  state: [['dir', 'Direction : LR ou TD']],
  sequence: [['autonumber', 'Numérote les messages']],
  timeline: [['orient', 'horizontal ou vertical']],
  gantt: [['today', 'Trace la ligne « aujourd\'hui »']],
  quadrant: [['x', 'Axe X : Libellé: bas -> haut'], ['y', 'Axe Y : Libellé: bas -> haut'], ['quadrants', 'Quatre noms séparés par |']],
  mindmap: [], er: [], class: [],
};

const KEYWORDS = {
  flow: [['group', 'Groupe nommé (se ferme par end)', 'group ${1:Nom}\n$0\nend'], ['end', 'Ferme un groupe', 'end']],
  state: [['group', 'Groupe nommé (se ferme par end)', 'group ${1:Nom}\n$0\nend'], ['end', 'Ferme un groupe', 'end']],
  sequence: [
    ['participant', 'Déclare un participant', 'participant ${1:Nom} as ${2:Libellé}'], ['actor', 'Déclare un acteur', 'actor ${1:Nom}'],
    ['activate', 'Active une lifeline', 'activate ${1:Nom}'], ['deactivate', 'Désactive une lifeline', 'deactivate ${1:Nom}'],
    ['note over', 'Note sur un ou deux participants', 'note over ${1:A},${2:B} : ${3:texte}'],
    ['note left of', 'Note à gauche', 'note left of ${1:A} : ${2:texte}'], ['note right of', 'Note à droite', 'note right of ${1:A} : ${2:texte}'],
    ['alt', 'Bloc alternative', 'alt ${1:condition}\n$0\nelse ${2:sinon}\n\nend'], ['opt', 'Bloc optionnel', 'opt ${1:condition}\n$0\nend'],
    ['loop', 'Bloc boucle', 'loop ${1:condition}\n$0\nend'], ['par', 'Bloc parallèle', 'par ${1:branche}\n$0\nand ${2:autre}\n\nend'],
    ['else', 'Branche alternative', 'else ${1:sinon}'], ['and', 'Branche parallèle', 'and ${1:autre}'], ['end', 'Ferme un bloc', 'end'],
  ],
  timeline: [['section', 'Regroupe les périodes suivantes', 'section ${1:Nom}']],
  gantt: [['section', 'Regroupe les tâches suivantes', 'section ${1:Nom}']],
  er: [['entity', 'Entité (attributs indentés dessous)', 'entity ${1:Nom}\n  ${2:id}: ${3:int} PK']],
  class: [['class', 'Classe (membres indentés dessous)', 'class ${1:Nom}\n  +${2:champ}: ${3:type}\n  +${4:methode}()']],
};

const TASK_FLAGS = [['milestone', 'Jalon (un seul jour)'], ['done', 'Tâche terminée'], ['active', 'Tâche en cours'], ['crit', 'Tâche critique'], ['after', 'Commence après une tâche']];

/**
 * @param {string} prefix  texte de la ligne jusqu'au curseur
 * @param {{name:string, kind:string}|null} block  directive ouverte autour du curseur (kind = premier mot des arguments)
 */
function completionsFor(prefix, block) {
  const out = [];
  const push = (label, detail, insert, kind) => out.push({ label, detail, insert: insert || label, kind: kind || 'keyword' });

  let m = /^(:{3,}\s*)([A-Za-z]*)$/.exec(prefix);
  if (m) {
    DIRECTIVES.forEach(([n, d, ins]) => push(n, d, ins, 'snippet'));
    return { items: out, replace: m[2].length };
  }
  m = /^:{3,}\s*(chart|diagram)\s+([A-Za-z]*)$/.exec(prefix);
  if (m) {
    const src = m[1] === 'chart' ? CHART_KINDS : DIAGRAM_KINDS;
    Object.keys(src).forEach((k) => push(k, src[k], k, 'enum'));
    return { items: out, replace: m[2].length };
  }
  if (/^@(?:\w*)$/.test(prefix) && !block) {
    push('@include', 'Inclut un autre fichier .rdtmd', '@include ${1:fichier.rdtmd}', 'snippet');
    push('@toc', 'Table des matières (profondeur optionnelle)', '@toc ${1|3,1,2,4,5,6|}', 'snippet');
    return { items: out, replace: prefix.length - 1 };
  }
  if (!block || (block.name !== 'diagram' && block.name !== 'chart')) return { items: out, replace: 0 };

  const kind = block.name === 'chart' ? 'chart' : block.kind;
  m = /^(\s*)@(\w*)$/.exec(prefix);
  if (m) {
    (OPTIONS[kind] || []).concat(COMMON).forEach(([n, d]) => push('@' + n, d, n, 'property'));
    return { items: out, replace: m[2].length };
  }
  m = /^(\s*)([A-Za-z]*(?: [a-z]*)?)$/.exec(prefix);
  if (m && KEYWORDS[kind]) {
    KEYWORDS[kind].forEach(([n, d, ins]) => push(n, d, ins, 'snippet'));
    return { items: out, replace: m[2].length };
  }
  if (kind === 'gantt' && /^[^:]+:\s*(?:[A-Za-z]*)$/.test(prefix)) {
    const w = /([A-Za-z]*)$/.exec(prefix)[1];
    TASK_FLAGS.forEach(([n, d]) => push(n, d, n, 'enum'));
    return { items: out, replace: w.length };
  }
  return { items: out, replace: 0 };
}

module.exports = { completionsFor, DIRECTIVES, DIAGRAM_KINDS, CHART_KINDS, OPTIONS, KEYWORDS };
