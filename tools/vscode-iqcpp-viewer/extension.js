// Shows and edits the C++ code stored inside VEXcode IQ .iqcpp project files.
//
// A .iqcpp file is one line of JSON; the code is the "textContent" string, with
// every line break escaped as \n. This extension shows that string as a C++
// document instead:
//   - opening a .iqcpp file shows its code; saving writes the code back into
//     the file's "textContent" and leaves everything else in the file as it was
//   - diffs of .iqcpp files (e.g. from Source Control) show as C++ diffs;
//     other versions (e.g. from git) are read-only

const vscode = require('vscode');
const fs = require('fs');

const SCHEME = 'iqcpp-code';          // editable code of a .iqcpp file on disk
const VERSION_SCHEME = 'iqcpp-version'; // read-only code of another version (e.g. git)

// .iqcpp files the user explicitly asked to see as raw JSON. They are not
// swapped for the code view until their raw tab is closed.
const keepRaw = new Set();
const openingRaw = new Set(); // raw tabs requested but not shown yet

function isCodeView(uri) {
  return !!uri && (uri.scheme === SCHEME || uri.scheme === VERSION_SCHEME);
}

function isIqcpp(uri) {
  return !!uri && !isCodeView(uri) && uri.path.toLowerCase().endsWith('.iqcpp');
}

// Code view of a .iqcpp document. Files on disk get an editable view; other
// versions keep the original document's URI in the query.
function codeUriFor(sourceUri) {
  if (sourceUri.scheme === 'file') {
    return sourceUri.with({ scheme: SCHEME });
  }
  return vscode.Uri.from({ scheme: VERSION_SCHEME, path: sourceUri.path, query: sourceUri.toString() });
}

function sourceUriFor(codeUri) {
  if (codeUri.scheme === SCHEME) {
    return codeUri.with({ scheme: 'file' });
  }
  return vscode.Uri.parse(codeUri.query);
}

function enabled() {
  return vscode.workspace.getConfiguration('iqcppViewer').get('openAsCode', true);
}

// The parsed project if this is a VEXcode text project, otherwise null.
function parseTextProject(raw) {
  try {
    const project = JSON.parse(raw);
    return project && typeof project.textContent === 'string' ? project : null;
  } catch (e) {
    return null;
  }
}

// Turns the text of a .iqcpp file into the code to show.
function codeFromProjectText(raw, label) {
  if (raw.trim() === '') return ''; // e.g. the "before" side of a newly added file
  const project = parseTextProject(raw);
  if (project) return project.textContent;
  try {
    JSON.parse(raw);
  } catch (e) {
    // Not JSON: VEXcode reports such files as corrupt. Show the text anyway.
    return '// WARNING: this file is not in VEXcode\'s project (JSON) format,\n' +
           '// so VEXcode will say the project file is corrupt.\n\n' + raw;
  }
  return `// ${label} has no "textContent" field, so it is not a VEXcode text project.\n`;
}

// Puts new code into a project file's text, keeping every other field as it was.
// Returns null if the text is not a VEXcode text project.
function projectTextWithCode(raw, code) {
  const project = parseTextProject(raw);
  if (!project) return null;
  project.textContent = code;
  return JSON.stringify(project);
}

// Editable code view of .iqcpp files on disk.
class CodeFileSystem {
  constructor() {
    this.emitter = new vscode.EventEmitter();
    this.onDidChangeFile = this.emitter.event;
  }

  readRaw(uri) {
    try {
      return fs.readFileSync(sourceUriFor(uri).fsPath, 'utf8');
    } catch (e) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
  }

  watch() {
    // Changes are reported from the workspace file watcher set up in activate().
    return new vscode.Disposable(() => {});
  }

  stat(uri) {
    const path = sourceUriFor(uri).fsPath;
    let info;
    try {
      info = fs.statSync(path);
    } catch (e) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    const raw = this.readRaw(uri);
    const stat = {
      type: vscode.FileType.File,
      ctime: info.ctimeMs,
      mtime: info.mtimeMs,
      size: Buffer.byteLength(codeFromProjectText(raw, path), 'utf8'),
    };
    if (!parseTextProject(raw)) {
      stat.permissions = vscode.FilePermission.Readonly; // nothing to save the code into
    }
    return stat;
  }

  readFile(uri) {
    const path = sourceUriFor(uri).fsPath;
    return Buffer.from(codeFromProjectText(this.readRaw(uri), path), 'utf8');
  }

  writeFile(uri, content) {
    const path = sourceUriFor(uri).fsPath;
    const updated = projectTextWithCode(this.readRaw(uri), Buffer.from(content).toString('utf8'));
    if (updated === null) {
      throw vscode.FileSystemError.NoPermissions(
        `${path} is not a VEXcode text project, so its code can't be saved from here.`
      );
    }
    // Write a temporary file and rename it, so a failed save can't leave a half-written project.
    const tmp = `${path}.saving`;
    fs.writeFileSync(tmp, updated, 'utf8');
    fs.renameSync(tmp, path);
    this.emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
  }

  changed(fileUri) {
    this.emitter.fire([{ type: vscode.FileChangeType.Changed, uri: codeUriFor(fileUri) }]);
  }

  readDirectory() {
    return [];
  }

  createDirectory(uri) {
    throw vscode.FileSystemError.NoPermissions(uri);
  }

  delete(uri) {
    throw vscode.FileSystemError.NoPermissions(uri);
  }

  rename(uri) {
    throw vscode.FileSystemError.NoPermissions(uri);
  }
}

