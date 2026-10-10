'use strict';
const vscode = require('vscode');
const path = require('path');
const crypto = require('crypto');
const { parse } = require('./parser');
const { expand } = require('./resolve');
const { walk, plainText } = require('./ast');

const diagCollection = vscode.languages.createDiagnosticCollection('rdtmd');
const timers = new Map();
let panel = null;
let panelDoc = null;
let mediaUri = null;
let allowedFiles = new Set();

function docDir(doc) {
  return doc.uri.scheme === 'file' ? path.dirname(doc.uri.fsPath) : process.cwd();
}

function analyse(doc) {
  const raw = parse(doc.getText());
  const clone = JSON.parse(JSON.stringify(raw.ast));
  const seen = new Set(doc.uri.scheme === 'file' ? [doc.uri.fsPath] : []);
  const inline = vscode.workspace.getConfiguration('rdtmd').get('inlineIncludes', false);
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
      return new vscode.Diagnostic(
        new vscode.Range(d.line, 0, d.line, len),
        d.message,
        d.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning
      );
    }));
}

function shell(webview) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const css = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'preview.css'));
  const js = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'preview.js'));
  const mjs = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'math.js'));
  const hjs = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'highlight.js'));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${css}"></head><body><main id="root"></main><script nonce="${nonce}" src="${mjs}"></script><script nonce="${nonce}" src="${hjs}"></script><script nonce="${nonce}" src="${js}"></script></body></html>`;
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
  panel.webview.postMessage({ type: 'ast', ast: expanded, breaks: vscode.workspace.getConfiguration('rdtmd').get('preserveLineBreaks', true) });
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
    }
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

function schedule(doc) {
  if (doc.languageId !== 'rdtmd') return;
  const key = doc.uri.toString();
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => { lint(doc); push(); }, 200));
}

function activate(ctx) {
  mediaUri = vscode.Uri.joinPath(ctx.extensionUri, 'media');
  ctx.subscriptions.push(
    diagCollection,
    vscode.commands.registerCommand('rdtmd.preview', openPreview),
    vscode.commands.registerCommand('rdtmd.showAst', showAst),
    vscode.languages.registerDocumentLinkProvider({ language: 'rdtmd' }, { provideDocumentLinks }),
    vscode.languages.registerDocumentSymbolProvider({ language: 'rdtmd' }, { provideDocumentSymbols }),
    vscode.workspace.onDidOpenTextDocument(lint),
    vscode.workspace.onDidChangeTextDocument((e) => schedule(e.document)),
    vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration('rdtmd')) push(); }),
    vscode.workspace.onDidSaveTextDocument((d) => { if (d.languageId === 'rdtmd') push(); }),
    vscode.workspace.onDidCloseTextDocument((d) => diagCollection.delete(d.uri)),
    vscode.window.onDidChangeActiveTextEditor((ed) => {
      if (ed && ed.document.languageId === 'rdtmd' && panel) { panelDoc = ed.document; push(); }
    })
  );
  vscode.workspace.textDocuments.forEach(lint);
}

function deactivate() {}

module.exports = { activate, deactivate };
