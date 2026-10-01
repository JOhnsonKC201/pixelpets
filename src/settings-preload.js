const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settings', {
  // The settings window is sandboxed with contextIsolation, so `process` does not
  // exist in it and pets.js cannot read the platform for itself. Without this the
  // copy would say "taskbar" to every Mac user.
  platform: process.platform,
  get: () => ipcRenderer.invoke('settings:get'),
  save: (cfg) => ipcRenderer.invoke('settings:save', cfg),
  onConfig: (cb) => ipcRenderer.on('config', (_e, cfg) => cb(cfg)),
  onThemes: (cb) => ipcRenderer.on('themes', (_e, list) => cb(list)),
  getThemes: () => ipcRenderer.invoke('themes:get'),
  addTheme: (t) => ipcRenderer.invoke('themes:add', t),
  deleteTheme: (name) => ipcRenderer.invoke('themes:delete', name),
  exportThemes: () => ipcRenderer.invoke('themes:export'),
  importThemes: () => ipcRenderer.invoke('themes:import'),
  testSound: () => ipcRenderer.send('settings:testSound'),
  emailPasswordInfo: () => ipcRenderer.invoke('email:passwordInfo'),
  emailSetPassword: (pw) => ipcRenderer.invoke('email:setPassword', pw),
  emailTest: (pw) => ipcRenderer.invoke('email:test', pw),
  calendarTest: () => ipcRenderer.invoke('calendar:test'),
  appVersion: () => ipcRenderer.invoke('app:version'),
  checkUpdates: () => ipcRenderer.invoke('updates:check-now'),
  action: (id) => ipcRenderer.send('settings:action', id),
  pickShortcut: (kind) => ipcRenderer.invoke('tools:pickShortcut', kind),
  openNotes: () => ipcRenderer.send('tools:openNotes'),
  reportProblem: () => ipcRenderer.send('report:open'),
  close: () => ipcRenderer.send('settings:close'),
});
