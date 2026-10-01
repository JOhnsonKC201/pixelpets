// Defence-in-depth: these windows only ever load local files, so deny any
// navigation or window-open attempt outright (would only fire if renderer content
// were ever compromised).
function hardenNav(w) {
  w.webContents.on('will-navigate', (e) => e.preventDefault());
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

module.exports = { hardenNav };
