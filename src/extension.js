'use strict';
const vscode = require('vscode');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { parse } = require('./parser');
const { expand } = require('./resolve');
const { walk, plainText } = require('./ast');
const { SCRIPTS, STYLES } = require('./assets');
const { buildHtml, findBrowser } = require('./export');
const { completionsFor } = require('./completion');
const { fixesFor } = require('./fixes');

const diagCollection = vscode.languages.createDiagnosticCollection('rdtmd');
const timers = new Map();
let panel = null;
let panelDoc = null;
let mediaUri = null;
let allowedFiles = new Set();
let lockUntil = 0;

const cfg = () => vscode.workspace.getConfiguration('rdtmd');

function docDir(doc) {
  return doc.uri.scheme === 'file' ? path.dirname(doc.uri.fsPath) : process.cwd();
}

function analyse(doc, forceInline) {
  const raw = parse(doc.getText());
  const clone = JSON.parse(JSON.stringify(raw.ast));
  const seen = new Set(doc.uri.scheme === 'file' ? [doc.uri.fsPath] : []);
  const inline = forceInline === true ? true : cfg().get('inlineIncludes', false);
  const res = expand(clone, docDir(doc), seen, 0, inline);
  return { raw: raw.ast, expanded: res.ast, diagnostics: raw.diagnostics.concat(res.diagnostics) };
}

function lint(doc) {
  if (doc.languageId !== 'rdtmd') return;
  const { diagnostics } = analyse(doc);
  diagCollection.set(doc.uri, diagnostics
    .filter((d) => d.line < doc.lineCount)
    .map((d) => {
      const len = doc.lineAt(d.line).text.length;
      const diag = new vscode.Diagnostic(
        new vscode.Range(d.line, 0, d.line, len),
        d.message,
        d.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning
      );
      diag.source = 'rdtmd';
      if (d.code) diag.code = d.code;
      return diag;
    }));
}

function shell(webview) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const uri = (f) => webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, f));
  const links = STYLES.map((f) => `<link rel="stylesheet" href="${uri(f)}">`).join('');
  const scripts = SCRIPTS.map((f) => `<script nonce="${nonce}" src="${uri(f)}"></script>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
${links}</head><body><main id="root"></main>${scripts}</body></html>`;
}

function roots(doc) {
  const r = [mediaUri, vscode.Uri.file(docDir(doc))];
  (vscode.workspace.workspaceFolders || []).forEach((f) => r.push(f.uri));
  return r;
}

function push() {
  if (!panel || !panelDoc) return;
  const { expanded } = analyse(panelDoc);
  panel.webview.options = { enableScripts: true, localResourceRoots: roots(panelDoc) };
  walk(expanded, (n) => {
    if (n.type === 'image' && n.src && !/^(https?:|data:)/i.test(n.src)) {
      n.src = panel.webview.asWebviewUri(vscode.Uri.file(n.src)).toString();
    }
  });
  allowedFiles = new Set();
  walk(expanded, (n) => { if ((n.type === 'included' || n.type === 'includelink') && n.file) allowedFiles.add(n.file); });
  panel.title = 'Preview ' + path.basename(panelDoc.uri.path);
  const c = cfg();
  panel.webview.postMessage({
    type: 'ast',
    ast: expanded,
    breaks: c.get('preserveLineBreaks', true),
    theme: c.get('theme', 'auto'),
    palette: c.get('palette', []),
    syncScroll: c.get('syncScroll', true),
  });
}

/* ---------- enregistrement d'un SVG/PNG envoyé par l'aperçu ---------- */
async function saveFromWebview(m) {
  if (typeof m.name !== 'string' || typeof m.data !== 'string') return;
  if (m.mime !== 'image/svg+xml' && m.mime !== 'image/png') return;
  if (m.data.length > 40e6) return;
  const name = path.basename(m.name).replace(/[^\w.\- ]+/g, '_') || 'figure';
  const dir = panelDoc && panelDoc.uri.scheme === 'file' ? path.dirname(panelDoc.uri.fsPath) : os.homedir();
  const png = m.mime === 'image/png';
  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(path.join(dir, name)),
    filters: png ? { PNG: ['png'] } : { SVG: ['svg'] },
  });
  if (!uri) return;
  await vscode.workspace.fs.writeFile(uri, m.encoding === 'base64' ? Buffer.from(m.data, 'base64') : Buffer.from(m.data, 'utf8'));
  vscode.window.showInformationMessage('Saved ' + path.basename(uri.fsPath));
}

