'use strict';
/** Fichiers du webview, dans l'ordre de chargement (aperçu, export HTML et banc de rendu partagent cette liste). */
const SCRIPTS = [
  'math.js', 'highlight.js', 'svgkit.js', 'charts.js', 'graph.js', 'sequence.js', 'timeline.js', 'misc.js', 'interact.js', 'preview.js',
];
const STYLES = ['preview.css', 'diagrams.css'];

module.exports = { SCRIPTS, STYLES };