// Read-only code of other versions, such as the git side of a diff.
class VersionProvider {
  async provideTextDocumentContent(uri) {
    const source = sourceUriFor(uri);
    let raw;
    try {
      raw = (await vscode.workspace.openTextDocument(source)).getText();
    } catch (e) {
      return `// Could not read ${source.toString()}: ${e.message}\n`;
    }
    return codeFromProjectText(raw, source.toString());
  }
}

async function asCpp(doc) {
  return doc.languageId === 'cpp' ? doc : vscode.languages.setTextDocumentLanguage(doc, 'cpp');
}

async function showCode(sourceUri, viewColumn) {
  const doc = await asCpp(await vscode.workspace.openTextDocument(codeUriFor(sourceUri)));
  await vscode.window.showTextDocument(doc, { viewColumn, preview: false });
}

async function showCodeDiff(original, modified, title, viewColumn) {
  const left = codeUriFor(original);
  const right = codeUriFor(modified);
  await asCpp(await vscode.workspace.openTextDocument(left));
  await asCpp(await vscode.workspace.openTextDocument(right));
  await vscode.commands.executeCommand('vscode.diff', left, right, title, { viewColumn, preview: false });
}

async function closeTab(tab) {
  try {
    await vscode.window.tabGroups.close(tab, true);
  } catch (e) {
    // The tab was already closed or replaced; nothing to do.
  }
}

let replacing = false;

// Swaps the active tab for the C++ view when it shows a .iqcpp file as JSON:
// a normal tab becomes the code view, a diff tab becomes a C++ diff.
async function checkActiveTab() {
  if (replacing || !enabled()) return;
  const group = vscode.window.tabGroups.activeTabGroup;
  const tab = group && group.activeTab;
  if (!tab) return;
  const input = tab.input;

  if (input instanceof vscode.TabInputText) {
    const uri = input.uri;
    if (!isIqcpp(uri) || keepRaw.has(uri.toString())) return;
    const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
    if (doc && doc.isDirty) return;
    replacing = true;
    try {
      await showCode(uri, group.viewColumn);
      await closeTab(tab);
    } finally {
      replacing = false;
    }
  } else if (input instanceof vscode.TabInputTextDiff) {
    const { original, modified } = input;
    if (!isIqcpp(original) && !isIqcpp(modified)) return;
    if (isCodeView(original) || isCodeView(modified)) return;
    replacing = true;
    try {
      await showCodeDiff(original, modified, `${tab.label} (C++)`, group.viewColumn);
      await closeTab(tab);
    } finally {
      replacing = false;
    }
  }
}

function activeUri(uri) {
  return uri || (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri);
}

function activate(context) {
  const codeFs = new CodeFileSystem();
  const check = () => checkActiveTab().catch((e) => console.error('iqcpp-viewer:', e));

  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider(SCHEME, codeFs, { isCaseSensitive: true }),
    vscode.workspace.registerTextDocumentContentProvider(VERSION_SCHEME, new VersionProvider())
  );

  // Refresh open code views when VEXcode (or git) changes the .iqcpp file.
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.iqcpp');
  watcher.onDidChange((u) => codeFs.changed(u));
  watcher.onDidCreate((u) => codeFs.changed(u));
  context.subscriptions.push(watcher);

  context.subscriptions.push(
    // Code views reopened by VS Code (e.g. after a restart) get C++ highlighting too.
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (isCodeView(doc.uri) && doc.languageId !== 'cpp') {
        vscode.languages.setTextDocumentLanguage(doc, 'cpp').then(undefined, () => {});
      }
    }),

    vscode.commands.registerCommand('iqcppViewer.showCode', async (uri) => {
      const target = activeUri(uri);
      if (!isIqcpp(target)) {
        vscode.window.showInformationMessage('Open a .iqcpp file first.');
        return;
      }
      await showCode(target, vscode.ViewColumn.Active);
    }),

    vscode.commands.registerCommand('iqcppViewer.showRaw', async (uri) => {
      const target = activeUri(uri);
      if (!isCodeView(target)) return;
      const source = sourceUriFor(target);
      const key = source.toString();
      keepRaw.add(key);
      openingRaw.add(key);
      try {
        const doc = await vscode.workspace.openTextDocument(source);
        await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Active, preview: false });
      } finally {
        openingRaw.delete(key);
      }
    }),

    // Same as Source Control's "Open Changes" for the file. That diff opens as
    // JSON and is then swapped for the C++ diff by checkActiveTab().
    vscode.commands.registerCommand('iqcppViewer.showChanges', async (uri) => {
      const target = activeUri(uri);
      if (!target || target.scheme !== SCHEME) return;
      await vscode.commands.executeCommand('git.openChange', sourceUriFor(target));
    }),

    vscode.window.onDidChangeActiveTextEditor(check),

    vscode.window.tabGroups.onDidChangeTabs(() => {
      // Once no raw tab of a file is left, opening it again shows the code view.
      for (const key of keepRaw) {
        if (openingRaw.has(key)) continue;
        const stillOpen = vscode.window.tabGroups.all.some((g) =>
          g.tabs.some((t) => t.input instanceof vscode.TabInputText && t.input.uri.toString() === key)
        );
        if (!stillOpen) keepRaw.delete(key);
      }
      check();
    })
  );

  // Handle a .iqcpp tab that was already open when VS Code started.
  check();
}

function deactivate() {}

module.exports = { activate, deactivate, codeFromProjectText, projectTextWithCode };
