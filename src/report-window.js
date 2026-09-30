// The "Report a problem" window: shows the exact issue text first, then opens
// GitHub in the browser only when the person says so. The URL is built here in
// main from report.js; the window can only say "open it", "open the log folder"
// or "close", on channels that answer to this one window alone.
const { BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

const { buildIssue } = require('./report');

function makeReportWindow({ hardenNav, wireMacEditKeys, getInfo, logDir, log }) {
  let win = null;
  let issue = null;

  const owns = (wc) => !!(win && !win.isDestroyed() && wc === win.webContents);
  const only = (fn) => (e, ...args) => (owns(e.sender) ? fn(...args) : undefined);

  ipcMain.handle('report:get', only(() => issue && { title: issue.title, body: issue.body }));
  ipcMain.on('report:send', only(async () => {
    if (!issue) return;
    try { await shell.openExternal(issue.url); } catch (e) { log.warn('could not open the browser for a report', e); }
    if (win && !win.isDestroyed()) win.close();
  }));
  ipcMain.on('report:folder', only(() => { shell.openPath(logDir); }));
  ipcMain.on('report:close', only(() => { if (win && !win.isDestroyed()) win.close(); }));

  function open() {
    log.flushSync();   // so the tail includes whatever just happened
    issue = buildIssue(getInfo());
    if (win && !win.isDestroyed()) { win.webContents.send('report:refresh'); win.show(); win.focus(); return; }
    win = new BrowserWindow({
      width: 560, height: 560, minWidth: 420, minHeight: 360, resizable: true,
      fullscreenable: false, maximizable: false, alwaysOnTop: true,
      title: 'Report a problem', show: false, backgroundColor: '#191b22',
      webPreferences: { preload: path.join(__dirname, 'report-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    hardenNav(win);
    win.setMenuBarVisibility(false);
    wireMacEditKeys(win, () => win.close());
    win.once('ready-to-show', () => { if (win && !win.isDestroyed()) win.show(); });
    win.on('closed', () => { win = null; issue = null; });
    win.loadFile(path.join(__dirname, 'report.html'));
  }

  return { open, owns };
}

module.exports = { makeReportWindow };
