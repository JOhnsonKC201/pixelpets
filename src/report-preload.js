const { contextBridge, ipcRenderer } = require('electron');

// The report window reads the text main prepared and can ask main to open it.
// It never supplies a URL: main built the only one it will open.
contextBridge.exposeInMainWorld('report', {
  get: () => ipcRenderer.invoke('report:get'),
  send: () => ipcRenderer.send('report:send'),
  openFolder: () => ipcRenderer.send('report:folder'),
  close: () => ipcRenderer.send('report:close'),
  onRefresh: (cb) => {
    ipcRenderer.removeAllListeners('report:refresh');
    ipcRenderer.on('report:refresh', () => cb());
  },
});
