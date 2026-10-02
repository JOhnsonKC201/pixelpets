const { contextBridge, ipcRenderer } = require('electron');

// The launcher can ask for suggestions and run one BY INDEX. It never sends main a
// URL, path or command: main keeps the list it computed and runs its own copy.
contextBridge.exposeInMainWorld('launcher', {
  platform: process.platform,
  suggest: (q) => ipcRenderer.invoke('launcher:suggest', String(q)),
  run: (q, i) => ipcRenderer.invoke('launcher:run', { q: String(q), i }),
  resize: (h) => ipcRenderer.send('launcher:resize', h),
  hide: () => ipcRenderer.send('launcher:hide'),
  onReset: (cb) => {
    ipcRenderer.removeAllListeners('launcher:reset');
    // { pet: { species, coat, theme }, glass, still, lang, strings }: display state only.
    ipcRenderer.on('launcher:reset', (_e, state) => cb(state));
  },
});