function revealLineInEditor(line) {
  if (!panelDoc || !Number.isInteger(line) || line < 0) return;
  const ed = vscode.window.visibleTextEditors.find((e) => e.document === panelDoc);
  if (!ed) return;
  lockUntil = Date.now() + 400;
  const l = Math.min(line, panelDoc.lineCount - 1);
  ed.revealRange(new vscode.Range(l, 0, l, 0), vscode.TextEditorRevealType.AtTop);
}

function openPreview() {
  const ed = vscode.window.activeTextEditor;
  if (!ed || ed.document.languageId !== 'rdtmd') {
    vscode.window.showWarningMessage('Please open a .rdtmd file first');
    return;
  }
  panelDoc = ed.document;
  if (panel) { panel.reveal(vscode.ViewColumn.Beside, true); push(); return; }
  panel = vscode.window.createWebviewPanel('rdtmdPreview', 'RDTMD Preview', { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: true, localResourceRoots: roots(panelDoc) });
  panel.webview.html = shell(panel.webview);
  panel.webview.onDidReceiveMessage((m) => {
    if (!m) return;
    if (m.type === 'ready') push();
    else if (m.type === 'open' && allowedFiles.has(m.file)) {
      const src = vscode.window.visibleTextEditors.find((e) => e.document === panelDoc);
      vscode.window.showTextDocument(vscode.Uri.file(m.file), { viewColumn: src ? src.viewColumn : vscode.ViewColumn.One })
        .then(undefined, () => {});
    } else if (m.type === 'save') saveFromWebview(m).then(undefined, (e) => vscode.window.showErrorMessage('Save failed: ' + e.message));
    else if (m.type === 'revealLine' && cfg().get('syncScroll', true)) revealLineInEditor(m.line);
  });
  panel.onDidDispose(() => { panel = null; panelDoc = null; });
}

async function showAst() {
  const ed = vscode.window.activeTextEditor;
  if (!ed || ed.document.languageId !== 'rdtmd') {
    vscode.window.showWarningMessage('Please open a .rdtmd file first');
    return;
  }
  const { raw } = analyse(ed.document);
  const doc = await vscode.workspace.openTextDocument({ language: 'json', content: JSON.stringify(raw, null, 2) });
  vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
}

/* ---------- export HTML / PDF ---------- */

function activeRdtmd() {
  const ed = vscode.window.activeTextEditor;
  if (ed && ed.document.languageId === 'rdtmd') return ed.document;
  if (panelDoc) return panelDoc;
  vscode.window.showWarningMessage('Please open a .rdtmd file first');
  return null;
}

function renderHtml(doc, theme, print) {
  const { expanded } = analyse(doc, true);
  const c = cfg();
  return buildHtml({
    ast: expanded,
    title: path.basename(doc.uri.path).replace(/\.rdtmd$/i, ''),
    theme,
    palette: c.get('palette', []),
    breaks: c.get('preserveLineBreaks', true),
    mediaDir: mediaUri.fsPath,
    print,
    lang: vscode.env.language,
  });
}

function defaultOut(doc, ext) {
  const base = path.basename(doc.uri.path).replace(/\.rdtmd$/i, '') + ext;
  return vscode.Uri.file(path.join(doc.uri.scheme === 'file' ? path.dirname(doc.uri.fsPath) : os.homedir(), base));
}

async function exportHtml() {
  const doc = activeRdtmd();
  if (!doc) return;
  const uri = await vscode.window.showSaveDialog({ defaultUri: defaultOut(doc, '.html'), filters: { HTML: ['html'] } });
  if (!uri) return;
  await vscode.workspace.fs.writeFile(uri, Buffer.from(renderHtml(doc, cfg().get('theme', 'auto'), false), 'utf8'));
  const pick = await vscode.window.showInformationMessage('Exported ' + path.basename(uri.fsPath), 'Open in browser');
  if (pick) vscode.env.openExternal(uri);
}

function printToPdf(browser, htmlPath, pdfPath) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'rdtmd-profile-'));
  const args = [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--allow-file-access-from-files',
    '--no-pdf-header-footer', '--print-to-pdf-no-header', '--run-all-compositor-stages-before-draw', '--virtual-time-budget=8000',
    '--user-data-dir=' + profile, '--print-to-pdf=' + pdfPath, 'file:///' + htmlPath.replace(/\\/g, '/'),
  ];
  return new Promise((resolve, reject) => {
    execFile(browser, args, { timeout: 90000, windowsHide: true }, (err) => {
      fs.rm(profile, { recursive: true, force: true }, () => {});
      if (err && !(fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 0)) reject(err); else resolve();
    });
  });
}

