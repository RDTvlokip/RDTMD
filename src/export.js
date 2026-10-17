'use strict';
/**
 * Export HTML autonome : le même rendu que l'aperçu, avec CSS, JS et données dans un seul fichier.
 * Aucune dépendance : pas de réseau, pas de VS Code.
 */
const fs = require('fs');
const path = require('path');
const { SCRIPTS, STYLES } = require('./assets');
const { walk } = require('./ast');

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.bmp': 'image/bmp', '.ico': 'image/x-icon', '.avif': 'image/avif',
};
const MAX_INLINE = 8 * 1024 * 1024;

/** Remplace les images locales par des data: URI (le fichier exporté doit pouvoir être déplacé). */
function inlineImages(ast) {
  walk(ast, (n) => {
    if (n.type !== 'image' || !n.src || /^(https?:|data:)/i.test(n.src)) return;
    const ext = path.extname(n.src).toLowerCase();
    if (!MIME[ext]) return;
    try {
      const st = fs.statSync(n.src);
      if (!st.isFile() || st.size > MAX_INLINE) return;
      n.src = 'data:' + MIME[ext] + ';base64,' + fs.readFileSync(n.src).toString('base64');
    } catch (e) { /* image introuvable : on laisse la source telle quelle */ }
  });
}

/** JSON sûr à l'intérieur d'une balise <script> : jamais de "</script>" ni de séparateurs de ligne Unicode. */
function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

const escHtml = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const VARS_LIGHT = '--vscode-foreground:#24292f;--vscode-editor-background:#ffffff;--vscode-panel-border:#d0d7de;--vscode-textCodeBlock-background:#f3f5f7;' +
  '--vscode-descriptionForeground:#57606a;--vscode-toolbar-hoverBackground:#e7ebef;--vscode-textLink-foreground:#0969da;--vscode-textBlockQuote-background:#f6f8fa;' +
  '--vscode-textBlockQuote-border:#d0d7de;--vscode-button-background:#0969da;--vscode-button-foreground:#ffffff;--vscode-errorForeground:#cf222e;' +
  '--vscode-focusBorder:#0969da;--vscode-checkbox-border:#6e7781;';
const VARS_DARK = '--vscode-foreground:#d4d4d4;--vscode-editor-background:#1e1e1e;--vscode-panel-border:#3c3c3c;--vscode-textCodeBlock-background:#2a2a2a;' +
  '--vscode-descriptionForeground:#9d9d9d;--vscode-toolbar-hoverBackground:#383838;--vscode-textLink-foreground:#4daafc;--vscode-textBlockQuote-background:#252526;' +
  '--vscode-textBlockQuote-border:#4a4a4a;--vscode-button-background:#0e639c;--vscode-button-foreground:#ffffff;--vscode-errorForeground:#f48771;' +
  '--vscode-focusBorder:#007fd4;--vscode-checkbox-border:#6b6b6b;';

const SHIM = `
window.acquireVsCodeApi = function () {
  function download(m) {
    var bytes = m.encoding === 'base64' ? Uint8Array.from(atob(m.data), function (c) { return c.charCodeAt(0); }) : new TextEncoder().encode(m.data);
    var url = URL.createObjectURL(new Blob([bytes], { type: m.mime }));
    var a = document.createElement('a'); a.href = url; a.download = m.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  return { postMessage: function (m) {
    if (!m) return;
    if (m.type === 'ready') window.postMessage(JSON.parse(document.getElementById('rdt-data').textContent), '*');
    else if (m.type === 'save') download(m);
  } };
};
(function () {
  var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.body.classList.add(dark ? 'vscode-dark' : 'vscode-light');
})();`;

/**
 * @param {object} o { ast, title, theme, palette, breaks, mediaDir, print }
 *   ast déjà résolu (includes inline). theme : auto|light|dark|paper|contrast. print : ouvre la boîte d'impression au chargement.
 */
function buildHtml(o) {
  const media = o.mediaDir;
  const read = (f) => fs.readFileSync(path.join(media, f), 'utf8');
  const ast = JSON.parse(JSON.stringify(o.ast));
  inlineImages(ast);
  const theme = o.theme || 'auto';
  const data = { type: 'ast', ast, breaks: o.breaks !== false, theme, palette: o.palette || null, syncScroll: false };
  const css = STYLES.map(read).join('\n');
  const js = SCRIPTS.map((f) => '/* ' + f + ' */\n' + read(f).replace(/<\/script/gi, '<\\/script')).join('\n');
  const title = escHtml(o.title || 'RDTMD');
  const autoVars = theme === 'auto'
    ? ':root{' + VARS_LIGHT + '} @media (prefers-color-scheme: dark){:root{' + VARS_DARK + '}}'
    : ':root{' + VARS_LIGHT + '}';
  const printBoot = o.print ? 'window.addEventListener("load",function(){setTimeout(function(){window.print()},700)});' : '';

  return '<!doctype html>\n<html lang="' + escHtml(o.lang || 'fr') + '"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="generator" content="RDTMD">' +
    '<title>' + title + '</title>\n<style>\n' + autoVars +
    ':root{--vscode-font-family:"Segoe UI",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif;--vscode-editor-font-family:Consolas,"SF Mono",Menlo,monospace;}' +
    'html,body{background:var(--vscode-editor-background);} body{margin:0;} .inc-chip{display:none;}' +
    '@page{margin:14mm;}\n' + css + '\n</style></head>\n<body><main id="root"></main>\n' +
    '<script>' + SHIM + printBoot + '</script>\n' +
    '<script type="application/json" id="rdt-data">' + safeJson(data) + '</script>\n' +
    '<script>\n' + js + '\n</script>\n</body></html>\n';
}

/** Chemin du navigateur Chromium (Edge, Chrome, Brave, Chromium) pour imprimer en PDF, ou null. */
function findBrowser(custom, env = process.env, platform = process.platform) {
  const candidates = [];
  if (custom) candidates.push(custom);
  if (platform === 'win32') {
    const pf = env['ProgramFiles'] || 'C:\\Program Files', pf86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', la = env['LOCALAPPDATA'] || '';
    candidates.push(
      pf86 + '\\Microsoft\\Edge\\Application\\msedge.exe', pf + '\\Microsoft\\Edge\\Application\\msedge.exe',
      pf + '\\Google\\Chrome\\Application\\chrome.exe', pf86 + '\\Google\\Chrome\\Application\\chrome.exe',
      la + '\\Google\\Chrome\\Application\\chrome.exe', pf + '\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'
    );
  } else if (platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium', '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
    );
  } else {
    const dirs = (env.PATH || '').split(path.delimiter).concat(['/usr/bin', '/usr/local/bin', '/snap/bin', '/opt/google/chrome']);
    ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'microsoft-edge-stable', 'brave-browser']
      .forEach((n) => dirs.forEach((d) => candidates.push(path.join(d, n))));
  }
  for (const c of candidates) {
    try { if (c && fs.statSync(c).isFile()) return c; } catch (e) { /* suivant */ }
  }
  return null;
}

module.exports = { buildHtml, findBrowser, safeJson, inlineImages };