async function exportPdf() {
  const doc = activeRdtmd();
  if (!doc) return;
  const t = cfg().get('theme', 'auto');
  const theme = t === 'paper' || t === 'light' ? t : 'light';
  const browser = findBrowser(cfg().get('browserPath', ''));
  const tmp = path.join(os.tmpdir(), 'rdtmd-' + crypto.randomBytes(6).toString('hex') + '.html');

  if (!browser) {
    fs.writeFileSync(tmp, renderHtml(doc, theme, true), 'utf8');
    await vscode.env.openExternal(vscode.Uri.file(tmp));
    vscode.window.showWarningMessage('No Chromium-based browser found (Edge, Chrome, Chromium). The document was opened in your default browser: use "Save as PDF" in the print dialog. You can also set "rdtmd.browserPath".');
    return;
  }
  const uri = await vscode.window.showSaveDialog({ defaultUri: defaultOut(doc, '.pdf'), filters: { PDF: ['pdf'] } });
  if (!uri) return;
  fs.writeFileSync(tmp, renderHtml(doc, theme, false), 'utf8');
  try {
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'RDTMD: generating PDF…' }, () => printToPdf(browser, tmp, uri.fsPath));
    const pick = await vscode.window.showInformationMessage('Exported ' + path.basename(uri.fsPath), 'Open');
    if (pick) vscode.env.openExternal(uri);
  } catch (e) {
    vscode.window.showErrorMessage('PDF export failed: ' + (e && e.message ? e.message : e));
  } finally {
    fs.rm(tmp, { force: true }, () => {});
  }
}

/* ---------- plan du document, liens ---------- */

function provideDocumentSymbols(doc) {
  const { ast } = parse(doc.getText());
  const heads = ast.children
    .filter((n) => n.type === 'heading' && n.line < doc.lineCount)
    .map((n) => ({ level: n.level, name: plainText(n.inline) || '(empty)', line: n.line }));
  const root = [], stack = [];
  heads.forEach((h, idx) => {
    let end = doc.lineCount - 1;
    for (let j = idx + 1; j < heads.length; j++) {
      if (heads[j].level <= h.level) { end = heads[j].line - 1; break; }
    }
    end = Math.max(end, h.line);
    const sym = new vscode.DocumentSymbol(
      h.name, '', vscode.SymbolKind.String,
      new vscode.Range(h.line, 0, end, doc.lineAt(end).text.length),
      new vscode.Range(h.line, 0, h.line, doc.lineAt(h.line).text.length)
    );
    while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop();
    (stack.length ? stack[stack.length - 1].sym.children : root).push(sym);
    stack.push({ level: h.level, sym });
  });
  return root;
}

function provideDocumentLinks(doc) {
  const dir = docDir(doc), links = [];
  for (let i = 0; i < doc.lineCount; i++) {
    const m = /^(@include\s+)(.+?)\s*$/.exec(doc.lineAt(i).text);
    if (!m) continue;
    const start = m[1].length;
    links.push(new vscode.DocumentLink(new vscode.Range(i, start, i, start + m[2].length), vscode.Uri.file(path.resolve(dir, m[2]))));
  }
  return links;
}

/* ---------- autocomplétion ---------- */

/** Directive ouverte la plus proche au-dessus de la ligne (en comptant les fermetures). */
function blockAt(doc, line) {
  let depth = 0;
  for (let i = line - 1; i >= 0 && line - i < 3000; i--) {
    const l = doc.lineAt(i).text;
    if (/^:{3,}\s*$/.test(l)) { depth++; continue; }
    const m = /^:{3,}\s*([A-Za-z]+)\b\s*(.*)$/.exec(l);
    if (!m) continue;
    if (depth === 0) {
      const kind = /^(\w+)/.exec(m[2].trim());
      return { name: m[1].toLowerCase(), kind: kind ? kind[1].toLowerCase() : '' };
    }
    depth--;
  }
  return null;
}

const KINDS = {
  keyword: vscode.CompletionItemKind.Keyword, snippet: vscode.CompletionItemKind.Snippet,
  enum: vscode.CompletionItemKind.EnumMember, property: vscode.CompletionItemKind.Property,
};

function provideCompletionItems(doc, pos) {
  const prefix = doc.lineAt(pos.line).text.slice(0, pos.character);
  const res = completionsFor(prefix, blockAt(doc, pos.line));
  return res.items.map((s) => {
    const it = new vscode.CompletionItem(s.label, KINDS[s.kind] || vscode.CompletionItemKind.Text);
    it.detail = s.detail;
    it.insertText = new vscode.SnippetString(s.insert);
    it.range = new vscode.Range(pos.line, pos.character - res.replace, pos.line, pos.character);
    it.filterText = s.label;
    return it;
  });
}

/* ---------- correctifs rapides ---------- */

function provideCodeActions(doc, range, context) {
  const mine = context.diagnostics.filter((d) => d.source === 'rdtmd' && d.code !== undefined);
  if (!mine.length) return [];
  const { diagnostics } = analyse(doc);
  const lines = doc.getText().split(/\r?\n/);
  const actions = [];
  mine.forEach((cd) => {
    const d = diagnostics.find((x) => x.line === cd.range.start.line && x.code === cd.code);
    if (!d) return;
    fixesFor(d, lines).forEach((fx, i) => {
      const action = new vscode.CodeAction(fx.title, vscode.CodeActionKind.QuickFix);
      action.diagnostics = [cd];
      action.isPreferred = i === 0;
      const we = new vscode.WorkspaceEdit();
      const last = doc.lineCount - 1;
      fx.edits.forEach((e) => {
        if (e.type === 'replace') we.replace(doc.uri, new vscode.Range(e.line, e.start, e.line, e.end), e.text);
        else if (e.type === 'insert') {
          if (e.line > last) we.insert(doc.uri, doc.lineAt(last).range.end, '\n' + e.text.replace(/\n$/, ''));
          else we.insert(doc.uri, new vscode.Position(e.line, e.col), e.text);
        } else if (e.type === 'deleteLine') {
          if (e.line < last) we.delete(doc.uri, new vscode.Range(e.line, 0, e.line + 1, 0));
          else we.delete(doc.uri, new vscode.Range(Math.max(0, e.line - 1), doc.lineAt(Math.max(0, e.line - 1)).text.length, e.line, doc.lineAt(e.line).text.length));
        } else if (e.type === 'append') {
          if (doc.lineAt(last).text === '') we.insert(doc.uri, new vscode.Position(last, 0), e.text + '\n');
          else we.insert(doc.uri, doc.lineAt(last).range.end, '\n' + e.text);
        }
      });
      action.edit = we;
      actions.push(action);
    });
  });
  return actions;
}

/* ---------- événements ---------- */

function schedule(doc) {
  if (doc.languageId !== 'rdtmd') return;
  const key = doc.uri.toString();
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => { lint(doc); push(); }, 200));
}

function activate(ctx) {
  mediaUri = vscode.Uri.joinPath(ctx.extensionUri, 'media');
  const sel = { language: 'rdtmd' };
  ctx.subscriptions.push(
    diagCollection,
    vscode.commands.registerCommand('rdtmd.preview', openPreview),
    vscode.commands.registerCommand('rdtmd.showAst', showAst),
    vscode.commands.registerCommand('rdtmd.exportHtml', () => exportHtml().then(undefined, (e) => vscode.window.showErrorMessage('HTML export failed: ' + e.message))),
    vscode.commands.registerCommand('rdtmd.exportPdf', () => exportPdf().then(undefined, (e) => vscode.window.showErrorMessage('PDF export failed: ' + e.message))),
    vscode.languages.registerDocumentLinkProvider(sel, { provideDocumentLinks }),
    vscode.languages.registerDocumentSymbolProvider(sel, { provideDocumentSymbols }),
    vscode.languages.registerCompletionItemProvider(sel, { provideCompletionItems }, ':', '@', ' '),
    vscode.languages.registerCodeActionsProvider(sel, { provideCodeActions }, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }),
    vscode.workspace.onDidOpenTextDocument(lint),
    vscode.workspace.onDidChangeTextDocument((e) => schedule(e.document)),
    vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration('rdtmd')) push(); }),
    vscode.workspace.onDidSaveTextDocument((d) => { if (d.languageId === 'rdtmd') push(); }),
    vscode.workspace.onDidCloseTextDocument((d) => diagCollection.delete(d.uri)),
    vscode.window.onDidChangeActiveTextEditor((ed) => {
      if (ed && ed.document.languageId === 'rdtmd' && panel) { panelDoc = ed.document; push(); }
    }),
    vscode.window.onDidChangeTextEditorVisibleRanges((e) => {
      if (!panel || !panelDoc || e.textEditor.document !== panelDoc || Date.now() < lockUntil) return;
      if (!cfg().get('syncScroll', true) || !e.visibleRanges.length) return;
      panel.webview.postMessage({ type: 'scrollTo', line: e.visibleRanges[0].start.line });
    })
  );
  vscode.workspace.textDocuments.forEach(lint);
}

function deactivate() {}

module.exports = { activate, deactivate };
